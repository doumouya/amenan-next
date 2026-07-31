#!/usr/bin/env bash
# 10-component-census — the bidirectional component census, and the three leaks a platform tier
# cannot see in its own tests.
#
# SCOPE, declared once so a rule is never quietly pointed at half the tree:
#   · the CENSUS rules (R1·R2·R3) walk the COMPONENT roots — `src/shell/**` and `src/thread/**`
#     (the thread renderers joined in the one-interface arc) — and `src/index.ts`.
#   · the LEAK rules (R4·R5·R6) and R8 walk the SHIPPED roots: the component roots AND
#     `src/lib/**`. All of it is shipped platform code with the same obligations; a rule that
#     walks only `src/shell` is half a rule, which is the single most common defect in the
#     sibling suite — and adding a root here without adding it to `component_src`/`shipped_src`
#     below recreates it.
#   · R7 walks ALL of `src/**` including `src/theme/**`, because the live instance of that leak
#     was in the theme tier (`dc-theme` in theme.ts, `.dc-gridguide` in grid.css).
#   · `__tests__` directories are OUT of every rule: they are not the tier's public surface, and a
#     fixture may legitimately name a consumer (rail-tree.test.tsx has a project called
#     "datacore"). This is a scope decision, not an exemption — no file is skipped by its name.
#
# WHY THIS REPO NEEDS A CENSUS AND NOT A CONVENTION. The stated purpose here is controlling
# component growth. A convention ("export it from the barrel", "no hex outside theme/") is a thing
# a reader must remember while doing something else; a census is a question the machine asks every
# time. The four rules the extraction asked for, mapped onto the tags below:
#
#   rule 1 (both directions of the barrel)  → R1 + R2 + R3
#   rule 2 (no consumer / framework import)  → R4
#   rule 3 (no raw colour outside theme/)    → R5
#   rule 4 (every used variant is declared)  → R6
#   the Job-1 fix, mechanized so it stays fixed → R7
#
# R6 IS THE ONE THAT PAYS FOR THE REST. `short:py-1` with no `@custom-variant short` declared
# compiles to NOTHING — no error, no warning, no missing-class diagnostic anywhere in the
# toolchain. The composer simply stops compacting on a short window and every test stays green.
# That is the exact "green while wrong" shape, it is invisible to typecheck and to unit tests, and
# it is trivially mechanizable: the variants a component USES must be either Tailwind's own or
# declared in the theme tier this repo ships.
#
# R3 exists because R1 alone is an "is it exported" check, which says nothing about a component
# that is exported from nowhere and used by nobody. Dead weight is the growth this repo exists to
# control, and the only kind the barrel cannot see.
#
# COMMENTS ARE FREE. Every rule below reads STRIPPED code: this file's own prohibitions are named
# in the headers of the files it governs (`// · That also removes the file's only next/* import`,
# `// a `dc-` literal baked into the platform tier is a leak with no payer`), and a gate that fires
# on its own documentation teaches people to word around it instead of obeying it.
set -uo pipefail

