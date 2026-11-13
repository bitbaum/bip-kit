import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { ShareRow } from "../dist/react/index.js";
import { crossPostUrl } from "../dist/index.js";

const post = { url: "https://solon.example/blog/t", title: "A & B", summary: "S." };

test("ShareRow renders server-side with no navigator, cross-post first", () => {
  assert.equal(typeof globalThis.navigator?.share, "undefined");
  const href = crossPostUrl("https://oc.example/articles/new", `${post.url}/article.json`);
  const html = renderToString(
    h(ShareRow, { ...post, crossPost: { href, label: "Post on OrangeCat" } }),
  );
  assert.match(html, /<nav[^>]*aria-label="Share this post"/);
  const first = html.indexOf("Post on OrangeCat");
  assert.ok(first > 0);
  for (const later of ["Copy link", "Share on X", "Email it"]) {
    assert.ok(html.indexOf(later) > first, `${later} comes after the cross-post`);
  }
  assert.equal((html.match(/bp-share-primary/g) ?? []).length, 1, "one primary action");
  assert.doesNotMatch(html, /Share…/, "the share sheet button waits for the browser to offer one");
});

test("ShareRow links open in a new tab safely, mail stays in place, exclude drops ids", () => {
  const html = renderToString(h(ShareRow, { ...post, exclude: ["hackernews"] }));
  assert.doesNotMatch(html, /Hacker News/);
  assert.doesNotMatch(html, /bp-share-primary/, "no cross-post, no primary");
  const anchors = html.match(/<a [^>]*>/g);
  assert.equal(anchors.length, 6);
  for (const a of anchors) {
    if (a.includes("mailto:")) assert.doesNotMatch(a, /target=/);
    else
      assert.match(
        a,
        /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/,
      );
  }
});

test("ShareRow takes the app's words", () => {
  const html = renderToString(
    h(ShareRow, { ...post, labels: { landmark: "Teilen", copy: "Link kopieren" } }),
  );
  assert.match(html, /aria-label="Teilen"/);
  assert.match(html, /Link kopieren/);
});

test("ShareRow cross-post can act in place: a button, not a link", () => {
  const html = renderToString(
    h(ShareRow, { ...post, crossPost: { label: "Repost on OrangeCat", onClick: () => {} } }),
  );
  assert.match(html, /<button[^>]*bp-share-primary[^>]*>Repost on OrangeCat<\/button>/);
  assert.doesNotMatch(html, /<a[^>]*bp-share-primary/);
});

test("ShareRow cross-post link can stay in the same tab", () => {
  const html = renderToString(
    h(ShareRow, { ...post, crossPost: { label: "Post here", href: "/share", newTab: false } }),
  );
  const primary = html.match(/<a[^>]*bp-share-primary[^>]*>/)[0];
  assert.doesNotMatch(primary, /target=/);
});

test("ShareRow for restricted content offers only the cross-post and Copy link, and says why", () => {
  const html = renderToString(
    h(ShareRow, {
      ...post,
      audience: "restricted",
      crossPost: { label: "Repost on OrangeCat", onClick: () => {} },
    }),
  );
  assert.match(html, /Copy link/);
  assert.match(html, /Repost on OrangeCat/);
  assert.doesNotMatch(html, /data-share=/);
  assert.match(html, /Only people who can already see this can open the link\./);
});
