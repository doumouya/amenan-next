// RailTree — Figma `shell/RailTree`, node 18:26.
//
// FIGMA SPEC (verbatim substance — this component has NO datacore donor, so the description is
// the only specification there is):
//
//   "PORTED — amenan-ui rail/ (behaviour: reorderGroups = channels, reorderTabs = projects) +
//    numu-ui spike rail.ts (the corrected create-flow) + numu1 object-rail.ts (the model).
//    datacore-gcp has NO rail tree: its rail is a flat read-only stack of catalog + models +
//    history.
//    MODEL: channels (topic groups) → projects (each a live conversation). A project BELONGS TO a
//    channel or is Unfiled. The top + makes a CHANNEL; each channel's own + makes a project IN it
//    — one + could never mean both, which was a wrong shape underneath the button, not a bug in it.
//    TWO INVARIANTS THIS COMPONENT OWNS:
//      1. Deleting a channel ORPHANS its projects to Unfiled — never destroys them.
//      2. Creating into a folded channel UNFOLDS it first — otherwise the row is created
//         correctly, nothing appears to happen, and it gets reported as 'the button is broken'.
//    Pin sorts WITHIN the channel, never to a competing top-level group. The count badge stays
//    visible while folded. Row actions are hover-only, so they cost nothing against the resting
//    button budget. Zero fetch: rows in, callbacks out.
//    THREE CAPABILITIES, DECLARED NOT DETECTED — omitting one removes the affordance entirely,
//    never disables it. reorder (amenan-ui, numu1) · colour (numu1 only) · icons (spike, numu1)."
//
// WHERE THE TWO INVARIANTS LIVE, given "rows in, callbacks out":
//
//  · Invariant 2 is pure UI state and lives HERE: `createProject` unfolds the target channel
//    before it calls out. The failure it prevents is the worst kind — the mutation SUCCEEDS, the
//    new row exists, and the only visible evidence is a count badge ticking up inside a folded
//    block. Nobody reads that as "it worked".
//  · Invariant 1 is a DATA mutation, and this component owns no data. So it ships as the exported
//    pure helper `orphanProjects`, which the consumer applies in its delete handler — the same
//    shape amenan-ui's rail uses for `reorderTabs`/`reorderGroups`, and the reason both are unit
//    tested rather than clicked at. `onDeleteChannel` hands back the orphaned list so the callback
//    cannot be written without it.
//
// "DECLARED NOT DETECTED" is the sentence to re-read before adding a `disabled` anywhere below.
// A greyed-out drag handle in an app that does not persist an order is chrome that lies about a
// feature; an absent one is honest. Each capability is a boolean in, and false means the markup is
// not emitted at all — no handle, no listener, no colour rail.
//
// ICONS: Figma draws the glyphs as literal text (▾ ▸ # ▤ ⠿ ●) because the icon components were not
// instanced into this node. They are Material Symbols ligatures here, per the icon law — see
// Symbol.tsx, and src/shell/symbols.txt for which of them are NEW to the census (seven are).
//
// PLATFORM-TIER NOTES: every string is in `labels` with an English default, every glyph is in
// `glyphs` with a documented default, and there is not one app noun in the file. The Figma frame
// carries `w-[var(--object-rail-w)]`; here it is `w-full`, because this renders inside
// `<LeftPanel>`, which already IS that width — binding it twice means one of the two is wrong the
// day the token moves.
//
// THE 2026-08-01 UX ROUND (supersedes the spec's "row actions are hover-only" sentence):
//  · Secondary actions live behind ONE `more_horiz` overflow menu per row (RailRowMenu) — six
//    hover icons were ~144px of reserved space against the name, and unreachable on touch. Each
//    row keeps ONE promoted quick action inline: a channel's `add` (new project), a project's
//    `duplicate`. Assets are menu-only; hidden-section rows keep their two inline icons
//    (restore · delete — no crowding to solve there). The trigger cluster is still hover-faded
//    on desktop but ALWAYS visible below md, where hover does not exist. A PINNED project also
//    wears an always-visible filled pin (one click unpins) — pinned state is state, not chrome.
//  · CREATION AND EDIT are ONE inline form (RailStyleForm — numu1's add-form anatomy, Em's
//    ruling): name + icon + colour in one session, swatches always visible, the glyph grid
//    inline. Create hands `(name, style)` to the create handlers; the menu's Rename opens the
//    SAME form on a stored row, live-applying style picks. No consumer window.prompt survives,
//    and no style popover either — RailStylePopover was superseded and deleted.
//  · "New channel" is a full-width LABELLED row at the tree's foot (numu1's shape), not a
//    corner icon: creation of the container reads as a sentence, not a glyph to decode.
//  · Consumer-fed icon refs render through the glyph-ref seam (`renderGlyph`, Symbol.tsx) —
//    bare name = Material forever; prefixed refs are future icon packs, resolved app-side.
//
// THE FOLDER LEVEL (the filesystem plane, 2026-08-01 — Em's ruling: folders inside a project,
// the folder's content type driving an app-side viewer):
//  · A 4th flat array (`folders`), NOT a recursive node union — the three-level consumers stay
//    source-compatible, and `RailAsset.folderId` files an asset into exactly one folder (the
//    SCFS no-hard-links consequence: containment is a field, so one canonical parent).
//  · Rendering recursion is CONFINED to `folderBlock` — the one recursive function, cycle-guarded
//    (`seen`), computed indent 2rem + depth·1rem where depth 0 equals the old `pl-8` exactly.
//  · Fold state shares the channel set under namespaced keys (`folder:<id>`) — consumer ids may
//    collide across types. Invariant 2 generalises: creating into a folded chain unfolds every
//    ancestor folder AND the owning channel before the form is born.
//  · Folder drag is a MOVE riding the `folders` capability + `moveFolders` (never `reorder`);
//    a drop means INTO, appended last — sibling reorder is out of scope. Self/descendant drops
//    are refused in the handler AND in `moveFolder` (a parentId cycle corrupts every consumer).
//  · Deleting a folder is the CHANNEL law, one level down: `orphanFolderContents` re-homes the
//    direct children to the deleted folder's parent, handed pre-applied to `deleteFolder`.
//  · Selection is declared-not-detected: no `selectFolder` → the name is plain text and the row
//    only folds. `activeFolderId` is a SEPARATE axis from `activeProjectId` — a folder viewer
//    opens while the project stays the live thread.

import { useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { RailRowMenu, type RailRowMenuItem } from "./RailRowMenu";
import { RailStyleForm } from "./RailStyleForm";
import { renderMaterialGlyph, Symbol, type GlyphRenderer } from "./Symbol";

// ── the model ────────────────────────────────────────────────────────────────────────────────

export interface RailChannel {
  id: string;
  name: string;
  /** a Material Symbols ligature; rendered only when the `icons` capability is on */
  icon?: string;
  /** a CSS colour, normally `var(--chart-N)`; rendered only when the `colour` capability is on —
   *  the style door offers colour on channels too, so the row must be able to answer */
  colour?: string;
  hidden?: boolean;
}

export interface RailProject {
  id: string;
  name: string;
  /** null → Unfiled. Not optional: "which channel" is never a question this component guesses. */
  channelId: string | null;
  icon?: string;
  /** a CSS colour, normally `var(--chart-N)`; rendered only when the `colour` capability is on */
  colour?: string;
  pinned?: boolean;
  hidden?: boolean;
}

/**
 * The third row level (the one-interface arc, decision 7): a first-class citizen living UNDER a
 * project — a saved query, an attached file. `projectId` is required for the same reason
 * `channelId` is: which project owns it is never guessed. Rendered only when the `assets`
 * capability is declared.
 */
export interface RailAsset {
  id: string;
  name: string;
  projectId: string;
  /** which folder files this asset; absent/null → the project root. Ignored entirely when the
   *  `folders` capability is off (assets render flat under the project, as before folders). */
  folderId?: string | null;
  icon?: string;
  hidden?: boolean;
}

/**
 * The FOLDER level (the filesystem plane, 2026-08-01): a filing container living UNDER a project,
 * holding assets and other folders. An asset lives in exactly ONE folder — the single-parent
 * consequence of keying containment as a field (the SCFS no-hard-links argument, applied).
 * Rendered only when the `folders` capability is declared.
 */
export interface RailFolder {
  id: string;
  name: string;
  /** which project's subtree this folder lives in — required even when nested, so "everything in
   *  this project" stays one filter; `moveFolder` rewrites it on descendants when crossing */
  projectId: string;
  /** null → directly under the project. Not optional: "which parent" is never guessed — the same
   *  sentence `RailProject.channelId` carries. */
  parentId: string | null;
  icon?: string;
  /** a CSS colour, normally `var(--chart-N)`; rendered only when the `colour` capability is on */
  colour?: string;
  hidden?: boolean;
}

/** the four row species — declared ONCE; every state union below reads this, never restates it */
type RowKind = "channel" | "project" | "asset" | "folder";

/** the style a picker emits: token NAMES only (`colour: "chart-3"`, never a CSS value) —
 *  the consumer maps to `var(--…)` when feeding rows (the literal-class law's data twin) */
export interface RailRowStyle {
  glyph?: string;
  colour?: string;
}

// ── the pure helpers (the invariants, testable without a DOM) ─────────────────────────────────

/**
 * INVARIANT 1. Returns a NEW project list with `channelId` cleared on every project that belonged
 * to `channelId` — they land in Unfiled. Nothing is removed.
 *
 * Deleting a container must never delete its contents. A channel is a *filing* decision and
 * un-filing is recoverable; destroying somebody's conversations because they tidied their sidebar
 * is not.
 */
export function orphanProjects(projects: RailProject[], channelId: string): RailProject[] {
  return projects.map((p) => (p.channelId === channelId ? { ...p, channelId: null } : p));
}

/** Pinned first, order otherwise preserved. WITHIN the channel — never a competing top group. */
export function sortPinnedFirst(projects: RailProject[]): RailProject[] {
  return [...projects].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
}

/** Move a channel to `toIndex` (clamped), returning a NEW array. Unknown id → a fresh copy. */
export function reorderChannels(
  channels: RailChannel[],
  movedId: string,
  toIndex: number,
): RailChannel[] {
  const from = channels.findIndex((c) => c.id === movedId);
  const copy = [...channels];
  if (from < 0) return copy;
  const [moved] = copy.splice(from, 1);
  if (!moved) return copy;
  copy.splice(Math.max(0, Math.min(toIndex, copy.length)), 0, moved);
  return copy;
}

/**
 * Move a project into `toChannelId` at position `toIndex` among THAT channel's members, returning
 * a NEW flat list. `toIndex` is read against the list with the moved project already removed —
 * the same convention amenan-ui's `reorderTabs` uses, and the one every drop-index calculation
 * below assumes.
 */
export function moveProject(
  projects: RailProject[],
  movedId: string,
  toChannelId: string | null,
  toIndex: number,
): RailProject[] {
  const moved = projects.find((p) => p.id === movedId);
  if (!moved) return [...projects];
  const rest = projects.filter((p) => p.id !== movedId);
  const next: RailProject = { ...moved, channelId: toChannelId };
  const members = rest.filter((p) => p.channelId === toChannelId);
  if (members.length === 0) return [...rest, next];
  const at = Math.max(0, Math.min(toIndex, members.length));
  const anchor = at < members.length ? members[at] : members[members.length - 1];
  const anchorAt = anchor ? rest.indexOf(anchor) : rest.length;
  const insertAt = at < members.length ? anchorAt : anchorAt + 1;
  return [...rest.slice(0, insertAt), next, ...rest.slice(insertAt)];
}

/**
 * Move an asset into `toProjectId` at `toIndex` among that project's assets — `moveProject`'s
 * mirror, same post-removal index convention, same "unknown id → fresh copy" contract.
 *
 * `toFolderId` (the folder level): `undefined` means "folders are not in play" — `folderId` is
 * neither read nor written and the member list is the whole project, byte-identical to the
 * pre-folder behaviour. A string or null files the asset into that folder (null = project root)
 * and indexes among that folder's members only.
 */
export function moveAsset(
  assets: RailAsset[],
  movedId: string,
  toProjectId: string,
  toIndex: number,
  toFolderId?: string | null,
): RailAsset[] {
  const moved = assets.find((a) => a.id === movedId);
  if (!moved) return [...assets];
  const rest = assets.filter((a) => a.id !== movedId);
  const next: RailAsset = { ...moved, projectId: toProjectId };
  if (toFolderId !== undefined && (moved.folderId ?? null) !== toFolderId) next.folderId = toFolderId;
  const members = rest.filter(
    (a) =>
      a.projectId === toProjectId &&
      (toFolderId === undefined || (a.folderId ?? null) === toFolderId),
  );
  if (members.length === 0) return [...rest, next];
  const at = Math.max(0, Math.min(toIndex, members.length));
  const anchor = at < members.length ? members[at] : members[members.length - 1];
  const anchorAt = anchor ? rest.indexOf(anchor) : rest.length;
  const insertAt = at < members.length ? anchorAt : anchorAt + 1;
  return [...rest.slice(0, insertAt), next, ...rest.slice(insertAt)];
}

/** every folder inside `rootId`'s subtree (excluding the root itself), cycle-safe */
function folderSubtreeIds(folders: RailFolder[], rootId: string): Set<string> {
  const ids = new Set<string>();
  let frontier = new Set([rootId]);
  while (frontier.size) {
    const next = new Set<string>();
    for (const f of folders) {
      const pid = f.parentId ?? null;
      if (pid !== null && frontier.has(pid) && !ids.has(f.id)) {
        ids.add(f.id);
        next.add(f.id);
      }
    }
    frontier = next;
  }
  return ids;
}

/**
 * Move a folder under `toParentId` (null = the project root) in `toProjectId`, splicing at
 * `toIndex` among that parent's sibling folders — the same post-removal index convention.
 *
 * Takes AND returns assets, like `orphanFolderContents`: a CROSS-PROJECT move must rewrite
 * `projectId` on the entire descendant subtree — folders AND the assets filed anywhere inside
 * it — or the assets fail every render filter and vanish from the tree (the 2026-08-01 review's
 * finding; the denormalisation that keeps "everything in this project" one filter only holds if
 * every row in the subtree moves together). A move into ITSELF or its own DESCENDANT returns
 * fresh unchanged copies — a `parentId` cycle corrupts rendering for every consumer, so the
 * refusal is tier-owned.
 */
export function moveFolder(
  folders: RailFolder[],
  assets: RailAsset[],
  movedId: string,
  toProjectId: string,
  toParentId: string | null,
  toIndex: number,
): { folders: RailFolder[]; assets: RailAsset[] } {
  const moved = folders.find((f) => f.id === movedId);
  if (!moved) return { folders: [...folders], assets: [...assets] };
  if (
    toParentId !== null &&
    (toParentId === movedId || folderSubtreeIds(folders, movedId).has(toParentId))
  )
    return { folders: [...folders], assets: [...assets] };
  const subtree = folderSubtreeIds(folders, movedId);
  const crossProject = moved.projectId !== toProjectId;
  const inMovedTree = (folderId: string | null | undefined) =>
    folderId != null && (folderId === movedId || subtree.has(folderId));
  const nextAssets = crossProject
    ? assets.map((a) => (inMovedTree(a.folderId) ? { ...a, projectId: toProjectId } : a))
    : [...assets];
  const rest = folders
    .filter((f) => f.id !== movedId)
    .map((f) => (crossProject && subtree.has(f.id) ? { ...f, projectId: toProjectId } : f));
  const next: RailFolder = { ...moved, projectId: toProjectId, parentId: toParentId };
  const members = rest.filter(
    (f) => f.projectId === toProjectId && (f.parentId ?? null) === toParentId,
  );
  if (members.length === 0) return { folders: [...rest, next], assets: nextAssets };
  const at = Math.max(0, Math.min(toIndex, members.length));
  const anchor = at < members.length ? members[at] : members[members.length - 1];
  const anchorAt = anchor ? rest.indexOf(anchor) : rest.length;
  const insertAt = at < members.length ? anchorAt : anchorAt + 1;
  return {
    folders: [...rest.slice(0, insertAt), next, ...rest.slice(insertAt)],
    assets: nextAssets,
  };
}

/**
 * INVARIANT 1, the folder edition: deleting a folder re-homes its DIRECT children — subfolders
 * and assets — to the deleted folder's own parent (project root when it had none). Nothing is
 * destroyed; the deleted folder itself is removed from the returned list. Handed pre-applied to
 * `deleteFolder` so the callback cannot be written without it, exactly like `deleteChannel`.
 */
export function orphanFolderContents(
  folders: RailFolder[],
  assets: RailAsset[],
  folderId: string,
): { folders: RailFolder[]; assets: RailAsset[] } {
  const deleted = folders.find((f) => f.id === folderId);
  const parent = deleted?.parentId ?? null;
  return {
    folders: folders
      .filter((f) => f.id !== folderId)
      .map((f) => ((f.parentId ?? null) === folderId ? { ...f, parentId: parent } : f)),
    assets: assets.map((a) => ((a.folderId ?? null) === folderId ? { ...a, folderId: parent } : a)),
  };
}

// ── capabilities · glyphs · labels ────────────────────────────────────────────────────────────

export interface RailTreeCapabilities {
  /** drag-reorder (amenan-ui, numu1). Off → no handle, no draggable attribute, no listeners. */
  reorder?: boolean;
  /** the per-project colour bar (numu1 only). Off → no bar, and `RailProject.colour` is ignored. */
  colour?: boolean;
  /** per-row glyphs (spike, numu1). Off → no glyph column at all. */
  icons?: boolean;
  /**
   * The asset level (decision 7). Off → the `assets` prop is ignored entirely — no rows, no drop
   * targets. Asset DRAG rides THIS capability, not `reorder`: moving an asset between projects
   * is a filing decision, not a sort, and a consumer without sortable lists still files.
   */
  assets?: boolean;
  /**
   * The folder level (the filesystem plane). Off → the `folders` prop is ignored entirely AND
   * `RailAsset.folderId` is ignored (assets render flat under their project, byte-identical to
   * the pre-folder tree). Folder DRAG rides this capability + `moveFolders`, never `reorder` —
   * filing, not sorting, the asset precedent.
   */
  folders?: boolean;
}

export interface RailGlyphs {
  folded: string;
  unfolded: string;
  channel: string;
  project: string;
  asset: string;
  drag: string;
  rename: string;
  pin: string;
  unpin: string;
  hide: string;
  restore: string;
  remove: string;
  add: string;
  active: string;
  duplicate: string;
  style: string;
  /** the per-row overflow-menu trigger */
  more: string;
  /** the tree header's create-channel control — a folder is born, not a generic `+` */
  create: string;
  /** a folder row's resting mark (folded / no icon override) */
  folder: string;
  /** a folder row's mark while its contents are shown */
  folderOpen: string;
}

/** Documented defaults. Every one is a ligature that must be in the consumer's census. */
export const DEFAULT_RAIL_GLYPHS: RailGlyphs = {
  folded: "chevron_right",
  unfolded: "expand_more",
  channel: "tag",
  project: "description",
  asset: "draft",
  drag: "drag_indicator",
  rename: "edit",
  pin: "push_pin",
  unpin: "check",
  hide: "visibility_off",
  restore: "visibility",
  remove: "delete",
  add: "add",
  active: "circle",
  duplicate: "content_copy",
  style: "palette",
  more: "more_horiz",
  create: "create_new_folder",
  folder: "folder",
  folderOpen: "folder_open",
};

export interface RailTreeLabels {
  newChannel: string;
  newProjectIn: (channel: string) => string;
  /** `parent` is a project OR a folder name — one label serves both create affordances */
  newFolderIn: (parent: string) => string;
  rename: (name: string) => string;
  pin: (name: string) => string;
  unpin: (name: string) => string;
  hide: (name: string) => string;
  restore: (name: string) => string;
  remove: (name: string) => string;
  duplicate: (name: string) => string;
  style: (name: string) => string;
  fold: (name: string) => string;
  unfold: (name: string) => string;
  /** the per-row overflow-menu trigger */
  more: (name: string) => string;
  /** the inline create rows' input placeholders (they double as the inputs' accessible names) */
  channelName: string;
  projectName: string;
  folderName: string;
  /** the inline form's ✓ commit */
  save: string;
  unfiled: string;
  hiddenSection: string;
  hiddenCount: (n: number) => string;
  noProjects: string;
  /** the unfolded-empty hint — a folder with nothing in it must still read as "it worked" */
  emptyFolder: string;
  tree: string;
}

export const DEFAULT_RAIL_TREE_LABELS: RailTreeLabels = {
  newChannel: "New channel",
  newProjectIn: (c) => `New project in ${c}`,
  newFolderIn: (p) => `New folder in ${p}`,
  rename: (n) => `Rename ${n}`,
  pin: (n) => `Pin ${n}`,
  unpin: (n) => `Unpin ${n}`,
  hide: (n) => `Hide ${n}`,
  restore: (n) => `Restore ${n}`,
  remove: (n) => `Delete ${n}`,
  duplicate: (n) => `Duplicate ${n}`,
  style: (n) => `Style ${n}`,
  fold: (n) => `Collapse ${n}`,
  unfold: (n) => `Expand ${n}`,
  more: (n) => `Actions for ${n}`,
  channelName: "Channel name",
  projectName: "Project name",
  folderName: "Folder name",
  save: "Save",
  unfiled: "Unfiled",
  hiddenSection: "Hidden",
  hiddenCount: (n) => `${n} hidden`,
  noProjects: "no projects yet",
  emptyFolder: "empty",
  tree: "Workspace",
};

export interface RailTreeHandlers {
  selectProject?: (id: string) => void;
  /** fired by the inline create row — `name` is non-empty (an unnamed channel is a cancel) */
  createChannel?: (name: string, style?: RailRowStyle) => void;
  /**
   * null channel → create into Unfiled. The channel is already unfolded when this fires
   * (invariant 2). `name` is absent when the user committed an empty create row — the consumer
   * defaults it (the chat-app instant-create gesture survives the inline flow).
   */
  createProject?: (channelId: string | null, name?: string, style?: RailRowStyle) => void;
  renameChannel?: (id: string, name: string) => void;
  renameProject?: (id: string, name: string) => void;
  setChannelHidden?: (id: string, hidden: boolean) => void;
  setProjectHidden?: (id: string, hidden: boolean) => void;
  /**
   * INVARIANT 1 is handed to you already applied: `orphaned` is the project list with this
   * channel's projects moved to Unfiled. Persist that, not the list you were rendering.
   */
  deleteChannel?: (id: string, orphaned: RailProject[]) => void;
  deleteProject?: (id: string) => void;
  togglePin?: (id: string, pinned: boolean) => void;
  /** only ever fires when the `reorder` capability is on; `next` is the reordered list */
  reorderChannels?: (next: RailChannel[]) => void;
  reorderProjects?: (next: RailProject[]) => void;
  /** a project duplicate is DEEP by contract (its assets follow) — the consumer owns the copy */
  duplicateProject?: (id: string) => void;
  // ── the asset level (fires only under the `assets` capability) ──
  selectAsset?: (id: string) => void;
  renameAsset?: (id: string, name: string) => void;
  setAssetHidden?: (id: string, hidden: boolean) => void;
  deleteAsset?: (id: string) => void;
  duplicateAsset?: (id: string) => void;
  /** an asset was dragged into another project; `next` is the moved list (`moveAsset` applied) */
  moveAssets?: (next: RailAsset[]) => void;
  // ── the folder level (fires only under the `folders` capability) ──
  /** absent → folder names are plain text and a folder row only folds/unfolds */
  selectFolder?: (id: string) => void;
  /** the ancestor chain is already unfolded when this fires (invariant 2, generalised).
   *  `name` is always non-empty — an unnamed folder is a cancel, the container rule. */
  createFolder?: (
    projectId: string,
    parentId: string | null,
    name: string,
    style?: RailRowStyle,
  ) => void;
  renameFolder?: (id: string, name: string) => void;
  setFolderHidden?: (id: string, hidden: boolean) => void;
  /**
   * INVARIANT 1, folder edition, handed pre-applied: `orphaned` is the folder/asset lists with
   * this folder's direct children re-homed to its parent and the folder itself removed. Persist
   * those, not the lists you were rendering.
   */
  deleteFolder?: (id: string, orphaned: { folders: RailFolder[]; assets: RailAsset[] }) => void;
  /** a folder was dragged into a project root or another folder; `next` is `moveFolder` applied —
   *  BOTH lists, because a cross-project move re-points the filed assets too (persist both) */
  moveFolders?: (next: { folders: RailFolder[]; assets: RailAsset[] }) => void;
  // ── the style door (the pickers, decision 3) — null clears back to defaults ──
  setChannelStyle?: (id: string, style: RailRowStyle | null) => void;
  setProjectStyle?: (id: string, style: RailRowStyle | null) => void;
  setFolderStyle?: (id: string, style: RailRowStyle | null) => void;
}

export interface RailTreeProps {
  channels: RailChannel[];
  projects: RailProject[];
  /** ignored entirely unless the `assets` capability is declared */
  assets?: RailAsset[];
  /** ignored entirely unless the `folders` capability is declared */
  folders?: RailFolder[];
  activeProjectId?: string | null;
  /** a SEPARATE axis from the active project: a folder viewer can open while the project stays
   *  the live thread — different id spaces, both marked `aria-current` */
  activeFolderId?: string | null;
  capabilities?: RailTreeCapabilities;
  labels?: Partial<RailTreeLabels>;
  glyphs?: Partial<RailGlyphs>;
  /** the style glyph choices — forwarded to the inline form (its default list documented there) */
  styleGlyphs?: string[];
  /** the glyph-ref seam (Symbol.tsx): resolves consumer-fed icon refs; default = Material only */
  renderGlyph?: GlyphRenderer;
  on?: RailTreeHandlers;
}

// ── the component ─────────────────────────────────────────────────────────────────────────────

type DragState = { kind: RowKind; id: string } | null;

/** folders share the channel fold set — namespaced, because consumer ids can collide across types */
const foldKey = (folderId: string) => `folder:${folderId}`;

const EMPTY_SEEN: ReadonlySet<string> = new Set();

export function RailTree({
  channels,
  projects,
  assets = [],
  folders = [],
  activeProjectId = null,
  activeFolderId = null,
  capabilities = {},
  labels,
  glyphs,
  styleGlyphs,
  renderGlyph = renderMaterialGlyph,
  on = {},
}: RailTreeProps) {
  const l = { ...DEFAULT_RAIL_TREE_LABELS, ...labels };
  const g = { ...DEFAULT_RAIL_GLYPHS, ...glyphs };
  const {
    reorder = false,
    colour = false,
    icons = true,
    assets: assetsOn = false,
    folders: foldersOn = false,
  } = capabilities;

  /** folded channels by id, folded folders by `foldKey` — id-keyed so it survives reshuffles */
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<{ kind: RowKind; id: string } | null>(null);
  const drag = useRef<DragState>(null);

  // the ONE overflow menu (2026-08-01) — a single instance for the whole tree
  const [menu, setMenu] = useState<{
    kind: RowKind;
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const menuAnchorRef = { current: menu?.anchor ?? null };

  // the inline create form (the numu1 gesture): name + style picked BEFORE the row exists, so
  // the create handlers receive both and no consumer window.prompt survives
  const [creating, setCreating] = useState<
    | { kind: "channel" }
    | { kind: "project"; channelId: string }
    | { kind: "folder"; projectId: string; parentId: string | null }
    | null
  >(null);
  const [createStyle, setCreateStyle] = useState<RailRowStyle | null>(null);

  const unfold = (id: string) =>
    setFolded((f) => {
      if (!f.has(id)) return f;
      const n = new Set(f);
      n.delete(id);
      return n;
    });

  const toggleFold = (id: string) =>
    setFolded((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** INVARIANT 2, generalised — unfold the WHOLE ancestor chain first, then open the create row.
   *  The row must be born visible: for a folder target that means every ancestor folder (walked
   *  with a cycle guard) and the owning channel, not just the immediate parent. */
  const openCreate = (next: NonNullable<typeof creating>) => {
    if (next.kind === "project") unfold(next.channelId);
    if (next.kind === "folder") {
      const owner = projects.find((p) => p.id === next.projectId);
      if (owner?.channelId) unfold(owner.channelId);
      const walked = new Set<string>();
      let pid = next.parentId;
      while (pid && !walked.has(pid)) {
        walked.add(pid);
        unfold(foldKey(pid));
        pid = folders.find((f) => f.id === pid)?.parentId ?? null;
      }
    }
    setCreateStyle(null);
    setCreating(next);
  };

  const closeCreate = () => {
    setCreating(null);
    setCreateStyle(null);
  };

  const commitCreate = (raw: string) => {
    const c = creating;
    if (!c) return;
    const name = raw.trim();
    const style = createStyle ?? undefined;
    closeCreate();
    if (c.kind === "channel") {
      // an unnamed channel is a cancel — a container needs identity
      if (name) on.createChannel?.(name, style);
    } else if (c.kind === "folder") {
      // the container rule again: an unnamed folder is a cancel
      if (name) on.createFolder?.(c.projectId, c.parentId, name, style);
    } else {
      // an empty name still creates; the consumer defaults it (instant-create survives inline)
      on.createProject?.(c.channelId, name || undefined, style);
    }
  };

  const deleteChannel = (id: string) => on.deleteChannel?.(id, orphanProjects(projects, id));

  const deleteFolder = (id: string) =>
    on.deleteFolder?.(id, orphanFolderContents(folders, assets, id));

  const membersOf = (channelId: string | null) =>
    sortPinnedFirst(projects.filter((p) => p.channelId === channelId && !p.hidden));

  /** a project's or folder's DIRECT assets. With folders off, `folderId` is ignored entirely —
   *  the whole project renders flat, byte-identical to the pre-folder tree. */
  const assetsOf = (projectId: string, folderId: string | null = null) =>
    assetsOn
      ? assets.filter(
          (a) =>
            a.projectId === projectId &&
            !a.hidden &&
            (!foldersOn || (a.folderId ?? null) === folderId),
        )
      : [];

  const foldersOf = (projectId: string, parentId: string | null) =>
    foldersOn
      ? folders.filter(
          (f) => f.projectId === projectId && (f.parentId ?? null) === parentId && !f.hidden,
        )
      : [];

  const hiddenChannels = channels.filter((c) => c.hidden);
  const hiddenProjects = projects.filter((p) => p.hidden);
  const hiddenFolders = foldersOn ? folders.filter((f) => f.hidden) : [];
  const hiddenAssets = assetsOn ? assets.filter((a) => a.hidden) : [];
  const hiddenTotal =
    hiddenChannels.length + hiddenProjects.length + hiddenFolders.length + hiddenAssets.length;

  // ── drag wiring. Channel/project drags are REORDERS (the `reorder` capability); asset and
  //    folder drags are MOVES riding their own capability — filing, not sorting. ──
  const dragOn = (kind: NonNullable<DragState>["kind"]) =>
    kind === "asset"
      ? assetsOn && !!on.moveAssets
      : kind === "folder"
        ? foldersOn && !!on.moveFolders
        : reorder;

  const dragProps = (state: NonNullable<DragState>) =>
    dragOn(state.kind)
      ? {
          draggable: true,
          onDragStart: (e: ReactDragEvent) => {
            drag.current = state;
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", state.id);
            } catch {
              /* some engines reject setData; the ref carries the state anyway */
            }
          },
          onDragEnd: () => {
            drag.current = null;
          },
        }
      : {};

  /** true when the pointer is in the TOP half of the row under it → drop BEFORE.
   *  Falls back to `true` when geometry is unavailable (jsdom has no layout). */
  const dropBefore = (e: ReactDragEvent): boolean => {
    const r = e.currentTarget.getBoundingClientRect?.();
    if (!r || !Number.isFinite(e.clientY) || r.height === 0) return true;
    return e.clientY < r.top + r.height / 2;
  };

  const onChannelDrop = (overId: string) => (e: ReactDragEvent) => {
    const d = drag.current;
    if (!reorder || d?.kind !== "channel") return;
    e.preventDefault();
    const list = channels.filter((c) => c.id !== d.id);
    const pos = list.findIndex((c) => c.id === overId);
    const at = pos < 0 ? list.length : dropBefore(e) ? pos : pos + 1;
    on.reorderChannels?.(reorderChannels(channels, d.id, at));
    drag.current = null;
  };

  const onProjectDrop =
    (toChannelId: string | null, overProjectId: string | null) => (e: ReactDragEvent) => {
      const d = drag.current;
      if (!reorder || d?.kind !== "project") return;
      e.preventDefault();
      e.stopPropagation();
      // index against the post-removal list — the convention `moveProject` documents
      const list = projects.filter((p) => p.channelId === toChannelId && p.id !== d.id);
      const pos = overProjectId ? list.findIndex((p) => p.id === overProjectId) : -1;
      const at = pos < 0 ? list.length : dropBefore(e) ? pos : pos + 1;
      on.reorderProjects?.(moveProject(projects, d.id, toChannelId, at));
      drag.current = null;
    };

  const onAssetDrop =
    (toProjectId: string, overAssetId: string | null, toFolderId: string | null = null) =>
    (e: ReactDragEvent) => {
      const d = drag.current;
      if (d?.kind !== "asset" || !dragOn("asset")) return;
      e.preventDefault();
      e.stopPropagation();
      const list = assets.filter(
        (a) =>
          a.projectId === toProjectId &&
          a.id !== d.id &&
          (!foldersOn || (a.folderId ?? null) === toFolderId),
      );
      const pos = overAssetId ? list.findIndex((a) => a.id === overAssetId) : -1;
      const at = pos < 0 ? list.length : dropBefore(e) ? pos : pos + 1;
      // folders off → the 4-arg call: `folderId` is neither read nor written (the flat contract)
      on.moveAssets?.(moveAsset(assets, d.id, toProjectId, at, foldersOn ? toFolderId : undefined));
      drag.current = null;
    };

  /** a folder drop means INTO the target (appended last) — sibling reorder is out of scope, so
   *  a drop never means before/after. Self/descendant targets are refused HERE as well as in
   *  `moveFolder`: the no-op must not even fire the callback. */
  const onFolderDrop =
    (toProjectId: string, toParentId: string | null) => (e: ReactDragEvent) => {
      const d = drag.current;
      if (d?.kind !== "folder" || !dragOn("folder")) return;
      e.preventDefault();
      e.stopPropagation();
      if (
        toParentId !== null &&
        (toParentId === d.id || folderSubtreeIds(folders, d.id).has(toParentId))
      ) {
        drag.current = null;
        return;
      }
      const siblings = folders.filter(
        (f) =>
          f.projectId === toProjectId && (f.parentId ?? null) === toParentId && f.id !== d.id,
      );
      on.moveFolders?.(
        moveFolder(folders, assets, d.id, toProjectId, toParentId, siblings.length),
      );
      drag.current = null;
    };

  const allowDrop = (e: ReactDragEvent) => {
    if (drag.current && dragOn(drag.current.kind)) e.preventDefault();
  };

  // ── rows ────────────────────────────────────────────────────────────────────────────────────

  const nameCell = (
    kind: RowKind,
    id: string,
    name: string,
    className: string,
    commit: (v: string) => void,
  ): ReactNode =>
    editing?.kind === kind && editing.id === id ? (
      <input
        autoFocus
        defaultValue={name}
        aria-label={l.rename(name)}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        // commit on Enter/blur, revert on Esc; empty or unchanged reverts silently
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          setEditing(null);
          if (v && v !== name) commit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.currentTarget.value = name;
            setEditing(null);
          }
        }}
        className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-1 text-body-md text-ink outline-none"
      />
    ) : (
      <span className={className}>{name}</span>
    );

  /** rows carry colour as the ONE convention's CSS value (`var(--token)`); the form's active
   *  swatch needs the token NAME back — this is that convention's inverse, nothing more */
  const tokenOf = (css?: string) => css?.match(/^var\(--([A-Za-z0-9-]+)\)$/)?.[1];

  // ── the ONE form's per-kind wiring (channel / project / folder) — one lookup table so a new
  //    kind can never fork the form itself ─────────────────────────────────────────────────────
  type FormKind = "channel" | "project" | "folder";
  const formPlaceholder = (kind: FormKind) =>
    kind === "channel" ? l.channelName : kind === "project" ? l.projectName : l.folderName;
  const formGlyph = (kind: FormKind) =>
    kind === "channel" ? g.channel : kind === "project" ? g.project : g.folder;
  const formStyleOn = (kind: FormKind) =>
    kind === "channel"
      ? !!on.setChannelStyle
      : kind === "project"
        ? !!on.setProjectStyle
        : !!on.setFolderStyle;
  const formStyleHandler = (kind: FormKind) =>
    kind === "channel" ? on.setChannelStyle : kind === "project" ? on.setProjectStyle : on.setFolderStyle;
  const formRenameHandler = (kind: FormKind) =>
    kind === "channel" ? on.renameChannel : kind === "project" ? on.renameProject : on.renameFolder;

  // ── the inline CREATE form (numu1's add-form): style accumulates locally and rides the
  //    create call; leaving the form cancels (a stray click must not mint a row) ──────────────
  const createForm = (kind: FormKind) => (
    <RailStyleForm
      placeholder={formPlaceholder(kind)}
      glyph={createStyle?.glyph ?? formGlyph(kind)}
      colourToken={createStyle?.colour}
      styleTitle={l.style(formPlaceholder(kind))}
      glyphs={styleGlyphs}
      renderGlyph={renderGlyph}
      indent={kind === "project"}
      styleOn={formStyleOn(kind)}
      labels={{ save: l.save }}
      onStyle={(s) => setCreateStyle((cur) => (s === null ? null : { ...(cur ?? {}), ...s }))}
      onCommit={commitCreate}
      onCancel={closeCreate}
    />
  );

  // ── the inline EDIT form — the SAME anatomy on a stored row (Em's ruling: name, icon and
  //    colour in one session). Style picks live-apply through the style handlers; the name
  //    commits on Enter/✓/leave (numu1's rename-on-blur). ─────────────────────────────────────
  const editForm = (
    kind: FormKind,
    row: { id: string; name: string; icon?: string; colour?: string },
    indent: boolean,
  ) => (
    <RailStyleForm
      initialName={row.name}
      placeholder={formPlaceholder(kind)}
      glyph={row.icon ?? formGlyph(kind)}
      colourToken={tokenOf(row.colour)}
      styleTitle={l.style(row.name)}
      glyphs={styleGlyphs}
      renderGlyph={renderGlyph}
      indent={indent}
      commitOnLeave
      styleOn={formStyleOn(kind)}
      labels={{ save: l.save }}
      onStyle={(s) => formStyleHandler(kind)?.(row.id, s)}
      onCommit={(raw) => {
        const v = raw.trim();
        setEditing(null);
        if (v && v !== row.name) formRenameHandler(kind)?.(row.id, v);
      }}
      onCancel={() => setEditing(null)}
    />
  );

  // depth 0 sits at the old `pl-8` exactly (2rem); each folder level steps 1rem — the ONE
  // computed indent in the file, confined to the sub-project zone
  const assetRow = (a: RailAsset, depth = 0) => (
    <div
      key={a.id}
      {...dragProps({ kind: "asset", id: a.id })}
      onDragOver={allowDrop}
      onDrop={onAssetDrop(a.projectId, a.id, foldersOn ? (a.folderId ?? null) : null)}
      style={{ paddingLeft: `${2 + depth}rem` }}
      className={`group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md pr-1.5 text-left hover:bg-surface-2 ${
        a.hidden ? "opacity-55" : ""
      }`}
    >
      {icons && (
        <span className="flex shrink-0 text-mute">{renderGlyph(a.icon ?? g.asset, "1rem")}</span>
      )}
      <button
        type="button"
        onClick={() => on.selectAsset?.(a.id)}
        className="min-w-0 flex-1 cursor-pointer truncate text-left text-body-sm text-dim hover:text-ink"
      >
        {nameCell("asset", a.id, a.name, "block truncate", (v) => on.renameAsset?.(a.id, v))}
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
        {a.hidden ? (
          <>
            <RowAction
              glyph={g.restore}
              title={l.restore(a.name)}
              onClick={() => on.setAssetHidden?.(a.id, false)}
            />
            <RowAction
              glyph={g.remove}
              title={l.remove(a.name)}
              onClick={() => on.deleteAsset?.(a.id)}
            />
          </>
        ) : (
          // assets are menu-only: no promoted quick action earned a seat here
          <RowAction
            glyph={g.more}
            title={l.more(a.name)}
            onClick={(el) => setMenu({ kind: "asset", id: a.id, anchor: el })}
          />
        )}
      </span>
    </div>
  );

  /**
   * A folder row + its children — the ONE recursive function in the file, confined to the
   * sub-project zone. `seen` is the cycle guard: consumer data with a `parentId` loop must
   * render finitely, never hang the tier.
   */
  const folderBlock = (f: RailFolder, depth: number, seen: ReadonlySet<string>): ReactNode => {
    if (seen.has(f.id)) return null;
    const childSeen = new Set(seen).add(f.id);
    const key = foldKey(f.id);
    const isFolded = folded.has(key);
    const childFolders = foldersOf(f.projectId, f.id);
    const childAssets = assetsOf(f.projectId, f.id);
    const count = childFolders.length + childAssets.length;
    const isEditing = editing?.kind === "folder" && editing.id === f.id;
    const active = f.id === activeFolderId;

    return (
      <div key={f.id}>
        {isEditing ? (
          <div style={{ paddingLeft: `${2 + depth}rem` }}>{editForm("folder", f, false)}</div>
        ) : (
          <div
            {...dragProps({ kind: "folder", id: f.id })}
            onDragOver={allowDrop}
            onDrop={(e) => {
              // two drop meanings on one row: a FOLDER lands INTO this folder; an ASSET files
              // into it. Each handler guards on its drag kind, the projectRow precedent.
              onFolderDrop(f.projectId, f.id)(e);
              onAssetDrop(f.projectId, null, f.id)(e);
            }}
            style={{ paddingLeft: `${2 + depth}rem` }}
            className={`group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md pr-1.5 text-left hover:bg-surface-2 ${
              active ? "bg-signal-tint" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => toggleFold(key)}
              title={isFolded ? l.unfold(f.name) : l.fold(f.name)}
              aria-label={isFolded ? l.unfold(f.name) : l.fold(f.name)}
              aria-expanded={!isFolded}
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-dim hover:text-ink"
            >
              <Symbol name={isFolded ? g.folded : g.unfolded} size="1rem" />
            </button>
            {colour && f.colour && (
              <span
                aria-hidden
                className="h-4 w-0.5 shrink-0 rounded-full"
                style={{ background: f.colour }}
              />
            )}
            {icons && (
              <span className="flex shrink-0 text-dim">
                {renderGlyph(f.icon ?? (isFolded ? g.folder : g.folderOpen), "1rem")}
              </span>
            )}
            {on.selectFolder ? (
              // declared-not-detected: only a consumer with a folder viewer gets a button here
              <button
                type="button"
                onClick={() => on.selectFolder?.(f.id)}
                aria-current={active ? "true" : undefined}
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-body-sm text-ink"
              >
                {nameCell("folder", f.id, f.name, "block truncate", (v) =>
                  on.renameFolder?.(f.id, v),
                )}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                {nameCell("folder", f.id, f.name, "block truncate", (v) =>
                  on.renameFolder?.(f.id, v),
                )}
              </span>
            )}
            {/* the count stays visible while folded — the channel lesson, one level down */}
            {isFolded && <span className="shrink-0 text-label-sm text-mute">{count}</span>}
            <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
              {on.createFolder && (
                <RowAction
                  glyph={g.add}
                  title={l.newFolderIn(f.name)}
                  onClick={() =>
                    openCreate({ kind: "folder", projectId: f.projectId, parentId: f.id })
                  }
                />
              )}
              <RowAction
                glyph={g.more}
                title={l.more(f.name)}
                onClick={(el) => setMenu({ kind: "folder", id: f.id, anchor: el })}
              />
            </span>
          </div>
        )}
        {creating?.kind === "folder" && creating.parentId === f.id && (
          <div style={{ paddingLeft: `${3 + depth}rem` }}>{createForm("folder")}</div>
        )}
        {!isFolded &&
          (count > 0 ? (
            <>
              {childFolders.map((cf) => folderBlock(cf, depth + 1, childSeen))}
              {childAssets.map((a) => assetRow(a, depth + 1))}
            </>
          ) : (
            <p style={{ paddingLeft: `${3 + depth}rem` }} className="pr-1.5 text-label-sm text-mute">
              {l.emptyFolder}
            </p>
          ))}
      </div>
    );
  };

  /** the sub-project zone: folders first, loose assets after — plus the root-level folder
   *  create form when this project is the target */
  const subProjectZone = (p: RailProject) => {
    if (p.hidden) return null;
    const myFolders = foldersOf(p.id, null);
    const mine = assetsOf(p.id, null);
    return (
      <>
        {creating?.kind === "folder" &&
          creating.projectId === p.id &&
          creating.parentId === null && (
            <div style={{ paddingLeft: "2rem" }}>{createForm("folder")}</div>
          )}
        {myFolders.map((f) => folderBlock(f, 0, EMPTY_SEEN))}
        {mine.map((a) => assetRow(a, 0))}
      </>
    );
  };

  const projectRow = (p: RailProject, inChannel: string | null) => {
    const active = p.id === activeProjectId;
    const acts: ReactNode = p.hidden ? (
      // a hidden row offers restore + delete ONLY: rename, pin and hide are meaningless on
      // something already hidden
      <>
        <RowAction
          glyph={g.restore}
          title={l.restore(p.name)}
          onClick={() => on.setProjectHidden?.(p.id, false)}
        />
        <RowAction
          glyph={g.remove}
          title={l.remove(p.name)}
          onClick={() => on.deleteProject?.(p.id)}
        />
      </>
    ) : (
      // the promoted quick action (duplicate) + the overflow trigger — everything else is menu
      <>
        {on.duplicateProject && (
          <RowAction
            glyph={g.duplicate}
            title={l.duplicate(p.name)}
            onClick={() => on.duplicateProject?.(p.id)}
          />
        )}
        <RowAction
          glyph={g.more}
          title={l.more(p.name)}
          onClick={(el) => setMenu({ kind: "project", id: p.id, anchor: el })}
        />
      </>
    );

    // the EDIT form takes the whole row (name + icon + colour, one session — Em's ruling)
    if (!p.hidden && editing?.kind === "project" && editing.id === p.id) {
      return (
        <div key={p.id}>
          {editForm("project", p, true)}
          {subProjectZone(p)}
        </div>
      );
    }

    return (
      <div key={p.id}>
        <div
          {...dragProps({ kind: "project", id: p.id })}
          onDragOver={allowDrop}
          onDrop={(e) => {
            // one surface, three drop meanings: a PROJECT lands as a reorder into this row's
            // channel; an ASSET lands INTO this project's root; a FOLDER re-homes to the root.
            // Each handler guards on its drag kind.
            onProjectDrop(inChannel, p.id)(e);
            onAssetDrop(p.id, null)(e);
            onFolderDrop(p.id, null)(e);
          }}
          // `group` so the actions can be hover-only — they cost nothing at rest
          className={`group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md pl-4 pr-1.5 text-left hover:bg-surface-2 ${
            active ? "bg-signal-tint" : ""
          } ${p.hidden ? "opacity-55" : ""}`}
        >
          {reorder && (
            <Symbol name={g.drag} size="1rem" className="shrink-0 cursor-grab text-mute" />
          )}
          {colour && p.colour && (
            <span
              aria-hidden
              className="h-4 w-0.5 shrink-0 rounded-full"
              style={{ background: p.colour }}
            />
          )}
          {icons && (
            <span className="flex shrink-0 text-dim">
              {renderGlyph(p.icon ?? g.project, "1.125rem")}
            </span>
          )}
          <button
            type="button"
            onClick={() => on.selectProject?.(p.id)}
            aria-current={active ? "true" : undefined}
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-body-md text-ink"
          >
            {nameCell(
              "project",
              p.id,
              p.name,
              "block truncate",
              (v) => on.renameProject?.(p.id, v),
            )}
          </button>
          {active && <Symbol name={g.active} size="0.625rem" className="shrink-0 text-signal" />}
          {/* a pinned row WEARS its pin, outside the fade — state, not chrome (numu1's dot);
              the click is the one-step unpin */}
          {p.pinned && !p.hidden && (
            <RowAction
              glyph={g.pin}
              filled
              title={l.unpin(p.name)}
              onClick={() => on.togglePin?.(p.id, false)}
            />
          )}
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
            {acts}
          </span>
        </div>
        {subProjectZone(p)}
      </div>
    );
  };

  const channelBlock = (c: RailChannel) => {
    const mine = membersOf(c.id);
    const isFolded = folded.has(c.id);
    const isEditing = editing?.kind === "channel" && editing.id === c.id;
    return (
      <div key={c.id} onDragOver={allowDrop} onDrop={onProjectDrop(c.id, null)}>
        {isEditing ? (
          editForm("channel", c, false)
        ) : (
        <div
          {...dragProps({ kind: "channel", id: c.id })}
          onDragOver={allowDrop}
          onDrop={onChannelDrop(c.id)}
          className="group flex h-[var(--ctl-h)] w-full items-center gap-1.5 rounded-md px-1.5 hover:bg-surface-2"
        >
          {reorder && (
            <Symbol name={g.drag} size="1rem" className="shrink-0 cursor-grab text-mute" />
          )}
          <button
            type="button"
            onClick={() => toggleFold(c.id)}
            title={isFolded ? l.unfold(c.name) : l.fold(c.name)}
            aria-label={isFolded ? l.unfold(c.name) : l.fold(c.name)}
            aria-expanded={!isFolded}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-dim hover:text-ink"
          >
            <Symbol name={isFolded ? g.folded : g.unfolded} size="1.125rem" />
          </button>
          {colour && c.colour && (
            <span
              aria-hidden
              className="h-4 w-0.5 shrink-0 rounded-full"
              style={{ background: c.colour }}
            />
          )}
          {icons && (
            <span className="flex shrink-0 text-dim">
              {renderGlyph(c.icon ?? g.channel, "1.125rem")}
            </span>
          )}
          {nameCell(
            "channel",
            c.id,
            c.name,
            "min-w-0 flex-1 truncate text-label-lg text-ink",
            (v) => on.renameChannel?.(c.id, v),
          )}
          {/* the count stays visible while folded — it is what keeps telling you what is inside */}
          <span className="shrink-0 text-label-sm text-mute">{mine.length}</span>
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
            <RowAction
              glyph={g.add}
              title={l.newProjectIn(c.name)}
              onClick={() => openCreate({ kind: "project", channelId: c.id })}
            />
            <RowAction
              glyph={g.more}
              title={l.more(c.name)}
              onClick={(el) => setMenu({ kind: "channel", id: c.id, anchor: el })}
            />
          </span>
        </div>
        )}
        {creating?.kind === "project" && creating.channelId === c.id && createForm("project")}
        {!isFolded &&
          (mine.length ? (
            mine.map((p) => projectRow(p, c.id))
          ) : (
            <p className="pl-4 pr-1.5 text-label-sm text-mute">{l.noProjects}</p>
          ))}
      </div>
    );
  };

  const unfiled = membersOf(null);

  // ── the overflow menu's items, built from the LIVE row so pin/unpin reads current state.
  //    Conditional items follow the declared-not-detected law exactly as the inline icons did:
  //    no handler → no item, never a disabled one. ─────────────────────────────────────────────
  const menuItems = ((): RailRowMenuItem[] => {
    if (!menu) return [];
    if (menu.kind === "channel") {
      const c = channels.find((x) => x.id === menu.id);
      if (!c) return [];
      return [
        {
          // Rename opens the FULL edit form — name, icon and colour in one session (the style
          // menu item folded into it; fewer trips was the whole point of the ruling)
          glyph: g.rename,
          label: l.rename(c.name),
          onClick: () => setEditing({ kind: "channel", id: c.id }),
        },
        {
          glyph: g.hide,
          label: l.hide(c.name),
          onClick: () => on.setChannelHidden?.(c.id, true),
        },
        { glyph: g.remove, label: l.remove(c.name), onClick: () => deleteChannel(c.id) },
      ];
    }
    if (menu.kind === "project") {
      const p = projects.find((x) => x.id === menu.id);
      if (!p) return [];
      return [
        {
          // the full edit form here too — see the channel item's note
          glyph: g.rename,
          label: l.rename(p.name),
          onClick: () => setEditing({ kind: "project", id: p.id }),
        },
        // the folder level's root create door — a menu item, not a second promoted icon (the
        // row economy the 2026-08-01 round bought stays bought)
        ...(foldersOn && on.createFolder
          ? [
              {
                glyph: g.create,
                label: l.newFolderIn(p.name),
                onClick: () => openCreate({ kind: "folder", projectId: p.id, parentId: null }),
              },
            ]
          : []),
        {
          glyph: p.pinned ? g.unpin : g.pin,
          label: p.pinned ? l.unpin(p.name) : l.pin(p.name),
          onClick: () => on.togglePin?.(p.id, !p.pinned),
        },
        {
          glyph: g.hide,
          label: l.hide(p.name),
          onClick: () => on.setProjectHidden?.(p.id, true),
        },
        { glyph: g.remove, label: l.remove(p.name), onClick: () => on.deleteProject?.(p.id) },
      ];
    }
    if (menu.kind === "folder") {
      const f = folders.find((x) => x.id === menu.id);
      if (!f) return [];
      return [
        {
          glyph: g.rename,
          label: l.rename(f.name),
          onClick: () => setEditing({ kind: "folder", id: f.id }),
        },
        ...(on.createFolder
          ? [
              {
                glyph: g.create,
                label: l.newFolderIn(f.name),
                onClick: () => openCreate({ kind: "folder", projectId: f.projectId, parentId: f.id }),
              },
            ]
          : []),
        {
          glyph: g.hide,
          label: l.hide(f.name),
          onClick: () => on.setFolderHidden?.(f.id, true),
        },
        { glyph: g.remove, label: l.remove(f.name), onClick: () => deleteFolder(f.id) },
      ];
    }
    const a = assets.find((x) => x.id === menu.id);
    if (!a) return [];
    return [
      {
        glyph: g.rename,
        label: l.rename(a.name),
        onClick: () => setEditing({ kind: "asset", id: a.id }),
      },
      ...(on.duplicateAsset
        ? [
            {
              glyph: g.duplicate,
              label: l.duplicate(a.name),
              onClick: () => on.duplicateAsset?.(a.id),
            },
          ]
        : []),
      {
        glyph: g.hide,
        label: l.hide(a.name),
        onClick: () => on.setAssetHidden?.(a.id, true),
      },
      { glyph: g.remove, label: l.remove(a.name), onClick: () => on.deleteAsset?.(a.id) },
    ];
  })();

  // the menu's accessible name — the same label as the trigger that opened it
  const menuName = (() => {
    if (!menu) return "";
    const src: { id: string; name: string }[] =
      menu.kind === "channel"
        ? channels
        : menu.kind === "project"
          ? projects
          : menu.kind === "folder"
            ? folders
            : assets;
    const row = src.find((x) => x.id === menu.id);
    return row ? l.more(row.name) : "";
  })();

  return (
    <nav aria-label={l.tree} className="flex w-full flex-col gap-0.5 py-2">
      {channels.filter((c) => !c.hidden).map(channelBlock)}

      {unfiled.length > 0 && (
        <div onDragOver={allowDrop} onDrop={onProjectDrop(null, null)}>
          <SectionHead label={l.unfiled} count={unfiled.length} />
          {unfiled.map((p) => projectRow(p, null))}
        </div>
      )}

      {/* "New channel" is a full-width LABELLED row at the tree's foot (numu1's shape): the
          container's creation reads as a sentence, not a corner glyph to decode. It makes a
          CHANNEL — one meaning, no menu; a project is created from the channel that will own
          it, which is the only place the answer is unambiguous. Both open the inline form. */}
      {creating?.kind === "channel" ? (
        createForm("channel")
      ) : (
        <button
          type="button"
          title={l.newChannel}
          aria-label={l.newChannel}
          onClick={() => openCreate({ kind: "channel" })}
          // NO w-full: the nav is a flex COLUMN, so this stretches to full width by itself —
          // and only without an explicit width can mx-* inset it (w-full + mx overflows right)
          className="mx-1.5 mt-1 flex h-[var(--ctl-h)] cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-label-md text-dim hover:bg-surface-2 hover:text-ink"
        >
          <Symbol name={g.create} size="1.125rem" />
          <span>{l.newChannel}</span>
        </button>
      )}

      {/* Hidden items get no permanent chrome: this line IS the entry point and it only exists
          when something is actually hidden. Clicking the section head folds it away again — the
          same affordance that opened it, in reverse. */}
      {hiddenTotal > 0 &&
        (showHidden ? (
          <div>
            <button
              type="button"
              onClick={() => setShowHidden(false)}
              className="w-full cursor-pointer text-left"
            >
              <SectionHead label={l.hiddenSection} count={hiddenTotal} />
            </button>
            {hiddenChannels.map((c) => (
              <div
                key={c.id}
                className="group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md px-1.5 opacity-55 hover:bg-surface-2"
              >
                {icons && (
                  <span className="flex shrink-0 text-dim">
                    {renderGlyph(c.icon ?? g.channel, "1.125rem")}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-label-lg text-ink">{c.name}</span>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                  <RowAction
                    glyph={g.restore}
                    title={l.restore(c.name)}
                    onClick={() => on.setChannelHidden?.(c.id, false)}
                  />
                  <RowAction
                    glyph={g.remove}
                    title={l.remove(c.name)}
                    onClick={() => deleteChannel(c.id)}
                  />
                </span>
              </div>
            ))}
            {hiddenProjects.map((p) => projectRow(p, p.channelId))}
            {/* hidden folders render as BARE rows (the hidden-channel precedent: no children,
                no fold — restoring is the way back to structure) */}
            {hiddenFolders.map((f) => (
              <div
                key={f.id}
                className="group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md px-1.5 opacity-55 hover:bg-surface-2"
              >
                {icons && (
                  <span className="flex shrink-0 text-dim">
                    {renderGlyph(f.icon ?? g.folder, "1rem")}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{f.name}</span>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                  <RowAction
                    glyph={g.restore}
                    title={l.restore(f.name)}
                    onClick={() => on.setFolderHidden?.(f.id, false)}
                  />
                  <RowAction
                    glyph={g.remove}
                    title={l.remove(f.name)}
                    onClick={() => deleteFolder(f.id)}
                  />
                </span>
              </div>
            ))}
            {hiddenAssets.map((a) => assetRow(a))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowHidden(true)}
            className="cursor-pointer pl-1.5 pt-2 text-left text-label-sm text-mute hover:text-ink"
          >
            {l.hiddenCount(hiddenTotal)}
          </button>
        ))}

      {/* ONE overflow menu for the whole tree — items built from the live row (see above) */}
      <RailRowMenu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorRef={menuAnchorRef}
        label={menuName}
        items={menuItems}
      />
    </nav>
  );
}

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 pl-1.5 pt-2">
      <span className="text-label-md text-mute">{label}</span>
      <span className="text-label-sm text-mute">{count}</span>
    </div>
  );
}

/**
 * A row affordance.
 *
 * It carries no visibility rule of its own: the hover-only fade lives on the SPAN that wraps a
 * row's cluster, so the one control that must be reachable at rest (the top `+`) simply is not
 * inside such a span. One home for the rule, and no `always` flag to get backwards.
 */
function RowAction({
  glyph,
  title,
  filled = false,
  onClick,
}: {
  glyph: string;
  title: string;
  /** the pinned-state dot renders FILLED — state wears the solid mark, chrome stays outlined */
  filled?: boolean;
  /** the clicked element rides along so an action can ANCHOR something to itself (the menu) */
  onClick: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-dim hover:bg-surface-2 hover:text-ink"
    >
      <Symbol name={glyph} filled={filled} size="1rem" />
    </button>
  );
}
