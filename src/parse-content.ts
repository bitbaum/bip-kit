import type { CalloutKind, ContentBlock } from "./types.js";
import { parseInline } from "./inline.js";
import { parseChartSpec } from "./chart.js";
import { createSlugger } from "./slug.js";

/**
 * Parse repo-authored markdown into typed blocks.
 * Trust boundary: committed content only — not user input. A malformed
 * chart/stats fence THROWS (fail the build, don't silently drop content).
 */

const isBlank = (line: string) => line.trim().length === 0;
const isTableRow = (line: string) => /^\|.+\|/.test(line.trim());
const isTableSep = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
const isHr = (line: string) => /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim());
const isFootnoteDef = (line: string) => /^\[\^[^\]\s]+\]:/.test(line);
const IMAGE_RE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/;

const splitCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isEmbedUrl = (line: string) =>
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|vimeo\.com\/)\S+$/i.test(
    line.trim(),
  );

const CALLOUT_KINDS: Record<string, CalloutKind> = {
  NOTE: "note",
  INFO: "note",
  IMPORTANT: "note",
  TIP: "tip",
  HINT: "tip",
  WARN: "warn",
  WARNING: "warn",
  CAUTION: "danger",
  DANGER: "danger",
};

export function parseContentBlocks(body: string): ContentBlock[] {
  const slug = createSlugger();
  return parseBlocks(body.replace(/\r\n/g, "\n").split("\n"), slug);
}

function parseBlocks(lines: string[], slug: (text: string) => string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let i = 0;

  const startsNewBlock = (line: string, next: string | undefined) =>
    line.startsWith("## ") ||
    line.startsWith("### ") ||
    line.startsWith("#### ") ||
    isHr(line) ||
    line.startsWith("- ") ||
    /^\d+\.\s+/.test(line) ||
    line.startsWith("> ") ||
    line.startsWith(">> ") ||
    line.startsWith("```") ||
    line.startsWith("$$") ||
    isFootnoteDef(line) ||
    /^!\[/.test(line) ||
    (isTableRow(line) && next !== undefined && isTableSep(next)) ||
    isEmbedUrl(line);

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(##|###|####)\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      const type = heading[1] === "##" ? "h2" : heading[1] === "###" ? "h3" : "h4";
      blocks.push({ type, text, id: slug(text), spans: parseInline(text) });
      i += 1;
      continue;
    }

    if (isHr(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (isEmbedUrl(line)) {
      blocks.push({ type: "embed", url: line.trim() });
      i += 1;
      continue;
    }

    // Display math: $$..$$ on one line, or a $$-fenced run of lines.
    if (line.trim().startsWith("$$")) {
      const single = line.trim().match(/^\$\$(.+?)\$\$$/);
      if (single) {
        blocks.push({ type: "math", tex: single[1].trim(), display: true });
        i += 1;
        continue;
      }
      const texLines: string[] = [];
      const first = line.trim().replace(/^\$\$/, "");
      if (first) texLines.push(first);
      i += 1;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        texLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        const last = lines[i].trim().replace(/\$\$$/, "");
        if (last) texLines.push(last);
        i += 1;
      }
      blocks.push({ type: "math", tex: texLines.join("\n").trim(), display: true });
      continue;
    }

    // Footnote definition: [^id]: text, continued on indented lines.
    const fnDef = line.match(/^\[\^([^\]\s]+)\]:\s?(.*)$/);
    if (fnDef) {
      const bodyLines: string[] = [fnDef[2]];
      i += 1;
      while (i < lines.length && /^(?: {2,}|\t)\S/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^(?: {2,}|\t)/, ""));
        i += 1;
      }
      blocks.push({ type: "footnote", id: fnDef[1], blocks: parseBlocks(bodyLines, slug) });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].replace(/^-\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ul", items, itemSpans: items.map(parseInline) });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ol", items, itemSpans: items.map(parseInline) });
      continue;
    }

    // Pull quote: >> lines; a trailing "— Name" line becomes the citation.
    if (line.startsWith(">> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">> ")) {
        quote.push(lines[i].replace(/^>>\s+/, "").trim());
        i += 1;
      }
      let cite: string | undefined;
      const last = quote[quote.length - 1];
      const citeMatch = quote.length > 1 ? last.match(/^(?:—|–|--)\s*(.+)$/) : null;
      if (citeMatch) {
        cite = citeMatch[1];
        quote.pop();
      }
      const text = quote.join(" ");
      blocks.push({ type: "pullquote", text, spans: parseInline(text), cite });
      continue;
    }

    // Blockquote or callout (GitHub `> [!NOTE]` syntax; callouts nest).
    if (line.startsWith("> ") || line.trim() === ">") {
      const inner: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i].trim() === ">")) {
        inner.push(lines[i].trim() === ">" ? "" : lines[i].replace(/^>\s/, ""));
        i += 1;
      }
      const marker = inner[0]?.trim().match(/^\[!(\w+)\]\s*(.*)$/);
      const kind = marker ? CALLOUT_KINDS[marker[1].toUpperCase()] : undefined;
      if (marker && kind) {
        blocks.push({
          type: "callout",
          kind,
          title: marker[2].trim() || undefined,
          blocks: parseBlocks(inner.slice(1), slug),
        });
      } else {
        const text = inner.filter((l) => l.trim().length > 0).map((l) => l.trim());
        blocks.push({ type: "blockquote", text, spans: text.map(parseInline) });
      }
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = codeLines.join("\n");
      const langId = lang.split(/\s+/)[0];
      if (langId === "mermaid") {
        blocks.push({ type: "mermaid", code });
      } else if (langId === "chart") {
        blocks.push({ type: "chart", spec: parseChartSpec(code) });
      } else if (langId === "stats") {
        blocks.push({ type: "stats", items: parseStats(code) });
      } else {
        blocks.push({ type: "code", lang, text: code });
      }
      continue;
    }

    // Images: adjacent image lines (no blank line between) merge to a gallery;
    // one image with a "caption" title is a figure; a bare one stays `image`.
    if (IMAGE_RE.test(line)) {
      const images: { src: string; alt: string; caption?: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(IMAGE_RE);
        if (!m) break;
        images.push({ src: m[2], alt: m[1], caption: m[3] || undefined });
        i += 1;
      }
      if (images.length >= 2) {
        blocks.push({ type: "gallery", images });
      } else if (images[0].caption !== undefined) {
        blocks.push({
          type: "figure",
          src: images[0].src,
          alt: images[0].alt,
          caption: images[0].caption,
          spans: parseInline(images[0].caption),
        });
      } else {
        blocks.push({ type: "image", alt: images[0].alt, src: images[0].src });
      }
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !startsNewBlock(lines[i], lines[i + 1])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length === 0) {
      // Defensive: a line that claims to start a block but fell through
      // (should not happen) must not loop forever.
      paragraph.push(lines[i].trim());
      i += 1;
    }
    const text = paragraph.join(" ");
    blocks.push({ type: "p", text, spans: parseInline(text) });
  }

  return blocks;
}

