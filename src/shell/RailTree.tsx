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
  icon?: string;
  hidden?: boolean;
}

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
 */
export function moveAsset(
  assets: RailAsset[],
  movedId: string,
  toProjectId: string,
  toIndex: number,
): RailAsset[] {
  const moved = assets.find((a) => a.id === movedId);
  if (!moved) return [...assets];
  const rest = assets.filter((a) => a.id !== movedId);
  const next: RailAsset = { ...moved, projectId: toProjectId };
  const members = rest.filter((a) => a.projectId === toProjectId);
  if (members.length === 0) return [...rest, next];
  const at = Math.max(0, Math.min(toIndex, members.length));
  const anchor = at < members.length ? members[at] : members[members.length - 1];
  const anchorAt = anchor ? rest.indexOf(anchor) : rest.length;
  const insertAt = at < members.length ? anchorAt : anchorAt + 1;
  return [...rest.slice(0, insertAt), next, ...rest.slice(insertAt)];
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
};

export interface RailTreeLabels {
  newChannel: string;
  newProjectIn: (channel: string) => string;
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
  /** the inline form's ✓ commit */
  save: string;
  unfiled: string;
  hiddenSection: string;
  hiddenCount: (n: number) => string;
  noProjects: string;
  tree: string;
}

export const DEFAULT_RAIL_TREE_LABELS: RailTreeLabels = {
  newChannel: "New channel",
  newProjectIn: (c) => `New project in ${c}`,
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
  save: "Save",
  unfiled: "Unfiled",
  hiddenSection: "Hidden",
  hiddenCount: (n) => `${n} hidden`,
  noProjects: "no projects yet",
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
  // ── the style door (the pickers, decision 3) — null clears back to defaults ──
  setChannelStyle?: (id: string, style: RailRowStyle | null) => void;
  setProjectStyle?: (id: string, style: RailRowStyle | null) => void;
}

