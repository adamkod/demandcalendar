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

import json
import math
import os
import random
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
     "terms": ["births", "pregnancy test", "baby names"],
     "assumed": [{"name": "September baby boom", "month": 9}]},
    {"id": "divorces", "label": "Divorces",
     "terms": ["divorce", "divorce lawyer"],
     "assumed": [{"name": "“Divorce Month” January", "month": 1}]},
    {"id": "marriages", "label": "Marriages",
     "terms": ["marriage", "wedding venues", "engagement rings"],
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


def load_real(cat_id, granularity):
    path = os.path.join(DATA_DIR, f"{cat_id}--{granularity}.csv")
    if not os.path.exists(path):
        return None
    dates, series = parse_trends_csv(path)
    return {t: {"source": os.path.basename(path),
                "dates": [d.isoformat() for d in dates],
                "values": vals}
            for t, vals in series.items()}


def build(force_sample=False):
    out = {"version": 1, "generated": date.today().isoformat(), "categories": []}
    for cat in CATEGORIES:
        real = {} if force_sample else {
            g: load_real(cat["id"], g) or {} for g in ("monthly", "weekly")}
        terms = []
        # Real files may contain terms beyond the defaults — keep whatever the
        # class actually downloaded, falling back to defaults + synthetic.
        names = list(dict.fromkeys(
            list((real.get("monthly") or {}).keys())
            + list((real.get("weekly") or {}).keys())
            + cat["terms"]))
        for name in names:
            entry = {"name": name}
            for g in ("monthly", "weekly"):
                got = (real.get(g) or {}).get(name)
                if got is None and name in SHAPES:
                    got = synth_series(name, g)
                if got:
                    entry[g] = got
            if "monthly" in entry or "weekly" in entry:
                terms.append(entry)
        out["categories"].append({
            "id": cat["id"], "label": cat["label"],
            "assumed": cat["assumed"], "terms": terms})
    return out


def main():
    data = build(force_sample="--sample" in sys.argv)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    payload = json.dumps(data, separators=(",", ":"))
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Generated by analysis/build_site_data.py — do not hand-edit.\n"
                f"window.DEMAND_DATA = {payload};\n")
    n_sample = sum(1 for c in data["categories"] for t in c["terms"]
                   for g in ("monthly", "weekly")
                   if t.get(g, {}).get("source", "").startswith("SAMPLE"))
    print(f"wrote {OUT_PATH}  ({len(payload) // 1024} KB, "
          f"{n_sample} synthetic series slots)")


if __name__ == "__main__":
    main()