check() { # $1 = repo root to scan
  python3 - "$1" <<'PY'
import os
import re
import sys

root = sys.argv[1]
SRC = os.path.join(root, 'src')
SHELL = os.path.join(SRC, 'shell')
THREAD = os.path.join(SRC, 'thread')
LIB = os.path.join(SRC, 'lib')
THEME = os.path.join(SRC, 'theme')
BARREL = os.path.join(SRC, 'index.ts')

# The names this tier must never reach for. Consumers by name, and the framework the port
# deliberately removed — the shell is framework-agnostic and `next/*` must not come back.
CONSUMERS = ('datacore', 'numu2')
FRAMEWORKS = ('next',)
APP_ALIASES = ('@/', '~/')
# Namespace prefixes owned by a consumer. `datacore` the WORD is NOT here: it is a legitimate
# THEME name (`html[data-theme="datacore"]`, the M3 Google-console look) and legitimate provenance
# prose. `dc-` is never either — it is only ever a storage key, a DOM id or a class in one app's
# namespace, which is precisely what a shared tier may not mint.
LEAKED_PREFIXES = ('dc-',)

fails = 0


def finding(tag, msg):
    global fails
    print('FINDING [%s] %s' % (tag, msg))
    fails += 1


def rel(p):
    return os.path.relpath(p, root)


# ── the stripper: comments out, string literals kept and also returned separately ────────────
# A rule that tests for an IMPORT or a COLOUR must test code, not text, or a commented-out example
# rings and a reader learns to avoid the words rather than the thing.
REGEX_MAY_START = set('(,=:[!&|?{};+-*%~^<>')


def scan(text):
    """Return (code_with_comments_blanked, [string-literal contents])."""
    out = []
    lits = []
    i, n, prev = 0, len(text), ''
    while i < n:
        c = text[i]
        if c == '/' and i + 1 < n and text[i + 1] == '/':
            j = text.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
            continue
        if c == '/' and i + 1 < n and text[i + 1] == '*':
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
            continue
        if c == '/' and prev in REGEX_MAY_START:
            j, incls = i + 1, False
            while j < n:
                d = text[j]
                if d == '\\':
                    j += 2
                    continue
                if d == '\n':
                    break
                if d == '[':
                    incls = True
                elif d == ']':
                    incls = False
                elif d == '/' and not incls:
                    break
                j += 1
            if j < n and text[j] == '/':
                out.append(text[i:j + 1])
                prev, i = '/', j + 1
                continue
        if c in '"\'`':
            j, buf = i + 1, []
            while j < n:
                d = text[j]
                if d == '\\':
                    buf.append(text[j:j + 2])
                    j += 2
                    continue
                if d == c:
                    break
                buf.append(d)
                j += 1
            lits.append(''.join(buf))
            out.append(text[i:j + 1] if j < n else text[i:])
            prev, i = c, j + 1
            continue
        out.append(c)
        if not c.isspace():
            prev = c
        i += 1
    return ''.join(out), lits


def strip_css(text):
    """Blank CSS comments, keeping string literals whole.

    STRING-AWARE ON PURPOSE, and it cost a red self-test to learn why: the regex form of this
    (`/\\*.*?\\*/`) eats `/**/` wherever it appears — including inside `@source "../**/*.{ts,tsx}"`,
    where `/**/` is the recursive-glob separator and ALSO, read as CSS, a perfectly valid empty
    comment. R8 then measured `..    *.{ts,tsx}` and declared the whole tier unscanned. The lexer
    was right about CSS and wrong about the only thing that matters, which is the same shape as the
    bug R8 exists to catch.
    """
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '/' and text.startswith('/*', i):
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
            continue
        if c in '"\'':
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == '\\' else 1
            out.append(text[i:j + 1])
            i = j + 1
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def sources(*roots):
    out = []
    for r in roots:
        for dirpath, dirnames, filenames in os.walk(r):
            dirnames[:] = sorted(d for d in dirnames if d != '__tests__')
            for f in sorted(filenames):
                if f.endswith(('.ts', '.tsx')):
                    out.append(os.path.join(dirpath, f))
    return sorted(out)


def css_files():
    if not os.path.isdir(THEME):
        return []
    return sorted(os.path.join(THEME, f) for f in os.listdir(THEME) if f.endswith('.css'))


shell_src = sources(SHELL)
thread_src = sources(THREAD)
lib_src = sources(LIB)
all_src = sources(SRC)
# the two composite scopes every rule below is phrased in — see the SCOPE note in the header
component_src = shell_src + thread_src
shipped_src = component_src + lib_src
code = {p: scan(read(p)) for p in all_src}
css = css_files()

# ── components ───────────────────────────────────────────────────────────────────────────────
# A component is a PascalCase function declaration. That is this tier's whole convention (every
# component in src/shell is `export function Name(...)`), and it is deliberately not "anything
# returning JSX": a heuristic that has to parse return types would be a second, weaker parser.
FUNC_COMPONENT = re.compile(r'(?m)^(export\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*\(')
ARROW_COMPONENT = re.compile(
    r'(?m)^(export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*(?::\s*[^=\n]+)?=\s*'
    r'(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=>')
EXPORT_DECL = re.compile(
    r'(?m)^export\s+(?:default\s+)?(?:async\s+)?'
    r'(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)')
EXPORT_LIST = re.compile(r'(?m)^export\s+(?:type\s+)?\{([^}]*)\}')
EXPORT_FROM = re.compile(r'export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]')
EXPORT_STAR = re.compile(r'export\s+\*\s*from\s*[\'"]([^\'"]+)[\'"]')
IMPORT_FROM = re.compile(r'(?:^|[^\w$])(?:from|import)\s*\(?\s*[\'"]([^\'"]+)[\'"]')


def is_component_name(n):
    return bool(re.match(r'^[A-Z][A-Za-z0-9]*$', n)) and any(c.islower() for c in n)


def components_of(body):
    """{name: exported?} for every component declared at the top level of `body`."""
    found = {}
    for rx in (FUNC_COMPONENT, ARROW_COMPONENT):
        for m in rx.finditer(body):
            if is_component_name(m.group(2)):
                found[m.group(2)] = found.get(m.group(2), False) or bool(m.group(1))
    return found


def exported_names(body):
    names = set(EXPORT_DECL.findall(body))
    for block in EXPORT_LIST.findall(body):
        for entry in block.split(','):
            entry = entry.strip()
            if not entry:
                continue
            parts = entry.split()
            names.add(parts[-1])  # `A as B` exports B; `A` exports A
    return names


def norm(p):
    return os.path.normpath(os.path.abspath(p))


def resolve(spec, from_dir):
    base = norm(os.path.join(from_dir, spec))
    for cand in (base + '.ts', base + '.tsx',
                 os.path.join(base, 'index.ts'), os.path.join(base, 'index.tsx')):
        if os.path.isfile(cand):
            return norm(cand)
    return base + '.ts'  # non-existent: R2 reports it


# ── R0 · vacuity ─────────────────────────────────────────────────────────────────────────────
# A gate that scans an empty tree and prints "clean" is the defect the whole discipline exists to
# prevent, so each thing this gate must have found is asserted to exist before any verdict.
barrel_ok = os.path.isfile(BARREL)
if not barrel_ok:
    finding('R0', '%s not found — the barrel IS the public surface this gate censuses; without it '
                  'R1 and R2 have nothing to compare against and would report clean'
            % rel(BARREL))
if not shipped_src:
    finding('R0', 'no .ts/.tsx sources under %s or %s — the leak rules scanned nothing and would '
                  'report clean over an empty or mis-rooted tree' % (rel(SHELL), rel(LIB)))
if not css:
    finding('R0', 'no .css under %s — R6 resolves every used variant against the theme tier, so '
                  'with no theme tier it either fires on everything or (worse) on nothing'
            % rel(THEME))

# ── R1 / R2 · the census, both directions ────────────────────────────────────────────────────
barrel_entries = []   # (module_spec, source_name, public_name)
barrel_stars = set()
if barrel_ok:
    bcode, _ = scan(read(BARREL))
    for block, spec in EXPORT_FROM.findall(bcode):
        for entry in block.split(','):
            entry = entry.strip()
            if not entry:
                continue
            entry = re.sub(r'^type\s+', '', entry)
            parts = entry.split()
            src_name = parts[0]
            pub_name = parts[-1]
            barrel_entries.append((spec, src_name, pub_name))
    barrel_stars = set(EXPORT_STAR.findall(bcode))

barrel_by_module = {}
for spec, src_name, _pub in barrel_entries:
    barrel_by_module.setdefault(resolve(spec, SRC), set()).add(src_name)
# `export * from "./shell/X"` re-exports X wholesale, so R1 has nothing to say about X.
star_modules = {resolve(spec, SRC) for spec in barrel_stars}

n_components = n_exported = n_private = 0
for p in component_src:
    body = code[p][0]
    comps = components_of(body)
    exported = exported_names(body)
    for name, decl_exported in sorted(comps.items()):
        n_components += 1
        if not (decl_exported or name in exported):
            n_private += 1
            # ── R3 · a file-private component must be used in its own file ──
            if len(re.findall(r'\b%s\b' % re.escape(name), body)) < 2:
                finding('R3', '%s declares `%s` and neither exports nor uses it — a component '
                              'nothing can import and nothing renders is dead weight, which is '
                              'exactly the growth this census exists to control' % (rel(p), name))
            continue
        n_exported += 1
        if not barrel_ok or norm(p) in star_modules:
            continue
        listed = barrel_by_module.get(norm(p), set())
        if name not in listed:
            finding('R1', '%s exports the component `%s`, which src/index.ts does not re-export — '
                          'the tier\'s inventory IS its public surface, and a component no '
                          'consumer can import is dead weight nobody can even find'
                    % (rel(p), name))

for spec, src_name, pub_name in barrel_entries:
    target = resolve(spec, SRC)
    if not os.path.isfile(target):
        finding('R2', 'src/index.ts re-exports `%s` from "%s", which does not resolve to a file — '
                      'the barrel names something that is not there' % (src_name, spec))
        continue
    body = code[target][0] if target in code else scan(read(target))[0]
    if src_name not in exported_names(body):
        finding('R2', 'src/index.ts re-exports `%s` from "%s", but %s exports no such name — a '
                      'phantom barrel entry is a public surface that does not exist'
                % (src_name, spec, rel(target)))

if component_src and n_components == 0:
    finding('R0', 'no components found in %d file(s) under %s/%s — the component recogniser has '
                  'stopped matching, so R1 and R3 census an empty set and report clean'
            % (len(component_src), rel(SHELL), rel(THREAD)))

# ── R4 · no consumer, no app alias, no framework ─────────────────────────────────────────────
for p in shipped_src:
    body = code[p][0]
    for m in IMPORT_FROM.finditer(body):
        spec = m.group(1)
        line = body[:m.start()].count('\n') + 1
        head = spec.split('/')[0]
        why = None
        if head in FRAMEWORKS:
            why = ('`%s` is a framework import. This shell is framework-agnostic BY DESIGN — the '
                   'port removed the last `next/*` import (routing became props) and it must not '
                   'come back, or the tier stops being consumable outside Next.' % spec)
        elif any(c in spec for c in CONSUMERS):
            why = ('`%s` names a CONSUMER. The platform tier may not depend on the app that '
                   'happens to be consuming it — that is the direction the whole extraction '
                   'reverses.' % spec)
        elif spec.startswith(APP_ALIASES):
            why = ('`%s` is an app-alias import. `@/` and `~/` resolve through the CONSUMER\'s '
                   'tsconfig paths, so this file compiles only inside whichever app defines them.'
                   % spec)
        elif spec.startswith('../..'):
            why = ('`%s` escapes above src/ — a platform file reaching out of its own tier is '
                   'reaching into whatever happens to be next to it.' % spec)
        if why:
            finding('R4', '%s:%d %s' % (rel(p), line, why))

# ── R5 · no raw colour outside src/theme ─────────────────────────────────────────────────────
COLOUR = re.compile(r'#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(')
for p in shipped_src:
    body = code[p][0]
    for m in COLOUR.finditer(body):
        line = body[:m.start()].count('\n') + 1
        finding('R5', '%s:%d raw colour `%s` — the token contract is the whole point: a literal '
                      'here is a value no theme can move, so it is right in one look and wrong in '
                      'the other. Use a bridged utility (bg-surface, text-ink) or var(--token).'
                % (rel(p), line, m.group(0)))

# ── R6 · every variant used is a variant declared ────────────────────────────────────────────
declared = set()
for p in css:
    for m in re.finditer(r'@custom-variant\s+([A-Za-z][\w-]*)', strip_css(read(p))):
        declared.add(m.group(1))

# Tailwind's own variants. Exact names, plus the composable FAMILIES (a family prefix is how
# `group-hover`, `max-md`, `data-open`, `has-[…]` and `aria-*` are all spelled), so this list
# stays a statement about Tailwind rather than a list that grows with the app.
BUILTIN = {
    'hover', 'focus', 'focus-within', 'focus-visible', 'active', 'visited', 'target', 'first',
    'last', 'only', 'odd', 'even', 'first-of-type', 'last-of-type', 'only-of-type', 'empty',
    'disabled', 'enabled', 'checked', 'indeterminate', 'default', 'required', 'valid', 'invalid',
    'in-range', 'out-of-range', 'placeholder-shown', 'autofill', 'read-only', 'before', 'after',
    'placeholder', 'file', 'marker', 'selection', 'first-line', 'first-letter', 'backdrop',
    'open', 'inert', 'starting', 'details-content', 'user-valid', 'user-invalid',
    'sm', 'md', 'lg', 'xl', '2xl', 'dark', 'print', 'portrait', 'landscape', 'motion-safe',
    'motion-reduce', 'contrast-more', 'contrast-less', 'forced-colors', 'inverted-colors',
    'pointer-fine', 'pointer-coarse', 'any-pointer-fine', 'any-pointer-coarse', 'noscript',
    'rtl', 'ltr', '*', '**',
}
FAMILIES = ('group-', 'peer-', 'has-', 'not-', 'in-', 'aria-', 'data-', 'supports-', 'min-',
            'max-', 'nth-', '@')

TOKEN_CHARS = set('abcdefghijklmnopqrstuvwxyz0123456789-_:./%[]()#,!*&<>~+')


def split_top(tok):
    """Split a class token on `:` outside brackets — `supports-[display:grid]:flex` is 2 parts."""
    parts, buf, depth = [], [], 0
    for ch in tok:
        if ch in '[(':
            depth += 1
        elif ch in '])':
            depth -= 1
        if ch == ':' and depth == 0:
            parts.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append(''.join(buf))
    return parts


n_tokens = 0
used = {}
for p in shipped_src:
    for lit in code[p][1]:
        for tok in lit.split():
            if not tok or tok[0] not in 'abcdefghijklmnopqrstuvwxyz!-':
                continue
            if any(ch not in TOKEN_CHARS for ch in tok):
                continue
            n_tokens += 1
            parts = split_top(tok)
            if len(parts) < 2 or not parts[-1]:
                continue  # `foo:` with no utility is prose, not a class
            for v in parts[:-1]:
                base = v.lstrip('!')
                if base in BUILTIN or base.startswith(FAMILIES):
                    continue
                used.setdefault(base, (p, tok))

for v, (p, tok) in sorted(used.items()):
    if v not in declared:
        finding('R6', '%s uses the variant `%s:` (in `%s`), which no `@custom-variant` in %s '
                      'declares. An undeclared variant compiles to NOTHING — no error, no '
                      'warning, the utility simply never emits — so the behaviour it guards is '
                      'silently absent while every test stays green.'
                % (rel(p), v, tok, rel(THEME)))

if shipped_src and n_tokens == 0:
    finding('R0', 'not one class token was extracted from %d source file(s) — R5 and R6 read the '
                  'same literals, so a class scanner that has stopped seeing anything makes both '
                  'rules silently vacuous' % len(shipped_src))

# ── R7 · no consumer namespace prefix minted in a shared tier ────────────────────────────────
LEAK = re.compile(r'\b(%s)[a-z]' % '|'.join(re.escape(x) for x in LEAKED_PREFIXES))
for p in all_src:
    body = code[p][0]
    for m in LEAK.finditer(body):
        line = body[:m.start()].count('\n') + 1
        finding('R7', '%s:%d mints `%s…`, a CONSUMER\'s namespace prefix, in the shared tier. '
                      'Storage keys, DOM ids and classes here are inherited by every consumer at '
                      'once: the theme runtime wrote `dc-theme` until the namespace became a '
                      'required argument, and grid.css styled `.dc-gridguide`. Take a namespace '
                      'from the consumer or use this tier\'s own `an-` prefix.'
                % (rel(p), line, m.group(0)[:-1]))
for p in css:
    body = strip_css(read(p))
    for m in LEAK.finditer(body):
        line = body[:m.start()].count('\n') + 1
        finding('R7', '%s:%d mints `%s…`, a CONSUMER\'s namespace prefix, in a stylesheet every '
                      'consumer imports — the second app to import it would be styling itself '
                      'through the first app\'s namespace. This tier\'s prefix is `an-`.'
                % (rel(p), line, m.group(0)[:-1]))

# ── R8 · every shipped source file is inside a declared @source root ─────────────────────────
# The OTHER half of R6's precondition. A class reaches the browser only if its variant is DECLARED
# (R6) *and* its file is SCANNED — and Tailwind's automatic source detection roots at the CONSUMER's
# project, which this repo sits outside. R6 was written against "compiles to nothing, silently" and
# checked one of the two conditions; the missed one shipped datacore a console with 45 of the
# shell's 125 classes absent while tsc, vitest, `next build` and 42 gates were green.
#
# SCOPE, named rather than implied: this rule reads TEXT — it resolves each `@source` pattern's
# non-glob prefix and asks whether every shipped file lies under one. It cannot tell you the CSS
# actually came out right, because this tier compiles no CSS of its own; nothing here can. The real
# oracle lives in the consumer (datacore's fe-build-audit `[css]` rule runs the Tailwind compiler
# twice and diffs the selector sets). This is deliberately the weaker half of that pair, and it is
# here because THIS is the file the line must not vanish from.
#
# `@source not` is out of scope for the same reason: a negation's effect is a question about
# matching, not about prefixes, and getting it wrong here would trade a real check for a plausible
# one. An over-broad negation reddens the consumer's execution rule on the next run.
source_roots = []
for p in css:
    for m in re.finditer(r'@source\s+(?!not\b)(?:inline\()?["\']([^"\']+)["\']', strip_css(read(p))):
        pat = m.group(1)
        cut = min([i for i in (pat.find('*'), pat.find('{'), pat.find('?')) if i >= 0] or [len(pat)])
        base = pat[:cut].rsplit('/', 1)[0] if cut < len(pat) else pat
        source_roots.append(os.path.normpath(os.path.join(os.path.dirname(p), base or '.')))

uncovered = [p for p in shipped_src
             if not any(p == r or p.startswith(r + os.sep) for r in source_roots)]
if uncovered:
    finding('R8', '%d shipped file(s) — e.g. %s — lie outside every `@source` root declared in %s '
                  '(%s). Tailwind scans from the CONSUMER\'s project root, which this tier is not '
                  'inside, so a class used only by an unscanned file emits NO utility: no error, no '
                  'warning, and every typecheck and unit test still passes. The declaration belongs '
                  'in the bridge, where the variants it pairs with already live.'
            % (len(uncovered), rel(uncovered[0]), rel(THEME),
               ', '.join(rel(r) for r in source_roots) or 'none declared'))

# ── R9 · Tailwind's step is DERIVED from the grid token, never a literal ─────────────────────
# Em's ruling after the 0.30rem episode: a hardcoded --spacing is a second home for the minor
# grid — it drifted 20% off once and every integer utility silently left the rhythm. The bridge
# must READ grid.css's --bl-h, so retuning the rhythm is a grid change reviewed as one.
bridge_path = os.path.join(THEME, 'bridge.css')
if os.path.isfile(bridge_path):
    bridge_css = strip_css(read(bridge_path))
    spacing_decls = re.findall(r'--spacing\s*:\s*([^;]+);', bridge_css)
    if not spacing_decls:
        finding('R9', 'src/theme/bridge.css declares no --spacing — Tailwind falls back to its own '
                      'default, which happens to equal --bl-h TODAY and silently decouples from it '
                      'the day the grid retunes')
    else:
        for v in spacing_decls:
            if v.strip() != 'var(--bl-h)':
                finding('R9', 'src/theme/bridge.css sets --spacing to `%s` — a literal is a second '
                              'home for the minor grid (the 0.30rem episode: every integer utility '
                              'drifted 20%%, no gate saw it). It must be var(--bl-h).' % v.strip())

# ── R10/R11/R12 · the scale laws read the class tokens (docs/DESIGN.md) ──────────────────────
# Absolute arbitrary font sizes (em stays legal: it is contextual, not a minted level), arbitrary
# radii (the per-theme --radius-* scale is the only radius vocabulary), and millisecond literals
# in motion utilities (the motion vocabulary is --fast/--med/--entrance). Each is the same defect:
# a value minted at the call site instead of drawn from the one scale the theme owns.
SCALE_RULES = [
    ('R10', re.compile(r'^text-\[[0-9][^\]]*(?:px|rem)\]$'),
     'mints the font size `%s` — the type scale is 4–5 ROLES (type.css), not per-call sizes; '
     'em-relative is the one legal escape because it scales with its context'),
    ('R11', re.compile(r'^rounded(?:-[a-z]+)?-\[[^\]]+\]$'),
     'mints the radius `%s` — the radius vocabulary is the per-theme token scale '
     '(--radius-sm/md/lg/xl, 4/8/12/16 in datacore); an arbitrary radius is a value no theme '
     'can retune'),
    ('R12', re.compile(r'^(?:duration|delay)-\[[0-9][^\]]*\]$'),
     'mints the duration `%s` — motion rides the three tokens (--fast/--med/--entrance, '
     'contract.css); a millisecond literal is timing no theme or a11y setting can govern'),
]
for p2 in shipped_src:
    for lit in code[p2][1]:
        for tok in lit.split():
            for tag, rx, msg in SCALE_RULES:
                if rx.match(tok):
                    finding(tag, ('%s ' + msg) % (rel(p2), tok))

if not fails:
    print('component-census: clean (%d components — %d exported and in the barrel, %d '
          'file-private; %d source file(s), %d css file(s), %d custom variant(s) declared, '
          '%d class token(s) read, %d @source root(s))'
          % (n_components, n_exported, n_private, len(shipped_src), len(css),
             len(declared), n_tokens, len(source_roots)))
sys.exit(1 if fails else 0)
PY
}

