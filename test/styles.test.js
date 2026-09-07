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
