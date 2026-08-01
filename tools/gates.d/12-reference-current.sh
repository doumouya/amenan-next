#!/usr/bin/env bash
# 12-reference-current — docs/REFERENCE.md is a QUERY, and this gate is what keeps it one.
#
# The file is generated (tools/gen-reference.mjs) from the compiler's view of the two public
# entries. A generated doc that nothing re-checks is a hand-written doc with extra steps: the
# barrel moves, the copy stays, and the "generated" banner now lies. So: regenerate into a
# scratch tree, byte-diff against the committed copy, red on ANY difference. Determinism is the
# generator's contract (sorted output, no timestamps) — that is what makes staleness a byte
# question this gate can ask.
#
# Self-test exempt: the oracle is the generator + `cmp` — a plant would re-assert that `cmp`
# detects a changed byte, which is coreutils' claim, not this gate's (the sibling suite's D59
# rule). The MISSING-file direction is a real rule below, not a plant.

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [ ! -f docs/REFERENCE.md ]; then
  echo "FINDING [R1] docs/REFERENCE.md is missing — run: node tools/gen-reference.mjs"
  echo "reference-current: 1 finding(s)"
  exit 1
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cp docs/REFERENCE.md "$tmp/committed.md"

node tools/gen-reference.mjs >/dev/null 2>"$tmp/err" || {
  echo "FINDING [R2] the generator itself failed:"
  sed 's/^/    /' "$tmp/err"
  # restore the committed copy — a broken generator must not eat the doc
  cp "$tmp/committed.md" docs/REFERENCE.md
  echo "reference-current: 1 finding(s)"
  exit 1
}

if ! cmp -s docs/REFERENCE.md "$tmp/committed.md"; then
  # leave the REGENERATED copy in place — the fix is to commit it, and the diff shows the drift
  echo "FINDING [R3] docs/REFERENCE.md is STALE — the public surface moved and the doc did not."
  echo "             The regenerated copy is now in your working tree; review and commit it:"
  diff "$tmp/committed.md" docs/REFERENCE.md | head -12 | sed 's/^/    /'
  echo "reference-current: 1 finding(s)"
  exit 1
fi

n="$(grep -c '^| `' docs/REFERENCE.md)"
echo "reference-current: clean ($n symbol row(s) match the compiler's view)"
