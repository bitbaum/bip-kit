/**
 * Building in Public — shared content contracts.
 * Company/product surfaces only (blog · roadmap · changelog). Not UGC.
 */

import type { Inline } from "./inline.js";
import type { ChartSpec } from "./chart.js";

export type CalloutKind = "note" | "tip" | "warn" | "danger";

/**
 * Long-form essay / blog body blocks (markdown → structured).
 *
 * v0.2 notes: the original ten block types are unchanged in shape — `id` and
 * `spans` on them are OPTIONAL in the type (hand-built blocks from v0.1
 * consumers still typecheck) but the parser always emits them. New block
 * types added in v0.2 carry their fields as required.
 */
export type ContentBlock =
  | { type: "h2"; text: string; id?: string; spans?: Inline[] }
  | { type: "h3"; text: string; id?: string; spans?: Inline[] }
  | { type: "h4"; text: string; id: string; spans: Inline[] }
  | { type: "hr" }
  | { type: "ul"; items: string[]; itemSpans?: Inline[][] }
  | { type: "ol"; items: string[]; itemSpans?: Inline[][] }
  | { type: "blockquote"; text: string[]; spans?: Inline[][] }
  | { type: "p"; text: string; spans?: Inline[] }
  | { type: "image"; alt: string; src: string }
  | { type: "figure"; src: string; alt: string; caption?: string; spans?: Inline[] }
  | { type: "gallery"; images: { src: string; alt: string; caption?: string }[] }
  | { type: "callout"; kind: CalloutKind; title?: string; blocks: ContentBlock[] }
  | { type: "pullquote"; text: string; spans: Inline[]; cite?: string }
  | { type: "code"; lang: string; text: string }
  | { type: "mermaid"; code: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "math"; tex: string; display: boolean }
  | { type: "footnote"; id: string; blocks: ContentBlock[] }
  | { type: "stats"; items: { value: string; label: string }[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "embed"; url: string };

/** One table-of-contents entry, produced by `extractToc`. */
export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

/** Result of `readingTime` — words counted and minutes at the given pace. */
export interface ReadingTimeResult {
  words: number;
  minutes: number;
}

/** Minimal post frontmatter common across studio blogs. */
export interface BlogPostMeta {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
  featured: boolean;
  author: string;
  readingTimeMin: number;
}

export type RoadmapItem = {
  title: string;
  line: string;
  details?: string[];
  essay?: { label: string; href: string };
};

export type RoadmapBucket = {
  title: string;
  summary: string;
  items: RoadmapItem[];
};

/** Product roadmap document shape (TS module or serialized JSON). */
export interface RoadmapDoc {
  eyebrow: string;
  title: string;
  lede: string;
  buckets: RoadmapBucket[];
}

export type ChangelogTag = "feature" | "improvement" | "fix" | "platform" | "breaking";

/** User-facing product changelog entry (not a git log). */
export interface ChangelogEntry {
  date: string;
  tag: ChangelogTag;
  title: string;
  summary: string;
  items?: string[];
}

/** Desktop / installer release notes (e.g. Fleet Runner). */
export interface ReleaseEntry {
  version: string;
  tag: string;
  date: string;
  highlights: string[];
  breaking: string[];
  notes: string;
}
