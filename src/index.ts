// amenan-next — the house front-end platform tier.
//
// Everything a consumer needs to build the console shell, and nothing it doesn't. What is
// deliberately NOT here: the theme runtime (`amenan-next/theme`, its own entry, because a
// consumer's pre-paint snippet imports it from <head> and must not drag React in) and the CSS
// (imported by path, per the README).
//
// The design lives in Figma — numu › `Components · Shell`, node 13:56. Each component's file
// header carries its node id and the substance of its Figma description, which is the
// specification: it records behaviour paid for in production. Read the header before changing a
// shape.

// ── the five regions (Figma page 13:56) ──────────────────────────────────────────────────────
export { LeftPanel, DEFAULT_LEFT_PANEL_LABELS, LEFT_PANEL_EMPTY_ICON } from "./shell/LeftPanel";
export type { LeftPanelProps, LeftPanelState, LeftPanelLabels } from "./shell/LeftPanel";

export {
  RightPanel,
  nextRightPanelState,
  DEFAULT_RIGHT_PANEL_LABELS,
  RIGHT_PANEL_EMPTY_ICON,
} from "./shell/RightPanel";
export type {
  RightPanelProps,
  RightPanelState,
  RightPanelEvent,
  RightPanelLabels,
} from "./shell/RightPanel";

export { SurfaceHost, SurfaceActiveContext, useSurfaceActive } from "./shell/SurfaceHost";
export type { SurfaceDef } from "./shell/SurfaceHost";

export { Composer, DEFAULT_COMPOSER_LABELS } from "./shell/Composer";
export type { ComposerProps, ComposerLabels } from "./shell/Composer";

export {
  RailTree,
  // the pure helpers: invariant 1 and the two reorder moves, usable (and tested) without a DOM
  orphanProjects,
  sortPinnedFirst,
  reorderChannels,
  moveProject,
  DEFAULT_RAIL_TREE_LABELS,
  DEFAULT_RAIL_GLYPHS,
} from "./shell/RailTree";
export type {
  RailTreeProps,
  RailChannel,
  RailProject,
  RailTreeCapabilities,
  RailTreeHandlers,
  RailTreeLabels,
  RailGlyphs,
} from "./shell/RailTree";

export { EmptyRegion } from "./shell/EmptyRegion";

// ── the icon primitive ───────────────────────────────────────────────────────────────────────
// The code home of the Figma `icon/ms/*` family. Exported because a consumer's own chrome (its
// footer, its surfaces) must render glyphs through the SAME subsetted-font mechanism, or it will
// reach for an svg and fork the icon source of truth.
export { Symbol } from "./shell/Symbol";

// ── the region contract (the surface→shell seam) ─────────────────────────────────────────────
export {
  useConsoleRegions,
  useActiveRegions,
  onContextArrival,
  onContextExpandRequest,
  requestContextExpand,
} from "./lib/regions";
export type { RegionsSpec, ComposerSpec, ComposerAction } from "./lib/regions";

export type { Completion, CompletionItem } from "./lib/completion";
