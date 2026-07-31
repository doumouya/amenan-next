"use client";

// markdown-lite → ReactNodes. A model's reply renders through THIS and nothing else — no HTML
// string ever exists, so the no-raw-HTML contract holds by construction, not by sanitizing.
// PROMOTED from datacore-gcp web/src/lib/markdown.ts (its gate 41 keeps the consumer side honest).
//
// Scope is deliberate but not minimal: paragraphs, bold/italic/`code`, bullet AND numbered
// lists, ATX headings h1–h3, fenced code blocks, and pipe tables. Anything else renders as its
// literal text. It grew past five tokens because a good model answer — headings, a SQL block, a
// comparison table — otherwise arrives on screen as raw markers, on the one surface an audience
// watches.
//
// `opts` exists for the same reason the components take `labels`: the only strings in here
// (CodeBlock's Copy/Copied) are consumer locale policy. Everything else is the text itself.

import { createElement, type ReactNode } from "react";
import { CodeBlock, type CodeBlockLabels } from "./CodeBlock";

export interface MarkdownOptions {
  codeLabels?: Partial<CodeBlockLabels>;
}

/** inline pass: `code` · **bold** · *italic* */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const m = rest.match(/`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[1] !== undefined) {
      out.push(
        createElement("code", { key, className: "rounded bg-surface-2 px-1 font-mono text-[0.9em]" }, m[1]),
      );
    } else if (m[2] !== undefined) {
      out.push(createElement("strong", { key, className: "font-semibold text-ink" }, m[2]));
    } else if (m[3] !== undefined) {
      out.push(createElement("em", { key }, m[3]));
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const FENCE = /^\s*```(\S*)\s*$/;
const BULLET = /^\s*[-•]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^(#{1,3})\s+(.*)$/;
/** a `|---|:--:|` delimiter row — what separates a table from a paragraph full of pipes */
const DELIM = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

const HEADING_CLASS = ["text-headline-sm", "text-title-lg", "text-title-md"];

/** `| a | b |` → ["a", "b"] — outer pipes are optional, inner empties are real cells */
function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function isTable(lines: string[]): boolean {
  return lines.length >= 2 && lines[0]!.includes("|") && DELIM.test(lines[1]!) && lines[1]!.includes("-");
}

function table(lines: string[], key: string): ReactNode {
  const head = cells(lines[0]!);
  const body = lines.slice(2).map(cells);
  // right-align a column when every body cell in it reads as a number — the same rule
  // ResultTable applies to query results, so a table from the model and a table from the
  // warehouse line up the same way
  const numeric = head.map((_, j) =>
    body.length > 0 && body.every((r) => {
      const v = (r[j] ?? "").replace(/[,\s]/g, "");
      return v === "" || Number.isFinite(Number(v));
    }),
  );
  return createElement(
    "div",
    { key, className: "overflow-x-auto" },
    createElement("table", { className: "w-full text-body-sm" }, [
      createElement("thead", { key: "h" },
        createElement("tr", { className: "border-b border-rule" },
          head.map((c, j) => createElement("th", {
            key: j,
            className: `px-3 py-2 text-label-md text-mute ${numeric[j] ? "text-right" : "text-left"}`,
          }, inline(c, `${key}-h${j}`))),
        ),
      ),
      createElement("tbody", { key: "b" },
        body.map((r, i) => createElement("tr", { key: i, className: "border-b border-rule" },
          head.map((_, j) => createElement("td", {
            key: j,
            className: `px-3 py-2 text-ink ${numeric[j] ? "num text-right" : ""}`,
            ...(numeric[j] ? { "data-tabular": true } : {}),
          }, inline(r[j] ?? "", `${key}-${i}-${j}`))),
        )),
      ),
    ]),
  );
}

function list(lines: string[], ordered: boolean, key: string): ReactNode {
  const strip = ordered ? ORDERED : BULLET;
  return createElement(
    ordered ? "ol" : "ul",
    { key, className: `${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5` },
    lines.map((l, li) => createElement("li", { key: li }, inline(l.replace(strip, ""), `${key}-${li}`))),
  );
}

/** one blank-line-delimited block → zero or more nodes */
function blockNodes(block: string, key: string): ReactNode[] {
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  if (isTable(lines)) return [table(lines, key)];
  if (lines.every((l) => BULLET.test(l))) return [list(lines, false, key)];
  if (lines.every((l) => ORDERED.test(l))) return [list(lines, true, key)];

  // mixed run: a heading owns its line, everything between headings is a paragraph
  const out: ReactNode[] = [];
  let para: string[] = [];
  const flushPara = (): void => {
    if (para.length === 0) return;
    const pk = `${key}-p${out.length}`;
    out.push(createElement("p", { key: pk },
      para.flatMap((l, li) => {
        const nodes = inline(l, `${pk}-${li}`);
        return li < para.length - 1 ? [...nodes, createElement("br", { key: `br${li}` })] : nodes;
      }),
    ));
    para = [];
  };
  for (const l of lines) {
    const h = l.match(HEADING);
    if (h) {
      flushPara();
      const level = h[1]!.length;
      out.push(createElement(`h${level}`, {
        key: `${key}-h${out.length}`,
        className: `${HEADING_CLASS[level - 1]} text-ink`,
      }, inline(h[2]!, `${key}-h${out.length}`)));
    } else {
      para.push(l);
    }
  }
  flushPara();
  return out;
}

/**
 * block pass: fences first (they may contain blank lines, so they cannot survive a naive
 * blank-line split), then paragraphs, lists, headings and tables in what is left.
 */
export function renderMarkdownLite(text: string, opts: MarkdownOptions = {}): ReactNode[] {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const out: ReactNode[] = [];
  let buf: string[] = [];
  let k = 0;

  const flushBuf = (): void => {
    if (buf.length === 0) return;
    for (const block of buf.join("\n").split(/\n{2,}/)) out.push(...blockNodes(block, `b${k++}`));
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i]!.match(FENCE);
    if (!fence) {
      buf.push(lines[i]!);
      continue;
    }
    flushBuf();
    const lang = fence[1] ?? "";
    const body: string[] = [];
    i += 1;
    while (i < lines.length && !FENCE.test(lines[i]!)) {
      body.push(lines[i]!);
      i += 1;
    }
    // An UNCLOSED fence still renders as a code block. The alternative — falling back to raw text
    // — is worse in the case that actually happens: a reply cut short, or one still arriving, whose
    // content is plainly code. Showing it as code is right either way, and it means adding
    // streaming later does not make the block flicker between two renderings.
    out.push(createElement(CodeBlock, {
      key: `f${k++}`,
      code: body.join("\n"),
      lang: lang || undefined,
      labels: opts.codeLabels,
    }));
  }
  flushBuf();
  return out;
}
