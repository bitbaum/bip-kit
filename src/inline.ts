/**
 * Inline markup model — consumers stop re-parsing `**bold**` themselves.
 *
 * Deliberately small: strong, em, code spans, links, footnote references.
 * No raw HTML ever — unknown syntax stays literal text, which is the
 * security model (typed nodes only, nothing to inject).
 */

export type Inline =
  | { t: "text"; text: string }
  | { t: "strong"; children: Inline[] }
  | { t: "em"; children: Inline[] }
  | { t: "code"; text: string }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "footnoteRef"; id: string };

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Parse one line/run of text into inline spans. Never throws. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ t: "text", text: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Code span first: its contents are raw, `**` inside stays literal.
    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close !== -1) {
        flush();
        out.push({ t: "code", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // Strong: **...** (checked before single-char em).
    if (ch === "*" && text[i + 1] === "*") {
      const close = text.indexOf("**", i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        out.push({ t: "strong", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    // Em: *...* or _..._ — not intraword (2*3*4, snake_case stay literal).
    if (ch === "*" || ch === "_") {
      const prev = i > 0 ? text[i - 1] : "";
      const next = text[i + 1] ?? "";
      const intraword = prev !== "" && WORD_CHAR.test(prev);
      if (!intraword && next !== "" && next !== ch && !/\s/.test(next)) {
        const close = text.indexOf(ch, i + 1);
        if (close !== -1 && !/\s/.test(text[close - 1])) {
          flush();
          out.push({ t: "em", children: parseInline(text.slice(i + 1, close)) });
          i = close + 1;
          continue;
        }
      }
    }

    if (ch === "[") {
      // Footnote reference: [^id]
      if (text[i + 1] === "^") {
        const close = text.indexOf("]", i + 2);
        if (close !== -1) {
          const id = text.slice(i + 2, close);
          if (id.length > 0 && !/\s/.test(id)) {
            flush();
            out.push({ t: "footnoteRef", id });
            i = close + 1;
            continue;
          }
        }
      }
      // Link: [text](href)
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          flush();
          out.push({
            t: "link",
            href: text.slice(closeBracket + 2, closeParen).trim(),
            children: parseInline(text.slice(i + 1, closeBracket)),
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Plain text of a span tree (for aria labels, word counts, TOC text). */
export function inlineToText(spans: Inline[]): string {
  return spans
    .map((s) => {
      switch (s.t) {
        case "text":
        case "code":
          return s.text;
        case "footnoteRef":
          return "";
        default:
          return inlineToText(s.children);
      }
    })
    .join("");
}
