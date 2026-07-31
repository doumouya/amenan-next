"use client";

// ResultTable — the ONE tabular result renderer of the thread (plus KpiStrip, the one-row
// headline register). PROMOTED from datacore-gcp web/src/components/data/ResultTable.tsx; the
// donor extracted it from its SQL card so agent cards could reuse it verbatim, and the promotion
// finishes that arc: both consumers' cards now reuse it verbatim.
//
// What changed in the move, and only this: `t()`/`fmtNum` became `labels`/`formatNumber` props
// with English/`Intl` defaults (the RailTree pattern) — locale is consumer policy — and the
// result type became the tier's `TabularResult`, structurally the donor's `SqlResult`.

import { numericMeta, type NumberFormatter, type TabularResult } from "./result";

export interface ResultTableLabels {
  /** shown when the table is truncated — rendered with the HELD and TRUE counts */
  truncated: (shown: number, total: number) => string;
}

export const DEFAULT_RESULT_TABLE_LABELS: ResultTableLabels = {
  truncated: (shown, total) => `Showing ${shown} of ${total} rows`,
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
 * Height is capped rather than unbounded. This renders INSIDE a conversation card, and the
 * conversation is the product: 50 generous rows would be a 2400px card that pushes the thread
 * off screen. It scrolls internally instead — bars hidden globally, so the region is quiet.
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
  const { numeric, fmt } = numericMeta(res, formatNumber);
  const shown = Math.min(res.rows.length, MAX_ROWS);
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-body-sm">
        <thead>
          {/* sticky, so a scrolled table never leaves you reading unlabelled numbers. It needs an
              opaque background for that — rows would otherwise show through it. */}
          <tr className="sticky top-0 h-10 border-b border-rule bg-surface">
            {res.columns.map((c, j) => (
              <th
                key={c}
                className={`truncate px-4 text-label-md font-normal text-mute ${
                  numeric[j] ? "text-right" : "text-left"
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {res.rows.slice(0, MAX_ROWS).map((r, i) => (
            <tr key={i} className="h-12 border-b border-rule hover:bg-hover">
              {r.map((v, j) => (
                <td
                  key={j}
                  className={`num truncate px-4 text-ink ${numeric[j] ? "text-right" : ""}`}
                  data-tabular
                >
                  {fmt(v, j)}
                </td>
              ))}
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
  );
}
