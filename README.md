# bip-kit — Building in Public

**Blog · Roadmap · Changelog** for product sites — one content contract, one reference renderer, instead of five blog stacks.

You want to build in public. What you don't want is a CMS, a markdown pipeline, three renderers, and a security review every time a product site needs a blog. bip-kit is the small, sharp core of that stack:

- **`bip-kit`** — a zero-dependency parser that turns repo-authored markdown into **typed blocks** (plus the types for a roadmap and a user-facing changelog).
- **`bip-kit/react`** — a reference renderer: RSC-first server components, tiny client islands, semantic `bp-*` classes, every color a CSS variable.
- **`bip-kit/styles.css`** — a complete neutral theme (measured ~70ch line length, real vertical rhythm, dark mode, mobile-first, print-safe) that you retheme var-by-var.

Same vocabulary everywhere, your design tokens on top.

```bash
npm i bip-kit
# optional, only if your content uses them:
npm i shiki    # syntax highlighting
npm i katex    # math
npm i mermaid  # diagrams (client-side)
```

Core parser: zero dependencies. Renderer: `react >= 18` as the only required peer; shiki/katex/mermaid are **optional** peers — everything degrades gracefully without them.

## Quick start (Next.js App Router)

```tsx
// app/blog/[slug]/page.tsx — a server component; ArticleBody is async (RSC)
import { readFileSync } from "node:fs";
import { parseFrontmatter, parseContentBlocks, extractToc, readingTime } from "bip-kit";
import { ArticleBody, Toc, ReadingProgress } from "bip-kit/react";
import "bip-kit/styles.css";

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const raw = readFileSync(`content/blog/${slug}.md`, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const blocks = parseContentBlocks(body);
  const toc = extractToc(blocks);
  const { minutes } = readingTime(blocks);

  return (
    <>
      <ReadingProgress />
      <h1>{meta.title}</h1>
      <p>{minutes} min read</p>
      <Toc items={toc} />
      <ArticleBody blocks={blocks} />
    </>
  );
}
```

Diagrams? Mermaid is client-side and heavyweight, so it lives on its **own subpath** — it never enters your bundle unless you ask:

```tsx
import { MermaidBlock } from "bip-kit/react/mermaid"; // requires the mermaid peer

<ArticleBody blocks={blocks} components={{ mermaid: MermaidBlock }} />;
```

Without the override, mermaid blocks render their source in a styled `<pre>` — honest degradation, never a broken build.

