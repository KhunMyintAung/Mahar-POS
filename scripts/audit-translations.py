# -*- coding: utf-8 -*-
"""Find user-facing English strings that have no Myanmar translation.

    python scripts/audit-translations.py .

The app translates by walking the DOM and matching text exactly against the dictionary in
LanguageProvider, so any string missing from it simply stays English on a Myanmar screen.
Nothing in the type system or the tests can see that, which is how a whole module shipped
half-translated: this reads the sources and reports what is missing.

Some of what it reports is meant to stay English, and should be left alone:
  - brand and product names (Wallet Note, Mytel, Samsung),
  - example placeholders standing in for what a shop types (\"A54\", a BotFather token) --
    translating an example makes it read as an instruction,
  - the About page, whose content is deliberately hardcoded.
"""
import io
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
PROVIDER = os.path.join(ROOT, "src", "components", "LanguageProvider.tsx")

src = io.open(PROVIDER, encoding="utf-8").read()
block = src[src.index("const MM"): src.index("const originalText")]
known = set(re.findall(r'"((?:[^"\\]|\\.)*)"\s*:', block))
# Patterns handled dynamically by translate().
DYNAMIC = [
    re.compile(p) for p in [
        r"^Edit .+$", r"^Adjust .+$", r"^Reconcile .+$", r"^Cancel .+$", r"^Pay .+$",
        r"^Odds \(default .+\)$", r"^Records \(\d+\)$", r"^Amount \(.+\)$",
        r"^Customer \(owes .+\)$",
    ]
]

ATTR = re.compile(r'\b(?:label|placeholder|title|message|aria-label)="([^"{}]{2,120})"')
# JSX text between tags, e.g. >Save changes<
TEXT = re.compile(r">\s*([A-Z][^<>{}\n]{2,110}?)\s*<")
HEADERS = re.compile(r"headers=\{\[([^\]]{2,400})\]\}")

ENTITIES = [("&amp;", "&"), ("&apos;", "'"), ("&quot;", '"'), ("&lt;", "<"), ("&gt;", ">")]


def unescape(s):
    """JSX writes & and ' as entities; the browser hands the DOM the decoded text, which
    is what the dictionary is keyed on. Comparing the raw source reports false misses."""
    for entity, char in ENTITIES:
        s = s.replace(entity, char)
    return s


def interesting(s):
    s = s.strip()
    if not s or len(s) < 3:
        return False
    if not re.search(r"[A-Za-z]", s):
        return False
    # Skip code-ish and already-Burmese strings.
    if re.search(r"[က-႟]", s):
        return False
    if re.match(r"^[a-z][a-zA-Z0-9_.]*$", s):      # identifiers
        return False
    if re.match(r"^[A-Z_]+$", s) and len(s) < 20:  # enum constants
        return False
    if s.startswith(("http", "/", "@", "#")):
        return False
    if "className" in s or "px-" in s or "text-" in s:
        return False
    return True

missing = {}
for base, _dirs, files in os.walk(os.path.join(ROOT, "src")):
    if "node_modules" in base:
        continue
    for name in files:
        if not name.endswith(".tsx"):
            continue
        path = os.path.join(base, name)
        if path.replace("\\", "/").endswith("components/LanguageProvider.tsx"):
            continue
        text = io.open(path, encoding="utf-8").read()

        found = set()
        found.update(ATTR.findall(text))
        found.update(TEXT.findall(text))
        for group in HEADERS.findall(text):
            found.update(re.findall(r'"([^"]{2,60})"', group))

        for s in found:
            s = unescape(s.strip())
            if not interesting(s):
                continue
            if s in known:
                continue
            if any(p.match(s) for p in DYNAMIC):
                continue
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            missing.setdefault(s, set()).add(rel)

print("dictionary entries: %d" % len(known))
print("untranslated strings: %d\n" % len(missing))
for s in sorted(missing, key=lambda x: (-len(missing[x]), x.lower())):
    files = sorted(missing[s])
    where = files[0] if len(files) == 1 else "%s (+%d more)" % (files[0], len(files) - 1)
    print('%-72s %s' % ('"%s"' % s[:70], where))
