// Composer — Figma `shell/Composer`, node 18:9. DONOR Composer.tsx.
//
// FIGMA SPEC (verbatim substance):
//
//   "ONE framed control, TWO rows — field alone, then controls. The frame is rounded-xl +
//    border on the INPUT; the region container stays bg. The placeholder is DRAWN: a native one
//    wraps AND counts toward scrollHeight, so on this auto-growing field it either chopped its
//    second line or grew the composer by a row before a character was typed. The textarea must be
//    `block` — inline-level sits on its wrapper's baseline and grows a ~7px descender gap,
//    shearing every 36px button off the centreline. There is NO send button: Enter runs."
//
// Behaviour at numu1 parity: Enter runs · Shift+Enter newlines · ↑↓ recalls history
// (draft-preserving) or navigates the open autocomplete · Tab accepts a completion (or the inline
// ghost) · Esc dismisses. A prompt glyph, a declarative action bar, a syntax-highlight overlay
// (a mirrored <pre> under a transparent textarea), and a focus/blur seam (cx-focus / cx-blur).
//
// THE COMPOSER STAYS DUMB. It emits `run(value)`; the caller owns execution and the thread. That
// is not tidiness — a composer that knows how to run a query cannot be reused by anything that
// runs something else, and this one is the AI front door on every page.
//
// FOUR THINGS THAT LOOK LIKE STYLE AND ARE NOT:
//  · TWO ROWS. It was one row, which capped the field at whatever the icons left over — 260px at
//    the presentation window with eight controls competing for the rest.
//  · The DRAWN placeholder (see the spec above). `aria-describedby` carries the hint to assistive
//    tech, which is stronger semantics than a placeholder anyway.
//  · The field, the mirrored <pre> and the drawn placeholder carry the SAME padding. They are
//    three stacked layers of the same text; move one alone and the syntax highlight slides off
//    the characters it is colouring.
//  · The caret is a BEAM, never a block. With `text-transparent` the highlighted character is
//    painted UNDER the caret, so a block caret hides the very character you are editing.
//
// PLATFORM-TIER DEVIATIONS from the donor — parameter-or-leak calls:
//  · `complete(text, caret, columns)` — the built-in SQL completer — is GONE, and with it the
//    `columns` prop that fed it. SQL keywords and a warehouse's table names are the app's
//    vocabulary. `compute` now defaults to `() => null` (no completion) and the app supplies its
//    own; the seam type is lib/completion.ts.
//  · `t("data.composerAria")` / `t("shell.composer.newline")` / `t("shell.composer.accept")` →
//    `labels`, English defaults.
//  · `highlightNodes` — the SQL tokenizer — is kept but demoted to `highlight?: (text) => ReactNode`.
//    Colouring `SELECT` is app vocabulary too; what the platform owns is the OVERLAY MECHANISM
//    (the mirrored <pre>, the shared padding, the transparent textarea), which is the part that is
//    hard to get right and easy to break. Pass a tokenizer, get highlighting; pass nothing, get a
//    plain field. The donor's `highlight?: boolean` becomes this function — same switch, no
//    dialect baked in.
//
// FIGMA-vs-DONOR RECONCILIATION: the Figma frame is `pl-[12px] pr-[8px] py-[8px]` on a 560px box
// with 32px action buttons; the donor is `p-2` with 36px buttons (44px below md, the touch-target
// law). FOLLOWED THE DONOR — the Figma numbers are one frozen width of a fluid control, and 32px
// touch targets are a regression the donor already paid to fix. The token bindings from Figma are
// kept exactly: --surface ground, --border edge, --radius-xl frame, --signal prompt, --text-mute
// placeholder, --signal-tint on an active action, --radius-sm on the action buttons.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Symbol } from "./Symbol";
import type { Completion } from "../lib/completion";
// ONE definition, in the contract file. A second `ComposerAction` declared here would drift from
// the one a surface's spec is typed against, and the two would agree right up until they didn't.
import type { ComposerAction } from "../lib/regions";

export type { ComposerAction };

export interface ComposerLabels {
  field: string;
  newline: string;
  accept: string;
}

