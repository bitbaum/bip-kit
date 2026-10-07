import type { ReactNode } from "react";
import type { Advance, LinkedGoal } from "../development-links.js";
import { safeHref } from "./inline.js";

export const developmentLinkLabels = {
  deliveredIn: "Delivered in",
  advances: "Advanced",
  trail: "How it got here",
  noRecord: "No changelog entry cites this yet.",
  stepDone: "Done",
  stepOpen: "Not done yet",
};

/** URLs in operator-authored records remain directly checkable; React escapes all other text. */
export function linkedText(text: string): ReactNode {
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

const join = (base: string, anchor: string) => `${safeHref(base) ?? ""}#${anchor}`;

/**
 * A goal's trail: one mark per milestone (filled when done), and under it the
 * dated changelog lines that delivered it, each a link into the changelog.
 * The picture answers "how far along, and by which changes", without numbers
 * the record does not hold.
 */
export function RoadmapTrail({
  goal,
  changelogHref = "/changelog",
  labels: supplied,
}: {
  goal: LinkedGoal;
  changelogHref?: string;
  labels?: Partial<typeof developmentLinkLabels>;
}) {
  const labels = { ...developmentLinkLabels, ...supplied };
  if (goal.steps.length === 0 && goal.deliveredIn.length === 0) return null;
  return (
    <div className="bp-trail">
      {goal.steps.length > 0 && (
        <ol className="bp-trail-steps" aria-label={labels.trail}>
          {goal.steps.map((step, i) => (
            <li
              key={step.anchor ?? i}
              id={step.anchor ?? undefined}
              data-done={step.done === true || undefined}
            >
              <span
                className="bp-trail-mark"
                role="img"
                aria-label={step.done === true ? labels.stepDone : labels.stepOpen}
              />
              <span className="bp-trail-title">{linkedText(step.title)}</span>
              {step.deliveredIn.length > 0 && (
                <span className="bp-trail-cites">
                  {labels.deliveredIn}{" "}
                  {step.deliveredIn.map((c, j) => (
                    <a key={`${c.anchor}-${j}`} href={join(changelogHref, c.anchor)} title={c.line}>
                      <time dateTime={c.date}>{c.date}</time>
                    </a>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Under a changelog line: the roadmap milestones it delivered, as links. */
export function ChangeAdvances({
  advances,
  roadmapHref = "/roadmap",
  labels: supplied,
}: {
  advances: Advance[];
  roadmapHref?: string;
  labels?: Partial<typeof developmentLinkLabels>;
}): ReactNode {
  const labels = { ...developmentLinkLabels, ...supplied };
  if (advances.length === 0) return null;
  return (
    <span className="bp-advances">
      <span className="bp-advances-label">{labels.advances}</span>
      {advances.map((a, i) => (
        <a key={i} href={join(roadmapHref, a.stepAnchor ?? a.goalAnchor)} className="bp-advance">
          {a.goal}
          {a.step && <> · {a.step}</>}
        </a>
      ))}
    </span>
  );
}
