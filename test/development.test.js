import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { developmentProfileFromMap, loadDevelopmentProfile } from "../dist/index.js";
import { DevelopmentPage } from "../dist/react/index.js";

const record = {
  slug: "test",
  name: "Example",
  what: "A project",
  privateNotes: "secret",
  roadmap: [
    {
      title: "Read the evidence",
      status: "active",
      progress: 150,
      targetDate: null,
      milestones: ["https://example.com/proof"],
    },
  ],
  changelog: [{ date: "2026-09-16", done: "Fixed <script>alert(1)</script>" }],
};
test("canonical projection selects the project, excludes private fields and bounds progress", () => {
  const p = developmentProfileFromMap({ projects: [record] }, "test");
  assert.equal(p.roadmap[0].progress, 100);
  assert.equal(p.privateNotes, undefined);
  assert.equal(developmentProfileFromMap({ projects: [record] }, "missing"), null);
  assert.equal(
    developmentProfileFromMap(
      { projects: [{ ...record, roadmap: [{ title: "broken" }] }] },
      "test",
    ),
    null,
  );
});
test("remote failure stays unavailable instead of inventing an empty history", async () => {
  assert.equal(
    await loadDevelopmentProfile(
      "https://example.com/map",
      "test",
      async () => new Response("", { status: 503 }),
    ),
    null,
  );
  assert.equal(
    await loadDevelopmentProfile("https://example.com/map", "test", async () => {
      throw new Error("offline");
    }),
    null,
  );
});
test("public rendering escapes record text and exposes source links and active navigation", () => {
  const p = developmentProfileFromMap({ projects: [record] }, "test");
  const roadmap = renderToStaticMarkup(
    createElement(DevelopmentPage, {
      profile: p,
      section: "roadmap",
      profileHref: "https://example.com/profile",
    }),
  );
  assert.match(roadmap, /href="https:\/\/example.com\/proof"/);
  assert.match(roadmap, /aria-current="page"/);
  const changes = renderToStaticMarkup(
    createElement(DevelopmentPage, {
      profile: p,
      section: "changelog",
      profileHref: "javascript:alert(1)",
    }),
  );
  assert.ok(!changes.includes("<script>"));
  assert.ok(!changes.includes('href="javascript:'));
  assert.match(changes, /&lt;script&gt;/);
});
