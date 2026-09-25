"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { findSimilar, VOTER_HEADER } from "../feedback.js";
import type { FeedbackComment, Stance, Suggestion, Tally } from "../feedback.js";

/**
 * The reader's side of `bip-kit` feedback: say "needed" or "not needed" about a
 * roadmap item, comment on a change, suggest what is missing.
 *
 * Talks to an endpoint built with `createFeedbackHandler`. Every visible word is
 * a prop (`FeedbackLabels`), so a product in any language passes its own; the
 * English defaults exist so a first integration renders something sensible.
 *
 * No sign-in. The browser keeps a random voter key; see `voterFromHeader` for
 * what that is and is not.
 */

export interface FeedbackLabels {
  needed: string;
  notNeeded: string;
  /** Screen-reader label for the tally, `{needed}` and `{notNeeded}` filled. */
  tally: string;
  comments: string;
  commentPlaceholder: string;
  send: string;
  noComments: string;
  suggestTitle: string;
  suggestPlaceholder: string;
  suggest: string;
  similarTitle: string;
  support: string;
  supported: string;
  postAnyway: string;
  thanks: string;
  failed: string;
  /** Shown when the server refused the text; keyed by `ScreenReason`. */
  refused: string;
}

export const defaultFeedbackLabels: FeedbackLabels = {
  needed: "Needed",
  notNeeded: "Not needed",
  tally: "{needed} say needed, {notNeeded} say not needed",
  comments: "Comments",
  commentPlaceholder: "What do you think?",
  send: "Send",
  noComments: "No comments yet.",
  suggestTitle: "Missing something?",
  suggestPlaceholder: "Suggest a feature",
  suggest: "Suggest",
  similarTitle: "Someone already asked for something similar:",
  support: "Me too",
  supported: "Counted",
  postAnyway: "Mine is different — post it",
  thanks: "Thank you — it is on the list.",
  failed: "That did not go through. Please try again.",
  refused: "Please write a sentence, with at most one link.",
};

const VOTER_KEY = "bip-kit.voter";

