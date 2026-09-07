/**
 * Inline markup model — consumers stop re-parsing `**bold**` themselves.
 *
 * Deliberately small: strong, em, code spans, links, footnote references.
 * No raw HTML ever — unknown syntax stays literal text, which is the
 * security model (typed nodes only, nothing to inject).
 *
 * Emphasis follows CommonMark's flanking-delimiter rules so that the three
 * things authors actually notice behave like every other markdown renderer:
 * backslash escapes (`\*not emphasis\*`), intraword `*` (`foo*bar*baz`) but
 * never intraword `_` (`snake_case_name`), and `***bold italic***`.
 */

export type Inline =
  | { t: "text"; text: string }
  | { t: "strong"; children: Inline[] }
  | { t: "em"; children: Inline[] }
  | { t: "code"; text: string }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "footnoteRef"; id: string };

/** CommonMark's escapable set: every ASCII punctuation character. */
const ESCAPABLE = new Set(`!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`);

/** CommonMark "Unicode punctuation": general category P or S. */
const PUNCT = /[\p{P}\p{S}]/u;

/** Start/end of the run counts as whitespace for flanking purposes. */
const isWs = (c: string): boolean => c === "" || /\s/.test(c);
const isPunct = (c: string): boolean => c !== "" && PUNCT.test(c);

/**
 * Working token: either a finished node or an unresolved run of `*` / `_`.
 * Emphasis is resolved in a second pass, because whether a run opens, closes
 * or stays literal depends on runs that appear later in the line.
 */
type Item =
  | { k: "n"; node: Inline }
  | {
      k: "d";
      ch: string;
      /** remaining, unconsumed delimiters in this run */
      count: number;
      /** length of the ORIGINAL run — CommonMark's "rule of three" needs it */
      origCount: number;
      canOpen: boolean;
      canClose: boolean;
    };

/** Index of `target` at or after `from`, skipping backslash-escaped ones. */
function indexOfUnescaped(text: string, target: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
      i += 1;
      continue;
    }
    if (ch === target) return i;
  }
  return -1;
}

