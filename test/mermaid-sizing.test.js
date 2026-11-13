import { test } from "node:test";
import assert from "node:assert/strict";
import { diagramMinWidth, mermaidConfig } from "../dist/react/mermaid.js";

/**
 * Diagram text size. On a 390px phone a 1,000px-wide sequence diagram was
 * scaled to fit the column and its labels came out at 4–5px against 17px body
 * text (measured on orangecat.ch). The sizing logic is pure; the browser part
 * only feeds it the viewBox width and the two resolved font sizes.
 */

test("a narrow diagram is never constrained", () => {
  assert.equal(diagramMinWidth({ viewBoxWidth: 120, fontSize: 15, minFontSize: 12.75 }), 102);
});

test("a wide diagram shrinks only until its labels reach the floor", () => {
  // 15px labels, 12.75px floor: it may be drawn at 85% and no smaller.
  const min = diagramMinWidth({ viewBoxWidth: 1000, fontSize: 15, minFontSize: 12.75 });
  assert.equal(min, 850);
  assert.ok((min / 1000) * 15 >= 12.75, "labels drawn at the minimum width stay at the floor");
});

test("a floor at or above the label size forbids any shrinking, never enlarges", () => {
  assert.equal(diagramMinWidth({ viewBoxWidth: 640, fontSize: 12, minFontSize: 16 }), 640);
});

test("an unmeasurable diagram gets no min-width rather than NaN", () => {
  assert.equal(diagramMinWidth({ viewBoxWidth: 0, fontSize: 15, minFontSize: 12 }), 0);
  assert.equal(diagramMinWidth({ viewBoxWidth: Number.NaN, fontSize: 15, minFontSize: 12 }), 0);
  assert.equal(diagramMinWidth({ viewBoxWidth: 500, fontSize: 0, minFontSize: 12 }), 0);
});

test("the label size reaches flowcharts and sequence diagrams alike", () => {
  const config = mermaidConfig({ dark: false, fontSize: 15.75 });
  assert.equal(config.fontSize, 15.75);
  assert.equal(config.themeVariables.fontSize, "15.75px");
  assert.deepEqual(config.sequence, {
    actorFontSize: 15.75,
    messageFontSize: 15.75,
    noteFontSize: 15.75,
  });
  assert.equal(config.theme, "default");
  assert.equal(mermaidConfig({ dark: true, fontSize: 15 }).theme, "dark");
});

test("labels are measured in the face they are drawn in", () => {
  const face = 'Inter, "Inter Fallback", system-ui, sans-serif';
  const config = mermaidConfig({ dark: false, fontSize: 15, fontFamily: face });
  assert.equal(config.fontFamily, face);
  assert.equal(config.themeVariables.fontFamily, face);
  assert.equal(mermaidConfig({ dark: false, fontSize: 15 }).fontFamily, "inherit");
});

test("theme colors pass through beside the size", () => {
  const config = mermaidConfig({
    dark: false,
    fontSize: 15,
    themeVariables: { primaryColor: "#f4f4f2" },
  });
  assert.equal(config.themeVariables.primaryColor, "#f4f4f2");
});
