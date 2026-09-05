"use client";

import { useEffect, useState } from "react";
import type { TocEntry } from "../types.js";

/**
 * Sticky table of contents with scroll-spy. Hidden under `minEntries`
 * headings (default 3 — evig's rule: a two-line TOC is noise).
 */
export function Toc({
  items,
  title = "On this page",
  minEntries = 3,
}: {
  items: TocEntry[];
  title?: string;
  minEntries?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const enabled = items.length >= minEntries;

  useEffect(() => {
    if (!enabled) return;
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // The active heading is the last one above the reading line (30% down).
    const pick = () => {
      const line = window.innerHeight * 0.3;
      let current: string | null = headings[0].id;
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    };

    let frame = 0;
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          pick();
        });
      }
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, items]);

  if (!enabled) return null;

  return (
    <nav className="bp-toc" aria-label="Table of contents">
      <p className="bp-toc-title">{title}</p>
      <ul className="bp-toc-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`bp-toc-item bp-toc-item--l${item.level}${
              active === item.id ? " bp-toc-item--active" : ""
            }`}
          >
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
