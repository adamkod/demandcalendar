"""Demand Calendar seasonality analyzer.

Reads a Google Trends CSV export (weekly, "Past 5 years" recommended) and reports,
per search term:

  * monthly seasonal index (100 = average interest for the year)
  * which months are REAL PEAK / MILD BUMP / NO PEAK / OFF-SEASON,
    with year-over-year consistency
  * peak week, ramp-start week, and the lead time between them
  * one-off spikes (viral moments) that are NOT seasonality

Stdlib only — no installs required.

Usage:
    python seasonality.py data/multiTimeline.csv
    python seasonality.py data/multiTimeline.csv --json
"""

import csv
import json
import statistics
import sys
from collections import defaultdict
from datetime import date

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Classification thresholds (seasonal index, 100 = yearly average)
REAL_PEAK_INDEX = 115      # month runs >= 15% above the yearly norm
MILD_BUMP_INDEX = 107
OFF_SEASON_INDEX = 88
CONSISTENCY_REQUIRED = 0.6  # peak must show up in >= 60% of observed years
RAMP_FRACTION = 0.5         # ramp starts when curve crosses halfway baseline->peak


def parse_trends_csv(path):
    """Return (dates, {term: [values]}) from a Google Trends export.

    Handles the metadata preamble, weekly/daily/monthly date columns, and "<1".
    """
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    header_i = next((i for i, r in enumerate(rows)
                     if r and r[0].strip() in ("Week", "Day", "Month")), None)
    if header_i is None:
        sys.exit(f"error: {path} does not look like a Google Trends export "
                 "(no Week/Day/Month header row found)")

    terms = [c.split(":")[0].strip() for c in rows[header_i][1:]]
    dates, series = [], {t: [] for t in terms}

    for r in rows[header_i + 1:]:
        if not r or not r[0].strip():
            continue
        raw = r[0].strip()
        parts = [int(p) for p in raw.split("-")]
        d = date(parts[0], parts[1], parts[2] if len(parts) > 2 else 15)
        dates.append(d)
        for t, cell in zip(terms, r[1:]):
            cell = cell.strip()
            series[t].append(0.5 if cell == "<1" else float(cell or 0))
    return dates, series


def monthly_index(dates, values):
    """Seasonal index per month, plus per-year monthly indices for consistency."""
    by_month = defaultdict(list)
    by_year_month = defaultdict(lambda: defaultdict(list))
    for d, v in zip(dates, values):
        by_month[d.month].append(v)
        by_year_month[d.year][d.month].append(v)

    overall = statistics.mean(values)
    index = {m: statistics.mean(vs) / overall * 100 for m, vs in by_month.items()}

    per_year = {}
    for y, months in by_year_month.items():
        if len(months) < 10:          # skip partial years at the range edges
            continue
        year_mean = statistics.mean(v for vs in months.values() for v in vs)
        per_year[y] = {m: statistics.mean(vs) / year_mean * 100
                       for m, vs in months.items()}
    return index, per_year


def classify_months(index, per_year):
    """Label each month and score how consistently it peaks across years."""
    out = {}
    for m in range(1, 13):
        idx = index.get(m)
        if idx is None:
            continue
        years_with = [y for y, yi in per_year.items() if m in yi]
        peak_years = [y for y in years_with if per_year[y][m] >= MILD_BUMP_INDEX]
        consistency = len(peak_years) / len(years_with) if years_with else 0.0

        if idx >= REAL_PEAK_INDEX and consistency >= CONSISTENCY_REQUIRED:
            label = "REAL PEAK"
        elif idx >= MILD_BUMP_INDEX and consistency >= CONSISTENCY_REQUIRED:
            label = "MILD BUMP"
        elif idx >= MILD_BUMP_INDEX:
            label = "INCONSISTENT"   # looks elevated on average, driven by few years
        elif idx <= OFF_SEASON_INDEX:
            label = "OFF-SEASON"
        else:
            label = "NO PEAK"
        out[m] = {"index": round(idx, 1), "label": label,
                  "consistency": round(consistency, 2)}
    return out


def weekly_curve(dates, values):
    """Average value per ISO week across years, lightly smoothed."""
    by_week = defaultdict(list)
    for d, v in zip(dates, values):
        wk = min(d.isocalendar()[1], 52)   # fold week 53 into 52
        by_week[wk].append(v)
    curve = [statistics.mean(by_week[w]) if w in by_week else 0.0
             for w in range(1, 53)]
    return [statistics.mean([curve[(i - 1) % 52], curve[i], curve[(i + 1) % 52]])
            for i in range(52)]


