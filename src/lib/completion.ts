// completion.ts — the composer's autocomplete SEAM, and nothing else.
//
// The type only. The donor shipped a SQL completer alongside it (keywords, table names, the
// resident frame's columns) and that vocabulary is the app's domain, not the platform's: a shell
// that knows what `GROUP BY` is has picked its consumer. So the platform declares the shape and
// the app supplies the function — `Composer`'s `compute` prop, whose default returns null.
//
// It lives in lib/ rather than in shell/Composer.tsx because lib/regions.ts references it too
// (`ComposerSpec.compute`), and a contract file importing from the component tier is a layering
// inversion that only gets worse.

export interface CompletionItem {
  /** what the list shows */
  label: string;
  /** what gets written into the field */
  insert: string;
  /** a short right-aligned category ("column", "table", "keyword" … app-defined) */
  kind: string;
}

export interface Completion {
  /** the start of the token being replaced; the range it replaces ends at the caret */
  from: number;
  items: CompletionItem[];
}
