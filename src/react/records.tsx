import type { ElementType, ReactNode } from "react";
import type { ChangelogEntry, ChangelogTag, RoadmapDoc } from "../types.js";
import { safeHref } from "./inline.js";

export interface RoadmapDocumentProps {
  doc: RoadmapDoc;
  /** Heading level when the page already supplies its own title. */
  headingLevel?: 2 | 3 | 4;
  /** Keep the product's existing page header and render only roadmap buckets. */
  showHeader?: boolean;
  /** Optional locale tag applied to the authored document. */
  lang?: string;
  className?: string;
  /** Resolve product-local essay paths through the host router when needed. */
  essayHref?: (href: string) => string;
  essayLink?: (href: string, label: string) => ReactNode;
}

/** Render the typed roadmap contract without imposing product copy or routes. */
export function RoadmapDocument({
  doc,
  headingLevel = 2,
  showHeader = true,
  lang,
  className,
  essayHref = (href) => href,
  essayLink,
}: RoadmapDocumentProps) {
  const Heading = `h${headingLevel}` as ElementType;
  const BucketHeading = `h${headingLevel + 1}` as ElementType;
  const ItemHeading = `h${Math.min(6, headingLevel + 2)}` as ElementType;
  return (
    <article className={["bp-roadmap", className].filter(Boolean).join(" ")} lang={lang}>
      {showHeader ? (
        <header className="bp-roadmap-header">
          <p className="bp-record-eyebrow">{doc.eyebrow}</p>
          <Heading>{doc.title}</Heading>
          <p className="bp-record-lede">{doc.lede}</p>
        </header>
      ) : null}
      <div className="bp-roadmap-buckets">
        {doc.buckets.map((bucket, bucketIndex) => {
          const headingId = `bp-roadmap-bucket-${bucketIndex}`;
          return (
            <section
              className="bp-roadmap-bucket"
              key={`${bucket.title}-${bucketIndex}`}
              aria-labelledby={headingId}
            >
              <BucketHeading id={headingId}>{bucket.title}</BucketHeading>
              <p className="bp-roadmap-summary">{bucket.summary}</p>
              <ul className="bp-roadmap-items">
                {bucket.items.map((item, itemIndex) => (
                  <li className="bp-roadmap-item" key={item.id ?? `${item.title}-${itemIndex}`}>
                    <ItemHeading>{item.title}</ItemHeading>
                    <p>{item.line}</p>
                    {item.details?.length ? (
                      <ul className="bp-roadmap-details">
                        {item.details.map((detail, detailIndex) => (
                          <li key={`${detailIndex}-${detail}`}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.essay && safeHref(essayHref(item.essay.href)) ? (
                      essayLink ? (
                        essayLink(safeHref(essayHref(item.essay.href))!, item.essay.label)
                      ) : (
                        <a className="bp-record-link" href={safeHref(essayHref(item.essay.href))!}>
                          {item.essay.label}
                        </a>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </article>
  );
}

export interface ChangelogDocumentProps {
  entries: ChangelogEntry[];
  lang?: string;
  className?: string;
  formatDate?: (isoDate: string) => string;
  tagLabels?: Partial<Record<ChangelogTag, string>>;
}

const defaultTagLabels: Record<ChangelogTag, string> = {
  feature: "Feature",
  improvement: "Improvement",
  fix: "Fix",
  platform: "Platform",
  breaking: "Breaking change",
};

/** Render the typed user-facing changelog contract, preserving machine dates. */
export function ChangelogDocument({
  entries,
  lang,
  className,
  formatDate = (date) => date,
  tagLabels = {},
}: ChangelogDocumentProps) {
  const labels = { ...defaultTagLabels, ...tagLabels };
  return (
    <ol className={["bp-changelog", className].filter(Boolean).join(" ")} lang={lang}>
      {entries.map((entry, index) => (
        <li
          className="bp-changelog-entry"
          key={entry.id ?? `${entry.date}-${entry.title}-${index}`}
        >
          <div className="bp-changelog-meta">
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            <span className="bp-changelog-tag">{labels[entry.tag]}</span>
          </div>
          <h2>{entry.title}</h2>
          <p>{entry.summary}</p>
          {entry.items?.length ? (
            <ul className="bp-changelog-items">
              {entry.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