/** Resolve `\x` sequences to the literal `x` (link destinations, not code). */
function unescape(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
      out += text[i + 1];
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** CommonMark left/right-flanking test for the delimiter run [start, end). */
function flanking(text: string, start: number, end: number) {
  const prev = start > 0 ? text[start - 1] : "";
  const next = end < text.length ? text[end] : "";
  const left = !isWs(next) && (!isPunct(next) || isWs(prev) || isPunct(prev));
  const right = !isWs(prev) && (!isPunct(prev) || isWs(next) || isPunct(next));
  return { left, right, prev, next };
}

/**
 * Split the line into nodes and unresolved delimiter runs. Escapes, code
 * spans, links and footnote refs are all settled here; emphasis is not.
 */
function tokenize(text: string): Item[] {
  const items: Item[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      items.push({ k: "n", node: { t: "text", text: buf } });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Backslash escape: the escaped character is literal and inert — it can
    // never open markup, and it is not "punctuation" for anything downstream.
    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    // Code span: contents are raw. CommonMark takes no escapes inside one, so
    // `a\*b` is exactly the three-plus-backslash characters the author typed.
    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close !== -1) {
        flush();
        items.push({ k: "n", node: { t: "code", text: text.slice(i + 1, close) } });
        i = close + 1;
        continue;
      }
    }

    // Delimiter run of * or _ — length matters (** vs ***), so take it whole.
    if (ch === "*" || ch === "_") {
      let end = i;
      while (end < text.length && text[end] === ch) end += 1;
      const { left, right, prev, next } = flanking(text, i, end);
      // `*` may open/close intraword; `_` may not, which keeps snake_case_name
      // and a_variable_b literal the way every markdown reader expects.
      const canOpen = ch === "*" ? left : left && (!right || isPunct(prev));
      const canClose = ch === "*" ? right : right && (!left || isPunct(next));
      flush();
      items.push({ k: "d", ch, count: end - i, origCount: end - i, canOpen, canClose });
      i = end;
      continue;
    }

    if (ch === "[") {
      // Footnote reference: [^id]
      if (text[i + 1] === "^") {
        const close = indexOfUnescaped(text, "]", i + 2);
        if (close !== -1) {
          const id = text.slice(i + 2, close);
          if (id.length > 0 && !/\s/.test(id)) {
            flush();
            items.push({ k: "n", node: { t: "footnoteRef", id } });
            i = close + 1;
            continue;
          }
        }
      }
      // Link: [text](href)
      const closeBracket = indexOfUnescaped(text, "]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = indexOfUnescaped(text, ")", closeBracket + 2);
        if (closeParen !== -1) {
          flush();
          items.push({
            k: "n",
            node: {
              t: "link",
              href: unescape(text.slice(closeBracket + 2, closeParen).trim()),
              children: parseInline(text.slice(i + 1, closeBracket)),
            },
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
  return items;
}

/** Collapse items to spans: leftover delimiters go literal, text runs merge. */
function toInline(items: Item[]): Inline[] {
  const out: Inline[] = [];
  const push = (node: Inline) => {
    if (node.t === "text") {
      if (!node.text) return;
      const last = out[out.length - 1];
      if (last && last.t === "text") {
        out[out.length - 1] = { t: "text", text: last.text + node.text };
        return;
      }
    }
    out.push(node);
  };
  for (const it of items) {
    if (it.k === "d") push({ t: "text", text: it.ch.repeat(it.count) });
    else push(it.node);
  }
  return out;
}

/**
 * CommonMark's `process_emphasis`: walk closers left to right, pair each with
 * the nearest eligible opener, consume two delimiters for strong and one for
 * em. `***x***` therefore falls out as em > strong rather than as literal
 * asterisks, and unmatched runs survive as text.
 */
function processEmphasis(items: Item[]): void {
  const openersBottom = new Map<string, number>();
  let ci = 0;

  while (ci < items.length) {
    const closer = items[ci];
    if (closer.k !== "d" || !closer.canClose) {
      ci += 1;
      continue;
    }

    const key = `${closer.ch}:${closer.origCount % 3}:${closer.canOpen ? "o" : "-"}`;
    const bottom = openersBottom.get(key) ?? -1;

    let oi = -1;
    for (let j = ci - 1; j > bottom; j -= 1) {
      const cand = items[j];
      if (cand.k !== "d" || cand.ch !== closer.ch || !cand.canOpen) continue;
      // Rule of three: when either run can both open and close, the run lengths
      // may not sum to a multiple of 3 unless both are multiples of 3.
      if (
        (closer.canOpen || cand.canClose) &&
        closer.origCount % 3 !== 0 &&
        (cand.origCount + closer.origCount) % 3 === 0
      ) {
        continue;
      }
      oi = j;
      break;
    }

    if (oi === -1) {
      // No opener can ever match this closer — remember that, so later closers
      // of the same shape do not rescan the same hopeless prefix.
      openersBottom.set(key, ci - 1);
      if (!closer.canOpen)
        items[ci] = { k: "n", node: { t: "text", text: closer.ch.repeat(closer.count) } };
      ci += 1;
      continue;
    }

    const opener = items[oi] as Extract<Item, { k: "d" }>;
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    const children = toInline(items.slice(oi + 1, ci));
    const node: Inline = use === 2 ? { t: "strong", children } : { t: "em", children };

    opener.count -= use;
    closer.count -= use;

    items.splice(oi + 1, ci - oi - 1, { k: "n", node });
    let next = oi + 2; // the closer's new index
    if (closer.count === 0) items.splice(next, 1);
    if (opener.count === 0) {
      items.splice(oi, 1);
      next -= 1;
    }
    ci = next;
  }
}

/** Parse one line/run of text into inline spans. Never throws. */
export function parseInline(text: string): Inline[] {
  const items = tokenize(text);
  processEmphasis(items);
  return toInline(items);
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
