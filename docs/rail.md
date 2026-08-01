# The object rail — RailTree and its satellites

Read this when you are binding the object rail to a data source: the tree structure, the row menus, the inline form, and the pure helpers to move and orphan rows. Also read this when adding drag-reorder, the colour bar, glyph customization, the asset level, or the folder level — all are capability flags with no fallback. The WHY is in [ARCHITECTURE](ARCHITECTURE.md); visual rules are in [DESIGN](DESIGN.md).

## The four-level model

RailTree renders a hierarchy that owns no data — you hand rows in, it returns callbacks. The model (the interfaces at the top of `src/shell/RailTree.tsx`) is four levels:

1. **Channels** (`RailChannel`) — topic groups. Each has `id`, `name`, and optional `icon`, `colour`, and `hidden` flag.
2. **Projects** (`RailProject`) — belong to a channel or are Unfiled (`channelId: null`). Each has `id`, `name`, `channelId`, and optional `icon`, `colour`, `pinned`, and `hidden` flags.
3. **Folders** (`RailFolder`, the filesystem plane) — filing containers under a project, holding assets and other folders. Each has `id`, `name`, `projectId`, `parentId` (`null` = directly under the project), and optional `icon`, `colour`, `hidden`. `projectId` stays required even when nested so "everything in this project" is one filter — `moveFolder` rewrites it on descendants when a folder crosses projects.
4. **Assets** (`RailAsset`, the "data rail" decision) — first-class citizens under a project. Each has `id`, `name`, `projectId`, optional `folderId` (`null`/absent = the project root), `icon` and `hidden`. An asset lives in exactly ONE folder — containment is a field, so one canonical parent (the SCFS no-hard-links consequence).

Rendering recursion is confined to the one recursive function (`folderBlock`), cycle-guarded, with a computed indent of 2rem + 1rem per depth — depth 0 sits exactly where assets sat before folders existed. Fold state for folders shares the channel fold set under namespaced keys (`folder:<id>`), because consumer ids may collide across types.

The component owns no state about which rows exist or where they live — the consumer retains that contract. Style picks (`RailRowStyle`) emit token *names* (`colour: "chart-3"`, never the CSS value); the consumer maps to `var(--…)` when feeding rows back.

## The pure helpers — invariants and reorder

Seven pure functions live in `src/shell/RailTree.tsx` (the block after the model interfaces), testable without a DOM:

- **`orphanProjects(projects, channelId)`** — INVARIANT 1. Returns a new project list with `channelId` cleared on every project that belonged to the deleted channel. Deleting a container must never delete its contents; un-filing is recoverable.
- **`orphanFolderContents(folders, assets, folderId)`** — INVARIANT 1, the folder edition. Re-homes the deleted folder's DIRECT children (subfolders and assets) to its own parent (project root when it had none) and removes the folder itself from the returned list. Nothing destroyed.
- **`sortPinnedFirst(projects)`** — Pins sort within the channel, never to a competing top-level group. Preserves order otherwise.
- **`reorderChannels(channels, movedId, toIndex)`** — Drag-reorder channels to `toIndex` (clamped). Unknown id returns a fresh copy.
- **`moveProject(projects, movedId, toChannelId, toIndex)`** — Move a project into `toChannelId` at position `toIndex` among that channel's members. The `toIndex` is read against the list with the moved project already removed (the post-removal convention `amenan-ui`'s `reorderTabs` uses).
- **`moveAsset(assets, movedId, toProjectId, toIndex, toFolderId?)`** — Mirror of `moveProject` for assets. The trailing `toFolderId` is the folder axis: `undefined` means folders are not in play (`folderId` neither read nor written, members = the whole project — the pre-folder behaviour, byte-identical); a string or `null` files the asset into that folder and indexes among that folder's members only.
- **`moveFolder(folders, assets, movedId, toProjectId, toParentId, toIndex)`** — Re-parents a folder (`toParentId: null` = project root), returning `{folders, assets}`. A move into itself or its own descendant returns fresh UNCHANGED copies — the refusal is tier-owned, because a `parentId` cycle corrupts rendering for every consumer. A cross-project move rewrites `projectId` on the entire subtree — descendant folders AND the assets filed anywhere inside it (assets that stayed behind would fail every render filter and vanish; `moveFolders` hands BOTH lists back and the consumer persists both).

The delete handlers receive the invariant already applied — `deleteChannel(id, orphaned)` and `deleteFolder(id, orphaned)` — so you cannot write the callback without it.

