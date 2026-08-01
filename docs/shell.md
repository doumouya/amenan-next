# Shell — the five-regions-always-present console frame

Read this when building a surface that publishes chrome to the console (left rail, right context panel, composer), or when integrating SurfaceHost into a router.

## Region model

A surface DECLARES the chrome it needs via `useConsoleRegions(spec, active, path?)` (src/lib/regions.ts). LeftPanel, RightPanel and Composer are controlled components — they do not subscribe themselves; the CONSUMER's shell chrome reads the active surface's spec through `useActiveRegions()` (a `useSyncExternalStore` subscription) and feeds them. Only those region renderers subscribe — SurfaceHost never re-renders on a spec change, closing the loop that would cascade to every surface on every keystroke.

The RegionsSpec interface declares the three surface-fed regions: `rail` (the object tree), `context` (the detail panel), `composer` (the query/action bar), each with its empty-state text. The shell's own views (Marketplace, Profile, Settings) and the footer are NOT spec fields — they ride RightPanel's `view` and `footer` props. Every spec field is optional — an unfilled region shows an empty state via EmptyRegion, never a collapse (src/shell/EmptyRegion.tsx). The invariant frame is the law: a console's identity IS its constant chrome.

Context auto-open law: when the active surface publishes `context.key` that CHANGED to non-null, the shell un-retracts the right panel and slides the <lg sheet in (src/lib/regions.ts — the arrival-detection block and `store.set`). Key DIFF lives at the publish site only: `store.set` is gated on `active`, so attribution is certain there, where a renderer-side watcher's is not; per-path last-key memory keeps a kept-alive surface republishing its held old selection from false-popping the panel. An expand request (e.g. "Manage guardrails") calls `requestContextExpand()` — the shell wires it to its own panel state.

## LeftPanel — two states, one component

LeftPanel (src/shell/LeftPanel.tsx, lines 1–24, Figma spec) is ONE component with two states: `expanded` | `retracted`. State "expanded" renders the full panel; state "retracted" is an early return rendering a 40px strip with a reopen chevron — not a sibling component. This structure enforces that borders, backgrounds, and arrow direction live in one place.

The panel's width is bound to the CSS custom property `--object-rail-w` (default 16rem). Retract preference is persisted by the CONSUMER under their own storage key — this component is controlled: `state` + `onToggle` props. Below `<md` it becomes a fixed-width off-canvas drawer; the desktop retract preference is ignored there (sheetOpen axis, orthogonal to state).

Resize capability is DECLARED, not detected: pass LeftPanelResize (lines 67–73) to enable a pointer-draggable separator on the panel's right edge. Widths travel in REM (rem-grid aware); `clampRailWidth()` (line 76) snaps to the 0.25rem minor grid. Drag width is committed via onCommit callback; null resets to the token default. The handle renders only ≥md; the <md drawer has fixed width.

## RightPanel — three states and the transition table

RightPanel (src/shell/RightPanel.tsx, lines 1–36, Figma spec) has three states: `docked` (320px, --context-w), `retracted` (40px strip), `full` (absolute overlay). Full and retracted are mutually exclusive by design — "collapsed wins" is enforced through the `nextRightPanelState()` transition table (lines 74–91), not by forgetting to set a flag.

The transition table is the sole definition of valid state changes: retract from ANY state lands on `retracted` (including from `full`); toggleExpand works only docked ↔ full; arrive un-retracts but never un-expands (preserving the user's view if a selection lands while they are reading); escape restores from full to docked. This is exported and tested — the rule stops being a line the consumer can forget.

Retracting hides CONTENT, never CONTROLS: the footer renders in both `docked` and `retracted` (stacked on the strip), suppressed only in `full`. The close affordance is a CHEVRON (keyboard_double_arrow_right), not an ✕ — the sheet slides in from the right, so » pushes it back. Below lg it is a sheet; desktop retract preference is ignored there.

Shell views (Marketplace, Profile, Settings) take precedence over the surface's standing selection while open. Retracting clears the view, and so does closing the <lg sheet — both through the `onClearView` callback. A title prop (lines 143, 284–286) is optional and renders as the body's heading when the body cannot name itself (e.g., a selected row is just values); a branded detail body passes none. Never both — the duplicate shows.

## SurfaceHost and kept-alive law

SurfaceHost (src/shell/SurfaceHost.tsx, lines 1–23, Figma spec) is NOT a visual component. It mounts surfaces on first activation and never unmounts them. Hidden surfaces use `visibility: hidden + inert + aria-hidden`, NEVER `display: none` — removing from layout drops scroll offsets and resets measured widths to zero. Come back and you are at the top of a table, with a virtualizer that just measured against a zero-width box.

The active surface publishes its RegionsSpec; only renderers subscribe. Routing is the CONSUMER's responsibility — pass `activeId` and `surfaces` as props. Lazy loads each surface once per session; mounting the host re-uses cached components. Below the kept-alive law: a Next consumer using `app/template.tsx` remounts its subtree on every navigation, which silently breaks kept-alive. That file, if added, has no warning flag — carry the note as code comments if you use Next.

## Seams: context arrival and expand request

The shell subscribes to context changes via `onContextArrival()` (src/lib/regions.ts, line 146) — a listener fires when the active surface's context.key changed to non-null, triggering un-retract and sheet open. A context body calls `requestContextExpand()` (line 163) to ask the shell to expand to full width. Both are external store listeners, bridging the region spec to panel state in the consuming shell component.

The WHY behind each shape lives in [ARCHITECTURE.md](ARCHITECTURE.md) (the boundaries and refusals) and the component file headers (the Figma-spec blocks); the visual rules in [DESIGN.md](DESIGN.md); the full export and type reference in [REFERENCE.md](REFERENCE.md).
