/**
 * Feedback on a roadmap and a changelog — the contract, not a backend.
 *
 * A roadmap people cannot answer is a press release, and a changelog nobody
 * can reply to is a notice board. This module lets a reader say "needed" or
 * "not needed" about a roadmap item, suggest something that is missing, and
 * comment on a change — for every product that already renders its roadmap and
 * changelog through bip-kit.
 *
 * WHAT IS HERE, AND WHAT IS NOT:
 *
 *   here      the shapes, the rules every product should share (what counts as
 *             spam, when two suggestions are the same one, how a ranking treats
 *             three votes against three hundred), a reference in-memory store,
 *             and a Web-standard request handler that enforces all of it.
 *   not here  persistence and identity. Each product brings a `FeedbackStore`
 *             over its own database, and decides who a voter is. bip-kit has
 *             no database and should not grow one.
 *
 * NO ACCOUNT, NO MODEL. A vote needs no sign-in: asking for one is where most
 * people stop. Duplicate detection is character-trigram overlap, not a
 * language model — it runs on every keystroke for free, works in any script,
 * and a free-tier model budget is better spent on the product itself.
 */

import type { ChangelogEntry, RoadmapItem } from "./types.js";
import { unicodeSlugify } from "./slug.js";

export type FeedbackKind = "roadmap" | "changelog";

/** A reader's position on a roadmap item. */
export type Stance = "needed" | "not-needed";

export interface Tally {
  needed: number;
  notNeeded: number;
  comments: number;
}

export interface FeedbackComment {
  id: string;
  targetId: string;
  body: string;
  /** ISO 8601. */
  createdAt: string;
}

export interface Suggestion {
  id: string;
  body: string;
  /** ISO 8601. */
  createdAt: string;
  /** How many voters asked for this, the author included. */
  support: number;
}

/**
 * Persistence, supplied by the product.
 *
 * `voter` is an opaque key the product chose (see `voterFromHeader`). A store
 * must keep ONE stance per voter per target — a second call replaces the
 * first, and `null` withdraws it — and one support per voter per suggestion.
 * That is what makes a count mean people rather than clicks.
 */
export interface FeedbackStore {
  tallies(targetIds: readonly string[]): Promise<Record<string, Tally>>;
  stances(targetIds: readonly string[], voter: string): Promise<Record<string, Stance>>;
  setStance(targetId: string, voter: string, stance: Stance | null): Promise<void>;
  addComment(targetId: string, voter: string, body: string): Promise<FeedbackComment>;
  /** Oldest first, at most `limit`. */
  comments(targetId: string, limit: number): Promise<FeedbackComment[]>;
  /** Creates the suggestion with the author's own support counted. */
  addSuggestion(voter: string, body: string): Promise<Suggestion>;
  /** False when there is no such suggestion. Idempotent per voter. */
  support(suggestionId: string, voter: string): Promise<boolean>;
  /** Most supported first, then newest, at most `limit`. */
  suggestions(limit: number): Promise<Suggestion[]>;
}

// ---------------------------------------------------------------------------
// Identity of a target
// ---------------------------------------------------------------------------

/**
 * The id a roadmap item's votes are stored under.
 *
 * GIVE ITEMS AN `id` IF THE ROADMAP IS TRANSLATED. Without one the id is the
 * slug of the title, so the German and English versions of one item would
 * collect two separate tallies, and renaming an item would silently reset its
 * votes. An explicit id is stable across both.
 */
export function roadmapItemId(item: Pick<RoadmapItem, "title" | "id">): string {
  return `roadmap:${item.id ?? unicodeSlugify(item.title)}`;
}

/** The id comments on a changelog entry are stored under. Same advice. */
export function changelogEntryId(entry: Pick<ChangelogEntry, "title" | "date" | "id">): string {
  return `changelog:${entry.id ?? `${entry.date}:${unicodeSlugify(entry.title)}`}`;
}

// ---------------------------------------------------------------------------
// What a submission may contain
// ---------------------------------------------------------------------------

export type ScreenReason = "empty" | "too-short" | "too-long" | "links" | "flood";

