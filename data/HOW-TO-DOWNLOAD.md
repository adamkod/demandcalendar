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
