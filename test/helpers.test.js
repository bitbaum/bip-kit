import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseContentBlocks,
  extractToc,
  readingTime,
  slugify,
  createSlugger,
} from "../dist/index.js";

// ── slugify ─────────────────────────────────────────────────────────────────

test("slugify lowercases, hyphenates, and transliterates umlauts", () => {
  assert.equal(slugify("Hello World!"), "hello-world");
  assert.equal(slugify("Über die Straße"), "ueber-die-strasse");
  assert.equal(slugify("  --- "), "");
});

test("createSlugger de-duplicates repeated slugs", () => {
  const slug = createSlugger();
  assert.equal(slug("Setup"), "setup");
  assert.equal(slug("Setup"), "setup-2");
  assert.equal(slug("!!!"), "section");
});

// ── extractToc ──────────────────────────────────────────────────────────────

test("extractToc lists h2/h3/h4 with parser-assigned ids and levels", () => {
  const blocks = parseContentBlocks("## One\n\ntext\n\n### One point one\n\n#### Deep\n\n## Two");
  assert.deepEqual(extractToc(blocks), [
    { id: "one", text: "One", level: 2 },
    { id: "one-point-one", text: "One point one", level: 3 },
    { id: "deep", text: "Deep", level: 4 },
    { id: "two", text: "Two", level: 2 },
  ]);
});

test("extractToc derives ids for hand-built v0.1 blocks without them", () => {
  const toc = extractToc([
    { type: "h2", text: "Alpha" },
    { type: "h2", text: "Alpha" },
    { type: "p", text: "not a heading" },
  ]);
  assert.deepEqual(
    toc.map((t) => t.id),
    ["alpha", "alpha-2"],
  );
});

// ── readingTime ─────────────────────────────────────────────────────────────

test("readingTime counts words across block types and floors at one minute", () => {
  const short = readingTime(parseContentBlocks("Just a few words."));
  assert.equal(short.words, 4);
  assert.equal(short.minutes, 1);
});

test("readingTime scales with content at 200 wpm", () => {
  const para = Array.from({ length: 100 }, () => "word").join(" ");
  const body = Array.from({ length: 6 }, () => para).join("\n\n"); // 600 words
  const rt = readingTime(parseContentBlocks(body));
  assert.equal(rt.words, 600);
  assert.equal(rt.minutes, 3);
});

test("readingTime reaches inside callouts and footnotes", () => {
  const rt = readingTime(parseContentBlocks("> [!NOTE]\n> five words are in here"));
  assert.equal(rt.words, 5);
});