# ── inline self-test: prove each rule can still go red, asserted PER RULE by its own tag ─────
# Per-rule and not whole-output, because a rule that has silently stopped scanning reports CLEAN,
# not red — so a "did the gate go red" assertion passes on any OTHER rule's noise and certifies
# the dead one. Every plant asserts its own tag with an EXACT count AND asserts every other tag
# stays at zero, which is what makes a cross-firing rule visible.
d="$(mktemp -d)"
trap 'rm -rf "$d"' EXIT

st_out=''
run() { st_out="$(check "$d" 2>&1 || true)"; }
expect() { # $1 = the finding TAG ITSELF, $2 = expected count, $3 = what was planted
  n="$(printf '%s\n' "$st_out" | grep -cF "$1")"
  [ "$n" -eq "$2" ] && return 0
  echo "component-census: SELF-TEST FAILED — $1 must fire exactly $2 time(s) on $3, got $n"
  printf '%s\n' "$st_out"; exit 1
}
only() { # $1 = the tag that may fire, $2 = its count, $3 = what was planted
  expect "$1" "$2" "$3"
  for t in '[R0]' '[R1]' '[R2]' '[R3]' '[R4]' '[R5]' '[R6]' '[R7]' '[R8]' '[R9]' '[R10]' '[R11]' '[R12]'; do
    [ "$t" = "$1" ] || expect "$t" 0 "$3 — $t must stay silent"
  done
}

