import type { DevelopmentProfile } from "../development.js";
import { linkDevelopment } from "../development-links.js";
import { ChangeAdvances, RoadmapTrail, linkedText } from "./development-links.js";
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
  const linked = profile ? linkDevelopment(profile) : null;
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
        linked && linked.goals.length ? (
          <ol className="bp-development-records">
            {linked.goals.map((goal) => (
              <li key={goal.anchor} id={goal.anchor}>
                <h2>{goal.title}</h2>
                <p className="bp-development-meta">
                  {goal.status}
                  {goal.percent !== null && ` · ${goal.percent}% ${labels.progress}`}
                  {goal.targetDate && ` · ${labels.target}: ${goal.targetDate}`}
                </p>
                <RoadmapTrail goal={goal} changelogHref={changelogHref} />
                {goal.source && (
                  <p>
                    <a href={safeHref(goal.source) ?? "#"}>Where this comes from</a>
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>{labels.emptyRoadmap}</p>
        )
      ) : linked && linked.changes.length ? (
        <ol className="bp-development-records">
          {linked.changes.map((change) => (
            <li key={change.anchor} id={change.anchor}>
              <h2>
                <time dateTime={change.date}>{change.date}</time>
              </h2>
              {change.lines.map((line, j) => (
                <p key={j} className="bp-development-entry">
                  {linkedText(line.text)}
                  <ChangeAdvances advances={line.advances} roadmapHref={roadmapHref} />
                </p>
              ))}
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
