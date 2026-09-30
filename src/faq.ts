import type { ContentBlock } from "./types.js";
import { parseContentBlocks } from "./parse-content.js";
import { inlineToText, parseInline } from "./inline.js";
import { normalizeMarkdown } from "./normalize.js";
import { createSlugger } from "./slug.js";

/**
 * Questions and answers, written as markdown:
 *
 * ```md
 * # Getting started          ← optional section
 *
 * ## Do I need an account?   ← a question
 *
 * No. Reading is open; …     ← its answer: any blocks, until the next heading
 * ```
 *
 * One file, reviewed like code, instead of a hand-built accordion per product.
 * Every question gets a stable id, so an answer can be linked to directly.
 */
export interface FaqItem {
  id: string;
  question: string;
  blocks: ContentBlock[];
}

export interface FaqSection {
  /** Null for questions written before the first `# Section`. */
  title: string | null;
  id: string | null;
  items: FaqItem[];
}

export function parseFaq(markdown: string): FaqSection[] {
  const slug = createSlugger();
  const sections: FaqSection[] = [];
  let section: FaqSection | null = null;
  let question: { text: string; lines: string[] } | null = null;
  let inFence = false;

  const flushQuestion = () => {
    if (!question) return;
    if (!section) {
      section = { title: null, id: null, items: [] };
      sections.push(section);
    }
    section.items.push({
      id: slug(question.text),
      question: question.text,
      blocks: parseContentBlocks(normalizeMarkdown(question.lines.join("\n"))),
    });
    question = null;
  };

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (!inFence && /^# (?!#)/.test(line)) {
      flushQuestion();
      const title = line.slice(2).trim();
      section = { title, id: slug(title), items: [] };
      sections.push(section);
    } else if (!inFence && /^## (?!#)/.test(line)) {
      flushQuestion();
      question = { text: line.slice(3).trim(), lines: [] };
    } else if (question) {
      question.lines.push(line);
    }
  }
  flushQuestion();
  return sections.filter((s) => s.items.length > 0);
}

const spanText = (text: string) => inlineToText(parseInline(text));

/** The readable text of an answer, for search engines and previews. */
export function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((block): string => {
      switch (block.type) {
        case "p":
        case "h2":
        case "h3":
        case "h4":
          return spanText(block.text);
        case "ul":
        case "ol":
          return block.items.map(spanText).join("; ");
        case "blockquote":
          return block.text.map(spanText).join(" ");
        case "pullquote":
          return spanText(block.text);
        case "callout":
        case "footnote":
          return blocksToText(block.blocks);
        case "table":
          return block.rows.map((row) => row.join(", ")).join("; ");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

/** schema.org FAQPage structured data for the same questions. */
export function faqJsonLd(sections: FaqSection[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: sections.flatMap((s) =>
      s.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: blocksToText(item.blocks) },
      })),
    ),
  };
}
