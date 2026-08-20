# bip-kit — Building in Public

**Blog · Roadmap · Changelog** for product sites — one content contract instead of five blog stacks.

You want to build in public. What you don't want is a CMS, a markdown pipeline, three renderers, and a security review every time a product site needs a blog. bip-kit is the small, sharp core of that stack: it turns repo-authored markdown into **typed blocks** your components render, and gives you the **types** for a roadmap and a user-facing changelog. Bring your own design system.

```bash
npm i bip-kit
```

Zero dependencies. ESM, typed, ~200 lines you can read in one sitting.

## The idea

Building in public is a *content contract*, not a platform:

- **Blog** — long-form posts, written as markdown files in your repo, reviewed like code.
- **Roadmap** — a typed document (`RoadmapDoc`) your site renders, not a screenshot of a kanban board.
- **Changelog** — user-facing entries (`ChangelogEntry`), not a git log.

bip-kit owns the parsing and the types. Your app owns the routes, the rendering, and the look. That split is why the same kit serves sites with completely different design systems.

## Quick start

```ts
import { parseFrontmatter, parseContentBlocks } from "bip-kit";
import { readFileSync } from "node:fs";

const raw = readFileSync("content/blog/my-post.md", "utf8");
const { meta, body } = parseFrontmatter(raw);
const blocks = parseContentBlocks(body);

// blocks is a typed array — switch on block.type in your renderer:
// h2 · h3 · p · ul · ol · blockquote · code · table · image · embed
```

A minimal React renderer:

```tsx
function PostBody({ blocks }: { blocks: ContentBlock[] }) {
  return blocks.map((b, i) => {
    switch (b.type) {
      case "h2": return <h2 key={i}>{b.text}</h2>;
      case "p": return <p key={i}>{b.text}</p>;
      case "ul": return <ul key={i}>{b.items.map((it) => <li key={it}>{it}</li>)}</ul>;
      case "code": return <pre key={i}><code>{b.text}</code></pre>;
      case "embed": return <VideoEmbed key={i} url={b.url} />;
      // …handle the rest with your own components
    }
  });
}
```

Video embeds are **allowlisted, never arbitrary**: a lone YouTube/Vimeo URL on its own line becomes an `embed` block, and `parseVideoEmbed` refuses everything else — so a markdown file can never inject an iframe you didn't intend:

```ts
import { parseVideoEmbed, videoEmbedSrc } from "bip-kit";

const parsed = parseVideoEmbed(url);        // { provider, id } | null
if (parsed) iframeSrc = videoEmbedSrc(parsed); // youtube-nocookie / player.vimeo
```

## What the parser understands

Ordinary markdown, deliberately scoped to what long-form product writing needs:

| Input | Block |
|-------|-------|
| `## …` / `### …` | `h2` / `h3` |
| Plain lines | `p` (consecutive lines join) |
| `- …` / `1. …` | `ul` / `ol` |
| `> …` | `blockquote` |
| ` ```lang ` fences (incl. `mermaid`) | `code` |
| GFM tables | `table` |
| `![alt](src)` | `image` |
| Lone YouTube/Vimeo URL | `embed` |

Trust boundary: **committed content only** — this parses your repo's markdown, not user input.

## Types you'll actually use

- `ContentBlock` — the discriminated union your renderer switches on
- `BlogPostMeta` — minimal post frontmatter (slug, title, summary, tags, …)
- `RoadmapDoc` / `RoadmapBucket` / `RoadmapItem` — a renderable roadmap
- `ChangelogEntry` / `ChangelogTag` — user-facing changelog entries
- `ReleaseEntry` — desktop/installer release notes

## Starter routes

[`templates/next-app`](./templates/next-app) has copy-paste Next.js route stubs for `/blog`, `/roadmap`, and `/changelog`. They're intentionally thin — copy them into your app and style with your own tokens. The kit never ships UI.

## Company vs users

This kit is for **product/company** building-in-public. User-generated blogs belong on a social layer — don't bolt a UGC CMS onto every product domain.

## Used in production

Extracted from, and dogfooded by, [FleetCrown](https://fleetcrown.com) (its Thoughts/blog, roadmap, and changelog) and AOZ Wohnen before it was ever a package.

## License

MIT
