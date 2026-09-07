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

test("intraword underscores are not emphasis (snake_case survives)", () => {
  assert.deepEqual(parseInline("snake_case_name"), [{ t: "text", text: "snake_case_name" }]);
  assert.deepEqual(parseInline("a_variable_here"), [{ t: "text", text: "a_variable_here" }]);
  assert.deepEqual(parseInline("__init__ and _x_"), [
    { t: "strong", children: [{ t: "text", text: "init" }] },
    { t: "text", text: " and " },
    { t: "em", children: [{ t: "text", text: "x" }] },
  ]);
});

// CHANGED in v0.2.2: this line used to assert "2*3*4 = 24" stayed literal.
// CommonMark's flanking rules let `*` open and close intraword, so every other
// markdown renderer emits 2<em>3</em>4 here. bip-kit now agrees.
test("intraword asterisks ARE emphasis, per CommonMark flanking", () => {
  assert.deepEqual(parseInline("2*3*4 = 24"), [
    { t: "text", text: "2" },
    { t: "em", children: [{ t: "text", text: "3" }] },
    { t: "text", text: "4 = 24" },
  ]);
  assert.deepEqual(parseInline("foo*bar*baz"), [
    { t: "text", text: "foo" },
    { t: "em", children: [{ t: "text", text: "bar" }] },
    { t: "text", text: "baz" },
  ]);
  assert.deepEqual(parseInline("foo**bar**baz"), [
    { t: "text", text: "foo" },
    { t: "strong", children: [{ t: "text", text: "bar" }] },
    { t: "text", text: "baz" },
  ]);
});

test("backslash escapes render the literal character and open no markup", () => {
  assert.deepEqual(parseInline("\\*not emphasis\\*"), [{ t: "text", text: "*not emphasis*" }]);
  assert.deepEqual(parseInline("\\_not emphasis\\_"), [{ t: "text", text: "_not emphasis_" }]);
  assert.deepEqual(parseInline("\\*\\*not strong\\*\\*"), [{ t: "text", text: "**not strong**" }]);
  // only the escaped halves go literal; the two bare `*` still pair up
  assert.deepEqual(parseInline("\\**still em\\**"), [
    { t: "text", text: "*" },
    { t: "em", children: [{ t: "text", text: "still em*" }] },
  ]);
  assert.deepEqual(parseInline("\\`not code\\`"), [{ t: "text", text: "`not code`" }]);
  assert.deepEqual(parseInline("\\[not a link\\](x)"), [{ t: "text", text: "[not a link](x)" }]);
  assert.deepEqual(parseInline("\\\\"), [{ t: "text", text: "\\" }]);
  assert.deepEqual(parseInline("a \\\\* b"), [{ t: "text", text: "a \\* b" }]);
});

test("the full CommonMark ASCII punctuation escape set is honored", () => {
  const punctuation = `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`;
  for (const ch of punctuation) {
    assert.deepEqual(
      parseInline(`x\\${ch}y`),
      [{ t: "text", text: `x${ch}y` }],
      `escaping ${JSON.stringify(ch)} should yield the literal character`,
    );
  }
});

test("a backslash before a non-escapable character stays a backslash", () => {
  assert.deepEqual(parseInline("C:\\path\\to"), [{ t: "text", text: "C:\\path\\to" }]);
  assert.deepEqual(parseInline("\\a"), [{ t: "text", text: "\\a" }]);
});

test("code spans take no escapes — the backslash is literal content", () => {
  assert.deepEqual(parseInline("`a\\*b`"), [{ t: "code", text: "a\\*b" }]);
  assert.deepEqual(parseInline("`\\\\`"), [{ t: "code", text: "\\\\" }]);
  assert.deepEqual(parseInline("`a\\_b` and \\_c\\_"), [
    { t: "code", text: "a\\_b" },
    { t: "text", text: " and _c_" },
  ]);
});

