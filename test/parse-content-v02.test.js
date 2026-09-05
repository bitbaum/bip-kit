import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContentBlocks, parseFrontmatter } from "../dist/index.js";

// ── headings: ids + h4 ──────────────────────────────────────────────────────

test("headings carry slug ids; #### is h4", () => {
  const [h2, h3, h4] = parseContentBlocks("## Big Title\n### Sub Part\n#### Deep Dive");
  assert.equal(h2.id, "big-title");
  assert.equal(h3.id, "sub-part");
  assert.deepEqual(h4, {
    type: "h4",
    text: "Deep Dive",
    id: "deep-dive",
    spans: [{ t: "text", text: "Deep Dive" }],
  });
});

test("duplicate heading text de-duplicates ids", () => {
  const blocks = parseContentBlocks("## Setup\n## Setup\n## Setup");
  assert.deepEqual(
    blocks.map((b) => b.id),
    ["setup", "setup-2", "setup-3"],
  );
});

test("umlaut headings slugify German-style (ä→ae, ß→ss)", () => {
  const [a, b] = parseContentBlocks("## Über uns\n## Straße & Größe");
  assert.equal(a.id, "ueber-uns");
  assert.equal(b.id, "strasse-groesse");
});

test("headings and paragraphs carry parsed spans alongside untouched text", () => {
  const [h, p] = parseContentBlocks("## The **bold** era\n\nBody with `code`.");
  assert.equal(h.text, "The **bold** era");
  assert.deepEqual(h.spans, [
    { t: "text", text: "The " },
    { t: "strong", children: [{ t: "text", text: "bold" }] },
    { t: "text", text: " era" },
  ]);
  assert.equal(p.text, "Body with `code`.");
  assert.deepEqual(p.spans, [
    { t: "text", text: "Body with " },
    { t: "code", text: "code" },
    { t: "text", text: "." },
  ]);
});

test("list items get itemSpans; blockquote lines get spans", () => {
  const [ul] = parseContentBlocks("- plain\n- **bold** item");
  assert.deepEqual(ul.itemSpans[1], [
    { t: "strong", children: [{ t: "text", text: "bold" }] },
    { t: "text", text: " item" },
  ]);
  const [bq] = parseContentBlocks("> a *quiet* line");
  assert.equal(bq.type, "blockquote");
  assert.deepEqual(bq.spans[0][1], { t: "em", children: [{ t: "text", text: "quiet" }] });
});

// ── hr ──────────────────────────────────────────────────────────────────────

test("--- and *** on their own line are hr blocks", () => {
  assert.deepEqual(parseContentBlocks("---"), [{ type: "hr" }]);
  assert.deepEqual(parseContentBlocks("***"), [{ type: "hr" }]);
});

// ── figures & galleries ─────────────────────────────────────────────────────

test('an image with a "caption" title becomes a figure with parsed caption spans', () => {
  const [fig] = parseContentBlocks('![diagram](/img/arch.png "The **full** system")');
  assert.equal(fig.type, "figure");
  assert.equal(fig.src, "/img/arch.png");
  assert.equal(fig.alt, "diagram");
  assert.equal(fig.caption, "The **full** system");
  assert.deepEqual(fig.spans[1], { t: "strong", children: [{ t: "text", text: "full" }] });
});

test("a bare single image stays a v0.1 image block", () => {
  assert.deepEqual(parseContentBlocks("![alt](/a.png)"), [
    { type: "image", alt: "alt", src: "/a.png" },
  ]);
});

test("adjacent image lines merge into one gallery, captions kept", () => {
  const [g] = parseContentBlocks('![a](/1.png)\n![b](/2.png "two")\n![c](/3.png)');
  assert.equal(g.type, "gallery");
  assert.deepEqual(g.images, [
    { src: "/1.png", alt: "a", caption: undefined },
    { src: "/2.png", alt: "b", caption: "two" },
    { src: "/3.png", alt: "c", caption: undefined },
  ]);
});

