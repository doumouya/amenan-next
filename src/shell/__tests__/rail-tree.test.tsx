// @vitest-environment jsdom
//
// The two invariants RailTree's Figma description says it OWNS, plus the reorder maths.
//
// Both invariants are the same species of bug: the mutation succeeds and the UI gives no evidence
// of it, so they get reported as "the button is broken" and fixed in the wrong place.

import { describe, it, expect } from "vitest";
import {
  RailTree,
  orphanProjects,
  sortPinnedFirst,
  reorderChannels,
  moveProject,
  DEFAULT_RAIL_TREE_LABELS as L,
  type RailChannel,
  type RailProject,
} from "../RailTree";
import { mount } from "./render";

const channels: RailChannel[] = [
  { id: "c1", name: "engineering" },
  { id: "c2", name: "operations" },
];
const projects: RailProject[] = [
  { id: "p1", name: "datacore", channelId: "c1" },
  { id: "p2", name: "numu2", channelId: "c1" },
  { id: "p3", name: "scratch", channelId: null },
];

describe("invariant 1 — deleting a channel ORPHANS its projects", () => {
  it("moves them to Unfiled and destroys nothing", () => {
    const next = orphanProjects(projects, "c1");
    expect(next).toHaveLength(3); // nothing removed
    expect(next.filter((p) => p.channelId === null).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(next.find((p) => p.id === "p1")?.name).toBe("datacore"); // and nothing mangled
  });

  it("leaves other channels' projects alone and never mutates the input", () => {
    const input = projects.map((p) => ({ ...p }));
    const next = orphanProjects(input, "c2");
    expect(next.find((p) => p.id === "p1")?.channelId).toBe("c1");
    expect(input).toEqual(projects); // pure
  });

  it("hands the orphaned list to the delete callback, so it cannot be written without it", async () => {
    let handed: RailProject[] | null = null;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{ deleteChannel: (_id, orphaned) => (handed = orphaned) }}
      />,
    );
    // delete lives behind the row's overflow menu now (the 2026-08-01 UX round)
    await m.click(m.button(L.more("engineering")));
    await m.click(m.button(L.remove("engineering")));
    expect(handed).not.toBeNull();
    expect(handed!.filter((p) => p.channelId === null)).toHaveLength(3);
    await m.unmount();
  });
});

describe("invariant 2 — creating into a folded channel UNFOLDS it first", () => {
  it("re-reveals the channel's rows, so the create row is born visible", async () => {
    let created: [string | null, string | undefined] | null = null;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{ createProject: (id, name) => (created = [id, name]) }}
      />,
    );

    expect(m.text()).toContain("datacore"); // starts unfolded

    await m.click(m.button(L.fold("engineering")));
    expect(m.text()).not.toContain("datacore");
    // the count badge stays visible while folded — it is what keeps telling you what is inside
    expect(m.button(L.unfold("engineering")).closest("div")?.textContent).toContain("2");

    await m.click(m.button(L.newProjectIn("engineering")));
    // WITHOUT this unfold the create row opens inside a folded block and NOTHING appears to happen
    expect(m.text()).toContain("datacore");

    // Enter on the EMPTY name still creates — the consumer defaults it (instant-create survives)
    const input = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.projectName}"]`,
    )!;
    await m.key(input, "Enter");
    expect(created).toEqual(["c1", undefined]);
    await m.unmount();
  });

  it("routes the top control to a CHANNEL and a channel's + to a project in it, names attached", async () => {
    const calls: string[] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{
          createChannel: (name) => calls.push(`channel:${name}`),
          createProject: (id, name) => calls.push(`project:${id}:${name}`),
        }}
      />,
    );
    // both creates go through the INLINE ROW now (the numu1 gesture): open, type, Enter
    await m.click(m.button(L.newChannel));
    const cIn = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.channelName}"]`,
    )!;
    cIn.value = "gcp";
    await m.key(cIn, "Enter");

    await m.click(m.button(L.newProjectIn("operations")));
    const pIn = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.projectName}"]`,
    )!;
    pIn.value = "alpha";
    await m.key(pIn, "Enter");
    // one control could never mean both — a wrong shape underneath the button, not a bug in it
    expect(calls).toEqual(["channel:gcp", "project:c2:alpha"]);
    await m.unmount();
  });

  it("an unnamed channel is a cancel; Esc abandons without firing", async () => {
    const calls: string[] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{ createChannel: (name) => calls.push(name) }}
      />,
    );
    await m.click(m.button(L.newChannel));
    const cIn = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.channelName}"]`,
    )!;
    await m.key(cIn, "Enter"); // empty commit — a container needs identity
    expect(calls).toEqual([]);
    expect(m.container.querySelector(`input[aria-label="${L.channelName}"]`)).toBeNull();

    await m.click(m.button(L.newChannel));
    const again = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.channelName}"]`,
    )!;
    again.value = "gcp";
    await m.key(again, "Escape");
    expect(calls).toEqual([]);
    await m.unmount();
  });

  it("a style picked on the create form rides the create call — the swatches are ONE click", async () => {
    let got: [string, unknown] | null = null;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        // setChannelStyle declares the style capability (styleOn); the pick still rides create
        on={{ createChannel: (name, style) => (got = [name, style]), setChannelStyle: () => {} }}
      />,
    );
    await m.click(m.button(L.newChannel));
    // no popover trip: the colour line is ALWAYS visible on the form (the numu1 gesture)
    await m.click(m.button("Colour chart-3"));
    const cIn = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.channelName}"]`,
    )!;
    cIn.value = "gcp";
    await m.key(cIn, "Enter");
    expect(got).toEqual(["gcp", { colour: "chart-3" }]);
    await m.unmount();
  });
});

