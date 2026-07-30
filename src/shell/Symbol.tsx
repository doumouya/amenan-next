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