def ramp_and_peak(curve):
    """Peak week, ramp-start week (circular), and lead weeks between them."""
    peak_i = max(range(52), key=lambda i: curve[i])
    baseline = statistics.quantiles(curve, n=4)[0]   # 25th percentile
    threshold = baseline + RAMP_FRACTION * (curve[peak_i] - baseline)

    ramp_i = peak_i
    for step in range(1, 52):
        i = (peak_i - step) % 52
        if curve[i] < threshold:
            ramp_i = (i + 1) % 52
            break
    lead = (peak_i - ramp_i) % 52
    return peak_i + 1, ramp_i + 1, lead


def find_anomalies(dates, values):
    """Weeks far above the cross-year norm for that calendar week: viral one-offs."""
    by_week = defaultdict(list)
    for d, v in zip(dates, values):
        by_week[min(d.isocalendar()[1], 52)].append((d, v))

    anomalies = []
    for wk, obs in by_week.items():
        if len(obs) < 3:
            continue
        vals = [v for _, v in obs]
        mean, sd = statistics.mean(vals), statistics.pstdev(vals)
        for d, v in obs:
            if sd > 0 and v > mean + 3 * sd and v - mean > 25:
                anomalies.append({"date": d.isoformat(), "value": v,
                                  "typical_for_week": round(mean, 1)})
    return sorted(anomalies, key=lambda a: a["date"])


def week_to_approx_date(week):
    """Rough month/day label for an ISO week number, for readability."""
    d = date.fromordinal(date(2026, 1, 1).toordinal() + (week - 1) * 7)
    return f"~{MONTH_NAMES[d.month - 1]} {d.day}"


def analyze(path):
    dates, series = parse_trends_csv(path)
    years = sorted({d.year for d in dates})
    report = {"file": path,
              "range": f"{dates[0].isoformat()} to {dates[-1].isoformat()}",
              "points": len(dates), "years": years, "terms": {}}

    for term, values in series.items():
        index, per_year = monthly_index(dates, values)
        months = classify_months(index, per_year)
        curve = weekly_curve(dates, values)
        peak_wk, ramp_wk, lead = ramp_and_peak(curve)
        report["terms"][term] = {
            "months": {MONTH_NAMES[m - 1]: months[m] for m in sorted(months)},
            "peak_week": peak_wk, "peak_week_approx": week_to_approx_date(peak_wk),
            "ramp_start_week": ramp_wk,
            "ramp_start_approx": week_to_approx_date(ramp_wk),
            "ramp_lead_weeks": lead,
            "anomalies": find_anomalies(dates, values),
        }
    return report


def print_report(report):
    print(f"\nDemand Calendar — seasonality report")
    print(f"file:  {report['file']}")
    print(f"range: {report['range']}  ({report['points']} points, "
          f"years {report['years'][0]}–{report['years'][-1]})")
    print("note: Google Trends is a relative index (0–100), not search volume.\n")

    for term, t in report["terms"].items():
        print("=" * 62)
        print(f"TERM: {term}")
        print("-" * 62)
        print(f"{'Month':<6}{'Index':>7}  {'Label':<14}{'Yr-consistency':>15}")
        for m, info in t["months"].items():
            bar = "#" * int(info["index"] / 10)
            print(f"{m:<6}{info['index']:>7}  {info['label']:<14}"
                  f"{info['consistency']:>14.0%}  {bar}")
        print(f"\nPeak week:       {t['peak_week']} ({t['peak_week_approx']})")
        print(f"Ramp starts:     week {t['ramp_start_week']} "
              f"({t['ramp_start_approx']}) — {t['ramp_lead_weeks']} weeks "
              "before peak")
        print("Publish-by date: 8–12 weeks BEFORE ramp start for SEO content; "
              "paid spend 2–4 weeks before peak.")
        if t["anomalies"]:
            print("\nOne-off spikes (NOT seasonality — exclude from planning):")
            for a in t["anomalies"]:
                print(f"  {a['date']}: hit {a['value']:.0f} vs typical "
                      f"{a['typical_for_week']} for that week")
        print()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("usage: python seasonality.py <trends-export.csv> [--json]")
    report = analyze(args[0])
    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)


if __name__ == "__main__":
    main()
