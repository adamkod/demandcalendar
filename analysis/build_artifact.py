"""Produce the body-only build used for hosting the app at a URL.

The host wraps whatever it is given in its own <!doctype html><head></head><body>,
so a full document would nest one inside another. This strips the outer shell and
keeps everything else in source order — script order is load-bearing, since the
vendor bundles have to run before the app.

Run build_standalone.py first; this reads its output so the two never drift.

Usage:
    python analysis/build_artifact.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
SRC = os.path.join(SITE, "demand-calendar-standalone.html")
OUT = os.path.join(SITE, "demand-calendar-hosted.html")


def main():
    if not os.path.exists(SRC):
        sys.exit("error: run analysis/build_standalone.py first")
    html = open(SRC, encoding="utf-8").read()

    head = re.search(r"<head>(.*?)</head>", html, re.S)
    body = re.search(r"<body>(.*?)</body>", html, re.S)
    if not head or not body:
        sys.exit("error: could not find <head>/<body> in the standalone build")

    # Drop only what the host supplies itself; <style> and <script> stay put.
    kept = re.sub(r"<meta[^>]*>|<title>.*?</title>", "", head.group(1), flags=re.S)
    out = (kept.strip() + "\n" + body.group(1).strip() + "\n")

    # Match whole tags only. A bare substring test flags <header> as <head>, and
    # the inlined bundles are full of strings that look like markup.
    stray = re.search(r"(?i)<!doctype\b|</?(?:html|head|body)\s*[>\s]", out)
    if stray:
        sys.exit(f"error: {stray.group(0)!r} survived stripping — "
                 "the host would nest one document inside another")
    if re.search(r"<script[^>]*\ssrc=", out):
        sys.exit("error: an external script survived; the host blocks outside requests")

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"wrote {OUT}  ({len(out) // 1024} KB, body-only)")


if __name__ == "__main__":
    main()
