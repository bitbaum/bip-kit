import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeColorWith, resolveThemePreference } from "../dist/react/mermaid.js";

/**
 * The canvas color normalization is what keeps oklch()/lab() design tokens
 * from blowing up Mermaid's legacy color parser (it throws inside
 * initialize(), before render()'s .catch(), blanking every diagram). Real
 * canvas needs a browser; the conversion LOGIC is pure over an injected
 * { fillStyle } context, so it is tested here against a fake that mimics the
 * spec'd semantics: assigning a parseable color stores its normalized form,
 * assigning garbage leaves fillStyle untouched.
 */

function fakeCtx(parse) {
  let stored = "#000000";
  return {
    get fillStyle() {
      return stored;
    },
    set fillStyle(v) {
      const parsed = parse(v);
      if (parsed !== null) stored = parsed;
    },
  };
}

// A browser-ish parser: legacy hex passes through, one modern form maps to
// its sRGB equivalent, everything else is rejected (setter no-op).
const browserish = (v) => {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (v === "oklch(0.9491 0 0)") return "#f0f0f0";
  if (v === "lab(95.36 0 0)") return "#f2f2f2";
  if (v === "rgb(38, 38, 42)") return "#26262a";
  return null;
};

test("modern CSS color forms normalize through the context's own parser", () => {
  assert.equal(normalizeColorWith(fakeCtx(browserish), "oklch(0.9491 0 0)", "#fb"), "#f0f0f0");
  assert.equal(normalizeColorWith(fakeCtx(browserish), "lab(95.36 0 0)", "#fb"), "#f2f2f2");
  assert.equal(normalizeColorWith(fakeCtx(browserish), "rgb(38, 38, 42)", "#fb"), "#26262a");
});

test("a value the parser rejects yields the fallback, never the sentinel", () => {
  assert.equal(normalizeColorWith(fakeCtx(browserish), "not-a-color", "#fallback"), "#fallback");
  assert.equal(normalizeColorWith(fakeCtx(browserish), "", "#fallback"), "#fallback");
});

test("an input that IS the sentinel color is returned, not mistaken for a rejection", () => {
  assert.equal(normalizeColorWith(fakeCtx(browserish), "#010203", "#fb"), "#010203");
});

test("no context (jsdom without node-canvas returns null) yields the fallback", () => {
  assert.equal(normalizeColorWith(null, "oklch(0.5 0 0)", "#fb"), "#fb");
});

test("a context that throws on assignment yields the fallback", () => {
  const throwing = {
    get fillStyle() {
      return "#000000";
    },
    set fillStyle(_) {
      throw new Error("boom");
    },
  };
  assert.equal(normalizeColorWith(throwing, "red", "#fb"), "#fb");
});

test("a non-string readback (gradient/pattern) yields the fallback", () => {
  const gradienty = {
    get fillStyle() {
      return { addColorStop() {} };
    },
    set fillStyle(_) {},
  };
  assert.equal(normalizeColorWith(gradienty, "red", "#fb"), "#fb");
});

/** Theme detection: data-theme attr wins, then class, then the OS. */

const classes = (...names) => ({ contains: (t) => names.includes(t) });

test("explicit data-theme wins over class and OS", () => {
  assert.equal(
    resolveThemePreference({ dataTheme: "dark", classList: classes("light"), systemDark: false }),
    true,
  );
  assert.equal(
    resolveThemePreference({ dataTheme: "light", classList: classes("dark"), systemDark: true }),
    false,
  );
});

test("a light/dark class (next-themes attribute=class, Tailwind .dark) is honored", () => {
  assert.equal(
    resolveThemePreference({ dataTheme: null, classList: classes("dark"), systemDark: false }),
    true,
  );
  assert.equal(
    resolveThemePreference({ dataTheme: null, classList: classes("light"), systemDark: true }),
    false,
  );
});

test("unknown data-theme values fall through to the class signal", () => {
  assert.equal(
    resolveThemePreference({ dataTheme: "sepia", classList: classes("dark"), systemDark: false }),
    true,
  );
});

test("with no explicit signal, the OS preference decides", () => {
  assert.equal(
    resolveThemePreference({ dataTheme: null, classList: classes(), systemDark: true }),
    true,
  );
  assert.equal(
    resolveThemePreference({ dataTheme: null, classList: classes(), systemDark: false }),
    false,
  );
});
