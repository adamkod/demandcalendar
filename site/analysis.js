/* Demand Calendar — analysis engine.
 *
 * Mirrors analysis/seasonality.py. Both must agree: if you change a threshold or
 * the allocation maths here, change it there too, or the CLI and the app will
 * report different numbers for the same data.
 *
 * Extracted verbatim from the pre-React build and verified to produce identical
 * output on all eight terms. Pure logic only — no DOM, no rendering.
 */

const PHASE_META = {
  publish: { label: "Publish window", cls: "p-publish",
    ed: t => `Publish SEO pillar pages &amp; guides targeting “${t}” now — they need 8–12 weeks to rank before demand arrives.`,
    camp: () => `No spend. Build retargeting audiences; refresh landing pages.` },
  ramp: { label: "Ramp", cls: "p-ramp",
    ed: t => `Ship supporting posts, email series, and social around “${t}”; refresh top pages.`,
    camp: () => `Warm email/social pushes; soft-launch paid 2–4 weeks before the peak.` },
  peak: { label: "PEAK", cls: "p-peak",
    ed: () => `Conversion-focused content only: comparisons, FAQs, offers.`,
    camp: () => `Full paid spend, monitored daily. Capture, don't educate.` },
  cool: { label: "Cool-down", cls: "p-cool",
    ed: () => `Wrap-ups and testimonials; harvest UGC while it's fresh.`,
    camp: () => `Cut spend fast — interest falls quicker than it rose. Retargeting only.` },
  second: { label: "Secondary bump", cls: "p-second",
    ed: t => `Lighter rerun of the peak playbook for “${t}”.`,
    camp: () => `Modest paid flight sized to the bump's index.` },
  off: { label: "Off-season", cls: "p-off",
    ed: () => `Evergreen content, refreshes, link building; plan the next cycle.`,
    camp: () => `Minimal always-on brand spend.` },
  steady: { label: "Steady", cls: "p-steady",
    ed: () => `Maintain cadence on evergreen topics.`,
    camp: () => `Efficiency-focused always-on spend.` },
};

/* ================= analysis (mirrors analysis/seasonality.py) ============= */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const REAL_PEAK_INDEX = 115, MILD_BUMP_INDEX = 107, OFF_SEASON_INDEX = 88,
      CONSISTENCY_REQUIRED = 0.6, RAMP_FRACTION = 0.5,
      ANOMALY_Z = 3.5, ANOMALY_FLOOR_FRAC = 0.30, ANOMALY_MIN_POINTS = 3,
      ANOMALY_RATIO = 1.5,
      MIN_RAMP_AMPLITUDE = 0.10,   // flatter than this and there is no ramp to date
      MIN_RESOLUTION_STEP_PCT = 8; // one integer step above this = rounding error

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function parseDates(iso) { return iso.map(s => {
  const p = s.split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] || 15)); }); }

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7) + 3);
  return Math.min(1 + Math.round((t - f) / 6048e5), 52);
}

function monthlyIndex(dates, values) {
  const byMonth = {}, byYM = {};
  dates.forEach((d, i) => {
    const m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
    (byMonth[m] ??= []).push(values[i]);
    ((byYM[y] ??= {})[m] ??= []).push(values[i]);
  });
  const perYear = {};
  for (const y in byYM) {
    const months = byYM[y];
    if (Object.keys(months).length < 10) continue;   // partial years at range edges
    const ym = mean(Object.values(months).flat());
    if (!ym) continue;
    perYear[y] = {};
    for (const m in months) perYear[y][m] = mean(months[m]) / ym * 100;
  }

  // Average the within-year indices rather than pooling raw values: pooling lets a
  // secular trend pose as seasonality whenever the window doesn't start in January
  // (a 2021-08..2026-08 export covers Jan-Jul in six years but Sep-Dec in five, so
  // a term that doubles mid-window gets a fake first-half peak). Pooled fallback
  // only when there aren't two complete years to average.
  // Median across years, matching weeklyCurve. The mean lets one extreme year set
  // the headline: Dobbs puts vasectomy's June 2022 at a within-year index of 166
  // against ~100 elsewhere, and the mean reads 117 — peak territory. The label
  // would still say INCONSISTENT, but this number drives the heatmap colour and
  // the budget allocator, and the allocator reads numbers, not labels.
  const index = {};
  const years = Object.keys(perYear);
  if (years.length >= 2) {
    for (let m = 1; m <= 12; m++) {
      const vals = years.filter(y => perYear[y][m] !== undefined)
                        .map(y => perYear[y][m]);
      if (vals.length) index[m] = median(vals);
    }
  } else {
    const overall = mean(values);
    if (overall)
      for (let m = 1; m <= 12; m++)
        if (byMonth[m]) index[m] = mean(byMonth[m]) / overall * 100;
  }
  return { index, perYear };
}