Creating into a folded channel **UNFOLDS it first** (INVARIANT 2, the `openCreate` helper). The worst bug is a successful mutation with no visible evidence — the row exists server-side, only the count badge ticks up inside a folded block. Fixing this at the UI source — unfold, then open the create row — is where the component owns it. With folders the invariant GENERALISES: creating into a folder unfolds the whole ancestor chain (every ancestor folder, walked with a cycle guard, plus the owning channel), not just the immediate parent.

The drag model uses a ref to track the dragged item across the tree, with `dragOn(kind)` guarding what kind of drag is active: channel/project drags need only the `reorder` capability (a drop with no `reorderChannels`/`reorderProjects` handler no-ops); asset moves need the `assets` capability *and* a `moveAssets` handler; folder moves need the `folders` capability *and* a `moveFolders` handler. A consumer without sortable lists can still file (move assets and folders between containers) because those drags are filing decisions, not sorts. The drop-index calculation reads against the post-removal list — the same convention the pure helpers use, so their round-trip is deterministic. A folder drop always means INTO the target, appended last — sibling-folder reorder is out of scope, so a drop never means before/after; self/descendant drops are refused in the handler AND in `moveFolder`.

## The row economy — one menu, pinned dot, promoted actions

The 2026-08-01 UX round (`src/shell/RailTree.tsx` lines 50–66) consolidates row affordances:

- **ONE overflow menu per tree** (`RailRowMenu`, `src/shell/RailRowMenu.tsx`) — a single instance, not per-row markup. Secondary actions live here: rename, hide, delete on every kind; pin/unpin on projects; duplicate on assets (only when `duplicateAsset` exists). Items are built from the live row so `pin`/`unpin` reads current state.
- **ONE promoted inline action** per row kind:
  - A channel's `add` (new project) — inline in the trigger cluster, beside the overflow trigger.
  - A project's `duplicate` — visible when `duplicateProject` handler exists.
  - A folder's `add` (new SUBFOLDER) — visible when `createFolder` exists; the root-level "New folder in <project>" is a project MENU item, never a second promoted icon (the row economy stays bought).
  - Assets are menu-only; no promoted quick action.
  - Hidden-section rows keep their two inline icons (restore, delete). Hidden folders render as bare rows there — no children, no fold; restoring is the way back to structure.
- **The pinned dot** (projects only) — a pinned row wears an always-visible filled pin *outside* the hover fade. One click unpins. Pinned state is state, not chrome.
- **The trigger cluster** — hover-faded on desktop (`group-hover:opacity-100`), always visible below `md` (`max-md:opacity-100`). Touch has no hover; the rail must be reachable there.

The overflow menu is a single `Popover` (`src/shell/Popover.tsx`) for the entire tree, positioned via `getBoundingClientRect` and clamped to the viewport. The panel is `position: fixed` — it escapes ancestor clips that would truncate an absolutely-positioned panel — and a fixed full-viewport veil provides click-away. Esc-on-capture closes it before the document sees the key.

Hidden items earn no permanent chrome — only a count line that appears when something is `hidden: true`. Clicking the count folds/unfolds the hidden section. When shown, hidden rows appear with restore and delete buttons only (rename, pin, colour are meaningless on already-hidden items).

## View state the component owns

The tree manages folded/unfolded state per channel and per folder (id-keyed — folders under namespaced `folder:<id>` keys — so it survives list reshuffles), a `showHidden` toggle for the collapsed hidden section, and `editing` state for which row is in the inline form. These are local to the component — the consumer never reads them, never persists them. When a row's action fires, the component emits only the data mutation, not the UI state around it.

## The inline form — one session for name, icon, and colour

