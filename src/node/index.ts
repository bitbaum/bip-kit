/**
 * bip-kit/node — the filesystem half: read a folder of markdown files as a
 * collection. Kept off the main entry so the parser stays isomorphic (it also
 * runs in the browser, e.g. in a live preview).
 */
export { readCollection, readEntry } from "./collection.js";
export type { CollectionEntry, CollectionOptions } from "./collection.js";
