import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Every exported React component declares its return type, and declares it as
// JSX.Element (resolved against the app's own React), never ReactNode.
// - Without a declared type, building from the Git release could fail with
//   TS2883 (0.7.1).
// - With ReactNode, an app on React 18 types rejected the async components
//   (`'ArticleBody' cannot be used as a JSX component`: React 19's ReactNode
//   includes bigint, which React 18's AwaitedReactNode does not), which broke
//   kivvi's build on 0.8.x/0.9.0.
test("exported components return JSX.Element in their published types", () => {
  const dir = new URL("../dist/react/", import.meta.url);
  const offenders = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".d.ts"))) {
    const dts = readFileSync(new URL(file, dir), "utf8");
    for (const m of dts.matchAll(/export declare function ([A-Z]\w*)\([\s\S]*?\):\s*([^;]+);/g)) {
      if (!/^(Promise<)?JSX\.Element( \| null)?>?$/.test(m[2].trim()))
        offenders.push(`${file} ${m[1]}: ${m[2].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});
