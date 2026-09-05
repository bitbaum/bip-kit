import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { parseContentBlocks } from "../dist/index.js";
import { ArticleBody, CodeBlock, MathBlock } from "../dist/react/index.js";

/**
 * Degradation paths WITHOUT the optional peers. shiki and katex ARE installed
 * as devDependencies here, so the missing-peer path is forced through the
 * documented test seam: BIPKIT_DISABLE_PEERS (checked per load, not at
 * import time — setting it here affects exactly this process).
 */
process.env.BIPKIT_DISABLE_PEERS = "all";

test("code degrades to an honest mono <pre>, still with copy button + filename", async () => {
  const blocks = parseContentBlocks("```ts src/x.ts\nconst a: number = 1;\n```");
  const html = renderToString(await ArticleBody({ blocks }));
  assert.doesNotMatch(html, /bp-codeblock-highlighted/);
  assert.doesNotMatch(html, /--shiki/);
  assert.match(html, /<pre class="bp-pre">/);
  assert.match(html, /language-ts/);
  assert.match(html, /class="bp-copy"/);
  assert.match(html, /src\/x\.ts/);
});

test("math degrades to styled source with a data attribute — no crash", async () => {
  const blocks = parseContentBlocks("$$e = mc^2$$");
  const html = renderToString(await ArticleBody({ blocks }));
  assert.doesNotMatch(html, /katex/);
  assert.match(html, /bp-math--fallback/);
  assert.match(html, /data-math="display"/);
  assert.match(html, /e = mc\^2/);
});

test("standalone CodeBlock and MathBlock degrade the same way", async () => {
  const code = renderToString(await CodeBlock({ block: { lang: "js", text: "1" } }));
  assert.match(code, /<pre class="bp-pre">/);
  const math = renderToString(await MathBlock({ block: { tex: "x^2", display: true } }));
  assert.match(math, /bp-math--fallback/);
});

test("mermaid without an override renders its source fallback (peer never loads in SSR)", async () => {
  const blocks = parseContentBlocks("```mermaid\ngraph TD; A-->B\n```");
  const html = renderToString(await ArticleBody({ blocks }));
  assert.match(html, /data-mermaid/);
  assert.match(html, /graph TD/);
});

test("a full document still renders end-to-end with zero peers", async () => {
  const blocks = parseContentBlocks(
    "## T\n\ntext[^1]\n\n```js\n1\n```\n\n$$x$$\n\n> [!NOTE]\n> n\n\n[^1]: def",
  );
  const html = renderToString(await ArticleBody({ blocks }));
  assert.match(html, /bp-article/);
  assert.match(html, /bp-callout--note/);
  assert.match(html, /bp-footnotes/);
});
