import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { parseContentBlocks, extractToc } from "../dist/index.js";
import {
  ArticleBody,
  Toc,
  ReadingProgress,
  Lightbox,
  CopyButton,
  CodeBlock,
  CodeBlockView,
  Chart,
  VideoEmbed,
} from "../dist/react/index.js";

/**
 * renderToString smoke tests WITH the optional peers installed (shiki and
 * katex are devDependencies here). ArticleBody is an async server component:
 * awaiting the component function yields a fully synchronous element tree
 * that react-dom/server can render — the same contract Next.js RSC uses.
 */

const FULL_DOC = `
## Intro **section**

A paragraph with **bold**, *em*, \`code\`, a [link](https://example.com) and a ref[^1].

### Lists

- one
- **two**

1. first
2. second

#### Deep heading

---

> plain quote line

> [!TIP] Try this
> Callout body with a nested quote.

>> The pull quote itself.
>> — Someone

![lone](/img/lone.png)

![cap](/img/cap.png "A captioned figure")

![g1](/img/1.png)
![g2](/img/2.png)

\`\`\`ts src/example.ts
const x: number = 1;
\`\`\`

\`\`\`mermaid
graph TD; A-->B
\`\`\`

\`\`\`chart
kind: bar
title: Signups
series Organic: Jan=10, Feb=20
series Paid: Jan=5, Feb=8
\`\`\`

\`\`\`stats
68 | essays
2 | stars
\`\`\`

$$e = mc^2$$

| Col A | Col B |
|-------|-------|
| a1    | b1    |

https://youtu.be/dQw4w9WgXcQ

[^1]: The footnote **definition**.
`;

test("ArticleBody renders every block type (peers present)", async () => {
  const blocks = parseContentBlocks(FULL_DOC);
  const html = renderToString(await ArticleBody({ blocks }));

  // headings + ids
  assert.match(html, /<h2 id="intro-section" class="bp-h2">/);
  assert.match(html, /<h3 id="lists" class="bp-h3">/);
  assert.match(html, /<h4 id="deep-heading" class="bp-h4">/);
  // inline markup rendered, not re-escaped source
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>em<\/em>/);
  assert.match(html, /class="bp-inline-code"/);
  assert.match(html, /<a class="bp-link" href="https:\/\/example.com" rel="noopener noreferrer">/);
  // hr, lists, quotes
  assert.match(html, /<hr class="bp-hr"\/?>/);
  assert.match(html, /<ul class="bp-ul">/);
  assert.match(html, /<ol class="bp-ol">/);
  assert.match(html, /<blockquote class="bp-blockquote">/);
  // callout
  assert.match(html, /bp-callout bp-callout--tip/);
  assert.match(html, /Try this/);
  // pullquote with cite
  assert.match(html, /bp-pullquote/);
  assert.match(html, /The pull quote itself\./);
  assert.match(html, /bp-pullquote-cite/);
  // image / figure / gallery (+ lightbox trigger island)
  assert.match(html, /bp-figure/);
  assert.match(html, /A captioned figure/);
  assert.match(html, /class="bp-gallery" data-count="2"/);
  assert.match(html, /bp-lightbox-trigger/);
  // code: shiki highlighted (dual-theme vars), filename, copy button
  assert.match(html, /bp-codeblock-highlighted/);
  assert.match(html, /--shiki-dark/);
  assert.match(html, /bp-codeblock-filename/);
  assert.match(html, /src\/example\.ts/);
  assert.match(html, /class="bp-copy"/);
  // mermaid: honest source fallback by default (no components override)
  assert.match(html, /data-mermaid/);
  assert.match(html, /graph TD; A--&gt;B/);
  // chart: inline SVG with legend and var-driven colors
  assert.match(html, /<figure class="bp-chart" data-kind="bar">/);
  assert.match(html, /bp-chart-legend/);
  assert.match(html, /var\(--bp-chart-1\)/);
  // math: katex output
  assert.match(html, /katex/);
  // stats
  assert.match(html, /bp-stat-value/);
  assert.match(html, /68/);
  // table in a scroll wrapper
  assert.match(html, /bp-table-wrap/);
  // embed via privacy player
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  // footnotes with ref + backlink
  assert.match(html, /id="fnref-1"/);
  assert.match(html, /id="fn-1"/);
  assert.match(html, /bp-fn-back/);
});

test("mermaid components override is used when provided", async () => {
  const blocks = parseContentBlocks("```mermaid\ngraph TD; A-->B\n```");
  const FakeMermaid = ({ code }) => createElement("div", { className: "fake-mermaid" }, code);
  const html = renderToString(await ArticleBody({ blocks, components: { mermaid: FakeMermaid } }));
  assert.match(html, /fake-mermaid/);
  assert.doesNotMatch(html, /data-mermaid/);
});

test("lightbox can be disabled — images render without the trigger button", async () => {
  const blocks = parseContentBlocks("![a](/1.png)");
  const html = renderToString(await ArticleBody({ blocks, lightbox: false }));
  assert.doesNotMatch(html, /bp-lightbox-trigger/);
  assert.match(html, /<img class="bp-img"/);
});

