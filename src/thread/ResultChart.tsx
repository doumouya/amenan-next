"use client";

// ResultChart — bar / line / donut over a tabular result, drawn as SVG. PROMOTED from
// datacore-gcp web/src/components/data/ResultChart.tsx.
//
// SVG rather than a chart library, and the reason is the theme, not the weight. Switching theme
// is ONE attribute write on <html>; an SVG whose bars are `fill-chart-1` re-colours from that
// alone, while a canvas has to read computed styles and be told to redraw — so it keeps the old
// palette until something forces a repaint. That is the theme-wipe failure the house already
// paid for once. Every colour below is a token utility for the same reason.
//
// The chart is never the only route to the data: a visually-hidden table carries the same numbers
// for screen readers, and a consumer's card keeps its table toggle one click away.

import { useState } from "react";
import {
  CHART_MAX_SEGMENTS,
  chartSeries,
  defaultFormatNumber,
  type NumberFormatter,
  type TabularResult,
} from "./result";

export type ChartMode = "bar" | "line" | "donut";

export interface ResultChartLabels {
  bar: string;
  line: string;
  donut: string;
  /** the donut's grouped tail slice */
  other: string;
  /** the aria caption's unit word — "…, 12 rows" */
  rows: string;
}

export const DEFAULT_RESULT_CHART_LABELS: ResultChartLabels = {
  bar: "Bar",
  line: "Line",
  donut: "Donut",
  other: "Other",
  rows: "rows",
};

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
// Cycled across segments. These are written out as LITERALS on purpose: Tailwind extracts class
// names by scanning source text, so a runtime `fill-chart-${n}` produces a class that was never
// compiled and the shape renders transparent. The palette is 8; the donut caps at 5 anyway.
const FILL = [
  "fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-4",
  "fill-chart-5", "fill-chart-6", "fill-chart-7", "fill-chart-8",
];
const STROKE = [
  "stroke-chart-1", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4",
  "stroke-chart-5", "stroke-chart-6", "stroke-chart-7", "stroke-chart-8",
];
const DOT = [
  "bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4",
  "bg-chart-5", "bg-chart-6", "bg-chart-7", "bg-chart-8",
];
const at = (list: string[], i: number): string => list[i % list.length]!;

/** nice-ish ceiling so the top gridline is a round number rather than the exact max */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

/** a rect with only its TOP corners rounded — `rx` would round all four */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export function ResultChart({
  res,
  labels,
  formatNumber = defaultFormatNumber,
}: {
  res: TabularResult;
  labels?: Partial<ResultChartLabels>;
  formatNumber?: NumberFormatter;
}) {
  const l = { ...DEFAULT_RESULT_CHART_LABELS, ...labels };
  const [mode, setMode] = useState<ChartMode>("bar");
  const [hover, setHover] = useState<number | null>(null);

  const donut = mode === "donut";
  const data = chartSeries(res, donut
    ? { maxSegments: CHART_MAX_SEGMENTS, otherLabel: l.other }
    : {});
  if (data.length === 0) return null;

  const label = `${res.columns[0]} / ${res.columns[1] ?? ""}, ${data.length} ${l.rows}`;

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-1">
        <div className="flex-1" />
        {(["bar", "line", "donut"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md px-2 py-1 text-label-md ${
              mode === m ? "bg-accent-soft text-accent" : "text-dim hover:bg-hover hover:text-ink"
            }`}
          >
            {l[m]}
          </button>
        ))}
      </div>

      <div className="relative">
        {donut
          ? <Donut data={data} label={label} formatNumber={formatNumber} />
          : <Cartesian data={data} mode={mode} hover={hover} onHover={setHover} label={label} formatNumber={formatNumber} />}

        {/* the tooltip is HTML, not SVG text: it inherits the type scale and the surface tokens,
            and a foreignObject would not survive a static export cleanly */}
        {!donut && hover !== null && data[hover] && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-label-md shadow-[var(--shadow-popover)]">
            <span className="text-mute">{data[hover]!.label}</span>
            <span className="num pl-2 text-ink" data-tabular>{formatNumber(data[hover]!.value)}</span>
          </div>
        )}
      </div>

      {/* same numbers, for anyone the drawing does not serve */}
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><th scope="row">{d.label}</th><td>{d.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cartesian({
  data, mode, hover, onHover, label, formatNumber,
}: {
  data: { label: string; value: number }[];
  mode: "bar" | "line";
  hover: number | null;
  onHover: (i: number | null) => void;
  label: string;
  formatNumber: NumberFormatter;
}) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const y = (v: number): number => PAD.top + PLOT_H - (v / max) * PLOT_H;
  const step = PLOT_W / data.length;
  const cx = (i: number): number => PAD.left + step * (i + 0.5);
  const ticks = [0, 0.5, 1].map((f) => f * max);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      onMouseLeave={() => onHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const i = Math.floor((px - PAD.left) / step);
        onHover(i >= 0 && i < data.length ? i : null);
      }}
    >
      {/* the grid is a whisper — three lines, at the rule token */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-rule" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="fill-mute text-label-sm">
            {formatNumber(v)}
          </text>
        </g>
      ))}

      {mode === "bar"
        ? data.map((d, i) => (
            <path
              key={i}
              d={barPath(cx(i) - step * 0.3, y(d.value), step * 0.6, PAD.top + PLOT_H - y(d.value), 8)}
              className={`${at(FILL, i)} ${hover === i ? "opacity-100" : "opacity-90"}`}
            />
          ))
        : (
          <>
            <polyline
              points={data.map((d, i) => `${cx(i)},${y(d.value)}`).join(" ")}
              className="fill-none stroke-chart-1"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* no markers until you point at one — a line of dots reads as noise */}
            {hover !== null && data[hover] && (
              <>
                <line
                  x1={cx(hover)} x2={cx(hover)} y1={PAD.top} y2={PAD.top + PLOT_H}
                  className="stroke-rule" strokeWidth={1}
                />
                <circle cx={cx(hover)} cy={y(data[hover]!.value)} r={4} className="fill-chart-1" />
              </>
            )}
          </>
        )}

      {data.map((d, i) => (
        <text
          key={i}
          x={cx(i)}
          y={H - 8}
          textAnchor="middle"
          className="fill-mute text-label-sm"
        >
          {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
        </text>
      ))}
    </svg>
  );
}

function Donut({
  data, label, formatNumber,
}: {
  data: { label: string; value: number }[];
  label: string;
  formatNumber: NumberFormatter;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-8">
      <svg viewBox="0 0 200 200" className="h-48 w-48" role="img" aria-label={label}>
        <g transform="rotate(-90 100 100)">
          {data.map((d, i) => {
            const len = total > 0 ? (d.value / total) * C : 0;
            const dash = `${len} ${C - len}`;
            const el = (
              <circle
                key={i}
                cx={100} cy={100} r={R}
                className={`fill-none ${at(STROKE, i)}`}
                strokeWidth={22}
                strokeLinecap="round"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        {/* the centre number is the point of a donut — it is why this is not a pie */}
        <text x={100} y={104} textAnchor="middle" className="num fill-ink text-headline-sm" data-tabular>
          {formatNumber(total)}
        </text>
      </svg>

      <ul className="flex flex-col gap-1">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-label-md">
            <span className={`size-2 rounded-full ${at(DOT, i)}`} aria-hidden />
            <span className="text-dim">{d.label}</span>
            <span className="num pl-2 text-mute" data-tabular>{formatNumber(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
