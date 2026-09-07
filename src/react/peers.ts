/**
 * Optional-peer loading (shiki, katex — server side).
 *
 * Resolution order per peer:
 *   1. A loader registered by the consumer (`setPeerLoader` /
 *      `setHighlighterLoader`) — a literal `() => import("shiki")` written in
 *      the CONSUMER's code, where bundlers can resolve it and Next.js output
 *      tracing can copy the package into `output: "standalone"` deploys.
 *   2. Last-resort fallback: a `new Function`-hidden dynamic import. Hidden
 *      from bundlers on purpose — webpack/turbopack fail a build on an
 *      unresolvable import, even a dynamic one (verified against turbopack:
 *      a bare `import("shiki")` here breaks every consumer WITHOUT shiki).
 *      Node resolves it normally at runtime, so tests, scripts, and deploys
 *      that keep node_modules on disk work with zero setup — but it is
 *      invisible to Next's file tracer, so standalone deploys need step 1.
 *
 * When a peer is missing, callers degrade gracefully — nothing throws.
 *
 * Test seam: BIPKIT_DISABLE_PEERS="shiki,katex" (or "all") forces the
 * missing-peer path — it wins over registered loaders and the `highlighter`
 * prop alike, and is checked per load, not at import time.
 */

export type OptionalPeer = "shiki" | "katex";
export type PeerImporter = () => Promise<unknown>;

const loaders = new Map<OptionalPeer, PeerImporter>();

/**
 * Register how a peer should be imported. Call once at module scope in your
 * app with a literal import so your bundler and Next's file tracer see it:
 *
 *   setPeerLoader("shiki", () => import("shiki"));
 */
export function setPeerLoader(name: OptionalPeer, importer: PeerImporter): void {
  loaders.set(name, importer);
}

const dynamicImport = new Function("s", "return import(s)") as (
  specifier: string,
) => Promise<unknown>;

export function peerDisabled(name: OptionalPeer): boolean {
  const raw = typeof process !== "undefined" ? (process.env.BIPKIT_DISABLE_PEERS ?? "") : "";
  const disabled = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return disabled.has("all") || disabled.has(name);
}

export async function loadPeer(name: OptionalPeer): Promise<unknown | null> {
  if (peerDisabled(name)) return null;
  const importer = loaders.get(name);
  try {
    return importer ? await importer() : await dynamicImport(name);
  } catch {
    return null;
  }
}