function classifyMonths({ index, perYear }) {
  const out = {};
  for (let m = 1; m <= 12; m++) {
    const idx = index[m];
    if (idx === undefined) continue;
    const yrs = Object.keys(perYear).filter(y => perYear[y][m] !== undefined);
    const peaked = yrs.filter(y => perYear[y][m] >= MILD_BUMP_INDEX);
    const cons = yrs.length ? peaked.length / yrs.length : 0;
    let label;
    if (idx >= REAL_PEAK_INDEX && cons >= CONSISTENCY_REQUIRED) label = "REAL PEAK";
    else if (idx >= MILD_BUMP_INDEX && cons >= CONSISTENCY_REQUIRED) label = "MILD BUMP";
    else if (idx >= MILD_BUMP_INDEX) label = "INCONSISTENT";
    else if (idx <= OFF_SEASON_INDEX) label = "OFF-SEASON";
    else label = "NO PEAK";
    out[m] = { index: Math.round(idx * 10) / 10, label, consistency: cons };
  }
  return out;
}

/* Median across years, not mean: one viral year would otherwise hand the average
   year a peak that only happened once (see the Dobbs spike in vasectomy). */
function weeklyCurve(dates, values) {
  const byWeek = {};
  dates.forEach((d, i) => (byWeek[isoWeek(d)] ??= []).push(values[i]));
  const raw = [];
  for (let w = 1; w <= 52; w++) raw.push(byWeek[w] ? median(byWeek[w]) : 0);
  return raw.map((_, i) =>
    mean([raw[(i + 51) % 52], raw[i], raw[(i + 1) % 52]]));
}

/* Returns defined:false when the curve is too flat to time against. On a flat
   series the argmax is just the noisiest week, and dating a ramp off it produces
   a confident "publish by" built from rounding error. */
function rampAndPeak(curve) {
  let peakI = 0;
  curve.forEach((v, i) => { if (v > curve[peakI]) peakI = i; });
  const med = median(curve);
  const amplitude = med ? (curve[peakI] - med) / med : 0;
  if (amplitude < MIN_RAMP_AMPLITUDE)
    return { defined: false, peakWeek: peakI + 1, amplitude };

  const sorted = [...curve].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(52 * .25)];
  const thr = baseline + RAMP_FRACTION * (curve[peakI] - baseline);
  let rampI = peakI;
  for (let s = 1; s < 52; s++) {
    const i = (peakI - s + 52) % 52;
    if (curve[i] < thr) { rampI = (i + 1) % 52; break; }
  }
  return { defined: true, peakWeek: peakI + 1, rampWeek: rampI + 1,
           leadWeeks: (peakI - rampI + 52) % 52, amplitude };
}

/* How coarse a term is on its export's shared 0-100 scale. Trends scales every
   term against the largest one, so a small term can land in single digits where
   one integer step swamps its own seasonality. */
function seriesResolution(values) {
  const m = mean(values);
  const stepPct = m ? 100 / m : Infinity;
  return { mean: Math.round(m * 10) / 10, distinct: new Set(values).size,
           stepPct: Math.round(stepPct * 10) / 10,
           usable: stepPct <= MIN_RESOLUTION_STEP_PCT };
}

/* Median+MAD anomaly test (same rationale as the Python version: with one
   observation per year, a spike inflates a mean/stdev test into never firing). */
