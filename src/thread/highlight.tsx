// highlight.tsx — the SQL tokenizer behind the composer's highlight overlay.
//
// PROMOTED from datacore-gcp web/src/lib/datacore/highlight.tsx, and the promotion needs a
// sentence because that file's own header argued the OTHER way: "a shell component that knows
// what GROUP BY is has picked its consumer." That was right when SQL was one app's vocabulary.
// It stopped being right when the one-interface direction made BOTH house consumers speak SQL —
// numu2's datacore app is a SQL composer language (its S22) — so the vocabulary is now house
// vocabulary, and two copies of `SELECT`-colouring would drift the first time either learns a
// keyword.
//
// The mechanism/vocabulary split SURVIVES: `Composer` still takes `highlight?: (text) =>
// ReactNode` and never imports this. A consumer whose composer speaks something else passes its
// own tokenizer; this one is the SQL battery, included.
//
// Every colour is a token, never a hex: the highlight has to follow a theme switch like
// everything else does.

import type { ReactNode } from "react";

const KW = /^(select|from|where|group by|order by|limit|left join|inner join|join|on|and|or|as|asc|desc|distinct|having|like|in|is|not|null|between)/i;
const FN = /^(count|sum|avg|min|max|coalesce|round|lower|upper|date_trunc|cast)\b/i;

export function highlightSql(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (s: string, color?: string, italic?: boolean) =>
    out.push(
      <span key={key++} style={color ? { color, fontStyle: italic ? "italic" : undefined } : undefined}>
        {s}
      </span>,
    );
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^--[^\n]*/))) {
      push(m[0], "var(--text-mute)", true);
    } else if ((m = rest.match(/^'(?:[^']|'')*'|^"(?:[^"]|"")*"/))) {
      push(m[0], "var(--chart-4)");
    } else if ((m = rest.match(/^\d+(\.\d+)?/))) {
      push(m[0], "var(--chart-5)");
    } else if ((m = rest.match(KW))) {
      push(m[0], "var(--chart-3)");
    } else if ((m = rest.match(FN))) {
      push(m[0], "var(--chart-2)");
    } else if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
      push(m[0]);
    } else if ((m = rest.match(/^\s+/))) {
      push(m[0]);
    } else {
      push(rest[0]!, "var(--text-mute)");
      i += 1;
      continue;
    }
    i += m[0].length;
  }
  return out;
}