describe("pin sorts WITHIN the channel", () => {
  it("lifts pinned projects without creating a competing top-level group", () => {
    const rows: RailProject[] = [
      { id: "a", name: "a", channelId: "c1" },
      { id: "b", name: "b", channelId: "c1", pinned: true },
      { id: "c", name: "c", channelId: "c1" },
    ];
    expect(sortPinnedFirst(rows).map((p) => p.id)).toEqual(["b", "a", "c"]);
    // stable for the unpinned tail — a pin is not a reshuffle
    expect(sortPinnedFirst(rows.filter((p) => !p.pinned)).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("reorder maths (the `reorder` capability's pure core)", () => {
  it("moves a channel and clamps an out-of-range index", () => {
    expect(reorderChannels(channels, "c2", 0).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(reorderChannels(channels, "c1", 99).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(reorderChannels(channels, "nope", 0).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("reorders a project within its channel", () => {
    const next = moveProject(projects, "p2", "c1", 0);
    expect(next.filter((p) => p.channelId === "c1").map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("moves a project across channels, and into Unfiled", () => {
    const toC2 = moveProject(projects, "p1", "c2", 0);
    expect(toC2.find((p) => p.id === "p1")?.channelId).toBe("c2");
    expect(toC2.filter((p) => p.channelId === "c1").map((p) => p.id)).toEqual(["p2"]);

    const toUnfiled = moveProject(projects, "p1", null, 0);
    expect(toUnfiled.find((p) => p.id === "p1")?.channelId).toBeNull();
    expect(toUnfiled).toHaveLength(3);
  });

  it("appends past the end and never mutates the input", () => {
    const input = projects.map((p) => ({ ...p }));
    const next = moveProject(input, "p1", "c1", 99);
    expect(next.filter((p) => p.channelId === "c1").map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(input).toEqual(projects);
  });
});

describe("capabilities are DECLARED, not detected", () => {
  it("omitting one removes the affordance entirely — never a disabled one", async () => {
    const off = await mount(<RailTree channels={channels} projects={projects} />);
    // no drag handle, no draggable attribute, no colour rail: a greyed-out handle in an app that
    // does not persist an order is chrome that lies about a feature
    expect(off.container.querySelector("[draggable]")).toBeNull();
    expect(off.text()).not.toContain("drag_indicator");
    expect(off.buttons().some((b) => b.disabled)).toBe(false);
    await off.unmount();

    const on = await mount(
      <RailTree channels={channels} projects={projects} capabilities={{ reorder: true }} />,
    );
    expect(on.container.querySelector('[draggable="true"]')).not.toBeNull();
    expect(on.text()).toContain("drag_indicator");
    await on.unmount();
  });

  it("drops the glyph column when `icons` is off", async () => {
    const m = await mount(
      <RailTree channels={channels} projects={projects} capabilities={{ icons: false }} />,
    );
    expect(m.text()).not.toContain("description");
    expect(m.text()).not.toContain("tag");
    await m.unmount();
  });
});

describe("hidden items", () => {
  it("earn no permanent chrome — the count line IS the entry point", async () => {
    const none = await mount(<RailTree channels={channels} projects={projects} />);
    expect(none.text()).not.toContain(L.hiddenCount(1));
    await none.unmount();

    const some = await mount(
      <RailTree
        channels={channels}
        projects={[...projects, { id: "p9", name: "archived", channelId: "c1", hidden: true }]}
      />,
    );
    expect(some.text()).toContain(L.hiddenCount(1));
    // NOT named "old": Symbol renders ligature WORDS as text, and `create_new_folder` contains
    // the substring "old" — a name colliding with a glyph word false-positives this assertion
    expect(some.text()).not.toContain("archived"); // folded away until asked for
    await some.unmount();
  });
});

describe("no app nouns reach the platform tier", () => {
  it("renders no `dc-` literal", async () => {
    const m = await mount(<RailTree channels={channels} projects={projects} />);
    expect(m.container.innerHTML).not.toContain("dc-");
    await m.unmount();
  });
});

// ── the asset level (the data rail round, 2026-07-31) ─────────────────────────────────────────

import { moveAsset, type RailAsset } from "../RailTree";

const assets: RailAsset[] = [
  { id: "a1", name: "revenue.sql", projectId: "p1" },
  { id: "a2", name: "orders.csv", projectId: "p1" },
  { id: "a3", name: "notes.sql", projectId: "p2" },
];

describe("moveAsset — the filing move (moveProject's mirror)", () => {
  it("moves across projects at the asked index, against the post-removal list", () => {
    const next = moveAsset(assets, "a1", "p2", 0);
    expect(next.filter((a) => a.projectId === "p2").map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(next).toHaveLength(3);
  });

  it("clamps past-the-end, tolerates unknown ids, never mutates the input", () => {
    const input = assets.map((a) => ({ ...a }));
    const past = moveAsset(input, "a3", "p1", 99);
    expect(past.filter((a) => a.projectId === "p1").map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(moveAsset(input, "ghost", "p1", 0)).toHaveLength(3);
    expect(input).toEqual(assets);
  });
});

describe("the assets capability is DECLARED, not detected", () => {
  it("renders asset rows under their project when declared", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        assets={assets}
        capabilities={{ assets: true }}
      />,
    );
    expect(m.text()).toContain("revenue.sql");
    expect(m.text()).toContain("orders.csv");
    await m.unmount();
  });

  it("emits NOTHING for assets when the capability is off — even with rows supplied", async () => {
    const m = await mount(<RailTree channels={channels} projects={projects} assets={assets} />);
    expect(m.text()).not.toContain("revenue.sql");
    await m.unmount();
  });

  it("duplicate fires with the id from the menu, and only exists when its handler does", async () => {
    let dup = "";
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        assets={assets}
        capabilities={{ assets: true }}
        on={{ duplicateAsset: (id) => (dup = id) }}
      />,
    );
    // assets are menu-only: no promoted quick action on the row itself
    await m.click(m.button(L.more("revenue.sql")));
    await m.click(m.button(L.duplicate("revenue.sql")));
    expect(dup).toBe("a1");
    await m.unmount();
    const bare = await mount(
      <RailTree channels={channels} projects={projects} assets={assets} capabilities={{ assets: true }} />,
    );
    await bare.click(bare.button(L.more("revenue.sql")));
    expect(bare.buttons().some((b) => b.getAttribute("aria-label") === L.duplicate("revenue.sql"))).toBe(false);
    await bare.unmount();
  });

  it("hidden assets fold into the Hidden section with the rest", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        assets={[{ id: "a9", name: "ghost.sql", projectId: "p1", hidden: true }]}
        capabilities={{ assets: true }}
      />,
    );
    expect(m.text()).not.toContain("ghost.sql");
    expect(m.text()).toContain(L.hiddenCount(1));
    await m.unmount();
  });
});

describe("the edit form (Rename = ONE session: name + icon + colour)", () => {
  it("style picks live-apply as token NAMES, reset hands null, and ✓ commits the rename", async () => {
    const picked: (unknown | null)[] = [];
    const renames: [string, string][] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{
          setProjectStyle: (_id, style) => picked.push(style),
          renameProject: (id, v) => renames.push([id, v]),
        }}
      />,
    );
    await m.click(m.button(L.more("datacore")));
    await m.click(m.button(L.rename("datacore")));
    // the form replaced the row; the colour line is immediately there — no second menu trip
    await m.click(m.button("Colour chart-3"));
    await m.click(m.button("Reset style"));
    expect(picked).toEqual([{ colour: "chart-3" }, null]);
    const input = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.projectName}"]`,
    )!;
    input.value = "datacore v2";
    await m.click(m.button(L.save)); // the ✓ — numu1's mouse-only commit
    expect(renames).toEqual([["p1", "datacore v2"]]);
    await m.unmount();
  });

  it("degenerates to a plain NAME form without a style handler — no controls that no-op", async () => {
    const m = await mount(<RailTree channels={channels} projects={projects} />);
    await m.click(m.button(L.more("datacore")));
    await m.click(m.button(L.rename("datacore")));
    expect(m.container.querySelector(`input[aria-label="${L.projectName}"]`)).not.toBeNull();
    expect(m.buttons().some((b) => (b.getAttribute("aria-label") ?? "").startsWith("Colour "))).toBe(false);
    await m.unmount();
  });
});

describe("the pin dot", () => {
  it("a pinned row WEARS its pin outside the hover fade, and the click unpins", async () => {
    const toggles: [string, boolean][] = [];
    const pinned: RailProject[] = [{ id: "p1", name: "datacore", channelId: "c1", pinned: true }];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={pinned}
        on={{ togglePin: (id, next) => toggles.push([id, next]) }}
      />,
    );
    const dot = m.button(L.unpin("datacore"));
    // OUTSIDE the fade cluster: its parent row is the group itself, not the opacity-0 span
    expect(dot.parentElement?.className).not.toContain("opacity-0");
    await m.click(dot);
    expect(toggles).toEqual([["p1", false]]);
    await m.unmount();
  });
});

// ── the overflow menu itself (the 2026-08-01 UX round) ────────────────────────────────────────

describe("the overflow menu", () => {
  it("a resting row shows ONE trigger + its promoted action; secondary actions only in the menu", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{ duplicateProject: () => {}, renameProject: () => {} }}
      />,
    );
    // promoted: a channel's + and a project's duplicate stay inline
    expect(m.button(L.newProjectIn("engineering"))).toBeTruthy();
    expect(m.button(L.duplicate("datacore"))).toBeTruthy();
    // secondary: rename exists ONLY after the menu opens
    expect(m.buttons().some((b) => b.getAttribute("aria-label") === L.rename("datacore"))).toBe(false);
    await m.click(m.button(L.more("datacore")));
    expect(m.button(L.rename("datacore"))).toBeTruthy();
    await m.unmount();
  });

  it("pin/unpin reads the LIVE row state", async () => {
    const toggles: [string, boolean][] = [];
    const pinned: RailProject[] = [{ id: "p1", name: "datacore", channelId: "c1", pinned: true }];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={pinned}
        on={{ togglePin: (id, next) => toggles.push([id, next]) }}
      />,
    );
    await m.click(m.button(L.more("datacore")));
    await m.click(m.button(L.unpin("datacore")));
    expect(toggles).toEqual([["p1", false]]);
    await m.unmount();
  });

  it("the trigger cluster is hover-faded on desktop but ALWAYS visible below md", async () => {
    const m = await mount(<RailTree channels={channels} projects={projects} />);
    const trigger = m.button(L.more("datacore"));
    const cluster = trigger.parentElement!;
    // hover has no touch equivalent — max-md:opacity-100 is what keeps the rail usable there
    expect(cluster.className).toContain("group-hover:opacity-100");
    expect(cluster.className).toContain("max-md:opacity-100");
    await m.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The FOLDER level (the filesystem plane, 2026-08-01)
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { moveFolder, orphanFolderContents, type RailFolder } from "../RailTree";

const folders: RailFolder[] = [
  { id: "f1", name: "staging", projectId: "p1", parentId: null },
  { id: "f2", name: "marts", projectId: "p1", parentId: null },
  { id: "f11", name: "raw", projectId: "p1", parentId: "f1" },
];
const filed: RailAsset[] = [
  { id: "a1", name: "model.sql", projectId: "p1", folderId: "f1" },
  { id: "a2", name: "root.sql", projectId: "p1" },
  { id: "a3", name: "deep.sql", projectId: "p1", folderId: "f11" },
];

describe("moveFolder — the folder filing move (folders AND filed assets)", () => {
  it("re-parents within the project at the asked index; assets untouched same-project", () => {
    const next = moveFolder(folders, filed, "f2", "p1", "f1", 0);
    expect(next.folders.find((f) => f.id === "f2")?.parentId).toBe("f1");
    expect(next.folders).toHaveLength(3);
    expect(next.assets).toEqual(filed);
  });

  it("rewrites `projectId` on the WHOLE subtree when crossing projects — folders AND assets", () => {
    const next = moveFolder(folders, filed, "f1", "p2", null, 0);
    expect(next.folders.find((f) => f.id === "f1")?.projectId).toBe("p2");
    expect(next.folders.find((f) => f.id === "f11")?.projectId).toBe("p2"); // descendant followed
    expect(next.folders.find((f) => f.id === "f2")?.projectId).toBe("p1"); // sibling did not
    // THE STRANDING REGRESSION (2026-08-01 review): assets filed in the moved subtree — direct
    // (a1 in f1) AND nested (a3 in f11) — must follow, or they fail every render filter and
    // vanish from the tree. The root asset (a2) stays.
    expect(next.assets.find((a) => a.id === "a1")).toMatchObject({ projectId: "p2", folderId: "f1" });
    expect(next.assets.find((a) => a.id === "a3")).toMatchObject({ projectId: "p2", folderId: "f11" });
    expect(next.assets.find((a) => a.id === "a2")?.projectId).toBe("p1");
  });

  it("refuses a move into itself or its own descendant — fresh unchanged copies", () => {
    expect(moveFolder(folders, filed, "f1", "p1", "f1", 0)).toEqual({ folders, assets: filed });
    expect(moveFolder(folders, filed, "f1", "p1", "f11", 0)).toEqual({ folders, assets: filed });
  });

  it("tolerates unknown ids and never mutates the inputs", () => {
    const fIn = folders.map((f) => ({ ...f }));
    const aIn = filed.map((a) => ({ ...a }));
    expect(moveFolder(fIn, aIn, "ghost", "p1", null, 0).folders).toHaveLength(3);
    moveFolder(fIn, aIn, "f1", "p2", null, 0);
    expect(fIn).toEqual(folders);
    expect(aIn).toEqual(filed);
  });
});

describe("orphanFolderContents — invariant 1, the folder edition", () => {
  it("re-homes direct children to the deleted folder's parent and removes only the folder", () => {
    const { folders: fs, assets: as } = orphanFolderContents(folders, filed, "f1");
    expect(fs.find((f) => f.id === "f1")).toBeUndefined(); // the folder itself is gone
    expect(fs.find((f) => f.id === "f11")?.parentId).toBeNull(); // child → f1's parent (root)
    expect(as.find((a) => a.id === "a1")?.folderId).toBeNull(); // filed asset → root
    expect(as.find((a) => a.id === "a3")?.folderId).toBe("f11"); // deeper asset untouched
    expect(as).toHaveLength(3); // nothing destroyed
  });

  it("a NESTED folder's children land at ITS parent, not the root", () => {
    const { assets: as } = orphanFolderContents(folders, filed, "f11");
    expect(as.find((a) => a.id === "a3")?.folderId).toBe("f1");
  });

  it("never mutates the inputs", () => {
    const fIn = folders.map((f) => ({ ...f }));
    const aIn = filed.map((a) => ({ ...a }));
    orphanFolderContents(fIn, aIn, "f1");
    expect(fIn).toEqual(folders);
    expect(aIn).toEqual(filed);
  });
});

describe("moveAsset with the folder axis", () => {
  it("files into a folder and indexes among THAT folder's members only", () => {
    const next = moveAsset(filed, "a2", "p1", 0, "f1");
    expect(next.find((a) => a.id === "a2")?.folderId).toBe("f1");
    const f1Members = next.filter((a) => (a.folderId ?? null) === "f1").map((a) => a.id);
    expect(f1Members).toEqual(["a2", "a1"]);
  });

  it("the 4-arg call neither reads nor writes `folderId` — the flat contract survives", () => {
    const next = moveAsset(filed, "a1", "p2", 0);
    expect(next.find((a) => a.id === "a1")?.folderId).toBe("f1"); // untouched
    const flat = moveAsset(assets, "a1", "p2", 0);
    expect("folderId" in (flat.find((a) => a.id === "a1") ?? {})).toBe(false); // never minted
  });

  it("null files back to the project root", () => {
    const next = moveAsset(filed, "a3", "p1", 0, null);
    expect(next.find((a) => a.id === "a3")?.folderId).toBeNull();
  });
});

describe("the folders capability is DECLARED, not detected", () => {
  it("renders folders with their assets inside, and loose assets after", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        assets={filed}
        folders={folders}
        capabilities={{ assets: true, folders: true }}
        on={{ selectAsset: () => {} }}
      />,
    );
    expect(m.text()).toContain("staging");
    expect(m.text()).toContain("raw"); // nested folder renders
    expect(m.text()).toContain("deep.sql"); // asset inside the nested folder
    expect(m.text()).toContain("root.sql"); // loose asset at the project root
    await m.unmount();
  });

  it("emits NOTHING for folders when the capability is off — assets render FLAT", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        assets={filed}
        folders={folders}
        capabilities={{ assets: true }}
        on={{ selectAsset: () => {} }}
      />,
    );
    expect(m.text()).not.toContain("staging");
    // a filed asset still renders — folderId is IGNORED, not a hiding mechanism
    expect(m.text()).toContain("model.sql");
    expect(m.text()).toContain("deep.sql");
    await m.unmount();
  });

  it("a `parentId` cycle renders finitely (nothing, not a hang)", async () => {
    const cyclic: RailFolder[] = [{ id: "fx", name: "loop", projectId: "p1", parentId: "fx" }];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={cyclic}
        capabilities={{ folders: true }}
      />,
    );
    expect(m.text()).not.toContain("loop"); // unreachable from the root — and no infinite render
    await m.unmount();
  });

  it("an unfolded empty folder says so; a folded one wears its count", async () => {
    const one: RailFolder[] = [{ id: "fe", name: "blankbox", projectId: "p1", parentId: null }];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={one}
        capabilities={{ folders: true }}
      />,
    );
    expect(m.text()).toContain(L.emptyFolder); // "it worked" must be visible
    await m.click(m.button(L.fold("blankbox")));
    expect(m.text()).not.toContain(L.emptyFolder);
    const row = m.button(L.unfold("blankbox")).closest("div");
    expect(row?.textContent).toContain("0"); // the count badge, the channel lesson one level down
    await m.unmount();
  });

  it("folds independently of a channel sharing the same id (namespaced fold keys)", async () => {
    const clash: RailFolder[] = [{ id: "c1", name: "same-id", projectId: "p1", parentId: null }];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={clash}
        capabilities={{ folders: true }}
      />,
    );
    await m.click(m.button(L.fold("same-id"))); // fold the FOLDER whose id collides with c1
    expect(m.text()).toContain("datacore"); // the CHANNEL c1 stayed unfolded
    await m.unmount();
  });
});