export type Screened = { ok: true; text: string } | { ok: false; reason: ScreenReason };

export interface ScreenOptions {
  /** Default 3. */
  min?: number;
  /** Default 1000. */
  max?: number;
  /** Default 1. Links are what spam is for; one is enough to cite something. */
  maxLinks?: number;
}

// Each alternative consumes a whole link, so `https://example.com/x` counts once.
const LINK =
  /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|net|org|io|ru|cn|xyz|top|biz|info)\b/giu;

/**
 * Whether a comment or suggestion can be stored, and its normalised text.
 *
 * Deliberately a short list of things that are never a real contribution —
 * not a sentiment filter. A blunt "this is useless" is feedback, and a product
 * that only accepts praise has built a guestbook.
 */
export function screenText(raw: unknown, options: ScreenOptions = {}): Screened {
  const { min = 3, max = 1000, maxLinks = 1 } = options;
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length < min) return { ok: false, reason: "too-short" };
  if (text.length > max) return { ok: false, reason: "too-long" };
  if ((text.match(LINK) ?? []).length > maxLinks) return { ok: false, reason: "links" };
  // A key held down, or text with nothing to read in it.
  if (/(.)\1{9,}/u.test(text) || !/\p{L}/u.test(text)) return { ok: false, reason: "flood" };
  return { ok: true, text };
}

// ---------------------------------------------------------------------------
// When two suggestions are the same one
// ---------------------------------------------------------------------------

/**
 * Words that carry the request's politeness, not its content, in the
 * languages bip-kit's adopters publish in. Without them "please add X" and
 * "please add Y" are two-thirds the same request.
 */
const FILLER = new Set(
  (
    "the and for with please add would like could should feature option able " +
    "und mit für der die das ein eine einen bitte gerne hinzufügen möchte wäre schön " +
    "les des une pour avec ajouter merci plait " +
    "per con una aggiungere favore grazie " +
    "пожалуйста добавьте добавить можно было хотелось"
  )
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(" "),
);

function words(text: string): string[] {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      // Two-letter words ("a", "to", "de") are shared by everything.
      .filter((w) => w.length >= 3 && !FILLER.has(w))
  );
}

function trigrams(word: string): Set<string> {
  const grams = new Set<string>();
  const padded = ` ${word} `;
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/**
 * Two words are the same word when they share a stem (the word minus its
 * last two letters: `тема`/`тему`, `mode`/`modes`), or most of their trigrams
 * (`offlinemodus`/`offline-modus` split differently but read the same).
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));
  if (stem(a) === stem(b)) return true;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared) >= 0.5;
}

/**
 * How alike two requests are, 0..1: the share of the SHORTER text's content
 * words that the other one also contains.
 *
 * Measured against the shorter one because suggestions are asked at every
 * length — "Dark mode" and "Please add a dark mode for reading at night" are
 * one request, and scoring against the longer would call them different.
 * Order does not matter, inflection mostly does not, and it works in any
 * script. It costs nothing and it can be explained in one sentence, which a
 * model's judgement cannot.
 */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const matched = short.filter((w) => long.some((v) => sameWord(w, v))).length;
  return matched / short.length;
}

/**
 * The threshold at which a new suggestion is offered the existing one instead.
 *
 * Above one half, so that sharing ONE of two words ("dark mode" / "offline
 * mode") is not a match while sharing both is. Chosen on the cases in the test
 * file, in four languages. It only ever PROPOSES — the author can still post,
 * so a wrong match costs one click, never a lost idea.
 */
export const SIMILAR_AT = 0.6;

