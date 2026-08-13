"""Build site/data.js for the Demand Calendar dashboard.

Two data sources, in priority order:

1. Real Google Trends exports in data/, named by convention:
       <category>--monthly.csv    (10+ years  -> monthly rows)
       <category>--weekly.csv     (past 5 yrs -> weekly rows)
   where <category> is one of: births, divorces, marriages, vasectomies.

2. Synthetic sample data for any category/granularity with no file present,
   so the site always loads. Synthetic series are labeled "SAMPLE (synthetic)"
   and the dashboard shows a sample-data banner until real files replace them.

Usage:
    python analysis/build_site_data.py            # data/ files + sample fill-in
    python analysis/build_site_data.py --sample   # force all-synthetic
"""

import csv
import json
import math
import os
import random
import statistics
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from seasonality import parse_trends_csv  # noqa: E402  (same parser as the CLI)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
OUT_PATH = os.path.join(ROOT, "site", "data.js")

# Category definitions: terms (literal + proxies) and the folklore peaks the
# class assumes exist. Months are 1-12.
CATEGORIES = [
    {"id": "births", "label": "Births",
     "terms": ["birth", "births", "pregnancy test", "baby names"],
     "assumed": [{"name": "September baby boom", "month": 9}]},
    {"id": "divorces", "label": "Divorces",
     "terms": ["divorce", "divorce lawyer"],
     "assumed": [{"name": "“Divorce Month” January", "month": 1}]},
    {"id": "marriages", "label": "Marriages",
     "terms": ["wedding", "marriage", "wedding venues", "engagement rings"],
     "assumed": [{"name": "June wedding season", "month": 6}]},
    {"id": "vasectomies", "label": "Vasectomies",
     "terms": ["vasectomy", "vasectomy cost"],
     "assumed": [{"name": "March Madness vasectomies", "month": 3}]},
]

# ---------------------------------------------------------------------------
# Synthetic sample shapes — plausible but fake; every synthetic series is
# labeled SAMPLE. bumps = (center day-of-year, width days, amplitude).
# spikes = one-off events (start date, weeks, amplitude): NOT seasonality.
# ---------------------------------------------------------------------------
SHAPES = {
    "births":           {"base": 46, "bumps": [], "noise": 3.0},
    "pregnancy test":   {"base": 50, "bumps": [(185, 55, 4)], "noise": 2.5},
    "baby names":       {"base": 44, "bumps": [(15, 40, 6)], "noise": 3.0},
    "divorce":          {"base": 48, "bumps": [(12, 30, 7)], "noise": 3.0},
    "divorce lawyer":   {"base": 42, "bumps": [(10, 28, 15), (240, 35, 6)],
                         "noise": 2.5},
    "marriage":         {"base": 50, "bumps": [(45, 90, 3)], "noise": 3.0},
    "wedding venues":   {"base": 40, "bumps": [(20, 45, 16), (160, 80, 4)],
                         "noise": 2.5},
    "engagement rings": {"base": 42, "bumps": [(348, 30, 13)], "noise": 2.5},
    "vasectomy":        {"base": 44, "bumps": [(75, 25, 11), (350, 25, 8)],
                         "noise": 2.5,
                         "spikes": [(date(2022, 6, 26), 5, 38)]},
    "vasectomy cost":   {"base": 40, "bumps": [(78, 28, 8), (350, 28, 6)],
                         "noise": 3.0,
                         "spikes": [(date(2022, 6, 26), 5, 26)]},
}


def _circ_gauss(doy, center, width):
    d = min(abs(doy - center), 365.25 - abs(doy - center))
    return math.exp(-(d * d) / (2 * width * width))


def _value(term, d, rng):
    s = SHAPES[term]
    doy = d.timetuple().tm_yday
    v = s["base"]
    for center, width, amp in s["bumps"]:
        v += amp * _circ_gauss(doy, center, width)
    for start, weeks, amp in s.get("spikes", []):
        if start <= d < start + timedelta(weeks=weeks):
            ramp = 1 - abs((d - start).days / (weeks * 7) - 0.35)
            v += amp * max(ramp, 0.2)
    return v + rng.uniform(-s["noise"], s["noise"])


def _normalize(values):
    peak = max(values)
    return [max(1, round(v / peak * 100)) for v in values]


def synth_series(term, granularity):
    rng = random.Random(f"440-{term}-{granularity}")
    if granularity == "monthly":
        dates = []
        y, m = 2016, 8
        while (y, m) <= (2026, 7):
            dates.append(date(y, m, 15))
            m += 1
            if m == 13:
                y, m = y + 1, 1
    else:
        start = date(2021, 8, 15)
        dates = [start + timedelta(weeks=i) for i in range(261)]
    vals = _normalize([_value(term, d, rng) for d in dates])
    return {"source": "SAMPLE (synthetic)",
            "dates": [d.isoformat() for d in dates], "values": vals}


