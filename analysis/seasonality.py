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

# Anomaly detection (see find_anomalies for why this is median-based, not mean-based)
ANOMALY_Z = 3.5             # modified z-score, Iglewicz & Hoaglin convention
ANOMALY_FLOOR_FRAC = 0.30   # ...and a gap of at least 30% of the series' own mean
ANOMALY_MIN_POINTS = 3      # ...but never fewer than this many index points
ANOMALY_RATIO = 1.5         # ...and at least this multiple of the week's median

# Ramp timing is only meaningful on a curve that actually moves. Below this
# peak-over-median amplitude the "ramp" is chasing noise, so we decline to date it.
MIN_RAMP_AMPLITUDE = 0.10   # smoothed peak must sit >= 10% above the curve's median


def parse_trends_csv(path):
    """Return (dates, {term: [values]}) from a Google Trends export.

    Handles the metadata preamble, weekly/daily/monthly date columns, and "<1".
    """
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    # "Week"/"Day"/"Month" is the classic Explore export; "Time" is what the newer
    # download produces, with the granularity implied by the row spacing instead.
    header_i = next((i for i, r in enumerate(rows)
                     if r and r[0].strip() in ("Week", "Day", "Month", "Time")), None)
    if header_i is None:
        sys.exit(f"error: {path} does not look like a Google Trends export "
                 "(no Week/Day/Month/Time header row found)")

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
    """Seasonal index per month, plus per-year monthly indices for consistency.

    The index is the average of the *within-year* indices, not a pooled average
    of the raw values. Pooling lets a secular trend masquerade as seasonality
    whenever the export does not start in January: "divorce lawyer" more than
    doubles in 2025, and because a 2021-08..2026-08 window covers Jan-Jul in six
    calendar years but Sep-Dec in only five, the pooled figure hands the first
    half of the year a peak built entirely out of that growth. Normalising each
    year against its own mean first removes the level shift, so what is left is
    shape. Only years with >= 10 months count, which also drops the ragged years
    at both ends of the window.

    Falls back to the pooled calculation when there are fewer than two complete
    years, which is all a short export can support.
    """
    by_month = defaultdict(list)
    by_year_month = defaultdict(lambda: defaultdict(list))
    for d, v in zip(dates, values):
        by_month[d.month].append(v)
        by_year_month[d.year][d.month].append(v)

    per_year = {}
    for y, months in by_year_month.items():
        if len(months) < 10:          # skip partial years at the range edges
            continue
        year_mean = statistics.mean(v for vs in months.values() for v in vs)
        if not year_mean:
            continue
        per_year[y] = {m: statistics.mean(vs) / year_mean * 100
                       for m, vs in months.items()}

    if len(per_year) >= 2:
        # Median across years, matching weekly_curve. The mean lets a single
        # extreme year set the headline: Dobbs puts vasectomy's June 2022 at a
        # within-year index of 166 against ~100 in every other year, and the mean
        # of those reads 117 -- peak territory. The consistency score would still
        # label it INCONSISTENT, but the index itself feeds the heatmap colour and
        # the budget allocator, and the allocator reads numbers, not labels. It
        # would have moved real money into June because of one court ruling.
        index = {}
        for m in range(1, 13):
            vals = [yi[m] for yi in per_year.values() if m in yi]
            if vals:
                index[m] = statistics.median(vals)
    else:
        overall = statistics.mean(values)
        index = {m: statistics.mean(vs) / overall * 100
                 for m, vs in by_month.items()} if overall else {}
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
    """Typical value per ISO week across years, lightly smoothed.

    Takes the median across years, not the mean. With ~5 observations per
    calendar week, one viral year drags the mean up permanently and the average
    year inherits a peak that only ever happened once: the Dobbs spike alone
    moves vasectomy's week-26 mean from 5 to 7.8 and invents a June season. The
    median ignores it, which is the whole point — a one-off is not a season.
    """
    by_week = defaultdict(list)
    for d, v in zip(dates, values):
        wk = min(d.isocalendar()[1], 52)   # fold week 53 into 52
        by_week[wk].append(v)
    curve = [statistics.median(by_week[w]) if w in by_week else 0.0
             for w in range(1, 53)]
    return [statistics.mean([curve[(i - 1) % 52], curve[i], curve[(i + 1) % 52]])
            for i in range(52)]


