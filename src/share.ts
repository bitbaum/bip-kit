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

/** The services `shareLinks` builds a link for, in the order it returns them. */
export type ShareLinkId =
  "x" | "linkedin" | "bluesky" | "hackernews" | "whatsapp" | "telegram" | "email";

/** One way to spread a post: a stable id, a verb for the button, the link. */
export interface ShareLink {
  id: ShareLinkId;
  label: string;
  href: string;
}

/** What `shareLinks` reads. `url` is the post's public, absolute URL. */
export interface ShareTarget {
  url: string;
  title: string;
  /** A sentence or two; used where a service carries more than a title (email). */
  summary?: string;
  /** Replace any label, e.g. for another language. Unset ids keep the English verb. */
  labels?: Partial<Record<ShareLinkId, string>>;
}

/** The English verbs `shareLinks` uses when the app passes none. */
export const defaultShareLinkLabels: Record<ShareLinkId, string> = {
  x: "Share on X",
  linkedin: "Share on LinkedIn",
  bluesky: "Share on Bluesky",
  hackernews: "Submit to Hacker News",
  whatsapp: "Send on WhatsApp",
  telegram: "Send on Telegram",
  email: "Email it",
};

const enc = encodeURIComponent;

/**
 * Links that open each service's own composer with the post in it. Nothing is
 * posted until the reader confirms there, and no script or tracker is loaded:
 * every entry is a plain URL built from the service's documented share or
 * intent endpoint (cited beside each). Services with no first-party
 * documentation of such a URL are left out rather than guessed at.
 */
export function shareLinks(target: ShareTarget): ShareLink[] {
  let url: string;
  try {
    url = new URL(target.url).toString();
  } catch {
    throw new Error(`shareLinks: url is not an absolute URL: ${target.url}`);
  }
  const title = target.title.trim();
  const summary = target.summary?.trim();
  const withUrl = title ? `${title} ${url}` : url;
  const hrefs: Record<ShareLinkId, string> = {
    // https://docs.x.com/x-for-websites/post-button/guides/web-intent
    x: `https://x.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`,
    // https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/plugins/share-plugin
    // (takes only the URL; the card comes from the page's Open Graph tags)
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    // https://docs.bsky.app/docs/advanced-guides/intent-links (one `text` parameter)
    bluesky: `https://bsky.app/intent/compose?text=${enc(withUrl)}`,
    // https://news.ycombinator.com/bookmarklet.html
    hackernews: `https://news.ycombinator.com/submitlink?u=${enc(url)}&t=${enc(title)}`,
    // https://www.whatsapp.com/faq/en/general/26000030 ("How to use click to chat": wa.me/?text=)
    whatsapp: `https://wa.me/?text=${enc(withUrl)}`,
    // https://core.telegram.org/widgets/share
    telegram: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
    // https://www.rfc-editor.org/rfc/rfc6068 (mailto: spaces must be %20, never +)
    email: `mailto:?subject=${enc(title)}&body=${enc(summary ? `${summary}\n\n${url}` : url)}`,
  };
  const labels = { ...defaultShareLinkLabels, ...target.labels };
  return (Object.keys(defaultShareLinkLabels) as ShareLinkId[]).map((id) => ({
    id,
    label: labels[id],
    href: hrefs[id],
  }));
}
