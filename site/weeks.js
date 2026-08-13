/* Demand Calendar — week and holiday layer.
 *
 * Sits on top of analysis.js and reuses its thresholds, so a holiday can never
 * "land" on a bar the monthly classifier would have rejected. Mirrored by
 * analysis/holidays.py for the CLI.
 *
 * Hard limit worth knowing before reading any of this: Google Trends only
 * serves daily rows for ranges under ~9 months. Nothing here invents a daily
 * figure — day cells inherit their week's index, and the UI says so.
 */
"use strict";

/* =============================== holidays ================================= */
/* Dates are computed per year rather than hard-coded: most of these float, and
   a wrong date would silently attribute a lift to the wrong week. `tags` marks
   which categories a holiday is *claimed* to drive — the point is to test those
   claims, not to assume them. */

function nthWeekday(year, month, weekday, n) {   // month 1-12, weekday 0=Sun
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + shift + (n - 1) * 7));
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - shift));
}

function easterSunday(year) {                    // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, mo - 1, day));
}

const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

const HOLIDAY_CACHE = {};
function holidaysFor(year) {
  if (HOLIDAY_CACHE[year]) return HOLIDAY_CACHE[year];
  const tg = nthWeekday(year, 11, 4, 4);
  const L = [
    ["newyear",   "New Year's Day",   new Date(Date.UTC(year, 0, 1)),  ["divorces"],    "sparkles"],
    ["superbowl", "Super Bowl",       nthWeekday(year, 2, 0, 2),        ["vasectomies"], "target"],
    ["valentines","Valentine's Day",  new Date(Date.UTC(year, 1, 14)), ["marriages"],   "heart"],
    ["madness",   "March Madness",    addDays(nthWeekday(year, 3, 0, 2), 2), ["vasectomies"], "target"],
    ["easter",    "Easter",           easterSunday(year),               ["marriages"],   "sparkles"],
    ["mothers",   "Mother's Day",     nthWeekday(year, 5, 0, 2),        ["births"],      "baby"],
    ["memorial",  "Memorial Day",     lastWeekday(year, 5, 1),          ["marriages"],   "calendar-days"],
    ["fathers",   "Father's Day",     nthWeekday(year, 6, 0, 3),        ["births", "vasectomies"], "baby"],
    ["july4",     "Independence Day", new Date(Date.UTC(year, 6, 4)),  ["marriages"],   "sparkles"],
    ["labor",     "Labor Day",        nthWeekday(year, 9, 1, 1),        ["marriages"],   "calendar-days"],
    ["halloween", "Halloween",        new Date(Date.UTC(year, 9, 31)), [],              "calendar-days"],
    ["thanks",    "Thanksgiving",     tg,                               ["marriages"],   "calendar-days"],
    ["blackfri",  "Black Friday",     addDays(tg, 1),                   [],              "banknote"],
    ["cybermon",  "Cyber Monday",     addDays(tg, 4),                   [],              "banknote"],
    ["christmas", "Christmas Day",    new Date(Date.UTC(year, 11, 25)), ["marriages"],   "sparkles"],
    ["nye",       "New Year's Eve",   new Date(Date.UTC(year, 11, 31)), ["marriages"],   "sparkles"],
  ].map(([id, name, date, tags, icon]) => ({ id, name, date, tags, icon }))
   .sort((a, b) => a.date - b.date);
  HOLIDAY_CACHE[year] = L;
  return L;
}

const holidaysInMonth = (year, monthNo) =>
  holidaysFor(year).filter(h => h.date.getUTCMonth() + 1 === monthNo);

/* ---------------------- weekly index, within each year -------------------- */
/* Raw values are not comparable across years on a trending series, so each week
   is expressed against its own year's mean before anything is compared. */
function weeklyIndexByYear(weekly) {
  const byYear = {};
  weekly.dates.forEach((d, i) => {
    const y = d.getUTCFullYear();
    (byYear[y] ??= { weeks: {}, vals: [] });
    byYear[y].weeks[isoWeek(d)] = weekly.vals[i];
    byYear[y].vals.push(weekly.vals[i]);
  });
  const out = {};
  for (const y in byYear) {
    const m = mean(byYear[y].vals);
    if (!m || byYear[y].vals.length < 26) continue;   // skip ragged edge years
    out[y] = {};
    for (const w in byYear[y].weeks) out[y][w] = byYear[y].weeks[w] / m * 100;
  }
  return out;
}

/* Median week index across years, for one ISO week. */
function medianWeekIndex(idxByYear, week) {
  const w = ((week - 1) % 52 + 52) % 52 + 1;
  const vals = Object.keys(idxByYear).map(y => idxByYear[y][w])
    .filter(v => v !== undefined);
  return vals.length ? median(vals) : null;
}

/* Lift in the weeks running up to a holiday.
 *
 * Offsets are weeks relative to the holiday's own week: -4 is a month out, +1
 * the week after. Each offset takes the median across years, so one viral year
 * cannot manufacture a holiday effect, and counts how many years clear the bump
 * threshold. A holiday only "lands" when the median clears MILD_BUMP_INDEX and
 * repeats in at least CONSISTENCY_REQUIRED of years — the same bar the monthly
 * classifier uses, so the two can never disagree. */
const HOLIDAY_OFFSETS = [-4, -3, -2, -1, 0, 1];

