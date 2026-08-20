# Next.js BiP template (stubs)

Drop these under `app/` (or `src/app/`) and replace the placeholders with your brand chrome.

```
app/
  blog/page.tsx          → list posts from content/blog
  blog/[slug]/page.tsx   → parseContentBlocks + your renderer
  roadmap/page.tsx       → RoadmapDoc
  changelog/page.tsx     → ChangelogEntry[]
```

Wire `bip-kit` for parsing. Do not invent a second markdown dialect.

See root README.