def ramp_and_peak(curve):
    """Peak week, ramp-start week (circular), and lead weeks between them.

    Returns `defined: False` when the curve is too flat to time anything against.
    On a flat series the argmax is just the noisiest week, and its neighbour sits
    below the halfway threshold, so the ramp collapses onto the peak and the
    function emits a confident-looking "publish by" date built from rounding
    error. Refusing to date it is the honest output: a category with no season
    has no ramp to lead.
    """
    peak_i = max(range(52), key=lambda i: curve[i])
    med = statistics.median(curve)
    amplitude = (curve[peak_i] - med) / med if med else 0.0
    if amplitude < MIN_RAMP_AMPLITUDE:
        return {"defined": False, "peak_week": peak_i + 1,
                "amplitude": round(amplitude, 3)}

    baseline = statistics.quantiles(curve, n=4)[0]   # 25th percentile
    threshold = baseline + RAMP_FRACTION * (curve[peak_i] - baseline)

    ramp_i = peak_i
    for step in range(1, 52):
        i = (peak_i - step) % 52
        if curve[i] < threshold:
            ramp_i = (i + 1) % 52
            break
    lead = (peak_i - ramp_i) % 52
    return {"defined": True, "peak_week": peak_i + 1, "ramp_start_week": ramp_i + 1,
            "ramp_lead_weeks": lead, "amplitude": round(amplitude, 3)}


def week_recurrence(dates, values, week):
    """Does this ISO week actually recur, year over year?

    Tests the peak week directly on the weekly rows. The monthly label used to
    stand in for this and it was the wrong instrument: "wedding venues" peaks in
    the week of 27 December, inside a December the monthly classifier grades
    OFF-SEASON because its other three weeks are the year's floor. The proxy
    would have discarded the sharpest, most consistent peak in the data for
    being in the "wrong" month. Same bar as everywhere else, measured at the
    resolution the claim is made at. Returns None when there are too few
    complete years to judge.
    """
    by_year = defaultdict(lambda: {"weeks": {}, "vals": []})
    for d, v in zip(dates, values):
        rec = by_year[d.year]
        rec["weeks"][min(d.isocalendar()[1], 52)] = v
        rec["vals"].append(v)
    w = (week - 1) % 52 + 1
    vals = []
    for rec in by_year.values():
        if len(rec["vals"]) < 26 or w not in rec["weeks"]:
            continue
        m = statistics.mean(rec["vals"])
        if m:
            vals.append(rec["weeks"][w] / m * 100)
    if len(vals) < 3:
        return None
    med = statistics.median(vals)
    hits = sum(1 for v in vals if v >= MILD_BUMP_INDEX)
    consistency = hits / len(vals)
    return {"median": round(med, 1), "years": len(vals), "consistency": consistency,
            "passes": med >= MILD_BUMP_INDEX and consistency >= CONSISTENCY_REQUIRED}


def week_to_month(week):
    """Calendar month an ISO week falls in (reference year, good enough to bucket)."""
    return date.fromordinal(date(2026, 1, 1).toordinal() + (week - 1) * 7 + 3).month


def detect_series_granularity(dates):
    """weekly / monthly from the actual row spacing."""
    if len(dates) < 3:
        return "monthly"
    gaps = [(dates[i + 1] - dates[i]).days for i in range(min(6, len(dates) - 1))]
    return "weekly" if statistics.median(gaps) <= 10 else "monthly"


def month_timing(months):
    """Ramp/peak at month precision, for a series with no weekly resolution.

    Running weekly_curve over monthly rows is not an approximation, it is
    garbage: each month lands on one ISO week, leaving 40 of 52 slots empty and
    a curve whose peak is an artefact of where the zeros fall. A monthly series
    gets a monthly answer.

    "Defined" borrows the classifier's verdict rather than a bare threshold, so
    a month that is only elevated in a minority of years does not become a
    campaign date.
    """
    if not months:
        return {"defined": False, "peak_month": None, "amplitude": 0.0}
    peak_m = max(months, key=lambda m: months[m]["index"])
    idxs = [i["index"] for i in months.values()]
    med = statistics.median(idxs)
    amp = (months[peak_m]["index"] - med) / med if med else 0.0
    defined = months[peak_m]["label"] in ("REAL PEAK", "MILD BUMP")
    out = {"defined": defined, "peak_month": peak_m, "amplitude": round(amp, 3)}
    if defined:
        out["ramp_month"] = (peak_m + 10) % 12 + 1        # month before the peak
        out["publish_month"] = (peak_m + 8) % 12 + 1      # ~3 months before
    return out