export interface RailTreeProps {
  channels: RailChannel[];
  projects: RailProject[];
  /** ignored entirely unless the `assets` capability is declared */
  assets?: RailAsset[];
  activeProjectId?: string | null;
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

type DragState =
  | { kind: "channel"; id: string }
  | { kind: "project"; id: string }
  | { kind: "asset"; id: string }
  | null;

export function RailTree({
  channels,
  projects,
  assets = [],
  activeProjectId = null,
  capabilities = {},
  labels,
  glyphs,
  styleGlyphs,
  renderGlyph = renderMaterialGlyph,
  on = {},
}: RailTreeProps) {
  const l = { ...DEFAULT_RAIL_TREE_LABELS, ...labels };
  const g = { ...DEFAULT_RAIL_GLYPHS, ...glyphs };
  const { reorder = false, colour = false, icons = true, assets: assetsOn = false } = capabilities;

  /** folded channels, by id — id-keyed so it survives any re-render or list reshuffle */
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<{ kind: "channel" | "project" | "asset"; id: string } | null>(null);
  const drag = useRef<DragState>(null);

  // the ONE overflow menu (2026-08-01) — a single instance for the whole tree
  const [menu, setMenu] = useState<{
    kind: "channel" | "project" | "asset";
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const menuAnchorRef = { current: menu?.anchor ?? null };

  // the inline create form (the numu1 gesture): name + style picked BEFORE the row exists, so
  // the create handlers receive both and no consumer window.prompt survives
  const [creating, setCreating] = useState<
    { kind: "channel" } | { kind: "project"; channelId: string } | null
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

  /** INVARIANT 2 — unfold FIRST, then open the create row. The row must be born visible. */
  const openCreate = (next: { kind: "channel" } | { kind: "project"; channelId: string }) => {
    if (next.kind === "project") unfold(next.channelId);
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
    } else {
      // an empty name still creates; the consumer defaults it (instant-create survives inline)
      on.createProject?.(c.channelId, name || undefined, style);
    }
  };

  const deleteChannel = (id: string) => on.deleteChannel?.(id, orphanProjects(projects, id));

  const membersOf = (channelId: string | null) =>
    sortPinnedFirst(projects.filter((p) => p.channelId === channelId && !p.hidden));

  const assetsOf = (projectId: string) =>
    assetsOn ? assets.filter((a) => a.projectId === projectId && !a.hidden) : [];

  const hiddenChannels = channels.filter((c) => c.hidden);
  const hiddenProjects = projects.filter((p) => p.hidden);
  const hiddenAssets = assetsOn ? assets.filter((a) => a.hidden) : [];
  const hiddenTotal = hiddenChannels.length + hiddenProjects.length + hiddenAssets.length;

  // ── drag wiring. Channel/project drags are REORDERS (the `reorder` capability); an asset drag
  //    is a MOVE and rides `assets` — a consumer without sortable lists still files. ──
  const dragOn = (kind: NonNullable<DragState>["kind"]) =>
    kind === "asset" ? assetsOn && !!on.moveAssets : reorder;

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
    (toProjectId: string, overAssetId: string | null) => (e: ReactDragEvent) => {
      const d = drag.current;
      if (d?.kind !== "asset" || !dragOn("asset")) return;
      e.preventDefault();
      e.stopPropagation();
      const list = assets.filter((a) => a.projectId === toProjectId && a.id !== d.id);
      const pos = overAssetId ? list.findIndex((a) => a.id === overAssetId) : -1;
      const at = pos < 0 ? list.length : dropBefore(e) ? pos : pos + 1;
      on.moveAssets?.(moveAsset(assets, d.id, toProjectId, at));
      drag.current = null;
    };

  const allowDrop = (e: ReactDragEvent) => {
    if (drag.current && dragOn(drag.current.kind)) e.preventDefault();
  };

  // ── rows ────────────────────────────────────────────────────────────────────────────────────

  const nameCell = (
    kind: "channel" | "project" | "asset",
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

  // ── the inline CREATE form (numu1's add-form): style accumulates locally and rides the
  //    create call; leaving the form cancels (a stray click must not mint a row) ──────────────
  const createForm = (kind: "channel" | "project") => (
    <RailStyleForm
      placeholder={kind === "channel" ? l.channelName : l.projectName}
      glyph={createStyle?.glyph ?? (kind === "channel" ? g.channel : g.project)}
      colourToken={createStyle?.colour}
      styleTitle={l.style(kind === "channel" ? l.channelName : l.projectName)}
      glyphs={styleGlyphs}
      renderGlyph={renderGlyph}
      indent={kind === "project"}
      styleOn={kind === "channel" ? !!on.setChannelStyle : !!on.setProjectStyle}
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
    kind: "channel" | "project",
    row: { id: string; name: string; icon?: string; colour?: string },
    indent: boolean,
  ) => (
    <RailStyleForm
      initialName={row.name}
      placeholder={kind === "channel" ? l.channelName : l.projectName}
      glyph={row.icon ?? (kind === "channel" ? g.channel : g.project)}
      colourToken={tokenOf(row.colour)}
      styleTitle={l.style(row.name)}
      glyphs={styleGlyphs}
      renderGlyph={renderGlyph}
      indent={indent}
      commitOnLeave
      styleOn={kind === "channel" ? !!on.setChannelStyle : !!on.setProjectStyle}
      labels={{ save: l.save }}
      onStyle={(s) =>
        kind === "channel" ? on.setChannelStyle?.(row.id, s) : on.setProjectStyle?.(row.id, s)
      }
      onCommit={(raw) => {
        const v = raw.trim();
        setEditing(null);
        if (v && v !== row.name)
          (kind === "channel" ? on.renameChannel : on.renameProject)?.(row.id, v);
      }}
      onCancel={() => setEditing(null)}
    />
  );

  const assetRow = (a: RailAsset) => (
    <div
      key={a.id}
      {...dragProps({ kind: "asset", id: a.id })}
      onDragOver={allowDrop}
      onDrop={onAssetDrop(a.projectId, a.id)}
      className={`group flex h-[var(--row-h)] w-full items-center gap-1.5 rounded-md pl-8 pr-1.5 text-left hover:bg-surface-2 ${
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

    const mine = p.hidden ? [] : assetsOf(p.id);

    // the EDIT form takes the whole row (name + icon + colour, one session — Em's ruling)
    if (!p.hidden && editing?.kind === "project" && editing.id === p.id) {
      return (
        <div key={p.id}>
          {editForm("project", p, true)}
          {mine.map(assetRow)}
        </div>
      );
    }

    return (
      <div key={p.id}>
        <div
          {...dragProps({ kind: "project", id: p.id })}
          onDragOver={allowDrop}
          onDrop={(e) => {
            // one surface, two drop meanings: a PROJECT lands as a reorder into this row's
            // channel; an ASSET lands INTO this project. Each handler guards on its drag kind.
            onProjectDrop(inChannel, p.id)(e);
            onAssetDrop(p.id, null)(e);
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
        {mine.map(assetRow)}
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
      menu.kind === "channel" ? channels : menu.kind === "project" ? projects : assets;
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
            {hiddenAssets.map(assetRow)}
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
