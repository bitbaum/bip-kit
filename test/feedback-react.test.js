import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { FeedbackProvider, StanceButtons, CommentThread, SuggestBox } from "../dist/react/index.js";

test("the feedback components render inside a provider, with the app's labels", () => {
  const html = renderToString(
    h(
      FeedbackProvider,
      {
        endpoint: "/api/feedback",
        targetIds: ["roadmap:teams"],
        labels: { needed: "Brauche ich" },
      },
      h(StanceButtons, { targetId: "roadmap:teams" }),
      h(CommentThread, { targetId: "roadmap:teams" }),
      h(SuggestBox),
    ),
  );
  assert.match(html, /Brauche ich/);
  assert.match(html, /Not needed/, "an unset label falls back to the default");
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /name="website"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*name="website"/);
});

test("outside a provider it says what is wrong instead of rendering nothing", () => {
  assert.throws(() => renderToString(h(StanceButtons, { targetId: "x" })), /FeedbackProvider/);
});
