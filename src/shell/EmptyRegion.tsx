// EmptyRegion — Figma `shell/EmptyRegion`, node 20:2. DONOR ConsoleChrome.tsx.
//
// FIGMA SPEC (verbatim substance): "A region that fills nothing SAYS so. Never remove these to
// 'clean up' a stub — the invariant frame is the law, and a panel that vanishes reads as broken,
// not minimal. The hint carries the auto-open promise the shell actually implements."
//
// That last clause is the one people delete first and it is the load-bearing one: the hint
// ("Click a row and it opens here") is not filler copy, it is the CONTRACT the right panel's
// auto-open actually keeps. If a consumer ever stops honouring context.key arrival, this line is
// the lie that has to be removed with it — not the other way round.
//
// Tokens: --text-mute (label + hint), amenan/label-md (label), amenan/label-sm (hint).
// The hint is at 80% opacity so the two lines read as heading + subtext without a second ink.

import { Symbol } from "./Symbol";

export function EmptyRegion({
  icon,
  label,
  hint,
}: {
  /** a Material Symbols ligature — see Symbol.tsx on the census law */
  icon: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Symbol name={icon} size="1.75rem" className="text-mute opacity-60" />
      <p className="text-label-md text-mute">{label}</p>
      {hint && <p className="max-w-52 text-label-sm text-mute opacity-80">{hint}</p>}
    </div>
  );
}