describe("folder creation (invariant 2, generalised) and selection", () => {
  it("the project menu's New-folder item exists only when gated, and the create names the call", async () => {
    const calls: string[] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={[]}
        capabilities={{ folders: true }}
        on={{
          createFolder: (pid, parent, name, style) =>
            calls.push(`${pid}:${parent}:${name}:${style?.colour}`),
          setFolderStyle: () => {},
        }}
      />,
    );
    await m.click(m.button(L.more("datacore")));
    await m.click(m.button(L.newFolderIn("datacore")));
    await m.click(m.button("Colour chart-2")); // the style rides the create call
    const input = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.folderName}"]`,
    )!;
    input.value = "assets";
    await m.key(input, "Enter");
    expect(calls).toEqual(["p1:null:assets:chart-2"]);
    await m.unmount();
  });

  it("an unnamed folder is a cancel — the container rule", async () => {
    const calls: string[] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={[]}
        capabilities={{ folders: true }}
        on={{ createFolder: (_p, _q, name) => calls.push(name) }}
      />,
    );
    await m.click(m.button(L.more("datacore")));
    await m.click(m.button(L.newFolderIn("datacore")));
    const input = m.container.querySelector<HTMLInputElement>(
      `input[aria-label="${L.folderName}"]`,
    )!;
    await m.key(input, "Enter"); // empty commit
    expect(calls).toEqual([]);
    await m.unmount();
  });

  it("without `createFolder` the menu item and the folder's + are simply absent", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={folders}
        capabilities={{ folders: true }}
      />,
    );
    await m.click(m.button(L.more("datacore")));
    expect(m.buttons().map((b) => b.getAttribute("aria-label"))).not.toContain(
      L.newFolderIn("datacore"),
    );
    await m.unmount();
  });

  it("creating a subfolder into a FOLDED folder unfolds it — the row is born visible", async () => {
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={folders}
        assets={filed}
        capabilities={{ folders: true, assets: true }}
        on={{ createFolder: () => {} }}
      />,
    );
    await m.click(m.button(L.fold("staging")));
    expect(m.text()).not.toContain("raw"); // children hidden
    await m.click(m.button(L.newFolderIn("staging"))); // the folder row's promoted +
    expect(m.text()).toContain("raw"); // the chain re-revealed
    expect(m.container.querySelector(`input[aria-label="${L.folderName}"]`)).not.toBeNull();
    await m.unmount();
  });

  it("selection is declared-not-detected, and `activeFolderId` wears the current mark", async () => {
    let selected: string | null = null;
    const off = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={folders}
        capabilities={{ folders: true }}
      />,
    );
    // no selectFolder → the name is not a button
    const labels = off.buttons().map((b) => b.textContent);
    expect(labels.filter((t) => t === "staging")).toHaveLength(0);
    await off.unmount();

    const on = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={folders}
        activeFolderId="f1"
        capabilities={{ folders: true }}
        on={{ selectFolder: (id) => (selected = id) }}
      />,
    );
    const name = on.buttons().find((b) => b.textContent === "staging")!;
    expect(name.getAttribute("aria-current")).toBe("true");
    await on.click(name);
    expect(selected).toBe("f1");
    await on.unmount();
  });
});

