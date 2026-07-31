// @vitest-environment jsdom
//
// The one-row resting state (Em's 2026-07-31 ruling). The claims: the resting row carries the
// mode identity + the trailing seat(s) + the more_vert door and NOTHING from the control row;
// the door opens the control row and closes it; a composer with nothing behind the door renders
// no door at all. `Symbol` renders its ligature name as text, so glyph assertions are
// textContent checks.

import { describe, expect, it } from "vitest";
import { Composer, DEFAULT_COMPOSER_LABELS as L } from "../Composer";
import { mount } from "./render";

const noop = async () => null;

function fullComposer() {
  return (
    <Composer
      placeholder="Ask"
      onRun={noop}
      modeIcon={{ img: "/icons/gcp/product/cloud-sql.svg", title: "BigQuery SQL" }}
      trailing={[{ id: "mic", icon: "mic_none", title: "Dictate", onClick: () => {} }]}
      attach={{ id: "attach", icon: "attach_file", title: "Attach", onClick: () => {} }}
      actions={[{ id: "info", icon: "info", title: "Reference", onClick: () => {} }]}
      favorites={[{ id: "fav", icon: "star", title: "Pinned", onClick: () => {} }]}
    />
  );
}

/** the control row: the Attach button's collapsible ancestor (the one carrying h-0/inert) */
function controlRow(container: HTMLElement): HTMLElement {
  const attach = [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "Attach",
  );
  return attach!.closest("div.overflow-hidden") as HTMLElement;
}

describe("the one-row resting state", () => {
  it("rests with identity + trailing + door; the control row is collapsed AND inert", async () => {
    const m = await mount(fullComposer());

    expect(m.container.querySelector(`img[src="/icons/gcp/product/cloud-sql.svg"]`)).not.toBeNull();
    expect(m.button("Dictate")).toBeTruthy();
    expect(m.button(L.more).getAttribute("aria-expanded")).toBe("false");
    // ALWAYS MOUNTED (the size change animates 0 → auto), but height-collapsed and inert —
    // a hidden control that is still a tab stop would be worse than the popping row it replaced
    const row = controlRow(m.container);
    expect(row.className).toContain("h-0");
    expect(row.hasAttribute("inert")).toBe(true);
    await m.unmount();
  });

  it("the door opens the control row, relabels itself, and closes it again", async () => {
    const m = await mount(fullComposer());

    await m.click(m.button(L.more));
    const open = m.button(L.less);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const row = controlRow(m.container);
    expect(row.className).toContain("h-auto");
    expect(row.hasAttribute("inert")).toBe(false);
    for (const shown of ["Attach", "Reference", "Pinned"]) {
      expect(m.button(shown)).toBeTruthy();
    }

    await m.click(open);
    expect(m.button(L.more).getAttribute("aria-expanded")).toBe("false");
    expect(controlRow(m.container).hasAttribute("inert")).toBe(true);
    await m.unmount();
  });

  it("reserves row 2's height at rest and releases it when the door opens", async () => {
    const m = await mount(fullComposer());
    const frame = m.container.querySelector("div.rounded-xl") as HTMLElement;

    expect(frame.className).toContain("md:mb-10");
    await m.click(m.button(L.more));
    expect(frame.className).not.toContain("md:mb-10");
    await m.unmount();
  });

  it("renders no door when nothing lives behind it, and falls back to the prompt glyph", async () => {
    const m = await mount(<Composer placeholder="Ask" onRun={noop} prompt="❯" />);

    expect(m.buttons().some((b) => b.getAttribute("aria-label") === L.more)).toBe(false);
    expect(m.text()).toContain("❯");
    await m.unmount();
  });
});
