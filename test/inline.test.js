import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, inlineToText } from "../dist/index.js";

test("plain text is a single text span", () => {
  assert.deepEqual(parseInline("just words"), [{ t: "text", text: "just words" }]);
});

test("**strong** and *em* and _em_ parse to nested spans", () => {
  assert.deepEqual(parseInline("a **b** c"), [
    { t: "text", text: "a " },
    { t: "strong", children: [{ t: "text", text: "b" }] },
    { t: "text", text: " c" },
  ]);
  assert.deepEqual(parseInline("*x*"), [{ t: "em", children: [{ t: "text", text: "x" }] }]);
  assert.deepEqual(parseInline("_x_"), [{ t: "em", children: [{ t: "text", text: "x" }] }]);
});

test("em nests inside strong", () => {
  assert.deepEqual(parseInline("**a *b* c**"), [
    {
      t: "strong",
      children: [
        { t: "text", text: "a " },
        { t: "em", children: [{ t: "text", text: "b" }] },
        { t: "text", text: " c" },
      ],
    },
  ]);
});

test("inline code containing ** stays raw", () => {
  assert.deepEqual(parseInline("run `a ** b` now"), [
    { t: "text", text: "run " },
    { t: "code", text: "a ** b" },
    { t: "text", text: " now" },
  ]);
});

test("code inside strong keeps its literal content", () => {
  assert.deepEqual(parseInline("**use `x`**"), [
    {
      t: "strong",
      children: [
        { t: "text", text: "use " },
        { t: "code", text: "x" },
      ],
    },
  ]);
});

test("links carry href and parsed children", () => {
  assert.deepEqual(parseInline("see [the **docs**](https://example.com/a)"), [
    { t: "text", text: "see " },
    {
      t: "link",
      href: "https://example.com/a",
      children: [
        { t: "text", text: "the " },
        { t: "strong", children: [{ t: "text", text: "docs" }] },
      ],
    },
  ]);
});

test("footnote references parse as footnoteRef, not link", () => {
  assert.deepEqual(parseInline("fact[^1] more"), [
    { t: "text", text: "fact" },
    { t: "footnoteRef", id: "1" },
    { t: "text", text: " more" },
  ]);
});

test("unterminated markers stay literal text", () => {
  assert.deepEqual(parseInline("a ** b"), [{ t: "text", text: "a ** b" }]);
  assert.deepEqual(parseInline("a `b"), [{ t: "text", text: "a `b" }]);
  assert.deepEqual(parseInline("[dangling](nope"), [{ t: "text", text: "[dangling](nope" }]);
});

test("intraword underscores and asterisks are not emphasis", () => {
  assert.deepEqual(parseInline("snake_case_name"), [{ t: "text", text: "snake_case_name" }]);
  assert.deepEqual(parseInline("2*3*4 = 24"), [{ t: "text", text: "2*3*4 = 24" }]);
});

test("javascript: hrefs survive parsing as data (renderer refuses them)", () => {
  // The parser is a faithful reader; the RENDERER is the guard (safeHref).
  const [link] = parseInline("[x](javascript:alert1)");
  assert.equal(link.t, "link");
  assert.equal(link.href, "javascript:alert1");
});

test("inlineToText flattens a span tree back to readable text", () => {
  assert.equal(inlineToText(parseInline("a **b** `c` [d](e)[^1]")), "a b c d");
});