export const DEFAULT_COMPOSER_LABELS: ComposerLabels = {
  field: "Composer",
  newline: "New line",
  accept: "Accept completion",
};

export interface ComposerProps {
  placeholder: string;
  /** returns an error string to show under the field, or null */
  onRun: (value: string) => Promise<string | null>;
  /** controlled draft; omit for the internal one */
  value?: string;
  onChange?: (v: string) => void;
  /** the ↑↓ recall ring, oldest first */
  history?: string[];
  prompt?: string;
  actions?: ComposerAction[];
  /**
   * The user's pinned apps — rendered at the FAR END of the control row, past a spring, so "what
   * this composer does" and "what I pinned to it" never read as one undifferentiated bar.
   */
  favorites?: ComposerAction[];
  /**
   * The leading door, rendered iff present. A single action, not a list, so the type cannot
   * describe a menu: the `+` popover this replaced had three sections whose every item existed one
   * row below it, and a menu like that is a click tax over its one useful item.
   */
  attach?: ComposerAction;
  compute?: (text: string, caret: number) => Completion | null;
  /**
   * The syntax-highlight tokenizer. Present → the mirrored <pre> overlay renders its output and
   * the textarea's own glyphs go transparent. Absent → a plain field.
   */
  highlight?: (text: string) => ReactNode;
  /** show the top completion's tail inline, when the caret sits at the very end */
  ghost?: boolean;
  labels?: Partial<ComposerLabels>;
}