test("unsafe link hrefs degrade to plain spans in the renderer", async () => {
  const blocks = parseContentBlocks("[click](javascript:alert1)");
  const html = renderToString(await ArticleBody({ blocks }));
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /click/);
});

test("standalone CodeBlock highlights with shiki when present", async () => {
  const html = renderToString(await CodeBlock({ block: { lang: "js", text: "const a = 1;" } }));
  assert.match(html, /bp-codeblock-highlighted/);
  assert.match(html, /--shiki-light/);
});

/**
 * The copy button's toolbar must come BEFORE the code, as a sibling of it, not
 * on top of it. The stylesheet guard (test/styles.test.js) proves the button
 * is in flow; this proves the flow puts it above the code rather than below
 * or inside the <pre>, for both render paths and with or without a filename.
 */
function assertToolbarAboveCode(html, { filename } = {}) {
  const body = html.indexOf('<div class="bp-codeblock-body">');
  assert.ok(body >= 0, "no .bp-codeblock-body in the rendered HTML");
  const toolbarOpen = html.indexOf('<div class="bp-codeblock-toolbar">', body);
  assert.ok(toolbarOpen >= 0, "no .bp-codeblock-toolbar in the rendered HTML");
  // The toolbar holds only a span and a button, so its first </div> closes it.
  const toolbarClose = html.indexOf("</div>", toolbarOpen);
  const pre = html.indexOf("<pre", body);
  assert.ok(pre >= 0, "no <pre> in the rendered HTML");
  assert.ok(
    toolbarClose < pre,
    "the toolbar must close before the <pre> opens — it precedes the code as a sibling, " +
      "it does not wrap it and it does not follow it",
  );
  const copy = html.indexOf('class="bp-copy"', body);
  assert.ok(
    copy > toolbarOpen && copy < toolbarClose,
    "the copy button must be inside the toolbar, not loose beside the code",
  );
  assert.equal(html.indexOf('class="bp-copy"', copy + 1), -1, "exactly one copy button");
  assert.equal(
    html.indexOf("<figcaption", body),
    -1,
    "the filename is a toolbar label, not a figcaption",
  );
  const label = html.indexOf('class="bp-codeblock-filename"', body);
  if (filename) {
    assert.ok(
      label > toolbarOpen && label < copy,
      `the filename label "${filename}" sits in the toolbar, before the copy button`,
    );
    assert.ok(html.slice(label, toolbarClose).includes(filename));
  } else {
    assert.equal(label, -1, "no filename label without a filename");
  }
}

test("plain code block: the copy toolbar precedes the <pre> as a sibling", () => {
  const plain = renderToString(createElement(CodeBlockView, { code: "const a = 1;", lang: "js" }));
  assert.match(plain, /<pre class="bp-pre">/);
  assertToolbarAboveCode(plain);

  const named = renderToString(
    createElement(CodeBlockView, { code: "const a = 1;", lang: "js", filename: "src/a.js" }),
  );
  assertToolbarAboveCode(named, { filename: "src/a.js" });
});

test("highlighted code block: the copy toolbar precedes the <pre> as a sibling", async () => {
  const plain = renderToString(await CodeBlock({ block: { lang: "js", text: "const a = 1;" } }));
  assert.match(plain, /bp-codeblock-highlighted/);
  assertToolbarAboveCode(plain);

  const named = renderToString(
    await CodeBlock({ block: { lang: "js src/a.js", text: "const a = 1;" } }),
  );
  assert.match(named, /bp-codeblock-highlighted/);
  assertToolbarAboveCode(named, { filename: "src/a.js" });
});

test("Toc renders 3+ entries with level classes, hides under 3", () => {
  const items = extractToc(parseContentBlocks("## A\n### B\n## C"));
  const html = renderToString(createElement(Toc, { items }));
  assert.match(html, /bp-toc-item--l2/);
  assert.match(html, /bp-toc-item--l3/);
  assert.match(html, /href="#a"/);
  const hidden = renderToString(createElement(Toc, { items: items.slice(0, 2) }));
  assert.equal(hidden, "");
});

test("ReadingProgress SSRs the hairline at zero width", () => {
  const html = renderToString(createElement(ReadingProgress));
  assert.match(html, /bp-progress-bar/);
  assert.match(html, /width:0%/);
});

test("Lightbox SSRs only the trigger, no overlay", () => {
  const html = renderToString(
    createElement(Lightbox, { src: "/a.png", alt: "a" }, createElement("img", { src: "/a.png" })),
  );
  assert.match(html, /bp-lightbox-trigger/);
  assert.doesNotMatch(html, /role="dialog"/);
});

test("CopyButton SSRs in the idle state", () => {
  const html = renderToString(createElement(CopyButton, { text: "x" }));
  assert.match(html, /Copy</);
});

test("Chart renders line and area marks", () => {
  const spec = {
    kind: "area",
    series: [
      {
        name: "A",
        points: [
          ["x", 1],
          ["y", 2],
        ],
      },
    ],
  };
  const html = renderToString(createElement(Chart, { spec }));
  assert.match(html, /<polyline/);
  assert.match(html, /<polygon/);
});

test("VideoEmbed refuses non-allowlisted hosts with a plain link", () => {
  const html = renderToString(createElement(VideoEmbed, { url: "https://evil.example/v" }));
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /evil\.example/);
});