function findAnomalies(dates, values, keyFn) {
  const byYear = {};
  dates.forEach((d, i) => (byYear[d.getUTCFullYear()] ??= []).push(values[i]));
  const overall = mean(values), yearMean = {};
  for (const y in byYear)
    yearMean[y] = byYear[y].length >= 6 ? mean(byYear[y]) : overall;

  const groups = {};
  dates.forEach((d, i) => {
    const det = yearMean[d.getUTCFullYear()]
      ? values[i] / yearMean[d.getUTCFullYear()] * overall : values[i];
    (groups[keyFn(d)] ??= []).push({ d, v: values[i], det });
  });

  // Floor scales with the series' own mean: a fixed 15-point floor demands a 4x
  // spike from a term Trends has squashed into single digits, and so never fires.
  const floor = Math.max(ANOMALY_MIN_POINTS, ANOMALY_FLOOR_FRAC * overall);
  const out = [];
  for (const k in groups) {
    const obs = groups[k];
    if (obs.length < 3) continue;
    const med = median(obs.map(o => o.det));
    const mad = median(obs.map(o => Math.abs(o.det - med)));
    for (const { d, v, det } of obs) {
      const gap = det - med;
      if (gap < floor || det < ANOMALY_RATIO * med) continue;
      if (mad > 0 && 0.6745 * gap / mad < ANOMALY_Z) continue;
      out.push({ date: d, value: v, typical: Math.round(med * 10) / 10 });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}

const REF_YEAR = 2026;
function weekToDate(w) {
  return new Date(Date.UTC(REF_YEAR, 0, 1 + (w - 1) * 7 + 3));
}
const fmtWeek = w => { const d = weekToDate(w);
  return `~${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const fmtDate = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const fmtMonthYear = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const wrapW = w => ((w - 1) % 52 + 52) % 52 + 1;

function analyzeTerm(term) {
  const a = { name: term.name };
  if (term.monthly) {
    const dates = parseDates(term.monthly.dates), vals = term.monthly.values;
    a.monthly = { dates, vals, source: term.monthly.source,
      months: classifyMonths(monthlyIndex(dates, vals)),
      resolution: seriesResolution(vals),
      anomalies: findAnomalies(dates, vals, d => d.getUTCMonth() + 1) };
  }
  if (term.weekly) {
    const dates = parseDates(term.weekly.dates), vals = term.weekly.values;
    const curve = weeklyCurve(dates, vals);
    a.weekly = { dates, vals, curve, source: term.weekly.source,
      resolution: seriesResolution(vals),
      ...rampAndPeak(curve),
      anomalies: findAnomalies(dates, vals, isoWeek) };
  }
  // Report the monthly series' resolution: it drives the seasonal index, the
  // heatmap and the budget. A term can now have a clean standalone monthly export
  // and a squashed weekly one left over from a comparison export.
  a.resolution = a.monthly?.resolution ?? a.weekly?.resolution ?? null;

  // a.timing is null when the data gives no season worth timing against. Every
  // consumer must handle that — inventing a date here is the failure mode this
  // whole tool exists to prevent.
  a.timing = null;
  // The weekly amplitude test measures shape; the monthly classifier tests
  // whether that shape recurs. A ramp stands only when both agree, so the site
  // can never date a campaign against a month it has just labelled NO PEAK.
  const peakMonthInfo = a.weekly?.defined
    ? a.monthly?.months?.[monthOfWeek(a.weekly.peakWeek)] : null;
  // A weekly series too coarse to read cannot date a ramp either.
  const weeklyTooCoarse = a.weekly?.defined && !a.weekly.resolution.usable;
  const weeklyVetoed = a.weekly?.defined && (weeklyTooCoarse || (a.monthly
    && !["REAL PEAK", "MILD BUMP"].includes(peakMonthInfo?.label)));
  if (weeklyVetoed) a.weeklyVeto = { label: peakMonthInfo?.label || "NO PEAK",
    peakWeek: a.weekly.peakWeek, amplitude: a.weekly.amplitude };

  if (a.weekly?.defined && !weeklyVetoed) {
    const w = a.weekly;
    a.timing = { precision: "week", peakWeek: w.peakWeek, rampWeek: w.rampWeek,
      leadWeeks: w.leadWeeks, publishWeek: wrapW(w.rampWeek - 8),
      paidWeek: wrapW(w.peakWeek - 3), amplitude: w.amplitude };
  } else if (!a.weekly && a.monthly) {
    // No weekly file: fall back to month precision. "Defined" borrows the
    // classifier's verdict, not a bare threshold, so a month that is only
    // elevated in a minority of years never becomes a campaign date.
    const idx = a.monthly.months;
    let peakM = 1;
    for (let m = 2; m <= 12; m++)
      if ((idx[m]?.index ?? 0) > (idx[peakM]?.index ?? 0)) peakM = m;
    if (["REAL PEAK", "MILD BUMP"].includes(idx[peakM]?.label))
      a.timing = { precision: "month", peakMonth: peakM,
        rampMonth: (peakM + 10) % 12 + 1 };
  }
  if (!a.timing) {
    let peakM = 1;
    const idx = a.monthly?.months || {};
    for (let m = 2; m <= 12; m++)
      if ((idx[m]?.index ?? 0) > (idx[peakM]?.index ?? 0)) peakM = m;
    a.noSeason = { highMonth: peakM,
      amplitude: a.weekly?.amplitude ?? null };
  }
  return a;
}


/* ============================ state & data ================================ */
const LS_IMPORT = "dc_import_v1", LS_ASSUMED = "dc_assumed_v1", LS_THEME = "dc_theme";
const store = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; }
                     catch { return {}; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function mergedData() {
  const overlay = store(LS_IMPORT);
  return DEMAND_DATA.categories.map(cat => {
    const terms = cat.terms.map(t => ({ ...t }));
    const extra = overlay[cat.id] || {};
    for (const name in extra) {
      let t = terms.find(x => x.name === name);
      if (!t) { t = { name }; terms.push(t); }
      if (extra[name].monthly) t.monthly = extra[name].monthly;
      if (extra[name].weekly) t.weekly = extra[name].weekly;
    }
    return { ...cat, terms };
  });
}

let CATS = mergedData();
let curCat = CATS[0].id;
const curTerm = {};   // per-category selected term
const analysisCache = {};

function getAnalysis(catId, termName) {
  const key = catId + "::" + termName;
  if (!analysisCache[key]) {
    const cat = CATS.find(c => c.id === catId);
    analysisCache[key] = analyzeTerm(cat.terms.find(t => t.name === termName));
  }
  return analysisCache[key];
}

function defaultTerm(cat) {
  // Most seasonal term makes the best default view — but resolution comes first.
  // A term Trends squashed into single digits shows a huge index spread made of
  // rounding steps, and would otherwise win this contest on pure noise.
  let best = cat.terms[0].name, bestKey = [-1, -1];
  for (const t of cat.terms) {
    const a = getAnalysis(cat.id, t.name);
    if (!a.monthly) continue;
    const idxs = Object.values(a.monthly.months).map(m => m.index);
    const spread = Math.max(...idxs) - Math.min(...idxs);
    const key = [a.resolution?.usable ? 1 : 0, spread];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      bestKey = key; best = t.name;
    }
  }
  return best;
}

function assumedFor(catId) {
  const saved = store(LS_ASSUMED);
  if (saved[catId]) return saved[catId];
  return CATS.find(c => c.id === catId).assumed || [];
}

/* ============================== verdicts ================================== */
function verdictFor(catId, assumption) {
  const cat = CATS.find(c => c.id === catId);
  const m = assumption.month;
  const near = x => Math.min(Math.abs(x - m), 12 - Math.abs(x - m));
  let confirmed = null, shifted = null, mild = null;
  for (const t of cat.terms) {
    const a = getAnalysis(catId, t.name);
    if (!a.monthly) continue;
    const months = a.monthly.months;
    const info = months[m];
    if (info?.label === "REAL PEAK" && !confirmed)
      confirmed = { term: t.name, info };
    // A neighbouring month counts as "you had the season, wrong month" if it is
    // a real peak, or a mild bump that shows up in nearly every year. The second
    // case matters: "wedding" bumps every single July, and telling someone their
    // June assumption is merely overrated would bury the one-month correction.
    for (let x = 1; x <= 12; x++) {
      const inf = months[x];
      if (!inf || near(x) === 0 || near(x) > 2) continue;
      const strong = inf.label === "REAL PEAK"
        || (inf.label === "MILD BUMP" && inf.consistency >= 0.75);
      if (strong && (!shifted || inf.index > shifted.info.index))
        shifted = { term: t.name, month: x, info: inf };
    }
    if (info?.label === "MILD BUMP" && !mild) mild = { term: t.name, info };
  }
  // A real peak somewhere else in the year is the most useful thing we can say
  // when the assumed month doesn't hold up — don't bury it.
  let elsewhere = null;
  for (const t of cat.terms) {
    const months = getAnalysis(catId, t.name).monthly?.months;
    if (!months) continue;
    for (let x = 1; x <= 12; x++)
      if (months[x]?.label === "REAL PEAK" && near(x) > 2
          && (!elsewhere || months[x].index > elsewhere.info.index))
        elsewhere = { term: t.name, month: x, info: months[x] };
  }
  const redirect = elsewhere
    ? ` The real peak is <b>${MONTHS[elsewhere.month - 1]}</b> — “${elsewhere.term}”
        index ${elsewhere.info.index}, in ${Math.round(elsewhere.info.consistency * 100)}%
        of years. Move the plan there.` : "";

  if (confirmed) return { v: "CONFIRMED", cls: "v-confirmed", glyph: "✓", color: "var(--good)",
    why: `“${confirmed.term}” peaks in ${MONTHS[m - 1]}: index ${confirmed.info.index}, in ${Math.round(confirmed.info.consistency * 100)}% of years.` };
  if (shifted) return { v: "MISTIMED", cls: "v-mistimed", glyph: "⇄", color: "var(--warning)",
    why: `The real peak is ${MONTHS[shifted.month - 1]}, not ${MONTHS[m - 1]} — “${shifted.term}” index ${shifted.info.index} there. Shift the plan.` };
  if (mild) return { v: "OVERRATED", cls: "v-overrated", glyph: "◐", color: "var(--serious)",
    why: `Only a mild bump for “${mild.term}” (index ${mild.info.index}). Worth a nod, not a campaign.${redirect}` };
  return { v: "BUSTED", cls: "v-busted", glyph: "✕", color: "var(--critical)",
    why: `No tracked term shows a real ${MONTHS[m - 1]} peak. Stop planning around this.${redirect}` };
}


function monthOfWeek(w) { return weekToDate(w).getUTCMonth() + 1; }

function buildPhases(a) {
  const phases = {};
  for (let m = 1; m <= 12; m++) phases[m] = "steady";
  const months = a.monthly?.months || {};
  for (let m = 1; m <= 12; m++)
    if (months[m]?.label === "OFF-SEASON") phases[m] = "off";
  const t = a.timing;
  if (!t) return phases;
  const paint = (fromW, toW, phase) => {   // inclusive weeks, circular
    for (let s = 0; s <= (toW - fromW + 52) % 52; s++)
      phases[monthOfWeek(wrapW(fromW + s))] = phase;
  };
  if (t.precision === "week") {
    paint(wrapW(t.peakWeek + 1), wrapW(t.peakWeek + 4), "cool");
    paint(wrapW(t.rampWeek - 12), wrapW(t.rampWeek - 1), "publish");
    paint(t.rampWeek, wrapW(t.peakWeek - 1), "ramp");
    phases[monthOfWeek(t.peakWeek)] = "peak";
  } else {
    phases[t.peakMonth] = "peak";
    phases[t.rampMonth] = "ramp";
    phases[(t.rampMonth + 10) % 12 + 1] = "publish";
    phases[t.peakMonth % 12 + 1] = "cool";
  }
  // Months that peak in the monthly data but sit outside the main ramp→peak arc.
  // A month inside the cool-down window that is itself a real peak is a second
  // peak, not a fade — calling it cool-down would cut spend during live demand.
  for (let m = 1; m <= 12; m++) {
    const label = months[m]?.label;
    if (["REAL PEAK", "MILD BUMP"].includes(label)
        && ["steady", "off"].includes(phases[m])) phases[m] = "second";
    else if (label === "REAL PEAK" && phases[m] === "cool") phases[m] = "second";
  }
  return phases;
}


/* ============================ budget planner ============================== */
const ROLES = [
  { id: "wedding-planner", label: "Wedding planner", cat: "marriages", budget: 100000, mix: 35 },
  { id: "venue", label: "Wedding venue or caterer", cat: "marriages", budget: 250000, mix: 30 },
  { id: "jeweler", label: "Jeweler / engagement rings", cat: "marriages", budget: 500000, mix: 25 },
  { id: "family-law", label: "Family law attorney", cat: "divorces", budget: 120000, mix: 45 },
  { id: "mediator", label: "Divorce mediation practice", cat: "divorces", budget: 60000, mix: 50 },
  { id: "urology", label: "Urology clinic (vasectomy)", cat: "vasectomies", budget: 80000, mix: 40 },
  { id: "mens-health", label: "Men's health telehealth", cat: "vasectomies", budget: 400000, mix: 35 },
  { id: "obgyn", label: "OB-GYN or fertility clinic", cat: "births", budget: 150000, mix: 45 },
  { id: "baby-brand", label: "Baby & maternity brand", cat: "births", budget: 1000000, mix: 30 },
  { id: "custom", label: "Something else — I'll pick the category", cat: "marriages",
    budget: 250000, mix: 35 },
];
const LS_BUDGET = "dc_budget_v1";
const wrapM = m => ((m - 1) % 12 + 12) % 12 + 1;
const fmtMoney = n => "$" + Math.round(n).toLocaleString("en-US");
const fmtCompact = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M"
  : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
const pct = f => (f * 100).toFixed(1) + "%";

function budgetState() {
  const s = store(LS_BUDGET);
  const role = ROLES.find(r => r.id === s.role) || ROLES[0];
  return { role: role.id, cat: s.cat || role.cat,
    budget: Number.isFinite(s.budget) ? s.budget : role.budget,
    mix: Number.isFinite(s.mix) ? s.mix : role.mix,
    conc: Number.isFinite(s.conc) ? s.conc : 25 };
}

function allocate(months, budget, contentShare, gamma) {
  const idx = m => months[wrapM(m)]?.index ?? 100;
  const w = m => Math.pow(Math.max(idx(m), 1) / 100, gamma);
  const paidRaw = [], contRaw = [];
  for (let m = 1; m <= 12; m++) {
    paidRaw.push(0.5 * w(m) + 0.5 * w(m + 1));   // paid leads demand by ~2–4 weeks
    contRaw.push(w(m + 3));                       // content ranks ~3 months later
  }
  const norm = arr => { const s = arr.reduce((a, b) => a + b, 0); return arr.map(v => v / s); };
  const p = norm(paidRaw), c = norm(contRaw), paidShare = 1 - contentShare;
  const fracs = [], dollars = [];
  for (let i = 0; i < 12; i++) {
    const f = paidShare * p[i] + contentShare * c[i];
    fracs.push(f); dollars.push(Math.round(f * budget));
  }
  const diff = budget - dollars.reduce((a, b) => a + b, 0);   // keep the sum exact
  if (diff !== 0) {
    let mi = 0;
    dollars.forEach((v, i) => { if (v > dollars[mi]) mi = i; });
    dollars[mi] += diff;
  }
  return { fracs, dollars, paid: p, content: c, paidShare, contentShare };
}

const PHASE_BUCKET = { peak: "peak", ramp: "ramp", second: "ramp", publish: "publish",
  cool: "base", off: "base", steady: "base" };
const BUCKET_LABEL = { peak: "Peak — heaviest flight", ramp: "Pre-peak ramp or second bump",
  publish: "Publish window (content)", base: "Cool-down, off-season & always-on" };

function reasonFor(m, alloc, months, phases) {
  const i = m - 1;
  const idxOf = mm => Math.round(months[wrapM(mm)]?.index ?? 100);
  const cPart = alloc.contentShare * alloc.content[i];
  const pPart = alloc.paidShare * alloc.paid[i];
  const served = idxOf(m + 1) > idxOf(m) ? m + 1 : m;
  let lead;
  switch (phases[m]) {
    case "peak": lead = `Peak demand (index ${idxOf(m)}). Heaviest paid flight of the year — capture intent, don't educate.`; break;
    case "ramp": lead = `Demand climbing. Dollars placed now land ahead of ${MONTHS[wrapM(served) - 1]} (index ${idxOf(served)}).`; break;
    case "publish": lead = `Publish window. Pages shipped now have time to rank before ${MONTHS[wrapM(m + 3) - 1]} demand (index ${idxOf(m + 3)}).`; break;
    case "cool": lead = `Post-peak cool-down (index ${idxOf(m)}). Interest falls faster than it rose — harvest, then cut.`; break;
    case "second": lead = `Secondary bump (index ${idxOf(m)}). Lighter rerun of the peak playbook.`; break;
    case "off": lead = `Off-season (index ${idxOf(m)}). Always-on floor only; use the quiet for evergreen work.`; break;
    default: lead = `Steady demand (index ${idxOf(m)}). Efficiency spend.`;
  }
  const tot = cPart + pPart;
  const split = tot > 0 && cPart > pPart
    ? `Content-led: ${pct(cPart / tot)} of this month's dollars.`
    : `Paid-led: ${tot > 0 ? pct(pPart / tot) : "0%"} of this month's dollars.`;
  return `${lead} ${split}`;
}


/* Rebuild CATS from data.js plus any browser-imported overlay, and drop the
   memoised analyses. Called by the UI after an import or reset. */
function refreshData() {
  CATS = mergedData();
  for (const k in analysisCache) delete analysisCache[k];
  return CATS;
}
