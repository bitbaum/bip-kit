import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseContentBlocks,
  extractToc,
  slugify,
  unicodeSlugify,
  createSlugger,
} from "../dist/index.js";

// ── regression pin: the DEFAULT policy must never move ───────────────────────
//
// Two live sites publish anchors against the outputs below. A change here is
// not a refactor, it is every inbound link to those pages breaking. If a diff
// makes this file fail, the fix is a slug OPTION, not a new default.

test("default slugify is byte-for-byte what published sites already link to", () => {
  // kivvi's pinned German case — ä→ae, ß→ss transliteration.
  assert.equal(slugify("Geschäftsmodell"), "geschaeftsmodell");
  assert.equal(slugify("Das Geschäftsmodell"), "das-geschaeftsmodell");
  assert.equal(slugify("Über die Straße"), "ueber-die-strasse");
  assert.equal(slugify("Kanäle"), "kanaele");
  assert.equal(slugify("Ö und Ü"), "oe-und-ue");

  // Plain ASCII, punctuation, edges.
  assert.equal(slugify("Hello World!"), "hello-world");
  assert.equal(slugify("What's next?"), "what-s-next");
  assert.equal(slugify("  --- "), "");
  assert.equal(slugify("v0.2.4 — release"), "v0-2-4-release");

  // Non-Latin has no ASCII spelling and drops out — this is the documented
  // reason unicodeSlugify exists, and is itself part of the pin.
  assert.equal(slugify("日本語"), "");
  assert.equal(slugify("Кириллица"), "");
});

test("default parse assigns the same ids it always has", () => {
  const blocks = parseContentBlocks(
    "## Das Geschäftsmodell\n\ntext\n\n### Über die Straße\n\n#### Hello World!",
  );
  assert.deepEqual(
    blocks.filter((b) => b.id).map((b) => b.id),
    ["das-geschaeftsmodell", "ueber-die-strasse", "hello-world"],
  );
  assert.deepEqual(extractToc(blocks), [
    { id: "das-geschaeftsmodell", text: "Das Geschäftsmodell", level: 2 },
    { id: "ueber-die-strasse", text: "Über die Straße", level: 3 },
    { id: "hello-world", text: "Hello World!", level: 4 },
  ]);
});

// ── unicodeSlugify ──────────────────────────────────────────────────────────

test("unicodeSlugify preserves letters of any script", () => {
  // de — the anchor evig publishes today.
  assert.equal(unicodeSlugify("Ein Eingang, vier Kanäle"), "ein-eingang-vier-kanäle");
  assert.equal(unicodeSlugify("Geräte"), "geräte");
  assert.equal(unicodeSlugify("Über die Straße"), "über-die-straße");
  // ja
  assert.equal(unicodeSlugify("日本語のはなし"), "日本語のはなし");
  assert.equal(unicodeSlugify("一つの入口、四つのチャネル"), "一つの入口-四つのチャネル");
  // ko
  assert.equal(unicodeSlugify("하나의 입구, 네 개의 채널"), "하나의-입구-네-개의-채널");
  // ru
  assert.equal(unicodeSlugify("Один вход, четыре канала"), "один-вход-четыре-канала");
  // zh
  assert.equal(unicodeSlugify("一个入口，四个渠道"), "一个入口-四个渠道");
  // mixed script + digits survive together
  assert.equal(unicodeSlugify("Release 0.2.4 — 日本語"), "release-0-2-4-日本語");
});

test("unicodeSlugify strips punctuation and edge hyphens, keeps combining marks", () => {
  assert.equal(unicodeSlugify("  --- "), "");
  assert.equal(unicodeSlugify("!!!"), "");
  assert.equal(unicodeSlugify("What's next?"), "what-s-next");
  // A decomposed é (e + U+0301) stays one word rather than splitting on the mark.
  assert.equal(unicodeSlugify("Café crème"), "café-crème");
});

test("unicodeSlugify is what evig's ASCII-lossy headings needed", () => {
  // The whole reason for the policy: under the default these are all empty
  // and would collapse to section, section-2, section-3.
  for (const text of ["日本語", "Кириллица", "채널"]) {
    assert.equal(slugify(text), "");
    assert.notEqual(unicodeSlugify(text), "");
  }
});

// ── the seam: one policy, honored by BOTH parse and extractToc ───────────────