def find_anomalies(dates, values):
    """Weeks far above the cross-year norm for that calendar week: viral one-offs.

    Uses median + MAD rather than mean + standard deviation. Each calendar week
    has only one observation per year, and a spike inflates its own standard
    deviation so badly that a mean-based 3-sigma test can never fire: for n
    points the largest attainable z-score is (n-1)/sqrt(n), which is 1.79 at
    n=5 and does not reach 3.0 until n=11. Five years of weekly data therefore
    made the old test unconditionally dead. The median and MAD are unmoved by
    the outlier, so the spike stays visible.

    A flag requires all three of: modified z-score, a minimum gap in index points,
    and a ratio to the week's median. MAD is frequently 0 or 1 on smooth series,
    which inflates the z-score, so the latter two carry the weight there.

    The gap floor scales with the series' own mean. A fixed floor in index points
    is only meaningful for a term that uses most of the 0-100 range: on a term
    that a larger comparison term has squashed into single digits, a 15-point
    floor demands a 4x spike and quietly disables detection. Google Trends scales
    every term in an export against the largest one, so squashed series are the
    normal case, not the exception — the floor has to be relative to survive it.

    Values are compared within their own year. On a series with a strong secular
    trend the early years otherwise read as anomalies against a median drawn from
    the whole range, which says nothing about a viral moment.
    """
    by_year = defaultdict(list)
    for d, v in zip(dates, values):
        by_year[d.year].append(v)
    overall = statistics.mean(values)
    year_mean = {y: statistics.mean(vs) if len(vs) >= 6 else overall
                 for y, vs in by_year.items()}

    by_week = defaultdict(list)
    for d, v in zip(dates, values):
        detrended = v / year_mean[d.year] * overall if year_mean[d.year] else v
        by_week[min(d.isocalendar()[1], 52)].append((d, v, detrended))

    floor = max(ANOMALY_MIN_POINTS, ANOMALY_FLOOR_FRAC * overall)
    anomalies = []
    for wk, obs in by_week.items():
        if len(obs) < 3:
            continue
        vals = [t for _, _, t in obs]
        med = statistics.median(vals)
        mad = statistics.median([abs(t - med) for t in vals])
        for d, v, t in obs:
            gap = t - med
            if gap < floor or t < ANOMALY_RATIO * med:
                continue
            # 0.6745 rescales MAD to a standard-deviation equivalent
            z = 0.6745 * gap / mad if mad > 0 else float("inf")
            if z >= ANOMALY_Z:
                anomalies.append({"date": d.isoformat(), "value": v,
                                  "typical_for_week": round(med, 1),
                                  "modified_z": round(z, 1) if mad else None})
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

    gran = detect_series_granularity(dates)
    report["granularity"] = gran

    for term, values in series.items():
        index, per_year = monthly_index(dates, values)
        months = classify_months(index, per_year)
        entry = {
            "months": {MONTH_NAMES[m - 1]: months[m] for m in sorted(months)},
            "granularity": gran,
            "resolution": series_resolution(values),
            "anomalies": find_anomalies(dates, values),
        }
        if gran == "weekly":
            timing = ramp_and_peak(weekly_curve(dates, values))
            # The amplitude test measures shape; this tests whether the shape
            # recurs, so a ramp is never dated against a one-year accident.
            if timing["defined"]:
                rec = week_recurrence(dates, values, timing["peak_week"])
                if rec is not None:
                    if not rec["passes"]:
                        timing = {"defined": False, "peak_week": timing["peak_week"],
                                  "amplitude": timing["amplitude"], "vetoed": True,
                                  "veto_label": f"that week recurs in only "
                                                f"{rec['consistency']:.0%} of "
                                                f"{rec['years']} years"}
                else:
                    # Too few complete years to judge the week; fall back to the
                    # monthly verdict for the month the peak falls in.
                    pm = months.get(week_to_month(timing["peak_week"]), {})
                    if pm.get("label") not in ("REAL PEAK", "MILD BUMP"):
                        timing = {"defined": False, "peak_week": timing["peak_week"],
                                  "amplitude": timing["amplitude"], "vetoed": True,
                                  "veto_label": "that month grades "
                                                + pm.get("label", "NO PEAK")}
            entry["timing_vetoed"] = timing.get("vetoed", False)
            entry["veto_label"] = timing.get("veto_label")
            entry.update({
                "timing_defined": timing["defined"],
                "amplitude": timing["amplitude"],
                "peak_week": timing["peak_week"],
                "peak_week_approx": week_to_approx_date(timing["peak_week"]),
            })
            if timing["defined"]:
                entry.update({
                    "ramp_start_week": timing["ramp_start_week"],
                    "ramp_start_approx": week_to_approx_date(timing["ramp_start_week"]),
                    "ramp_lead_weeks": timing["ramp_lead_weeks"],
                })
        else:
            timing = month_timing(months)
            entry.update({
                "timing_defined": timing["defined"],
                "amplitude": timing["amplitude"],
                "peak_month": (MONTH_NAMES[timing["peak_month"] - 1]
                               if timing["peak_month"] else None),
            })
            if timing["defined"]:
                entry.update({
                    "ramp_month": MONTH_NAMES[timing["ramp_month"] - 1],
                    "publish_month": MONTH_NAMES[timing["publish_month"] - 1],
                })
        report["terms"][term] = entry
    return report


