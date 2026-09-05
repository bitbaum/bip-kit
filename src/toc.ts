import type { ContentBlock, TocEntry, ReadingTimeResult } from "./types.js";
import { slugify } from "./slug.js";

/**
 * Table of contents from parsed blocks. Headings parsed by v0.2 carry ids;
 * for hand-built blocks without one, a slug is derived from the text
 * (per-call de-duplication, same scheme as the parser).
 */
export function extractToc(blocks: ContentBlock[]): TocEntry[] {
  const seen = new Map<string, number>();
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    if (block.type !== "h2" && block.type !== "h3" && block.type !== "h4") continue;
    let id = block.id;
    if (!id) {
      const base = slugify(block.text) || "section";
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      id = n === 1 ? base : `${base}-${n}`;
    }
    entries.push({
      id,
      text: block.text,
      level: block.type === "h2" ? 2 : block.type === "h3" ? 3 : 4,
    });
  }
  return entries;
}

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function blockWords(block: ContentBlock): number {
  switch (block.type) {
    case "h2":
    case "h3":
    case "h4":
    case "p":
      return countWords(block.text);
    case "pullquote":
      return countWords(block.text) + (block.cite ? countWords(block.cite) : 0);
    case "ul":
    case "ol":
      return block.items.reduce((n, item) => n + countWords(item), 0);
    case "blockquote":
      return block.text.reduce((n, line) => n + countWords(line), 0);
    case "code":
    case "mermaid":
      // Code reads slower but is skimmed; count lines as ~4 words each.
      return (block.type === "code" ? block.text : block.code).split("\n").length * 4;
    case "table":
      return block.rows.reduce(
        (n, row) => n + row.reduce((m, cell) => m + countWords(cell), 0),
        block.headers.reduce((n, cell) => n + countWords(cell), 0),
      );
    case "figure":
      return block.caption ? countWords(block.caption) : 0;
    case "gallery":
      return block.images.reduce((n, img) => n + (img.caption ? countWords(img.caption) : 0), 0);
    case "callout":
    case "footnote":
      return block.blocks.reduce((n, b) => n + blockWords(b), 0);
    case "stats":
      return block.items.reduce((n, item) => n + countWords(item.label) + 1, 0);
    case "math":
      return countWords(block.tex);
    default:
      return 0;
  }
}

/**
 * Reading time at 200 wpm (minimum 1 minute). One implementation for the
 * four repos currently re-deriving it.
 */
export function readingTime(blocks: ContentBlock[]): ReadingTimeResult {
  const words = blocks.reduce((n, block) => n + blockWords(block), 0);
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}
