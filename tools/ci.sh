#!/usr/bin/env bash
# amenan-next CI — auto-discovers gates. Two shapes, both supported from day one:
#   tools/gates.d/<nn>-<name>.sh        — a flat gate script
#   tools/<name>-audit/audit.sh         — a gate that needs a directory of its own
# Adding a gate NEVER edits this file. A gate exits 0 = green, non-zero = red (its own output
# explains why); ci.sh is red if any gate is.
#
# `npm run ci` runs this. Typecheck and tests are separate scripts on purpose — they answer
# "does it compile / does it behave", and the gates answer "is it still the thing we said it was".
set -u
cd "$(dirname "$0")/.."

mkdir -p tools/gates.d

shopt -s nullglob
gates=(tools/gates.d/*.sh tools/*-audit/audit.sh)
if [ ${#gates[@]} -eq 0 ]; then
  # NOT "trivially green": a suite that discovers nothing is the same vacuity a gate's own [R0]
  # guard refuses, one level up. An empty gates.d in a repo whose stated purpose is a census is a
  # broken checkout or a bad path, never a clean bill of health.
  echo "ci: RED — no gates discovered under tools/gates.d/ or tools/*-audit/"
  exit 1
fi

red=0
for g in "${gates[@]}"; do
  case "$g" in
    */audit.sh) name="$(basename "$(dirname "$g")")" ;;
    *)          name="$(basename "$g")" ;;
  esac
  echo "── gate: $name"
  if bash "$g"; then
    echo "   ✔ $name"
  else
    echo "   ✘ $name FAILED"
    red=$((red + 1))
  fi
done

echo "──────────────────────────────"
if [ "$red" -gt 0 ]; then
  echo "ci: RED — $red gate(s) failed"
  exit 1
fi
echo "ci: green — ${#gates[@]} gate(s)"
