"""Holiday sensitivity — does a holiday actually move search interest?

Mirrors site/weeks.js. Reuses seasonality.py's thresholds, so a holiday can
never "land" on a bar the monthly classifier would have rejected.

Hard limit worth knowing: Google Trends serves daily rows only for ranges under
about nine months. Nothing here claims day-level precision — the unit is the
ISO week, and days inherit their week.

Usage:
    python analysis/holidays.py data/us-4terms-2021-2026-weekly.csv
    python analysis/holidays.py data/<weekly>.csv --all      # include misses
"""

import os
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seasonality import (parse_trends_csv, detect_series_granularity,  # noqa: E402
                         MILD_BUMP_INDEX, CONSISTENCY_REQUIRED, MONTH_NAMES)

HOLIDAY_OFFSETS = [-4, -3, -2, -1, 0, 1]


def nth_weekday(year, month, weekday, n):
    """weekday: 0=Mon .. 6=Sun (matches date.weekday())."""
    first = date(year, month, 1)
    shift = (weekday - first.weekday()) % 7
    return first + timedelta(days=shift + (n - 1) * 7)


def last_weekday(year, month, weekday):
    last_day = (date(year + month // 12, month % 12 + 1, 1) - timedelta(days=1))
    shift = (last_day.weekday() - weekday) % 7
    return last_day - timedelta(days=shift)


def easter_sunday(year):
    """Anonymous Gregorian algorithm."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return date(year, (h + l - 7 * m + 114) // 31, ((h + l - 7 * m + 114) % 31) + 1)


def holidays_for(year):
    """(id, name, date). Computed, not hard-coded — most of these float, and a
    wrong date would silently attribute a lift to the wrong week."""
    tg = nth_weekday(year, 11, 3, 4)          # 4th Thursday
    out = [
        ("newyear", "New Year's Day", date(year, 1, 1)),
        ("superbowl", "Super Bowl", nth_weekday(year, 2, 6, 2)),
        ("valentines", "Valentine's Day", date(year, 2, 14)),
        ("madness", "March Madness", nth_weekday(year, 3, 6, 2) + timedelta(days=2)),
        ("easter", "Easter", easter_sunday(year)),
        ("mothers", "Mother's Day", nth_weekday(year, 5, 6, 2)),
        ("memorial", "Memorial Day", last_weekday(year, 5, 0)),
        ("fathers", "Father's Day", nth_weekday(year, 6, 6, 3)),
        ("july4", "Independence Day", date(year, 7, 4)),
        ("labor", "Labor Day", nth_weekday(year, 9, 0, 1)),
        ("halloween", "Halloween", date(year, 10, 31)),
        ("thanks", "Thanksgiving", tg),
        ("blackfri", "Black Friday", tg + timedelta(days=1)),
        ("cybermon", "Cyber Monday", tg + timedelta(days=4)),
        ("christmas", "Christmas Day", date(year, 12, 25)),
        ("nye", "New Year's Eve", date(year, 12, 31)),
    ]
    return sorted(out, key=lambda h: h[2])


def weekly_index_by_year(dates, values):
    """Each week against its own year's mean — raw values are not comparable
    across years on a trending series."""
    by_year = defaultdict(lambda: {"weeks": {}, "vals": []})
    for d, v in zip(dates, values):
        y = by_year[d.year]
        y["weeks"][min(d.isocalendar()[1], 52)] = v
        y["vals"].append(v)
    out = {}
    for y, rec in by_year.items():
        if len(rec["vals"]) < 26:             # skip ragged edge years
            continue
        m = statistics.mean(rec["vals"])
        if not m:
            continue
        out[y] = {w: v / m * 100 for w, v in rec["weeks"].items()}
    return out


def holiday_sensitivity(idx_by_year, holiday_id):
    """Median lift per week-offset around the holiday, plus how often it repeats.

    The median guards against one viral year manufacturing a holiday effect.
    """
    years = sorted(idx_by_year)
    if len(years) < 3:
        return None
    per = {}
    for off in HOLIDAY_OFFSETS:
        vals = []
        for y in years:
            hol = next((h for h in holidays_for(y) if h[0] == holiday_id), None)
            if hol is None:
                continue
            hw = min(hol[2].isocalendar()[1], 52)
            w = (hw - 1 + off) % 52 + 1
            if w in idx_by_year[y]:
                vals.append(idx_by_year[y][w])
        if len(vals) < 3:
            continue
        per[off] = {"median": round(statistics.median(vals), 1), "years": len(vals),
                    "hits": sum(1 for v in vals if v >= MILD_BUMP_INDEX)}
    if not per:
        return None
    best_off = max(per, key=lambda o: per[o]["median"])
    best = per[best_off]
    consistency = best["hits"] / best["years"]
    return {"offset": best_off, "median": best["median"], "years": best["years"],
            "consistency": consistency, "per": per,
            "lands": best["median"] >= MILD_BUMP_INDEX
                     and consistency >= CONSISTENCY_REQUIRED}


def describe_offset(off):
    if off == 0:
        return "holiday week"
    if off < 0:
        return f"{-off} week{'' if off == -1 else 's'} before"
    return "week after"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("usage: python holidays.py <weekly-trends-export.csv> [--all]")
    path = args[0]
    show_all = "--all" in sys.argv

    dates, series = parse_trends_csv(path)
    if detect_series_granularity(dates) != "weekly":
        sys.exit(f"error: {path} is not weekly. Holiday lift needs week rows — "
                 "export the term at 'Past 5 years'.")

    ref_year = date.today().year + 1
    print(f"\nHoliday sensitivity — {path}")
    print(f"range: {dates[0]} to {dates[-1]}   (dates shown for {ref_year})")
    print("note: unit is the ISO week; Trends has no daily rows at this range.\n")

    for term, values in series.items():
        mean_v = statistics.mean(values)
        idx = weekly_index_by_year(dates, values)
        print("=" * 66)
        print(f"TERM: {term}")
        if mean_v and 100 / mean_v > 8:
            print(f"  !! LOW RESOLUTION: one integer step is {100 / mean_v:.1f}% of this "
                  "term's mean —\n     these figures are mostly rounding error.")
        print("-" * 66)
        print(f"{'Holiday':<20}{'Date':<8}{'Strongest week':<18}{'Index':>7}"
              f"{'Years':>10}  Verdict")
        any_row = False
        for hid, name, hdate in holidays_for(ref_year):
            s = holiday_sensitivity(idx, hid)
            if s is None or (not s["lands"] and not show_all):
                continue
            any_row = True
            print(f"{name:<20}{MONTH_NAMES[hdate.month - 1]} {hdate.day:<4}"
                  f"{describe_offset(s['offset']):<18}{s['median']:>7}"
                  f"{s['consistency']:>7.0%} of {s['years']}  "
                  f"{'LANDS' if s['lands'] else 'no lift'}")
        if not any_row:
            print("  No holiday clears the bar"
                  + ("." if show_all else " — pass --all to see the misses."))
        print()


if __name__ == "__main__":
    main()
