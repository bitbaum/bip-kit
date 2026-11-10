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