test("a blank line between images keeps them separate blocks (not a gallery)", () => {
  const blocks = parseContentBlocks("![a](/1.png)\n\n![b](/2.png)");
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["image", "image"],
  );
});

// ── callouts ────────────────────────────────────────────────────────────────

test("GitHub callout syntax parses kind, optional title, and body blocks", () => {
  const [c] = parseContentBlocks("> [!WARNING] Mind the gap\n> First line.\n>\n> Second para.");
  assert.equal(c.type, "callout");
  assert.equal(c.kind, "warn");
  assert.equal(c.title, "Mind the gap");
  assert.deepEqual(
    c.blocks.map((b) => [b.type, b.text]),
    [
      ["p", "First line."],
      ["p", "Second para."],
    ],
  );
});

test("all four callout kinds map from their GitHub aliases", () => {
  for (const [marker, kind] of [
    ["NOTE", "note"],
    ["TIP", "tip"],
    ["WARN", "warn"],
    ["WARNING", "warn"],
    ["CAUTION", "danger"],
    ["DANGER", "danger"],
  ]) {
    const [c] = parseContentBlocks(`> [!${marker}]\n> body`);
    assert.equal(c.type, "callout", marker);
    assert.equal(c.kind, kind, marker);
    assert.equal(c.title, undefined, marker);
  }
});

test("callouts nest: a callout inside a callout", () => {
  const [outer] = parseContentBlocks(
    "> [!NOTE] Outer\n> Intro.\n> > [!TIP] Inner\n> > Nested body.",
  );
  assert.equal(outer.type, "callout");
  const inner = outer.blocks.find((b) => b.type === "callout");
  assert.ok(inner, "no nested callout parsed");
  assert.equal(inner.kind, "tip");
  assert.equal(inner.title, "Inner");
  assert.deepEqual(inner.blocks[0].text, "Nested body.");
});

test("a plain quote without a marker is still a v0.1 blockquote", () => {
  const [b] = parseContentBlocks("> just quoting\n> someone");
  assert.equal(b.type, "blockquote");
  assert.deepEqual(b.text, ["just quoting", "someone"]);
});

// ── pull quotes ─────────────────────────────────────────────────────────────

test(">> lines form a pullquote; a trailing — line is the citation", () => {
  const [pq] = parseContentBlocks(">> Simplicity scales,\n>> complexity compounds.\n>> — George");
  assert.equal(pq.type, "pullquote");
  assert.equal(pq.text, "Simplicity scales, complexity compounds.");
  assert.equal(pq.cite, "George");
  assert.equal(pq.spans[0].t, "text");
});

test("a pullquote without citation has cite undefined", () => {
  const [pq] = parseContentBlocks(">> Just the words.");
  assert.equal(pq.cite, undefined);
  assert.equal(pq.text, "Just the words.");
});

// ── mermaid / chart / stats fences ──────────────────────────────────────────

test("chart fence with JSON body parses to a validated spec", () => {
  const src = [
    "```chart",
    '{ "kind": "line", "title": "Users", "series": [{ "name": "Weekly", "points": [["W1", 10], ["W2", 25]] }] }',
    "```",
  ].join("\n");
  const [c] = parseContentBlocks(src);
  assert.equal(c.type, "chart");
  assert.equal(c.spec.kind, "line");
  assert.deepEqual(c.spec.series[0].points, [
    ["W1", 10],
    ["W2", 25],
  ]);
});

test("chart fence with line-format body parses kinds, labels and series", () => {
  const src = [
    "```chart",
    "kind: bar",
    "title: Weekly signups",
    "ylabel: signups",
    "series Organic: Jan=12, Feb=30",
    "series Paid: Jan=4, Feb=9.5",
    "```",
  ].join("\n");
  const [c] = parseContentBlocks(src);
  assert.equal(c.spec.kind, "bar");
  assert.equal(c.spec.title, "Weekly signups");
  assert.equal(c.spec.yLabel, "signups");
  assert.deepEqual(c.spec.series[1].points, [
    ["Jan", 4],
    ["Feb", 9.5],
  ]);
});