export function Composer({
  placeholder,
  onRun,
  value,
  onChange,
  history = [],
  prompt = "❯",
  actions = [],
  favorites = [],
  attach,
  compute,
  highlight,
  ghost = false,
  labels,
}: ComposerProps) {
  const l = { ...DEFAULT_COMPOSER_LABELS, ...labels };
  const [inner, setInner] = useState("");
  const draft = value ?? inner;
  const setDraft = onChange ?? setInner;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ref = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const hintId = useId(); // the drawn placeholder's id — the field points at it, see below
  const caret = useRef(0);
  const histIdx = useRef<number | null>(null);
  const stash = useRef("");

  const [ac, setAc] = useState<Completion | null>(null);
  const [acSel, setAcSel] = useState(0);
  const computeFn = compute ?? (() => null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`; // the spike's cap
    if (preRef.current) preRef.current.style.height = el.style.height;
  }, [draft]);

  function syncScroll() {
    if (preRef.current && ref.current) {
      preRef.current.scrollTop = ref.current.scrollTop;
      preRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }

  function recompute(text: string, at: number) {
    setAc(computeFn(text, at));
    setAcSel(0);
  }

  function accept(c: Completion) {
    const item = c.items[acSel] ?? c.items[0];
    if (!item) return;
    const next = draft.slice(0, c.from) + item.insert + draft.slice(caret.current);
    setDraft(next);
    setAc(null);
    const pos = c.from + item.insert.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.selectionStart = el.selectionEnd = pos;
        caret.current = pos;
      }
    });
  }

  async function run() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    setAc(null);
    histIdx.current = null;
    setError(await onRun(v));
    setBusy(false);
  }

  function newline() {
    const el = ref.current;
    if (!el) return;
    const at = el.selectionStart;
    setDraft(draft.slice(0, at) + "\n" + draft.slice(el.selectionEnd));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = at + 1;
      caret.current = at + 1;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (ac) {
      if (e.key === "ArrowDown") return e.preventDefault(), setAcSel((s) => (s + 1) % ac.items.length);
      if (e.key === "ArrowUp")
        return e.preventDefault(), setAcSel((s) => (s - 1 + ac.items.length) % ac.items.length);
      if (e.key === "Tab") return e.preventDefault(), accept(ac);
      if (e.key === "Escape") return e.preventDefault(), setAc(null);
    }
    if (e.key === "Enter" && !e.shiftKey) return e.preventDefault(), void run();

    // ↑↓ recall only from the edges of the draft, so multi-line editing keeps its arrow keys
    const atFirstLine = !draft.slice(0, el.selectionStart).includes("\n");
    const atLastLine = !draft.slice(el.selectionEnd).includes("\n");
    if (e.key === "ArrowUp" && atFirstLine && history.length) {
      e.preventDefault();
      if (histIdx.current === null) {
        stash.current = draft; // the in-progress draft is restored when you walk back off the end
        histIdx.current = history.length - 1;
      } else if (histIdx.current > 0) histIdx.current -= 1;
      setDraft(history[histIdx.current] ?? "");
      return;
    }
    if (e.key === "ArrowDown" && atLastLine && histIdx.current !== null) {
      e.preventDefault();
      if (histIdx.current < history.length - 1) setDraft(history[(histIdx.current += 1)] ?? "");
      else {
        histIdx.current = null;
        setDraft(stash.current);
      }
    }
  }

  // the inline ghost: the top completion's tail, shown when the caret sits at the very end
  const ghostItem = ac ? (ac.items[acSel] ?? ac.items[0]) : undefined;
  const ghostTail =
    ghost && ac && ghostItem && caret.current === draft.length
      ? ghostItem.insert.slice(caret.current - ac.from)
      : "";

  return (
    <div className="relative px-6 py-3 short:py-1 max-md:px-4">
      {ac && (
        <ul
          role="listbox"
          className="absolute bottom-full left-8 z-[var(--z-popover)] mb-1 max-h-48 w-64 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-popover"
        >
          {ac.items.map((it, i) => (
            <li
              key={it.label}
              role="option"
              aria-selected={i === acSel}
              onMouseDown={(e) => {
                e.preventDefault(); // before blur, or the list is gone by the time click lands
                setAcSel(i);
                accept(ac);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1 font-mono text-body-sm ${
                i === acSel ? "bg-signal-tint text-ink" : "text-dim"
              }`}
            >
              <span className="flex-1 truncate">{it.label}</span>
              <span className="text-label-sm text-mute">{it.kind}</span>
            </li>
          ))}
        </ul>
      )}

      {/* TWO ROWS INSIDE ONE FRAME. The frame is on the INPUT; the region container stays bg. */}
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow)] transition-[border-color,box-shadow] duration-[var(--fast)] focus-within:border-accent focus-within:shadow-[var(--focus-ring)] short:gap-0.5 short:p-1">
        {/* ── ROW 1: the prompt and the field, and nothing else ── */}
        <div className="flex items-start gap-2">
          <span
            className="mt-2 shrink-0 select-none font-mono text-body-md text-signal short:mt-1"
            aria-hidden={!busy}
          >
            {/* there is no RUN button (Enter runs), so its busy state lands here — run feedback
                must not disappear with the control that used to carry it */}
            {busy ? <Symbol name="hourglass_top" size="1rem" className="animate-pulse" /> : prompt}
          </span>

          {/* the field + the highlight/ghost overlay share one box */}
          <div className="relative min-w-0 flex-1">
            {/* THE PLACEHOLDER IS DRAWN, and there is no native one at all — see the header. */}
            {!draft && placeholder && (
              <span
                id={hintId}
                className="pointer-events-none absolute inset-x-0 top-0 block truncate px-2 py-2 font-mono text-body-md leading-6 text-mute short:py-1"
              >
                {placeholder}
              </span>
            )}
            {(highlight || ghostTail) && (
              <pre
                ref={preRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-2 font-mono text-body-md leading-6 short:py-1"
              >
                {highlight ? highlight(draft) : draft}
                {ghostTail && <span className="text-mute opacity-60">{ghostTail}</span>}
                {"\n"}
              </pre>
            )}
            <textarea
              ref={ref}
              name="composer"
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                caret.current = e.target.selectionStart;
                histIdx.current = null;
                recompute(e.target.value, e.target.selectionStart);
              }}
              onScroll={syncScroll}
              onKeyUp={(e) => (caret.current = e.currentTarget.selectionStart)}
              onClick={(e) => {
                caret.current = e.currentTarget.selectionStart;
                setAc(null);
              }}
              onKeyDown={onKeyDown}
              // the focus/blur seam: chrome elsewhere dims itself while the composer is hot
              onFocus={() => document.dispatchEvent(new CustomEvent("cx-focus"))}
              onBlur={() => {
                setTimeout(() => setAc(null), 120); // let a click on the list land first
                document.dispatchEvent(new CustomEvent("cx-blur"));
              }}
              aria-describedby={!draft && placeholder ? hintId : undefined}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={l.field}
              enterKeyHint="send"
              // `block` is load-bearing — see the header on the ~7px descender gap
              className={`relative block min-h-10 w-full resize-none bg-transparent px-2 py-2 font-mono text-body-md leading-6 outline-none placeholder:text-transparent short:min-h-8 short:py-1 ${
                // the highlighted text is painted by the <pre> BELOW this element, so the
                // textarea's own glyphs go transparent and only the caret is drawn from here — as
                // a BEAM, never a block (a block caret covers the character it sits on)
                highlight ? "text-transparent caret-[var(--text)]" : ""
              }`}
            />
          </div>
        </div>

        {/* ── ROW 2: the attach door, the composer's own controls, then the pinned apps ── */}
        <div className="flex items-center gap-0.5">
          {/* leading, chat-app style. A paperclip rather than a `+`: a `+` promises "more", and
              there is no more — it opens one door and nothing else. */}
          {attach && (
            <button
              onClick={attach.onClick}
              title={attach.title}
              aria-label={attach.title}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-ink max-md:size-11"
            >
              <Symbol name={attach.icon ?? "attach_file"} size="1.375rem" />
            </button>
          )}

          {/* the declarative action bar. It renders at EVERY width — it used to be hidden below md
              and duplicated in the touch strip below, and row 2 has the room. */}
          {actions.map((a) => (
            <ActionButton key={a.id} action={a} />
          ))}

          <span className="flex-1" />

          {/* past the spring: the user's additions, not the composer's own verbs */}
          {favorites.map((a) => (
            <ActionButton key={a.id} action={a} />
          ))}
        </div>
      </div>

      {/* the touch strip: the two keys a soft keyboard cannot send. Only these two — the rest of
          the bar renders at every width now, so repeating it here would be a duplicate. */}
      <div className="mt-1 hidden flex-wrap items-center gap-1 max-md:flex">
        <ActionButton
          action={{
            id: "kb-newline",
            icon: "keyboard_return",
            title: l.newline,
            hold: true,
            onClick: newline,
          }}
        />
        <ActionButton
          action={{
            id: "kb-accept",
            icon: "keyboard_tab",
            title: l.accept,
            hold: true,
            onClick: () => ac && accept(ac),
          }}
        />
      </div>

      {error && (
        <p role="alert" className="truncate pb-1 pl-8 text-label-md text-danger" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

function ActionButton({ action }: { action: ComposerAction }) {
  // `hold` fires on mousedown: tab-accept and newline must run BEFORE the field blurs, or the
  // completion they act on has already been dismissed
  const handler = action.hold
    ? {
        onMouseDown: (e: React.MouseEvent) => {
          e.preventDefault();
          action.onClick();
        },
      }
    : { onClick: action.onClick };
  return (
    <button
      {...handler}
      title={action.title}
      aria-label={action.title}
      aria-pressed={action.active}
      disabled={action.disabled}
      className={`flex ${
        action.label ? "h-9 gap-1.5 px-2 max-md:h-11" : "size-9 max-md:size-11"
      } cursor-pointer items-center justify-center rounded-md hover:bg-surface-2 disabled:cursor-default disabled:opacity-40 ${
        action.active ? "bg-signal-tint" : ""
      } ${action.active && action.accent ? "animate-pulse" : ""} ${
        action.accent ? "text-signal" : "text-dim hover:text-ink"
      }`}
    >
      {action.img ? (
        // a brand mark stays an <img>, never a recolored ligature
        <img src={action.img} alt="" aria-hidden className="size-[1.125rem]" />
      ) : (
        <Symbol name={action.icon ?? "circle"} size="1.125rem" />
      )}
      {action.label ? <span className="text-label-md">{action.label}</span> : null}
    </button>
  );
}
