# Changelog

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
