import type { ReactNode } from "react";
import type { Inline } from "../inline.js";

/**
 * Href guard for rendered links. Blocks contained in a database (the Cat, a
 * composer, an admin form) flow through the same renderer as committed files,
 * so `javascript:` and friends must never become a clickable href — the link
 * degrades to a plain span instead.
 */
const KNOWN_SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (KNOWN_SAFE_SCHEME.test(trimmed)) return trimmed;
  if (!HAS_SCHEME.test(trimmed)) return trimmed; // relative, absolute path, #anchor
  return null;
}

/** Render inline spans to React nodes (semantic bp-* classes only). */
export function renderInline(spans: Inline[]): ReactNode {
  return spans.map((span, i) => {
    switch (span.t) {
      case "text":
        return span.text;
      case "strong":
        return <strong key={i}>{renderInline(span.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(span.children)}</em>;
      case "code":
        return (
          <code key={i} className="bp-inline-code">
            {span.text}
          </code>
        );
      case "link": {
        const href = safeHref(span.href);
        if (href === null) return <span key={i}>{renderInline(span.children)}</span>;
        const external = /^https?:/i.test(href);
        return (
          <a
            key={i}
            className="bp-link"
            href={href}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {renderInline(span.children)}
          </a>
        );
      }
      case "footnoteRef":
        return (
          <sup key={i} className="bp-fnref">
            <a href={`#fn-${span.id}`} id={`fnref-${span.id}`} aria-label={`Footnote ${span.id}`}>
              {span.id}
            </a>
          </sup>
        );
    }
  });
}
