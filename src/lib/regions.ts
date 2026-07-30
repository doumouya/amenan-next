"use client";

// The console REGION contract — the React adaptation of amenan's assemblePage/PageSpec, and the
// code home of the five-regions-always-present law (README, "The laws it carries"). A surface
// DECLARES its five regions; the shell renders them ALWAYS present (the house deviation from
// amenan's omit-empty: a console's identity IS its constant chrome, so an unfilled region shows
// an empty state, never a collapse). The active surface publishes its spec through a tiny
// external store; only the region renderers subscribe (useSyncExternalStore), so SurfaceHost
// never re-renders on a chrome update — no loop.

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Completion } from "./completion";

// EXTRACTION NOTE (amenan-next): two imports were cut on the way out of datacore-gcp/web, because
// each one pinned this contract to one app and one framework.
//
//  1. `usePathname` from `next/navigation`. The path is used for ONE thing — the per-path last-key
//     memory below — and importing a router to get it makes this library Next-only. It is now the
//     third argument of `useConsoleRegions`, defaulting to `location.pathname`. A Next consumer
//     passes `usePathname()` explicitly, which is the exact value the donor used; the default is
//     for everyone else and is correct wherever the History API is settled by effect time.
//  2. The donor's built-in SQL completer. The COMPLETION SHAPE is platform (lib/completion.ts);
//     the vocabulary that used to come with it — keywords, a warehouse's table names — is the
//     app's, and a contract that knows what `GROUP BY` is has picked its consumer.
//
// `ComposerAction` below stays the single definition — `shell/Composer.tsx` imports it from here,
// so the spec's actions and the component's actions cannot drift apart.

/**
 * The composer config the shell hands to <Composer> (the fifth region).
 *
 * A surface declares what the composer DOES — never what it HOLDS. The draft text and the ↑↓
 * recall ring are shell-owned, and the shell's composer region reads them directly rather than
 * receiving them back through this spec.
 *
 * That is not a tidiness rule, it is the cascade fix. `value`/`onChange`/`history` used to live
 * here, so a surface read the draft out of the store only to hand it straight back through this
 * spec: every keystroke changed the spec, `useConsoleRegions` republished it, and publishing
 * re-rendered all three regions. No memo could help — the spec really had changed. Cutting the
 * round-trip is what makes the publish cheap again.
 */
export interface ComposerSpec {
  /** the composer awaits nothing and reads nothing back — a handler may still return something
   *  useful to a DIRECT caller (an app's query runner handing its rows to the caller that asked) */
  run: (value: string) => void | Promise<unknown>;
  /**
   * The surface's PREFERRED composer mode when the user holds no override; the consumer's shell
   * chrome resolves it.
   *
   * A STRING, not a union, and that is the same call the `compute` and `highlight` seams already
   * made one field below: the platform owns the SEAM ("a surface may prefer a mode"), the app owns
   * the VOCABULARY. It arrived here as `"sql" | "agent"`, which are one console's two modes — a
   * consumer whose composer runs, say, `ask | edit` could not express its own preference without
   * editing the platform, and every consumer would inherit a mode named after a query language it
   * may not speak. Unrecognised values are the resolver's business, not this contract's.
   */
  defaultMode?: string;
  placeholder?: string;
  prompt?: string;
  /** the decoupled O(1) autocomplete seam (amenan contract) */
  compute?: (text: string, caret: number) => Completion | null;
  /** the declarative action bar (the numu1 kbtools as data) */
  actions?: ComposerAction[];
  highlight?: boolean;
  ghost?: boolean;
  columns?: string[];
}

// The `+` popover's types lived here — ComposerMoreItem / ComposerMoreSection / RegionsSpec.more.
// All three are gone. The menu they described was retired when its every item turned out to exist
// one row below it, and a spec field that nothing renders is the same "green while wrong" shape
// this repo keeps paying for: a surface could pass sections forever and see nothing.
// The leading slot is now ONE `ComposerAction` (`Composer`'s `attach` prop), shell-owned.

export interface ComposerAction {
  id: string;
  /** a Material Symbols glyph — a UI glyph follows the theme, so it is a font ligature */
  icon?: string;
  /** a BRAND mark, which does not follow the theme: an image path, rendered as <img>, never
   *  recolored (e.g. /icons/brand/gemini.svg) */
  img?: string;
  /**
   * A short text label rendered BESIDE the icon, widening the button from a square.
   *
   * Rare on purpose — the bar is icons, and a row of labelled buttons stops being scannable. It
   * exists for the case where the VALUE is the information rather than the action: a picker whose
   * current selection has to be legible without opening anything ("Amazon Redshift" on a dialect
   * button), and 44px touch targets still hold because the button only grows.
   */
  label?: string;
  title: string;
  onClick: () => void;
  /** mousedown instead of click (tab/newline must fire before blur) */
  hold?: boolean;
  accent?: boolean;
  /** a toggled-on state (e.g. the agent-mode switch while in agent mode) */
  active?: boolean;
  disabled?: boolean;
}