`MermaidBlock` follows your theme however you switch it: an explicit `data-theme="light|dark"` on `<html>` wins, then a `light`/`dark` class (next-themes with `attribute="class"`, Tailwind's `.dark`), then the OS preference — and it re-renders live on any of them changing. Diagram colors resolve from your `--bp-*` tokens and are normalized to a form mermaid's color parser accepts, so tokens authored in `oklch()`/`lab()` (Tailwind v4 palettes) render correctly instead of blanking the diagram (fixed in 0.2.1).

## The block vocabulary

One syntax example per block. Everything the v0.1 parser understood still parses identically; v0.2 adds the rest of what long-form writing needs.

### Headings — `h2` / `h3` / `h4`

```md
## Section        → { type: "h2", text, id: "section", spans }
### Subsection    → h3
#### Detail       → h4
```

Headings carry a slugified, de-duplicated `id` (`## Über uns` → `ueber-uns`) — anchors and TOC for free. Which slug you get is a [policy you choose](#slug-policy).

### Paragraphs & inline markup — `p`

```md
Body text with **bold**, *emphasis*, `code`, [links](https://example.com) and footnote refs[^1].
```

Every text-bearing block keeps its raw `text` AND carries `spans: Inline[]` — a parsed tree of `text | strong | em | code | link | footnoteRef` nodes. Consumers stop re-parsing `**bold**` themselves.

Emphasis follows **CommonMark's flanking-delimiter rules** (since v0.2.2), so what authors type is what every other markdown reader would show them:

| Markdown            | Result                          | Why                                                          |
| ------------------- | ------------------------------- | ------------------------------------------------------------ |
| `\*not emphasis\*`  | literal `*not emphasis*`        | backslash escapes the full ASCII punctuation set              |
| `` `a\*b` ``        | code `a\*b`                     | code spans take no escapes — the backslash is content         |
| `foo*bar*baz`       | `foo`·_bar_·`baz`               | `*` may open and close intraword                              |
| `snake_case_name`   | literal `snake_case_name`       | `_` may **not** — identifiers survive untouched               |
| `***bold italic***` | em wrapping strong              | also `___x___`, `**_x_**`, `_**x**_`                          |

Anything that does not resolve — a dangling `**`, an unmatched `_` — stays literal text, exactly as before. There is still no raw HTML and no markdown dependency: this is a hand-rolled scanner over one line.

### Lists — `ul` / `ol`

```md
- unordered item
1. ordered item
```

Items come with parallel `itemSpans` for inline markup.

### Quotes — `blockquote`, `pullquote`

```md
> An ordinary quote.

>> A big centered pull quote for the one sentence that matters.
>> — Attribution
```

The trailing `— Name` line (on a multi-line pull quote) becomes `cite`.

### Callouts — `callout` (GitHub syntax, nestable)

```md
> [!TIP] Optional custom title
> Callout body — full blocks, callouts can nest.
```

Kinds: `[!NOTE]` `[!TIP]` `[!WARN]`/`[!WARNING]` `[!CAUTION]`/`[!DANGER]` → `note | tip | warn | danger`.

### Images — `image`, `figure`, `gallery`

```md
![alt](/img/a.png)                     → image (v0.1, unchanged)
![alt](/img/a.png "A caption")         → figure (caption supports inline markup)
![one](/img/1.png)
![two](/img/2.png)                     → adjacent image lines merge into a gallery
```

A blank line between images keeps them separate.

### Code — `code`

````md
```ts src/example.ts
const x: number = 1;
```
````

The first word of the fence info is the language; the rest becomes a filename label. With the `shiki` peer, blocks are highlighted **server-side once** with both themes emitted as CSS variables (`--shiki-light`/`--shiki-dark`) — dark mode is pure CSS, zero client JS. Without shiki: clean mono fallback. Copy button included either way.

The filename label and the copy button share a toolbar row (`.bp-codeblock-toolbar`) **above** the code, in normal flow — since 0.2.7. Earlier versions overlaid the button on the `<pre>` and reserved a fixed band for it, which broke the moment a consumer's own CSS made buttons taller (a `min-height: 2.75rem` touch-target rule on coarse pointers, say). In flow, the button can be any height your stylesheet gives it and never covers code. On hover-capable pointers the button rests faded and reveals on hover/focus; on touch it is always visible.

**Deploying with `output: "standalone"`?** Because shiki is an *optional* peer, bip-kit's zero-config load goes through an import that bundlers (and Next.js output file tracing) cannot see — a standalone deploy would silently ship without shiki and lose highlighting. Register the loader once, at module scope (e.g. in your root layout), so the literal specifier lives in *your* code where the bundler and tracer can follow it:

```ts
import { setHighlighterLoader } from "bip-kit/react";
setHighlighterLoader(() => import("shiki")); // one line; traceable; only if you use shiki
```

Or pass a loaded module per render: `<ArticleBody blocks={blocks} highlighter={shiki} />` (with `import * as shiki from "shiki"`). Consumers without shiki write neither line — nothing to resolve, builds stay green.

### Diagrams — `mermaid`

````md
```mermaid
graph TD; A-->B
```
````

First-class block since v0.2 (v0.1 parsed these as `code` with lang `mermaid` — update your switch if you special-cased that).

### Charts — `chart`

````md
```chart
kind: bar
title: Weekly signups
ylabel: signups
series Organic: Jan=12, Feb=30, Mar=41
series Paid: Jan=4, Feb=9
```
````

Or strict JSON: `{ "kind": "line", "series": [{ "name": "A", "points": [["W1", 10]] }] }`. Kinds: `bar | line | area`. The renderer draws an inline, theme-aware SVG — axis, gridlines, legend, categorical palette from CSS vars, no chart library. **A malformed spec throws at parse time** with the reason — committed content is the trust boundary, and a broken chart should fail the build like a broken import, never vanish silently.

### Math — `math`

```md
$$e = mc^2$$

$$
\sum_{i=1}^n i = \frac{n(n+1)}{2}
$$
```

With the `katex` peer: server-rendered (import KaTeX's stylesheet in your app: `import "katex/dist/katex.min.css"`). Without it: the TeX source in a styled block with `data-math` — no crash.

### Footnotes — `footnote`

```md
A claim[^src] in running text.

[^src]: The definition, with **inline markup**.
  Continuation lines are indented.
```

Refs render as superscript links; definitions collect into a footnotes section at the end with backlinks.

### Stats — `stats`

````md
```stats
68 | essays shipped
99.9% | uptime
```
````

A row of value/label tiles.

### The rest

```md
---                          → hr
| A | B |                    → table (GFM, separator row required)
|---|---|
https://youtu.be/VIDEO_ID    → embed (lone URL on its own line, allowlisted)
```

Video embeds are **allowlisted, never arbitrary**: only YouTube/Vimeo URLs become `embed` blocks, rendered via `youtube-nocookie.com` / `player.vimeo.com`. Everything else stays a paragraph.

## Frontmatter

```md
---
title: My post
tags: [bitcoin, "build in public"]
authors:
  - Mao
  - George
---
```

**`parseFrontmatter` is a `key: value` scanner, not a YAML parser.** It is dependency-free on purpose and handles exactly three shapes: scalar `key: value`, inline `key: [a, b]`, and block `- item` lists. Every value comes back as a `string` or `string[]` — nothing else.

It will get real YAML wrong, quietly:

```md
title: "Bitcoin: a peer-to-peer system" → "Bitcoin"   ← splits on the FIRST colon
draft: true                             → "true"      ← the string, not a boolean
order: 3                                → "3"         ← the string, not a number
author:                                                ← nesting is not supported
  name: Mao
```

If your frontmatter has quoted strings containing colons, booleans, numbers, dates, or nesting, use a real YAML parser — [`gray-matter`](https://www.npmjs.com/package/gray-matter) is what kivvi keeps in front of bip-kit for exactly this — and hand the `body` it returns to `parseContentBlocks`:

```ts
import matter from "gray-matter";
const { data: meta, content: body } = matter(raw);
const blocks = parseContentBlocks(body);
```

bip-kit will not grow a YAML parser; one already exists.

## Helpers

```ts
extractToc(blocks);   // → { id, text, level }[]   (h2/h3/h4)
readingTime(blocks);  // → { words, minutes }      (200 wpm, min 1)
parseInline(text);    // → Inline[]                (the inline parser, standalone)
slugify("Über uns");  // → "ueber-uns"
```

## Slug policy

A slug policy is your site's **anchor contract**. `## Das Geschäftsmodell` becomes `<h2 id="…">`, and that id is the `#anchor` in every link anyone has ever shared to that section.

> [!WARNING]
> **Changing the policy on a published site renames every anchor.** Inbound links, bookmarks, and cross-post references to `#…` break silently — nothing 404s, readers just land at the top of the page. Choose a policy once, before you publish; treat a later change as a URL migration needing redirects.

Because of that, bip-kit's default never moves. Two policies ship:

| Policy                  | `Geschäftsmodell` → | `日本語` →  | For                                             |
| ----------------------- | ------------------- | ----------- | ----------------------------------------------- |
| `slugify` **(default)** | `geschaeftsmodell`  | `section`   | ASCII anchors; German transliteration (ä→ae, ß→ss) |
| `unicodeSlugify`        | `geschäftsmodell`   | `日本語`    | Multilingual sites keeping non-Latin anchors    |

Non-Latin headings have no ASCII spelling, so under the default they strip to nothing and fall back to `section`, `section-2`, … That is the reason `unicodeSlugify` exists.

Pass a policy through the `slugify` option — **to both calls**, since an id and the TOC link pointing at it are the same anchor:

```ts
import { parseContentBlocks, extractToc, unicodeSlugify } from "bip-kit";

const options = { slugify: unicodeSlugify };
const blocks = parseContentBlocks(body, options);
const toc = extractToc(blocks, options); // same policy, or the two drift apart
```

Any `SlugFn` (`(text: string) => string`) works, so you can compose rather than reimplement — de-duplication (`slug`, `slug-2`, …) and the `section` fallback for empty results are applied on top of whatever you return:

```ts
import { slugify, type SlugFn } from "bip-kit";

const prefixed: SlugFn = (text) => `sec-${slugify(text)}`;
```

## The renderer — `bip-kit/react`

Server components (RSC-first): `ArticleBody` (the one you usually need — an **async** server component that pre-awaits shiki/katex and emits a fully synchronous tree), plus `Figure`, `Gallery`, `Callout`, `PullQuote`, `Stats`, `Footnotes`, `CodeBlock`, `Chart`, `TableBlock`, `VideoEmbed`.

Client islands (each tiny, dependency-free): `Toc` (sticky scroll-spy; hides itself under 3 headings), `ReadingProgress` (top-of-page hairline), `Lightbox` (figure/gallery zoom, Escape to close), `CopyButton`. And `MermaidBlock` on `bip-kit/react/mermaid` (theme colors resolved from your CSS vars at render time).

`ArticleBody` props: `blocks`, `components` (`{ mermaid }` override), `highlighter` (a loaded shiki module — see the code-block section), `lightbox` (default `true`), `className`.

## Theming contract

`bip-kit/styles.css` is a complete neutral theme; every visual decision is a CSS custom property you may override — light, and dark via `@media (prefers-color-scheme)` plus an explicit `data-theme="dark" | "light"` attribute on `<html>` that always wins.

| Variable | Role |
| --- | --- |
| `--bp-font-sans` / `--bp-font-mono` | Type stacks |
| `--bp-size` | Base font size (17px mobile / 18px ≥720px) |
| `--bp-leading` | Body line-height (1.7) |
| `--bp-measure` | Line length (70ch) |
| `--bp-flow` | Vertical rhythm unit (1.5rem) |
| `--bp-radius` / `--bp-radius-sm` | Corner radii |
| `--bp-bg` / `--bp-surface` | Page & raised-surface backgrounds |
| `--bp-fg` / `--bp-fg-muted` / `--bp-fg-faint` | Text hierarchy |
| `--bp-border` | Hairlines & frames |
| `--bp-accent` / `--bp-accent-contrast` | Links, active TOC, progress bar |
| `--bp-note` / `--bp-note-bg` | Note callout |
| `--bp-tip` / `--bp-tip-bg` | Tip callout |
| `--bp-warn` / `--bp-warn-bg` | Warning callout |
| `--bp-danger` / `--bp-danger-bg` | Danger callout |
| `--bp-chart-1` … `--bp-chart-6` | Categorical chart palette |

Retheme by redefining vars on `:root` (and your dark scope) — zero rule overrides needed. Components emit **semantic classes only** (`bp-p`, `bp-h2`, `bp-callout bp-callout--warn`, `bp-figure`, …), so a from-scratch stylesheet is equally supported.

## Security model

Typed blocks are the security model:

- **No raw HTML, ever.** Markdown becomes a discriminated union; the renderer emits React elements from typed data. There is no HTML passthrough for content to hide in — which makes the renderer safe for **database/user-submitted content** too, not just committed files.
- **Link hrefs are guarded at render.** `javascript:` and every unknown scheme degrade to plain text (`safeHref` allows http/https/mailto/tel/relative/#).
- **Embeds are allowlisted.** Only YouTube/Vimeo, always via the privacy player. A markdown file can never inject an arbitrary iframe.
- The only `dangerouslySetInnerHTML` sinks are shiki/KaTeX **output generated from escaped source** — never author-supplied markup.
- Parse errors in chart/stats fences **throw** instead of guessing.

## Types you'll actually use

- `ContentBlock` — the discriminated union your renderer switches on
- `Inline` — the inline span union (`text | strong | em | code | link | footnoteRef`)
- `ChartSpec` / `ChartSeries` — the tiny declarative chart contract
- `TocEntry`, `ReadingTimeResult`
- `BlogPostMeta` — minimal post frontmatter (slug, title, summary, tags, …)
- `RoadmapDoc` / `RoadmapBucket` / `RoadmapItem` — a renderable roadmap
- `ChangelogEntry` / `ChangelogTag` — user-facing changelog entries
- `ReleaseEntry` — desktop/installer release notes

## Starter routes

[`templates/next-app`](./templates/next-app) has copy-paste Next.js route stubs for `/blog`, `/roadmap`, and `/changelog`. They're intentionally thin — copy them into your app and style with your own tokens.

## Company vs users

This kit is for **product/company** building-in-public. User-generated blogs belong on a social layer — don't bolt a UGC CMS onto every product domain.

## Used in production

Extracted from, and dogfooded by, [FleetCrown](https://fleetcrown.com) (its Thoughts/blog, roadmap, and changelog) and AOZ Wohnen before it was ever a package.

## License

MIT
