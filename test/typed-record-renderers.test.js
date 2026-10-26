import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangelogDocument, RoadmapDocument } from "../dist/react/index.js";

const roadmap = {
  eyebrow: "Stand 1. Oktober",
  title: "Was als Nächstes kommt",
  lede: "Eine redaktionelle Aussage.",
  buckets: [
    {
      title: "Als Nächstes",
      summary: "Entschieden und geplant.",
      items: [
        {
          id: "solon-voice",
          title: "Mitreden über Solon",
          line: "Ein Link mit <sicherem> Text.",
          details: ["Auf Wunsch mit eigener Bitcoin-Signatur."],
          essay: { label: "Mehr erfahren", href: "paper#solon" },
        },
      ],
    },
  ],
};

test("typed roadmap renderer preserves authored content, locale and safe host links", () => {
  const links = [];
  const html = renderToStaticMarkup(
    createElement(RoadmapDocument, {
      doc: roadmap,
      lang: "de",
      headingLevel: 2,
      showHeader: false,
      essayHref: (href) => `/de/${href}`,
      essayLink: (href, label) => {
        links.push([href, label]);
        return createElement("a", { className: "host-link", href }, label);
      },
    }),
  );
  assert.match(html, /class="bp-roadmap" lang="de"/);
  assert.match(html, /<h3 id="bp-roadmap-bucket-0">Als Nächstes<\/h3>/);
  assert.match(html, /&lt;sicherem&gt;/);
  assert.match(html, /Auf Wunsch mit eigener Bitcoin-Signatur/);
  assert.match(html, /class="host-link" href="\/de\/paper#solon"/);
  assert.deepEqual(links, [["/de/paper#solon", "Mehr erfahren"]]);
});

test("typed roadmap renderer rejects unsafe essay links and provides a standalone title", () => {
  const html = renderToStaticMarkup(
    createElement(RoadmapDocument, {
      doc: roadmap,
      essayHref: () => "javascript:alert(1)",
    }),
  );
  assert.match(html, /<h2>Was als Nächstes kommt<\/h2>/);
  assert.match(html, /<h3 id="bp-roadmap-bucket-0">/);
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("Mehr erfahren"));
});

test("typed changelog renderer keeps ISO dates and accepts translated labels", () => {
  const html = renderToStaticMarkup(
    createElement(ChangelogDocument, {
      lang: "de",
      entries: [
        {
          id: "mail-recovery",
          date: "2026-10-26",
          tag: "fix",
          title: "Passwort zurücksetzen",
          summary: "Die Anmeldung funktioniert wieder.",
          items: ["Ungültige Tokens bleiben ungültig."],
        },
      ],
      formatDate: () => "26. Oktober 2026",
      tagLabels: { fix: "Fehlerbehebung" },
    }),
  );
  assert.match(html, /class="bp-changelog" lang="de"/);
  assert.match(html, /<time dateTime="2026-10-26">26\. Oktober 2026<\/time>/);
  assert.match(html, /Fehlerbehebung/);
  assert.match(html, /Ungültige Tokens bleiben ungültig/);
});