clean() {
  rm -rf "$d"; mkdir -p "$d/src/shell" "$d/src/lib" "$d/src/thread" "$d/src/theme"
  cat >"$d/src/index.ts" <<'TS'
export { Alpha } from "./shell/Alpha";
export { Beta, BETA_ICON } from "./shell/Beta";
export { Gamma } from "./thread/Gamma";
export type { Spec } from "./lib/store";
TS
  cat >"$d/src/thread/Gamma.tsx" <<'TSX'
export function Gamma() {
  return <table className="w-full text-body-sm max-h-96" />;
}
TSX
  cat >"$d/src/shell/Alpha.tsx" <<'TSX'
import { useState } from "react";
export function Alpha() {
  const [n] = useState(0);
  return <div className="bg-bg text-ink short:py-1 max-md:px-4 group-hover:opacity-100"><Inner n={n} /></div>;
}
function Inner({ n }: { n: number }) {
  return <span className="text-mute hover:text-ink">{n}</span>;
}
TSX
  cat >"$d/src/shell/Beta.tsx" <<'TSX'
export const BETA_ICON = "widgets";
export function Beta() {
  return <div className="border-rule bg-surface-2 shadow-[var(--shadow)]" />;
}
TSX
  cat >"$d/src/lib/store.ts" <<'TS'
export interface Spec { run: (v: string) => void }
TS
  cat >"$d/src/theme/bridge.css" <<'CSS'
@source "../**/*.{ts,tsx}";
@source not "../**/__tests__/**";
@custom-variant short { @media (max-height: 40rem) { @slot; } }
@theme inline { --color-bg: var(--bg); --spacing: var(--bl-h); }
CSS
}

