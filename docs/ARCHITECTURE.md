# ARCHITECTURE — the boundaries, the refusals, and the seams

For the engineer judging this design or about to move a piece across its lines. Read this when
you want to know WHY something lives where it does — before proposing that the shell read the
router, that the composer learn SQL, or that a component remember its own state. WHAT each piece
is lives in the area docs ([shell](shell.md), [rail](rail.md), [composer](composer.md),
[thread](thread.md), [theme](theme.md)); the visual law is [DESIGN.md](DESIGN.md); the exact
public surface is [REFERENCE.md](REFERENCE.md), generated. This doc argues; it does not list.

## Repo-adjacent, aliased at build — not an npm package

Consumers alias `amenan-next/*` to `../amenan-next/src/*` in their tsconfig and compile the
tier's TypeScript themselves (README.md, "Consuming it"; `package.json` is `"private": true` and
its `exports` map points straight at `src/`). Publishing would buy isolation and cost the thing
this tier exists for: **Extract → repoint** (README.md) works only when the consumer deletes its
copy and imports this one *in the same change* — a package version in between reopens the window
where both copies live, and "make them match" becomes a merge instead of a promotion. A publish
step would also mean every fix lands twice (here, then in each consumer's lockfile), for two
consumers who share a filesystem with this repo. The price of repo-adjacency is real and named:
the consumer's Tailwind scan roots at the *consumer's* project, which this repo sits outside, so
the tier must declare its own scan scope (`@source` in `src/theme/bridge.css`; README law 3) —
gate R8 in `tools/gates.d/10-component-census.sh` exists because dropping that line once shipped
a console with 45 of 125 classes silently absent.

## The two-consumer law

Two consumers from day one — datacore-gcp and numu2 — and that is deliberate: **a library with a
single consumer decays into that consumer's private code** (README.md). One consumer's needs are
indistinguishable from the platform's; the second consumer is what forces every "need" to declare
itself as either a seam (platform) or a noun (app). Every refusal below is this law applied — a
place where one app's noun tried to enter the tier and was made a parameter instead. The
direction is enforced, not remembered: gate R4 (`tools/gates.d/10-component-census.sh`) reddens
any import naming a consumer or `next/*`, and R7 reddens a consumer's namespace prefix minted
here, because both leaks actually happened — `dc-theme` in the theme runtime until the namespace
became required, the `next/*` routing import the port removed — and the gate's rule texts name
each.

## The three refusals

**Routing.** `SurfaceHost` takes `surfaces` and `activeId` as props and never reads a router
(`src/shell/SurfaceHost.tsx`). The donor called `usePathname()` and resolved the surface itself;
the port cut that because a library that resolves a URL to a surface has picked the consumer's
router — the mapping stays a one-row registry in the app, and a Next consumer passes
`surfaceByPath(usePathname())?.id`. The same cut runs through `useConsoleRegions`, which takes
`path` as an argument (defaulting to `location.pathname`) instead of importing `next/navigation`
for its per-path memory (`src/lib/regions.ts`, extraction note). Removing routing also removed
the tier's last `next/*` import: the shell is framework-agnostic as a consequence, not a slogan.

**Vocabulary.** `ComposerSpec.defaultMode` is a `string`, not a union (`src/lib/regions.ts`). It
arrived as `"sql" | "agent"` — one console's two modes — and a consumer whose composer runs
`ask | edit` could not have expressed its preference without editing the platform. The `compute`
and `highlight` seams made the same call earlier: the completion *shape* is platform
(`src/lib/completion.ts`), but the keywords and table names that used to ship with it are the
app's — a contract that knows what `GROUP BY` is has picked its consumer (`src/lib/regions.ts`).
The platform owns the seam ("a surface may prefer a mode"); the app owns the vocabulary.

**Persistence.** `src/theme/theme.ts` is the only file in the tier that touches `localStorage`,
and the asymmetry is argued in its header ("THE STORAGE DECISION"): the theme must be applied
*before first paint*, by a snippet inlined in `<head>` that runs before any consumer module has
loaded — there is no consumer seam that early, so whoever emits the snippet must own the keys.
Panel retract state, drafts, selections have no pre-paint requirement, so they stay with the
consumer; that is the line, not a style preference. Even the one persistence the tier keeps
refuses a default: the storage namespace is *required*, because two house apps on one origin
share a localStorage partition and a defaulted key would collide silently
(`src/theme/theme.ts`).

## The two entries

`package.json` exports two code entries: `.` → `src/index.ts` (the React components) and
`./theme` → `src/theme/theme.ts`, plus the stylesheets by path. The split is load-bearing, not
organizational: the pre-paint snippet is imported from the document `<head>`, before React
exists, so the theme runtime must not drag React in — "a theme module that drags React in cannot
be" imported that early (`src/theme/theme.ts`; `src/index.ts` header). And the runtime is a
factory rather than a `configure()` call because the snippet and the runtime both need the
namespace: built separately they could disagree about the keys, and the only symptom would be a
flash of the wrong palette that nothing reports. One config object produces both, so the desync
is unrepresentable (`src/theme/theme.ts`, "WHY A FACTORY").

## Labels as props — the tier never hardcodes a word

Every user-facing string enters through a `labels` prop with a documented default —
`DEFAULT_LEFT_PANEL_LABELS`, `DEFAULT_COMPOSER_LABELS`, `DEFAULT_RAIL_TREE_LABELS`,
`DEFAULT_RESULT_TABLE_LABELS`, and the rest of the `DEFAULT_*_LABELS` family in `src/index.ts`
(`labels?: Partial<LeftPanelLabels>` is the shape, `src/shell/LeftPanel.tsx`). A hardcoded
string in a shared tier is English as policy: the consumer that localizes would have to fork the
component to change a tooltip. The design language pulls the same direction from the other side
— icon-first means less text to translate in the first place ([DESIGN.md](DESIGN.md), "The noun
becomes the verb").

## The glyph-ref seam

A consumer-fed icon ref is a string with a fixed grammar: a bare name is a Material Symbols
ligature — forever, so stored styles never migrate — and a future icon pack claims a prefix
(`bi:…`) resolved by a consumer-supplied `GlyphRenderer`, default `renderMaterialGlyph`
(`src/shell/Symbol.tsx`; [DESIGN.md](DESIGN.md), "The glyph-ref seam"). Adding a pack is a
resolver plus assets in the consumer, zero tier change: the seam is priced so extension never
needs permission. `Symbol` itself is exported for the opposite reason — a consumer's own chrome
must render glyphs through the same subsetted-font mechanism, or it reaches for an svg and forks
the icon source of truth (`src/index.ts`).

## The folder level — a flat array, and the one integrity the tier takes back

**Flat array, not a recursive union.** `folders` arrives as a fourth flat array beside
channels/projects/assets rather than turning the model into a node tree, so a consumer that
wants three levels keeps binding the shape it already has (`src/shell/RailTree.tsx`, the
folder-level header). The compatibility is real but not total, and the exception is named
rather than implied: the prop is optional and the capability defaults off, but `RailGlyphs` and
`RailTreeLabels` gained required keys, which a consumer declaring a complete literal meets at
compile time ([rail](rail.md), "The labels contract"). Rendering recursion is confined to one
cycle-guarded function, because a consumer's `parentId` loop must render finitely rather than
hang the tier.

**Cross-project integrity is tier-owned — the one data decision taken back.** Everywhere else
this component owns no data: rows in, callbacks out, the consumer persists. `moveFolder` breaks
that deliberately — it takes AND returns assets, because a cross-project move must rewrite
`projectId` across the whole descendant subtree, and it refuses a move into a folder's own
descendant. A consumer that got either wrong would not see a bug in its own code: the assets
left behind fail every render filter and vanish, or a `parentId` cycle corrupts rendering. A
hazard that lands on every consumer identically is not a consumer's decision to make
(`src/shell/RailTree.tsx`, `moveFolder`; the shape and the helpers are in [rail](rail.md)).

## What stays with consumers

- **Entry cards.** The thread renderers — table, chart, code, markdown-lite — are platform,
  because both consumers render the same thread; the cards that *frame* them carry app nouns
  (planes, save/export targets), and a card frame designed with one consumer is a guess about
  the second (`src/index.ts`, thread section).
- **Routing.** The path→surface registry is one row in the app (`src/shell/SurfaceHost.tsx`).
- **Stores and persistence.** The region store in `src/lib/regions.ts` holds chrome *specs*,
  never app data; drafts, selections, panel state, and their storage are the consumer's
  (`src/theme/theme.ts`, the persistence line above).
- **Policy.** `defaultTheme` is a required config field: a theme *name* may honor the app a look
  was designed for, but which look is "the" look is the app's decision, never the library's
  (`src/theme/theme.ts`, "THE DEFAULT THEME IS THE CONSUMER'S").
- **The executing CSS oracle.** This tier compiles no CSS, so the check that the shell actually
  styled lives in the consumer's build gate; the tier keeps only the weaker text half, because
  this repo is where the `@source` line must not vanish from (README.md, "Keeping it honest";
  gate R8's header).

Every boundary above is a query, not a convention: `tools/gates.d/10-component-census.sh` states
the reasoning in its header — a convention is a thing a reader must remember while doing
something else; a census is a question the machine asks every time.
