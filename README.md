# Demand Calendar

**MGMT 440 — AI project.** Turns search-interest seasonality for a category into an
editorial and campaign calendar: **what to publish when, how far ahead of the peak to
start, and which of your assumed peaks don't actually exist.**

## The problem

Marketing teams plan content around peaks they *believe* exist ("everyone searches for
grills in June"). Some of those peaks are real, some are mild bumps, and some are
folklore. Even when a peak is real, teams usually start publishing too late — SEO
content needs 8–12 weeks to rank, so publishing *at* the peak means missing it.

## The data

[Google Trends](https://trends.google.com/trends/explore) — free, weekly search-interest
index (0–100) for any term, downloadable as CSV. See
[data/HOW-TO-DOWNLOAD.md](data/HOW-TO-DOWNLOAD.md).

## How it works

1. Pick a category and 2–5 search terms that represent it.
2. Download 5 years of weekly data from Google Trends into `data/` (one CSV per term,
   or one multi-term CSV).
3. Run the analyzer:

   ```
   python analysis/seasonality.py data/your-file.csv
   ```

4. The script computes a monthly seasonal index across the 5 years, classifies each
   month (REAL PEAK / MILD BUMP / NO PEAK), measures how consistent the peak is
   year-over-year, and finds the **ramp start** — the week interest begins climbing —
   which sets the publish-by date.
5. The AI agent (see `CLAUDE.md`) interprets the output and drafts the actual
   editorial + campaign calendar with dates, content types, and lead times.

## Project structure

```
demand-calendar/
├── README.md                  ← you are here
├── CLAUDE.md                  ← the AI agent: role, workflow, output format
├── analysis/
│   └── seasonality.py         ← seasonality + peak-reality analyzer (stdlib only)
├── data/
│   ├── HOW-TO-DOWNLOAD.md     ← step-by-step Google Trends export guide
│   └── sample_multiTimeline.csv  ← synthetic sample so the script runs out of the box
└── output/                    ← generated calendars land here
```

## Key concepts

- **Seasonal index**: average interest for a month ÷ overall average, ×100. An index
  of 140 means that month runs 40% above the yearly norm.
- **Peak reality test**: a "peak" only counts if (a) the index is meaningfully above
  baseline **and** (b) it shows up in most of the 5 years. A one-year spike (a viral
  moment) is not seasonality.
- **Ramp start**: the week interest first crosses halfway between baseline and peak.
  Publish SEO content 8–12 weeks *before* ramp start; launch paid campaigns 2–4 weeks
  before the peak itself.
