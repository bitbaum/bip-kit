/**
 * Heading slugs — umlaut-aware (ä→ae …), lowercase, hyphenated.
 * Ported from kivvi's slugifyHeading, which the fleet already trusts.
 */

const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüÄÖÜ]/g, (c) => UMLAUTS[c] ?? c)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A per-document slugger: same heading text twice → `slug`, `slug-2`, `slug-3`.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}