`RailStyleForm` (`src/shell/RailStyleForm.tsx`) handles both create *and* edit in one anatomy (Em's ruling):

- **Create** opens an empty form; `onCommit` fires on Enter or the ✓ button. Leaving the form cancels — a stray click must not mint a row.
- **Edit** opens the form on a stored row with `initialName` and prefilled style, and `commitOnLeave` (rename-on-blur, the numu1 gesture).
- **Always-visible swatches** (the numu1 gesture) — no popover trip. Eight `chart-N` colour tokens and a Reset button.
- **Inline glyph grid** — expands when the glyph button toggles; a pick closes the grid but keeps the form open.
- **Create hands** `(name, style)` to handlers; Rename opens the *same* form on the row, live-applying style picks through `onStyle`.
- **Blank names** — an empty create row cancels silently (a channel needs identity); an empty project name still creates (the consumer defaults it, instant-create survives).

No style popover survives; `RailStylePopover` was deleted. The form degenerates to a plain name input when `styleOn` is false (no handler). Leaving the form via blur commits (edit) or cancels (create), unless focus stays inside the form — swatches and glyph grid are *inside*, so hopping to them never reads as leaving. A cancelled create (Esc, stray blur) closes the form and emits nothing; it is always safe to click away, so the affordance never lies about being in progress.

## The callbacks contract

The `on` prop is a partial map of `RailTreeHandlers` (`src/shell/RailTree.tsx`, the interface before the props). Handlers are called *after* the user acts (clicks, types, drags); the component owns no data, so it is your job to mutate state and re-render with new rows. A few handlers gate their own affordance: `duplicateProject` (the inline quick action), `duplicateAsset` (its menu item), `moveAssets` (asset drag), `moveFolders` (folder drag), `createFolder` (BOTH folder-create doors: the project menu item and the folder row's promoted `+`), `selectFolder` (the folder name renders as a button only when it exists — otherwise the row only folds), and `setChannelStyle`/`setProjectStyle`/`setFolderStyle` (the form's swatches and glyph grid). The other menu items render regardless and no-op through optional chaining when their handler is absent. Handlers receive pre-computed values: `deleteChannel` and `deleteFolder` get their orphaned lists pre-applied, `createProject`/`createFolder` know the chain was unfolded first, `moveAssets`/`moveFolders` receive the post-move list from their helper. `createFolder` never fires with an empty name — an unnamed folder is a cancel, the container rule (`createChannel`'s rule; `createProject` still instant-creates). Renames commit on Enter, ✓, or leaving the form; empty or unchanged names revert silently. Esc always reverts.

## Capabilities are DECLARED, not DETECTED

Five capabilities (`RailTreeCapabilities`, `src/shell/RailTree.tsx`). A missing capability does not grey out the affordance — it removes the markup entirely (no handle, no listener, no colour rail). Declared boolean; omitted means off, except `icons`, which defaults on:

- **`reorder`** — drag-reorder channels and projects (amenan-ui, numu1). Off → no draggable attribute, no listeners.
- **`colour`** — the per-row colour bar (numu1 only). Off → no bar, `colour` fields ignored. (The edit form's swatches ride the style handlers, not this flag.)
- **`icons`** — per-row glyphs. Off → glyph column gone entirely.
- **`assets`** — the asset level. Off → asset rows and drop targets disappear; asset *drag* rides this capability, not `reorder` (a filing decision, not a sort).
- **`folders`** — the folder level. Off → the `folders` prop is ignored entirely AND `RailAsset.folderId` is ignored (assets render flat under their project, byte-identical to the pre-folder tree); folder drag rides this capability + `moveFolders`.

## The glyph-ref seam

Consumer-fed icon refs render through `renderGlyph` (a `GlyphRenderer`, `src/shell/Symbol.tsx`). The default is `renderMaterialGlyph` (Material Symbols only); bare name means Material forever. Prefixed refs are future icon packs, resolved app-side.

## The labels contract — i18n

Every string is customizable via `labels` (partial override of `DEFAULT_RAIL_TREE_LABELS`). Every glyph is customizable via `glyphs` (partial override of `DEFAULT_RAIL_GLYPHS` — the folder level added `folder`/`folder_open`, and `newFolderIn`/`folderName`/`emptyFolder` joined the labels; both defaults objects gained REQUIRED keys, which only a consumer declaring a complete object literal notices — the props accept `Partial<>`). The component emits no app nouns — the platform tier carries only the tree's operations. Function-valued labels (e.g., `rename(name)`, `newProjectIn(channel)`) let you construct dynamic copy without templating the platform tier.

## Testing and the pure helpers

The seven pure helpers (`orphanProjects`, `orphanFolderContents`, `sortPinnedFirst`, `reorderChannels`, `moveProject`, `moveAsset`, `moveFolder`) are unit-tested in `src/shell/__tests__/rail-tree.test.tsx` without a DOM. The component itself is tested with mount helpers and event simulation — invariant 2 (unfold-on-create), the declared-not-detected law (capabilities produce no disabled affordances), and the overflow menu's live item building. Use the pure helpers directly in your tests when validating data transformations; the component tests verify the UI triggers them correctly.

See [ARCHITECTURE](ARCHITECTURE.md) for the boundaries this component refuses to own; [DESIGN](DESIGN.md) for the visual language and row-action placement rules.