def detect_granularity(path):
    """monthly / weekly from the export's header keyword, or None if not a series.

    The newer Trends download heads its date column "Time" and leaves the
    granularity implicit, so fall back to measuring the gap between the first two
    rows. Files with neither header — related-query lists, for instance — return
    None and are skipped by the caller.
    """
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = csv.reader(f)
        for row in rows:
            if not row:
                continue
            key = row[0].strip()
            if key in ("Month", "Week", "Day"):
                return "monthly" if key == "Month" else "weekly"
            if key == "Time":
                stamps = []
                for r in rows:
                    if r and r[0].strip():
                        stamps.append(r[0].strip())
                    if len(stamps) == 2:
                        break
                if len(stamps) < 2:
                    return None
                try:
                    a, b = (date(*[int(p) for p in s.split("-")]) for s in stamps)
                except ValueError:
                    return None
                return "weekly" if (b - a).days <= 10 else "monthly"
    return None


# term (lowercased) -> category id, built from the CATEGORIES table above
TERM_TO_CAT = {t.lower(): c["id"] for c in CATEGORIES for t in c["terms"]}


def scan_data_dir():
    """Route every term in every CSV in data/ to its category.

    Two naming conventions are supported. A file named `<category>--monthly.csv`
    or `<category>--weekly.csv` belongs wholly to that category. Any other CSV is
    matched term-by-term against TERM_TO_CAT, which is how a single multi-term
    comparison export — the normal way to download from Trends — feeds several
    categories at once. Terms we don't recognize are skipped, so unrelated files
    sitting in data/ are ignored rather than guessed at.

    Explicit per-category files win, so a targeted re-export can override a term
    that also appears in a combined file.
    """
    found = {c["id"]: {"monthly": {}, "weekly": {}} for c in CATEGORIES}
    paths = sorted(f for f in os.listdir(DATA_DIR) if f.lower().endswith(".csv"))
    # generic files first; explicit `<category>--<granularity>.csv` last so they win
    explicit = {f"{c['id']}--{g}.csv" for c in CATEGORIES for g in ("monthly", "weekly")}

    def quality(vals):
        """Rank a candidate series for the same term: readable resolution first,
        then length. Resolution has to come first — a term squashed by a bigger
        comparison term is unusable at any length. Length breaks the tie, so a
        redundant short solo export cannot silently throw away years of history."""
        m = statistics.mean(vals) if vals else 0
        step = 100 / m if m else float("inf")
        return (1 if step <= 8.0 else 0, len(vals))

    for name in sorted(paths, key=lambda n: n.lower() in explicit):
        path = os.path.join(DATA_DIR, name)
        gran = detect_granularity(path)
        if gran is None:
            continue
        is_explicit = name.lower() in explicit
        forced = name.lower().split("--")[0] if is_explicit else None
        dates, series = parse_trends_csv(path)
        iso = [d.isoformat() for d in dates]
        for term, vals in series.items():
            cat_id = forced or TERM_TO_CAT.get(term.lower())
            if cat_id is None:
                continue
            prev = found[cat_id][gran].get(term)
            # An explicitly named per-category file always wins; otherwise the
            # better series does.
            if prev and not is_explicit and quality(vals) <= quality(prev["values"]):
                continue
            found[cat_id][gran][term] = {"source": name, "dates": iso, "values": vals}
    return found


def _pct(cell):
    """'850%' -> 850.0. Trends writes 'Breakout' for anything over ~5000%."""
    c = (cell or "").strip().replace("%", "").replace(",", "")
    if c.lower() == "breakout":
        return 5000.0
    try:
        return float(c)
    except ValueError:
        return 0.0


