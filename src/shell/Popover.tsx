"use client";

// Popover — the ONE anchored floating panel: veil, Esc-on-capture, entrance motion, and a
// position that survives `overflow-hidden` ancestors.
//
// WHY `position: fixed` AND NOT `absolute`: the truncation bug that forced this component. A
// conversation card clips its children to its rounded corners (`overflow-hidden` on the card),
// so an absolutely-positioned panel inside it is CUT at the card's edge the moment it is taller
// than the card — the chart config door lost its whole aspect row that way. A fixed panel
// positions against the viewport and no ancestor clip can touch it. The one caveat, named here
// because it will bite exactly once: a `transform`ed ancestor turns fixed into
// ancestor-relative — keep transforms on leaves (glyphs, chips), never on containers.
//
// Not a portal on purpose: fixed already escapes every clip this tree can produce, and a portal
// would detach the panel from the compositional order the veil relies on.
//
// The veil is the click-away AND the scroll pause: while open, wheel input lands on the veil, so
// the anchor cannot scroll away from under the panel — the position captured at open stays true
// for the panel's whole life.
//
// The entrance rides the motion vocabulary (docs/DESIGN.md): anything that APPEARS fades+scales
// at --entrance. The keyframes live in bridge.css beside the tokens.

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** the trigger; the panel hangs off its edge, right-aligned */
  anchorRef: RefObject<HTMLElement | null>;
  /** which way the panel grows from the anchor */
  direction?: "up" | "down";
  children: ReactNode;
}

export function Popover({ open, onClose, anchorRef, direction = "down", children }: PopoverProps) {
  const [pos, setPos] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(
      direction === "up"
        ? { right, bottom: Math.max(8, window.innerHeight - r.top + 4) }
        : { right, top: Math.min(window.innerHeight - 8, r.bottom + 4) },
    );
  }, [open, direction, anchorRef]);

  // Esc-on-capture: while open, Esc closes THIS and nothing else sees the key (overlays close
  // first — the export's law)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !pos) return null;
  return (
    <>
      {/* click-away: a transparent veil below the panel, above everything else */}
      <div className="fixed inset-0 z-20" aria-hidden onClick={onClose} />
      <div
        style={pos}
        className={`fixed z-30 flex max-h-96 min-w-52 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-bg p-2 shadow-[var(--shadow-popover)] animate-[an-pop_var(--entrance)_ease] ${
          direction === "up" ? "origin-bottom-right" : "origin-top-right"
        }`}
      >
        {children}
      </div>
    </>
  );
}
