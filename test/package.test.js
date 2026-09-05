import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Consume the package the way npm does.
 *
 * Every other test in this repo imports `../dist/index.js` by relative path,
 * which never touches the `exports` map or the `files` allowlist — the two
 * things a real consumer resolves through. A subpath missing from `exports`, a
 * `types` path pointing at a file that was never built, or a `files` list that
 * forgets `dist` all ship green under a relative import. The first witness
 * would be whoever runs `npm install`.
 *
 * So: pack the real tarball, unpack it as `node_modules/bip-kit`, and import
 * it by bare specifier from outside the repo.
 */

const PUBLIC_API = [
  "parseContentBlocks",
  "parseFrontmatter",
  "parseInline",
  "parseChartSpec",
  "slugify",
  "createSlugger",
  "extractToc",
  "readingTime",
  "parseVideoEmbed",
  "videoEmbedSrc",
];

const REACT_API = [
  "ArticleBody",
  "Figure",
  "Gallery",
  "Callout",
  "PullQuote",
  "Stats",
  "Footnotes",
  "CodeBlock",
  "Chart",
  "Toc",
  "ReadingProgress",
  "Lightbox",
  "VideoEmbed",
];

let workspace;
let installed;
let probe;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), "bip-kit-pack-"));
  installed = join(workspace, "node_modules", "bip-kit");
  mkdirSync(installed, { recursive: true });

  execFileSync("npm", ["pack", "--silent", "--pack-destination", workspace], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "inherit"],
  });
  const tarball = readdirSync(workspace).find((f) => f.endsWith(".tgz"));
  assert.ok(tarball, "npm pack produced no tarball");

  execFileSync("tar", ["-xzf", join(workspace, tarball), "-C", installed, "--strip-components=1"]);

  // Each probe records failure as a *value*, never a throw. A broken exports map
  // that crashes this hook would fail every assertion in the file at once and
  // bury which entry point actually broke.
  // The react subpath imports react/jsx-runtime — give the probe workspace the
  // same react install this repo tests against.
  for (const dep of ["react", "react-dom"]) {
    symlinkSync(
      realpathSync(join(process.cwd(), "node_modules", dep)),
      join(workspace, "node_modules", dep),
      "dir",
    );
  }

  writeFileSync(
    join(workspace, "probe.mjs"),
    [
      "const out = {};",
      'try { out.resolved = import.meta.resolve("bip-kit"); } catch { out.resolved = null; }',
      'try { out.exports = Object.keys(await import("bip-kit")).sort(); } catch { out.exports = null; }',
      'try { out.reactExports = Object.keys(await import("bip-kit/react")).sort(); } catch { out.reactExports = null; }',
      'try { out.mermaidExports = Object.keys(await import("bip-kit/react/mermaid")).sort(); } catch { out.mermaidExports = null; }',
      'try { out.stylesResolved = import.meta.resolve("bip-kit/styles.css"); } catch { out.stylesResolved = null; }',
      "console.log(JSON.stringify(out));",
    ].join("\n"),
  );

  probe = JSON.parse(
    execFileSync("node", [join(workspace, "probe.mjs")], {
      cwd: workspace,
      encoding: "utf8",
    }),
  );
});

test("the package resolves from a consumer install", () => {
  assert.ok(probe.resolved, '"bip-kit" did not resolve through its own exports map');
});

test("the entry point exposes its whole public API", () => {
  assert.ok(probe.exports, 'importing "bip-kit" from a consumer install threw');
  for (const name of PUBLIC_API) {
    assert.ok(probe.exports.includes(name), `"${name}" is missing from the published entry point`);
  }
});

test("the type declarations it advertises are actually in the tarball", () => {
  const pkg = JSON.parse(
    execFileSync("node", ["-p", 'JSON.stringify(require("./package.json"))'], {
      cwd: installed,
      encoding: "utf8",
    }),
  );
  const types = pkg.exports["."].types;
  assert.ok(
    existsSync(join(installed, types)),
    `the package advertises types at ${types}, which is not in the tarball`,
  );
});

test("the tarball carries the documentation npm will render", () => {
  for (const file of ["README.md", "LICENSE"]) {
    assert.ok(existsSync(join(installed, file)), `${file} is missing from the tarball`);
  }
});

test("the tarball ships built output, not raw TypeScript sources", () => {
  assert.ok(existsSync(join(installed, "dist", "index.js")), "dist/index.js missing");
  assert.ok(!existsSync(join(installed, "src")), "src/ leaked into the tarball");
});

test("the react subpath exposes the renderer API from a consumer install", () => {
  assert.ok(probe.reactExports, 'importing "bip-kit/react" from a consumer install threw');
  for (const name of REACT_API) {
    assert.ok(probe.reactExports.includes(name), `"${name}" is missing from bip-kit/react`);
  }
});

test("the mermaid island lives on its own subpath", () => {
  assert.ok(probe.mermaidExports, 'importing "bip-kit/react/mermaid" threw');
  assert.ok(probe.mermaidExports.includes("MermaidBlock"), "MermaidBlock missing");
});

test("styles.css is exported and shipped in the tarball", () => {
  assert.ok(probe.stylesResolved, '"bip-kit/styles.css" did not resolve');
  assert.ok(existsSync(join(installed, "styles.css")), "styles.css missing from the tarball");
});
