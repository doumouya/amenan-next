# Thread renderers — what a conversation's cards are made of

Read this when building a consumer app to understand the shapes that render replies and results, and how to feed them data.

## The one wire shape: TabularResult

Every thread renderer speaks one shape: `TabularResult` (src/thread/result.ts). It holds `{columns: string[], rows: unknown[][], rowCount: number}` — the same shape your engine already produces. Pass it unchanged; `toTabular()` converts object-shaped rows to this form if needed.

`rowCount` is the *true* count, which may exceed `rows.length` when you slim a payload for size. Renderers compare the two to say "showing 50 of 65,000" (src/thread/ResultTable.tsx line 201). Collapsing them into one number deletes that honesty structurally, so stay separate.

## Detecting shape and formatting numbers

The library computes three things from the result itself:

**`numericMeta()`** (src/thread/result.ts line 49) — detects numeric columns by testing every value in each column, then caps decimals to 6 and returns a formatter that aligns the column uniformly. Uses the injected `NumberFormatter` (defaults to English `Intl`; locale is consumer policy).

**`isKpi()`** (src/thread/result.ts line 80) — true when `rowCount === 1 && columns.length > 0`. A one-row result is a headline, not a table.

**`isChartable()`** (src/thread/result.ts line 105) — returns true only when the shape meets a narrow offer: non-numeric label column, at least one numeric column to plot, and 2–50 rows (past 50, bars become a barcode). The offer is deliberately tight. A chart you volunteer over the wrong shape invites a false reading in front of an audience.

**`chartSeries()`** (src/thread/result.ts line 113) — extracts `{label, value}` pairs: labels from the first column, values from the first numeric column. When an optional `maxSegments` cap is passed and the series is longer, the smallest entries group into one "Other" tail. The donut's cap is `CHART_MAX_SEGMENTS` (5); `ResultChart` applies it itself, after category filtering.

## ResultTable and KpiStrip

`ResultTable` (src/thread/ResultTable.tsx line 77) renders tabular results in a *registered* style: generous 48px rows, one hairline per row, no vertical rules, no zebra striping. It renders at most 50 rows (`MAX_ROWS`) inside a height-capped viewport (`max-h-96`) that scrolls internally, scrollbars hidden by the consumer's app CSS. A scrolled table never shows unlabelled numbers — the header is sticky with an opaque background (see src/theme/bridge.css).

A settings button above the table opens a column-filter popover. The last *visible* column locks (a table with zero columns is not a table). View state is component-local on purpose — a reload restores your answers, not which way you were looking at them.

`KpiStrip` (src/thread/ResultTable.tsx line 44) renders the one-row headline: a flex row of label–value pairs, using the same numeric formatting as the table.

## ResultChart: bar, line, donut

Three modes, one SVG canvas (`ResultChart`, src/thread/ResultChart.tsx line 136): SVG, not canvas, because switching theme is one attribute write on `<html>`; SVG colours are token utilities and re-colour from that alone, while canvas has to read computed styles and be told to redraw.

The footer strip holds mode buttons (bar / line / donut) and a config door:
- **ASPECT** — four ratios (32/11, 16/9, 4/3, 1/1), default 32/11. Tailwind extracts class names from source text, so runtime `aspect-[${r}]` compiles to nothing; values are hardcoded as LITERAL classes.
- **Y** — gridline count 2–6, default 3.
- **X** — category filter (checkbox per label, last two lock).

Line mode uses quadratic smoothing to never overshoot the data. Donut mode shows the total in the centre at rest, the hovered slice on hover. A visually-hidden table carries the same numbers for screen readers.

## CodeBlock: XSS posture

Code arrives as a *text child* of `<pre>` (src/thread/CodeBlock.tsx line 6), never as markup. That is the entire XSS posture: the reply is untrusted model output, and the only reason it cannot inject anything is that *no HTML string is ever built from it*. A `dangerouslySetInnerHTML` here would quietly end that structural guarantee in every consumer at once.

The block has a language label, a Copy button, and horizontal scroll with scrollbars hidden globally.

## renderMarkdownLite: NO-HTML law

Markdown renders to React elements, never to an HTML string (src/thread/markdown.tsx line 3). The contract holds by construction: `createElement()` is called throughout, not `innerHTML`. No HTML string ever exists, so no sanitizer is needed — not "we sanitized it" but "we never built it in the first place."

Scope is deliberate: paragraphs, bold/italic/\`code\`, bullet and numbered lists, h1–h3 headings, fenced code blocks, and pipe tables. Anything else renders as literal text. Tables in markdown align numbers the same way `ResultTable` does (right-aligned when every body cell parses as a number).

## highlightSql: pluggable tokenizer

The tier's `Composer` (src/shell/Composer.tsx line 125) takes an optional `highlight?: (text) => ReactNode` prop and never imports this (src/thread/highlight.tsx line 11). A consumer whose composer speaks something else passes its own tokenizer. `highlightSql` is the SQL battery, included here because both house consumers (datacore-gcp and numu2) speak SQL — it is now house vocabulary, not one app's dialect.

Every colour is a theme token (`var(--chart-*)` / `var(--text-mute)` inline styles), never a hex value, so highlights follow theme switches.

## Entry CARDS stay with each consumer

The renderers are shared; the card *frames* are not. A `ResultTable` renders results, but the card that holds it — with save/export actions, app-specific metadata, a layout tuned for one consumer — stays with the consumer that built it. A card frame designed with one consumer is a guess about the second (src/index.ts line 110). Cards carry app nouns (planes, targets), not generic data shapes.

---

**See also:** [DESIGN.md](DESIGN.md) (visual rules and the registered table style), [REFERENCE.md](REFERENCE.md) (full export list).
