"use client";

// RailStyleForm — the inline create/EDIT form, numu1's add-form anatomy (Em's 2026-08-01 ruling:
// "less clicks — name, icon and colour at the same time"). ONE in-flow session:
//
//   [glyph button] [name input] [✓]
//   [the 8 swatches · reset]            ← ALWAYS visible — colour is one click, never a popover trip
//   [the glyph grid]                    ← expands inline when the glyph button is toggled
//
// This SUPERSEDED RailStylePopover (deleted): the popover flow cost a round-trip per axis and
// anchored badly at the rail's left edge. The swatch classes remain a LITERAL array (the
// ResultChart FILL lesson: `bg-chart-${n}` compiles to nothing) and every emit is a token NAME.
//
// The caller owns the semantics: `onStyle` fires per pick (live-applied when editing a stored
// row, accumulated when creating), `onCommit(name)` on Enter/✓, `onCancel` on Esc. Leaving the
// form (focus containment — swatches and grid are INSIDE, so a hop to them never reads as
// leaving) commits when `commitOnLeave` (edit: numu1's rename-on-blur) and cancels otherwise
// (create: a stray click must not mint a row).

import { useRef, useState } from "react";
import { renderMaterialGlyph, Symbol, type GlyphRenderer } from "./Symbol";
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

export interface RailStyleFormLabels {
  save: string;
  reset: string;
  glyph: (name: string) => string;
  colour: (token: string) => string;
}

export const DEFAULT_RAIL_STYLE_LABELS: RailStyleFormLabels = {
  save: "Save",
  reset: "Reset style",
  glyph: (name) => `Icon ${name}`,
  colour: (token) => `Colour ${token}`,
};

export interface RailStyleFormProps {
  /** absent → a CREATE form (empty input); present → an EDIT form prefilled */
  initialName?: string;
  /** doubles as the input's accessible name */
  placeholder: string;
  /** the live preview mark (the caller resolves fallbacks) */
  glyph: string;
  /** the current colour as a token NAME — drives the bar preview and the active swatch */
  colourToken?: string;
  /** the glyph button's accessible name (the caller's style label) */
  styleTitle: string;
  glyphs?: readonly string[];
  renderGlyph?: GlyphRenderer;
  /** project-level forms indent to the member column */
  indent?: boolean;
  /** leaving the form commits (edit) instead of cancelling (create) */
  commitOnLeave?: boolean;
  /**
   * Declared, not detected (the tree's law): a consumer without style handlers gets a plain
   * NAME form — no swatches, no grid, the mark inert — never controls that silently no-op.
   */
  styleOn?: boolean;
  labels?: Partial<RailStyleFormLabels>;
  onStyle: (style: RailRowStyle | null) => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export function RailStyleForm({
  initialName,
  placeholder,
  glyph,
  colourToken,
  styleTitle,
  glyphs = DEFAULT_STYLE_GLYPHS,
  renderGlyph = renderMaterialGlyph,
  indent = false,
  commitOnLeave = false,
  styleOn = true,
  labels,
  onStyle,
  onCommit,
  onCancel,
}: RailStyleFormProps) {
  const l = { ...DEFAULT_RAIL_STYLE_LABELS, ...labels };
  const [pickerOpen, setPickerOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      ref={boxRef}
      className={`flex flex-col gap-1 rounded-md bg-surface-2 p-1.5 ${indent ? "ml-4" : ""}`}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && boxRef.current?.contains(to)) return;
        if (commitOnLeave) onCommit(inputRef.current?.value ?? "");
        else onCancel();
      }}
    >
      <div className="flex items-center gap-1.5">
        {colourToken && (
          <span
            aria-hidden
            className="h-4 w-0.5 shrink-0 rounded-full"
            // presentation of a token NAME — what travels through onStyle stays the name
            style={{ background: `var(--${colourToken})` }}
          />
        )}
        {styleOn ? (
          <button
            type="button"
            title={styleTitle}
            aria-label={styleTitle}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-dim hover:bg-hover hover:text-ink"
          >
            <span className="flex">{renderGlyph(glyph, "1.125rem")}</span>
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center text-dim">
            {renderGlyph(glyph, "1.125rem")}
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus
          defaultValue={initialName}
          aria-label={placeholder}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(e.currentTarget.value);
            else if (e.key === "Escape") onCancel();
          }}
          className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-1 text-body-md text-ink outline-none placeholder:text-mute"
        />
        <button
          type="button"
          title={l.save}
          aria-label={l.save}
          onClick={() => onCommit(inputRef.current?.value ?? "")}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-dim hover:bg-hover hover:text-ink"
        >
          <Symbol name="check" size="1rem" />
        </button>
      </div>

      {/* the always-visible colour line — the numu1 gesture the popover flow lost */}
      {styleOn && (
      <div className="flex items-center gap-1">
        {SWATCHES.map(([token, cls]) => (
          <button
            key={token}
            type="button"
            title={l.colour(token)}
            aria-label={l.colour(token)}
            aria-pressed={colourToken === token}
            onClick={() => onStyle({ colour: token })}
            className={`flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-hover ${
              colourToken === token ? "bg-hover" : ""
            }`}
          >
            <span aria-hidden className={`size-4 rounded-full ${cls}`} />
          </button>
        ))}
        <button
          type="button"
          aria-label={l.reset}
          title={l.reset}
          onClick={() => onStyle(null)}
          className="ml-auto cursor-pointer rounded-md px-1.5 py-0.5 text-label-md text-mute hover:bg-hover hover:text-ink"
        >
          {l.reset}
        </button>
      </div>
      )}

      {/* the inline glyph grid — numu1's pickslot; a pick keeps the form open for the next axis */}
      {styleOn && pickerOpen && (
        <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto">
          {glyphs.map((name) => (
            <button
              key={name}
              type="button"
              title={l.glyph(name)}
              aria-label={l.glyph(name)}
              onClick={() => {
                onStyle({ glyph: name });
                setPickerOpen(false);
              }}
              className="group flex size-8 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-hover hover:text-ink"
            >
              <span className="flex transition-transform duration-[var(--fast)] group-hover:scale-110 group-active:scale-90">
                {renderGlyph(name, "1.125rem")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
