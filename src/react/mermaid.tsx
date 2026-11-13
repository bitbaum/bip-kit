"use client";

/**
 * Mermaid client island — its OWN subpath (`@bitbaum/bip-kit/react/mermaid`) so the
 * `mermaid` package never enters the module graph of consumers who don't
 * use it (bundlers fail builds on unresolvable imports, even dynamic ones).
 *
 * Usage:
 *   import { MermaidBlock } from "@bitbaum/bip-kit/react/mermaid";
 *   <ArticleBody blocks={blocks} components={{ mermaid: MermaidBlock }} />
 *
 * Theme colors resolve from the bp-* CSS vars at render time (ported from
 * loki's MermaidDiagram), so diagrams follow the consumer's tokens. So does the
 * label size: `--bp-diagram-text` (default 0.875em of the body text), never
 * shrunk below `--bp-diagram-min-text` (default the larger of 12px and 0.75em)
 * to fit a phone; a diagram too wide for that scrolls sideways instead.
 */

import type { JSX } from "react";
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

/**
 * Mermaid's config for one render, pure over its inputs (exported for tests).
 * `fontSize` is the label size in px, resolved from `--bp-diagram-text`: Mermaid
 * lays every box out around it, and flowcharts read it from `themeVariables`
 * while sequence diagrams read their own three keys, so all of them are set.
 * `fontFamily` is the face the labels are DRAWN in: Mermaid sizes each box by
 * measuring its text, and measured with "inherit" it measured the page's face
 * rather than the article's, so labels were cut off ("Smal", "$1–5k / mont").
 */
export function mermaidConfig(input: {
  dark: boolean;
  fontSize: number;
  fontFamily?: string;
  themeVariables?: Record<string, string>;
}) {
  const px = Math.round(input.fontSize * 100) / 100;
  return {
    startOnLoad: false,
    theme: input.dark ? ("dark" as const) : ("default" as const),
    fontFamily: input.fontFamily || "inherit",
    fontSize: px,
    sequence: { actorFontSize: px, messageFontSize: px, noteFontSize: px },
    themeVariables: {
      ...input.themeVariables,
      fontSize: `${px}px`,
      ...(input.fontFamily ? { fontFamily: input.fontFamily } : {}),
    },
  };
}

/**
 * The narrowest a rendered diagram may be drawn, in px (exported for tests).
 * Mermaid draws its SVG at `viewBoxWidth` with labels at `fontSize`; scaling
 * it down to fit a phone scales the labels with it. It may shrink until they
 * reach `minFontSize` and no further: past that the box scrolls sideways.
 */
export function diagramMinWidth(input: {
  viewBoxWidth: number;
  fontSize: number;
  minFontSize: number;
}): number {
  const { viewBoxWidth, fontSize, minFontSize } = input;
  if (!(viewBoxWidth > 0) || !(fontSize > 0)) return 0;
  const scale = Math.min(1, Math.max(0, minFontSize) / fontSize);
  return Math.ceil(viewBoxWidth * scale);
}

// Resolves a length custom property to px by letting the browser compute it as
// a font-size inside the diagram box, so `em` means the body text there.
function resolveFontSizeVar(host: HTMLElement, cssVar: string, fallback: number): number {
  const el = document.createElement("span");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.fontSize = `var(${cssVar})`;
  host.appendChild(el);
  const px = parseFloat(getComputedStyle(el).fontSize);
  el.remove();
  return Number.isFinite(px) && px > 0 ? px : fallback;
}

const LIGHT = { surface: "#f6f6f4", text: "#1a1a18", line: "#8a8a86" };
const DARK = { surface: "#26262a", text: "#e8e8e6", line: "#8a8a90" };

export function MermaidBlock({ code }: { code: string }): JSX.Element | null {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const dark = useSyncExternalStore(subscribeDark, isDarkNow, getServerDark);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then((m) => {
        if (cancelled || !ref.current) return;
        const fallback = dark ? DARK : LIGHT;
        const fontSize = resolveFontSizeVar(ref.current, "--bp-diagram-text", 15);
        const minFontSize = resolveFontSizeVar(ref.current, "--bp-diagram-min-text", 12);
        const fontFamily = getComputedStyle(ref.current).fontFamily;
        try {
          m.default.initialize(
            mermaidConfig({
              dark,
              fontSize,
              fontFamily,
              themeVariables: {
                background: "transparent",
                primaryColor: resolveColorVar("--bp-surface", fallback.surface),
                primaryTextColor: resolveColorVar("--bp-fg", fallback.text),
                lineColor: resolveColorVar("--bp-fg-muted", fallback.line),
                edgeLabelBackground: resolveColorVar("--bp-bg", fallback.surface),
                clusterBkg: resolveColorVar("--bp-surface", fallback.surface),
              },
            }),
          );
        } catch {
          // A theme value Mermaid cannot parse must cost the reader the THEME,
          // not the diagram. initialize() runs outside render()'s promise
          // chain, so an uncaught throw here silently skipped rendering.
          m.default.initialize(mermaidConfig({ dark, fontSize, fontFamily }));
        }
        m.default
          .render(`bp-mermaid-${id}-${dark ? "d" : "l"}`, code)
          .then(({ svg }: { svg: string }) => {
            const box = ref.current;
            if (cancelled || !box) return;
            box.innerHTML = svg;
            const drawn = box.querySelector("svg");
            const viewBoxWidth = drawn?.viewBox?.baseVal?.width ?? 0;
            const minWidth = diagramMinWidth({ viewBoxWidth, fontSize, minFontSize });
            if (drawn && minWidth > 0) drawn.style.minWidth = `${minWidth}px`;
            // A diagram wider than the box scrolls; a keyboard has to reach it.
            if (box.scrollWidth > box.clientWidth) box.tabIndex = 0;
            else box.removeAttribute("tabindex");
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
