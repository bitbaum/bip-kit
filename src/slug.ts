/**
 * Heading slug policies.
 *
 * A slug policy is the anchor contract of a published site: change it and
 * every `#anchor` URL already linked from the outside breaks. bip-kit
 * therefore never changes its default — it lets a consumer supply its own.
 *
 * Two policies ship, and both are correct for the site that chose them:
 *
 * - `slugify` (the DEFAULT) transliterates to ASCII — `Geschäftsmodell` →
 *   `geschaeftsmodell`. Ported from kivvi's slugifyHeading, which the fleet
 *   already publishes against.
 * - `unicodeSlugify` preserves letters of any script — `Kanäle` → `kanäle`,
 *   `日本語` → `日本語`. For multilingual sites whose non-Latin headings
 *   would otherwise collapse to nothing.
 *
 * Anything matching `SlugFn` works as a third policy; pass it through the
 * `slugify` option on `parseContentBlocks` / `extractToc`.
 */

/** A heading-id policy: heading text in, slug out (may be empty). */
export type SlugFn = (text: string) => string;

/** Options for the helpers that assign heading ids. */
export interface SlugOptions {
  /**
   * Slug policy for heading ids. Defaults to `slugify` (ASCII).
   * The same policy MUST be used for parsing and for the TOC, or the anchor
   * a heading carries and the anchor the TOC links to drift apart.
   */
  slugify?: SlugFn;
}

const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
};

/**
 * The default policy: umlaut-aware (ä→ae …), lowercase, hyphenated, ASCII.
 * Non-Latin scripts have no ASCII spelling and drop out entirely — use
 * `unicodeSlugify` if that matters to your content.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüÄÖÜ]/g, (c) => UMLAUTS[c] ?? c)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Unicode-preserving policy: lowercase, drop punctuation and symbols,
 * collapse the rest to single hyphens, and keep letters, numbers and
 * combining marks of ANY script.
 *
 *   "Ein Eingang, vier Kanäle" → "ein-eingang-vier-kanäle"
 *   "日本語のはなし"           → "日本語のはなし"
 *
 * Not the default: adopting it on a site already published under `slugify`
 * renames every anchor.
 */
export function unicodeSlugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A per-document slugger over a policy: same heading text twice → `slug`,
 * `slug-2`, `slug-3`. A heading whose text is empty after the policy strips
 * it (`"!!!"`, or a non-Latin heading under the ASCII policy) still gets a
 * usable id — `section`, `section-2`, …
 *
 * This is the ONE place ids are assigned; `parseContentBlocks` and
 * `extractToc` both go through it so a heading's id and its TOC entry can
 * never disagree.
 */
export function createSlugger(slug: SlugFn = slugify): SlugFn {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slug(text) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}
