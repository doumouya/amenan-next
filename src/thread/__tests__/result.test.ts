// Chart shape detection and tail-grouping (D42).
//
// `isChartable` decides whether the console OFFERS a chart. That is a claim about the data, made
// to someone who will read the drawing and not the table, so the tests here are mostly about the
// shapes it must REFUSE — a chart over the wrong result invites a reading the numbers do not
// support, which is worse than no chart at all.

import { describe, expect, it } from "vitest";
import { CHART_MAX_SEGMENTS, chartSeries, isChartable, isKpi } from "../result";
import type { TabularResult } from "../result";

const res = (columns: string[], rows: unknown[][]): TabularResult =>
  ({ columns, rows, rowCount: rows.length });

const channels = (n: number): TabularResult =>
  res(["channel", "orders"], Array.from({ length: n }, (_, i) => [`c${i}`, (i + 1) * 10]));

describe("isChartable", () => {
  it("accepts a label column plus a numeric column", () => {
    expect(isChartable(res(["channel", "orders"], [["direct", 12], ["retail", 8]]))).toBe(true);
  });

  it("refuses a single row — that is a KPI, and isKpi already owns it", () => {
    const one = res(["channel", "orders"], [["direct", 12]]);
    expect(isChartable(one)).toBe(false);
    expect(isKpi(one)).toBe(true);
  });

  it("refuses a single column — nothing to plot against", () => {
    expect(isChartable(res(["channel"], [["direct"], ["retail"]]))).toBe(false);
  });

  it("refuses an all-numeric result — a chart of ids is noise", () => {
    expect(isChartable(res(["id", "total"], [[1, 12], [2, 8]]))).toBe(false);
  });

  it("refuses when no column past the first is numeric", () => {
    expect(isChartable(res(["channel", "region"], [["direct", "eu"], ["retail", "us"]]))).toBe(false);
  });

  it("refuses more rows than a drawing can carry", () => {
    expect(isChartable(channels(50))).toBe(true);
    expect(isChartable(channels(51))).toBe(false);
  });

  it("tolerates numeric-looking strings, as the warehouse returns them", () => {
    expect(isChartable(res(["channel", "orders"], [["direct", "12"], ["retail", "8"]]))).toBe(true);
  });

  it("tolerates nulls in the numeric column", () => {
    expect(isChartable(res(["channel", "orders"], [["direct", null], ["retail", 8]]))).toBe(true);
  });
});

describe("chartSeries", () => {
  it("pairs the label column with the first numeric column", () => {
    expect(chartSeries(res(["channel", "orders"], [["direct", 12], ["retail", 8]])))
      .toEqual([{ label: "direct", value: 12 }, { label: "retail", value: 8 }]);
  });

  it("leaves the series alone at exactly the segment cap", () => {
    const out = chartSeries(channels(CHART_MAX_SEGMENTS), { maxSegments: CHART_MAX_SEGMENTS });
    expect(out).toHaveLength(CHART_MAX_SEGMENTS);
    expect(out.some((d) => d.label === "Other")).toBe(false);
  });

  it("groups the tail one past the cap", () => {
    const out = chartSeries(channels(CHART_MAX_SEGMENTS + 1), { maxSegments: CHART_MAX_SEGMENTS });
    expect(out).toHaveLength(CHART_MAX_SEGMENTS);
    expect(out[out.length - 1]!.label).toBe("Other");
  });

  it("preserves the total when grouping — the donut's centre number depends on it", () => {
    // dropping the tail instead of summing it would silently change the one number being read
    const full = channels(12);
    const total = full.rows.reduce((s, r) => s + Number(r[1]), 0);
    const grouped = chartSeries(full, { maxSegments: CHART_MAX_SEGMENTS });
    expect(grouped.reduce((s, d) => s + d.value, 0)).toBe(total);
  });

  it("groups the SMALLEST values, keeping the big slices named", () => {
    const out = chartSeries(channels(12), { maxSegments: CHART_MAX_SEGMENTS, otherLabel: "Rest" });
    expect(out[0]!.value).toBe(120); // c11, the largest
    expect(out[out.length - 1]!.label).toBe("Rest");
  });

  it("returns nothing when there is no numeric column to plot", () => {
    expect(chartSeries(res(["a", "b"], [["x", "y"]]))).toEqual([]);
  });
});
