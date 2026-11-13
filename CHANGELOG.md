# Changelog

## Renamed — `bip-kit` is now `@bitbaum/bip-kit`

Same code, same version, same repository; the package now lives under the
`@bitbaum` npm organization like the rest of the fleet's packages. Install
`@bitbaum/bip-kit` and import from it (`bip-kit` stays installable and is deprecated
once no adopter uses it). No API changed.

## 0.8.1 — 2026-11-13

- The share row's primary action ("Post on …") lost its label on hosts that set
  `--bp-bg: transparent` to let their own page show through (Solon does): the
  ink was `--bp-bg`. It is now `--bp-on-fg`, a new variable with light and
  dark defaults that a host can override. A style test keeps any `--bp-fg`
  fill from taking its ink from `--bp-bg` again.

## 0.8.0 — 2026-11-13

- Add `shareLinks({ url, title, summary?, labels? })`: the ordered
  `{ id, label, href }[]` for X, LinkedIn, Bluesky, Hacker News, WhatsApp,
  Telegram and email, each built from the service's documented share or intent
  URL (cited in `src/share.ts`). Labels are verbs and can be replaced.
- Add `ShareRow` to `@bitbaum/bip-kit/react`: the app's cross-post action first
  (the one primary action), "Share…" where the browser has a share sheet,
  "Copy link", then the `shareLinks` services, in one line that scrolls sideways
  with 44px targets, inside a "Share this post" landmark. Styled by new
  `bp-share*` rules in `styles.css` using the existing `--bp-*` variables.

## 0.7.1 — 2026-11-13

- Every exported React component now states its return type (`ReactNode`, or
  `Promise<ReactNode>` for the async ones). Building the package from its Git
  release with a newer `@types/react` failed with TS2883 ("the inferred type
  cannot be named"), which blocked consumers installing it from Git.

## 0.7.0 — 2026-11-10

- Add cross-posting: `sharedArticle(entry, canonical)` turns a post into the
  JSON another fleet product imports (`{ article: { title, body, excerpt,
  canonical, author } }`, root-relative links made absolute against the
  canonical URL), and `crossPostUrl(composerUrl, articleUrl, project?)` builds
  the link that opens that product's composer filled in, optionally naming the
  project whose wall the post should also go on. OrangeCat's article composer
  reads this shape. The package stores no host; the app passes both URLs.

## 0.6.1 — 2026-10-26

- Add `RoadmapDocument` and `ChangelogDocument` to `bip-kit/react` for rendering
  locally authored `RoadmapDoc` and `ChangelogEntry` records with the same
  responsive semantic structure across products. The components keep product
  copy and date formatting caller-owned, accept localized category labels,
  expose token-based styles, preserve stable item IDs, and reject unsafe essay
  links. Roadmap rendering can defer its title to an existing page header.

## 0.6.0 — 2026-10-07

The roadmap and the changelog, read as one record.

- A `{#id}` token on a roadmap milestone (or goal) and on a changelog line
  links them. `DevelopmentPage` shows, under each milestone, the dated
  changelog entries that delivered it, and under each changelog line, the
  milestone it advanced — both as anchored links (`#step-<id>`,
  `#goal-<id>`, `#change-<date>`). Tokens are stripped from what is shown.
- The roadmap is drawn as a trail per goal: one mark per milestone, filled
  where done. Done marks keep `aria-label="Done"`.
- `linkDevelopment(profile)` exposes the model for custom pages (goals with
  `deliveredIn` and first/last dates, changes with `advances`, the journey
  shipped/now/next/later, `danglingRefs`, `unrecordedSteps`); `readRefs`,
  `phaseOf`, `changeAnchor` alongside. `RoadmapTrail`, `ChangeAdvances` and
  `linkedText` from `bip-kit/react`.
- Nothing upstream changes: the token rides inside the milestone titles and
  changelog lines the fleet map already carries.

## 0.5.2 — 2026-09-30

- `normalizeMarkdown` (and so `readCollection` and `parseFaq`) joins a wrapped
  list item's indented lines into the item, the way prettier and most
  changelogs wrap long bullets. Before, the rest of the sentence rendered as a
  paragraph of its own. Indented numbered items are flattened like `- ` ones.

## 0.5.1 — 2026-09-30

- `parseFrontmatter` (and so `readCollection`) reads a `[…]` list that wraps
  over several lines, the form prettier gives long tag lists, and keeps commas
  inside quoted items. Before, a wrapped list silently came back empty.

## 0.5.0 — 2026-09-30

The parts every product was still writing for itself.

- `bip-kit/node`: `readCollection(dir)` / `readEntry(dir, slug)` read a folder
  of markdown files as a list of entries, newest first. Accepts `title:` or a
  body `# h1`; `date:`, `publishedAt:` or a `YYYY-MM-DD-` file name; `summary:`,
  `excerpt:`, `description:` or the first paragraph; `draft: true` /
  `published: false`. A malformed date fails the build, naming the file.
  Replaces five per-product readers.
- `normalizeMarkdown`: the lenient step in front of the strict parser (bullets,
  nested items, body h1, single-quoted captions, CRLF). Replaces four copies.
- `parseFaq` + `<Faq>` (`bip-kit/react`): questions and answers from one
  markdown file, rendered as native `<details>` with linkable ids and
  schema.org `FAQPage` data. `faqJsonLd`, `blocksToText` exported. Styles in
  `styles.css` (`bp-faq-*`), tokens only.

## 0.4.0 — 2026-09-25

Roadmaps and changelogs people can answer.

- `createFeedbackHandler` — Web-standard `GET`/`POST` for votes ("needed" /
  "not needed"), comments and suggestions; a Next.js route re-exports it.
- `FeedbackStore` — the persistence contract a product implements over its own
  database; `memoryStore()` is the reference.
- Shared rules: `screenText` (length, links, floods), a honeypot, one stance
  per voter per item, `findSimilar` duplicate detection for suggestions (word
  stems, no model, any script), `wilson` ranking.
- `bip-kit/react`: `FeedbackProvider`, `StanceButtons`, `CommentThread`,
  `SuggestBox`; every word is a prop (`FeedbackLabels`). Styles in
  `styles.css`, tokens only.
- `RoadmapItem.id` and `ChangelogEntry.id` (optional): give them to a
  translated roadmap so every language shares one tally.

## 0.3.1 — 2026-09-23

- Fix `loadDevelopmentProfile` for Loki fleet-map roadmap milestones, preserving
  completion state and source links while continuing to accept legacy strings.
- Render checked milestones and provenance links in `DevelopmentPage`.
