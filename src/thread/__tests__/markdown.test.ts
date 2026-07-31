// The reply renderer (D42). Every test here is about untrusted model output: what the console
// does with whatever the model happened to emit.
//
// Rendered through renderToStaticMarkup rather than a DOM library — the contract under test is
// "which elements come out", and the markup string also lets the XSS case assert on ESCAPING,
// which is the one thing a node-shape assertion would miss.

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdownLite } from "../markdown";

const html = (md: string): string =>
  renderToStaticMarkup(createElement("div", null, renderMarkdownLite(md)));

describe("renderMarkdownLite", () => {
  it("renders a fenced block with its language label", () => {
    const out = html("```sql\nSELECT 1\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("SELECT 1");
    expect(out).toContain("SQL");
  });

  it("keeps blank lines inside a fence", () => {
    // the reason fences are extracted BEFORE the blank-line split: a naive split shreds them
    const out = html("```\na\n\nb\n```");
    expect(out).toContain("a\n\nb");
  });

  it("renders an unclosed fence as code, not as raw text", () => {
    // a reply cut short, or one still arriving. Its content is plainly code either way.
    const out = html("```python\nprint(1)");
    expect(out).toContain("<pre");
    expect(out).toContain("print(1)");
    expect(out).not.toContain("```");
  });

  it("does not treat fence content as markdown", () => {
    const out = html("```\n**not bold**\n```");
    expect(out).not.toContain("<strong");
    expect(out).toContain("**not bold**");
  });

  it("renders a pipe table and right-aligns numeric columns", () => {
    const out = html("| channel | orders |\n|---|---|\n| direct | 1200 |\n| retail | 340 |");
    expect(out).toContain("<table");
    expect(out).toContain("direct");
    expect(out).toContain("text-right");
  });

  it("leaves a pipe paragraph alone when there is no delimiter row", () => {
    const out = html("this | that | other");
    expect(out).not.toContain("<table");
    expect(out).toContain("<p");
  });

  it("renders h1 through h3", () => {
    const out = html("# One\n\n## Two\n\n### Three");
    expect(out).toContain("<h1");
    expect(out).toContain("<h2");
    expect(out).toContain("<h3");
  });

  it("renders numbered lists, which models emit constantly", () => {
    const out = html("1. first\n2. second");
    expect(out).toContain("<ol");
    expect(out).toContain("first");
  });

  it("still renders bullets, bold, italic and inline code", () => {
    expect(html("- a\n- b")).toContain("<ul");
    expect(html("**b**")).toContain("<strong");
    expect(html("*i*")).toContain("<em");
    expect(html("`c`")).toContain("<code");
  });

  it("renders a heading followed by prose as both", () => {
    const out = html("## Findings\nthe revenue rose");
    expect(out).toContain("<h2");
    expect(out).toContain("<p");
  });

  // ── the load-bearing one ────────────────────────────────────────────────────
  it("renders HTML in the reply as visible text, never as elements", () => {
    // This is the docs/API.md §2 contract, and it holds because no HTML STRING is ever built —
    // React escapes text children. If someone swaps this renderer for one that emits markup and
    // injects it, this test is what fails. Gate 41 guards the same rule statically.
    const out = html('<img src=x onerror=alert(1)> and <script>alert(2)</script>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;script");
  });

  it("escapes HTML inside a fenced block too", () => {
    const out = html("```html\n<script>alert(1)</script>\n```");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("returns nothing for empty input rather than throwing", () => {
    expect(renderMarkdownLite("")).toEqual([]);
    expect(renderMarkdownLite("   \n\n  ")).toEqual([]);
  });
});
