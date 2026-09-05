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

## The block vocabulary

One syntax example per block. Everything the v0.1 parser understood still parses identically; v0.2 adds the rest of what long-form writing needs.

### Headings — `h2` / `h3` / `h4`

```md
## Section        → { type: "h2", text, id: "section", spans }
### Subsection    → h3
#### Detail       → h4
```

Headings carry a slugified, de-duplicated, umlaut-aware `id` (`## Über uns` → `ueber-uns`) — anchors and TOC for free.

### Paragraphs & inline markup — `p`

```md
Body text with **bold**, *emphasis*, `code`, [links](https://example.com) and footnote refs[^1].
```

Every text-bearing block keeps its raw `text` AND carries `spans: Inline[]` — a parsed tree of `text | strong | em | code | link | footnoteRef` nodes. Consumers stop re-parsing `**bold**` themselves.

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

`parseFrontmatter` is still dependency-free `key: value` parsing — v0.2 adds inline `[a, b]` arrays and block `- item` lists. Scalar values parse exactly as before.

## Helpers

```ts
extractToc(blocks);   // → { id, text, level }[]   (h2/h3/h4)
readingTime(blocks);  // → { words, minutes }      (200 wpm, min 1)
parseInline(text);    // → Inline[]                (the inline parser, standalone)
slugify("Über uns");  // → "ueber-uns"
```

## The renderer — `bip-kit/react`

Server components (RSC-first): `ArticleBody` (the one you usually need — an **async** server component that pre-awaits shiki/katex and emits a fully synchronous tree), plus `Figure`, `Gallery`, `Callout`, `PullQuote`, `Stats`, `Footnotes`, `CodeBlock`, `Chart`, `TableBlock`, `VideoEmbed`.

Client islands (each tiny, dependency-free): `Toc` (sticky scroll-spy; hides itself under 3 headings), `ReadingProgress` (top-of-page hairline), `Lightbox` (figure/gallery zoom, Escape to close), `CopyButton`. And `MermaidBlock` on `bip-kit/react/mermaid` (theme colors resolved from your CSS vars at render time).

`ArticleBody` props: `blocks`, `components` (`{ mermaid }` override), `lightbox` (default `true`), `className`.

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
