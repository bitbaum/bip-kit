import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Guards on the shipped stylesheet.
 *
 * These exist because a CSS regression here is invisible to every other test
 * in this repo: the renderer's HTML is byte-identical whether or not a rule
 * is present, so renderToString assertions pass while the page reads wrong.
 * The list-style case shipped to five production sites and was caught only by
 * looking at a screenshot.
 *
 * The rule these encode: a consumer's CSS reset is the NORMAL case. Tailwind's
 * preflight (used by every consumer in this fleet) sets
 * `ul, ol { list-style: none; margin: 0; padding: 0 }`, so any list appearance
 * this stylesheet wants must be stated outright — inheriting it from the UA
 * sheet is not an option that exists.
 */

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

/** The declarations inside the first rule whose selector list matches exactly. */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  return match ? match[1] : null;
}

test("article lists declare a marker type the reset cannot remove", () => {
  const ul = ruleBody(".bp-ul");
  const ol = ruleBody(".bp-ol");
  assert.ok(ul, ".bp-ul rule not found in styles.css");
  assert.ok(ol, ".bp-ol rule not found in styles.css");
  assert.match(
    ul,
    /list-style-type:\s*disc/,
    "unordered lists must declare list-style-type — Tailwind preflight resets it to none, " +
      "and styling ::marker alone leaves bullets invisible",
  );
  assert.match(
    ol,
    /list-style-type:\s*decimal/,
    "ordered lists must declare list-style-type — see above; numbers vanish otherwise",
  );
});

test("nested list levels are restated, not inherited from the UA sheet", () => {
  for (const [selector, expected] of [
    [".bp-ul .bp-ul", "circle"],
    [".bp-ul .bp-ul .bp-ul", "square"],
    [".bp-ol .bp-ol", "lower-alpha"],
    [".bp-ol .bp-ol .bp-ol", "lower-roman"],
  ]) {
    const body = ruleBody(selector);
    assert.ok(body, `${selector} rule not found in styles.css`);
    assert.match(
      body,
      new RegExp(`list-style-type:\\s*${expected}`),
      `${selector} lost its marker`,
    );
  }
});

test("::marker styling is paired with a marker that exists", () => {
  // Any selector we bother to style a ::marker on must have a list-style-type
  // somewhere in its own chain — otherwise the rule is decorating nothing.
  const markerSelectors = [...css.matchAll(/^(\.[\w .-]+?)\s*::marker\s*\{/gm)].map((m) =>
    m[1].trim(),
  );
  assert.ok(markerSelectors.length > 0, "expected at least one ::marker rule to guard");
  for (const selector of markerSelectors) {
    const root = selector.split(/\s+/)[0]; // e.g. ".bp-ul" from ".bp-ul .bp-li"
    assert.match(
      css,
      new RegExp(`\\${root}[^{]*\\{[^}]*list-style-type`),
      `${selector}::marker is styled but ${root} never declares list-style-type`,
    );
  }
});

/**
 * The copy button lives in a toolbar row ABOVE the code, in normal flow. It
 * used to be an absolutely positioned overlay on the <pre>, paid for by a
 * fixed padding-top the <pre> reserved (--bp-copy-clearance, 2.75rem). That
 * was a magic number: it assumed the button's rendered height. A consumer
 * whose accessibility CSS enlarges buttons on coarse pointers (the fleet's own
 * `button { min-height: 2.75rem }` touch-target rule) grew it to 44px, past the
 * reserved band, and the button covered the opening line of code again —
 * measured on fleetcrown at 390x844. Any fixed clearance is one consumer rule
 * away from the same failure, and nothing in the rendered HTML changes when
 * it fails. So the invariant is structural, not numeric: the button stays in
 * flow, and the number that pretended to pay for it stays gone.
 */

function declaration(body, prop) {
  // Strip comments first: a rationale comment sitting between two declarations
  // otherwise hides the one after it. (CSS comments do not nest, so this is safe.)
  const bare = body?.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = bare?.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}

/** Every rule body whose selector list mentions the class, comments stripped. */
function ruleBodiesMentioning(cls) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...bare.matchAll(new RegExp(`(?:^|\\}|\\{)\\s*([^{}]*${escaped}[^{}]*)\\{([^}]*)\\}`, "g")),
  ].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

test("the copy button stays in normal flow — never positioned over the code", () => {
  const rules = ruleBodiesMentioning(".bp-copy");
  assert.ok(rules.length > 0, "no rule for .bp-copy found in styles.css");
  for (const { selector, body } of rules) {
    const position = declaration(body, "position");
    assert.ok(
      position === null || /^(static|relative)$/.test(position),
      `\`${selector}\` sets position: ${position} — that takes the copy button out of ` +
        "flow and puts it back over the code, where its height (which a consumer's " +
        "CSS decides, not this stylesheet) is no longer paid for by layout",
    );
  }
});