test("broken chart specs THROW with the reason — never a silent drop", () => {
  assert.throws(() => parseContentBlocks('```chart\n{ "kind": "pie", "series": [] }\n```'), /kind/);
  assert.throws(() => parseContentBlocks("```chart\n{ not json\n```"), /invalid JSON/);
  assert.throws(
    () => parseContentBlocks("```chart\nkind: bar\nseries A: Jan=abc\n```"),
    /label=number/,
  );
  assert.throws(() => parseContentBlocks("```chart\nkind: bar\nwat is this\n```"), /unrecognized/);
  assert.throws(() => parseContentBlocks("```chart\nkind: bar\n```"), /non-empty/);
});

test("stats fence parses value | label pairs; malformed lines throw", () => {
  const [s] = parseContentBlocks("```stats\n68 | essays shipped\n99.9% | uptime\n```");
  assert.deepEqual(s, {
    type: "stats",
    items: [
      { value: "68", label: "essays shipped" },
      { value: "99.9%", label: "uptime" },
    ],
  });
  assert.throws(() => parseContentBlocks("```stats\nno pipe here\n```"), /value \| label/);
});

// ── math ────────────────────────────────────────────────────────────────────

test("$$..$$ on one line and $$-fenced blocks parse as display math", () => {
  assert.deepEqual(parseContentBlocks("$$e = mc^2$$"), [
    { type: "math", tex: "e = mc^2", display: true },
  ]);
  const [m] = parseContentBlocks("$$\n\\sum_{i=1}^n i\n$$");
  assert.deepEqual(m, { type: "math", tex: "\\sum_{i=1}^n i", display: true });
});

// ── footnotes ───────────────────────────────────────────────────────────────

test("footnote refs and defs round-trip on the same id", () => {
  const blocks = parseContentBlocks(
    "A claim[^src] needs proof.\n\n[^src]: The **primary** source.\n",
  );
  const p = blocks.find((b) => b.type === "p");
  const ref = p.spans.find((s) => s.t === "footnoteRef");
  const def = blocks.find((b) => b.type === "footnote");
  assert.ok(ref, "no footnoteRef parsed");
  assert.ok(def, "no footnote def parsed");
  assert.equal(ref.id, def.id);
  assert.equal(def.blocks[0].type, "p");
  assert.equal(def.blocks[0].text, "The **primary** source.");
});

test("footnote definitions continue on indented lines", () => {
  const [def] = parseContentBlocks("[^1]: First line.\n  Continued line.");
  assert.equal(def.type, "footnote");
  assert.equal(def.blocks[0].text, "First line. Continued line.");
});

// ── frontmatter arrays ──────────────────────────────────────────────────────

test("inline YAML arrays parse: tags: [a, b]", () => {
  const { meta } = parseFrontmatter('---\ntags: [bitcoin, "build in public", ai]\n---\n');
  assert.deepEqual(meta.tags, ["bitcoin", "build in public", "ai"]);
});

test("block YAML lists parse: dash items under an empty key", () => {
  const { meta, body } = parseFrontmatter(
    "---\ntitle: Post\ntags:\n  - one\n  - 'two words'\nauthor: Mao\n---\nBody",
  );
  assert.deepEqual(meta.tags, ["one", "two words"]);
  assert.equal(meta.title, "Post");
  assert.equal(meta.author, "Mao");
  assert.equal(body, "Body");
});

test("empty inline array parses to an empty array", () => {
  const { meta } = parseFrontmatter("---\ntags: []\n---\n");
  assert.deepEqual(meta.tags, []);
});

test("scalar frontmatter files keep parsing exactly as v0.1 (strings)", () => {
  const { meta } = parseFrontmatter("---\ntitle: Hello\ntags: a, b\n---\nBody");
  assert.equal(meta.title, "Hello");
  assert.equal(meta.tags, "a, b"); // string, NOT an array — compat
});
