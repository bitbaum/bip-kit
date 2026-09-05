import type { ComponentType, ReactNode } from "react";
import type { ContentBlock } from "../types.js";
import { renderInline } from "./inline.js";
import { parseInline } from "../inline.js";
import { highlightCode, splitFenceInfo, CodeBlockView } from "./code-block.js";
import { renderMath, MathView } from "./math.js";
import { Chart } from "./chart.js";
import {
  Figure,
  Gallery,
  Callout,
  PullQuote,
  Stats,
  Footnotes,
  VideoEmbed,
  TableBlock,
  spansOf,
  type FootnoteEntry,
} from "./blocks.js";

/**
 * The reference renderer. RSC-first: `ArticleBody` is an async server
 * component — it awaits every optional-peer render (shiki, katex) up front,
 * then emits a fully synchronous tree. That keeps the whole article
 * renderable by react-dom/server too (tests, RSS, OG pipelines).
 *
 * Mermaid is a CLIENT concern and an optional peer, so it is NOT wired by
 * default (a bundler would fail on the import for consumers without it).
 * Pass it in: `components={{ mermaid: MermaidBlock }}` with
 * `import { MermaidBlock } from "bip-kit/react/mermaid"`.
 */

export interface ArticleBodyComponents {
  /** Renderer for mermaid blocks; default is an honest source fallback. */
  mermaid?: ComponentType<{ code: string }>;
}

export interface ArticleBodyProps {
  blocks: ContentBlock[];
  components?: ArticleBodyComponents;
  /** Wrap figure/gallery images in the Lightbox island (default true). */
  lightbox?: boolean;
  className?: string;
}

/** Pre-rendered HTML (shiki/katex) keyed by block identity. */
type Enriched = WeakMap<object, string>;

async function enrich(blocks: ContentBlock[], out: Enriched): Promise<void> {
  for (const block of blocks) {
    if (block.type === "code") {
      const { lang } = splitFenceInfo(block.lang);
      const html = await highlightCode(block.text, lang);
      if (html) out.set(block, html);
    } else if (block.type === "math") {
      const html = await renderMath(block.tex, block.display);
      if (html) out.set(block, html);
    } else if (block.type === "callout" || block.type === "footnote") {
      await enrich(block.blocks, out);
    }
  }
}

function MermaidFallback({ code }: { code: string }) {
  return (
    <pre className="bp-mermaid bp-mermaid--fallback" data-mermaid>
      <code>{code}</code>
    </pre>
  );
}

interface RenderContext {
  enriched: Enriched;
  components?: ArticleBodyComponents;
  lightbox: boolean;
}

function renderBlock(block: ContentBlock, ctx: RenderContext, key: number): ReactNode {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={key} id={block.id} className="bp-h2">
          {renderInline(spansOf(block.text, block.spans))}
        </h2>
      );
    case "h3":
      return (
        <h3 key={key} id={block.id} className="bp-h3">
          {renderInline(spansOf(block.text, block.spans))}
        </h3>
      );
    case "h4":
      return (
        <h4 key={key} id={block.id} className="bp-h4">
          {renderInline(spansOf(block.text, block.spans))}
        </h4>
      );
    case "hr":
      return <hr key={key} className="bp-hr" />;
    case "p":
      return (
        <p key={key} className="bp-p">
          {renderInline(spansOf(block.text, block.spans))}
        </p>
      );
    case "ul":
    case "ol": {
      const Tag = block.type;
      return (
        <Tag key={key} className={`bp-${block.type}`}>
          {block.items.map((item, i) => (
            <li key={i} className="bp-li">
              {renderInline(block.itemSpans?.[i] ?? parseInline(item))}
            </li>
          ))}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} className="bp-blockquote">
          {block.text.map((line, i) => (
            <p key={i} className="bp-p">
              {renderInline(block.spans?.[i] ?? parseInline(line))}
            </p>
          ))}
        </blockquote>
      );
    case "image":
      return <Figure key={key} src={block.src} alt={block.alt} lightbox={ctx.lightbox} />;
    case "figure":
      return (
        <Figure
          key={key}
          src={block.src}
          alt={block.alt}
          caption={block.caption}
          spans={block.spans}
          lightbox={ctx.lightbox}
        />
      );
    case "gallery":
      return <Gallery key={key} images={block.images} lightbox={ctx.lightbox} />;
    case "callout":
      return (
        <Callout key={key} kind={block.kind} title={block.title}>
          {block.blocks.map((b, i) => renderBlock(b, ctx, i))}
        </Callout>
      );
    case "pullquote":
      return <PullQuote key={key} text={block.text} spans={block.spans} cite={block.cite} />;
    case "code": {
      const { lang, filename } = splitFenceInfo(block.lang);
      return (
        <CodeBlockView
          key={key}
          code={block.text}
          lang={lang}
          filename={filename}
          html={ctx.enriched.get(block)}
        />
      );
    }
    case "mermaid": {
      const Mermaid = ctx.components?.mermaid ?? MermaidFallback;
      return <Mermaid key={key} code={block.code} />;
    }
    case "chart":
      return <Chart key={key} spec={block.spec} />;
    case "math":
      return (
        <MathView
          key={key}
          tex={block.tex}
          display={block.display}
          html={ctx.enriched.get(block)}
        />
      );
    case "footnote":
      return null; // rendered collectively at the end
    case "stats":
      return <Stats key={key} items={block.items} />;
    case "table":
      return <TableBlock key={key} headers={block.headers} rows={block.rows} />;
    case "embed":
      return <VideoEmbed key={key} url={block.url} />;
  }
}

/** Async server component: parse once, render the whole article. */
export async function ArticleBody({
  blocks,
  components,
  lightbox = true,
  className,
}: ArticleBodyProps) {
  const enriched: Enriched = new WeakMap();
  await enrich(blocks, enriched);
  const ctx: RenderContext = { enriched, components, lightbox };

  const notes: FootnoteEntry[] = blocks
    .filter((b): b is Extract<ContentBlock, { type: "footnote" }> => b.type === "footnote")
    .map((note) => ({
      id: note.id,
      children: note.blocks.map((b, i) => renderBlock(b, ctx, i)),
    }));

  return (
    <div className={className ? `bp-article ${className}` : "bp-article"}>
      {blocks.map((block, i) => renderBlock(block, ctx, i))}
      <Footnotes notes={notes} />
    </div>
  );
}
