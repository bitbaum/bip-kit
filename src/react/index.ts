/**
 * bip-kit/react — the reference renderer for the bip-kit block vocabulary.
 *
 * RSC-first. Semantic bp-* classes + CSS variables only; pair with
 * `bip-kit/styles.css` (or your own theme). Mermaid lives on its own
 * subpath: `bip-kit/react/mermaid`.
 */

export { ArticleBody } from "./article-body.js";
export type { ArticleBodyProps, ArticleBodyComponents } from "./article-body.js";

export { renderInline, safeHref } from "./inline.js";
export {
  Figure,
  Gallery,
  Callout,
  PullQuote,
  Stats,
  Footnotes,
  VideoEmbed,
  TableBlock,
} from "./blocks.js";
export type { FootnoteEntry, FigureProps } from "./blocks.js";
export {
  CodeBlock,
  CodeBlockView,
  highlightCode,
  splitFenceInfo,
  setHighlighterLoader,
} from "./code-block.js";
export type { CodeBlockViewProps, ShikiHighlighter } from "./code-block.js";
export { setPeerLoader } from "./peers.js";
export type { OptionalPeer, PeerImporter } from "./peers.js";
export { MathBlock, MathView, renderMath } from "./math.js";
export type { MathViewProps } from "./math.js";
export { Chart } from "./chart.js";

export { Toc } from "./toc.js";
export { ReadingProgress } from "./reading-progress.js";
export { Lightbox } from "./lightbox.js";
export { CopyButton } from "./copy-button.js";
