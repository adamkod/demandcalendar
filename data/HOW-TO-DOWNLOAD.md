# Getting the data from Google Trends

1. Go to **https://trends.google.com/trends/explore**
2. Enter your first search term. Use the **"search term"** option (not "topic") so
   results are reproducible, and prefer generic terms ("running shoes") over brands.
3. To compare terms, click **+ Compare** and add up to 4 more (5 total). Terms
   downloaded *together* are scaled relative to each other — that's what makes them
   comparable. Terms downloaded separately are **not** comparable.
4. Set the filters above the chart:
   - **Region**: United States (or your target market)
   - **Time**: **Past 5 years**  ← required; this gives weekly data and enough
     years to test whether a peak repeats
   - **Category**: usually "All categories"; narrow it only if your term is
     ambiguous (e.g., "jaguar")
5. On the "Interest over time" chart, click the **download arrow (⬇)** in the
   top-right corner of that panel. You'll get `multiTimeline.csv`.
6. Save it into this `data/` folder. Rename it something meaningful, e.g.
   `fitness-terms-us-5yr.csv`.

Then run:

```
python analysis/seasonality.py data/fitness-terms-us-5yr.csv
```

## Give a small term its own export

Trends scales every term in a comparison against the largest one. Put "vasectomy"
next to "marriage" and it arrives squashed into a range of 4–20, where one integer
step is 20% of its own mean and the seasonal index is mostly rounding error. The
same term exported **alone** spans 43–100, where a step is 2% — the difference
between unreadable and trustworthy.

Rule of thumb: only compare terms within about 5× of each other in popularity.
Anything smaller gets its own file. The dashboard flags a term in orange when one
integer step exceeds 8% of its mean.

## Both file layouts work

You can drop in either:

- **A multi-term comparison export** (the normal way) — each term is matched to its
  category by name, so one file can feed several categories at once.
- **A single-category file** named `<category>--monthly.csv` or
  `<category>--weekly.csv`, which wins over any comparison file for the same term.

Files whose terms aren't recognised are ignored, so related-query lists and other
CSVs can sit in `data/` harmlessly. After adding files run
`py analysis/build_site_data.py`, then reload the page with **Ctrl+Shift+R** —
browsers cache `data.js` and a plain refresh shows the old build.

## Things to know about Trends data

- Values are a **relative index 0–100**, where 100 = the highest point *in your
  query*. It is not search volume. Never present it as volume.
- `<1` in the CSV means "very low, not zero" (the analyzer treats it as 0.5).
- The most recent week may be partial — a low final data point is usually that,
  not a demand collapse.
- If a term is too niche the chart will be spiky noise or mostly zero. Zoom out to
  a broader head term for the category.

`sample_multiTimeline.csv` in this folder is **synthetic** — it exists so the
pipeline runs before you've downloaded anything. Any output built from it must be
labeled SAMPLE.
