# DOCMAP — every doc, one row, in reading order

The navigation contract: a doc without a row here does not exist (gate 11 enforces the
bijection, both directions, and that every link resolves). Statuses: **LIVE** = reconciled
with shipped code; **GENERATED** = produced by a script, never edited by hand.

| doc | read it when | status |
|---|---|---|
| [README](../README.md) | first contact — what this tier is, the laws it carries, how a consumer mounts it | LIVE |
| [ARCHITECTURE](ARCHITECTURE.md) | you want the WHY: the boundaries, what the tier refuses to own, and the seams consumers wire | LIVE |
| [DESIGN](DESIGN.md) | you are designing a surface or component and need the visual language's rules | LIVE |
| [shell](shell.md) | you are mounting or changing the console frame — panels, host, regions, empty states | LIVE |
| [rail](rail.md) | you are binding the object rail — the tree, the row economy, the style form, the menus | LIVE |
| [composer](composer.md) | you are wiring the composer — modes, the expanding door, completion, the shortcut strip | LIVE |
| [thread](thread.md) | you are rendering conversation cards — tables, charts, code, markdown-lite | LIVE |
| [theme](theme.md) | you are theming a consumer or touching tokens, fonts, type roles, or the grid | LIVE |
| [REFERENCE](REFERENCE.md) | you need the exact public surface — every export, from the compiler | GENERATED |
| [DOCMAP](DOCMAP.md) | you are adding a doc — it needs a row here, and gate 11 will insist | LIVE |

## The docs laws here

- **Code is truth.** A doc describing shipped code reconciles in the same change (gate 13 reads
  HEAD; the escape is an explicit `Docs: n/a (<reason>)` line, on the record).
- **Derivable content is generated**, never written: [REFERENCE.md](REFERENCE.md) comes from
  `tools/gen-reference.mjs` and gate 12 reddens a stale copy.
- **One altitude per doc.** The README pitches, ARCHITECTURE explains why, the area docs say
  what-and-how, REFERENCE lists. Overlap across altitudes is fine; duplication within one is a
  defect — link, don't restate.
- **Component file headers are the specification** — each carries its Figma node id and the
  behaviour paid for in production. The area docs cite them; they never transcribe them.
