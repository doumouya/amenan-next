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
// THE FOOTER STRIP (Em's direction, from the Figma Make export): the mode buttons and the `tune`
// config door share ONE strip at the chart's FOOT — in a card they sit beside the card's own
// footer controls, one control zone instead of two. The popover opens UPWARD and carries the
// export's three controls, per chart and only per chart (a table has no ratio):
//   · ASPECT — aspect-[32/11 · 16/9 · 4/3 · 1/1], default 32/11 (the export's default, and the
//     old fixed 640×220 viewBox's own ratio). LITERAL classes: Tailwind extracts class names
//     from source text, so a runtime `aspect-[${r}]` compiles to nothing.
//   · Y — gridline count, 2–6 (the export's cfgTicks), default 3.
//   · X — the per-category checkbox filter (the export's cfgRows), value shown beside each
//     label, and the export's lock rule verbatim: the last TWO checked lock, because a chart of
//     one category is not a comparison.
//
// The chart is never the only route to the data: a visually-hidden table carries the same numbers
// for screen readers, and a consumer's card keeps its table toggle one click away.

import { useRef, useState } from "react";
import { Popover } from "../shell/Popover";
import { Symbol } from "../shell/Symbol";
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
  /** the config trigger's accessible name */
  settings: string;
  /** the ratio row's caption (the export spells it "aspect") */
  aspect: string;
  /** the gridline-count row's caption */
  yTicks: string;
  /** the category-filter list's caption */
  xValues: string;
}

