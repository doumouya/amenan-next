// result.ts — the tabular-result shape the thread renderers speak, and the math over it.
//
// PROMOTED from datacore-gcp (web/src/components/data/ResultTable.tsx `numericMeta` +
// web/src/lib/datacore/thread.ts) in the one-interface arc: datacore-gcp and numu2 render the
// same thread, so the renderers and their detection rules live once, here. What did NOT come
// along: CSV export and the download door — those are ACTIONS an app offers on a result, not
// rendering, and each consumer keeps its own.
//
// `TabularResult` is STRUCTURALLY the donor's `SqlResult` on purpose — {columns, rows, rowCount}
// — so a consumer whose engine already produces that shape passes it unchanged. `rowCount` is the
// TRUE count, which may exceed `rows.length`: a consumer that slims a stored result (datacore
// keeps 50 rows of 65,000 across reloads) stays honest because the renderers compare the two and
// say so. Collapsing the pair into one number would delete that honesty structurally.

/** The one tabular shape every thread renderer takes. */
export interface TabularResult {
  columns: string[];
  rows: unknown[][];
  /** the TRUE row count — may exceed rows.length when the holder slimmed the payload */
  rowCount: number;
}

/** object-shaped rows (an agent trace's wire shape) → the TabularResult the renderers speak */
export function toTabular(rows: Record<string, unknown>[]): TabularResult {
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return {
    columns,
    rows: rows.map((r) => columns.map((c) => r[c])),
    rowCount: rows.length,
  };
}

/**
 * How the renderers print a number. Injected, not imported: locale is CONSUMER policy (datacore
 * formats fr-FR under its French catalog), and a tier that imports an i18n kernel has picked one.
 */
export type NumberFormatter = (n: number, digits?: { min?: number; max?: number }) => string;

/** the default: plain `Intl` in English — correct until a consumer says otherwise */
export const defaultFormatNumber: NumberFormatter = (n, digits) =>
  new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: digits?.min,
    maximumFractionDigits: digits?.max,
  }).format(n);

// Detect numeric columns from the VALUES + each column's own max decimal count (capped 6): the
// column formats uniformly (no ragged "…487.3" beside "…214.88"), integers stay integers — the
// numu1 numeric law.
export function numericMeta(res: TabularResult, formatNumber: NumberFormatter = defaultFormatNumber) {
  const numeric = res.columns.map((_, j) =>
    res.rows.every((r) => {
      const v = r[j];
      return v === null || v === "" || typeof v === "number" || Number.isFinite(Number(v));
    }),
  );
  const decimals = res.columns.map((_, j) =>
    numeric[j]
      ? res.rows.reduce((d, r) => {
          const v = r[j];
          if (v === null || v === "") return d;
          const n = typeof v === "number" ? v : Number(v);
          if (!Number.isFinite(n)) return d;
          const frac = n.toFixed(6).replace(/0+$/, "").split(".")[1] ?? "";
          return Math.max(d, frac.length);
        }, 0)
      : 0,
  );
  const fmt = (v: unknown, j: number) => {
    if (v === null || v === "") return "";
    if (numeric[j]) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return formatNumber(n, { min: decimals[j], max: decimals[j] });
    }
    return String(v);
  };
  return { numeric, fmt };
}

/** A one-row result is a headline (KPIs); anything else is a table/ranking. */
export function isKpi(res: TabularResult): boolean {
  return res.rowCount === 1 && res.columns.length > 0;
}

/** the most segments a donut can carry before it stops being readable; the tail groups */
export const CHART_MAX_SEGMENTS = 5;
/** past this a bar chart is a barcode — offer the table instead */
const CHART_MAX_ROWS = 50;

/** a column reads as numeric when every value in it parses — the same test the table applies */
function columnIsNumeric(res: TabularResult, j: number): boolean {
  return res.rows.every((r) => {
    const v = r[j];
    return v === null || v === "" || typeof v === "number" || Number.isFinite(Number(v));
  });
}

/**
 * Can this result be drawn? It needs something to label the axis with and something to measure.
 *
 * The offer is deliberately narrow. A chart the console volunteers over the wrong shape is worse
 * than no chart — it invites a reading the data does not support, in front of an audience. So:
 * a leading non-numeric column to name each row, at least one numeric column to plot, and few
 * enough rows that the drawing is legible.
 */
export function isChartable(res: TabularResult): boolean {
  if (res.rows.length < 2 || res.rows.length > CHART_MAX_ROWS) return false;
  if (res.columns.length < 2) return false;
  if (columnIsNumeric(res, 0)) return false; // no label column — a chart of ids is noise
  return res.columns.some((_, j) => j > 0 && columnIsNumeric(res, j));
}

/** label + value pairs for the first numeric column, tail-grouped when a donut asks for it. */
export function chartSeries(
  res: TabularResult,
  opts: { maxSegments?: number; otherLabel?: string } = {},
): { label: string; value: number }[] {
  const j = res.columns.findIndex((_, i) => i > 0 && columnIsNumeric(res, i));
  if (j < 0) return [];
  const all = res.rows.map((r) => ({
    label: String(r[0] ?? ""),
    value: Number(r[j]) || 0,
  }));
  const max = opts.maxSegments;
  if (max === undefined || all.length <= max) return all;
  // biggest first, then everything past the cap becomes one slice. Dropping the tail would
  // silently change the total the centre number reports, which is the one number being read.
  const sorted = [...all].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1).reduce((s, d) => s + d.value, 0);
  return [...head, { label: opts.otherLabel ?? "Other", value: tail }];
}
