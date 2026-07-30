// theme.ts — the two-axis theme runtime: a theme NAME × a light/dark MODE, both as attributes on
// <html>, plus the text-size and density knobs that ride the same discipline. One attribute write
// + one storage write + a listener notify. O(1): no DOM walks, no class shuffles, no re-mounts.
//
// It is also the ONLY file in this tier that touches localStorage, and that asymmetry is
// deliberate — see THE STORAGE DECISION below.
//
// ── THE STORAGE DECISION: namespace-configurable, supplied ONCE, and REQUIRED ────────────────
//
// This file arrived from the donor writing `dc-theme` / `dc-mode` / `dc-textsize` / `dc-density`.
// A platform tier cannot own a key in a consumer's namespace: `dc-` is one app's prefix, and the
// second consumer inherits it the moment it imports this module. Three ways out, and only one
// survives contact with two consumers:
//
//   1. A fixed platform prefix (`an-theme`, the amenan-ui `amu-` shape). REJECTED. It renames the
//      collision instead of removing it: two house apps served from ONE origin — numu.im/datacore
//      and numu.im/console share a localStorage partition, paths do not partition it — would still
//      fight over one key, and switching the theme in one silently restyles the other.
//   2. Hand persistence back to the consumer entirely (the shape LeftPanel/RightPanel use for their
//      retract state). REJECTED HERE, and the asymmetry has a reason rather than being an
//      inconsistency: the theme must be applied BEFORE FIRST PAINT, by a snippet inlined in <head>
//      that runs before any module — consumer code included — has loaded. There is no consumer
//      seam that early. Whoever emits that snippet must know the keys, so the keys live here.
//      Panel state has no pre-paint requirement, so it stays with the consumer; that is the line.
//   3. NAMESPACE-CONFIGURABLE, and the namespace is REQUIRED. CHOSEN. The consumer says who it is,
//      once; the platform still ships the persistence so nobody re-implements it.
//
// Required, not defaulted, because a default namespace is exactly the bug in (1) wearing a hat —
// two consumers that both leave it alone collide, and the collision is silent. `createThemeRuntime`
// throws on a missing or malformed namespace, at module-init time, which is the loudest cheap
// moment available.
//
// The separator is `-`, so a consumer passing `namespace: "dc"` reproduces the donor's four keys
// BYTE-FOR-BYTE (`dc-theme`, `dc-mode`, `dc-textsize`, `dc-density`) and its users keep the theme
// they chose. That is not nostalgia: a repoint that silently resets everyone's appearance is the
// kind of cost that gets a promotion reverted.
//
// ── WHY A FACTORY AND NOT A `configure()` CALL ──────────────────────────────────────────────
//
// The pre-paint snippet is a STRING the consumer inlines in <head>; the runtime is the module its
// components call. Both need the namespace, the theme list and the default. If those were set by a
// `configure()` call, the snippet could be built with one namespace and the runtime configured with
// another — the snippet would restore a theme the runtime never reads, and the only symptom is a
// flash of the wrong palette that nothing reports. A factory makes the desync unrepresentable:
// ONE config object produces both, so `runtime.prePaintSnippet` and `runtime.setTheme` cannot
// disagree about where the value lives.
//
// ── THE DEFAULT THEME IS THE CONSUMER'S, NOT THE PLATFORM'S ─────────────────────────────────
//
// The donor shipped `DEFAULT_THEME = "datacore"`. A theme NAME may name the app a look was designed
// for — `SHIPPED_THEMES` below still says `datacore`, exactly as amenan-ui ships `redpash` and
// `portfolio` as looks any consumer may wear. But a DEFAULT is a policy about which look is "the"
// look, and that policy belongs to the app: numu2 consuming this must not open in datacore's
// palette because a library decided. So there is no platform default at all — `defaultTheme` is a
// required field of the config, and the type system checks it is one of the registered names.
//
// ── CONSUMER RECIPE ─────────────────────────────────────────────────────────────────────────
//
//   // app/theme.ts — ONE module per app, the only place the namespace is written
//   import { createThemeRuntime, SHIPPED_THEMES } from "amenan-next/theme";
//   export const theme = createThemeRuntime({
//     namespace: "dc",                 // this app's storage prefix; nobody else's
//     themes: SHIPPED_THEMES,          // or [...SHIPPED_THEMES, "my-look"] with its own CSS block
//     defaultTheme: "datacore",
//   });
//   export const PRE_PAINT_SNIPPET = theme.prePaintSnippet;   // for the <head> script
//
// The runtime is React-free on purpose: the snippet is imported from the document head, and a
// theme module that drags React in cannot be.

export type Mode = "light" | "dark";
export type TextSize = "s" | "m" | "l" | "xl";
export type Density = "comfortable" | "compact";

