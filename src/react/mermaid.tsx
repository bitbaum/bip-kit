"use client";

/**
 * Mermaid client island — its OWN subpath (`bip-kit/react/mermaid`) so the
 * `mermaid` package never enters the module graph of consumers who don't
 * use it (bundlers fail builds on unresolvable imports, even dynamic ones).
 *
 * Usage:
 *   import { MermaidBlock } from "bip-kit/react/mermaid";
 *   <ArticleBody blocks={blocks} components={{ mermaid: MermaidBlock }} />
 *
 * Theme colors resolve from the bp-* CSS vars at render time (ported from
 * fleetcrown's MermaidDiagram), so diagrams follow the consumer's tokens.
 */

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

/** The one property of CanvasRenderingContext2D the normalizer needs. */
export interface FillStyleContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
}

// Normalizes any color the browser understands down to #rrggbb / rgba().
//
// getComputedStyle returns a color in the space it was AUTHORED in, so a
// token written with oklch()/lab() reads back as e.g. "oklch(0.95 0 0)" —
// valid CSS Color 4 that Mermaid's color parser rejects outright. It threw
// inside initialize(), which runs BEFORE render(), so render()'s .catch()
// never fired and every diagram blanked. Canvas is the cheapest converter
// the platform offers: assigning fillStyle round-trips through the browser's
// own parser and reads back in a legacy form Mermaid accepts.
//
// Sentinel logic (pure — the ctx is injectable for tests): an unparseable
// assignment leaves fillStyle untouched, which is the only way to tell "the
// browser rejected it" from "it is that color". A second, different sentinel
// disambiguates the astronomically-unlikely case where the input actually IS
// the sentinel color.
export function normalizeColorWith(
  ctx: FillStyleContext | null,
  value: string,
  fallback: string,
): string {
  if (!ctx) return fallback;
  try {
    ctx.fillStyle = "#010203";
    ctx.fillStyle = value;
    const first = ctx.fillStyle;
    if (typeof first !== "string") return fallback;
    if (first !== "#010203") return first;
    // first === sentinel: either rejected, or value really is #010203.
    ctx.fillStyle = "#030201";
    ctx.fillStyle = value;
    return ctx.fillStyle === "#010203" ? first : fallback;
  } catch {
    return fallback;
  }
}

function canvasContext(): FillStyleContext | null {
  try {
    return document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
}

// Resolves a CSS custom property to a concrete color by letting the browser
// compute it — keeps Mermaid in sync with the token SSOT without hardcoding —
// then normalizes it to a legacy form Mermaid's parser accepts.
function resolveColorVar(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.backgroundColor = `var(${cssVar})`;
  document.documentElement.appendChild(el);
  const value = getComputedStyle(el).backgroundColor;
  el.remove();
  if (!value || value === "rgba(0, 0, 0, 0)") return fallback;
  return normalizeColorWith(canvasContext(), value, fallback);
}

/**
 * Dark-mode preference, pure over its inputs (exported for tests):
 * an explicit `data-theme="light|dark"` wins, then a `light`/`dark` class on
 * the root element (next-themes with `attribute="class"`, Tailwind `.dark`),
 * then the OS. Unknown values fall through to the next signal.
 */
export function resolveThemePreference(input: {
  dataTheme: string | null;
  classList: { contains(token: string): boolean };
  systemDark: boolean;
}): boolean {
  if (input.dataTheme === "light") return false;
  if (input.dataTheme === "dark") return true;
  if (input.classList.contains("dark")) return true;
  if (input.classList.contains("light")) return false;
  return input.systemDark;
}

function isDarkNow(): boolean {
  const root = document.documentElement;
  return resolveThemePreference({
    dataTheme: root.getAttribute("data-theme"),
    classList: root.classList,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  });
}

function subscribeDark(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });
  return () => {
    mq.removeEventListener("change", onChange);
    observer.disconnect();
  };
}
const getServerDark = () => false;

const LIGHT = { surface: "#f6f6f4", text: "#1a1a18", line: "#8a8a86" };
const DARK = { surface: "#26262a", text: "#e8e8e6", line: "#8a8a90" };

export function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const dark = useSyncExternalStore(subscribeDark, isDarkNow, getServerDark);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then((m) => {
        if (cancelled) return;
        const fallback = dark ? DARK : LIGHT;
        const base = {
          startOnLoad: false,
          theme: dark ? ("dark" as const) : ("default" as const),
          fontFamily: "inherit",
        };
        try {
          m.default.initialize({
            ...base,
            themeVariables: {
              background: "transparent",
              primaryColor: resolveColorVar("--bp-surface", fallback.surface),
              primaryTextColor: resolveColorVar("--bp-fg", fallback.text),
              lineColor: resolveColorVar("--bp-fg-muted", fallback.line),
              edgeLabelBackground: resolveColorVar("--bp-bg", fallback.surface),
              clusterBkg: resolveColorVar("--bp-surface", fallback.surface),
            },
          });
        } catch {
          // A theme value Mermaid cannot parse must cost the reader the THEME,
          // not the diagram. initialize() runs outside render()'s promise
          // chain, so an uncaught throw here silently skipped rendering.
          m.default.initialize(base);
        }
        m.default
          .render(`bp-mermaid-${id}-${dark ? "d" : "l"}`, code)
          .then(({ svg }: { svg: string }) => {
            if (!cancelled && ref.current) ref.current.innerHTML = svg;
          })
          .catch(() => {
            if (!cancelled && ref.current) {
              ref.current.textContent = code;
              ref.current.classList.add("bp-mermaid--error");
            }
          });
      })
      .catch(() => {
        /* mermaid peer missing at runtime — the SSR fallback source stays */
      });
    return () => {
      cancelled = true;
    };
  }, [id, code, dark]);

  return (
    <div className="bp-mermaid" ref={ref}>
      <pre className="bp-mermaid--fallback" data-mermaid>
        <code>{code}</code>
      </pre>
    </div>
  );
}
