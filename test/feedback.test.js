import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  roadmapItemId,
  changelogEntryId,
  screenText,
  similarity,
  findSimilar,
  SIMILAR_AT,
  wilson,
  memoryStore,
  createFeedbackHandler,
  VOTER_HEADER,
} from "../dist/index.js";

const VOTER_A = "voter-aaaaaaaaaaaaaaaa";
const VOTER_B = "voter-bbbbbbbbbbbbbbbb";

describe("target ids", () => {
  test("an explicit id wins, so translations share one tally", () => {
    assert.equal(roadmapItemId({ id: "teams", title: "Heidi für Teams" }), "roadmap:teams");
    assert.equal(roadmapItemId({ id: "teams", title: "Heidi for Teams" }), "roadmap:teams");
  });
  test("without one, the title's slug — in any script", () => {
    assert.equal(roadmapItemId({ title: "Dark mode" }), "roadmap:dark-mode");
    assert.equal(roadmapItemId({ title: "Тёмная тема" }), "roadmap:тёмная-тема");
    assert.equal(
      changelogEntryId({ date: "2026-09-25", title: "Streaks" }),
      "changelog:2026-09-25:streaks",
    );
  });
});

describe("screening", () => {
  test("normal text passes, trimmed and with runs of spaces collapsed", () => {
    assert.deepEqual(screenText("  Please   add a dark mode \n"), {
      ok: true,
      text: "Please add a dark mode",
    });
  });
  test("criticism is feedback, not spam", () => {
    assert.equal(screenText("This is useless, remove it.").ok, true);
  });
  for (const [input, reason] of [
    [undefined, "empty"],
    ["   ", "empty"],
    ["ok", "too-short"],
    ["x".repeat(1001), "too-long"],
    ["buy https://a.example and https://b.example", "links"],
    ["cheap pills at pills.xyz and meds.top", "links"],
    ["aaaaaaaaaaaaaaaa", "flood"],
    ["!!! ??? 123", "flood"],
  ]) {
    test(`refuses ${JSON.stringify(String(input).slice(0, 30))} as ${reason}`, () => {
      assert.deepEqual(screenText(input), { ok: false, reason });
    });
  }
  test("one link is allowed, to cite something", () => {
    assert.equal(screenText("Like this: https://example.com/feature").ok, true);
  });
});

describe("similarity — the cases the threshold was chosen on", () => {
  const same = [
    ["Dark mode please", "Please add a dark mode"],
    ["Offline mode", "An offline mode for the train"],
    ["Bitte einen Dunkelmodus", "Dunkelmodus bitte!"],
    ["Тёмная тема", "Добавьте тёмную тему, пожалуйста"],
    ["Dark mode", "Please add a dark mode for reading at night"],
  ];
  const different = [
    ["Dark mode", "Offline mode"],
    ["Dunkelmodus", "Offline-Modus"],
    ["More Bernese German", "Export my progress as PDF"],
    ["Please add a dark mode", "Please add an export"],
    ["Bitte einen Dunkelmodus", "Bitte einen Export"],
  ];
  for (const [a, b] of same) {
    test(`same request: "${a}" ~ "${b}"`, () =>
      assert.ok(similarity(a, b) >= SIMILAR_AT, String(similarity(a, b))));
  }
  for (const [a, b] of different) {
    test(`different: "${a}" vs "${b}"`, () =>
      assert.ok(similarity(a, b) < SIMILAR_AT, String(similarity(a, b))));
  }
  test("order does not matter, and empty text matches nothing", () => {
    assert.equal(similarity("mode dark", "dark mode"), 1);
    assert.equal(similarity("please add", "dark mode"), 0, "filler alone matches nothing");
    assert.equal(similarity("", "dark mode"), 0);
  });
  test("findSimilar returns the closest first, capped", () => {
    const s = (id, body, support = 1) => ({ id, body, createdAt: "2026-01-01T00:00:00Z", support });
    const found = findSimilar("dark mode please", [
      s("1", "Offline mode"),
      s("2", "Dark mode"),
      s("3", "Please, dark mode", 5),
      s("4", "Night mode"),
    ]);
    // Equal scores: the one more people back comes first. Unrelated ones are out.
    assert.deepEqual(
      found.map((f) => f.id),
      ["3", "2"],
    );
  });
});

describe("ranking", () => {
  test("280 of 300 outranks 3 of 3", () => assert.ok(wilson(280, 20) > wilson(3, 0)));
  test("no votes rank zero, and more agreement ranks higher", () => {
    assert.equal(wilson(0, 0), 0);
    assert.ok(wilson(10, 0) > wilson(10, 5));
  });
});