export function findSimilar(
  text: string,
  existing: readonly Suggestion[],
  { threshold = SIMILAR_AT, limit = 3 }: { threshold?: number; limit?: number } = {},
): (Suggestion & { score: number })[] {
  return (
    existing
      .map((s) => ({ ...s, score: similarity(text, s.body) }))
      .filter((s) => s.score >= threshold)
      // Equal scores: the suggestion more people already back is the one to join.
      .sort((a, b) => b.score - a.score || b.support - a.support)
      .slice(0, limit)
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Lower bound of the Wilson score interval for "needed".
 *
 * The honest way to rank by votes: 3 of 3 is not better than 280 of 300, and
 * a plain ratio says it is. Zero votes rank as zero.
 */
export function wilson(needed: number, notNeeded: number, z = 1.96): number {
  const n = needed + notNeeded;
  if (n === 0) return 0;
  const p = needed / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

// ---------------------------------------------------------------------------
// Voters
// ---------------------------------------------------------------------------

export const VOTER_HEADER = "x-bip-voter";

/**
 * The voter key a client sent, if it is shaped like one.
 *
 * The reference client generates a random key per browser and keeps it. That
 * is not identity and does not pretend to be: it makes "one vote per person"
 * true for everybody who is not trying, and the handler's `allow` hook (rate
 * limiting per IP) is what bounds somebody who is.
 */
export function voterFromHeader(request: Request, header = VOTER_HEADER): string | null {
  const value = request.headers.get(header);
  return value && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Reference store
// ---------------------------------------------------------------------------

/** In-memory `FeedbackStore`: tests, local development, and the contract's reference. */
export function memoryStore(now: () => Date = () => new Date()): FeedbackStore {
  const stances = new Map<string, Map<string, Stance>>();
  const comments: (FeedbackComment & { voter: string })[] = [];
  const suggestions: (Omit<Suggestion, "support"> & { supporters: Set<string> })[] = [];
  let seq = 0;
  const id = () => `m${++seq}`;

  return {
    async tallies(targetIds) {
      const out: Record<string, Tally> = {};
      for (const t of targetIds) {
        const votes = [...(stances.get(t)?.values() ?? [])];
        out[t] = {
          needed: votes.filter((v) => v === "needed").length,
          notNeeded: votes.filter((v) => v === "not-needed").length,
          comments: comments.filter((c) => c.targetId === t).length,
        };
      }
      return out;
    },
    async stances(targetIds, voter) {
      const out: Record<string, Stance> = {};
      for (const t of targetIds) {
        const s = stances.get(t)?.get(voter);
        if (s) out[t] = s;
      }
      return out;
    },
    async setStance(targetId, voter, stance) {
      const m = stances.get(targetId) ?? new Map<string, Stance>();
      if (stance) m.set(voter, stance);
      else m.delete(voter);
      stances.set(targetId, m);
    },
    async addComment(targetId, voter, body) {
      const c = { id: id(), targetId, body, createdAt: now().toISOString(), voter };
      comments.push(c);
      return { id: c.id, targetId, body, createdAt: c.createdAt };
    },
    async comments(targetId, limit) {
      return comments
        .filter((c) => c.targetId === targetId)
        .slice(0, limit)
        .map(({ id: cid, targetId: t, body, createdAt }) => ({
          id: cid,
          targetId: t,
          body,
          createdAt,
        }));
    },
    async addSuggestion(voter, body) {
      const s = { id: id(), body, createdAt: now().toISOString(), supporters: new Set([voter]) };
      suggestions.push(s);
      return { id: s.id, body, createdAt: s.createdAt, support: 1 };
    },
    async support(suggestionId, voter) {
      const s = suggestions.find((x) => x.id === suggestionId);
      if (!s) return false;
      s.supporters.add(voter);
      return true;
    },
    async suggestions(limit) {
      return suggestions
        .map(({ id: sid, body, createdAt, supporters }) => ({
          id: sid,
          body,
          createdAt,
          support: supporters.size,
        }))
        .sort((a, b) => b.support - a.support || b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
  };
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export type FeedbackAction = "read" | "stance" | "comment" | "suggest" | "support";

export interface FeedbackHandlerOptions {
  store: FeedbackStore;
  /**
   * Whether an id names something on THIS product's roadmap or changelog.
   * Required: without it anybody could create tallies for arbitrary strings.
   */
  isTarget(targetId: string): boolean;
  /** Who is voting. `voterFromHeader` unless the product has better. */
  voter?(request: Request): string | null | Promise<string | null>;
  /** Rate limiting, per action. Return false to answer 429. */
  allow?(request: Request, action: FeedbackAction): boolean | Promise<boolean>;
  /** Default 50. */
  commentLimit?: number;
  /** Default 50. */
  suggestionLimit?: number;
  screen?: ScreenOptions;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

/**
 * `GET` and `POST`, as Web-standard handlers — a Next.js route file can
 * re-export them directly.
 *
 *   GET  ?ids=a,b          tallies, and this voter's stances
 *   GET  ?comments=<id>    comments on one target
 *   GET  ?suggestions=1    suggestions, most supported first
 *   POST {action:"stance",  targetId, stance: "needed"|"not-needed"|null}
 *   POST {action:"comment", targetId, body}
 *   POST {action:"suggest", body, force?}   -> {duplicates} unless force
 *   POST {action:"support", suggestionId}
 *
 * A POST carrying a non-empty `website` field is a bot filling every input:
 * it gets a success and nothing is stored, so it learns nothing.
 */
export function createFeedbackHandler(options: FeedbackHandlerOptions) {
  const { store, isTarget, commentLimit = 50, suggestionLimit = 50, screen } = options;
  const voterOf = options.voter ?? ((r: Request) => voterFromHeader(r));
  const allow = options.allow ?? (() => true);

  async function GET(request: Request): Promise<Response> {
    if (!(await allow(request, "read"))) return fail("rate-limited", 429);
    const url = new URL(request.url);

    const commentsFor = url.searchParams.get("comments");
    if (commentsFor !== null) {
      if (!isTarget(commentsFor)) return fail("unknown-target", 404);
      return json({ comments: await store.comments(commentsFor, commentLimit) });
    }
    if (url.searchParams.has("suggestions")) {
      return json({ suggestions: await store.suggestions(suggestionLimit) });
    }

    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && isTarget(s))
      .slice(0, 200);
    const voter = await voterOf(request);
    return json({
      tallies: await store.tallies(ids),
      mine: voter ? await store.stances(ids, voter) : {},
    });
  }

  async function POST(request: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object") return fail("bad-body");
      body = parsed as Record<string, unknown>;
    } catch {
      return fail("bad-body");
    }
    const action = body.action;
    if (
      action !== "stance" &&
      action !== "comment" &&
      action !== "suggest" &&
      action !== "support"
    ) {
      return fail("bad-action");
    }
    if (!(await allow(request, action))) return fail("rate-limited", 429);
    if (typeof body.website === "string" && body.website.length > 0) return json({ ok: true });

    const voter = await voterOf(request);
    if (!voter) return fail("no-voter");

    if (action === "stance") {
      const targetId = String(body.targetId ?? "");
      if (!isTarget(targetId)) return fail("unknown-target", 404);
      const stance = body.stance;
      if (stance !== "needed" && stance !== "not-needed" && stance !== null)
        return fail("bad-stance");
      await store.setStance(targetId, voter, stance);
      const tallies = await store.tallies([targetId]);
      return json({ tally: tallies[targetId], mine: stance });
    }

    if (action === "comment") {
      const targetId = String(body.targetId ?? "");
      if (!isTarget(targetId)) return fail("unknown-target", 404);
      const screened = screenText(body.body, screen);
      if (!screened.ok) return fail(screened.reason);
      return json({ comment: await store.addComment(targetId, voter, screened.text) }, 201);
    }

    if (action === "suggest") {
      const screened = screenText(body.body, screen);
      if (!screened.ok) return fail(screened.reason);
      if (body.force !== true) {
        const duplicates = findSimilar(screened.text, await store.suggestions(500));
        if (duplicates.length > 0) return json({ duplicates });
      }
      return json({ suggestion: await store.addSuggestion(voter, screened.text) }, 201);
    }

    const suggestionId = String(body.suggestionId ?? "");
    if (!(await store.support(suggestionId, voter))) return fail("unknown-suggestion", 404);
    return json({ ok: true });
  }

  return { GET, POST };
}
