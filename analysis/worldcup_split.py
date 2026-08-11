"""Separate FIFA World Cup contamination from genuine annual seasonality.

The men's World Cup is quadrennial, not annual, so its spike is not seasonality —
but it is large enough to dominate an aggregate monthly index and invent a peak
that does not exist in ordinary years. This splits the series into World Cup
years and ordinary years and reports each separately.

Each year is normalised to its own mean first (index 100 = that year's average),
so a long-run secular trend in the raw series cannot bias the comparison.

Usage:
    python worldcup_split.py data/soccer-balls-worldwide-2004-2026-monthly.csv [term]
"""

import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seasonality import (MONTH_NAMES, MILD_BUMP_INDEX, OFF_SEASON_INDEX,
                         REAL_PEAK_INDEX, CONSISTENCY_REQUIRED,
                         parse_trends_csv)

# Men's FIFA World Cup years. 2022 (Qatar) was played Nov-Dec, not Jun-Jul —
# so the contamination is not even at a consistent point in the calendar.
WC_YEARS = {2006, 2010, 2014, 2018, 2022, 2026}
WC_PEAK_MONTH = defaultdict(lambda: 6, {2022: 12})


def label_for(index, consistency):
    if index >= REAL_PEAK_INDEX and consistency >= CONSISTENCY_REQUIRED:
        return "REAL PEAK"
    if index >= MILD_BUMP_INDEX and consistency >= CONSISTENCY_REQUIRED:
        return "MILD BUMP"
    if index >= MILD_BUMP_INDEX:
        return "INCONSISTENT"
    if index <= OFF_SEASON_INDEX:
        return "OFF-SEASON"
    return "NO PEAK"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("usage: python worldcup_split.py <trends-export.csv> [term]")

    dates, series = parse_trends_csv(args[0])
    term = args[1] if len(args) > 1 else next(iter(series))
    if term not in series:
        sys.exit(f"error: term {term!r} not in {list(series)}")

    by_year = defaultdict(dict)
    for d, v in zip(dates, series[term]):
        by_year[d.year][d.month] = v

    print(f"\nWorld Cup split — term: {term}")
    print("note: Google Trends is a relative index (0-100), not search volume.")

    print("\n" + "=" * 66)
    print("SECULAR TREND — annual mean of the raw index (complete years only)")
    print("=" * 66)
    for y in sorted(by_year):
        vals = list(by_year[y].values())
        if len(vals) < 12:
            continue
        print(f"  {y}  {statistics.mean(vals):5.1f}  "
              f"{'#' * int(statistics.mean(vals))}")

    norm = {y: {m: v / statistics.mean(ms.values()) * 100 for m, v in ms.items()}
            for y, ms in by_year.items() if len(ms) >= 12}
    wc = sorted(y for y in norm if y in WC_YEARS)
    non = sorted(y for y in norm if y not in WC_YEARS)
    if not wc or not non:
        sys.exit("error: need both World Cup and ordinary years in range")

    print("\n" + "=" * 66)
    print(f"WORLD CUP YEARS (n={len(wc)}) vs ORDINARY YEARS (n={len(non)})")
    print("=" * 66)
    print(f"{'Month':<6}{'WC yrs':>8}{'Non-WC':>9}{'Diff':>8}   consistency (non-WC)")
    for m in range(1, 13):
        a = statistics.mean(norm[y][m] for y in wc)
        b = statistics.mean(norm[y][m] for y in non)
        hits = sum(1 for y in non if norm[y][m] >= MILD_BUMP_INDEX)
        flag = "  <-- WC inflation" if a - b > 12 else ""
        print(f"{MONTH_NAMES[m-1]:<6}{a:8.1f}{b:9.1f}{a-b:+8.1f}   "
              f"{hits}/{len(non)} yrs = {hits/len(non):.0%}{flag}")

    print("\n" + "=" * 66)
    print("ORDINARY YEARS ONLY — the planning-relevant seasonal profile")
    print("=" * 66)
    for m in range(1, 13):
        b = statistics.mean(norm[y][m] for y in non)
        hits = sum(1 for y in non if norm[y][m] >= MILD_BUMP_INDEX)
        cons = hits / len(non)
        print(f"{MONTH_NAMES[m-1]:<6}{b:7.1f}  {label_for(b, cons):<14}"
              f"{cons:>5.0%}  {'#' * int(b / 10)}")

    print("\n" + "=" * 66)
    print("WORLD CUP LIFT, year by year (vs that year's own average)")
    print("=" * 66)
    for y in wc:
        m = WC_PEAK_MONTH[y]
        print(f"  {y}  {MONTH_NAMES[m-1]:<4} index {norm[y][m]:6.1f}  "
              f"(+{norm[y][m] - 100:.0f}% vs its own year)")
    print()


if __name__ == "__main__":
    main()
