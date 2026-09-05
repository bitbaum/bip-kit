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

// Resolves a CSS custom property to a concrete color by letting the browser
// compute it — keeps Mermaid in sync with the token SSOT without hardcoding.
function resolveColorVar(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.backgroundColor = `var(${cssVar})`;
  document.documentElement.appendChild(el);
  const value = getComputedStyle(el).backgroundColor;
  el.remove();
  return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
}

// Dark mode: an explicit data-theme on <html> wins; otherwise the OS.
function isDarkNow(): boolean {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light") return false;
  if (explicit === "dark") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeDark(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
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
        m.default.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          themeVariables: {
            background: "transparent",
            primaryColor: resolveColorVar("--bp-surface", fallback.surface),
            primaryTextColor: resolveColorVar("--bp-fg", fallback.text),
            lineColor: resolveColorVar("--bp-fg-muted", fallback.line),
            edgeLabelBackground: resolveColorVar("--bp-bg", fallback.surface),
            clusterBkg: resolveColorVar("--bp-surface", fallback.surface),
          },
          fontFamily: "inherit",
        });
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
