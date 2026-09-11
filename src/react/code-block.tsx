import { loadPeer, peerDisabled, setPeerLoader, type PeerImporter } from "./peers.js";
import { CopyButton } from "./copy-button.js";

/**
 * Code rendering. With the optional `shiki` peer installed, blocks are
 * highlighted server-side with BOTH themes emitted as CSS custom properties
 * (--shiki-light / --shiki-dark), so light/dark switching is pure CSS —
 * one highlighter pass, zero client JS. Without shiki: honest mono fallback.
 *
 * DEPLOY NOTE: the zero-config load goes through a bundler-invisible import,
 * which Next.js output tracing cannot see — `output: "standalone"` deploys
 * would silently ship without shiki. Register the loader once in your app
 * (module scope, e.g. your root layout) so the specifier is traceable:
 *
 *   import { setHighlighterLoader } from "bip-kit/react";
 *   setHighlighterLoader(() => import("shiki"));
 *
 * Or pass a loaded module per render: `<ArticleBody highlighter={shiki} />`.
 *
 * Fence info strings beyond the language become a filename label:
 * ```ts src/index.ts
 */

/** The slice of shiki that bip-kit uses; `import * as shiki` satisfies it. */
export interface ShikiHighlighter {
  codeToHtml(
    code: string,
    options: { lang: string; themes: Record<string, string>; defaultColor: false },
  ): Promise<string>;
}

/**
 * One-line consumer setup for traceable shiki loading:
 * `setHighlighterLoader(() => import("shiki"))` — the literal import lives in
 * YOUR code, so bundlers resolve it and standalone output tracing copies it.
 */
export function setHighlighterLoader(importer: PeerImporter): void {
  setPeerLoader("shiki", importer);
}

export async function highlightCode(
  code: string,
  lang: string,
  highlighter?: ShikiHighlighter | null,
): Promise<string | null> {
  const shiki = peerDisabled("shiki")
    ? null
    : (highlighter ?? ((await loadPeer("shiki")) as ShikiHighlighter | null));
  if (!shiki || typeof shiki.codeToHtml !== "function") return null;
  const themes = { light: "github-light", dark: "github-dark" };
  try {
    return await shiki.codeToHtml(code, { lang: lang || "text", themes, defaultColor: false });
  } catch {
    // Unknown language — try plaintext so the block still gets theme classes.
    try {
      return await shiki.codeToHtml(code, { lang: "text", themes, defaultColor: false });
    } catch {
      return null;
    }
  }
}

export function splitFenceInfo(info: string): { lang: string; filename?: string } {
  const [lang = "", ...rest] = info.trim().split(/\s+/);
  return { lang, filename: rest.join(" ") || undefined };
}

export interface CodeBlockViewProps {
  code: string;
  lang: string;
  filename?: string;
  /** Pre-rendered shiki HTML; omit for the plain fallback. */
  html?: string | null;
}

/**
 * Synchronous view — usable directly once highlighting has been awaited.
 *
 * The copy button sits in a toolbar row ABOVE the code, in normal flow. It
 * used to be absolutely positioned over the <pre>, with the <pre> reserving a
 * fixed padding-top for it — which assumed the button's height. A consumer
 * whose accessibility CSS enlarges every `button` on coarse pointers (the
 * fleet's own 44px touch-target rule) grew the button past the reserved band
 * and it covered the opening line of code again. In flow, the button's height
 * is paid for by layout, whatever a consumer sizes it to. The toolbar precedes
 * the code in DOM order, so keyboard and screen-reader users reach "copy"
 * before the thing it copies.
 */
export function CodeBlockView({ code, lang, filename, html }: CodeBlockViewProps) {
  return (
    <figure className="bp-codeblock" data-lang={lang || undefined}>
      <div className="bp-codeblock-body">
        <div className="bp-codeblock-toolbar">
          {filename ? <span className="bp-codeblock-filename">{filename}</span> : null}
          <CopyButton text={code} />
        </div>
        {html ? (
          <div className="bp-codeblock-highlighted" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="bp-pre">
            <code className={lang ? `language-${lang}` : undefined}>{code}</code>
          </pre>
        )}
      </div>
    </figure>
  );
}

/** Async server component: highlights with shiki when present. */
export async function CodeBlock({
  block,
  highlighter,
}: {
  block: { lang: string; text: string };
  /** A loaded shiki module (`import * as shiki from "shiki"`) — the traceable alternative to `setHighlighterLoader`. */
  highlighter?: ShikiHighlighter | null;
}) {
  const { lang, filename } = splitFenceInfo(block.lang);
  const html = await highlightCode(block.text, lang, highlighter);
  return <CodeBlockView code={block.text} lang={lang} filename={filename} html={html} />;
}