test("the toolbar that holds the copy button is a flow row above the code", () => {
  const toolbar = ruleBody(".bp-codeblock-toolbar");
  assert.ok(toolbar, ".bp-codeblock-toolbar rule not found in styles.css");
  assert.equal(declaration(toolbar, "display"), "flex", "the toolbar lays out as a flex row");
  const position = declaration(toolbar, "position");
  assert.ok(
    position === null || /^(static|relative)$/.test(position),
    "the toolbar itself must stay in flow — positioning it recreates the overlay one level up",
  );
});

test("the clearance magic number is gone and stays gone", () => {
  // The old fix reserved a fixed band on the <pre> for the button. Reintroducing
  // it — under this name or by hand — means someone put the button back on top
  // of the code and is guessing its height again.
  assert.doesNotMatch(css, /--bp-copy-clearance/, "--bp-copy-clearance was deleted in 0.2.7");
  const pre = ruleBodyOf(".bp-pre", ".bp-codeblock-highlighted pre");
  assert.ok(pre, "the code scroller rule was not found in styles.css");
  assert.equal(
    declaration(pre, "padding-top"),
    null,
    "the code scroller reserves no padding-top for a button — the button is in flow above it",
  );
});

/**
 * Like ruleBody, but tolerant of how the selector list is wrapped — the code
 * scroller's two selectors sit on separate lines today, and a prettier pass
 * that joined them should not read as "the rule is gone".
 */
function ruleBodyOf(...selectors) {
  const pattern = selectors
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("\\s*,\\s*");
  const match = css.match(new RegExp(`(?:^|\\})\\s*${pattern}\\s*\\{([^}]*)\\}`, "m"));
  return match ? match[1] : null;
}

test("the copy button is visible on a device that cannot hover", () => {
  // A touch device never enters :hover, so `opacity: 0` on .bp-copy plus a
  // `.bp-codeblock-body:hover` reveal is not "hidden until wanted" — it is
  // hidden forever, on every phone and tablet. The control stays in the DOM
  // and in the accessibility tree, and stays tappable, which is worse than
  // absent: nothing on screen says it is there. So the base rule must rest
  // visible, and the fade-until-hover must be scoped to hover-capable
  // pointers.
  const copy = ruleBody(".bp-copy");
  assert.ok(copy, ".bp-copy rule not found in styles.css");
  assert.match(
    copy,
    /opacity:\s*1/,
    "the base .bp-copy rule must rest at opacity 1 — a device with no hover " +
      "has no way to reveal a button parked at opacity 0",
  );

  const hoverQuery = /@media\s*\(hover:\s*hover\)[^{]*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(hoverQuery, "expected a (hover: hover) media query to hold the fade-until-hover rules");
  assert.match(
    hoverQuery[1],
    /\.bp-copy\s*\{[^}]*opacity:\s*0/,
    "hiding .bp-copy belongs INSIDE the (hover: hover) query, not outside it",
  );

  // and nothing outside that query may hide it again
  assert.doesNotMatch(
    css.replace(hoverQuery[0], ""),
    /\.bp-copy\s*\{[^}]*opacity:\s*0/,
    "a `.bp-copy { opacity: 0 }` outside the hover query re-hides the button on touch",
  );
});

test("print hides the copy button and collapses the toolbar it leaves empty", () => {
  // Otherwise every code block on paper opens with a blank band nothing occupies.
  const printBlock = css.slice(css.indexOf("@media print"));
  assert.match(printBlock, /\.bp-copy[^{]*\{[^}]*display:\s*none/, "print must hide .bp-copy");
  const toolbar = printBlock.match(/\.bp-codeblock-toolbar\s*\{([^}]*)\}/)?.[1];
  assert.ok(toolbar, "print block does not restyle .bp-codeblock-toolbar");
  assert.match(
    declaration(toolbar, "padding-top") ?? "",
    /^0(px|rem)?$/,
    "print must zero the toolbar's padding-top — with the button hidden and no filename, " +
      "that padding is all the toolbar is",
  );
});

test("every list the renderer emits states its markers, one way or the other", () => {
  // Derived from the components rather than hardcoded, so a list added later is
  // covered without anyone remembering to extend this test. The invariant: no
  // list may be SILENT about markers. Either it declares a list-style-type, or
  // it opts out with list-style: none — silence is what the reset exploits.
  const sources = readdirSync(new URL("../src/react/", import.meta.url))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(new URL(`../src/react/${f}`, import.meta.url), "utf8"))
    .join("\n");

  const listClasses = new Set(
    [...sources.matchAll(/<(?:ul|ol)\b[^>]*className="([^"{}]+)"/g)].flatMap((m) =>
      m[1].split(/\s+/).filter((c) => c.startsWith("bp-")),
    ),
  );
  assert.ok(listClasses.size > 0, "expected to find list elements in src/react/*.tsx");

  for (const cls of listClasses) {
    const body = ruleBody(`.${cls}`);
    assert.ok(body, `.${cls} is rendered as a list but has no rule in styles.css`);
    assert.match(
      body,
      /list-style(-type)?:/,
      `.${cls} says nothing about markers — declare list-style-type, or opt out ` +
        `with list-style: none. Under a CSS reset, silence means invisible.`,
    );
  }
});
