// RightPanel — Figma `shell/RightPanel`, node 27:58, states `docked` | `retracted` | `full`.
// DONOR ConsoleChrome.tsx › ContextRegion.
//
// FIGMA SPEC (the substance — every clause here was paid for in production):
//
//   "The right region, ALWAYS present. THREE states — and full width is this panel's alone; the
//    left panel has no equivalent. docked 320px, = --context-w, which is ALSO the <lg drawer width
//    (one source, deliberately). retracted 40px strip. Retracting hides CONTENT, never CONTROLS —
//    the footer stays. full absolute inset-0 over the surface AND the composer. Esc restores. The
//    retract arrow is present in full width too, and retracting FROM full also drops the expanded
//    state, so the two axes stay mutually exclusive — collapsed wins.
//    AUTO-OPEN is the numu soul: when the active surface publishes a context.key that CHANGED to
//    non-null, the shell un-retracts this panel and slides the <lg sheet in. Never diff by object
//    identity — the spec republishes on every render and a composer keystroke would pop the panel.
//    This panel also hosts the shell's own views (Marketplace · Profile · Settings) and the footer.
//    Precedence: a shell view wins while open; a NEW surface selection clears it; retracting
//    clears it. The close affordance is a CHEVRON, never an ✕ — the sheet slides in from the
//    right, so » pushes it back the way it came. An ✕ reads as 'destroy', and this destroys
//    nothing."
//
// WHERE EACH LAW LIVES NOW
//
//  · "collapsed wins" is enforced STRUCTURALLY here rather than by a patch in the consumer. The
//    donor carried two booleans (`collapsed`, `expanded`), which can express the illegal pair, so
//    ConsoleShell had to remember `if (n) setContextExpanded(false)` inside its toggle. One
//    `state` union cannot express it at all, and `nextRightPanelState` below is the transition
//    table — pure, exported and tested, so the rule stops being a line somebody can forget.
//  · AUTO-OPEN is the `arrive` transition. The key DIFF itself lives in lib/regions.ts at the
//    publish site (only there is attribution certain); this component just answers "what does
//    arrival do to my state": retracted → docked, and it never un-expands. Object identity is
//    useless for that diff — the spec republishes on every render, so a composer keystroke would
//    pop the panel open on every character.
//  · The CHEVRON. There is no ✕ in this file and there must not be one. The sheet came in from
//    the right; » puts it back. Nothing is destroyed by closing this panel, and an ✕ says
//    otherwise to the one user who has not read this comment.
//
// PLATFORM-TIER DEVIATIONS from the donor — parameter-or-leak calls:
//  · `<ConsoleFooter/>` → a `footer` SLOT. ConsoleFooter is NOT in the Figma roster; designing one
//    here would be inventing. The LAW it carries — "retracting hides CONTENT, never CONTROLS" — is
//    kept: the slot renders in `docked` AND in `retracted` (stacked on the strip), and is
//    suppressed in `full`, where a bottom cluster would read as page chrome.
//  · MarketplacePanel / ProfilePanel / SettingsPanel / WarehouseSchema → a `view` SLOT plus
//    `onClearView`. WHICH views exist is the app's business; the PRECEDENCE is not, so it stays
//    here: a shell view wins while open, retracting clears it, and the consumer clears it on
//    context arrival.
//  · `t("shell.context.…")` → `labels`, English defaults. An i18n key is app-owned namespace.
//  · `id="dc-context"` → an optional `id` prop, no default.
//  · localStorage `dc-ctxrail` stays with the consumer — this panel is controlled.

import type { ReactNode } from "react";
import { Symbol } from "./Symbol";
import { EmptyRegion } from "./EmptyRegion";

export type RightPanelState = "docked" | "retracted" | "full";

/**
 * The events the shell can send this panel.
 *
 * `arrive` is the auto-open law's event, not a user gesture: the active surface published a
 * context.key that CHANGED to non-null.
 */
export type RightPanelEvent = "toggleExpand" | "retract" | "reopen" | "arrive" | "escape";

