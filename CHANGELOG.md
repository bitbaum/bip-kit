# Changelog

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