describe("the folder menu", () => {
  it("Rename · New folder · Hide · Delete — and Delete hands the orphaned lists pre-applied", async () => {
    const got: string[] = [];
    let orphaned: { folders: RailFolder[]; assets: RailAsset[] } | null = null;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={folders}
        assets={filed}
        capabilities={{ folders: true, assets: true }}
        on={{
          createFolder: () => got.push("create"),
          setFolderHidden: (id, h) => got.push(`hide:${id}:${h}`),
          deleteFolder: (id, o) => {
            got.push(`delete:${id}`);
            orphaned = o;
          },
        }}
      />,
    );
    await m.click(m.button(L.more("staging")));
    const items = m.buttons().map((b) => b.getAttribute("aria-label"));
    expect(items).toContain(L.rename("staging"));
    expect(items).toContain(L.newFolderIn("staging"));
    expect(items).toContain(L.hide("staging"));
    expect(items).toContain(L.remove("staging"));

    await m.click(m.button(L.remove("staging")));
    expect(got).toEqual(["delete:f1"]);
    expect(orphaned!.folders.find((f) => f.id === "f1")).toBeUndefined();
    expect(orphaned!.folders.find((f) => f.id === "f11")?.parentId).toBeNull();
    expect(orphaned!.assets.find((a) => a.id === "a1")?.folderId).toBeNull();
    await m.unmount();
  });

  it("a hidden folder appears in the Hidden section as a bare row with restore + delete", async () => {
    const hidden: RailFolder[] = [
      { id: "fh", name: "attic", projectId: "p1", parentId: null, hidden: true },
    ];
    let restored: [string, boolean] | null = null;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        folders={hidden}
        capabilities={{ folders: true }}
        on={{ setFolderHidden: (id, h) => (restored = [id, h]) }}
      />,
    );
    expect(m.text()).toContain(L.hiddenCount(1));
    await m.click(m.buttons().find((b) => b.textContent?.includes(L.hiddenCount(1)))!);
    await m.click(m.button(L.restore("attic")));
    expect(restored).toEqual(["fh", false]);
    await m.unmount();
  });
});