export const DEFAULT_RESULT_CHART_LABELS: ResultChartLabels = {
  bar: "Bar",
  line: "Line",
  donut: "Donut",
  other: "Other",
  rows: "rows",
  settings: "Chart settings",
  aspect: "aspect",
  yTicks: "y",
  xValues: "x",
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

/** the export's ratio set, LITERAL classes — see the header note */
const ASPECTS: [label: string, cls: string][] = [
  ["32/11", "aspect-[32/11]"],
  ["16/9", "aspect-[16/9]"],
  ["4/3", "aspect-[4/3]"],
  ["1/1", "aspect-[1/1]"],
];
/** the export's cfgTicks range */
const Y_TICKS = [2, 3, 4, 5, 6];

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

/**
 * The ROUNDED line (Em's direction): quadratic midpoint smoothing — each data point becomes the
 * control of a curve that passes through the midpoints around it. Chosen over a spline fit
 * because it can never overshoot: a smoothed reading of real numbers must not draw values that
 * are not in the data, and cubic fits do exactly that on sharp turns.
 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0]![0]},${pts[0]![1]} L${pts[1]![0]},${pts[1]![1]}`;
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx1, cy1] = pts[i]!;
    const mx = (cx1 + pts[i + 1]![0]) / 2;
    const my = (cy1 + pts[i + 1]![1]) / 2;
    d += ` Q${cx1},${cy1} ${mx},${my}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L${last[0]},${last[1]}`;
  return d;
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
  const [open, setOpen] = useState(false);
  const [aspect, setAspect] = useState(ASPECTS[0]![1]);
  const [yTicks, setYTicks] = useState(3);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const tuneRef = useRef<HTMLButtonElement>(null);

  const donut = mode === "donut";
  // the FULL series feeds the config list (a hidden category must stay pickable); the drawn
  // series is the filtered one, tail-grouped AFTER filtering so the donut's Other is honest
  // about what is actually on screen
  const full = chartSeries(res, {});
  const filtered = full.filter((d) => !hidden.has(d.label));
  const data = donut && filtered.length > CHART_MAX_SEGMENTS
    ? (() => {
        const sorted = [...filtered].sort((a, b) => b.value - a.value);
        const head = sorted.slice(0, CHART_MAX_SEGMENTS - 1);
        const tail = sorted.slice(CHART_MAX_SEGMENTS - 1).reduce((s, d) => s + d.value, 0);
        return [...head, { label: l.other, value: tail }];
      })()
    : filtered;
  if (full.length === 0) return null;

  const shownCount = filtered.length;
  const toggleValue = (label: string, on: boolean) => {
    // the export's lock rule: a chart of one category is not a comparison — the last two lock
    if (on && shownCount <= 2) return;
    const next = new Set(hidden);
    if (on) next.add(label);
    else next.delete(label);
    setHidden(next);
    setHover(null);
  };

  const caption = `${res.columns[0]} / ${res.columns[1] ?? ""}, ${data.length} ${l.rows}`;

  return (
    <div className="relative flex flex-col gap-2 p-4">
      <div className="relative">
        {donut
          ? <Donut data={data} label={caption} hover={hover} onHover={setHover} formatNumber={formatNumber} />
          : <Cartesian data={data} mode={mode} hover={hover} onHover={setHover} label={caption}
              aspect={aspect} yTicks={yTicks} formatNumber={formatNumber} />}

        {/* the tooltip is HTML, not SVG text: it inherits the type scale and the theme tokens,
            and a foreignObject would not survive a static export cleanly */}
        {!donut && hover !== null && data[hover] && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-border bg-bg px-2 py-1 text-label-md shadow-[var(--shadow-popover)]">
            <span className="text-mute">{data[hover]!.label}</span>
            <span className="num pl-2 text-ink" data-tabular>{formatNumber(data[hover]!.value)}</span>
          </div>
        )}
      </div>

      {/* the FOOTER strip: modes + the config door, one control zone (the export's row) */}
      <div className="flex items-center gap-1">
        <div className="flex-1" />
        {(["bar", "line", "donut"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md px-2 py-1 text-label-md hover:-translate-y-px active:translate-y-0 ${
              mode === m ? "bg-accent-soft text-accent" : "text-dim hover:bg-hover hover:text-ink"
            }`}
          >
            {l[m]}
          </button>
        ))}
        <button
          ref={tuneRef}
          type="button"
          aria-label={l.settings}
          title={l.settings}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`group flex h-7 items-center justify-center rounded-md px-2 ${
            open ? "bg-signal-tint text-signal" : "text-dim hover:bg-hover hover:text-ink"
          }`}
        >
          <Symbol name="tune" size="1.125rem" className="transition-transform duration-[var(--fast)] group-hover:scale-110 group-active:scale-90" />
        </button>
      </div>

      {/* the config door rides the Popover primitive: FIXED position, because a conversation
          card clips children to its rounded corners and an absolute panel taller than the card
          was truncated at its edge — the bug that built the primitive */}
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={tuneRef} direction="up">
            <span className="text-label-md text-mute">{l.aspect}</span>
            <div className="flex flex-wrap gap-0.5">
              {ASPECTS.map(([label, cls]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={aspect === cls}
                  onClick={() => setAspect(cls)}
                  className={`num rounded-md px-2 py-1 font-mono text-label-md hover:-translate-y-px active:translate-y-0 ${
                    aspect === cls ? "bg-signal-tint text-signal" : "text-dim hover:bg-hover hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-label-md text-mute">{l.yTicks}</span>
            <div className="flex flex-wrap gap-0.5">
              {Y_TICKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={yTicks === n}
                  onClick={() => setYTicks(n)}
                  className={`num rounded-md px-2 py-1 font-mono text-label-md hover:-translate-y-px active:translate-y-0 ${
                    yTicks === n ? "bg-signal-tint text-signal" : "text-dim hover:bg-hover hover:text-ink"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <span className="text-label-md text-mute">{`${l.xValues} — ${res.columns[0]}`}</span>
            <div className="flex max-h-48 flex-col overflow-y-auto">
              {full.map((d) => {
                const on = !hidden.has(d.label);
                const locked = on && shownCount <= 2;
                return (
                  <button
                    key={d.label}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={locked}
                    onClick={() => toggleValue(d.label, on)}
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
                    <span className="min-w-0 flex-1 truncate">{d.label}</span>
                    <span className="num pl-2 text-mute" data-tabular>{formatNumber(d.value)}</span>
                  </button>
                );
              })}
            </div>
      </Popover>

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
  data, mode, hover, onHover, label, aspect, yTicks, formatNumber,
}: {
  data: { label: string; value: number }[];
  mode: "bar" | "line";
  hover: number | null;
  onHover: (i: number | null) => void;
  label: string;
  aspect: string;
  yTicks: number;
  formatNumber: NumberFormatter;
}) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const y = (v: number): number => PAD.top + PLOT_H - (v / max) * PLOT_H;
  const step = PLOT_W / data.length;
  const cx = (i: number): number => PAD.left + step * (i + 0.5);
  const ticks = Array.from({ length: yTicks }, (_, k) => (k / (yTicks - 1)) * max);

  return (
    // the RATIO lives on this wrapper; the svg fills it and `meet` keeps the drawing whole.
    // The viewBox stays 640×220 — the config changes the CANVAS shape, not the geometry math.
    <div className={aspect}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
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
        {/* the grid is a whisper — thin lines at the rule token, count from the config */}
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
              <path
                d={smoothPath(data.map((d, i) => [cx(i), y(d.value)]))}
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
    </div>
  );
}

function Donut({
  data, label, hover, onHover, formatNumber,
}: {
  data: { label: string; value: number }[];
  label: string;
  hover: number | null;
  onHover: (i: number | null) => void;
  formatNumber: NumberFormatter;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const hovered = hover !== null ? data[hover] : undefined;

  // The centre is the donut's answer: the TOTAL at rest, the pointed-at slice on hover — the
  // value swaps in place rather than appearing in a tooltip, because the centre is exactly the
  // hole the drawing already reserves for the number being read. Hover arrives from the segment
  // OR its legend row (one shared state), so the legend teaches which slice is which.
  return (
    <div className="flex flex-wrap items-center justify-center gap-8" onMouseLeave={() => onHover(null)}>
      <svg viewBox="0 0 200 200" className="h-48 w-48" role="img" aria-label={label}>
        <g transform="rotate(-90 100 100)">
          {data.map((d, i) => {
            const len = total > 0 ? (d.value / total) * C : 0;
            const dash = `${len} ${C - len}`;
            const el = (
              <circle
                key={i}
                cx={100} cy={100} r={R}
                className={`fill-none ${at(STROKE, i)} transition-[stroke-width,opacity] duration-[var(--fast)] ${
                  hover === null || hover === i ? "opacity-100" : "opacity-40"
                }`}
                strokeWidth={hover === i ? 27 : 22}
                strokeLinecap="round"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                pointerEvents="visibleStroke"
                onMouseEnter={() => onHover(i)}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        {/* the centre number is the point of a donut — it is why this is not a pie */}
        <text x={100} y={hovered ? 98 : 104} textAnchor="middle" className="num fill-ink text-headline-sm" data-tabular>
          {formatNumber(hovered ? hovered.value : total)}
        </text>
        {hovered && (
          <text x={100} y={118} textAnchor="middle" className="fill-mute text-label-sm">
            {hovered.label.length > 14 ? `${hovered.label.slice(0, 13)}…` : hovered.label}
          </text>
        )}
      </svg>

      <ul className="flex flex-col gap-1">
        {data.map((d, i) => (
          <li
            key={d.label}
            onMouseEnter={() => onHover(i)}
            className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 text-label-md transition-opacity duration-[var(--fast)] ${
              hover === null || hover === i ? "opacity-100" : "opacity-40"
            } ${hover === i ? "bg-hover" : ""}`}
          >
            <span className={`size-2 rounded-full ${at(DOT, i)}`} aria-hidden />
            <span className="text-dim">{d.label}</span>
            <span className="num pl-2 text-mute" data-tabular>{formatNumber(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