def scan_related_queries():
    """Related-query lists -> an editorial backlog, keyed by category.

    Files are named `related-queries-<term-slug>-top.csv` / `-rising.csv`, where
    the slug is the parent search term with spaces as hyphens. These lists carry
    no dates, so they can rank and bucket topics but must never be used to date
    one — the parent term's timing supplies the deadline.

    Buckets:
      write      in the rising list and still small — new demand, low competition
      double     already large and still growing — reinforce what works
      refresh    large but declining — the page exists and is losing ground
      retire     small and declining — stop spending effort here
    """
    found = {}
    for name in sorted(os.listdir(DATA_DIR)):
        low = name.lower()
        if not low.startswith("related-queries-") or not low.endswith(".csv"):
            continue
        kind = "rising" if low.endswith("-rising.csv") else \
               "top" if low.endswith("-top.csv") else None
        if kind is None:
            continue
        slug = low[len("related-queries-"):-len(f"-{kind}.csv")]
        term = slug.replace("-", " ")
        cat_id = TERM_TO_CAT.get(term)
        if cat_id is None:
            print(f"  note: {name} -> unknown term “{term}”, skipped")
            continue
        with open(os.path.join(DATA_DIR, name), newline="", encoding="utf-8-sig") as f:
            rows = [r for r in csv.reader(f) if len(r) >= 3]
        if rows and rows[0][0].strip().lower() == "query":
            rows = rows[1:]
        rec = found.setdefault(cat_id, {"term": term, "queries": {}})
        for q, interest, change in rows:
            q = q.strip()
            if not q:
                continue
            entry = rec["queries"].setdefault(
                q, {"query": q, "interest": 0, "change": 0.0, "lists": []})
            try:
                entry["interest"] = max(entry["interest"], int(float(interest)))
            except ValueError:
                pass
            entry["change"] = _pct(change)
            if kind not in entry["lists"]:
                entry["lists"].append(kind)

    out = {}
    for cat_id, rec in found.items():
        topics = []
        for e in rec["queries"].values():
            rising_only = "rising" in e["lists"] and "top" not in e["lists"]
            if e["change"] < 0:
                bucket = "refresh" if e["interest"] >= 20 else "retire"
            elif rising_only or e["interest"] < 20:
                bucket = "write"
            else:
                bucket = "double"
            topics.append({**e, "bucket": bucket})
        # Rank inside each bucket by what makes it actionable: growth for new
        # topics, size for everything that already exists.
        order = {"write": lambda t: (-t["change"], -t["interest"]),
                 "double": lambda t: (-t["interest"], -t["change"]),
                 "refresh": lambda t: (-t["interest"],),
                 "retire": lambda t: (-t["interest"],)}
        topics.sort(key=lambda t: (["write", "double", "refresh", "retire"]
                                   .index(t["bucket"]),) + order[t["bucket"]](t))
        out[cat_id] = {"term": rec["term"], "topics": topics}
    return out


def build(force_sample=False):
    out = {"version": 1, "generated": date.today().isoformat(), "categories": []}
    scanned = {} if force_sample else scan_data_dir()
    topics = {} if force_sample else scan_related_queries()
    for cat in CATEGORIES:
        real = scanned.get(cat["id"], {"monthly": {}, "weekly": {}})
        terms = []
        # Real files may contain terms beyond the defaults — keep whatever the
        # class actually downloaded, falling back to defaults + synthetic.
        real_names = list(dict.fromkeys(
            list((real.get("monthly") or {}).keys())
            + list((real.get("weekly") or {}).keys())))
        # Once a category has any real series, drop the synthetic stand-ins. Mixing
        # them is worse than having fewer terms: the dashboard defaults to whichever
        # term looks most seasonal, and an invented curve would win that contest.
        names = real_names if real_names else list(cat["terms"])
        for name in names:
            entry = {"name": name}
            for g in ("monthly", "weekly"):
                got = (real.get(g) or {}).get(name)
                if got is None and not real_names and name in SHAPES:
                    got = synth_series(name, g)
                if got:
                    entry[g] = got
            if "monthly" in entry or "weekly" in entry:
                terms.append(entry)
        out["categories"].append({
            "id": cat["id"], "label": cat["label"],
            "assumed": cat["assumed"], "terms": terms,
            "topics": topics.get(cat["id"])})
    return out


def main():
    data = build(force_sample="--sample" in sys.argv)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    payload = json.dumps(data, separators=(",", ":"))
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Generated by analysis/build_site_data.py — do not hand-edit.\n"
                f"window.DEMAND_DATA = {payload};\n")
    print(f"wrote {OUT_PATH}  ({len(payload) // 1024} KB)")
    for c in data["categories"]:
        bits = []
        for t in c["terms"]:
            srcs = {g: t[g]["source"] for g in ("monthly", "weekly") if g in t}
            tag = "".join("S" if s.startswith("SAMPLE") else "R" for s in srcs.values())
            bits.append(f"{t['name']}[{tag or '-'}]")
        print(f"  {c['label']:<12} {', '.join(bits)}")
    print("  R = real export, S = synthetic sample; first letter monthly, "
          "second weekly")
    print("\n  Reload site/index.html with Ctrl+Shift+R — browsers cache data.js "
          "and a\n  plain refresh will keep showing the previous build.")


if __name__ == "__main__":
    main()
