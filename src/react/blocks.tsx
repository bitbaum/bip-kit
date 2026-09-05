import type { ReactNode } from "react";
import type { CalloutKind, ContentBlock } from "../types.js";
import type { Inline } from "../inline.js";
import { parseInline } from "../inline.js";
import { parseVideoEmbed, videoEmbedSrc } from "../video-embed.js";
import { renderInline, safeHref } from "./inline.js";
import { Lightbox } from "./lightbox.js";

/** spans when the parser provided them, else parse on the fly (v0.1 blocks). */
export function spansOf(text: string, spans?: Inline[]): Inline[] {
  return spans ?? parseInline(text);
}

export interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  spans?: Inline[];
  lightbox?: boolean;
}

export function Figure({ src, alt, caption, spans, lightbox = true }: FigureProps) {
  const img = <img className="bp-img" src={src} alt={alt} loading="lazy" />;
  return (
    <figure className="bp-figure">
      {lightbox ? (
        <Lightbox src={src} alt={alt}>
          {img}
        </Lightbox>
      ) : (
        img
      )}
      {caption ? (
        <figcaption className="bp-figcaption">{renderInline(spansOf(caption, spans))}</figcaption>
      ) : null}
    </figure>
  );
}

export function Gallery({
  images,
  lightbox = true,
}: {
  images: { src: string; alt: string; caption?: string }[];
  lightbox?: boolean;
}) {
  return (
    <div className="bp-gallery" data-count={images.length}>
      {images.map((image, i) => (
        <Figure
          key={i}
          src={image.src}
          alt={image.alt}
          caption={image.caption}
          lightbox={lightbox}
        />
      ))}
    </div>
  );
}

const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  warn: "Warning",
  danger: "Danger",
};

export function Callout({
  kind,
  title,
  children,
}: {
  kind: CalloutKind;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`bp-callout bp-callout--${kind}`}>
      <p className="bp-callout-title">{title ?? CALLOUT_LABELS[kind]}</p>
      <div className="bp-callout-body">{children}</div>
    </aside>
  );
}

export function PullQuote({
  text,
  spans,
  cite,
}: {
  text: string;
  spans?: Inline[];
  cite?: string;
}) {
  return (
    <figure className="bp-pullquote">
      <blockquote className="bp-pullquote-text">{renderInline(spansOf(text, spans))}</blockquote>
      {cite ? <figcaption className="bp-pullquote-cite">{cite}</figcaption> : null}
    </figure>
  );
}

export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="bp-stats" data-count={items.length}>
      {items.map((item, i) => (
        <div key={i} className="bp-stat">
          <dd className="bp-stat-value">{item.value}</dd>
          <dt className="bp-stat-label">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export interface FootnoteEntry {
  id: string;
  children: ReactNode;
}

/** End-of-article footnote list with backlinks to each reference. */
export function Footnotes({ notes }: { notes: FootnoteEntry[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="bp-footnotes" aria-label="Footnotes">
      <ol className="bp-footnotes-list">
        {notes.map((note) => (
          <li key={note.id} id={`fn-${note.id}`} className="bp-footnote">
            <div className="bp-footnote-body">{note.children}</div>{" "}
            <a
              className="bp-fn-back"
              href={`#fnref-${note.id}`}
              aria-label={`Back to reference ${note.id}`}
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Allowlisted video embed (YouTube nocookie / Vimeo); anything else is a link. */
export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const parsed = parseVideoEmbed(url);
  if (!parsed) {
    const href = safeHref(url);
    return (
      <p className="bp-p">
        {href ? (
          <a className="bp-link" href={href} rel="noopener noreferrer">
            {url}
          </a>
        ) : (
          url
        )}
      </p>
    );
  }
  return (
    <div className="bp-embed">
      <iframe
        className="bp-embed-iframe"
        src={videoEmbedSrc(parsed)}
        title={title ?? "Embedded video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="bp-table-wrap">
      <table className="bp-table">
        <thead>
          <tr>
            {headers.map((cell, i) => (
              <th key={i}>{renderInline(parseInline(cell))}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{renderInline(parseInline(cell))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { ContentBlock };
