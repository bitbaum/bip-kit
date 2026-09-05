"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Figure/gallery zoom. SSR renders the trigger only; the overlay mounts on
 * click, closes on click-anywhere or Escape, and locks body scroll while open.
 */
export function Lightbox({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="bp-lightbox-trigger"
        onClick={() => setOpen(true)}
        aria-label={alt ? `Enlarge image: ${alt}` : "Enlarge image"}
      >
        {children}
      </button>
      {open ? (
        <div className="bp-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <img className="bp-lightbox-img" src={src} alt={alt} />
          <button type="button" className="bp-lightbox-close" aria-label="Close">
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
