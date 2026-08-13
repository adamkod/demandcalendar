"""Inline every local script into one shareable HTML file.

Produces site/demand-calendar-standalone.html with no sibling dependencies —
email it, drop it in Drive, or open it from a USB stick and it works offline.
React, Tailwind, the icon set, the data and the app all end up in the one file.

Usage:
    python analysis/build_standalone.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
SRC = os.path.join(SITE, "index.html")
OUT = os.path.join(SITE, "demand-calendar-standalone.html")

TAG = re.compile(r'[ \t]*<script src="([^"]+)"></script>\r?\n?')


def main():
    if not os.path.exists(SRC):
        sys.exit(f"error: missing {SRC}")
    html = open(SRC, encoding="utf-8").read()

    missing, inlined = [], []

    def swap(match):
        rel = match.group(1)
        path = os.path.join(SITE, *rel.split("/"))
        if not os.path.exists(path):
            missing.append(rel)
            return match.group(0)
        code = open(path, encoding="utf-8").read()
        # A literal </script> inside the code would close the tag early. None of
        # our sources contain one today, but a future string literal could.
        code = code.replace("</script>", "<\\/script>")
        inlined.append((rel, len(code)))
        return f"<script>\n/* ---- {rel} ---- */\n{code}\n</script>\n"

    out = TAG.sub(swap, html)

    if missing:
        sys.exit("error: could not find " + ", ".join(missing)
                 + "\n       run analysis/build_site_data.py first")
    if not inlined:
        sys.exit('error: no <script src="..."> tags found in index.html — the '
                 "shell may have been restructured")
    if '<script src=' in out:
        sys.exit("error: a script tag survived inlining; the standalone would "
                 "not work offline")

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)

    for rel, n in inlined:
        print(f"  inlined {rel:<28} {n // 1024:>5} KB")
    print(f"wrote {OUT}  ({len(out) // 1024} KB, self-contained)")


if __name__ == "__main__":
    main()
