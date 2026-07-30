// @vitest-environment jsdom
//
// The theme runtime's ONE job that unit tests can hold: the storage namespace. Everything else
// here is a DOM attribute write the shell's own tests would notice; the keys are the part that is
// invisible until two apps share an origin and quietly restyle each other.
//
// These assertions are the unit-level half of the same rule gate 10's R7 enforces textually — the
// gate proves no `dc-` prefix is MINTED anywhere in the tier, this proves the keys the runtime
// actually writes are the consumer's and nobody else's.

import { describe, it, expect, beforeEach } from "vitest";
import { createThemeRuntime, SHIPPED_THEMES } from "../theme";

const cfg = { themes: SHIPPED_THEMES, defaultTheme: "signal-ink" } as const;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("data-density");
});

describe("the storage namespace is the consumer's", () => {
  it("derives all four keys from the namespace it was given", () => {
    expect(createThemeRuntime({ ...cfg, namespace: "numu2" }).keys).toEqual({
      theme: "numu2-theme",
      mode: "numu2-mode",
      textSize: "numu2-textsize",
      density: "numu2-density",
    });
  });

  it("reproduces the donor's keys byte-for-byte for namespace `dc`, so a repoint keeps the user's choice", () => {
    expect(createThemeRuntime({ ...cfg, namespace: "dc" }).keys).toEqual({
      theme: "dc-theme",
      mode: "dc-mode",
      textSize: "dc-textsize",
      density: "dc-density",
    });
  });

  it("keeps two consumers on one origin out of each other's storage", () => {
    const a = createThemeRuntime({ ...cfg, namespace: "dc" });
    const b = createThemeRuntime({ ...cfg, namespace: "numu2" });
    a.setTheme("datacore");
    expect(localStorage.getItem("dc-theme")).toBe("datacore");
    expect(localStorage.getItem("numu2-theme")).toBeNull();
    // b falls back to ITS OWN default, not to what a persisted
    document.documentElement.removeAttribute("data-theme");
    b.heal();
    expect(document.documentElement.getAttribute("data-theme")).toBe("signal-ink");
  });

  it("builds the pre-paint snippet from the same keys the runtime writes", () => {
    const t = createThemeRuntime({ ...cfg, namespace: "numu2" });
    for (const k of Object.values(t.keys)) expect(t.prePaintSnippet).toContain(`"${k}"`);
    expect(t.prePaintSnippet).not.toContain("dc-");
  });
});

describe("misconfiguration is loud, at construction", () => {
  it("refuses a missing or malformed namespace rather than defaulting to one", () => {
    expect(() => createThemeRuntime({ ...cfg, namespace: "" })).toThrow(/namespace/);
    // the failure mode this closes: a name that would break out of the <script> it is inlined in
    expect(() => createThemeRuntime({ ...cfg, namespace: "a</script>" })).toThrow(/namespace/);
  });

  it("refuses a default theme that is not a registered theme", () => {
    expect(() =>
      createThemeRuntime({ themes: ["a"] as const, defaultTheme: "b", namespace: "x" }),
    ).toThrow(/defaultTheme/);
  });
});

describe("the two axes land together", () => {
  it("writes both attributes on any single-axis change", () => {
    const t = createThemeRuntime({ ...cfg, namespace: "dc" });
    t.setMode("dark");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    // the theme-wipe lesson: a mode-only write must not leave data-theme unset, or every paired
    // html[data-theme][data-mode] block goes dead
    expect(document.documentElement.getAttribute("data-theme")).toBe("signal-ink");
  });

  it("notifies listeners with the resolved pair", () => {
    const t = createThemeRuntime({ ...cfg, namespace: "dc" });
    const seen: string[] = [];
    const off = t.onThemeChange((theme, mode) => seen.push(`${theme}/${mode}`));
    t.setTheme("datacore");
    off();
    t.setTheme("signal-ink");
    expect(seen).toEqual(["datacore/light"]);
  });
});