function voterKey(): string {
  try {
    const existing = window.localStorage.getItem(VOTER_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(VOTER_KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked: a key for this page view only. Votes still count once
    // per view; nothing breaks.
    return crypto.randomUUID();
  }
}

async function call<T>(endpoint: string, init: RequestInit & { query?: string } = {}): Promise<T> {
  const { query, ...rest } = init;
  const res = await fetch(query ? `${endpoint}?${query}` : endpoint, {
    ...rest,
    headers: { "content-type": "application/json", [VOTER_HEADER]: voterKey(), ...rest.headers },
  });
  if (!res.ok) throw Object.assign(new Error(`feedback ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

interface FeedbackState {
  endpoint: string;
  labels: FeedbackLabels;
  tallies: Record<string, Tally>;
  mine: Record<string, Stance>;
  setStance(targetId: string, stance: Stance | null): Promise<void>;
  bumpComments(targetId: string): void;
}

const Ctx = createContext<FeedbackState | null>(null);

function useFeedbackState(): FeedbackState {
  const state = useContext(Ctx);
  if (!state) throw new Error("bip-kit: feedback components must sit inside <FeedbackProvider>");
  return state;
}

/**
 * Loads every tally on the page in ONE request, so a roadmap of twenty items
 * is one round trip, not twenty.
 */
export function FeedbackProvider({
  endpoint,
  targetIds,
  labels,
  children,
}: {
  endpoint: string;
  targetIds: readonly string[];
  labels?: Partial<FeedbackLabels>;
  children: ReactNode;
}) {
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [mine, setMine] = useState<Record<string, Stance>>({});
  const merged = useMemo(() => ({ ...defaultFeedbackLabels, ...labels }), [labels]);
  const key = targetIds.join(",");

  useEffect(() => {
    let live = true;
    call<{ tallies: Record<string, Tally>; mine: Record<string, Stance> }>(endpoint, {
      query: `ids=${encodeURIComponent(key)}`,
    })
      .then((r) => {
        if (!live) return;
        setTallies(r.tallies);
        setMine(r.mine);
      })
      // A roadmap that cannot load its tallies is still a roadmap.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [endpoint, key]);

  const setStance = useCallback(
    async (targetId: string, stance: Stance | null) => {
      const r = await call<{ tally: Tally; mine: Stance | null }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "stance", targetId, stance }),
      });
      setTallies((t) => ({ ...t, [targetId]: r.tally }));
      setMine((m) => {
        const next = { ...m };
        if (r.mine) next[targetId] = r.mine;
        else delete next[targetId];
        return next;
      });
    },
    [endpoint],
  );

  const bumpComments = useCallback((targetId: string) => {
    setTallies((t) => {
      const cur = t[targetId] ?? { needed: 0, notNeeded: 0, comments: 0 };
      return { ...t, [targetId]: { ...cur, comments: cur.comments + 1 } };
    });
  }, []);

  const value = useMemo(
    () => ({ endpoint, labels: merged, tallies, mine, setStance, bumpComments }),
    [endpoint, merged, tallies, mine, setStance, bumpComments],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const fillIn = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => String(v[k] ?? m));

/** "Needed" / "Not needed", each with its count. Pressing your own choice again withdraws it. */
export function StanceButtons({ targetId }: { targetId: string }) {
  const { labels, tallies, mine, setStance } = useFeedbackState();
  const [busy, setBusy] = useState(false);
  const tally = tallies[targetId] ?? { needed: 0, notNeeded: 0, comments: 0 };
  const current = mine[targetId];

  const press = async (stance: Stance) => {
    setBusy(true);
    try {
      await setStance(targetId, current === stance ? null : stance);
    } catch {
      // The count simply does not move; nothing else depends on it.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bp-feedback-stance"
      role="group"
      aria-label={fillIn(labels.tally, { needed: tally.needed, notNeeded: tally.notNeeded })}
    >
      {(
        [
          ["needed", labels.needed, tally.needed],
          ["not-needed", labels.notNeeded, tally.notNeeded],
        ] as const
      ).map(([stance, label, count]) => (
        <button
          key={stance}
          type="button"
          className="bp-feedback-stance-button"
          aria-pressed={current === stance}
          disabled={busy}
          onClick={() => void press(stance)}
        >
          <span>{label}</span>
          <span className="bp-feedback-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

/** A collapsed comment thread under a changelog entry or roadmap item. */
export function CommentThread({ targetId }: { targetId: string }) {
  const { endpoint, labels, tallies, bumpComments } = useFeedbackState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedbackComment[] | null>(null);
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = tallies[targetId]?.comments ?? 0;

  useEffect(() => {
    if (!open || items) return;
    call<{ comments: FeedbackComment[] }>(endpoint, {
      query: `comments=${encodeURIComponent(targetId)}`,
    })
      .then((r) => setItems(r.comments))
      .catch(() => setItems([]));
  }, [open, items, endpoint, targetId]);

  const send = async () => {
    setError(null);
    try {
      const r = await call<{ comment: FeedbackComment }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "comment", targetId, body: text, website: trap }),
      });
      if (r.comment) {
        setItems((c) => [...(c ?? []), r.comment]);
        bumpComments(targetId);
      }
      setText("");
    } catch (e) {
      setError((e as { status?: number }).status === 400 ? labels.refused : labels.failed);
    }
  };

  return (
    <details
      className="bp-feedback-thread"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        {labels.comments} <span className="bp-feedback-count">{count}</span>
      </summary>
      {items && items.length === 0 && <p className="bp-feedback-empty">{labels.noComments}</p>}
      {items && items.length > 0 && (
        <ul className="bp-feedback-comments">
          {items.map((c) => (
            <li key={c.id}>
              <p>{c.body}</p>
              <time dateTime={c.createdAt}>{c.createdAt.slice(0, 10)}</time>
            </li>
          ))}
        </ul>
      )}
      <form
        className="bp-feedback-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Honeypot value={trap} onChange={setTrap} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={labels.commentPlaceholder}
          aria-label={labels.commentPlaceholder}
          maxLength={1000}
          rows={2}
        />
        <button type="submit" disabled={text.trim().length < 3}>
          {labels.send}
        </button>
        {error && (
          <p role="alert" className="bp-feedback-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

/**
 * "Missing something?" — with the likely duplicates shown AS YOU TYPE.
 *
 * The smart part is cheap on purpose: the suggestions already made are loaded
 * once and compared locally with `findSimilar`, so the reader sees "someone
 * already asked for this — me too?" before sending, and the list grows by
 * support instead of by near-identical rows. The server repeats the check, so
 * a client that skips it gains nothing.
 */
export function SuggestBox() {
  const { endpoint, labels } = useFeedbackState();
  const [existing, setExisting] = useState<Suggestion[]>([]);
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [supported, setSupported] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "sent" | "failed" | "refused">("idle");

  useEffect(() => {
    call<{ suggestions: Suggestion[] }>(endpoint, { query: "suggestions=1" })
      .then((r) => setExisting(r.suggestions))
      .catch(() => undefined);
  }, [endpoint]);

  const similar = useMemo(
    () => (text.trim().length >= 4 ? findSimilar(text, existing) : []),
    [text, existing],
  );

  const submit = async (force: boolean) => {
    try {
      const r = await call<{ suggestion?: Suggestion; duplicates?: Suggestion[] }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "suggest", body: text, force, website: trap }),
      });
      if (r.duplicates) {
        // The server knew of one the page had not loaded yet.
        setExisting((e) => [...r.duplicates!.filter((d) => !e.some((x) => x.id === d.id)), ...e]);
        return;
      }
      if (r.suggestion) setExisting((e) => [r.suggestion!, ...e]);
      setText("");
      setState("sent");
    } catch (e) {
      setState((e as { status?: number }).status === 400 ? "refused" : "failed");
    }
  };

  const support = async (id: string) => {
    try {
      await call(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "support", suggestionId: id }),
      });
      setSupported((s) => new Set(s).add(id));
      setExisting((e) =>
        e.map((x) => (x.id === id && !supported.has(id) ? { ...x, support: x.support + 1 } : x)),
      );
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="bp-feedback-suggest">
      <h3>{labels.suggestTitle}</h3>
      <form
        className="bp-feedback-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <Honeypot value={trap} onChange={setTrap} />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setState("idle");
          }}
          placeholder={labels.suggestPlaceholder}
          aria-label={labels.suggestPlaceholder}
          maxLength={1000}
          rows={2}
        />
        {similar.length > 0 && (
          <div className="bp-feedback-similar" aria-live="polite">
            <p>{labels.similarTitle}</p>
            <ul>
              {similar.map((s) => (
                <li key={s.id}>
                  <span>{s.body}</span>
                  <button
                    type="button"
                    disabled={supported.has(s.id)}
                    onClick={() => void support(s.id)}
                  >
                    {supported.has(s.id) ? labels.supported : labels.support}{" "}
                    <span className="bp-feedback-count">{s.support}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type={similar.length > 0 ? "button" : "submit"}
          disabled={text.trim().length < 3}
          onClick={similar.length > 0 ? () => void submit(true) : undefined}
        >
          {similar.length > 0 ? labels.postAnyway : labels.suggest}
        </button>
        {state === "sent" && <p className="bp-feedback-ok">{labels.thanks}</p>}
        {state === "failed" && (
          <p role="alert" className="bp-feedback-error">
            {labels.failed}
          </p>
        )}
        {state === "refused" && (
          <p role="alert" className="bp-feedback-error">
            {labels.refused}
          </p>
        )}
      </form>
    </section>
  );
}

/** Off-screen, unlabelled for people, irresistible to a form-filling bot. */
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="bp-feedback-trap"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
