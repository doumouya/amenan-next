#!/usr/bin/env bash
# 11-docs-coverage — a doc without a DOCMAP row does not exist, and a link that 404s is drift.
#
# The tier went public (MIT) with a 183-line docs plane; the docs round that fixed it is only
# durable if navigation is a PROPERTY, not a habit — the sibling repos' docs-coverage recipe,
# sized for this tree. Rules:
#   R1  every markdown doc (README.md + docs/*.md) has EXACTLY ONE row in docs/DOCMAP.md
#   R2  every DOCMAP row's target exists on disk
#   R3  every relative markdown link in any doc resolves to a real file
# Self-tested PER RULE against a fixture tree (SELF-TEST below).

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

check() { # $1 = repo root to scan
  python3 - "$1" <<'PY'
import os, re, sys

root = sys.argv[1]
docmap = os.path.join(root, "docs/DOCMAP.md")
fails = 0

docs = [os.path.join(root, "README.md")] if os.path.exists(os.path.join(root, "README.md")) else []
ddir = os.path.join(root, "docs")
if os.path.isdir(ddir):
    docs += [os.path.join(ddir, n) for n in sorted(os.listdir(ddir)) if n.endswith(".md")]

if not os.path.exists(docmap):
    print("FINDING [R2] docs/DOCMAP.md is missing — the index IS the navigation contract")
    sys.exit(1)
dm = open(docmap, encoding="utf-8").read()

# R1: bijection, doc -> row. A ROW is a table line (`| ... |`) linking the doc by relative
# path; prose elsewhere in the DOCMAP may mention a doc freely without becoming a second row.
rows = [ln for ln in dm.split("\n") if ln.lstrip().startswith("|")]
rowtext = "\n".join(rows)
for p in docs:
    rel = os.path.relpath(p, ddir).replace("\\", "/")
    n = len(re.findall(rf"\(\s*{re.escape(rel)}\s*\)", rowtext))
    if n != 1:
        print(f"FINDING [R1] {os.path.relpath(p, root)} has {n} DOCMAP row(s) — exactly one is the law")
        fails += 1

# R2: row -> file. Every relative link inside DOCMAP resolves.
# R3: same rule over every doc. One scanner, two attributions.
def links_of(path):
    txt = open(path, encoding="utf-8").read()
    # strip fenced code first — a link inside an example is not navigation
    txt = re.sub(r"```.*?```", "", txt, flags=re.S)
    for m in re.finditer(r"\[[^\]]*\]\(([^)#\s]+)(#[^)\s]*)?\)", txt):
        href = m.group(1)
        if re.match(r"^[a-z]+:", href):  # absolute URL — not this gate's subject
            continue
        yield href

# the DOCMAP is in `docs` too (it lives in docs/) — dedupe, or every broken row rings twice
for p in [docmap] + [x for x in docs if os.path.abspath(x) != os.path.abspath(docmap)]:
    tag = "R2" if p == docmap else "R3"
    for href in links_of(p):
        target = os.path.normpath(os.path.join(os.path.dirname(p), href))
        if not os.path.exists(target):
            print(f"FINDING [{tag}] {os.path.relpath(p, root)} links {href} — nothing at {os.path.relpath(target, root)}")
            fails += 1

if not docs:
    print("FINDING [R1] no markdown docs found at all — the scan reached nothing")
    fails += 1

print(f"docs-coverage: {'clean' if not fails else f'{fails} finding(s)'} ({len(docs)} doc(s) against the DOCMAP)")
sys.exit(1 if fails else 0)
PY
}

# ── SELF-TEST: one isolated plant per rule, asserted by its own tag ──────────────────────────
d="$(mktemp -d)"; trap 'rm -rf "$d"' EXIT
mkdir -p "$d/docs"
st_out=''
run() { st_out="$(check "$d" 2>&1 || true)"; }
expect() { # $1 = tag, $2 = count, $3 = the plant
  n="$(printf '%s\n' "$st_out" | grep -cF "$1")"
  [ "$n" -eq "$2" ] && return 0
  echo "docs-coverage: SELF-TEST FAILED — $1 must fire exactly $2 time(s) on $3, got $n"
  printf '%s\n' "$st_out"; exit 1
}

fixture_clean() {
  cat > "$d/README.md" <<'MD'
See [the design](docs/DESIGN.md).
MD
  cat > "$d/docs/DESIGN.md" <<'MD'
Back to [the README](../README.md).
MD
  cat > "$d/docs/DOCMAP.md" <<'MD'
| [README](../README.md) | the pitch |
| [DESIGN](DESIGN.md) | the design |
| [DOCMAP](DOCMAP.md) | this index |
MD
}

fixture_clean; run
for tag in '[R1]' '[R2]' '[R3]'; do expect "$tag" 0 'the clean fixture — every rule silent'; done

cat > "$d/docs/orphan.md" <<'MD'
No row anywhere.
MD
run
expect '[R1]' 1 'one doc with no DOCMAP row'
expect '[R3]' 0 'links all resolving — R3 must stay silent'
rm "$d/docs/orphan.md"

printf '| [ghost](ghost.md) | a row with no file |\n' >> "$d/docs/DOCMAP.md"
run
expect '[R2]' 1 'one DOCMAP row pointing at nothing'
fixture_clean

printf 'A [dead link](missing.md).\n' >> "$d/docs/DESIGN.md"
run
expect '[R3]' 1 'one dead relative link in a doc'
fixture_clean

# ── the real run ──
check "$(pwd)"
