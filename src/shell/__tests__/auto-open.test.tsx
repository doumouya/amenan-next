// @vitest-environment jsdom
//
// THE AUTO-OPEN KEY DIFF — the recorded bug, pinned.
//
// RightPanel's Figma description states it as a prohibition: "Never diff by object identity — the
// spec republishes on every render and a composer keystroke would pop the panel." The bug it
// describes is not hypothetical and it is not visible in review: `useConsoleRegions` has no
// dependency array (by design — the spec is a fresh object literal every render), so an
// identity-based watcher fires on EVERY keystroke in the composer, and the context panel pops open
// while you are typing. The first test below is the one that would have caught it.

import { describe, it, expect } from "vitest";
import { useConsoleRegions, onContextArrival, type RegionsSpec } from "../../lib/regions";
import { mount } from "./render";

function Publisher({ spec, path }: { spec: RegionsSpec; path: string }) {
  useConsoleRegions(spec, true, path);
  return null;
}

/** a fresh spec object every call — exactly what a surface's render produces */
const spec = (key: string | null): RegionsSpec =>
  key === null ? {} : { context: { key, body: "body" } };

describe("context arrival", () => {
  it("does NOT re-fire when an IDENTICAL key is republished on a new object", async () => {
    let fired = 0;
    const off = onContextArrival(() => (fired += 1));
    const path = "/identity";

    const m = await mount(<Publisher spec={spec("row:5")} path={path} />);
    expect(fired).toBe(1);

    // five republishes with a brand-new spec object each time — the composer-keystroke shape.
    // Object identity differs every round; the KEY does not, so the panel must stay put.
    for (let i = 0; i < 5; i += 1) {
      await m.rerender(<Publisher spec={spec("row:5")} path={path} />);
    }
    expect(fired).toBe(1);

    await m.unmount();
    off();
  });

  it("fires on null→key and on key A→key B, and never on a key going away", async () => {
    let fired = 0;
    const off = onContextArrival(() => (fired += 1));
    const path = "/changes";

    const m = await mount(<Publisher spec={spec(null)} path={path} />);
    expect(fired).toBe(0); // no selection yet — nothing arrived

    await m.rerender(<Publisher spec={spec("row:1")} path={path} />);
    expect(fired).toBe(1); // null → key

    await m.rerender(<Publisher spec={spec("row:2")} path={path} />);
    expect(fired).toBe(2); // key A → key B

    await m.rerender(<Publisher spec={spec(null)} path={path} />);
    expect(fired).toBe(2); // a selection CLEARING is not an arrival

    await m.rerender(<Publisher spec={spec("row:2")} path={path} />);
    expect(fired).toBe(3); // and coming back is

    await m.unmount();
    off();
  });

  it("remembers the last key PER PATH, so returning to a held selection is silent", async () => {
    let fired = 0;
    const off = onContextArrival(() => (fired += 1));

    const a = await mount(<Publisher spec={spec("row:9")} path="/a" />);
    expect(fired).toBe(1);
    await a.unmount();

    // a different surface, with its own selection — a genuine arrival
    const b = await mount(<Publisher spec={spec("row:9")} path="/b" />);
    expect(fired).toBe(2);
    await b.unmount();

    // back to /a, which still holds row:9. The panel must NOT pop: nothing new was selected, the
    // user simply navigated home. Without per-path memory this is a false positive on every
    // return trip, and a kept-alive surface republishing its old selection fires it too.
    const again = await mount(<Publisher spec={spec("row:9")} path="/a" />);
    expect(fired).toBe(2);
    await again.unmount();

    off();
  });

  it("degrades a keyless context to presence rather than firing on every render", async () => {
    let fired = 0;
    const off = onContextArrival(() => (fired += 1));
    const path = "/keyless";

    const m = await mount(<Publisher spec={{ context: { body: "x" } }} path={path} />);
    expect(fired).toBe(1);

    await m.rerender(<Publisher spec={{ context: { body: "y" } }} path={path} />);
    expect(fired).toBe(1); // still "present" — a body change is not a new selection

    await m.unmount();
    off();
  });

  it("stays silent while the surface is INACTIVE (a hidden kept-alive surface publishes nothing)", async () => {
    let fired = 0;
    const off = onContextArrival(() => (fired += 1));

    function Hidden() {
      useConsoleRegions(spec("row:77"), false, "/hidden");
      return null;
    }
    const m = await mount(<Hidden />);
    expect(fired).toBe(0);

    await m.unmount();
    off();
  });
});
