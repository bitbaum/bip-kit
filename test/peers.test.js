import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPeer, setPeerLoader } from "../dist/react/peers.js";

/**
 * The optional-peer loader prefers a consumer-registered importer (a literal
 * `() => import("shiki")` that bundlers and Next.js output tracing can see)
 * and falls back to a bundler-invisible Function-import. Every failure mode
 * becomes null — the degrade path, never a crash.
 *
 * Order matters: the registered-loader map is module state, so the
 * fallback-path test runs BEFORE anything registers a loader.
 */

test("without a registered loader, the Function-import fallback resolves an installed peer", async () => {
  const shiki = await loadPeer("shiki");
  assert.ok(shiki, "expected the shiki devDependency to load via the fallback");
  assert.equal(typeof shiki.codeToHtml, "function");
});

test("a registered loader wins over the fallback", async () => {
  const marker = { codeToHtml: () => "" };
  setPeerLoader("shiki", async () => marker);
  assert.equal(await loadPeer("shiki"), marker);
});

test("a rejecting registered loader (peer not installed) returns null, never throws", async () => {
  setPeerLoader("shiki", () => import("bipkit-definitely-not-installed"));
  assert.equal(await loadPeer("shiki"), null);
});

test("a synchronously-throwing loader also returns null", async () => {
  setPeerLoader("shiki", () => {
    throw new Error("boom");
  });
  assert.equal(await loadPeer("shiki"), null);
});

test("BIPKIT_DISABLE_PEERS short-circuits without calling the registered loader", async () => {
  const prev = process.env.BIPKIT_DISABLE_PEERS;
  try {
    let called = false;
    setPeerLoader("shiki", async () => {
      called = true;
      return {};
    });
    process.env.BIPKIT_DISABLE_PEERS = "shiki";
    assert.equal(await loadPeer("shiki"), null);
    assert.equal(called, false);
    // The other peer is unaffected by a shiki-only disable.
    setPeerLoader("katex", async () => ({ ok: 1 }));
    assert.deepEqual(await loadPeer("katex"), { ok: 1 });
    // "all" disables every peer.
    process.env.BIPKIT_DISABLE_PEERS = "all";
    assert.equal(await loadPeer("katex"), null);
  } finally {
    if (prev === undefined) delete process.env.BIPKIT_DISABLE_PEERS;
    else process.env.BIPKIT_DISABLE_PEERS = prev;
  }
});