function holidaySensitivity(weekly, holidayId) {
  if (!weekly) return null;
  const idx = weeklyIndexByYear(weekly);
  const years = Object.keys(idx);
  if (years.length < 3) return null;

  const per = {};
  for (const off of HOLIDAY_OFFSETS) {
    const vals = [];
    for (const y of years) {
      const h = holidaysFor(+y).find(x => x.id === holidayId);
      if (!h) continue;
      const w = ((isoWeek(h.date) - 1 + off) % 52 + 52) % 52 + 1;
      if (idx[y][w] !== undefined) vals.push(idx[y][w]);
    }
    if (vals.length < 3) continue;
    per[off] = { median: Math.round(median(vals) * 10) / 10, years: vals.length,
                 hits: vals.filter(v => v >= MILD_BUMP_INDEX).length };
  }
  const offs = Object.keys(per);
  if (!offs.length) return null;
  const bestOff = offs.reduce((a, b) => per[b].median > per[a].median ? b : a);
  const best = per[bestOff];
  const consistency = best.hits / best.years;
  return { holidayId, per, bestOffset: +bestOff, bestMedian: best.median,
           consistency, years: best.years,
           lands: best.median >= MILD_BUMP_INDEX && consistency >= CONSISTENCY_REQUIRED };
}

/* Best term in a category that has readable weekly rows. Prefers usable
   resolution over anything else — a squashed weekly series cannot date a week
   any more than it could date a month. */
function weeklyTermFor(catId) {
  const cat = CATS.find(c => c.id === catId);
  if (!cat) return null;
  let best = null;
  for (const t of cat.terms) {
    const a = getAnalysis(catId, t.name);
    if (!a.weekly) continue;
    const usable = a.weekly.resolution.usable;
    if (!best || (usable && !best.usable)) best = { name: t.name, a, usable };
  }
  return best;
}

/* ISO weeks overlapping a calendar month, with the days each contributes. */
function weeksInMonth(year, monthNo) {
  const last = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const seen = new Map();
  for (let day = 1; day <= last; day++) {
    const d = new Date(Date.UTC(year, monthNo - 1, day));
    const w = isoWeek(d);
    if (!seen.has(w)) seen.set(w, { week: w, days: [] });
    seen.get(w).days.push(d);
  }
  return [...seen.values()];
}

/* Split one month's dollars across its ISO weeks.
 *
 * Weights follow demand two weeks ahead of the spend — the same lead the monthly
 * allocator uses — so a week buys demand it can still influence. Month totals are
 * preserved exactly, keeping this consistent with the budget table above it. */
function weekSplitForMonth(weekly, monthNo, monthDollars, gamma, year) {
  const weeks = weeksInMonth(year, monthNo);
  if (!weeks.length) return [];
  if (!weekly) {
    const even = Math.floor(monthDollars / weeks.length);
    const out = weeks.map(w => ({ ...w, dollars: even, index: null }));
    out[0].dollars += monthDollars - even * weeks.length;
    return out;
  }
  const idx = weeklyIndexByYear(weekly);
  const at = w => medianWeekIndex(idx, w) ?? 100;
  const raw = weeks.map(w => Math.pow(Math.max(at(w.week + 2), 1) / 100, gamma));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const dollars = raw.map(v => Math.round(v / sum * monthDollars));
  const drift = monthDollars - dollars.reduce((a, b) => a + b, 0);
  if (drift) {
    let mi = 0;
    dollars.forEach((v, i) => { if (v > dollars[mi]) mi = i; });
    dollars[mi] += drift;
  }
  return weeks.map((w, i) => ({ ...w, dollars: dollars[i],
    index: Math.round(at(w.week) * 10) / 10 }));
}

/* Monthly spend weights derived from the weekly curve.
 *
 * A monthly index can hide the thing that matters most. "wedding venues" grades
 * December OFF-SEASON at 86, because weeks 49-50 are the year's floor at 74 —
 * yet week 52 is the year's ceiling at 140. Allocating from the month average
 * starves the single most valuable week of the year and pushes the money into
 * June instead. Where a readable weekly series exists it is simply the better
 * signal, so weights are built from it: each month scores the demand its weeks
 * can still influence, `leadWeeks` ahead of the spend.
 */
function monthWeightsFromWeekly(weekly, gamma, leadWeeks, year) {
  const idx = weeklyIndexByYear(weekly);
  if (!Object.keys(idx).length) return null;
  const at = w => medianWeekIndex(idx, w) ?? 100;
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const weeks = weeksInMonth(year, m);
    if (!weeks.length) return null;
    const vals = weeks.map(w =>
      Math.pow(Math.max(at(w.week + leadWeeks), 1) / 100, gamma));
    out.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/* Paid buys demand about two weeks out; content needs about a quarter to rank. */
const PAID_LEAD_WEEKS = 2, CONTENT_LEAD_WEEKS = 13;

function weeklyAllocationWeights(weekly, gamma, year) {
  if (!weekly || !weekly.resolution?.usable) return null;
  const paid = monthWeightsFromWeekly(weekly, gamma, PAID_LEAD_WEEKS, year);
  const content = monthWeightsFromWeekly(weekly, gamma, CONTENT_LEAD_WEEKS, year);
  return paid && content ? { paid, content } : null;
}

/* The year a marketing team would be planning: the next full calendar year. */
const PLANNING_YEAR = new Date().getUTCFullYear() + 1;