test("unicodeSlugify threads through parseContentBlocks and extractToc", () => {
  const md = "## Ein Eingang, vier Kanäle\n\ntext\n\n### 日本語のはなし\n\n#### Один вход";
  const blocks = parseContentBlocks(md, { slugify: unicodeSlugify });
  assert.deepEqual(
    blocks.filter((b) => b.id).map((b) => b.id),
    ["ein-eingang-vier-kanäle", "日本語のはなし", "один-вход"],
  );
  assert.deepEqual(extractToc(blocks, { slugify: unicodeSlugify }), [
    { id: "ein-eingang-vier-kanäle", text: "Ein Eingang, vier Kanäle", level: 2 },
    { id: "日本語のはなし", text: "日本語のはなし", level: 3 },
    { id: "один-вход", text: "Один вход", level: 4 },
  ]);
});

test("a custom slugify function is honored by both parse and extractToc", () => {
  const shout = (text) => `x-${text.toLowerCase().replace(/[^a-z]+/g, "")}`;

  const blocks = parseContentBlocks("## One\n\n### Two", { slugify: shout });
  assert.deepEqual(
    blocks.filter((b) => b.id).map((b) => b.id),
    ["x-one", "x-two"],
  );

  // Hand-built blocks (no ids) get the SAME policy from extractToc.
  const handBuilt = [
    { type: "h2", text: "One" },
    { type: "h3", text: "Two" },
  ];
  assert.deepEqual(extractToc(handBuilt, { slugify: shout }), [
    { id: "x-one", text: "One", level: 2 },
    { id: "x-two", text: "Two", level: 3 },
  ]);
});

test("heading id and TOC entry cannot drift — one policy drives both", () => {
  const md = "## Kanäle\n\n### Geräte";
  for (const policy of [undefined, unicodeSlugify]) {
    const options = policy ? { slugify: policy } : {};
    const blocks = parseContentBlocks(md, options);
    const toc = extractToc(blocks, options);
    const ids = blocks.filter((b) => b.id).map((b) => b.id);
    assert.deepEqual(
      toc.map((e) => e.id),
      ids,
    );
  }
});

// ── uniqueness under both policies ──────────────────────────────────────────

test("ids stay unique under the default policy", () => {
  const blocks = parseContentBlocks("## Setup\n\n### Setup\n\n#### Setup");
  assert.deepEqual(
    blocks.filter((b) => b.id).map((b) => b.id),
    ["setup", "setup-2", "setup-3"],
  );
});

test("ids stay unique under the unicode policy", () => {
  const blocks = parseContentBlocks("## Kanäle\n\n### Kanäle\n\n#### 日本語\n\n## 日本語", {
    slugify: unicodeSlugify,
  });
  assert.deepEqual(
    blocks.filter((b) => b.id).map((b) => b.id),
    ["kanäle", "kanäle-2", "日本語", "日本語-2"],
  );
});

test("extractToc de-duplicates ids it derives itself, under either policy", () => {
  const handBuilt = [
    { type: "h2", text: "Kanäle" },
    { type: "h2", text: "Kanäle" },
  ];
  assert.deepEqual(
    extractToc(handBuilt).map((e) => e.id),
    ["kanaele", "kanaele-2"],
  );
  assert.deepEqual(
    extractToc(handBuilt, { slugify: unicodeSlugify }).map((e) => e.id),
    ["kanäle", "kanäle-2"],
  );
});

// ── empty-after-strip headings still get a usable id ─────────────────────────

test("headings that strip to nothing still yield usable, unique ids", () => {
  // "!!!" is empty under both policies; 日本語 is empty under the ASCII one.
  const md = "## !!!\n\n### ???\n\n#### 日本語";
  assert.deepEqual(
    parseContentBlocks(md)
      .filter((b) => b.id)
      .map((b) => b.id),
    ["section", "section-2", "section-3"],
  );
  assert.deepEqual(
    parseContentBlocks(md, { slugify: unicodeSlugify })
      .filter((b) => b.id)
      .map((b) => b.id),
    ["section", "section-2", "日本語"],
  );
});

test("createSlugger takes a policy and still de-duplicates and back-fills", () => {
  const slug = createSlugger(unicodeSlugify);
  assert.equal(slug("Kanäle"), "kanäle");
  assert.equal(slug("Kanäle"), "kanäle-2");
  assert.equal(slug("!!!"), "section");
  assert.equal(slug("???"), "section-2");

  // No argument = the default policy, unchanged from v0.2.3.
  const ascii = createSlugger();
  assert.equal(ascii("Kanäle"), "kanaele");
  assert.equal(ascii("!!!"), "section");
});