/**
 * THE TRANSITION TABLE — the mutual exclusion of full-width and retracted, in one place.
 *
 * `retract` from ANY state lands on `retracted`, including from `full`: the two axes are mutually
 * exclusive and COLLAPSED WINS. That is why this is a union and not two booleans — the illegal
 * "retracted and expanded" pair is unrepresentable rather than merely avoided.
 *
 * `arrive` un-retracts and stops there. It must never un-expand: a selection arriving while the
 * user is reading the full-width view would yank the panel out from under them.
 */
export function nextRightPanelState(
  state: RightPanelState,
  event: RightPanelEvent,
): RightPanelState {
  switch (event) {
    case "toggleExpand":
      // the expand control is not rendered on the strip, so this is a defensive no-op there
      return state === "docked" ? "full" : state === "full" ? "docked" : state;
    case "retract":
      return "retracted";
    case "reopen":
      return state === "retracted" ? "docked" : state;
    case "arrive":
      return state === "retracted" ? "docked" : state;
    case "escape":
      return state === "full" ? "docked" : state;
  }
}

export interface RightPanelLabels {
  expand: string;
  collapse: string;
  retract: string;
  reopen: string;
  close: string;
  empty: string;
  emptyHint: string;
}

export const DEFAULT_RIGHT_PANEL_LABELS: RightPanelLabels = {
  expand: "Expand to full width",
  collapse: "Leave full width",
  retract: "Hide the panel",
  reopen: "Show the panel",
  close: "Close the panel",
  empty: "Nothing selected",
  // the auto-open promise, in words — see EmptyRegion.tsx
  emptyHint: "Click a row and it opens here",
};

/** the empty-state glyph — a documented default, overridable; must be in the glyph census */
export const RIGHT_PANEL_EMPTY_ICON = "left_panel_open";

export interface RightPanelProps {
  state: RightPanelState;
  /** `nextRightPanelState(state, event)` is the intended reducer — the consumer owns the store */
  onEvent: (event: RightPanelEvent) => void;
  /**
   * The <lg sheet axis, orthogonal to `state` and NOT modelled in Figma. Below lg the panel is a
   * CLOSED-BY-DEFAULT sheet slid in by content arrival, so the desktop retract preference is
   * ignored there.
   */
  sheetOpen?: boolean;
  onSheetClose?: () => void;
  /**
   * The BODY, when the panel shows the active surface's context. Absent (and no `view`) →
   * EmptyRegion, never a collapse.
   */
  children?: ReactNode;
  /**
   * Shown INSTEAD of `children` in `full`. Absent → `children`. This is the room for the richer
   * view a 320px column cannot hold.
   */
  expandedChildren?: ReactNode;
  /**
   * OPTIONAL heading for the body — never a title BAR. A body that names itself (a brand mark, a
   * name, a status chip) passes none; one that cannot (a selected row is just values) passes one.
   * Never both — the duplicate shows.
   */
  title?: ReactNode;
  /**
   * The shell's OWN view (Marketplace · Profile · Settings …). Precedence, and it is not render
   * order: a view the user just asked for WINS over the surface's standing selection. Each such
   * view names itself, so it gets no `title`.
   */
  view?: ReactNode;
  /**
   * Called when retracting or closing while a `view` is up. Rule 3: a view parked behind a 40px
   * strip is a surprise waiting for the next reopen, and the surface's own context is the honest
   * resting state.
   */
  onClearView?: () => void;
  /**
   * The footer SLOT. Rendered in `docked` and in `retracted` (stacked on the strip) — retracting
   * is a request for less CONTENT, never for fewer CONTROLS. Suppressed in `full`.
   */
  footer?: ReactNode;
  labels?: Partial<RightPanelLabels>;
  emptyIcon?: string;
  id?: string;
}

