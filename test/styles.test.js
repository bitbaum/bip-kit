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

/**
 * Like ruleBody, but for a multi-selector rule and tolerant of how the list is
 * wrapped — the code scroller's two selectors sit on separate lines today, and
 * a prettier pass that joined them must not read as "the rule is gone".
 */
function ruleBodyOf(...selectors) {
  const pattern = selectors
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("\\s*,\\s*");
  const match = css.match(new RegExp(`(?:^|\\})\\s*${pattern}\\s*\\{([^}]*)\\}`, "m"));
  return match ? match[1] : null;
}

function declaration(body, prop) {
  // Strip comments first: a rationale comment sitting between two declarations
  // would otherwise hide the one after it. (CSS comments do not nest.)
  const bare = body?.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = bare?.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}

const REM = 16;
/** A length in px from a `2.75rem` / `44px` declaration. */
function lengthPx(value) {
  const m = String(value ?? "")
    .trim()
    .match(/^(-?[\d.]+)(rem|px|em)$/);
  return m ? (m[2] === "px" ? Number(m[1]) : Number(m[1]) * REM) : null;
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
 * The copy button is the same shape of bug as the list markers: an
 * absolutely-positioned, opaquely-backgrounded overlay sitting on the code it
 * copies, with nothing in the DOM to say so — the button and the <pre> are
 * siblings, so every renderToString assertion passes while the opening line of
 * code is hidden underneath it.
 *
 * Measured on botsmann's live guides at bip-kit 0.2.4: hovering a code block
 * hid the opening line of 9 of 23 blocks at 390px (e.g. `curl
 * http://localhost:11434/ap`, its path truncated mid-URL) and 1 of 24 at 1440px.
 */

/** Height of `.bp-copy` rendered across the fleet's font stacks, measured live. */
const COPY_BUTTON_HEIGHT_PX = 29.6;

test("the copy button's overlay is paid for out of the code block's top padding", () => {
  const copy = ruleBody(".bp-copy");
  assert.ok(copy, ".bp-copy rule not found in styles.css");
  assert.match(
    copy,
    /position:\s*absolute/,
    "this guard assumes .bp-copy overlays the code; if it no longer does, the " +
      "reservation below is obsolete and this test should be rewritten",
  );

  const topOffset = lengthPx(declaration(copy, "top"));
  assert.ok(topOffset !== null, ".bp-copy must declare a resolvable `top` offset");

  const pre = ruleBodyOf(".bp-pre", ".bp-codeblock-highlighted pre");
  assert.ok(pre, "the code scroller rule was not found in styles.css");

  const reserved = declaration(pre, "padding-top");
  assert.ok(
    reserved,
    "the code scroller declares no padding-top — with symmetric padding, any " +
      "opening line long enough to reach the button renders underneath it",
  );

  const clearance = /var\(--bp-copy-clearance\)/.test(reserved)
    ? lengthPx(declaration(ruleBody(":root"), "--bp-copy-clearance"))
    : lengthPx(reserved);
  assert.ok(clearance !== null, `could not resolve the clearance from "${reserved}"`);

  const needed = topOffset + COPY_BUTTON_HEIGHT_PX;
  assert.ok(
    clearance >= needed,
    `reserved clearance is ${clearance}px but the button occupies ${needed}px ` +
      `(top: ${topOffset}px + ${COPY_BUTTON_HEIGHT_PX}px of button). ` +
      "Code would render underneath it.",
  );
});

test("the reservation is vertical — horizontal padding cannot survive a scroll", () => {
  // Worth failing loudly for, because the horizontal version of this fix LOOKS
  // right and reads right in review: `padding-right` on the <pre> appears to
  // reserve a gutter beside the button. But the <pre> is the scroll container,
  // so trailing padding is laid out after the last glyph rather than against
  // the viewport — at scrollLeft: 0, where a reader starts, the opening line
  // still runs under the button. Measured: the padding-right variant left all
  // 9 occluded blocks on botsmann/self-hosting occluded, changing nothing.
  const pre = ruleBodyOf(".bp-pre", ".bp-codeblock-highlighted pre");
  assert.ok(pre, "the code scroller rule was not found in styles.css");
  assert.match(
    pre,
    /overflow-x:\s*(auto|scroll)/,
    "if the code no longer scrolls horizontally, re-derive this guard",
  );
  assert.equal(
    declaration(pre, "padding-right"),
    null,
    "padding-right on the horizontally-scrolling code element does not keep " +
      "glyphs out from under the copy button — it is laid out at the end of the " +
      "scrollable content, not against the viewport. Reserve the space " +
      "vertically (padding-top) instead.",
  );
});

test("print reclaims the clearance, because print hides the copy button", () => {
  // pre-wrap plus a clearance nothing occupies prints a blank band above every
  // code block.
  const printBlock = css.slice(css.indexOf("@media print"));
  assert.match(printBlock, /\.bp-copy[^{]*\{[^}]*display:\s*none/, "print must hide .bp-copy");
  const printPre = printBlock.match(
    /\.bp-pre,\s*\.bp-codeblock-highlighted pre\s*\{([^}]*)\}/,
  )?.[1];
  assert.ok(printPre, "print block does not restyle the code scroller");
  const reclaimed = lengthPx(declaration(printPre, "padding-top"));
  const clearance = lengthPx(declaration(ruleBody(":root"), "--bp-copy-clearance"));
  assert.ok(
    reclaimed !== null && reclaimed < clearance,
    "print must reset padding-top — the button it reserved space for is hidden",
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
