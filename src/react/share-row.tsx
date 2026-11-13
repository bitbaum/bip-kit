"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { shareLinks } from "../share.js";
import type { ShareLinkId } from "../share.js";

/** Every word `ShareRow` shows besides the service links; pass any to translate. */
export interface ShareRowLabels {
  /** The landmark's accessible name. */
  landmark: string;
  /** The device's own share sheet; shown only where the browser has one. */
  share: string;
  copy: string;
  copied: string;
  /** Shown in the prompt when the clipboard refuses, so the link can still be copied by hand. */
  copyManually: string;
  /** Shown beside "Copy link" when the content is not public (`audience: "restricted"`). */
  restrictedNote: string;
}

export const defaultShareRowLabels: ShareRowLabels = {
  landmark: "Share this post",
  share: "Share…",
  copy: "Copy link",
  copied: "Link copied",
  copyManually: "Copy this link",
  restrictedNote: "Only people who can already see this can open the link.",
};

/**
 * The app's own place to post it, shown first as the row's one primary action.
 * A link (`href`, e.g. a composer on another site, opened in a new tab unless
 * `newTab: false`) or an action in place (`onClick`, e.g. a repost sheet).
 */
export type CrossPost =
  | { label: string; href: string; newTab?: boolean; onClick?: never }
  | { label: string; onClick: () => void; href?: never; newTab?: never };

export interface ShareRowProps {
  /** The post's public, absolute URL. */
  url: string;
  title: string;
  summary?: string;
  /**
   * The app's own place to post it (e.g. `{ href: crossPostUrl(…), label:
   * "Post on OrangeCat" }`). Shown first, as the row's one primary action.
   */
  crossPost?: CrossPost;
  /**
   * `"public"` (default): every way to spread it. `"restricted"`: the content is
   * not public, so outside services would only show a dead link — the row keeps
   * the cross-post and "Copy link" and says who can open it.
   */
  audience?: "public" | "restricted";
  /** `shareLinks` ids to leave out. */
  exclude?: string[];
  labels?: Partial<ShareRowLabels>;
  /** Per-service labels, passed through to `shareLinks`. */
  linkLabels?: Partial<Record<ShareLinkId, string>>;
}

/**
 * One line of ways to spread a post: the app's own cross-post first, then the
 * device share sheet (where there is one), "Copy link", then every service from
 * `shareLinks`. Many choices → one line that scrolls sideways, never wrapping.
 */
export function ShareRow({
  url,
  title,
  summary,
  crossPost,
  audience = "public",
  exclude,
  labels,
  linkLabels,
}: ShareRowProps): ReactNode {
  const words = { ...defaultShareRowLabels, ...labels };
  // Feature-detected after mount, so the server HTML and the first client
  // render agree; the button appears once the browser says it can share.
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const skip = new Set(exclude ?? []);
  const restricted = audience === "restricted";
  const links = restricted
    ? []
    : shareLinks({ url, title, summary, labels: linkLabels }).filter((link) => !skip.has(link.id));

  function copy(): void {
    const done = (): void => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    };
    const manual = (): void => {
      // Clipboard blocked (permissions, http): hand the link over to copy by hand.
      window.prompt(words.copyManually, url);
    };
    if (!navigator.clipboard) return manual();
    navigator.clipboard.writeText(url).then(done, manual);
  }

  function share(): void {
    navigator.share({ title, text: summary, url }).catch(() => {
      /* dismissed by the reader — nothing to do */
    });
  }

  return (
    <nav className="bp-share" aria-label={words.landmark}>
      <ul className="bp-share-list">
        {crossPost ? (
          <li>
            {crossPost.onClick ? (
              <button
                type="button"
                className="bp-share-action bp-share-primary"
                onClick={crossPost.onClick}
              >
                {crossPost.label}
              </button>
            ) : (
              <a
                className="bp-share-action bp-share-primary"
                href={crossPost.href}
                {...(crossPost.newTab === false
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {crossPost.label}
              </a>
            )}
          </li>
        ) : null}
        {canShare && !restricted ? (
          <li>
            <button type="button" className="bp-share-action" onClick={share}>
              {words.share}
            </button>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            className="bp-share-action"
            data-copied={copied || undefined}
            onClick={copy}
          >
            <span aria-live="polite">{copied ? words.copied : words.copy}</span>
          </button>
        </li>
        {links.map((link) => (
          <li key={link.id}>
            <a
              className="bp-share-action"
              href={link.href}
              // mailto: hands off to the mail app; a new tab would be left blank.
              {...(link.href.startsWith("mailto:")
                ? {}
                : { target: "_blank", rel: "noopener noreferrer" })}
              data-share={link.id}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      {restricted ? <p className="bp-share-note">{words.restrictedNote}</p> : null}
    </nav>
  );
}
