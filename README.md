# amenan-next

**Status: BUILDING** — the platform tier is being extracted from `datacore-gcp/web`. Nothing here is frozen.

The house front-end platform for the Next.js + Tailwind v4 stack: the token contract, the Tailwind bridge, and the five-region console shell. Two consumers from day one — **datacore-gcp** and **numu2** — which is deliberate: a library with a single consumer decays into that consumer's private code.

It is the successor to [`amenan-ui`](../amenan-ui) (vanilla TS, **frozen**, pull-only). amenan-ui is not deprecated by neglect — its evolution moved here, so the freeze costs nothing.

## What it is

| tier | what lives here |
|---|---|
| `src/theme/` | the ~40-token contract, the ONE `@theme inline` Tailwind bridge, type roles, the baseline grid, self-hosted fonts, and the O(1) theme switch |
| `src/shell/` | the five-region console shell — `LeftPanel`, `RightPanel`, `SurfaceHost`, `Composer`, `RailTree`, `EmptyRegion` |
| `src/lib/` | the region store — surfaces publish their chrome, only the shell's renderers subscribe |

## The laws it carries

1. **A theme is a data file, not a redesign.** Every look is `html[data-theme] × html[data-mode]` over the fixed token set, so a theme authored against the contract runs on every house app. Switching is one attribute write.
2. **`@theme inline` is load-bearing.** Utilities must emit `var(--token)` at runtime, or a theme switch would need a rebuild.
3. **The tier declares its own scan scope.** Tailwind emits a utility only for class strings it finds in a file it *scans*, and automatic detection roots at the **consumer's** project — which this repo sits outside. The `@source` pair in `bridge.css` is what puts it in scope, and a consumer must not restate it: two live copies of a path is how a promotion becomes a merge. Drop it and everything still builds, typechecks and tests green while half the shell renders unstyled — measured once, at 45 of 125 classes.
4. **`--spacing: 0.25rem`** makes Tailwind's base step *the* minor grid, so every integer utility is on-rhythm by construction and arbitrary values are the only escape — which the spacing census catches.
5. **The five regions are ALWAYS present.** An unfilled region shows an empty state, never a collapse — a console's identity is its constant chrome.
6. **`retracted` is a STATE, not a component.** Splitting it meant two places to get the same chrome wrong.
7. **Surfaces are kept alive.** Hide with `visibility:hidden` + `inert` + `aria-hidden`; never `display:none`, which drops layout and resets inner scroll offsets.
8. **No persisted state may shape the first client render.** One text mismatch anywhere makes React regenerate the tree and strip the pre-paint theme attributes.

## Where the design lives

Figma — *numu* › `Components · Shell` (node `13:56`). The components there carry usage documentation naming their **donor** file in `datacore-gcp/web`, and that documentation is the spec: it records behaviour paid for in production (why the close affordance is a chevron and not an ✕; why auto-open diffs a key and never object identity). Read it before changing a component's shape.

## Consuming it

Repo-adjacent, aliased at build — no npm package, same as amenan-ui:

```ts
// tsconfig paths
"amenan-next/*": ["../amenan-next/src/*"]
```

```css
@import "amenan-next/theme/contract.css";
@import "amenan-next/theme/bridge.css";
```

The theme runtime is built per app, and its **storage namespace is required** — a platform default
would collide silently between two house apps served from one origin, and the theme must be
restored by a `<head>` snippet that runs before any consumer module exists, so the keys cannot
live with the consumer either. One config produces both the runtime and the snippet, so they
cannot read different keys:

```ts
// app/theme.ts — the only place this app's namespace is written
import { createThemeRuntime, SHIPPED_THEMES } from "amenan-next/theme";

export const theme = createThemeRuntime({
  namespace: "dc",            // → dc-theme · dc-mode · dc-textsize · dc-density
  themes: SHIPPED_THEMES,     // the looks contract.css defines; add your own with its CSS block
  defaultTheme: "datacore",   // WHICH look this app opens in is the app's policy, never the tier's
});
export const PRE_PAINT_SNIPPET = theme.prePaintSnippet;
```

A theme NAME may carry the name of the app a look was designed for (`datacore` is the M3
Google-console look, as amenan-ui ships `redpash`); a DEFAULT may not — that is policy, and policy
belongs to the consumer.

**Extract → repoint.** When a component lands here, the consumer deletes its copy and imports this one. If both exist for a week they diverge, and "make them match" becomes a merge instead of a promotion.

## Keeping it honest

```
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run ci          # tools/ci.sh — auto-discovers tools/gates.d/*.sh
```

`10-component-census` is the mechanism behind "controlling component growth": every component in
`src/shell` is exported from `src/index.ts` and every barrel entry resolves to a real export (both
directions), no file-private component is dead weight, nothing in `src/shell` or `src/lib` imports
a consumer or `next/*`, no raw colour lives outside `src/theme`, no consumer namespace prefix is
minted here, **every `@custom-variant` a component uses is declared in the theme tier**, and
**every shipped file lies inside a declared `@source` root** — the two halves of one precondition,
because a class emits only if its variant is declared *and* its file is scanned. Either half
missing compiles to nothing at all, silently, which no typecheck or unit test can see.
Every rule plants its own violation in an inline self-test and asserts that rule's tag fires by
exact count, including the `[R0]` guard that refuses to call an unscanned tree clean.

The `@source` rule is a text check, and says so in its own header: this tier compiles no CSS, so
the executing oracle lives in the consumer (datacore's `fe-build-audit` `[css]` rule compiles the
real stylesheet twice and diffs the selector sets). This is the weaker half of that pair, kept here
because this is the file the declaration must not vanish from.
