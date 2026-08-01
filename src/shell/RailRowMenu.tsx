"use client";

// RailRowMenu — the ONE per-row overflow menu (2026-08-01, the rail UX round). A row used to
// carry up to six hover-revealed action icons — ~144px of reserved space on a 256px rail, and
// unreachable on touch, where `group-hover` never fires. Now every secondary action lives behind
// a single `more_horiz` trigger and the name gets the room back.
//
// Same shape as RailStylePopover on purpose: ONE instance mounted at the end of the tree's
// <nav>, driven by a `{kind, id, anchor}` state — a popover per row would be markup for nothing.
// The ITEMS are built by RailTree from the live row (so pin/unpin reads the current state); this
// component only knows how to draw a list and close itself before an item acts.

import type { RefObject } from "react";
import { Popover } from "./Popover";
import { Symbol } from "./Symbol";

export interface RailRowMenuItem {
  glyph: string;
  label: string;
  onClick: () => void;
}

export interface RailRowMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** the menu's accessible name — normally the trigger's own label */
  label: string;
  items: RailRowMenuItem[];
}

export function RailRowMenu({ open, onClose, anchorRef, label, items }: RailRowMenuProps) {
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} direction="down">
      <div role="menu" aria-label={label} className="flex min-w-40 flex-col">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            aria-label={it.label}
            onClick={() => {
              // close FIRST: an item that opens something else (the style door) anchors to the
              // trigger that opened this menu, and two stacked popovers is a bug, not a feature
              onClose();
              it.onClick();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm text-dim hover:bg-hover hover:text-ink"
          >
            <Symbol name={it.glyph} size="1.125rem" />
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