/**
 * The looks `theme/contract.css` actually defines — a CENSUS of that file, not a policy.
 *
 * Adding a look is a CSS block keyed `html[data-theme="<name>"][data-mode="light"|"dark"]` plus a
 * line here, and then the consumer registers the name. A consumer may equally pass names of its
 * own and ship their CSS itself; the runtime is generic over the list it is handed.
 */
export const SHIPPED_THEMES = ["datacore", "signal-ink"] as const;
export type ShippedTheme = (typeof SHIPPED_THEMES)[number];

export interface ThemeRuntimeConfig<T extends string> {
  /**
   * This consumer's storage prefix — `[a-z][a-z0-9-]*`. Keys are `<namespace>-theme`,
   * `<namespace>-mode`, `<namespace>-textsize`, `<namespace>-density`. REQUIRED: a default here
   * would collide silently between two apps on one origin.
   */
  namespace: string;
  /** the theme names this app offers, in switch-cycle order */
  themes: readonly T[];
  /** which of them a first-time visitor gets — the app's policy, never the platform's */
  defaultTheme: T;
}

export interface ThemeRuntime<T extends string> {
  readonly themes: readonly T[];
  readonly defaultTheme: T;
  /** the four resolved storage keys, so a consumer can migrate or clear them without guessing */
  readonly keys: Readonly<Record<"theme" | "mode" | "textSize" | "density", string>>;
  /**
   * The script SOURCE to inline in <head> BEFORE first paint (the no-FOUC guarantee). Built from
   * the same config as everything else on this object, so it cannot read a different key than
   * `setTheme` writes.
   */
  readonly prePaintSnippet: string;
  getTheme(): T;
  getMode(): Mode;
  setTheme(theme: T): void;
  setMode(mode: Mode): void;
  toggleMode(): void;
  /** the donor's `healThemeState` — re-applies every axis after hydration; idempotent */
  heal(): void;
  onThemeChange(fn: (theme: T, mode: Mode) => void): () => void;
  getTextSize(): TextSize;
  applyTextSize(size: TextSize): void;
  getDensity(): Density;
  applyDensity(d: Density): void;
}

/**
 * The root font-size per step — and every rem token in the app is `root × value`, so this table
 * is the ONE number that moves type, spacing, rail widths and chrome heights together.
 *
 * ABSOLUTE px, deliberately, and this is the whole point of the table. These used to be
 * percentages (`87.5% / 100% / 112.5%`), and a percentage on the ROOT element resolves against
 * the BROWSER'S default font size — which the reader can change. So `m` did not mean 16px; it
 * meant "whatever this visitor's browser calls medium", and a reader running a 20px default got
 * the entire layout 25% larger than it was designed. That is the one respect in which a rem grid
 * really is less predictable than a px one, and it is fixed here rather than by abandoning rem:
 * pin the root and `0.25rem` is 4px on every machine, for every visitor, forever — while the
 * single-lever scaling that px could never offer stays.
 *
 * The trade this makes on purpose: the reader's font-size PREFERENCE no longer perturbs the
 * design. Browser zoom is untouched (it scales px and rem alike), and the four steps below are
 * the in-app answer for anyone who wants it bigger — including `xl`, which exists because on a
 * HiDPI panel the old +12.5% ceiling was close to imperceptible.
 */
const TEXT_SIZE_ROOT: Record<TextSize, string> = {
  s: "14px",
  m: "16px",
  l: "18px",
  xl: "20px",
};

// Both patterns exclude `<`, `/`, quotes and backslashes, which is what makes the interpolation
// into `prePaintSnippet` safe by construction rather than by trusting the caller: a name carrying
// `</script>` would otherwise close the tag it is embedded in. The snippet's payload was a
// compile-time constant in the donor; here it is consumer-authored, so the guarantee has to be
// re-earned at the boundary instead of assumed.
const NAMESPACE_RE = /^[a-z][a-z0-9-]*$/;
const THEME_NAME_RE = /^[a-z][a-z0-9-]*$/;

function root(): HTMLElement {
  return document.documentElement;
}

