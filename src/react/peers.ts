/**
 * Optional-peer loading (shiki, katex — server side).
 *
 * The import is hidden from bundlers on purpose: webpack/turbopack fail a
 * build on an unresolvable import, even a dynamic one, and these packages
 * are OPTIONAL peers. `new Function` keeps them out of static analysis while
 * Node resolves them normally at runtime. When a peer is missing, callers
 * degrade gracefully — nothing throws.
 *
 * Test seam: BIPKIT_DISABLE_PEERS="shiki,katex" (or "all") forces the
 * missing-peer path even when the package is installed.
 */

const dynamicImport = new Function("s", "return import(s)") as (
  specifier: string,
) => Promise<unknown>;

export type OptionalPeer = "shiki" | "katex";

function disabledPeers(): Set<string> {
  const raw = typeof process !== "undefined" ? (process.env.BIPKIT_DISABLE_PEERS ?? "") : "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function loadPeer(name: OptionalPeer): Promise<unknown | null> {
  const disabled = disabledPeers();
  if (disabled.has("all") || disabled.has(name)) return null;
  try {
    return await dynamicImport(name);
  } catch {
    return null;
  }
}
