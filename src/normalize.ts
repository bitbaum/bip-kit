/**
 * Author-flavoured markdown, tidied to the parser's deliberately small
 * vocabulary without changing its meaning. Four products carried their own
 * copy of this before it moved here; `parseContentBlocks` stays strict, and
 * this is the one lenient step in front of it.
 *
 * - `* item` / `+ item` bullets become `- item` (the parser reads only `- `;
 *   otherwise they render as literal asterisk paragraphs).
 * - Indented list items (`- ` or `1. `) are flattened to top level (there is no nesting; a
 *   flat item keeps its text, an unparsed one merges into the paragraph above).
 * - An indented line directly under a list item continues that item, the way
 *   prettier and most changelogs wrap long bullets. Without this the rest of
 *   the sentence renders as a paragraph of its own.
 * - `# Heading` becomes `## Heading` (the page renders the title from metadata
 *   as its one h1; a body h1 would render as a literal `# …` paragraph).
 * - `![alt](src 'caption')` becomes `![alt](src "caption")` (the parser reads a
 *   double-quoted title only, and prettier with `singleQuote` rewrites captions
 *   to single quotes on commit). A caption containing `"` is left alone.
 * - CRLF line endings become LF.
 *
 * Code fences are left untouched: a `# comment` or `* pointer` inside a fence
 * is code, not markdown.
 */
export function normalizeMarkdown(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  let inItem = false;

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      inItem = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (inItem && /^\s+\S/.test(line) && !/^\s*(?:[-*+]|\d+\.)\s/.test(line)) {
      out[out.length - 1] += ` ${line.trim()}`;
      continue;
    }
    const tidied = tidyLine(line);
    inItem = /^(?:- |\d+\.\s)/.test(tidied);
    out.push(tidied);
  }
  return out.join("\n");
}

function tidyLine(line: string): string {
  if (/^# (?!#)/.test(line)) return `#${line}`;
  const caption = line.match(/^(!\[[^\]]*\]\(\s*\S+?)\s+'([^'"]*)'\s*\)\s*$/);
  if (caption) return `${caption[1]} "${caption[2]}")`;
  const bullet = line.match(/^\s*[*+] (.*)$/);
  if (bullet) return `- ${bullet[1]}`;
  const nested = line.match(/^\s+- (.*)$/);
  if (nested) return `- ${nested[1]}`;
  const nestedNumbered = line.match(/^\s+(\d+\.\s.*)$/);
  if (nestedNumbered) return nestedNumbered[1];
  return line;
}
