# Soccer Balls — Demand Calendar

**Term:** `soccer balls` · **Region:** Worldwide · **Built:** 2026-08-10
**Sources:** `data/soccer-balls-worldwide-2004-2026-monthly.csv` (272 monthly points,
2004-01 to 2026-08) and `data/soccer-balls-worldwide-1yr.csv` (53 weekly points,
2025-08 to 2026-08), plus the matching `relatedQueries` / `relatedEntities` /
`geoMap` exports.

> Google Trends is a **relative interest index (0–100)**, not search volume. Every
> figure below is an index where **100 = that year's own average**. Nothing here is
> a unit forecast.

---

## Headline: this category is nearly aseasonal. Plan events, not seasons.

Strip out the World Cup and the entire year spans **81.8 (January) to 110.8
(September) — a 29-point range**. That is a flat category. For contrast, a genuinely
seasonal category runs a 150–200 point spread between trough and peak.

The single largest driver of search interest is not a season at all. It is a
**quadrennial tournament**:

| World Cup | Month | Index vs. its own year |
|---|---|---|
| 2006 | Jun | 164.2 (+64%) |
| 2010 | Jun | 205.0 (+105%) |
| 2014 | Jun | 163.6 (+64%) |
| 2018 | Jun | 132.4 (+32%) |
| 2022 | **Dec** | 145.2 (+45%) |

**Planning consequence:** build an ordinary-year baseline calendar that is cheap and
evergreen, and hold budget for tournament years. Do not spend against a seasonal
peak that does not exist.

---

## Verdicts on assumed peaks

> ⚠️ You did not supply your own assumptions, so these are the three beliefs most
> commonly held about this category — including the one your own `relatedQueries`
> export shows the market acting on. **Replace them with your real assumptions and
> I will re-rule.**

### 1. "Summer — June/July — is peak soccer ball season." → **BUSTED**

The most intuitive belief about the category, and it is false. In ordinary years:

- **June: index 103.6, elevated in only 4 of 17 years (24%)** — statistically average.
- **July: index 88.1, elevated in 0 of 17 years (0%)** — one of the two worst months.

The apparent summer peak is entirely tournament contamination: June reads **153.4 in
World Cup years vs. 103.6 in ordinary years**, a 49.7-point gap. Aggregate all years
together and June misleadingly becomes the top month at 121.2.

Note that Women's World Cup years (2007, 2011, 2015, 2019, 2023) sit **inside** the
ordinary-year baseline above and still produce no June peak. The men's tournament is
the only mover.

### 2. "There's a back-to-school / fall season bump." → **CONFIRMED**

The one real, plannable pattern in the data.

- **September: index 110.8, elevated in 13 of 17 ordinary years (76%)** — the only
  month clearing the consistency bar.
- The rise into it is the year's largest ordinary move: **August +9.9, September
  +12.8** month-over-month.
- Corroborated independently in the weekly file: Sep 2025 averaged 36.0 vs. Oct 2025
  at 33.5, during a stretch with no tournament activity.

**Honest limit:** September is the highest month *on average* and the most
*consistently* elevated, but it is the outright #1 month in only **4 of 17** years.
This is a reliable shallow bump, not a spike. Size the spend accordingly.

### 3. "December holiday gifting drives a peak." → **BUSTED**

**December: index 98.8, elevated in 2 of 17 ordinary years (12%).** Below average and
almost never elevated. November is marginally better (106.1) but still fails
consistency at 35%. The 2022 December reading of 145.2 was Qatar, not Christmas.

---

## The calendar

**Ordinary years** — applies to the rest of 2026 through 2029. Index is the
ordinary-year seasonal index (100 = annual average).

