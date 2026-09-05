"use client";

import { useEffect, useRef, useState } from "react";

/** Copy-to-clipboard affordance for code blocks. Tiny, dependency-free. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className="bp-copy"
      aria-label="Copy code to clipboard"
      data-copied={copied || undefined}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => {
            /* clipboard unavailable (permissions, http) — do nothing */
          });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
