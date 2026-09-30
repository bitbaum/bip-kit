import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { normalizeMarkdown, parseFaq, faqJsonLd, blocksToText } from "../dist/index.js";
import { readCollection, readEntry } from "../dist/node/index.js";
import { Faq } from "../dist/react/index.js";

// ── normalizeMarkdown ───────────────────────────────────────────────────────

test("normalizeMarkdown tidies bullets, h1s, nested items and single-quoted captions", () => {
  const input = "# Title\r\n* one\n+ two\n  - nested\n![a](/x.png 'Cap')\n```\n# code\n* ptr\n```";
  assert.equal(
    normalizeMarkdown(input),
    '## Title\n- one\n- two\n- nested\n![a](/x.png "Cap")\n```\n# code\n* ptr\n```',
  );
});

// ── parseFaq ────────────────────────────────────────────────────────────────

const FAQ = `Intro text before any question is ignored.

## Do I need an account?

No. **Reading** is open to anyone.

# Voting

## Who can vote?

- Members
- Only people, for [safety](/who-decides) decisions

## Who can vote?

A duplicate question still gets its own id.

# Empty section
`;

test("parseFaq reads sections, questions and answers with stable, unique ids", () => {
  const sections = parseFaq(FAQ);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, null);
  assert.equal(sections[0].items[0].id, "do-i-need-an-account");
  assert.equal(sections[1].title, "Voting");
  assert.equal(sections[1].id, "voting");
  assert.deepEqual(
    sections[1].items.map((i) => i.id),
    ["who-can-vote", "who-can-vote-2"],
  );
  assert.equal(sections[1].items[0].blocks[0].type, "ul");
});

test("faqJsonLd and blocksToText give plain answer text", () => {
  const ld = faqJsonLd(parseFaq(FAQ));
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, 3);
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "No. Reading is open to anyone.");
  assert.equal(
    blocksToText(parseFaq(FAQ)[1].items[0].blocks),
    "Members; Only people, for safety decisions",
  );
});

test("Faq renders native details with ids and structured data", async () => {
  const html = renderToString(await Faq({ sections: parseFaq(FAQ) }));
  assert.match(html, /<details id="do-i-need-an-account" class="bp-faq-item">/);
  assert.match(html, /<summary class="bp-faq-question">Who can vote\?<\/summary>/);
  assert.match(html, /application\/ld\+json/);
  const bare = renderToString(await Faq({ sections: parseFaq(FAQ), structuredData: false }));
  assert.doesNotMatch(bare, /ld\+json/);
});

// ── readCollection ──────────────────────────────────────────────────────────

function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), "bip-collection-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test("readCollection accepts every frontmatter shape the products use", () => {
  const dir = folder({
    "a-frontmatter.md":
      "---\ntitle: With frontmatter\ndate: 2026-09-01\nsummary: Short.\ntags: [a, b]\nauthor: Cat\n---\n\nBody.",
    "b-published-at.md":
      "---\ntitle: Published at\npublishedAt: 2026-09-03\n---\n\nFirst paragraph is the summary.\n\nSecond.",
    "2026-09-02-from-filename.md": "# Heading title\n\n*2026-09-02*\n\nText.",
    "c-draft.md": "---\ntitle: Draft\ndraft: true\n---\n\nHidden.",
    "d-unpublished.md": "---\ntitle: Unpublished\npublished: false\n---\n\nHidden.",
    "README.md": "# Not a post",
    "_template.md": "---\ntitle: Template\n---\n",
  });
  const entries = readCollection(dir);
  assert.deepEqual(
    entries.map((e) => e.slug),
    ["b-published-at", "from-filename", "a-frontmatter"],
  );
  const [pub, fromName, fm] = entries;
  assert.equal(pub.summary, "First paragraph is the summary.");
  assert.equal(fromName.title, "Heading title");
  assert.equal(fromName.date, "2026-09-02");
  assert.doesNotMatch(fromName.body, /# Heading title|\*2026-09-02\*/);
  assert.equal(fromName.summary, "Text.");
  assert.deepEqual(fm.tags, ["a", "b"]);
  assert.equal(fm.author, "Cat");
  assert.equal(fm.summary, "Short.");
  assert.equal(readCollection(dir, { includeDrafts: true }).length, 5);
});

test("readEntry looks up plain slugs only; a missing folder is empty", () => {
  const dir = folder({ "hello.md": "---\ntitle: Hello\n---\n\nHi." });
  assert.equal(readEntry(dir, "hello")?.title, "Hello");
  assert.equal(readEntry(dir, "../etc/passwd"), undefined);
  assert.equal(readEntry(dir, "nope"), undefined);
  assert.deepEqual(readCollection(join(dir, "missing")), []);
});

test("a malformed date fails loudly, naming the file", () => {
  const dir = folder({ "bad.md": "---\ntitle: Bad\ndate: 1 Sept 2026\n---\n\nx" });
  assert.throws(() => readCollection(dir), /bad\.md: the date must be YYYY-MM-DD/);
});