test("*** and ___ produce nested emphasis, not literal asterisks", () => {
  const nested = [{ t: "em", children: [{ t: "strong", children: [{ t: "text", text: "x" }] }] }];
  assert.deepEqual(parseInline("***x***"), nested);
  assert.deepEqual(parseInline("___x___"), nested);
  assert.deepEqual(parseInline("**_x_**"), [
    { t: "strong", children: [{ t: "em", children: [{ t: "text", text: "x" }] }] },
  ]);
  assert.deepEqual(parseInline("_**x**_"), [
    { t: "em", children: [{ t: "strong", children: [{ t: "text", text: "x" }] }] },
  ]);
  assert.deepEqual(parseInline("*__x__*"), [
    { t: "em", children: [{ t: "strong", children: [{ t: "text", text: "x" }] }] },
  ]);
  assert.deepEqual(parseInline("a ***loud*** claim"), [
    { t: "text", text: "a " },
    { t: "em", children: [{ t: "strong", children: [{ t: "text", text: "loud" }] }] },
    { t: "text", text: " claim" },
  ]);
});

test("unmatched and dangling delimiters stay literal", () => {
  assert.deepEqual(parseInline("***x"), [{ t: "text", text: "***x" }]);
  assert.deepEqual(parseInline("x***"), [{ t: "text", text: "x***" }]);
  assert.deepEqual(parseInline("***x*"), [
    { t: "text", text: "**" },
    { t: "em", children: [{ t: "text", text: "x" }] },
  ]);
  assert.deepEqual(parseInline("****"), [{ t: "text", text: "****" }]);
  assert.deepEqual(parseInline("a * b * c"), [{ t: "text", text: "a * b * c" }]);
  assert.deepEqual(parseInline("_"), [{ t: "text", text: "_" }]);
});

test("emphasis inside link text, and escaped delimiters inside emphasis", () => {
  assert.deepEqual(parseInline("[*a* and **b**](https://x.test)"), [
    {
      t: "link",
      href: "https://x.test",
      children: [
        { t: "em", children: [{ t: "text", text: "a" }] },
        { t: "text", text: " and " },
        { t: "strong", children: [{ t: "text", text: "b" }] },
      ],
    },
  ]);
  assert.deepEqual(parseInline("*a \\* b*"), [
    { t: "em", children: [{ t: "text", text: "a * b" }] },
  ]);
  assert.deepEqual(parseInline("**a \\_ b**"), [
    { t: "strong", children: [{ t: "text", text: "a _ b" }] },
  ]);
  assert.deepEqual(parseInline("*a `b*c` d*"), [
    {
      t: "em",
      children: [
        { t: "text", text: "a " },
        { t: "code", text: "b*c" },
        { t: "text", text: " d" },
      ],
    },
  ]);
});

// evig's adoption parity check (old react-markdown output vs typed blocks)
// found exactly these three classes under-parsing. Pinned so they cannot rot.
test("parity: the three classes evig's react-markdown check caught", () => {
  // 1. escapes were ignored — the asterisks both showed AND emphasised
  assert.deepEqual(parseInline("use \\*args\\* carefully"), [
    { t: "text", text: "use *args* carefully" },
  ]);
  // 2. intraword `*` was refused — `foo*bar*baz` came back as literal text
  assert.deepEqual(parseInline("kebab*case*word"), [
    { t: "text", text: "kebab" },
    { t: "em", children: [{ t: "text", text: "case" }] },
    { t: "text", text: "word" },
  ]);
  // 3. `***x***` fell through to a literal run of asterisks
  assert.deepEqual(parseInline("***really***"), [
    { t: "em", children: [{ t: "strong", children: [{ t: "text", text: "really" }] }] },
  ]);
  // ...while the case that MUST NOT regress still does not
  assert.deepEqual(parseInline("call snake_case_name twice"), [
    { t: "text", text: "call snake_case_name twice" },
  ]);
});

test("inlineToText flattens escaped and nested emphasis too", () => {
  assert.equal(inlineToText(parseInline("***a*** \\*b\\* `c`")), "a *b* c");
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
