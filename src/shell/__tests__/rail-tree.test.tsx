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
    await m.click(m.button(L.remove("engineering")));
    expect(handed).not.toBeNull();
    expect(handed!.filter((p) => p.channelId === null)).toHaveLength(3);
    await m.unmount();
  });
});

describe("invariant 2 — creating into a folded channel UNFOLDS it first", () => {
  it("re-reveals the channel's rows, so the new one is visible when it lands", async () => {
    let createdIn: string | null | undefined;
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{ createProject: (id) => (createdIn = id) }}
      />,
    );

    expect(m.text()).toContain("datacore"); // starts unfolded

    await m.click(m.button(L.fold("engineering")));
    expect(m.text()).not.toContain("datacore");
    // the count badge stays visible while folded — it is what keeps telling you what is inside
    expect(m.button(L.unfold("engineering")).closest("div")?.textContent).toContain("2");

    await m.click(m.button(L.newProjectIn("engineering")));
    // WITHOUT this unfold the row is created correctly and NOTHING appears to happen
    expect(m.text()).toContain("datacore");
    expect(createdIn).toBe("c1");
    await m.unmount();
  });

  it("routes the top + to a CHANNEL and a channel's + to a project in that channel", async () => {
    const calls: string[] = [];
    const m = await mount(
      <RailTree
        channels={channels}
        projects={projects}
        on={{
          createChannel: () => calls.push("channel"),
          createProject: (id) => calls.push(`project:${id}`),
        }}
      />,
    );
    await m.click(m.button(L.newChannel));
    await m.click(m.button(L.newProjectIn("operations")));
    // one + could never mean both — that was a wrong shape underneath the button, not a bug in it
    expect(calls).toEqual(["channel", "project:c2"]);
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
        projects={[...projects, { id: "p9", name: "old", channelId: "c1", hidden: true }]}
      />,
    );
    expect(some.text()).toContain(L.hiddenCount(1));
    expect(some.text()).not.toContain("old"); // folded away until asked for
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
