import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedArticle, crossPostUrl, absolutizeLinks } from "../dist/index.js";

test("sharedArticle carries title, excerpt, author and canonical", () => {
  const { article } = sharedArticle(
    { title: " A post ", body: "Hello.\n", summary: "Short.", author: "Cato" },
    "https://solon.example/blog/a-post",
  );
  assert.deepEqual(article, {
    title: "A post",
    body: "Hello.",
    excerpt: "Short.",
    canonical: "https://solon.example/blog/a-post",
    author: "Cato",
  });
});

test("sharedArticle makes root-relative links absolute against the canonical origin", () => {
  const { article } = sharedArticle(
    {
      title: "T",
      body: "See [the roadmap](/roadmap#time) and [x](//cdn.example/y) and [y](https://a.example/).",
    },
    "https://solon.example/blog/t",
  );
  assert.equal(
    article.body,
    "See [the roadmap](https://solon.example/roadmap#time) and [x](//cdn.example/y) and [y](https://a.example/).",
  );
});

test("sharedArticle without canonical leaves links and omits empty fields", () => {
  const { article } = sharedArticle({ title: "T", body: "[r](/r)", author: null });
  assert.deepEqual(article, { title: "T", body: "[r](/r)" });
});

test("sharedArticle rejects a canonical that is not a URL", () => {
  assert.throws(() => sharedArticle({ title: "T", body: "b" }, "not a url"));
});

test("absolutizeLinks handles href attributes and a trailing slash on the origin", () => {
  assert.equal(
    absolutizeLinks('<a href="/x">x</a>', "https://s.example/"),
    '<a href="https://s.example/x">x</a>',
  );
});

test("crossPostUrl encodes the article URL and the optional project", () => {
  const url = new URL(
    crossPostUrl(
      "https://oc.example/articles/new",
      "https://solon.example/blog/t/article.json?x=1",
      "solon",
    ),
  );
  assert.equal(url.origin + url.pathname, "https://oc.example/articles/new");
  assert.equal(url.searchParams.get("import"), "https://solon.example/blog/t/article.json?x=1");
  assert.equal(url.searchParams.get("project"), "solon");
  assert.equal(
    new URL(
      crossPostUrl("https://oc.example/articles/new", "https://s.example/a.json"),
    ).searchParams.has("project"),
    false,
  );
});

// ── shareLinks ────────────────────────────────────────────────────────

import { shareLinks, defaultShareLinkLabels } from "../dist/index.js";

const tricky = {
  url: "https://solon.example/blog/a&b?x=1&y=2#part",
  title: 'Zürich & "Genève" #1 — ça va?',
  summary: "Short & sweet.",
};

test("shareLinks returns the services in order, each with a verb label", () => {
  const links = shareLinks(tricky);
  assert.deepEqual(
    links.map((l) => l.id),
    ["x", "linkedin", "bluesky", "hackernews", "whatsapp", "telegram", "email"],
  );
  for (const link of links) {
    assert.equal(link.label, defaultShareLinkLabels[link.id]);
    assert.match(link.label, /^(Share|Submit|Send|Email)\b/);
  }
});

test("every shareLinks href parses and carries the encoded url (and title where it has one)", () => {
  const encUrl = encodeURIComponent(tricky.url);
  const encTitle = encodeURIComponent(tricky.title);
  for (const link of shareLinks(tricky)) {
    const parsed = new URL(link.href);
    assert.ok(parsed.protocol === "https:" || parsed.protocol === "mailto:", link.id);
    assert.ok(link.href.includes(encUrl), `${link.id} lacks the encoded url`);
    if (link.id !== "linkedin") {
      assert.ok(link.href.includes(encTitle), `${link.id} lacks the encoded title`);
    }
    // Nothing raw leaks into the query: the post's own # and & stay encoded.
    assert.equal(parsed.hash, "", `${link.id} has a stray fragment`);
  }
});

test("special characters round-trip through each service's parameters", () => {
  const by = Object.fromEntries(shareLinks(tricky).map((l) => [l.id, new URL(l.href)]));
  assert.equal(by.x.searchParams.get("text"), tricky.title);
  assert.equal(by.x.searchParams.get("url"), tricky.url);
  assert.equal(by.linkedin.searchParams.get("url"), tricky.url);
  assert.equal(by.bluesky.searchParams.get("text"), `${tricky.title} ${tricky.url}`);
  assert.equal(by.hackernews.searchParams.get("u"), tricky.url);
  assert.equal(by.hackernews.searchParams.get("t"), tricky.title);
  assert.equal(by.whatsapp.searchParams.get("text"), `${tricky.title} ${tricky.url}`);
  assert.equal(by.telegram.searchParams.get("url"), tricky.url);
  assert.equal(by.telegram.searchParams.get("text"), tricky.title);
});

test("email is a mailto with subject and body, spaces as %20 not +", () => {
  const email = shareLinks(tricky).find((l) => l.id === "email");
  assert.ok(email.href.startsWith("mailto:?"));
  assert.ok(!email.href.includes("+"), "a + in a mailto body is a literal plus to mail clients");
  const query = email.href.slice("mailto:?".length);
  const params = Object.fromEntries(
    query.split("&").map((pair) => pair.split("=").map(decodeURIComponent)),
  );
  assert.equal(params.subject, tricky.title);
  assert.equal(params.body, `${tricky.summary}\n\n${tricky.url}`);
});

test("shareLinks takes the app's labels and rejects a relative url", () => {
  const links = shareLinks({
    url: "https://s.example/p",
    title: "T",
    labels: { x: "Auf X teilen" },
  });
  assert.equal(links[0].label, "Auf X teilen");
  assert.equal(links[1].label, "Share on LinkedIn");
  assert.throws(() => shareLinks({ url: "/blog/p", title: "T" }), /absolute URL/);
});
