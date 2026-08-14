# Demand Calendar

Turns search-interest seasonality into an editorial and campaign calendar: **what to
publish, when to start, and which of the peaks everyone plans around don't survive
contact with the data.**

**[→ Live demo](https://adamkod.github.io/demandcalendar/)** · no install, works
offline, all data included

---

## What it found

Four categories that whole industries are built around — births, marriages, divorces,
vasectomies — tested against up to ten years of Google Trends data.

| The belief | The data |
|---|---|
| September baby boom | **Busted.** No month is reliably elevated |
| January is "Divorce Month" | **Busted.** January is the *weakest* month for `divorce lawyer` |
| June wedding season | **Mistimed.** June is +9% in half the years; July is +12% in *every* year |
| March Madness vasectomy rush | **Busted.** March reads +3%, no consistent pattern |

Three of four were false. The one real peak sits seven months from where the industry
spends: **`wedding venues` peaks in the week between Christmas and New Year's, +40% in
every year measured** — while the first week of December is that same term's annual
floor at −26%. Search goes from the bottom of its year to the top in three weeks, and
`engagement rings` peaks the week before, which is the mechanism: people get engaged over
the holidays and start shopping venues within days.

A tool that reported the busiest *month* would have missed all of that, because December
averages out to "off-season."

## What it does

- **Seasonality heatmap** — twelve months, four categories, each indexed to its own
  yearly average so rows can be read side by side
- **Month drill-down** — click any month for its weeks and days, with holidays marked and
  that month's budget split across its weeks
- **Holiday lift** — does Valentine's Day actually move wedding demand? (No.) Tests the
  four weeks around each holiday and reports the ones that hold up
- **Budget planner** — pick a job and a budget, get a month-by-month plan that spends
  *ahead* of demand, with a written rationale per month and CSV export
- **Editorial pipeline** — related queries sorted into what to write, reinforce, refresh
  and retire
- **Import** — any spreadsheet with dates in the first column; Trends is just what this
  was fed

## What was interesting to build

**Two implementations, kept in lockstep.** A Python CLI (`analysis/`) and a browser build
(`site/`) run the same analysis. They must agree; the rule is written into
[CLAUDE.md](CLAUDE.md) and verified term by term after every change.

**Refusing to answer is a feature.** The tool declines to date a campaign when the data
can't support one — flat curves, series too coarse to read, peaks that don't recur. Most
of the engineering went into the checks that produce those refusals.

**Five bugs the real data exposed**, each caught because a result looked wrong rather than
because a test failed:

- The anomaly floor was absolute, so on a term Google had squashed into single digits it
  silently required a 4× spike — the largest event in the dataset went unflagged
- The seasonal index pooled raw values, letting a secular trend masquerade as seasonality
  whenever the export didn't start in January
- The average-year curve used the mean, so one viral year became a permanent season
- Averaging the index across years let a single extreme year set the headline — and the
  budget allocator reads numbers, not labels, so it would have moved real money because
  of one court ruling
- The allocator worked off month averages, which hid the single best week of the year and
  put the budget in the wrong quarter

**No build step.** React, Tailwind and htm are vendored, so the app opens from a
`file://` URL and exports to one self-contained HTML file. A bundler would have broken
both.

## Stack

Python 3 (standard library only) · React 18 · Tailwind CSS · htm · Lucide · no Node
toolchain, no dependencies to install

## Running it

Open `site/index.html` — that's it. Nothing to install.

Python is needed only to re-run the analysis or rebuild after changing the data:

```
py analysis/seasonality.py data/<file>.csv     # seasonality + peak reality test
py analysis/holidays.py data/<weekly>.csv      # holiday lift by week offset
py analysis/build_site_data.py                 # data/*.csv -> site/data.js
py analysis/build_standalone.py                # one shareable HTML file
```

After a rebuild, hard-refresh with **Ctrl+Shift+R** — browsers cache `data.js`.

## Method

Marketing teams plan content around peaks they *believe* exist ("everyone searches for
grills in June"). Some of those peaks are real, some are mild bumps, and some are
folklore. Even when a peak is real, teams usually start publishing too late — SEO
content needs 8–12 weeks to rank, so publishing *at* the peak means missing it.


### The data

[Google Trends](https://trends.google.com/trends/explore) — free, weekly search-interest
index (0–100) for any term, downloadable as CSV. See
[data/HOW-TO-DOWNLOAD.md](data/HOW-TO-DOWNLOAD.md).

### What the week layer can and cannot do

- **Days are not measured.** Google Trends serves daily rows only for ranges under about
  nine months. Day cells inherit their ISO week's index and the UI says so; nothing here
  claims day-level precision.
- **Weekly data only exists where you exported it.** Holiday lift needs a *Past 5 years*
  weekly export of a term. Where that's missing — or where the series is too coarse to
  read — the app says so rather than guessing.

Colour never carries meaning alone: every category pairs its hue with a Lucide icon and a
text label, so the palette stays readable in greyscale and for colour-blind viewers.

## Project structure

```
demand-calendar/
├── README.md                  ← you are here
├── CLAUDE.md                  ← the AI agent: role, workflow, output format
├── analysis/
│   ├── seasonality.py         ← seasonality + peak-reality analyzer (stdlib only)
│   ├── holidays.py            ← holiday lift by week offset (mirrors site/weeks.js)
│   ├── build_site_data.py     ← compiles data/*.csv (+ sample fill-in) into site/data.js
│   └── build_standalone.py    ← inlines every local script into one shareable file
├── data/
│   ├── HOW-TO-DOWNLOAD.md     ← step-by-step Google Trends export guide
│   └── sample_multiTimeline.csv  ← synthetic sample so the script runs out of the box
├── site/
│   ├── index.html             ← shell — open it directly, no server needed
│   ├── app.js                 ← React UI (rendering only)
│   ├── analysis.js            ← the engine; mirrors analysis/seasonality.py
│   ├── weeks.js               ← holidays + week lift; mirrors analysis/holidays.py
│   ├── icons.js               ← inlined Lucide glyphs
│   ├── vendor/                ← React, htm, Tailwind — vendored for offline use
│   ├── data.js                ← generated; do not hand-edit
│   └── demand-calendar-standalone.html  ← generated; one file to share
└── output/                    ← generated calendars land here
```

### Budget model

Each month gets a weight of (seasonal index ÷ 100) raised to the concentration exponent, so
peaks pull budget super-proportionally. That weight is then shifted to buy *ahead* of demand:
paid spend in a month serves that month and the next (50/50), content spend serves demand
three months later. The two envelopes are normalized separately, blended by your content/paid
split, and rounded to whole dollars summing exactly to the budget. It allocates a fixed budget
across the year — it does not forecast revenue or ROI.

### Key concepts

- **Seasonal index**: average interest for a month ÷ overall average, ×100. An index
  of 140 means that month runs 40% above the yearly norm.
- **Peak reality test**: a "peak" only counts if (a) the index is meaningfully above
  baseline **and** (b) it shows up in most of the 5 years. A one-year spike (a viral
  moment) is not seasonality.
- **Ramp start**: the week interest first crosses halfway between baseline and peak.
  Publish SEO content 8–12 weeks *before* ramp start; launch paid campaigns 2–4 weeks
  before the peak itself.

## Contributing

Run Claude Code from inside the folder; it reads [CLAUDE.md](CLAUDE.md) automatically and
already knows the project's rules. Work on a branch rather than `main`:

```
git checkout -b your-name/what-youre-changing
```

Rebuild after touching `site/` or `data/`, then hard-refresh with **Ctrl+Shift+R**:

```
py analysis/build_site_data.py && py analysis/build_standalone.py
```

## Notes and limits

- Google Trends is a **relative index (0–100)** within each query — never search volume.
  Terms downloaded in separate exports are not comparable to each other.
- The budget planner allocates a fixed budget across the year. It is not a forecast and
  says nothing about ROI or revenue.
- No forecasting, deliberately. Four to five usable years of monthly data can't support a
  model that wouldn't mostly be fitting noise.
- The project started on soccer balls, which turned out to be a dead end — the seasonality
  was almost entirely World Cups. That exploration is still in `analysis/worldcup_split.py`
  and `output/`, and it's what motivated the one-off-versus-season test that the rest of
  the tool is built around.
