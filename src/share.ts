/**
 * Cross-posting a post to another fleet product — the content contract.
 *
 * A product's blog post becomes a small JSON document another product can
 * import (OrangeCat's article composer reads exactly this shape), and a link
 * that opens that product's composer already filled in. The package stores no
 * host: the app passes its own canonical URL and the composer URL it posts to.
 *
 *   { "article": { "title", "body", "excerpt"?, "canonical"?, "author"? } }
 *
 * `body` is markdown. Links in it that start with `/` are rewritten against the
 * canonical URL's origin, so a link to `/roadmap` still reaches the product's
 * roadmap after the text has moved to another site.
 */

/** The article inside a cross-post document. */
export interface SharedArticle {
  title: string;
  /** Markdown, with root-relative links made absolute. */
  body: string;
  excerpt?: string;
  /** Where the post was first published. */
  canonical?: string;
  author?: string;
}

/** What `sharedArticle` reads: any entry with a title and a markdown body. */
export interface ShareableEntry {
  title: string;
  body: string;
  summary?: string;
  excerpt?: string;
  author?: string | null;
}

/** Rewrite `](/path)` markdown links and `href="/path"` against `origin`. */
export function absolutizeLinks(markdown: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return markdown
    .replace(/\]\(\/(?!\/)/g, `](${base}/`)
    .replace(/href="\/(?!\/)/g, `href="${base}/`);
}

/**
 * The cross-post document for one entry. `canonical` is the post's own public
 * URL; when given, it is carried along and root-relative links point back to
 * its site.
 */
export function sharedArticle(
  entry: ShareableEntry,
  canonical?: string,
): { article: SharedArticle } {
  let origin: string | undefined;
  if (canonical) {
    try {
      origin = new URL(canonical).origin;
    } catch {
      throw new Error(`sharedArticle: canonical is not a URL: ${canonical}`);
    }
  }
  const excerpt = (entry.excerpt ?? entry.summary ?? "").trim();
  const author = entry.author?.trim();
  const article: SharedArticle = {
    title: entry.title.trim(),
    body: origin ? absolutizeLinks(entry.body.trim(), origin) : entry.body.trim(),
  };
  if (excerpt) article.excerpt = excerpt;
  if (canonical) article.canonical = canonical;
  if (author) article.author = author;
  return { article };
}

/**
 * The link that opens another product's composer with this post in it.
 *
 * `composerUrl` is the composer page (for OrangeCat, `https://orangecat.ch/articles/new`),
 * `articleUrl` the public URL of the post's cross-post JSON, and `project`, when
 * given, the id or slug of the project whose wall the post should also go on.
 */
export function crossPostUrl(composerUrl: string, articleUrl: string, project?: string): string {
  const url = new URL(composerUrl);
  url.searchParams.set("import", articleUrl);
  if (project) url.searchParams.set("project", project);
  return url.toString();
}