| Month | Demand phase | Index | Editorial (publish) | Campaign (spend) |
|---|---|---|---|---|
| **Jan** | Trough — year's low (81.8) | 81.8 | Evergreen + technical SEO; buying guides, size charts (`size 5`, `size 4` both Breakout terms) | **Dark.** No paid. |
| **Feb** | Recovery (+13.0 MoM) | 94.7 | Refresh last year's ranking pages | Minimal |
| **Mar** | Slow climb | 101.2 | Spring-season prep content; club/team bulk pages (`soccer balls in bulk`, `bag of soccer balls`) | Minimal; test bulk/team keywords |
| **Apr** | Mild climb | 103.8 | — | Light spring-season |
| **May** | Secondary bump — **unreliable** | 110.2 | **Publish the September content now** (8–12 wk SEO lead) | Light. 41% consistency does not justify real budget |
| **Jun** | Average — *not* a peak | 103.6 | — | **Do not spend on a summer peak.** See tournament overlay |
| **Jul** | Second-worst month | 88.1 | Evergreen / link-building only | **Dark.** 0/17 years elevated |
| **Aug** | **Ramp start** (+9.9 MoM) | 98.0 | Last call — anything not live now misses | **Start paid, weeks 2–4** (2–4 wk pre-peak rule) |
| **Sep** | **PEAK — the only real one** | **110.8** | Registration/back-to-school, youth sizing, team-kit | **Peak cadence.** Full budget |
| **Oct** | Post-peak decay (−7.9) | 102.8 | — | **Cut spend in week 1.** Interest falls faster than it rises |
| **Nov** | Mild, inconsistent (35%) | 106.1 | Gift-guide placement — hedge, not a bet | Light retail/gifting test only |
| **Dec** | Decline | 98.8 | Plan next year | Minimal |

**Lead-time chain for the September peak** (the only peak worth planning):

- **Ramp start: early August** (August is the first meaningful positive MoM move, +9.9).
- **SEO/editorial: publish mid-May to early June** — 8–12 weeks before ramp start.
- **Email/social: begin mid-July** — 2–4 weeks before ramp start.
- **Paid: start mid-to-late August**, peak cadence through September, **cut in the
  first week of October**.

---

## Tournament overlay

**You are here:** the 2026 World Cup peaked the week of **2026-06-14 at 100** and the
last observation (2026-08-09) is **43 — down 57% from peak**. The tournament window
is over and interest is reverting to baseline.

**The next men's World Cup is 2030.** The next three-and-a-half years are ordinary
years. Run the baseline calendar above and do not budget for another June.

For 2030, the pattern across five tournaments is consistent enough to plan against:
interest begins climbing roughly **4–6 weeks before kickoff**, peaks in the **group
stage** (2026: week of Jun 14, the tournament's first week), and **collapses within
2–3 weeks of the final**. Apply the standard rules to those dates when they are
confirmed — and note that Qatar 2022 landed in **November–December**, so confirm the
actual window rather than assuming June.

---

## Caveats

1. **Region is Worldwide, not a single market.** `geoMap` ranks South Africa (100)
   and Australia (84) above the United States (66). Those are opposite hemispheres.
   September is autumn in the north and spring in the south — both plausibly drive a
   September bump, so the *timing* is corroborated but the *mechanism* is not
   established. A US-only export would settle it, and could shift the ramp by weeks.
2. **Weekly ramp timing is inferred from monthly data.** The 22-year file is monthly,
   so `seasonality.py` cannot compute a true ramp-start week from it — the "peak week
   11 / ramp 0 weeks" it prints for that file is an artifact and was discarded. The
   August ramp start above is derived from month-over-month change. The only weekly
   file available covers a single, tournament-contaminated year.
3. **Long-run decline.** Raw annual mean fell from **63.9 (2004) to 17.6 (2020)**, a
   72% drop, recovering to 25.7 (2025). This is search-behaviour migration to Amazon
   and retailer apps, not evidence of collapsing demand. Do not read it as market size.
4. **Term choice.** `relatedQueries` ranks the singular `soccer ball` at 99 against
   this plural term. The seasonal *shape* should be similar, but the plural is the
   smaller variant.