export function createThemeRuntime<T extends string>(
  config: ThemeRuntimeConfig<T>,
): ThemeRuntime<T> {
  const { namespace, themes, defaultTheme } = config;

  if (!NAMESPACE_RE.test(namespace ?? "")) {
    throw new Error(
      `amenan-next/theme: namespace ${JSON.stringify(namespace)} is not [a-z][a-z0-9-]*. It is ` +
        `REQUIRED and app-specific: it prefixes this app's four storage keys, and two apps ` +
        `sharing an origin must not share them.`,
    );
  }
  if (themes.length === 0) {
    throw new Error("amenan-next/theme: `themes` is empty — register at least one theme name");
  }
  for (const t of themes) {
    if (!THEME_NAME_RE.test(t)) {
      throw new Error(
        `amenan-next/theme: theme name ${JSON.stringify(t)} is not [a-z][a-z0-9-]* — it is ` +
          `written into an html[data-theme] selector AND into the pre-paint <script>`,
      );
    }
  }
  if (!themes.includes(defaultTheme)) {
    throw new Error(
      `amenan-next/theme: defaultTheme ${JSON.stringify(defaultTheme)} is not in \`themes\``,
    );
  }

  const keys = {
    theme: `${namespace}-theme`,
    mode: `${namespace}-mode`,
    textSize: `${namespace}-textsize`,
    density: `${namespace}-density`,
  } as const;

  const listeners = new Set<(theme: T, mode: Mode) => void>();

  function getTheme(): T {
    const t = root().getAttribute("data-theme");
    return (themes as readonly string[]).includes(t ?? "") ? (t as T) : defaultTheme;
  }

  function getMode(): Mode {
    return root().getAttribute("data-mode") === "dark" ? "dark" : "light";
  }

  function stored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode / storage disabled — the attribute still applies, only the memory is lost */
    }
  }

  function storedTheme(): T | null {
    const v = stored(keys.theme);
    return v && (themes as readonly string[]).includes(v) ? (v as T) : null;
  }

  function storedMode(): Mode | null {
    const v = stored(keys.mode);
    return v === "light" || v === "dark" ? v : null;
  }

  function osMode(): Mode {
    try {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  function notify(): void {
    const t = getTheme();
    const m = getMode();
    listeners.forEach((fn) => fn(t, m));
  }

  // The ONE DOM writer: both attributes land together, so a paired
  // html[data-theme][data-mode] token block can never half-match — a switch that writes
  // only its own axis looks dead the moment the other attribute is missing.
  function applyThemeState(over?: { theme?: T; mode?: Mode }): void {
    const d = root();
    const theme =
      over?.theme ?? (d.hasAttribute("data-theme") ? getTheme() : (storedTheme() ?? defaultTheme));
    const mode = over?.mode ?? (d.hasAttribute("data-mode") ? getMode() : (storedMode() ?? osMode()));
    d.setAttribute("data-theme", theme);
    d.setAttribute("data-mode", mode);
  }

  function getTextSize(): TextSize {
    const v = stored(keys.textSize);
    return v === "s" || v === "l" || v === "xl" ? v : "m";
  }

  const runtime: ThemeRuntime<T> = {
    themes,
    defaultTheme,
    keys,

    getTheme,
    getMode,
    getTextSize,

    setTheme(theme) {
      write(keys.theme, theme);
      applyThemeState({ theme });
      notify();
    },

    setMode(mode) {
      write(keys.mode, mode);
      applyThemeState({ mode });
      notify();
    },

    toggleMode() {
      runtime.setMode(getMode() === "dark" ? "light" : "dark");
    },

    // React regenerates the whole tree on ANY hydration mismatch (a saved locale, a browser
    // extension mutating the DOM…) and re-renders <html> as it knows it — stripping every
    // attribute the pre-paint snippet set. With data-theme gone the paired token blocks all go
    // dead (browser-default black-on-white) and every one-axis switch looks dead too (the
    // 2026-07-24 theme-wipe lesson). Idempotent; the shell calls it once after hydration.
    heal() {
      applyThemeState();
      const d = root();
      d.style.fontSize = TEXT_SIZE_ROOT[getTextSize()];
      if (stored(keys.density) === "compact") d.setAttribute("data-density", "compact");
      notify();
    },

    onThemeChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    applyTextSize(size) {
      root().style.fontSize = TEXT_SIZE_ROOT[size];
      write(keys.textSize, size);
    },

    getDensity() {
      return root().getAttribute("data-density") === "compact" ? "compact" : "comfortable";
    },

    applyDensity(d) {
      root().setAttribute("data-density", d);
      write(keys.density, d);
    },

    // Inlined in the document <head> BEFORE first paint. Every interpolated value is
    // JSON-stringified AND pattern-checked above, so nothing here can escape its own string.
    prePaintSnippet: `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem(${JSON.stringify(keys.theme)});
if(${JSON.stringify(themes)}.indexOf(t)<0)t=${JSON.stringify(defaultTheme)};
var m=localStorage.getItem(${JSON.stringify(keys.mode)});
if(m!=="light"&&m!=="dark")m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
d.setAttribute("data-theme",t);d.setAttribute("data-mode",m);
var R=${JSON.stringify(TEXT_SIZE_ROOT)};
var s=localStorage.getItem(${JSON.stringify(keys.textSize)});
d.style.fontSize=R[s]||R.m;
if(localStorage.getItem(${JSON.stringify(keys.density)})==="compact")d.setAttribute("data-density","compact");
}catch(e){}})();`,
  };

  return runtime;
}
