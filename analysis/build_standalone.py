"""Inline site/data.js into site/index.html to make one shareable file.

The result, site/demand-calendar-standalone.html, has no sibling dependencies —
email it, drop it in Drive, or open it from a USB stick and it works. Everything
in the dashboard (imports, assumptions, budget plans) still runs locally in the
viewer's browser.

Usage:
    python analysis/build_standalone.py
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
SRC = os.path.join(SITE, "index.html")
DATA = os.path.join(SITE, "data.js")
OUT = os.path.join(SITE, "demand-calendar-standalone.html")
TAG = '<script src="data.js"></script>'


def main():
    for p in (SRC, DATA):
        if not os.path.exists(p):
            sys.exit(f"error: missing {p}. Run analysis/build_site_data.py first.")

    html = open(SRC, encoding="utf-8").read()
    data = open(DATA, encoding="utf-8").read()

    if TAG not in html:
        sys.exit(f"error: could not find {TAG} in index.html — the script tag "
                 "may have been renamed.")
    # A literal </script> inside the data would close the tag early. The payload is
    # JSON from json.dumps so it cannot contain one today, but a search term with
    # markup in it would change that.
    data = data.replace("</script>", "<\\/script>")

    out = html.replace(TAG, f"<script>\n{data}\n</script>")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"wrote {OUT}  ({len(out) // 1024} KB, self-contained)")


if __name__ == "__main__":
    main()
