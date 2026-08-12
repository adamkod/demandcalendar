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

## The dashboard

Open `site/index.html` in any browser — no server, no install. Four categories are built
in: **births, divorces, marriages, vasectomies**. Three tabs do the work:

**Overview (home).** All four categories on one January-to-December heatmap, one row each,
darker = hotter than that term's own yearly average. A filled ▲ marks a peak that survives
the reality test; a hollow △ marks a year's high point that *isn't* a real peak. Below it,
key dates per category (peak, ramp start, SEO publish-by) and an assumption scoreboard
counting how many of your assumed peaks came back CONFIRMED / MISTIMED / OVERRATED / BUSTED.

**Category tabs.** One category at a time: term picker, average-year weekly curve with
publish/ramp/peak markers, the long-horizon monthly index, full history with one-off spikes
flagged, an editable assumed-peaks panel, and the month-by-month editorial calendar.

**Budget planner.** Pick your job (wedding planner, family law attorney, urology clinic,
baby brand, …) and enter a budget. It returns a month-by-month spend plan with dollar
amounts, quarter totals, a phase-colored column chart, and a written rationale per month
tied to the index that drove it. Two sliders control the content/paid split and how hard
to concentrate budget into peaks. Exports to CSV.

Data flows in two ways: files in `data/` compiled by `analysis/build_site_data.py` into
`site/data.js`, or the **Import Trends CSV** button, which parses an export in the browser
and stores it locally. Until real files land, every synthetic series is labeled SAMPLE and
a warning banner stays up.

## Project structure

```
demand-calendar/
├── README.md                  ← you are here
├── CLAUDE.md                  ← the AI agent: role, workflow, output format
├── analysis/
│   ├── seasonality.py         ← seasonality + peak-reality analyzer (stdlib only)
│   └── build_site_data.py     ← compiles data/*.csv (+ sample fill-in) into site/data.js
├── data/
│   ├── HOW-TO-DOWNLOAD.md     ← step-by-step Google Trends export guide
│   └── sample_multiTimeline.csv  ← synthetic sample so the script runs out of the box
├── site/
│   ├── index.html             ← the dashboard (self-contained, open it directly)
│   └── data.js                ← generated; do not hand-edit
└── output/                    ← generated calendars land here
```

## Budget model

Each month gets a weight of (seasonal index ÷ 100) raised to the concentration exponent, so
peaks pull budget super-proportionally. That weight is then shifted to buy *ahead* of demand:
paid spend in a month serves that month and the next (50/50), content spend serves demand
three months later. The two envelopes are normalized separately, blended by your content/paid
split, and rounded to whole dollars summing exactly to the budget. It allocates a fixed budget
across the year — it does not forecast revenue or ROI.

## Key concepts

- **Seasonal index**: average interest for a month ÷ overall average, ×100. An index
  of 140 means that month runs 40% above the yearly norm.
- **Peak reality test**: a "peak" only counts if (a) the index is meaningfully above
  baseline **and** (b) it shows up in most of the 5 years. A one-year spike (a viral
  moment) is not seasonality.
- **Ramp start**: the week interest first crosses halfway between baseline and peak.
  Publish SEO content 8–12 weeks *before* ramp start; launch paid campaigns 2–4 weeks
  before the peak itself.
