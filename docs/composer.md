# Composer — the fifth region and the AI front door

Read this when you are wiring a surface's composer region or implementing a custom completion engine for `compute()`.

The Composer is a single-frame input control with two rows: a resting row carrying the mode identity, the text field, and optionally trailing actions or a door; and an on-demand second row (behind the more_vert door) holding the tools line and shortcut strip. It is always present in the five-regions shell (`src/lib/regions.ts`, `RegionsSpec`).

## Controlled value and run contract

The component accepts an optional `value` and `onChange` (`src/shell/Composer.tsx`, lines 95–97); omit both for the internal draft. On Enter (no Shift), the field calls `onRun` with the trimmed draft. `onRun` is `(value: string) => Promise<string | null>`: it resolves to an error string to show under the field, or null. The composer awaits it only for that error and the busy glyph — it reads no results back, so a surface owns execution and the thread; the composer is dumb by design so the same component can run any operation (`src/shell/Composer.tsx`, header comment, lines 17–19). At the surface→shell seam the equivalent field is `ComposerSpec.run`, typed `(value: string) => void | Promise<unknown>` (`src/lib/regions.ts`, lines 42–45).

## Mode identity and cycling

The resting row's left edge shows a selected mode's mark via `modeIcon` (lines 85–89): an optional `img` (a brand mark, rendered as `<img>`, never recolored), an optional `icon` (a Material Symbols glyph), and a required `title`. If the prop is absent, the field falls back to the `prompt` glyph. The mode identity is read-only on the component: the consumer's shell resolves the mode from `ComposerSpec.defaultMode` (`src/lib/regions.ts`). While `onRun` is pending, the mark is replaced by the busy glyph.

## The collapsing second row

The door opens a single, always-mounted collapsible wrapper (lines 440–484) that is height-collapsed to `h-0` and `inert` at rest, so hidden controls are neither tab stops nor a popping row on open. The expand state is component-local view state (line 164), not persisted; a reload restores the draft, not which chrome you had open. The more_vert button exists only if `attach`, `actions.length`, or the shortcut strip exist (`hasRow2`, line 166). Inside the door: the tools line (the composer's own verbs), then the shortcut strip (when pinned destinations or apps exist).

## Tools line and shortcut strip

The tools line renders `attach` (a single action, leading) and `actions[]` (a declarative bar). Below: the shortcut strip, an inner `overflow-x-auto` scroller (line 471) that holds `pins[]` (labelled chips that jump to destinations), an optional divider (line 476, only when both exist), and `favorites[]` (pinned apps, passing the `favorites` prop, line 107). Verbs and destinations never share a line (`src/shell/Composer.tsx`, the door comment, lines 433–439; the strip's own-scroller test is `src/shell/__tests__/composer.test.tsx`, line 123).

## Reserve and release

RESERVE AND RELEASE (Em's ruling, recorded in `src/shell/Composer.tsx`, lines 309–315): at rest, the frame reserves exact bottom margin for the door's expansion — one line (36px buttons + 4px gap = `md:mb-10`) or two when the shortcut strip exists (2 × 40px = `md:mb-20`, line 318). When the door opens, the frame removes the margin as the door grows into the space. Both animate at `--med` with the same ease, so the sum is constant on every frame and the field holds still. This rule applies only `≥md`; mobile composers sit on the bottom edge, and permanent dead space costs more than the field's rise.

## Decoupled completion seam

The `compute` prop is `(text: string, caret: number) => Completion | null` (`src/shell/Composer.tsx`, line 120; the types live in `src/lib/completion.ts`). A `Completion` holds a `from` position (the start of the token being replaced; the range ends at the caret) and `items[]`, each with a `label` (shown in the list), an `insert` string (written to the field), and a `kind` (a category, app-defined). The default is `() => null` (no completion). The platform owns the seam shape; the app owns the vocabulary (table names, keywords, categories are application domain, `src/lib/completion.ts` header). SQL keywords and table names are not baked in.

## History ring, Tab accept, and ghost

The composer accepts a `history` prop (line 99, oldest first). Press ↑ at the first line to step backward through history; ↓ to step forward. Pressing ↑ stashes the in-progress draft; walking back off the end restores it. Tab accepts the top completion item (or the selected one, navigated via ↑↓). The inline ghost (when `ghost={true}`) shows the selected completion's tail inline when the caret sits at the very end (lines 271–275), as a visual preview.

## Labels contract

The component accepts an optional `labels` object (line 136, `ComposerLabels`). Default English labels exist for `field` (the field's aria-label), `newline` and `accept` (the mobile touch strip's newline and accept-completion buttons), and `more`/`less` (the door closed / open). Pass a partial override to change any one. These are tied to the semantics of the component, not the app's vocabulary.

See [ARCHITECTURE.md](ARCHITECTURE.md) for why the composer refuses to know mode vocabulary, [DESIGN.md](DESIGN.md) for the shell-wide motion and visual laws, [REFERENCE.md](REFERENCE.md) for the export census, and [shell.md](shell.md) for how a surface publishes its composer spec through `useConsoleRegions`. The padding-alignment, beam-caret, and overlay-mechanism rules live in the `src/shell/Composer.tsx` header, beside the code they bind.