export function RightPanel({
  state,
  onEvent,
  sheetOpen = false,
  onSheetClose,
  children,
  expandedChildren,
  title,
  view,
  onClearView,
  footer,
  labels,
  emptyIcon = RIGHT_PANEL_EMPTY_ICON,
  id,
}: RightPanelProps) {
  const l = { ...DEFAULT_RIGHT_PANEL_LABELS, ...labels };

  // retracting clears the shell view (precedence rule 3), then folds
  const retract = () => {
    onClearView?.();
    onEvent("retract");
  };

  // ── retracted: a 40px strip. Reopen arrow at the top, the FOOTER at the bottom. Below lg this
  //    is a sheet, so a desktop retract preference is ignored there and the strip is hidden.
  if (state === "retracted") {
    return (
      <aside
        id={id}
        className="flex h-full w-10 shrink-0 flex-col items-center border-l border-rule bg-bg max-lg:hidden"
      >
        <button
          onClick={() => onEvent("reopen")}
          title={l.reopen}
          aria-label={l.reopen}
          aria-expanded={false}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center text-dim hover:text-ink"
        >
          <Symbol name="keyboard_double_arrow_left" size="1.25rem" />
        </button>
        {footer && <div className="mt-auto">{footer}</div>}
      </aside>
    );
  }

  const full = state === "full";
  // the sheet axis exists ONLY below lg; desktop layouts are untouched by sheetOpen
  const sheetClosed = sheetOpen ? "" : " max-lg:translate-x-full";

  return (
    <aside
      id={id}
      className={
        full
          ? `absolute inset-0 z-[var(--z-side-panel)] flex flex-col border-l border-rule bg-bg${sheetClosed}`
          : `flex w-[var(--context-w)] shrink-0 flex-col overflow-hidden border-l border-rule bg-bg transition-[width,transform] duration-150 ease-[var(--ease)] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-[var(--z-side-panel)] max-lg:shadow-dialog max-md:order-2${sheetClosed}`
      }
    >
      {/* A CENTRED CLUSTER with no title. The rule under it was a border inside a region; the
          title now renders as the BODY's heading (below), where it reads as what it names rather
          than as a bar. Nothing is lost: "Row 5" / a connector's name is real information. */}
      <div className="flex items-center justify-center gap-1 p-1">
        <button
          onClick={() => onEvent("toggleExpand")}
          title={full ? l.collapse : l.expand}
          aria-label={full ? l.collapse : l.expand}
          aria-pressed={full}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-ink max-lg:hidden"
        >
          <Symbol name={full ? "close_fullscreen" : "open_in_full"} size="1.125rem" />
        </button>
        {/* retract to a strip — shell chrome, present in BOTH docked and full (mirror of the left
            panel). Retracting from full also drops the expansion: collapsed wins. Desktop-only —
            below lg the sheet closes via the chevron / scrim / Esc instead. */}
        <button
          onClick={retract}
          title={l.retract}
          aria-label={l.retract}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-ink max-lg:hidden"
        >
          <Symbol name="keyboard_double_arrow_right" size="1.25rem" />
        </button>
        {/* A CHEVRON, not an ✕ — see the header. Same glyph as the desktop retract, because it is
            the same gesture: push the panel back the way it came in. */}
        <button
          onClick={() => {
            onClearView?.();
            onSheetClose?.();
          }}
          title={l.close}
          aria-label={l.close}
          className="hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-ink max-lg:flex"
        >
          <Symbol name="keyboard_double_arrow_right" size="1.25rem" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {/* THE TWO BODY SOURCES, in precedence order — a shell view the user just asked for wins
            over the surface's standing selection. Each view names itself, so it gets no title. */}
        {view ? (
          <div className={full ? "mx-auto max-w-4xl" : undefined}>{view}</div>
        ) : children ? (
          <div className={full ? "mx-auto max-w-4xl" : undefined}>
            {title != null && (
              <h2 className="truncate px-3 pb-1 text-title-sm text-ink">{title}</h2>
            )}
            {full ? (expandedChildren ?? children) : children}
          </div>
        ) : (
          <EmptyRegion icon={emptyIcon} label={l.empty} hint={l.emptyHint} />
        )}
      </div>

      {/* the footer — only in the DOCKED panel. In full the panel IS the whole console and a
          bottom cluster there would read as page chrome; the <lg bar covers those bands. */}
      {!full && footer && <div className="shrink-0 max-lg:hidden">{footer}</div>}
    </aside>
  );
}
