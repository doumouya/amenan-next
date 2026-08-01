#!/usr/bin/env bash
# 13-docs-currency — code lands WITH its docs reconciliation, or says out loud why not.
#
# The sibling repos' build-loop law, ported the day this repo's docs plane was built: two of the
# three commits before it landed real feature work with ZERO docs churn, and nothing rang. The
# rule reads HEAD (the merge-base shape: on a fresh checkout HEAD is the commit under review):
# a commit touching src/ or tools/ must also touch README.md or docs/ — OR carry an honest
#   Docs: n/a (<reason>)
# line in its message. The escape is deliberate and visible: a mechanical rename does not need a
# doc, but the CLAIM that it doesn't must sit in the commit for a reviewer to disagree with.
# Reddening one commit late (the next run sees the omission) is accepted — late and loud beats
# never.
#
# Self-test exempt: the oracle is `git show` over real history — a fixture repo would test git,
# not this rule. The rule body is three greps, each visible below.

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if ! git rev-parse HEAD >/dev/null 2>&1; then
  echo "docs-currency: no git history readable — nothing to check (a tarball checkout)"
  exit 0
fi

files="$(git show --name-only --format='' HEAD)"
msg="$(git log -1 --format='%B')"

touches_code=false
touches_docs=false
printf '%s\n' "$files" | grep -qE '^(src|tools)/' && touches_code=true
printf '%s\n' "$files" | grep -qE '^(docs/|README\.md)' && touches_docs=true

if $touches_code && ! $touches_docs; then
  if ! printf '%s\n' "$msg" | grep -qE '^Docs: n/a \(.+\)'; then
    echo "FINDING [R1] HEAD ($(git log -1 --format='%h %s' | cut -c1-72)) touches src/ or tools/"
    echo "             with no docs churn and no 'Docs: n/a (<reason>)' line. Reconcile the doc"
    echo "             the change made stale (docs/DOCMAP.md routes), or state why none exists."
    echo "docs-currency: 1 finding(s)"
    exit 1
  fi
  echo "docs-currency: clean (HEAD declares 'Docs: n/a' — the claim is on the record)"
  exit 0
fi

echo "docs-currency: clean (HEAD touches code:$touches_code docs:$touches_docs)"