clean
out="$(check "$d" 2>&1)" || { echo "SELF-TEST FAIL: the clean fixture went red"; echo "$out"; exit 1; }

# comments are free — every prohibition below, spelled out in prose, must leave the gate green
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
// never `import { x } from "next/navigation"` here, never a #ff0000, never a dc-objrail key,
// and `tall:py-1` would compile to nothing. /* a block comment saying the same */
TSX
check "$d" >/dev/null 2>&1 || { echo "SELF-TEST FAIL: comments naming the rules tripped them"; exit 1; }
clean

# ── R0 · the vacuity guard itself ────────────────────────────────────────────────────────────
rm -rf "$d"; mkdir -p "$d"
run
expect '[R0]' 3 'a completely empty tree — the barrel, the sources and the theme tier guards'
expect '[R1]' 0 'an empty tree — R1 must not report on a tree it could not read'
expect '[R6]' 0 'an empty tree — R6 must not report on a tree it could not read'

clean
rm "$d/src/index.ts"
run
expect '[R0]' 1 'the barrel deleted — exactly the "cannot compare" guard'
expect '[R1]' 0 'the barrel deleted — R1 is unknowable and must not guess'
expect '[R2]' 0 'the barrel deleted — R2 has nothing to walk'

# ── the thread root is CENSUSED, not tolerated ───────────────────────────────────────────────
# One plant per rule family inside src/thread. Without these, widening the scope is a claim the
# self-test never checks — precisely how a walked-root list rots (the sibling suite's most common
# defect, imported here with the renderers).
clean
cat >"$d/src/thread/Delta.tsx" <<'TSX'
export function Delta() { return <div className="p-4" />; }
TSX
run
expect '[R1]' 1 'a thread component the barrel does not re-export — the census walks src/thread'

