/**
 * The roadmap and the changelog, read as one record.
 *
 * A roadmap says what is planned; a changelog says what shipped. Read apart,
 * nobody can answer the two questions a visitor actually has: "which change
 * delivered that milestone?" and "which milestone was this change for?".
 *
 * The link is one token, written in the markdown the author already keeps:
 *
 *   ROADMAP.md     - [x] Pay the crew from the event {#crew-pay}
 *   CHANGELOG.md   - Organizers pay each crew member in one click {#crew-pay}
 *
 * The same `{#id}` on a milestone and on a changelog line means "this line
 * delivered (or advanced) that milestone". On a goal heading
 * (`### Events, end to end {#events}`) it names the goal, and a changelog line
 * may cite the goal itself. Ids are lowercase kebab-case and start with a
 * letter, so `(#1240)` pull-request references are never mistaken for one.
 *
 * The token travels inside the strings the fleet map already carries
 * (milestone titles, changelog lines), so nothing upstream changes: every site
 * that renders through bip-kit gets the link, and the token is stripped from
 * what is shown. Pure — no fetch, no React.
 */

import type { DevelopmentProfile } from "./development.js";
import { slugify } from "./slug.js";

const REF = /\s*\{#([a-z][a-z0-9-]{0,63})\}/g;

/** A line of record text with its `{#id}` tokens taken out. */
export function readRefs(text: string): { text: string; refs: string[] } {
  const refs = [...text.matchAll(REF)].map((m) => m[1]);
  return { text: refs.length ? text.replace(REF, "").trim() : text, refs: [...new Set(refs)] };
}

export type JourneyPhase = "shipped" | "now" | "next" | "later";

const PHASES: { phase: JourneyPhase; matches: string[] }[] = [
  { phase: "now", matches: ["in progress", "active", "doing"] },
  { phase: "next", matches: ["planned", "next", "soon"] },
  { phase: "later", matches: ["later", "someday", "future"] },
  { phase: "shipped", matches: ["done", "shipped", "delivered"] },
];

/** The map's status words (from ROADMAP.md's `##` buckets) → where on the road. */
export function phaseOf(status: string | null): JourneyPhase {
  const s = (status ?? "").trim().toLowerCase();
  return PHASES.find((p) => p.matches.includes(s))?.phase ?? "next";
}

/** One changelog line, as cited from the roadmap. */
export interface ChangeRef {
  date: string;
  /** The changelog entry's anchor (`change-2026-10-07`). */
  anchor: string;
  line: string;
}

export interface LinkedStep {
  id: string | null;
  /** `step-<id>` when the milestone has an id; nothing to link to otherwise. */
  anchor: string | null;
  title: string;
  /** Null for a legacy text step, which carries no tick. */
  done: boolean | null;
  /** The changelog lines that cite it, oldest first. */
  deliveredIn: ChangeRef[];
}

export interface LinkedGoal {
  id: string | null;
  /** `goal-<id>`, or `goal-<slug of the title>` when it has no id. */
  anchor: string;
  title: string;
  status: string | null;
  phase: JourneyPhase;
  targetDate: string | null;
  source: string | null;
  steps: LinkedStep[];
  /** Ticked steps, and steps that carry a tick either way. */
  done: number;
  countable: number;
  /** Counts only ticked steps; null when there is nothing to count. */
  percent: number | null;
  nextStep: string | null;
  /** Every changelog line citing the goal or any of its steps, oldest first. */
  deliveredIn: ChangeRef[];
  /** First and last day the changelog shows work on it. */
  firstDate: string | null;
  lastDate: string | null;
}

/** What a changelog line advanced on the roadmap. */
export interface Advance {
  goal: string;
  goalAnchor: string;
  /** Null when the line cites the goal itself. */
  step: string | null;
  stepAnchor: string | null;
  done: boolean | null;
}

export interface LinkedChangeLine {
  text: string;
  advances: Advance[];
}

export interface LinkedChange {
  date: string;
  anchor: string;
  lines: LinkedChangeLine[];
}

export interface LinkedDevelopment {
  goals: LinkedGoal[];
  /** Newest first, as a changelog reads. */
  changes: LinkedChange[];
  /** Ids cited in the changelog that no goal or milestone declares — a typo, or a renamed id. */
  danglingRefs: string[];
  /** Milestones ticked done that no changelog line cites — shipped without a record, or not yet linked. */
  unrecordedSteps: { goal: string; step: string }[];
  journey: {
    shipped: LinkedGoal[];
    now: LinkedGoal[];
    next: LinkedGoal[];
    later: LinkedGoal[];
    /** Across goals still on the road. */
    stepsDone: number;
    stepsTotal: number;
    percentShipped: number;
  };
}

export const changeAnchor = (date: string, n = 0): string =>
  n ? `change-${date}-${n + 1}` : `change-${date}`;

const byDate = (a: ChangeRef, b: ChangeRef) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Read a development profile's roadmap and changelog as one linked record. */
export function linkDevelopment(profile: DevelopmentProfile): LinkedDevelopment {
  const goals: LinkedGoal[] = [];
  const byId = new Map<string, { goal: LinkedGoal; step: LinkedStep | null }>();
  const usedAnchors = new Set<string>();

  for (const item of profile.roadmap) {
    const head = readRefs(item.title);
    const id = head.refs[0] ?? null;
    let anchor = `goal-${id ?? (slugify(head.text) || "item")}`;
    for (let n = 2; usedAnchors.has(anchor); n++) anchor = `goal-${id ?? slugify(head.text)}-${n}`;
    usedAnchors.add(anchor);

    const steps: LinkedStep[] = item.milestones.map((m) => {
      const raw = typeof m === "string" ? m : m.title;
      const read = readRefs(raw);
      const stepId = read.refs[0] ?? null;
      return {
        id: stepId,
        anchor: stepId ? `step-${stepId}` : null,
        title: read.text,
        done: typeof m === "string" ? null : m.done,
        deliveredIn: [],
      };
    });
    const phase = phaseOf(item.status);
    const countable = steps.filter((s) => s.done !== null).length;
    const done = steps.filter((s) => s.done === true).length;
    const goal: LinkedGoal = {
      id,
      anchor,
      title: head.text,
      status: item.status,
      phase,
      targetDate: item.targetDate,
      source: item.source ?? null,
      steps,
      done,
      countable,
      percent:
        phase === "shipped"
          ? 100
          : countable > 0
            ? Math.round((done / countable) * 100)
            : (item.progress ?? null),
      nextStep: steps.find((s) => s.done !== true)?.title ?? null,
      deliveredIn: [],
      firstDate: null,
      lastDate: null,
    };
    goals.push(goal);
    if (id && !byId.has(id)) byId.set(id, { goal, step: null });
    for (const step of steps) {
      if (step.id && !byId.has(step.id)) byId.set(step.id, { goal, step });
    }
  }

  const dangling = new Set<string>();
  const seenDates = new Map<string, number>();
  const changes: LinkedChange[] = [...profile.changelog]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((entry) => {
      const n = seenDates.get(entry.date) ?? 0;
      seenDates.set(entry.date, n + 1);
      const anchor = changeAnchor(entry.date, n);
      const lines = entry.done
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((raw) => {
          const read = readRefs(raw);
          const advances: Advance[] = [];
          for (const ref of read.refs) {
            const hit = byId.get(ref);
            if (!hit) {
              dangling.add(ref);
              continue;
            }
            const cite = { date: entry.date, anchor, line: read.text };
            (hit.step ?? hit.goal).deliveredIn.push(cite);
            if (hit.step) hit.goal.deliveredIn.push(cite);
            advances.push({
              goal: hit.goal.title,
              goalAnchor: hit.goal.anchor,
              step: hit.step?.title ?? null,
              stepAnchor: hit.step?.anchor ?? null,
              done: hit.step ? hit.step.done : null,
            });
          }
          return { text: read.text, advances };
        });
      return { date: entry.date, anchor, lines };
    });

  const unrecordedSteps: LinkedDevelopment["unrecordedSteps"] = [];
  for (const goal of goals) {
    goal.deliveredIn.sort(byDate);
    for (const step of goal.steps) {
      step.deliveredIn.sort(byDate);
      if (step.done === true && step.deliveredIn.length === 0) {
        unrecordedSteps.push({ goal: goal.title, step: step.title });
      }
    }
    goal.firstDate = goal.deliveredIn[0]?.date ?? null;
    goal.lastDate = goal.deliveredIn.at(-1)?.date ?? null;
  }

  const on = (p: JourneyPhase) => goals.filter((g) => g.phase === p);
  const road = goals.filter((g) => g.phase !== "shipped");
  const shipped = on("shipped");
  return {
    goals,
    changes,
    danglingRefs: [...dangling].sort(),
    unrecordedSteps,
    journey: {
      shipped,
      now: on("now"),
      next: on("next"),
      later: on("later"),
      stepsDone: road.reduce((n, g) => n + g.done, 0),
      stepsTotal: road.reduce((n, g) => n + g.countable, 0),
      percentShipped: goals.length ? Math.round((shipped.length / goals.length) * 100) : 0,
    },
  };
}
