/**
 * Author-flavoured markdown, tidied to the parser's deliberately small
 * vocabulary without changing its meaning. Four products carried their own
 * copy of this before it moved here; `parseContentBlocks` stays strict, and
 * this is the one lenient step in front of it.
 *
 * - `* item` / `+ item` bullets become `- item` (the parser reads only `- `;
 *   otherwise they render as literal asterisk paragraphs).
 * - Indented list items are flattened to top level (there is no nesting; a
 *   flat item keeps its text, an unparsed one merges into the paragraph above).
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
  let inFence = false;
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^# (?!#)/.test(line)) return `#${line}`;
      const caption = line.match(/^(!\[[^\]]*\]\(\s*\S+?)\s+'([^'"]*)'\s*\)\s*$/);
      if (caption) return `${caption[1]} "${caption[2]}")`;
      const bullet = line.match(/^\s*[*+] (.*)$/);
      if (bullet) return `- ${bullet[1]}`;
      const nested = line.match(/^\s+- (.*)$/);
      if (nested) return `- ${nested[1]}`;
      return line;
    })
    .join("\n");
}