clean
cat >>"$d/src/thread/Gamma.tsx" <<'TSX'
import { plane } from "@/lib/plane";
TSX
run
expect '[R4]' 1 'an app-alias import inside src/thread — the leak rules walk it too'

# ── R1 · a component the barrel does not re-export ───────────────────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export function Gamma() {
  return <div className="bg-surface" />;
}
TSX
run
only '[R1]' 1 'one exported component missing from the barrel'

# ── R2 · a barrel entry with nothing behind it ───────────────────────────────────────────────
clean
cat >>"$d/src/index.ts" <<'TS'
export { Delta } from "./shell/Beta";
TS
run
only '[R2]' 1 'a phantom barrel entry'

clean
cat >>"$d/src/index.ts" <<'TS'
export { Epsilon } from "./shell/Nowhere";
TS
run
only '[R2]' 1 'a barrel entry pointing at a module that does not exist'

# ── R3 · a file-private component nothing renders ────────────────────────────────────────────
clean
cat >>"$d/src/shell/Alpha.tsx" <<'TSX'
function Orphan() {
  return <i className="text-dim" />;
}
TSX
run
only '[R3]' 1 'a private component that is never used in its own file'

# ── R4 · the consumer / framework / alias imports ────────────────────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
import { usePathname } from "next/navigation";
TSX
run
only '[R4]' 1 'a next/* import in the shell'

