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
