# The design language

<!-- The tier's aesthetic law book. The census (tools/gates.d/10-component-census.sh) enforces
     what a machine can read; /specimen in the consumer judges what only an eye can. -->

## The noun becomes the verb

An object's own mark is its action — the Cloud SQL icon on a SQL echo *is* "insert into the
composer"; there is no separate button saying so. Icon-first everywhere an icon can carry the
meaning alone: **less text to translate, more breath in the UI**. The label survives as the
accessible name + tooltip, never as visible prose. The one legal exception is a DISCLOSURE — a
number the honesty laws require (an export's slimmed row count) is data, not a label, and stays.

This works only when the icon sits exactly where its object is: context does the explaining. An
icon floating away from its noun needs a label again — that placement rule is the whole trick.

## Breath

Surfaces are FLAT — `bg-surface`/`bg-surface-2` are transparent by design (bridge.css); structure
comes from borders, rhythm and type, not tint. Anything that **floats** (popovers, menus) or
**sticks** (a table header rows slide beneath) stands on `bg-bg`, the one opaque ground a flat
design keeps. Card headers and footers carry no hairlines; tables keep one rule per row because
the eye tracks a line, and that is the row's whole decoration.

## The four scales — one home each, all guarded

| scale | the home | the law | guard |
|---|---|---|---|
| spacing | `grid.css --bl-h` → `--spacing: var(--bl-h)` | strict 0.25rem rhythm; integer utilities are on-grid by construction | census R9 |
| type | `type.css` roles | 4–5 levels, roles only; `em` is the one escape (contextual, not minted) | census R10 |
| radius | per-theme `--radius-sm/md/lg/xl` (4/8/12/16 in datacore) | one token scale; a theme retunes it, a call site never | census R11 |
| motion | `contract.css --fast/--med/--entrance` (150/200/240ms) | glyphs answer at --fast, surfaces at --med, anything that APPEARS fades+scales at --entrance (180–240ms) | census R12 |

The 0.30rem episode is why R9 exists: a hardcoded `--spacing` drifted the whole rhythm 20% and
no check saw it — a scale with two homes has none.

## Micro-motion

Every interactive element inherits the transition floor (`bridge.css @layer base`): background,
border, color, shadow at `--med`; opacity and transform at `--fast`. On top of the floor, two
gestures and only these two:

- **the lift** — text-bearing chips rise 1px on hover (`hover:-translate-y-px active:translate-y-0`);
- **the glyph scale** — icon-only buttons scale their glyph (`group-hover:scale-110
  group-active:scale-90`), the rec-mic family of feedback.
- **the size glide** (2026-07-31) — chrome that changes SIZE (a panel retracting, a row
  revealing) transitions `width`/`height` at `--med`/`--ease`, never pops. The global door is
  `interpolate-size: allow-keywords` on `:root` (bridge.css) so `auto` endpoints interpolate; a
  swap between two elements glides via `starting:` (`@starting-style`) from the other's size
  (the panels), and a collapsed row is height-0 + `inert`, never unmounted (the composer). When
  a neighbour must hold still through the glide, RESERVE the delta as margin at rest and release
  it in the same transition — equal duration and ease make the sum constant on every frame (the
  composer's field). Engines without interpolate-size render end states instantly: motion is
  enhancement, never load-bearing.

Motion is a property of the SYSTEM: if a component needs a fourth gesture, it comes here first.

## Hierarchy

Cards do not compete: one shadow token per altitude (`--shadow` resting, `--shadow-popover`
floating, `--shadow-dialog` modal), and the conversation column is the focal spine — chrome
retracts, the thread never does.