clean
cat >>"$d/src/lib/store.ts" <<'TS'
import { complete } from "@/lib/datacore/completer";
TS
run
expect '[R4]' 1 'an app-alias import naming a consumer (ONE finding, not two — the rule reports a specifier once)'
expect '[R7]' 0 'an app-alias import — R7 is about minted prefixes, not imports'
expect '[R5]' 0 'an app-alias import — R5 must stay silent'

clean
cat >>"$d/src/lib/store.ts" <<'TS'
import { thing } from "../../web/src/thing";
TS
run
only '[R4]' 1 'an import escaping above src/'

# ── R5 · raw colour outside the theme tier ───────────────────────────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const HOT = "text-[#ff0000]";
TSX
run
only '[R5]' 1 'a hex literal in a component'

clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const WASH = "rgba(0, 0, 0, 0.5)";
TSX
run
only '[R5]' 1 'an rgba() literal in a component'

# theme/ is where colour LIVES — the same literal there must not fire
clean
cat >>"$d/src/theme/bridge.css" <<'CSS'
html[data-theme="x"] { --bg: #ff0000; --hover: rgba(0,0,0,.06); }
CSS
run
expect '[R5]' 0 'hex in src/theme — that is the one place colour is allowed to be literal'

# ── R6 · an undeclared variant ───────────────────────────────────────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const TALL = "tall:py-1";
TSX
run
only '[R6]' 1 'a variant no @custom-variant declares'

# and the load-bearing direction: deleting the DECLARATION must ring for the existing usage.
# The @source line stays: this plant is about the variant half of the precondition, and leaving
# both out would let R8's finding stand in for R6's — which is the cross-firing `only` exists to
# catch.
clean
cat >"$d/src/theme/bridge.css" <<'CSS'
@source "../**/*.{ts,tsx}";
@theme inline { --color-bg: var(--bg); --spacing: var(--bl-h); }
CSS
run
only '[R6]' 1 'the `short` declaration removed while a component still uses `short:py-1`'

# ── R7 · a consumer namespace prefix minted in the shared tier ───────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const RAIL_ID = "dc-object-rail";
TSX
run
only '[R7]' 1 'a `dc-` id minted in a component'

clean
cat >>"$d/src/theme/bridge.css" <<'CSS'
.dc-gridguide { position: absolute; }
CSS
run
only '[R7]' 1 'a `dc-` class minted in the theme tier'

clean
cat >>"$d/src/theme/theme.ts" <<'TS'
export const THEME_KEY = "dc-theme";
TS
run
only '[R7]' 1 'a `dc-` storage key in the theme runtime — the live instance this rule was written for'

# ── R8 · the scan scope removed, and the scan scope made too narrow ──────────────────────────
# The first plant is the live regression: the declaration simply absent, which is the state this
# tier shipped in and every downstream check called green.
clean
grep -v '^@source' "$d/src/theme/bridge.css" >"$d/src/theme/bridge.tmp"
mv "$d/src/theme/bridge.tmp" "$d/src/theme/bridge.css"
run
only '[R8]' 1 'the @source declaration deleted — no file in the tier is scanned by any consumer'

# The second is the subtler one and the reason this is a coverage test and not an existence test:
# a declaration that is PRESENT and covers only half the tier reads as done at a glance.
clean
cat >"$d/src/theme/bridge.css" <<'CSS'
@source "../shell/**/*.tsx";
@custom-variant short { @media (max-height: 40rem) { @slot; } }
@theme inline { --color-bg: var(--bg); --spacing: var(--bl-h); }
CSS
run
only '[R8]' 1 'an @source covering src/shell only — src/lib is shipped platform code too'

# ── R9 · the spacing literal, and the spacing deletion ───────────────────────────────────────
clean
sed -i 's/--spacing: var(--bl-h);/--spacing: 0.30rem;/' "$d/src/theme/bridge.css"
run
only '[R9]' 1 'a literal --spacing — the 0.30rem episode replayed'

clean
sed -i 's/ --spacing: var(--bl-h);//' "$d/src/theme/bridge.css"
run
only '[R9]' 1 'no --spacing at all — silently decoupled from the grid token'

# ── R10/R11/R12 · a minted size, radius, duration ────────────────────────────────────────────
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const T = "text-[13px]";
TSX
run
only '[R10]' 1 'an absolute arbitrary font size'

clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const R = "rounded-[3px]";
TSX
run
only '[R11]' 1 'an arbitrary radius'

clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const D = "duration-[200ms]";
TSX
run
only '[R12]' 1 'a millisecond literal in a motion utility'

# and the legal escapes must stay silent: em type, token-var duration
clean
cat >>"$d/src/shell/Beta.tsx" <<'TSX'
export const OK = "text-[0.9em] duration-[var(--fast)] rounded-sm";
TSX
run
only '[R0]' 0 'the legal escapes — em sizes and var() durations are not findings'

check "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
