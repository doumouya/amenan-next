// Symbol — the code home of the Figma `icon/ms/*` component family
// (nodes 31:4 keyboard_double_arrow_left · 31:7 keyboard_double_arrow_right · 31:10 open_in_full ·
//  31:13 close_fullscreen · 31:34 attach_file · 31:37 mic · 31:40 sync_alt · 31:46 storefront ·
//  31:49 account_circle · 31:52 light_mode · 31:58 settings).
// DONOR components/ui/Symbol.tsx.
//
// Every one of those Figma components carries the same description, and it is a WARNING, not a
// credit line:
//
//   "Material Symbols Outlined 400 … In a console this ships as a SUBSETTED font (tens of glyphs,
//    36 KiB from a 10.2 MiB variable font), censused by ligature name and hash-locked in the
//    consumer's build — a glyph rendered but not listed paints as its literal ligature WORD,
//    because font-display is block. Here it is a vector so Figma can show it without the font
//    installed. Fill is BOUND to --text-dim: these are UI glyphs, not brand marks, so they follow
//    the theme."
//
// So: the name you pass is a LIGATURE, not a file. It renders correctly only if it is in the
// consumer's glyph census. Add a glyph → add the census line → re-subset the font → commit it.
// Skip that and the button reads `keyboard_double_arrow_left` in 18px Roboto. This is also why
// the shell inlines NO svg and downloads NO Figma asset PNG: the vectors in Figma exist so the
// design file renders without the font, and committing them would fork the icon source of truth.
//
// The `.msym` / `.msym-fill` classes and the @font-face live in theme/fonts.css (promoted).
// A BRAND MARK is not a Symbol — it stays an <img>, unmodified and never recolored.
// The glyphs this tier needs are censused in src/shell/symbols.txt, in the donor's format.

import type { ReactNode } from "react";

export function Symbol({
  name,
  filled = false,
  className = "",
  size = "1.5rem",
}: {
  /** a Material Symbols ligature name — MUST be in the consumer's glyph census */
  name: string;
  filled?: boolean;
  className?: string;
  size?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${filled ? "msym msym-fill" : "msym"} ${className}`}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}

/**
 * The glyph-ref seam (2026-08-01, the rail UX round). A consumer-fed icon REF is a string with a
 * fixed grammar: a BARE name is a Material Symbols ligature — forever, so stored row styles never
 * need a migration — and a future icon pack claims a PREFIX (`bi:pin-angle`,
 * `url:/icons/mine/x.svg`) that a consumer-supplied renderer resolves. The tier renders every
 * consumer-fed ref through ONE renderer prop defaulting to this function; adding a pack is a
 * resolver + assets in the consumer, zero tier change — the O(1) door. Tier CHROME glyphs
 * (chevrons, drag handles, the more_horiz trigger) stay direct `<Symbol>`s: they are not
 * consumer vocabulary and no pack ever answers for them.
 */
export type GlyphRenderer = (ref: string, size: string) => ReactNode;

export const renderMaterialGlyph: GlyphRenderer = (ref, size) => <Symbol name={ref} size={size} />;
