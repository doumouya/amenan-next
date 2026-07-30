// LeftPanel — Figma `shell/LeftPanel`, node 27:13, states `expanded` | `retracted`.
// DONOR ConsoleChrome.tsx › ObjectRailRegion.
//
// FIGMA SPEC (the substance, kept because it is the part that stops the next person undoing it):
//
//   "The left region, ALWAYS present — an unfilled body shows EmptyRegion, never a collapse.
//    Two states, and `retracted` is a STATE, not a separate component (that is what the old
//    RegionStrip was, and splitting it meant two places to get the same chrome wrong).
//    Retract is a double-arrow INSIDE the panel, at the panel's OUTER edge, persisted to
//    localStorage dc-objrail. Both panels fold toward the frame edge nearest their own control.
//    Width is bound to --object-rail-w; the strip is 40px. NO title: the rail's said 'Objects',
//    which its own content already says. The body is a SLOT. A Figma instance cannot take
//    arbitrary children, so the consumer swaps the slot or covers it — this is the one place the
//    Figma shape and the React shape differ, and the React side is `<LeftPanel>{rail}</LeftPanel>`."
//
// Two consequences that are easy to lose:
//
//  · ONE COMPONENT, TWO STATES. The strip is rendered from here, by an early return, not by a
//    sibling component the consumer chooses between. That is the whole reason the state lives in
//    the type rather than in the consumer's JSX: a second component is a second place to get the
//    border, the ground and the arrow direction wrong, and it drifted exactly that way once.
//  · NO TITLE, and no rule under the header either — a title bar needs an underline to read as a
//    bar, and that underline is a border INSIDE a region. The chevron IS the header.
//
// PLATFORM-TIER DEVIATIONS from the donor — each one a parameter-or-leak call:
//  · `t("shell.rail.…")` → `labels`, an object with English defaults. An i18n KEY is app-owned
//    namespace; a platform component that reaches into it cannot be dropped into a second app.
//  · `id="dc-object-rail"` → an optional `id` prop, no default. Nothing in the donor referenced
//    that id; a `dc-` literal baked into the platform tier is a leak with no payer.
//  · The RETRACT PREFERENCE stays with the consumer, under the consumer's own storage key (the
//    donor's was `dc-objrail`; a second app picks its own). This panel is controlled — `state` +
//    `onToggle` — exactly as the donor's was, and the donor's persistence lived in a shell
//    component that is not in the Figma roster. Contrast theme/theme.ts, which DOES persist:
//    the theme has to be restored before first paint, before any consumer module exists, so there
//    is no consumer seam early enough to own it. That is the whole line — pre-paint or app tier.

import type { ReactNode } from "react";
import { Symbol } from "./Symbol";
import { EmptyRegion } from "./EmptyRegion";

export type LeftPanelState = "expanded" | "retracted";

export interface LeftPanelLabels {
  expand: string;
  collapse: string;
  empty: string;
  emptyHint: string;
}

export const DEFAULT_LEFT_PANEL_LABELS: LeftPanelLabels = {
  expand: "Show objects",
  collapse: "Hide objects",
  empty: "No objects here",
  emptyHint: "This surface publishes no rail",
};

/** the empty-state glyph — a documented default, overridable; must be in the glyph census */
export const LEFT_PANEL_EMPTY_ICON = "widgets";

export interface LeftPanelProps {
  state: LeftPanelState;
  onToggle: () => void;
  /**
   * The <md drawer axis, orthogonal to `state` and NOT modelled in Figma (the design file carries
   * the two desktop states only). Below md the panel is an off-canvas drawer, so the desktop
   * retract preference is ignored there — a retract preference is meaningless where the panel is
   * closed by default.
   */
  sheetOpen?: boolean;
  /** the body SLOT — `<LeftPanel>{rail}</LeftPanel>`. Absent → EmptyRegion, never a collapse. */
  children?: ReactNode;
  labels?: Partial<LeftPanelLabels>;
  emptyIcon?: string;
  /** e.g. for a consumer's `aria-controls` on a drawer opener; no default, no `dc-` literal */
  id?: string;
}

export function LeftPanel({
  state,
  onToggle,
  sheetOpen = false,
  children,
  labels,
  emptyIcon = LEFT_PANEL_EMPTY_ICON,
  id,
}: LeftPanelProps) {
  const l = { ...DEFAULT_LEFT_PANEL_LABELS, ...labels };

  // desktop-retracted → a thin strip carrying the reopen double-arrow. Below md the panel is a
  // drawer, so the strip is hidden there rather than stacked beside it.
  if (state === "retracted") {
    return (
      <button
        id={id}
        onClick={onToggle}
        title={l.expand}
        aria-label={l.expand}
        aria-expanded={false}
        className="flex h-full w-10 shrink-0 cursor-pointer flex-col items-center border-r border-rule bg-bg pt-2 text-dim hover:text-ink max-md:hidden"
      >
        <Symbol name="keyboard_double_arrow_right" size="1.25rem" />
      </button>
    );
  }

  return (
    <aside
      id={id}
      className={`flex w-[var(--object-rail-w)] shrink-0 flex-col overflow-hidden border-r border-rule bg-bg transition-transform duration-150 ease-[var(--ease)] max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[var(--z-side-panel)] max-md:w-[var(--context-w)] max-md:shadow-dialog ${
        sheetOpen ? "" : "max-md:-translate-x-full"
      }`}
    >
      {/* A CENTRED CORNER CLUSTER, and no title — see the header note above. */}
      <div className="flex items-center justify-center p-1">
        <button
          onClick={onToggle}
          title={l.collapse}
          aria-label={l.collapse}
          aria-expanded
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-ink max-md:hidden"
        >
          <Symbol name="keyboard_double_arrow_left" size="1.25rem" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children ?? <EmptyRegion icon={emptyIcon} label={l.empty} hint={l.emptyHint} />}
      </div>
    </aside>
  );
}
