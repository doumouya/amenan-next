"use client";

// ResultTable — the ONE tabular result renderer of the thread (plus KpiStrip, the one-row
// headline register). PROMOTED from datacore-gcp web/src/components/data/ResultTable.tsx; the
// donor extracted it from its SQL card so agent cards could reuse it verbatim, and the promotion
// finishes that arc: both consumers' cards now reuse it verbatim.
//
// What changed in the move, and only this: `t()`/`fmtNum` became `labels`/`formatNumber` props
// with English/`Intl` defaults (the RailTree pattern) — locale is consumer policy — and the
// result type became the tier's `TabularResult`, structurally the donor's `SqlResult`.
//
// THE SETTINGS DOOR: a `tune` trigger in its own strip above the table opens the COLUMN filter —
// the export's checkbox-list (its cfgRows), re-aimed at columns, with the lock rule adapted to a
// table's own floor: the LAST visible column locks (the export locks two because a chart needs
// two categories; a table needs one). The RATIO control that first shipped here moved to
// ResultChart's config door (Em's ruling: a ratio is a chart property — a table's height is its
// row count, capped). View state is component-local on purpose (the donor's chart-toggle
// argument): a view preference is not conversation state, so a reload restores your answers,
// not which way you were looking at them.

import { useRef, useState } from "react";
import { Popover } from "../shell/Popover";
import { Symbol } from "../shell/Symbol";
import { numericMeta, type NumberFormatter, type TabularResult } from "./result";

export interface ResultTableLabels {
  /** shown when the table is truncated — rendered with the HELD and TRUE counts */
  truncated: (shown: number, total: number) => string;
  /** the settings trigger's accessible name */
  settings: string;
  /** the column-filter list's caption */
  columns: string;
}

export const DEFAULT_RESULT_TABLE_LABELS: ResultTableLabels = {
  truncated: (shown, total) => `Showing ${shown} of ${total} rows`,
  settings: "Table settings",
  columns: "columns",
};

/** rows a card shows before scrolling internally — see the register note on ResultTable */
const MAX_ROWS = 50;

export function KpiStrip({
  res,
  formatNumber,
}: {
  res: TabularResult;
  formatNumber?: NumberFormatter;
}) {
  const { fmt } = numericMeta(res, formatNumber);
  return (
    <div className="flex flex-wrap gap-6 p-4">
      {res.columns.map((c, j) => (
        <div key={c} className="min-w-24">
          <p className="text-label-md text-mute">{c}</p>
          <p className="num text-display-sm text-ink" data-tabular>
            {fmt(res.rows[0]?.[j], j)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The table register: generous rows, one hairline per row, no vertical rules, no zebra, and a
 * hover you have to look for. Zebra striping was doing the job the row rule now does, twice as
 * loudly — with 48px rows the eye tracks a line without help, and the stripes were the only thing
 * making a result card look like a spreadsheet rather than an answer.
 *
 * Height is capped rather than unbounded (the `auto` aspect). This renders INSIDE a conversation
 * card, and the conversation is the product: 50 generous rows would be a 2400px card that pushes
 * the thread off screen. It scrolls internally instead — bars hidden globally, so the region is
 * quiet.
 */
export function ResultTable({
  res,
  labels,
  formatNumber,
}: {
  res: TabularResult;
  labels?: Partial<ResultTableLabels>;
  formatNumber?: NumberFormatter;
}) {
  const l = { ...DEFAULT_RESULT_TABLE_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const tuneRef = useRef<HTMLButtonElement>(null);

  // numericMeta runs over the FULL result so per-column decimals never change as columns hide
  const { numeric, fmt } = numericMeta(res, formatNumber);
  const keep = res.columns.map((c) => !hidden.has(c));
  const shownCols = keep.filter(Boolean).length;
  const shown = Math.min(res.rows.length, MAX_ROWS);

  const toggleColumn = (c: string, on: boolean) => {
    // the floor: a table with zero columns is not a table — the last visible column locks
    if (on && shownCols <= 1) return;
    const next = new Set(hidden);
    if (on) next.add(c);
    else next.delete(c);
    setHidden(next);
  };

  return (
    <div className="relative">
      {/* the trigger lives in NORMAL FLOW, in its own slim strip — the first cut floated it
          `absolute` over the scroll viewport, where it sat on the last column's header and the
          rows slid beneath it on scroll. A control that owns no space owns someone else's. */}
      <div className="flex justify-end px-1 pb-0.5">
        <button
          ref={tuneRef}
          type="button"
          aria-label={l.settings}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          title={l.settings}
          className={`group flex h-7 items-center justify-center rounded-md px-2 ${
            open ? "bg-signal-tint text-signal" : "text-dim hover:bg-hover hover:text-ink"
          }`}
        >
          <Symbol name="tune" size="1.125rem" className="transition-transform duration-[var(--fast)] group-hover:scale-110 group-active:scale-90" />
        </button>
      </div>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={tuneRef} direction="down">
            <span className="text-label-md text-mute">{l.columns}</span>
            <div className="flex flex-col">
              {res.columns.map((c, j) => {
                const on = keep[j]!;
                const locked = on && shownCols <= 1;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={locked}
                    onClick={() => toggleColumn(c, on)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-body-sm hover:bg-hover ${
                      on ? "text-ink" : "text-mute"
                    } ${locked ? "cursor-default opacity-55" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                        on ? "border-signal bg-signal-tint text-signal" : "border-border"
                      }`}
                    >
                      {on && <Symbol name="check" size="0.875rem" />}
                    </span>
                    <span className="truncate">{c}</span>
                  </button>
                );
              })}
            </div>
      </Popover>

      <div className="max-h-96 overflow-auto">
        <table className="w-full text-body-sm">
          <thead>
            {/* sticky, so a scrolled table never leaves you reading unlabelled numbers. It needs
                an opaque background for that — rows would otherwise show through it. */}
            {/* bg-bg, not bg-surface: the flat direction empties the surface utilities, but a STICKY
                header still needs an opaque ground or rows ghost through it — see bridge.css */}
            <tr className="sticky top-0 h-10 border-b border-rule bg-bg">
              {res.columns.map((c, j) =>
                keep[j] ? (
                  <th
                    key={c}
                    className={`truncate px-4 text-label-md font-normal text-mute ${
                      numeric[j] ? "text-right" : "text-left"
                    }`}
                  >
                    {c}
                  </th>
                ) : null,
              )}
            </tr>
          </thead>
          <tbody>
            {res.rows.slice(0, MAX_ROWS).map((r, i) => (
              <tr key={i} className="h-12 border-b border-rule hover:bg-hover">
                {r.map((v, j) =>
                  keep[j] ? (
                    <td
                      key={j}
                      className={`num truncate px-4 text-ink ${numeric[j] ? "text-right" : ""}`}
                      data-tabular
                    >
                      {fmt(v, j)}
                    </td>
                  ) : null,
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {/* the honest signal is rowCount vs what's HELD — a reload-slimmed card (50 rows kept
            of 65,000) must keep saying so */}
        {(res.rowCount > res.rows.length || res.rows.length > MAX_ROWS) && (
          <p className="px-3 py-1.5 text-label-sm text-mute">{l.truncated(shown, res.rowCount)}</p>
        )}
      </div>
    </div>
  );
}
