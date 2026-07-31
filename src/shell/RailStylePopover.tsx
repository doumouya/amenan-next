"use client";

// RailStylePopover — the ONE row-style picker (the one-interface arc, decision 3): a curated
// glyph grid + the 8 chart tokens as swatches + reset, riding the Popover primitive.
//
// TOKENS ONLY. A pick emits `{ glyph }` or `{ colour: "chart-N" }` — the token's NAME, never a
// CSS value — and reset emits `null`. The consumer stores names and maps to `var(--…)` at render
// time, so a theme switch restyles every picked row for free and no raw colour can enter a
// store. The swatch classes are a LITERAL array (the ResultChart FILL lesson: `bg-chart-${n}`
// compiles to nothing).
//
// The glyph GRID is consumer-curated (`glyphs` prop): which marks make sense is app vocabulary.
// The default list below is deliberately small and generic, and every name in it must be in the
// consumer's census — the same contract as DEFAULT_RAIL_GLYPHS.

import type { RefObject } from "react";
import { Popover } from "./Popover";
import { Symbol } from "./Symbol";
import type { RailRowStyle } from "./RailTree";

/** token name → literal class, in token order — the swatch row IS the chart palette */
const SWATCHES: readonly [string, string][] = [
  ["chart-1", "bg-chart-1"],
  ["chart-2", "bg-chart-2"],
  ["chart-3", "bg-chart-3"],
  ["chart-4", "bg-chart-4"],
  ["chart-5", "bg-chart-5"],
  ["chart-6", "bg-chart-6"],
  ["chart-7", "bg-chart-7"],
  ["chart-8", "bg-chart-8"],
];

/** every name here must be in the consumer's glyph census — override with your own vocabulary */
export const DEFAULT_STYLE_GLYPHS: readonly string[] = [
  "tag",
  "description",
  "push_pin",
  "visibility",
  "check",
  "circle",
];

export interface RailStylePopoverLabels {
  glyphSection: string;
  colourSection: string;
  reset: string;
  glyph: (name: string) => string;
  colour: (token: string) => string;
}

export const DEFAULT_RAIL_STYLE_LABELS: RailStylePopoverLabels = {
  glyphSection: "icon",
  colourSection: "colour",
  reset: "Reset style",
  glyph: (name) => `Icon ${name}`,
  colour: (token) => `Colour ${token}`,
};

export interface RailStylePopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  glyphs?: readonly string[];
  labels?: Partial<RailStylePopoverLabels>;
  /** a partial style to MERGE (`{glyph}` or `{colour}`), or null to reset — the consumer owns the merge */
  onPick: (style: RailRowStyle | null) => void;
}

export function RailStylePopover({
  open,
  onClose,
  anchorRef,
  glyphs = DEFAULT_STYLE_GLYPHS,
  labels,
  onPick,
}: RailStylePopoverProps) {
  const l = { ...DEFAULT_RAIL_STYLE_LABELS, ...labels };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} direction="down">
      <span className="text-label-md text-mute">{l.glyphSection}</span>
      <div className="grid grid-cols-6 gap-1">
        {glyphs.map((name) => (
          <button
            key={name}
            type="button"
            title={l.glyph(name)}
            aria-label={l.glyph(name)}
            onClick={() => onPick({ glyph: name })}
            className="group flex size-8 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-hover hover:text-ink"
          >
            <Symbol
              name={name}
              size="1.125rem"
              className="transition-transform duration-[var(--fast)] group-hover:scale-110 group-active:scale-90"
            />
          </button>
        ))}
      </div>
      <span className="text-label-md text-mute">{l.colourSection}</span>
      <div className="flex items-center gap-1">
        {SWATCHES.map(([token, cls]) => (
          <button
            key={token}
            type="button"
            title={l.colour(token)}
            aria-label={l.colour(token)}
            onClick={() => onPick({ colour: token })}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-hover"
          >
            <span aria-hidden className={`size-4 rounded-full ${cls}`} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={l.reset}
        onClick={() => onPick(null)}
        className="cursor-pointer rounded-md px-2 py-1 text-left text-body-sm text-dim hover:bg-hover hover:text-ink"
      >
        {l.reset}
      </button>
    </Popover>
  );
}
