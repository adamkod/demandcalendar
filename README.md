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

Open `site/index.html` in any browser — no server, no install, no build step. Four
categories are built in: **births, divorces, marriages, vasectomies**.

Built with **React 18 and Tailwind CSS**, both vendored into `site/vendor/` rather than
installed. There is no Node toolchain here: the app has to keep opening by double-click and
exporting to a single shareable file, which a bundler would break. `htm` supplies JSX-like
syntax without a compile step, so `app.js` reads as ordinary React components. Icons are
Lucide glyphs inlined as SVG paths.

`app.js` renders and nothing else. Every number comes from `analysis.js`, which mirrors
`analysis/seasonality.py` — **change a threshold in one and you must change it in the other**,
or the CLI and the app will disagree about the same data.

Three surfaces do the work:

**Calendar.** Filter pills for Birth, Marriage, Divorce and Vasectomies drive a
January-to-December seasonality heatmap — one row per category, each on its own pastel
gradient, indexed to its own yearly average so rows can be read side by side. Below it,
callout cards generated *from the analysis rather than written by hand*, which is why some
of them report that a peak isn't there. Then the assumption scoreboard
(CONFIRMED / MISTIMED / OVERRATED / BUSTED) and a detail card per category with a sparkline,
key dates, the monthly index, and a low-resolution warning where one applies.

Colour never carries meaning alone: every category pairs its hue with a Lucide icon and a
text label, so the palette stays readable in greyscale and for colour-blind viewers.

**Budget planner.** Pick your job (wedding planner, family law attorney, urology clinic,
baby brand, …) and enter a budget. It returns a month-by-month spend plan with dollar
amounts, quarter totals, a phase-colored column chart, and a written rationale per month
tied to the index that drove it. Two sliders control the content/paid split and how hard
to concentrate budget into peaks. Exports to CSV.

Data flows in two ways: files in `data/` compiled by `analysis/build_site_data.py` into
`site/data.js`, or the **Import Trends CSV** button, which parses an export in the browser
and stores it locally. Until real files land, every synthetic series is labeled SAMPLE and
a warning banner stays up.

### Sharing it

`site/demand-calendar-standalone.html` is the same dashboard with the data inlined into a
single file — no siblings required. Email it, drop it in Drive, or open it from a USB stick.
Rebuild it after any change to the site or the data:

```
py analysis/build_standalone.py
```

## Project structure

```
demand-calendar/
├── README.md                  ← you are here
├── CLAUDE.md                  ← the AI agent: role, workflow, output format
├── analysis/
│   ├── seasonality.py         ← seasonality + peak-reality analyzer (stdlib only)
│   ├── build_site_data.py     ← compiles data/*.csv (+ sample fill-in) into site/data.js
│   └── build_standalone.py    ← inlines data.js into one shareable HTML file
├── data/
│   ├── HOW-TO-DOWNLOAD.md     ← step-by-step Google Trends export guide
│   └── sample_multiTimeline.csv  ← synthetic sample so the script runs out of the box
├── site/
│   ├── index.html             ← shell — open it directly, no server needed
│   ├── app.js                 ← React UI (rendering only)
│   ├── analysis.js            ← the engine; mirrors analysis/seasonality.py
│   ├── icons.js               ← inlined Lucide glyphs
│   ├── vendor/                ← React, htm, Tailwind — vendored for offline use
│   ├── data.js                ← generated; do not hand-edit
│   └── demand-calendar-standalone.html  ← generated; one file to share
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
