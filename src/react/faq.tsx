import type { FaqSection } from "../faq.js";
import { faqJsonLd } from "../faq.js";
import { ArticleBody, type ArticleBodyComponents } from "./article-body.js";

export interface FaqProps {
  sections: FaqSection[];
  /** Emit schema.org FAQPage data next to the list (default true). */
  structuredData?: boolean;
  components?: ArticleBodyComponents;
  className?: string;
}

/**
 * Questions as native `<details>`: keyboard- and screen-reader-accessible,
 * searchable with the browser's find, and no client JavaScript. Each question
 * keeps its id, so `/faq#do-i-need-an-account` lands on that question (and
 * highlights it via `:target`).
 */
export async function Faq({ sections, structuredData = true, components, className }: FaqProps) {
  const bodies = await Promise.all(
    sections.map((s) =>
      Promise.all(
        s.items.map((item) => ArticleBody({ blocks: item.blocks, components, lightbox: false })),
      ),
    ),
  );

  return (
    <div className={["bp-faq", className].filter(Boolean).join(" ")}>
      {sections.map((section, si) => (
        <section key={section.id ?? si} className="bp-faq-section">
          {section.title && (
            <h2 id={section.id ?? undefined} className="bp-faq-section-title">
              {section.title}
            </h2>
          )}
          {section.items.map((item, ii) => (
            <details key={item.id} id={item.id} className="bp-faq-item">
              <summary className="bp-faq-question">{item.question}</summary>
              <div className="bp-faq-answer">{bodies[si][ii]}</div>
            </details>
          ))}
        </section>
      ))}
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd(sections)).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </div>
  );
}
