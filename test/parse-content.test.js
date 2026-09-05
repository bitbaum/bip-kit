import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContentBlocks, parseFrontmatter } from "../dist/index.js";

// ── parseContentBlocks: v0.1 compatibility goldens ──────────────────────────
//
// v0.2 ADDS fields (heading `id`, inline `spans`/`itemSpans`) but never
// changes the v0.1 fields. These goldens assert exactly that: after dropping
// the additive fields, the original shapes are byte-identical. The additive
// fields themselves are asserted in parse-content-v02.test.js.

const strip = (blocks) =>
  blocks.map((block) => {
    const rest = { ...block };
    delete rest.spans;
    delete rest.itemSpans;
    delete rest.id;
    return rest;
  });

const parseStripped = (body) => strip(parseContentBlocks(body));

test("headings: ## and ### become h2/h3, text trimmed", () => {
  const blocks = parseStripped("## Roadmap  \n### Q3 ");
  assert.deepEqual(blocks, [
    { type: "h2", text: "Roadmap" },
    { type: "h3", text: "Q3" },
  ]);
});

test("consecutive plain lines join into one paragraph", () => {
  const blocks = parseStripped("First line\nsecond line\n\nNew paragraph");
  assert.deepEqual(blocks, [
    { type: "p", text: "First line second line" },
    { type: "p", text: "New paragraph" },
  ]);
});

test("CRLF input parses the same as LF", () => {
  assert.deepEqual(
    parseContentBlocks("## Title\r\n\r\nBody\r\n"),
    parseContentBlocks("## Title\n\nBody\n"),
  );
});

test("unordered list collects consecutive - items", () => {
  const blocks = parseStripped("- one\n- two\n\n- three");
  assert.deepEqual(blocks, [
    { type: "ul", items: ["one", "two"] },
    { type: "ul", items: ["three"] },
  ]);
});

test("ordered list collects consecutive numbered items", () => {
  const blocks = parseStripped("1. first\n2. second\n10. tenth");
  assert.deepEqual(blocks, [{ type: "ol", items: ["first", "second", "tenth"] }]);
});

test("blockquote keeps one entry per quoted line", () => {
  const blocks = parseStripped("> line one\n> line two");
  assert.deepEqual(blocks, [{ type: "blockquote", text: ["line one", "line two"] }]);
});

test("fenced code keeps language, inner newlines, and indentation", () => {
  const blocks = parseContentBlocks("```ts\nconst a = 1;\n  indented();\n```");
  assert.deepEqual(blocks, [{ type: "code", lang: "ts", text: "const a = 1;\n  indented();" }]);
});

test("mermaid fences are first-class mermaid blocks since v0.2", () => {
  const [block] = parseContentBlocks("```mermaid\ngraph TD; A-->B\n```");
  assert.deepEqual(block, { type: "mermaid", code: "graph TD; A-->B" });
});

test("an unterminated fence consumes to end of input without crashing", () => {
  const blocks = parseContentBlocks("```\nno closing fence");
  assert.deepEqual(blocks, [{ type: "code", lang: "", text: "no closing fence" }]);
});

test("GFM table needs a separator row; cells are trimmed", () => {
  const blocks = parseContentBlocks("| A | B |\n|---|:--|\n| 1 | 2 |\n| 3 | 4 |");
  assert.deepEqual(blocks, [
    {
      type: "table",
      headers: ["A", "B"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    },
  ]);
});

test("a pipe line without a separator row is a paragraph, not a table", () => {
  const blocks = parseStripped("| just | text |");
  assert.deepEqual(blocks, [{ type: "p", text: "| just | text |" }]);
});

test("standalone image line becomes an image block", () => {
  const blocks = parseContentBlocks("![alt text](/img/shot.png)");
  assert.deepEqual(blocks, [{ type: "image", alt: "alt text", src: "/img/shot.png" }]);
});

test("lone YouTube and Vimeo URLs become embed blocks", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://vimeo.com/76979871",
  ]) {
    assert.deepEqual(parseContentBlocks(url), [{ type: "embed", url }], url);
  }
});

test("URLs from non-allowlisted hosts stay paragraphs", () => {
  const blocks = parseStripped("https://evil.example.com/watch?v=abc");
  assert.deepEqual(blocks, [{ type: "p", text: "https://evil.example.com/watch?v=abc" }]);
});

test("a URL inside prose does not split the paragraph", () => {
  const blocks = parseStripped("Watch https://youtu.be/dQw4w9WgXcQ for context");
  assert.deepEqual(blocks, [{ type: "p", text: "Watch https://youtu.be/dQw4w9WgXcQ for context" }]);
});

test("a paragraph ends where the next block type starts, without a blank line", () => {
  const blocks = parseStripped("Some text\n- item");
  assert.deepEqual(blocks, [
    { type: "p", text: "Some text" },
    { type: "ul", items: ["item"] },
  ]);
});

test("empty and whitespace-only input produce no blocks", () => {
  assert.deepEqual(parseContentBlocks(""), []);
  assert.deepEqual(parseContentBlocks("\n  \n\t\n"), []);
});

// ── parseFrontmatter ────────────────────────────────────────────────────────

test("frontmatter is split from the body and parsed as key: value", () => {
  const raw = "---\ntitle: Hello\ntags: a, b\n---\nBody here";
  const { meta, body } = parseFrontmatter(raw);
  assert.deepEqual(meta, { title: "Hello", tags: "a, b" });
  assert.equal(body, "Body here");
});

test("matching quotes are stripped; mismatched quotes are kept", () => {
  const { meta } = parseFrontmatter("---\na: \"quoted\"\nb: 'single'\nc: \"mismatched'\n---\n");
  assert.equal(meta.a, "quoted");
  assert.equal(meta.b, "single");
  assert.equal(meta.c, "\"mismatched'");
});

test("values keep their own colons (URLs survive)", () => {
  const { meta } = parseFrontmatter("---\nlink: https://example.com/x\n---\n");
  assert.equal(meta.link, "https://example.com/x");
});

test("input without frontmatter is all body", () => {
  const { meta, body } = parseFrontmatter("Just a body");
  assert.deepEqual(meta, {});
  assert.equal(body, "Just a body");
});

test("an unterminated frontmatter fence is treated as body, not swallowed", () => {
  const raw = "---\ntitle: dangling\nno closing fence";
  const { meta, body } = parseFrontmatter(raw);
  assert.deepEqual(meta, {});
  assert.equal(body, raw);
});
