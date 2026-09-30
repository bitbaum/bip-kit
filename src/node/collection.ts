import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentBlock, TocEntry } from "../types.js";
import { parseContentBlocks, parseFrontmatter } from "../parse-content.js";
import { inlineToText, parseInline } from "../inline.js";
import { normalizeMarkdown } from "../normalize.js";
import { extractToc, readingTime } from "../toc.js";

/**
 * A folder of markdown files as a list of entries: a blog, notes, essays, a
 * knowledge base. Five products wrote this reader for themselves, each with
 * slightly different rules; this one accepts all of their shapes.
 *
 * - The slug is the file name without `.md`. A `YYYY-MM-DD-` prefix is the
 *   entry's date and is dropped from the slug.
 * - `title:` in the frontmatter, else the body's first `# Heading` (which is
 *   then removed from the body, because the page prints the title itself;
 *   an `*YYYY-MM-DD*` line repeating the date goes too).
 * - `date:` or `publishedAt:`, else the file name's date. It must be
 *   YYYY-MM-DD; anything else throws, naming the file, so a typo fails the
 *   build rather than sorting a post to the bottom.
 * - `summary:`, `excerpt:` or `description:`, else the first paragraph.
 * - `draft: true` or `published: false` leaves the entry out.
 *
 * Node only (it reads the filesystem); import it from `bip-kit/node`. The
 * parsing it does is the same as everywhere else: `normalizeMarkdown`, then
 * `parseContentBlocks`.
 */
export interface CollectionEntry {
  slug: string;
  title: string;
  /** YYYY-MM-DD, or "" when the entry has no date. */
  date: string;
  summary: string;
  tags: string[];
  author: string | null;
  /** The frontmatter as written, for fields this reader does not know. */
  meta: Record<string, string | string[]>;
  /** Normalized markdown body, without the title heading. */
  body: string;
  blocks: ContentBlock[];
  toc: TocEntry[];
  readingMinutes: number;
  /** The file it came from, relative to the collection folder. */
  file: string;
}

export interface CollectionOptions {
  /** Include `draft: true` / `published: false` entries (e.g. in a preview). */
  includeDrafts?: boolean;
}

const DATED_FILE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const scalar = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v.join(", ") : v?.trim() || undefined;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter(Boolean);

function readFile(dir: string, file: string): CollectionEntry {
  const raw = readFileSync(join(dir, file), "utf8");
  const { meta, body: rawBody } = parseFrontmatter(raw);
  const stem = file.replace(/\.md$/, "");
  const dated = DATED_FILE.exec(stem);

  let body = normalizeMarkdown(rawBody);
  let title = scalar(meta.title);
  if (!title) {
    const heading = /^# (?!#)(.+)$/m.exec(rawBody);
    if (heading) {
      title = heading[1].trim();
      body = normalizeMarkdown(rawBody.replace(heading[0], ""));
    }
  }

  const date = scalar(meta.date) ?? scalar(meta.publishedAt) ?? dated?.[1] ?? "";
  if (date && !ISO_DAY.test(date)) {
    throw new Error(`${file}: the date must be YYYY-MM-DD, not "${date}"`);
  }

  // A dated file often repeats its date as an emphasised line under the title;
  // the page prints the date itself, and it must not become the summary.
  if (date) body = body.replace(new RegExp(`^[ \\t]*([*_])${date}\\1[ \\t]*\\n?`, "m"), "");

  const blocks = parseContentBlocks(body);
  const firstParagraph = blocks.find((b) => b.type === "p");
  const summary =
    scalar(meta.summary) ??
    scalar(meta.excerpt) ??
    scalar(meta.description) ??
    (firstParagraph && firstParagraph.type === "p"
      ? inlineToText(parseInline(firstParagraph.text))
      : "");

  return {
    slug: dated ? dated[2] : stem,
    title: title ?? stem,
    date,
    summary,
    tags: list(meta.tags),
    author: scalar(meta.author) ?? null,
    meta,
    body,
    blocks,
    toc: extractToc(blocks),
    readingMinutes: readingTime(blocks).minutes,
    file,
  };
}

const isDraft = (e: CollectionEntry) =>
  scalar(e.meta.draft) === "true" || scalar(e.meta.published) === "false";

/** Every entry in the folder, newest first (then by title). A missing folder is an empty collection. */
export function readCollection(dir: string, options: CollectionOptions = {}): CollectionEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f.toLowerCase() !== "readme.md")
    .map((f) => readFile(dir, f))
    .filter((e) => options.includeDrafts || !isDraft(e))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/**
 * One entry by slug, or undefined. The slug usually comes from a URL, so only
 * plain names are looked up; nothing else reaches the filesystem.
 */
export function readEntry(
  dir: string,
  slug: string,
  options: CollectionOptions = {},
): CollectionEntry | undefined {
  if (!SAFE_SLUG.test(slug)) return undefined;
  return readCollection(dir, options).find((e) => e.slug === slug);
}
