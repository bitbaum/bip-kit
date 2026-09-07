import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { parseContentBlocks } from "../dist/index.js";
import { ArticleBody, CodeBlock, setHighlighterLoader } from "../dist/react/index.js";

/**
 * The traceable-shiki seam (0.2.1): consumers on `output: "standalone"`
 * either register a loader once (`setHighlighterLoader(() => import("shiki"))`)
 * or pass a loaded module as the `highlighter` prop — both put the literal
 * import specifier in CONSUMER code where bundlers and Next's file tracer
 * can see it. This file runs in its own process, so registering fake loaders
 * here cannot leak into the other test files.
 */

const fakeShiki = (tag) => ({
  codeToHtml: async (code) => `<pre class="${tag}"><code>${code}</code></pre>`,
});

test("the highlighter prop drives ArticleBody's code rendering", async () => {
  const blocks = parseContentBlocks("```js\nconst p = 1;\n```");
  const html = renderToString(await ArticleBody({ blocks, highlighter: fakeShiki("via-prop") }));
  assert.match(html, /via-prop/);
  assert.match(html, /bp-codeblock-highlighted/);
});

test("the highlighter prop reaches code blocks nested in callouts", async () => {
  const blocks = parseContentBlocks("> [!NOTE]\n> nested\n> ```js\n> const n = 1;\n> ```");
  const html = renderToString(await ArticleBody({ blocks, highlighter: fakeShiki("via-prop") }));
  assert.match(html, /via-prop/);
});

test("standalone CodeBlock accepts the highlighter prop", async () => {
  const html = renderToString(
    await CodeBlock({ block: { lang: "js", text: "1" }, highlighter: fakeShiki("via-prop") }),
  );
  assert.match(html, /via-prop/);
});

test("a loader registered via setHighlighterLoader is used when no prop is passed", async () => {
  setHighlighterLoader(async () => fakeShiki("via-loader"));
  const blocks = parseContentBlocks("```js\nconst l = 1;\n```");
  const html = renderToString(await ArticleBody({ blocks }));
  assert.match(html, /via-loader/);
});

test("BIPKIT_DISABLE_PEERS wins over both the prop and the registered loader", async () => {
  const prev = process.env.BIPKIT_DISABLE_PEERS;
  try {
    process.env.BIPKIT_DISABLE_PEERS = "all";
    const blocks = parseContentBlocks("```js\nconst d = 1;\n```");
    const html = renderToString(await ArticleBody({ blocks, highlighter: fakeShiki("nope") }));
    assert.doesNotMatch(html, /nope/);
    assert.match(html, /<pre class="bp-pre">/);
  } finally {
    if (prev === undefined) delete process.env.BIPKIT_DISABLE_PEERS;
    else process.env.BIPKIT_DISABLE_PEERS = prev;
  }
});
