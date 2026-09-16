import type { ReactNode } from "react";
import type { DevelopmentProfile } from "../development.js";
import { safeHref } from "./inline.js";

export const developmentLabels = {
  roadmap: "Roadmap",
  changelog: "Changelog",
  home: "Back to the product",
  profile: "Full development profile",
  beta: "Beta — running, not released",
  source:
    "These records come from the canonical project profile. Planned work is not a delivery promise.",
  unavailable: "Development records are temporarily unavailable. Please try again shortly.",
  emptyRoadmap: "No roadmap items have been recorded yet.",
  emptyChangelog: "No changes have been recorded yet.",
  progress: "recorded progress",
  target: "Target",
};

/** URLs in operator-authored records remain directly checkable; React escapes all other text. */
function linkedText(text: string): ReactNode {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) => {
    const href = /^https?:\/\//.test(part) ? safeHref(part) : null;
    return href ? (
      <a key={i} href={href}>
        {part}
      </a>
    ) : (
      part
    );
  });
}

export function DevelopmentPage({
  profile,
  section,
  homeHref = "/",
  profileHref,
  roadmapHref = "/roadmap",
  changelogHref = "/changelog",
  labels: suppliedLabels,
}: {
  profile: DevelopmentProfile | null;
  section: "roadmap" | "changelog";
  homeHref?: string;
  profileHref: string;
  roadmapHref?: string;
  changelogHref?: string;
  labels?: Partial<typeof developmentLabels>;
}) {
  const labels = { ...developmentLabels, ...suppliedLabels };
  return (
    <article className="bp-development">
      <header>
        <a href={safeHref(homeHref) ?? "/"}>{labels.home}</a>
        {profile && <p className="bp-development-name">{profile.name}</p>}
        <h1>{labels[section]}</h1>
        {profile?.what && <p>{profile.what}</p>}
        <p className="bp-development-meta">{labels.beta}</p>
        <nav aria-label={labels.profile}>
          <a
            href={safeHref(roadmapHref) ?? "/roadmap"}
            aria-current={section === "roadmap" ? "page" : undefined}
          >
            {labels.roadmap}
          </a>
          <a
            href={safeHref(changelogHref) ?? "/changelog"}
            aria-current={section === "changelog" ? "page" : undefined}
          >
            {labels.changelog}
          </a>
          <a href={safeHref(profileHref) ?? "#"}>{labels.profile}</a>
        </nav>
      </header>
      {!profile ? (
        <p role="status">{labels.unavailable}</p>
      ) : section === "roadmap" ? (
        profile.roadmap.length ? (
          <ol className="bp-development-records">
            {profile.roadmap.map((item, i) => (
              <li key={`${item.title}-${i}`}>
                <h2>{item.title}</h2>
                <p className="bp-development-meta">
                  {item.status}
                  {item.progress !== null && ` · ${item.progress}% ${labels.progress}`}
                  {item.targetDate && ` · ${labels.target}: ${item.targetDate}`}
                </p>
                {item.milestones.length > 0 && (
                  <ul>
                    {item.milestones.map((m, j) => (
                      <li key={j}>{linkedText(m)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>{labels.emptyRoadmap}</p>
        )
      ) : profile.changelog.length ? (
        <ol className="bp-development-records">
          {profile.changelog.map((item, i) => (
            <li key={`${item.date}-${i}`}>
              <h2>
                <time>{item.date}</time>
              </h2>
              <p className="bp-development-entry">{linkedText(item.done)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>{labels.emptyChangelog}</p>
      )}
      <footer>
        <p className="bp-development-meta">{labels.source}</p>
      </footer>
    </article>
  );
}