describe("the handler", () => {
  const targets = new Set(["roadmap:teams", "changelog:2026-09-25:streaks"]);
  const setup = (opts = {}) => {
    const store = memoryStore();
    return {
      store,
      ...createFeedbackHandler({ store, isTarget: (id) => targets.has(id), ...opts }),
    };
  };
  const post = (body, voter = VOTER_A) =>
    new Request("https://x.test/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", ...(voter ? { [VOTER_HEADER]: voter } : {}) },
      body: JSON.stringify(body),
    });
  const get = (qs, voter = VOTER_A) =>
    new Request(`https://x.test/api/feedback?${qs}`, {
      headers: voter ? { [VOTER_HEADER]: voter } : {},
    });

  test("one stance per voter: a second replaces the first, null withdraws", async () => {
    const h = setup();
    await h.POST(post({ action: "stance", targetId: "roadmap:teams", stance: "needed" }));
    await h.POST(post({ action: "stance", targetId: "roadmap:teams", stance: "needed" }, VOTER_B));
    let res = await (
      await h.POST(post({ action: "stance", targetId: "roadmap:teams", stance: "not-needed" }))
    ).json();
    assert.deepEqual(res.tally, { needed: 1, notNeeded: 1, comments: 0 });
    res = await (
      await h.POST(post({ action: "stance", targetId: "roadmap:teams", stance: null }))
    ).json();
    assert.deepEqual(res.tally, { needed: 1, notNeeded: 0, comments: 0 });
    const read = await (await h.GET(get("ids=roadmap:teams,roadmap:invented", VOTER_B))).json();
    assert.deepEqual(read.mine, { "roadmap:teams": "needed" });
    assert.deepEqual(
      Object.keys(read.tallies),
      ["roadmap:teams"],
      "unknown ids are dropped, not created",
    );
  });

  test("ids outside this product are refused", async () => {
    const h = setup();
    const res = await h.POST(
      post({ action: "stance", targetId: "roadmap:anything", stance: "needed" }),
    );
    assert.equal(res.status, 404);
  });

  test("a vote needs a voter key", async () => {
    const h = setup();
    const res = await h.POST(
      post({ action: "stance", targetId: "roadmap:teams", stance: "needed" }, null),
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "no-voter");
  });

  test("comments are screened, stored, counted and listed", async () => {
    const h = setup();
    assert.equal(
      (
        await h.POST(
          post({ action: "comment", targetId: "changelog:2026-09-25:streaks", body: "a" }),
        )
      ).status,
      400,
    );
    const res = await h.POST(
      post({ action: "comment", targetId: "changelog:2026-09-25:streaks", body: " Love it " }),
    );
    assert.equal(res.status, 201);
    const list = await (await h.GET(get("comments=changelog:2026-09-25:streaks"))).json();
    assert.deepEqual(
      list.comments.map((c) => c.body),
      ["Love it"],
    );
    const t = await (await h.GET(get("ids=changelog:2026-09-25:streaks"))).json();
    assert.equal(t.tallies["changelog:2026-09-25:streaks"].comments, 1);
  });

  test("a honeypot submission succeeds and stores nothing", async () => {
    const h = setup();
    const res = await h.POST(
      post({ action: "suggest", body: "Great site visit my shop", website: "http://spam" }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await h.store.suggestions(10), []);
  });

  test("a near-duplicate suggestion is offered the existing one; support is once per voter", async () => {
    const h = setup();
    const first = await (
      await h.POST(post({ action: "suggest", body: "Please add a dark mode" }))
    ).json();
    const again = await (
      await h.POST(post({ action: "suggest", body: "dark mode please" }, VOTER_B))
    ).json();
    assert.equal(again.duplicates[0].id, first.suggestion.id);

    await h.POST(post({ action: "support", suggestionId: first.suggestion.id }, VOTER_B));
    await h.POST(post({ action: "support", suggestionId: first.suggestion.id }, VOTER_B));
    const forced = await h.POST(
      post({ action: "suggest", body: "dark mode please", force: true }, VOTER_B),
    );
    assert.equal(forced.status, 201);

    const list = await (await h.GET(get("suggestions=1"))).json();
    assert.deepEqual(
      list.suggestions.map((s) => s.support),
      [2, 1],
    );
    assert.equal((await h.POST(post({ action: "support", suggestionId: "nope" }))).status, 404);
  });

  test("the product's rate limit answers 429 before anything is stored", async () => {
    const h = setup({ allow: (_req, action) => action !== "suggest" });
    const res = await h.POST(post({ action: "suggest", body: "Something new entirely" }));
    assert.equal(res.status, 429);
    assert.deepEqual(await h.store.suggestions(10), []);
  });

  test("garbage bodies and actions are refused", async () => {
    const h = setup();
    const raw = new Request("https://x.test", {
      method: "POST",
      headers: { [VOTER_HEADER]: VOTER_A },
      body: "{",
    });
    assert.equal((await h.POST(raw)).status, 400);
    assert.equal((await h.POST(post({ action: "delete-everything" }))).status, 400);
  });
});