def series_resolution(values):
    """How coarse this term is on its export's shared 0-100 scale.

    Trends scales every term in an export against the largest one, so a small
    term can be squeezed into single digits where one integer step is a large
    share of its own mean. Past ~8% per step the seasonal index is mostly
    rounding error and the term needs its own export to be worth reading.
    """
    m = statistics.mean(values)
    step_pct = 100 / m if m else float("inf")
    return {"mean": round(m, 1), "distinct_values": len(set(values)),
            "step_pct_of_mean": round(step_pct, 1),
            "usable": step_pct <= 8.0}


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
        res = t["resolution"]
        if not res["usable"]:
            print(f"\n!! LOW RESOLUTION: mean {res['mean']} on the 0-100 scale, only "
                  f"{res['distinct_values']} distinct values —")
            print(f"   one integer step is {res['step_pct_of_mean']}% of this term's "
                  "mean, so the index above is")
            print("   mostly rounding error. Re-export this term on its own, or "
                  "against similar-sized terms.")

        if t["timing_defined"] and t["granularity"] == "weekly":
            print(f"\nPeak week:       {t['peak_week']} ({t['peak_week_approx']})")
            print(f"Ramp starts:     week {t['ramp_start_week']} "
                  f"({t['ramp_start_approx']}) — {t['ramp_lead_weeks']} weeks "
                  "before peak")
            print("Publish-by date: 8–12 weeks BEFORE ramp start for SEO content; "
                  "paid spend 2–4 weeks before peak.")
        elif t["timing_defined"]:
            print(f"\nPeak month:      {t['peak_month']}  (month precision — this "
                  "export has no weekly rows)")
            print(f"Ramp starts:     {t['ramp_month']}")
            print(f"Publish by:      {t['publish_month']}  (~3 months ahead, so "
                  "pages rank before demand)")
        elif t["granularity"] == "weekly" and t.get("timing_vetoed"):
            print(f"\nNo usable ramp:  the average year does rise "
                  f"{t['amplitude'] * 100:.0f}% into week {t['peak_week']} "
                  f"({t['peak_week_approx']}), but")
            print(f"                 {t['veto_label']} — not enough to plan against.")
            print("                 Treat it as noise, not a season.")
        elif t["granularity"] == "weekly":
            print(f"\nNo usable ramp:  the average year peaks only "
                  f"{t['amplitude'] * 100:.0f}% above its own median "
                  f"(needs {MIN_RAMP_AMPLITUDE * 100:.0f}%).")
            print("                 This category has no season to lead. Publish "
                  "evergreen on a steady")
            print("                 cadence and spend level across the year; there "
                  "is no peak to time.")
        else:
            print(f"\nNo usable ramp:  the strongest month ({t['peak_month']}) does "
                  "not survive the reality")
            print("                 test — it is not elevated in enough years to "
                  "plan against. Publish")
            print("                 evergreen and spend level; there is no peak "
                  "to time.")
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
