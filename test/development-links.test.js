import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { linkDevelopment, readRefs } from "../dist/index.js";
import { DevelopmentPage } from "../dist/react/index.js";

const profile = {
  slug: "oc",
  name: "OrangeCat",
  what: null,
  roadmap: [
    {
      title: "Events, end to end {#events}",
      status: "in progress",
      progress: null,
      targetDate: null,
      milestones: [
        { title: "Tickets and the door {#event-tickets}", done: true },
        { title: "Pay the crew {#crew-pay}", done: true },
        { title: "Cover pictures {#event-cover}", done: false },
        { title: "Ticked long ago, never linked", done: true },
      ],
      source: null,
    },
    {
      title: "Already shipped",
      status: "done",
      progress: null,
      targetDate: null,
      milestones: [],
      source: null,
    },
  ],
  changelog: [
    { date: "2026-10-05", done: "Tickets with a QR code {#event-tickets}\nUnrelated fix (#1240)" },
    {
      date: "2026-10-07",
      done: "Organizers pay the crew in one click {#crew-pay}\nThe events plan is written up {#events}\nTypo ref {#crew-pya}",
    },
  ],
};

test("readRefs takes out {#id} tokens and leaves pull-request numbers alone", () => {
  assert.deepEqual(readRefs("Pay the crew {#crew-pay}"), {
    text: "Pay the crew",
    refs: ["crew-pay"],
  });
  assert.deepEqual(readRefs("Fix (#1240) {#1240}"), { text: "Fix (#1240) {#1240}", refs: [] });
  assert.deepEqual(readRefs("Two {#a} {#b} {#a}").refs, ["a", "b"]);
});

test("a milestone knows the changelog lines that delivered it, and a line knows what it advanced", () => {
  const linked = linkDevelopment(profile);
  const events = linked.goals[0];
  assert.equal(events.id, "events");
  assert.equal(events.anchor, "goal-events");
  assert.equal(events.title, "Events, end to end");
  assert.equal(events.steps[1].title, "Pay the crew");
  assert.deepEqual(events.steps[1].deliveredIn, [
    {
      date: "2026-10-07",
      anchor: "change-2026-10-07",
      line: "Organizers pay the crew in one click",
    },
  ]);
  // The goal gathers every line citing it or any of its steps, oldest first.
  assert.deepEqual(
    events.deliveredIn.map((c) => c.date),
    ["2026-10-05", "2026-10-07", "2026-10-07"],
  );
  assert.equal(events.firstDate, "2026-10-05");
  assert.equal(events.lastDate, "2026-10-07");

  assert.equal(linked.changes[0].date, "2026-10-07", "newest first");
  const [pay, plan] = linked.changes[0].lines;
  assert.deepEqual(pay.advances, [
    {
      goal: "Events, end to end",
      goalAnchor: "goal-events",
      step: "Pay the crew",
      stepAnchor: "step-crew-pay",
      done: true,
    },
  ]);
  assert.equal(plan.advances[0].step, null, "a line may cite the goal itself");
  assert.equal(linked.changes[1].lines[1].text, "Unrelated fix (#1240)");
});

test("typos and unrecorded milestones are surfaced, not hidden", () => {
  const linked = linkDevelopment(profile);
  assert.deepEqual(linked.danglingRefs, ["crew-pya"]);
  assert.deepEqual(linked.unrecordedSteps, [
    { goal: "Events, end to end", step: "Ticked long ago, never linked" },
  ]);
});

test("the journey counts ticked steps on the road and goals shipped", () => {
  const { journey, goals } = linkDevelopment(profile);
  assert.equal(journey.now.length, 1);
  assert.equal(journey.shipped.length, 1);
  assert.equal(journey.stepsDone, 3);
  assert.equal(journey.stepsTotal, 4);
  assert.equal(journey.percentShipped, 50);
  assert.equal(goals[0].percent, 75);
  assert.equal(goals[0].nextStep, "Cover pictures");
});

test("the pages link both ways and never print the tokens", () => {
  const roadmap = renderToStaticMarkup(
    createElement(DevelopmentPage, { profile, section: "roadmap", profileHref: "/p" }),
  );
  assert.match(roadmap, /id="step-crew-pay"/);
  assert.match(roadmap, /href="\/changelog#change-2026-10-07"/);
  assert.doesNotMatch(roadmap, /\{#/);

  const changelog = renderToStaticMarkup(
    createElement(DevelopmentPage, { profile, section: "changelog", profileHref: "/p" }),
  );
  assert.match(changelog, /id="change-2026-10-07"/);
  assert.match(changelog, /href="\/roadmap#step-crew-pay"/);
  assert.match(changelog, /href="\/roadmap#goal-events"/);
  assert.doesNotMatch(changelog, /\{#/);
});
