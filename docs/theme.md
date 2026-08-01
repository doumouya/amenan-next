# Theme — the two-axis runtime and token bridge

Read this when consuming theme tokens, adding a new theme look, or initializing the theme runtime in an app.

## Token contract

The theme tier owns ~40 custom properties scoped by `html[data-theme]` and `html[data-mode]` (src/theme/contract.css). A **theme name** is a look (e.g., `datacore`, `signal-ink`); a **mode** is light or dark. Each [theme, mode] pair declares color inks, surfaces, borders, and the status and chart palettes; fonts and radii (--radius-sm through --radius-xl) live in per-theme blocks shared by both modes (contract.css lines 28–45); the motion durations (--fast, --med, --entrance) are theme-independent constants at `:root` (lines 20–24). Color hex lives only in this file, and the text inks are literal hex so a contrast audit can parse it directly; border and hover washes are `rgba()`/`color-mix()` and the audit skips non-hex by design. A consumer adding a look writes a new `html[data-theme="..."][data-mode="..."]` block here and registers the name in `SHIPPED_THEMES` (src/theme/theme.ts line 82).

## Tailwind bridge

The `@theme inline` block in src/theme/bridge.css maps the contract's color, shadow, radius, and font tokens to Tailwind custom properties (lines 57–120); the two surface tokens deliberately map to `transparent` (the flat-surface rule, docs/DESIGN.md), and tokens like --glass, --focus-ring, and --rule-shadow are consumed via `var()` directly, not bridged. **This is the only place Tailwind reads the contract.** Utilities emit `var(--token)` at runtime, so attribute flips on `<html>` restyle the entire page without a rebuild. The bridge includes two custom variants (`@custom-variant dark` for attribute-based mode selection, and `short` for height breakpoints) and the `@source` scan-scope lines (30–31): Tailwind only generates utilities it finds by scanning the paths listed, so this tier declares its own scope to reach components outside the consumer's root. The scope excludes `__tests__/**` to keep fixture classes out of the shipped bundle.

## Minor grid and type roles

Tailwind's base spacing step is derived from `var(--bl-h)` = 0.25rem (src/theme/bridge.css line 119, from src/theme/grid.css line 6) — one home for the rhythm, never a magic number in the bridge. Integer spacing utilities (p-1, gap-2, etc.) land on the minor grid by construction; the baseline (--bl) is 0.5rem, and a quarter-grid (--bl-q) is 0.125rem (grid.css lines 4–7). Type roles in src/theme/type.css are tuples of (size, line-height) whose line-heights are all 0.25rem multiples, so text blocks stack on the minor grid. The prose role exists separately from body-md (lines 32–33): body-md is chrome density (14px, 1.25rem leading — table cells, chips, buttons), while prose is the reading register (same 14px, 1.5rem leading for agent replies and long-form content).

## Self-hosted fonts and icons

The file src/theme/fonts.css declares @font-face blocks for two theme families (Roboto/Roboto Mono for datacore; Inter/JetBrains Mono for signal-ink), all self-hosted under `/fonts/` on the consumer's own origin, with a `?v=` cache-bust on Material Symbols only (lines 95–100). The icon pipeline is **font-based, not SVG**: Material Symbols Outlined is subsetted by ligature name (36 KiB from 10.2 MiB), and src/shell/symbols.txt censuses every glyph rendered by this tier's components. A glyph missing from the census paints its literal ligature word because `font-display: block`. Consumers adopting tier components must merge symbols.txt into their own census and re-subset the font; src/shell/Symbol.tsx and its Figma components (linked in Symbol.tsx header) document the protocol.

## Runtime factory and storage

The `amenan-next/theme` entry (src/theme/theme.ts — its own entry so the pre-paint import stays React-free) exports `createThemeRuntime(config)` — a factory, not a configure call, because the pre-paint snippet and the runtime both need the same namespace, themes list, and default, and a factory makes desync unrepresentable (theme.ts lines 38–46). The config requires `namespace` (e.g., `"dc"` for datacore), which prefixes the four storage keys (`namespace-theme`, `namespace-mode`, `namespace-textsize`, `namespace-density`). **Namespace is required, not defaulted**: a default would collide silently between two apps on one origin. The consumer supplies `themes` and `defaultTheme`; the default is policy and belongs to the app, never the platform (lines 48–55). `createThemeRuntime` returns a runtime object with `prePaintSnippet` (a string to inline in `<head>` before first paint, no-FOUC guarantee), `keys` (the four resolved storage keys), and imperative methods: `setTheme()`, `setMode()`, `toggleMode()`, `getTheme()`, `getMode()`, `heal()`, `onThemeChange(fn)`, plus `getTextSize()`/`applyTextSize()` and `getDensity()`/`applyDensity()`.

## Hydration heal

React regenerates the DOM on hydration mismatch, stripping the `data-theme` and `data-mode` attributes the pre-paint snippet set — with `data-theme` gone, every paired token block goes dead. The consumer's shell calls `heal()` (theme.ts lines 294–300) once after hydration: it re-applies both attributes (from the DOM if present, else storage, else defaults), re-applies persisted text-size and density, and notifies listeners; it is idempotent. The pre-paint snippet itself sets `data-theme`, `data-mode`, the root font-size, and `data-density` from storage (falling back to OS preference for mode and to defaults otherwise) before first paint.

## Related docs

- **Why**: README.md ("The laws it carries") for the tier's design philosophy
- **Visual rules**: docs/DESIGN.md for the motion language, radius choices, and the flat-surface decision
- **Export list**: docs/REFERENCE.md — the generated table of every public symbol, by entry and source module
