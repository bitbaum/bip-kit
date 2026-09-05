import { loadPeer } from "./peers.js";

/**
 * Display math. With the optional `katex` peer installed, TeX renders
 * server-side (consumer imports katex's stylesheet). Without it: honest
 * degradation — the source TeX in a styled code block with a data attribute,
 * never a crash.
 */

interface KatexModule {
  renderToString(tex: string, options?: { displayMode?: boolean; throwOnError?: boolean }): string;
}

export async function renderMath(tex: string, display: boolean): Promise<string | null> {
  const loaded = (await loadPeer("katex")) as KatexModule | { default: KatexModule } | null;
  const katex = loaded && "renderToString" in loaded ? loaded : (loaded?.default ?? null);
  if (!katex || typeof katex.renderToString !== "function") return null;
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return null;
  }
}

export interface MathViewProps {
  tex: string;
  display: boolean;
  /** Pre-rendered KaTeX HTML; omit for the source fallback. */
  html?: string | null;
}

export function MathView({ tex, display, html }: MathViewProps) {
  if (html) {
    return (
      <div
        className={display ? "bp-math bp-math--display" : "bp-math"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre className="bp-math bp-math--fallback" data-math={display ? "display" : "inline"}>
      <code>{tex}</code>
    </pre>
  );
}

/** Async server component: renders with KaTeX when present. */
export async function MathBlock({ block }: { block: { tex: string; display: boolean } }) {
  const html = await renderMath(block.tex, block.display);
  return <MathView tex={block.tex} display={block.display} html={html} />;
}