/** ```stats fence: one `value | label` per line. Malformed lines throw. */
function parseStats(source: string): { value: string; label: string }[] {
  const items: { value: string; label: string }[] = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf("|");
    if (idx <= 0 || idx === line.length - 1) {
      throw new Error(`stats block: each line must be "value | label", got "${line}"`);
    }
    items.push({ value: line.slice(0, idx).trim(), label: line.slice(idx + 1).trim() });
  }
  if (items.length === 0) throw new Error("stats block: empty");
  return items;
}

/**
 * Simple YAML-ish frontmatter. `key: value` (matching quotes stripped), plus
 * two dependency-free array forms:
 *
 *   tags: [a, b]      →  ["a", "b"]
 *   tags:             →  ["a", "b"]
 *     - a
 *     - b
 *
 * Existing scalar files keep parsing exactly as before (values stay strings).
 */
export function parseFrontmatter(raw: string): {
  meta: Record<string, string | string[]>;
  body: string;
} {
  if (!raw.startsWith("---\n")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: raw };
  const header = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string | string[]> = {};

  const stripQuotes = (value: string) => {
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1);
    }
    return value;
  };

  const lines = header.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx <= 0 || /^\s*-\s/.test(line)) {
      i += 1;
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (value === "") {
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+\S/.test(lines[j])) {
        items.push(stripQuotes(lines[j].replace(/^\s*-\s+/, "").trim()));
        j += 1;
      }
      if (items.length > 0) {
        meta[key] = items;
        i = j;
        continue;
      }
      meta[key] = "";
      i += 1;
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter((item) => item.length > 0);
      i += 1;
      continue;
    }

    meta[key] = stripQuotes(value);
    i += 1;
  }
  return { meta, body };
}