/** what a surface declares for its chrome; every field optional → the shell shows empty states */
export interface RegionsSpec {
  /** the object-rail content (the CRUD tree); null/absent → the rail empty state */
  rail?: ReactNode;
  railEmptyText?: string;
  /** the context panel — the shell owns the header (a CENTRED cluster: expand · retract) + the
   *  body. `title` is OPTIONAL and renders as the body's heading, not as a title bar: a body that
   *  names itself (ConnectorDetail's brand mark + name + status) passes none, and one that cannot
   *  (a selected row is just values) passes one. Never both — the duplicate shows.
   *  No per-surface close: the panel retracts to a strip (shell chrome), like the object rail.
   *  `key` = a SEMANTIC selection id ("row:5", "connector:bigquery") — the shell auto-opens the
   *  panel when it changes to a non-null value. Object identity is USELESS for this (the spec
   *  republishes on every surface render); a missing key degrades to presence ("present").
   *  `expandedBody` (optional) is shown INSTEAD of `body` when the panel is expanded to full
   *  width — the room for a richer view (e.g. the agent guardrail switches). Absent → `body`. */
  context?: { key?: string; title?: ReactNode; body: ReactNode; expandedBody?: ReactNode } | null;
  contextEmptyText?: string;
  /** the composer config, or null → a disabled placeholder composer (still present) */
  composer?: ComposerSpec | null;
}

// ── the external store (subscribe / snapshot) ───────────────────────────────────────────────
const EMPTY: RegionsSpec = {};
let current: RegionsSpec = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// ── context-arrival detection (the auto-open law: "click a row … opens here") ───────────────
// Detection lives at the PUBLISH site because only here is attribution certain: store.set is
// gated on `active`, so the spec IS the current surface's. A watcher in the renderer can't know
// that — after navigation the store briefly holds the OLD surface's spec against the NEW
// pathname, and a kept-alive surface republishing its old selection would false-pop the panel.
// Per-path last-key memory closes both traps: returning to a surface with a held selection is
// key-equal → silent; a genuinely NEW selection (null→key or key A→B) fires.
const lastKeyByPath = new Map<string, string | null>();
const arrivalListeners = new Set<() => void>();

function contextKey(spec: RegionsSpec): string | null {
  return spec.context ? (spec.context.key ?? "present") : null;
}

/** the shell subscribes here: fired when the active surface presents a NEW context selection */
export function onContextArrival(fn: () => void): () => void {
  arrivalListeners.add(fn);
  return () => arrivalListeners.delete(fn);
}

// ── context-expand request (the "Manage guardrails ⤢" shortcut) ─────────────────────────────
// A context body can ask the shell to expand the panel to full width — where its `expandedBody`
// lives. Same store idiom as arrival; the consumer's shell wires it to its own panel state.
const expandListeners = new Set<() => void>();

/** the shell subscribes here: fired when a context body requests full-width expansion */
export function onContextExpandRequest(fn: () => void): () => void {
  expandListeners.add(fn);
  return () => expandListeners.delete(fn);
}

/** a context body calls this to ask the shell to expand the panel (e.g. "Manage guardrails ⤢") */
export function requestContextExpand(): void {
  for (const l of expandListeners) l();
}

const store = {
  set(spec: RegionsSpec, path: string) {
    current = spec;
    emit();
    const key = contextKey(spec);
    const prev = lastKeyByPath.get(path) ?? null;
    if (key !== prev) {
      lastKeyByPath.set(path, key);
      if (key !== null) for (const l of arrivalListeners) l();
    }
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot(): RegionsSpec {
    return current;
  },
};

/**
 * The ACTIVE surface publishes its region spec here (guard with the surface's active flag so a
 * kept-alive but hidden surface never overwrites the visible one). Every surface must call it —
 * a stub passing `{}` clears the chrome to empty states.
 */
export function useConsoleRegions(spec: RegionsSpec, active: boolean, path?: string): void {
  // `path` keys the per-path last-key memory below. A Next consumer passes `usePathname()`; the
  // fallback reads the settled URL, which is what an effect sees after commit.
  const pathname =
    path ?? (typeof location === "undefined" ? "/" : location.pathname);
  useEffect(() => {
    if (active) store.set(spec, pathname);
    // no cleanup: the next active surface overwrites; a deactivated surface stays silent
  });
}

/** the shell's region renderers read the active spec here */
export function useActiveRegions(): RegionsSpec {
  return useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY);
}
