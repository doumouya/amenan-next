"use client";

// CodeBlock — a fenced block from a model's reply: language label, Copy, horizontal scroll.
// PROMOTED from datacore-gcp web/src/components/ui/CodeBlock.tsx.
//
// The code arrives as a TEXT CHILD of <pre>, never as markup. That is the whole XSS posture of
// this surface: the reply is untrusted model output, and the only reason it cannot inject
// anything is that no HTML string is ever built from it. A `dangerouslySetInnerHTML` here — for
// syntax highlighting, say — would quietly end that, in every consumer at once now.
//
// No scrollbar styling: the bars are hidden globally by the consumer's app CSS (the house
// scrollbar law); a local re-statement here would be the second copy of that rule.

import { useState } from "react";
import { Symbol } from "../shell/Symbol";

export interface CodeBlockLabels {
  copy: string;
  copied: string;
}

export const DEFAULT_CODE_BLOCK_LABELS: CodeBlockLabels = {
  copy: "Copy",
  copied: "Copied",
};

/** how a fence's info string prints. Anything unlisted uppercases — an unknown language is still
 *  a useful label, and a lookup table nobody maintains is worse than none. */
const LABELS: Record<string, string> = {
  js: "JavaScript", ts: "TypeScript", tsx: "TSX", py: "Python", sh: "Shell", bash: "Bash",
  yml: "YAML", md: "Markdown", jsonl: "JSONL",
};

function label(lang: string): string {
  const key = lang.toLowerCase();
  return LABELS[key] ?? key.toUpperCase();
}

export function CodeBlock({
  code,
  lang,
  labels,
}: {
  code: string;
  lang?: string;
  labels?: Partial<CodeBlockLabels>;
}) {
  const l = { ...DEFAULT_CODE_BLOCK_LABELS, ...labels };
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard is permission-gated and absent over plain http. Staying silent is right here:
      // the code is on screen and selectable, so a failed copy costs a keystroke, and a toast for
      // it would interrupt a demo over something the user can see did not happen.
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <div className="flex items-center gap-2 border-b border-rule px-3 py-1.5">
        <span className="text-label-sm text-mute">{lang ? label(lang) : ""}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-label-md text-dim hover:bg-hover hover:text-ink"
        >
          <Symbol name={copied ? "check" : "content_copy"} size="1rem" />
          {copied ? l.copied : l.copy}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-body-sm text-ink">{code}</pre>
    </div>
  );
}
