/* Demand Calendar — React UI.
 *
 * All numbers come from analysis.js, which mirrors analysis/seasonality.py.
 * This file renders; it must never compute a seasonal figure of its own.
 *
 * htm gives JSX-like syntax with no build step, because the project has to keep
 * opening from a file:// URL and exporting to one shareable HTML file.
 */
"use strict";
const { useState, useMemo, useCallback, useRef, useEffect } = React;
const html = htm.bind(React.createElement);

/* ------------------------------ design tokens ---------------------------- */
/* Each category's colour is always paired with an icon and a text label, so hue
   never carries meaning alone — the pastel palette stays readable for colour-
   blind viewers and in greyscale print. */
const THEME = {
  births:      { key: "births",      label: "Birth",       icon: "baby",
                 ink: "#9F1239", mid: "#F43F5E", soft: "#FFE4E6", edge: "#FECDD3",
                 ramp: ["#FFF1F2", "#FFE4E6", "#FECDD3", "#FDA4AF", "#FB7185", "#F43F5E"] },
  marriages:   { key: "marriages",   label: "Marriage",    icon: "heart",
                 ink: "#5B21B6", mid: "#8B5CF6", soft: "#EDE9FE", edge: "#DDD6FE",
                 ramp: ["#F5F3FF", "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6"] },
  divorces:    { key: "divorces",    label: "Divorce",     icon: "heart-crack",
                 ink: "#075985", mid: "#0EA5E9", soft: "#E0F2FE", edge: "#BAE6FD",
                 ramp: ["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9"] },
  vasectomies: { key: "vasectomies", label: "Vasectomies", icon: "stethoscope",
                 ink: "#92400E", mid: "#F59E0B", soft: "#FEF3C7", edge: "#FDE68A",
                 ramp: ["#FFFBEB", "#FEF3C7", "#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B"] },
};
const theme = id => THEME[id] || THEME.births;

/* Heatmap domain, fixed so every row is read on one scale. */
const HEAT_LO = 85, HEAT_HI = 122;
function heatColor(catId, index) {
  const r = theme(catId).ramp;
  const t = Math.max(0, Math.min(1, (index - HEAT_LO) / (HEAT_HI - HEAT_LO)));
  return r[Math.round(t * (r.length - 1))];
}

const CARD = "rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.10)]";
const CARD_HOVER = "transition-all duration-200 hover:shadow-[0_1px_2px_rgba(15,23,42,.05),0_16px_40px_-16px_rgba(15,23,42,.18)] hover:-translate-y-0.5";

/* -------------------------------- primitives ----------------------------- */
function Icon({ name, size = 16, className = "", style }) {
  const d = window.LUCIDE[name];
  if (!d) return null;
  return html`<svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    class=${"shrink-0 " + className} style=${style}
    dangerouslySetInnerHTML=${{ __html: d }} />`;
}

function Section({ eyebrow, title, sub, children, right }) {
  return html`
    <section class="mb-12">
      <div class="flex items-end justify-between gap-4 mb-4">
        <div>
          ${eyebrow && html`<div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">${eyebrow}</div>`}
          <h2 class="text-[19px] font-semibold text-slate-800 tracking-[-0.01em]">${title}</h2>
          ${sub && html`<p class="text-[13.5px] text-slate-500 mt-1 max-w-3xl leading-relaxed">${sub}</p>`}
        </div>
        ${right}
      </div>
      ${children}
    </section>`;
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return html`<div class="pointer-events-none fixed z-50 rounded-lg border border-[#E2E8F0]
      bg-white/95 backdrop-blur px-3 py-2 text-[12.5px] text-slate-700 shadow-lg max-w-xs"
      style=${{ left: tip.x + "px", top: tip.y + "px", transform: "translate(-50%,-115%)" }}
      dangerouslySetInnerHTML=${{ __html: tip.html }} />`;
}

/* --------------------------------- header -------------------------------- */
function Header({ view, setView, onImport }) {
  const tab = (id, label, icon) => html`
    <button onClick=${() => setView(id)}
      class=${"flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 "
        + (view === id ? "bg-slate-800 text-white shadow-sm"
                       : "text-slate-500 hover:text-slate-800 hover:bg-slate-100")}>
      <${Icon} name=${icon} size=${14} /> ${label}
    </button>`;
  return html`
    <header class="sticky top-0 z-40 border-b border-[#E2E8F0] bg-[#F8FAFC]/80 backdrop-blur-xl backdrop-saturate-150">
      <div class="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
        <div class="flex items-center gap-2.5">
          <div class="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-100 to-rose-100 text-slate-700 ring-1 ring-inset ring-white/60">
            <${Icon} name="calendar-days" size=${16} />
          </div>
          <div class="text-[15px] font-semibold tracking-[-0.01em] text-slate-800">Demand Calendar</div>
        </div>
        <nav class="ml-2 flex items-center gap-1">
          ${tab("calendar", "Calendar", "chart-column")}
          ${tab("budget", "Budget planner", "banknote")}
        </nav>
        <button onClick=${onImport}
          class="ml-auto rounded-full border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-600 shadow-sm transition-all duration-200 hover:border-slate-300 hover:text-slate-900 hover:shadow">
          Import Trends CSV
        </button>
      </div>
    </header>`;
}

/* ------------------------------- cameo ----------------------------------- */
/* A category's character crosses the screen when its pill is switched on.
   Decorative only — it announces nothing to screen readers, intercepts no
   clicks, and unmounts as soon as the traverse ends. */
const CAMEO = {
  births:      { icon: "baby",       size: 190 },
  marriages:   { icon: "heart",      size: 175 },
  divorces:    { icon: "heart-crack", size: 175 },
  vasectomies: { icon: "scissors",   size: 170 },
};

function Cameo({ run, onDone }) {
  if (!run) return null;
  const t = theme(run.id), c = CAMEO[run.id];
  if (!c) return null;
  return html`
    <div class="cameo-layer" aria-hidden="true">
      <div key=${run.n} class=${"cameo-travel cameo-" + run.id} onAnimationEnd=${onDone}>
        <span class="cameo-body" style=${{ color: t.mid, display: "block",
              filter: `drop-shadow(0 18px 28px ${t.edge})` }}>
          <${Icon} name=${c.icon} size=${c.size} className="opacity-90" />
        </span>
      </div>
    </div>`;
}

function Hero({ cats, active, toggle }) {
  return html`
    <div class="pt-12 pb-9">
      <h1 class="text-[40px] leading-[1.1] font-semibold tracking-[-0.03em] text-slate-800">
        The demand year,<br/><span class="text-slate-400">measured, not assumed.</span>
      </h1>
      <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-500">
        Up to ten years of Google Trends search interest across four life events, turned into
        an editorial and campaign calendar — what to publish, when to start, and which of the
        peaks everyone plans around don't survive contact with the data.
      </p>
      <div class="mt-7 flex flex-wrap items-center gap-2">
        ${cats.map(c => {
          const t = theme(c.id), on = active.includes(c.id);
          return html`
            <button key=${c.id} onClick=${() => toggle(c.id)} aria-pressed=${on}
              class=${"group flex items-center gap-2 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-all duration-200 active:scale-[0.97] "
                + (on ? "shadow-sm" : "border-[#E2E8F0] bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700")}
              style=${on ? { background: t.soft, borderColor: t.edge, color: t.ink } : undefined}>
              <${Icon} name=${t.icon} size=${15}
                style=${{ color: on ? t.mid : "#94A3B8" }}
                className="transition-transform duration-200 group-hover:scale-110" />
              ${t.label}
            </button>`;
        })}
        ${active.length < cats.length && html`
          <button onClick=${() => toggle("__all")}
            class="ml-1 text-[12.5px] font-medium text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline">
            Show all
          </button>`}
      </div>
    </div>`;
}

/* --------------------------- month drill-down ---------------------------- */
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthDetail({ catId, monthNo, onClose, setTip }) {
  const t = theme(catId);
  const cat = CATS.find(c => c.id === catId);
  const wt = weeklyTermFor(catId);
  const weekly = wt?.usable ? wt.a.weekly : null;
  const idx = useMemo(() => weekly ? weeklyIndexByYear(weekly) : null, [weekly]);
  const year = PLANNING_YEAR;

  const st = budgetState();
  const headline = defaultTerm(cat);
  const ha = getAnalysis(catId, headline);
  // Same weekly-aware weights the planner uses, so the drill-down agrees with it.
  const alloc = allocate(ha.monthly?.months || {}, st.budget, st.mix / 100, st.conc / 10,
    weeklyAllocationWeights(ha.weekly, st.conc / 10, year));
  const monthDollars = alloc.dollars[monthNo - 1];
  const split = weekSplitForMonth(weekly, monthNo, monthDollars, st.conc / 10, year);
  const hols = holidaysInMonth(year, monthNo);

  const weekIndex = d => idx ? medianWeekIndex(idx, isoWeek(d)) : null;
  const maxWeek = Math.max(...split.map(w => w.dollars), 1);

  // Lay the month out as calendar rows, padded to Monday starts.
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  const pad = (first.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const cells = [...Array(pad).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => new Date(Date.UTC(year, monthNo - 1, i + 1)))];

  return html`
    <div class=${CARD + " mt-3 overflow-hidden"}>
      <div class="flex flex-wrap items-center gap-3 border-b border-[#E2E8F0] px-5 py-4"
        style=${{ background: `linear-gradient(180deg, ${t.soft}55, transparent)` }}>
        <span class="grid h-8 w-8 place-items-center rounded-xl" style=${{ background: t.soft, color: t.mid }}>
          <${Icon} name=${t.icon} size=${16} />
        </span>
        <div>
          <div class="text-[15px] font-semibold text-slate-800">
            ${t.label} · ${MONTHS[monthNo - 1]} ${year}
          </div>
          <div class="text-[11.5px] text-slate-400">
            ${weekly ? `week detail from “${wt.name}”` : "no readable weekly data for this category"}
          </div>
        </div>
        <button onClick=${onClose}
          class="ml-auto rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800">
          Close
        </button>
      </div>

      <div class="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div class="mb-2 grid grid-cols-7 gap-1.5">
            ${DOW.map(d => html`
              <div key=${d} class="text-center text-[10.5px] font-medium uppercase tracking-wider text-slate-400">${d}</div>`)}
          </div>
          <div class="grid grid-cols-7 gap-1.5">
            ${cells.map((d, i) => {
              if (!d) return html`<div key=${"p" + i} />`;
              const wi = weekIndex(d);
              // Holidays collide — Valentine's Day and the Super Bowl share
              // 14 Feb 2027 — so a day can carry more than one.
              const dayHols = hols.filter(h => h.date.getTime() === d.getTime());
              const bg = wi == null ? "#F8FAFC" : heatColor(catId, wi);
              return html`
                <div key=${d.toISOString()}
                  onMouseMove=${e => setTip({ x: e.clientX, y: e.clientY, html:
                    `<b>${MONTHS[monthNo - 1]} ${d.getUTCDate()}, ${year}</b>`
                    + `<br/>ISO week ${isoWeek(d)}`
                    + (wi == null ? `<br/><span class="text-slate-400">no weekly data</span>`
                        : `<br/>week index <b>${Math.round(wi)}</b>`)
                    + dayHols.map(h => `<br/><b>${h.name}</b>`).join("") })}
                  onMouseLeave=${() => setTip(null)}
                  class=${"relative flex h-14 flex-col justify-between rounded-lg p-1.5 transition-all duration-150 "
                    + (dayHols.length ? "ring-2 ring-offset-1 ring-offset-white " : "")
                    + (wi == null ? "border border-dashed border-[#E2E8F0] " : "")
                    + "hover:scale-[1.05] hover:z-10"}
                  style=${{ background: bg, ...(dayHols.length ? { "--tw-ring-color": t.mid } : {}) }}>
                  <span class="text-[11px] font-semibold tabular-nums"
                    style=${{ color: wi == null ? "#94A3B8" : t.ink }}>${d.getUTCDate()}</span>
                  ${dayHols.length > 0 && html`
                    <span class="truncate text-[9px] font-semibold leading-tight" style=${{ color: t.ink }}
                      title=${dayHols.map(h => h.name).join(" · ")}>
                      ${dayHols[0].name}${dayHols.length > 1 ? ` +${dayHols.length - 1}` : ""}
                    </span>`}
                </div>`;
            })}
          </div>
          <p class="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            ${weekly
              ? html`Day tint is that day's <b>ISO week</b> index — Google Trends serves daily rows
                 only for ranges under about nine months, so nothing here claims day-level
                 precision. Ringed days are holidays.`
              : html`No readable weekly series for ${t.label.toLowerCase()}, so days are untinted.
                 Export this category's headline term at <b>Past 5 years</b> to fill this in.`}
          </p>
        </div>

        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Week by week
          </div>
          <div class="mt-3 space-y-2.5">
            ${split.map(w => {
              const share = w.dollars / (monthDollars || 1);
              return html`
                <div key=${w.week} class="group">
                  <div class="flex items-baseline justify-between text-[12px]">
                    <span class="font-medium text-slate-600">
                      Wk ${w.week}
                      <span class="text-slate-400"> · ${MONTHS[monthNo - 1]} ${w.days[0].getUTCDate()}–${w.days[w.days.length - 1].getUTCDate()}</span>
                    </span>
                    <span class="tabular-nums font-semibold text-slate-700">${fmtMoney(w.dollars)}</span>
                  </div>
                  <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div class="h-full rounded-full transition-all duration-300"
                      style=${{ width: (w.dollars / maxWeek * 100) + "%", background: t.mid }} />
                  </div>
                  <div class="mt-1 flex justify-between text-[10.5px] text-slate-400">
                    <span>${w.index == null ? "index n/a" : `week index ${w.index}`}</span>
                    <span>${pct(share)} of month</span>
                  </div>
                </div>`;
            })}
          </div>
          <p class="mt-3 text-[11px] leading-relaxed text-slate-400">
            ${fmtMoney(monthDollars)} for ${MONTHS[monthNo - 1]} at your current
            ${fmtCompact(st.budget)} plan, split by demand two weeks ahead of each week —
            spend buys demand it can still influence. Month total is unchanged.
          </p>
        </div>
      </div>

      ${hols.length > 0 && html`
        <div class="border-t border-[#E2E8F0] bg-slate-50/60 px-5 py-4">
          <div class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Holidays this month
          </div>
          <div class="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            ${hols.map(h => {
              const s = weekly ? holidaySensitivity(weekly, h.id) : null;
              const claimed = h.tags.includes(catId);
              return html`
                <div key=${h.id} class="rounded-xl border border-[#E2E8F0] bg-white p-3">
                  <div class="flex items-center gap-2">
                    <span class="grid h-6 w-6 place-items-center rounded-lg"
                      style=${{ background: t.soft, color: t.mid }}>
                      <${Icon} name=${h.icon} size=${12} />
                    </span>
                    <span class="text-[12.5px] font-semibold text-slate-700">${h.name}</span>
                    <span class="ml-auto text-[11px] tabular-nums text-slate-400">
                      ${MONTHS[monthNo - 1]} ${h.date.getUTCDate()}
                    </span>
                  </div>
                  <div class="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                    ${!s ? "No weekly data to test against."
                      : s.lands
                        ? html`<b class="text-emerald-700">Lands.</b> Peak lift
                            ${s.bestOffset === 0 ? "in the holiday week itself"
                              : s.bestOffset < 0 ? `${-s.bestOffset} week${s.bestOffset === -1 ? "" : "s"} before`
                              : "the week after"} —
                            index ${s.bestMedian}, in ${Math.round(s.consistency * 100)}% of
                            ${s.years} years. Pull budget forward to that week.`
                        : html`<b class="text-slate-600">No lift.</b> Best week reads
                            ${s.bestMedian} against a 100 baseline${s.bestMedian >= MILD_BUMP_INDEX
                              ? `, but only in ${Math.round(s.consistency * 100)}% of years` : ""}.
                            ${claimed ? " The claimed tie-in doesn't show up." : ""}`}
                  </div>
                </div>`;
            })}
          </div>
        </div>`}
    </div>`;
}

/* -------------------------------- heatmap -------------------------------- */
function Heatmap({ rows, setTip, openCell, setOpenCell }) {
  if (!rows.length) return html`
    <div class=${CARD + " grid place-items-center py-14 text-[13.5px] text-slate-400"}>
      Select a category above to see its year.
    </div>`;
  return html`
    <div class=${CARD + " overflow-hidden"}>
      <div class="overflow-x-auto">
        <div class="min-w-[720px] p-5">
          <div class="mb-2 grid grid-cols-[168px_repeat(12,1fr)] gap-x-1.5">
            <div />
            ${MONTHS.map(m => html`
              <div key=${m} class="text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">${m}</div>`)}
          </div>
          ${rows.map(row => {
            const t = theme(row.cat.id), months = row.a.monthly?.months || {};
            let peakM = 1;
            for (let m = 2; m <= 12; m++)
              if ((months[m]?.index ?? 0) > (months[peakM]?.index ?? 0)) peakM = m;
            return html`
              <div key=${row.cat.id} class="grid grid-cols-[168px_repeat(12,1fr)] items-center gap-x-1.5 py-1.5">
                <div class="pr-3">
                  <div class="flex items-center gap-2">
                    <span class="grid h-6 w-6 place-items-center rounded-lg"
                      style=${{ background: t.soft, color: t.mid }}>
                      <${Icon} name=${t.icon} size=${13} />
                    </span>
                    <span class="text-[13.5px] font-semibold text-slate-700">${t.label}</span>
                  </div>
                  <div class="mt-0.5 pl-8 text-[11.5px] text-slate-400 truncate">“${row.term}”</div>
                </div>
                ${MONTHS.map((mn, i) => {
                  const m = i + 1, info = months[m];
                  if (!info) return html`<div key=${mn} class="h-11 rounded-lg bg-slate-50" />`;
                  const real = info.label === "REAL PEAK";
                  const strong = real || info.label === "MILD BUMP";
                  const bg = heatColor(row.cat.id, info.index);
                  const open = openCell && openCell.catId === row.cat.id && openCell.monthNo === m;
                  const nHol = holidaysInMonth(PLANNING_YEAR, m).length;
                  return html`
                    <button key=${mn} type="button"
                      aria-expanded=${open}
                      aria-label=${`${t.label}, ${mn}: index ${info.index}, ${info.label}. Open week detail.`}
                      onClick=${() => setOpenCell(open ? null : { catId: row.cat.id, monthNo: m })}
                      onMouseMove=${e => setTip({ x: e.clientX, y: e.clientY, html:
                        `<b>${t.label} · ${mn}</b><br/><span class="text-slate-500">“${row.term}”</span>`
                        + `<br/>index <b>${info.index}</b> · ${info.label}`
                        + `<br/>present in ${Math.round(info.consistency * 100)}% of years`
                        + `<br/><span class="text-slate-400">click for weeks & holidays</span>` })}
                      onMouseLeave=${() => setTip(null)}
                      class=${"relative grid h-11 w-full place-items-center rounded-lg transition-all duration-150 cursor-pointer hover:scale-[1.06] hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 "
                        + (real || open ? "ring-2 ring-offset-1 ring-offset-white" : "")}
                      style=${{ background: bg,
                                ...(real || open ? { "--tw-ring-color": open ? "#334155" : t.mid } : {}) }}>
                      ${strong && html`
                        <span class="text-[11.5px] font-semibold tabular-nums" style=${{ color: t.ink }}>
                          ${Math.round(info.index)}
                        </span>`}
                      ${m === peakM && real && html`
                        <span class="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 rounded-[1px]"
                          style=${{ background: t.mid }} />`}
                      ${nHol > 0 && html`
                        <span class="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-[2px]">
                          ${Array.from({ length: Math.min(nHol, 3) }, (_, k) => html`
                            <span key=${k} class="h-[3px] w-[3px] rounded-full"
                              style=${{ background: t.ink, opacity: .45 }} />`)}
                        </span>`}
                    </button>`;
                })}
              </div>`;
          })}
          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E2E8F0] pt-3 text-[11.5px] text-slate-400">
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-6 rounded-full bg-gradient-to-r from-slate-100 to-slate-300" />
              cooler → hotter than that term's own average
            </span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rotate-45 rounded-[1px] bg-slate-400" /> real peak</span>
            <span class="flex items-center gap-1.5">
              <span class="flex gap-[2px]">
                ${[0, 1].map(k => html`<span key=${k} class="h-[3px] w-[3px] rounded-full bg-slate-400" />`)}
              </span>
              holidays that month
            </span>
            <span class="text-slate-500">click any month for weeks, days &amp; holiday lift</span>
          </div>
        </div>
      </div>
    </div>`;
}

/* ----------------------------- callout cards ----------------------------- */
/* Built from the analysis, never hand-written. A card can therefore say a peak
   is missing — which for three of these four categories is the finding. */
function buildCallouts(rows) {
  const out = [];
  for (const row of rows) {
    const t = theme(row.cat.id), months = row.a.monthly?.months || {};

    // Scan every term in the category, not just the headline one. December's
    // "engagement rings" peak is one of only two real peaks in the whole data
    // set and it is not the marriages headline term — reading the headline
    // alone would hide it.
    for (const term of row.cat.terms) {
      const ta = getAnalysis(row.cat.id, term.name);
      if (ta.resolution && !ta.resolution.usable) continue;   // rounding error, not a peak
      const tm = ta.monthly?.months || {};
      for (let m = 1; m <= 12; m++) {
        const info = tm[m];
        if (info?.label !== "REAL PEAK") continue;
        const tim = ta.timing;
        out.push({
          kind: "peak", cat: row.cat.id, rank: 0,
          tag: "Real peak", tagIcon: "circle-check",
          title: `${MONTHS[m - 1]} is when “${term.name}” peaks`,
          stat: `${Math.round(info.index)}`, statSub: "seasonal index",
          body: `It runs ${Math.round(info.index - 100)}% above its own yearly average every `
            + `${MONTHS[m - 1]}, in ${Math.round(info.consistency * 100)}% of the years on `
            + `record. `
            + (tim?.precision === "month"
              ? `Ramp begins ${MONTHS[(tim.peakMonth + 10) % 12]}; publish by `
                + `${MONTHS[(tim.peakMonth + 8) % 12]} so pages rank before demand arrives.`
              : tim ? `Ramp begins ${fmtWeek(tim.rampWeek)}; publish by `
                + `${fmtWeek(tim.publishWeek)}.` : ""),
        });
      }
      // One-off news events. Keep the biggest per term — they are the clearest
      // illustration of what this tool refuses to treat as seasonality.
      const an = (ta.monthly?.anomalies || [])
        .slice().sort((x, y) => y.value - x.value)[0];
      if (an) out.push({
        kind: "spike", cat: row.cat.id, rank: 1,
        tag: "One-off spike", tagIcon: "triangle-alert",
        title: `${fmtMonthYear(an.date)} — news, not a season`,
        stat: `${Math.round(an.value)}`, statSub: `vs ${an.typical} typical`,
        body: `“${term.name}” jumped to ${Math.round(an.value)} against a normal ${an.typical} `
          + `for that month. It happened once and never repeated, so it is excluded from the `
          + `calendar — planning against it would buy last year's news.`,
      });
    }

    for (const as of assumedFor(row.cat.id)) {
      const v = verdictFor(row.cat.id, as);
      if (v.v === "CONFIRMED") continue;
      out.push({
        kind: "myth", cat: row.cat.id, rank: v.v === "BUSTED" ? 2 : 1.5,
        tag: v.v, tagIcon: v.v === "BUSTED" ? "circle-x" : "circle-alert",
        title: as.name,
        stat: months[as.month] ? `${Math.round(months[as.month].index)}` : "—",
        statSub: `${MONTHS[as.month - 1]} index`,
        body: v.why.replace(/<[^>]+>/g, ""),
      });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function CalloutCards({ callouts }) {
  if (!callouts.length) return null;
  return html`
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      ${callouts.map((c, i) => {
        const t = theme(c.cat);
        const accent = c.kind === "peak" ? t.mid : c.kind === "spike" ? "#F59E0B" : "#94A3B8";
        const tone = c.kind === "peak" ? t.soft : c.kind === "spike" ? "#FEF3C7" : "#F1F5F9";
        return html`
          <article key=${i} class=${CARD + " " + CARD_HOVER + " group relative overflow-hidden p-5"}>
            <div class="absolute inset-x-0 top-0 h-[3px]" style=${{ background: accent, opacity: .8 }} />
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                style=${{ background: tone, color: c.kind === "myth" ? "#475569" : t.ink }}>
                <${Icon} name=${c.tagIcon} size=${12} /> ${c.tag}
              </span>
              <span class="ml-auto text-slate-300 transition-colors duration-200 group-hover:text-slate-400">
                <${Icon} name=${theme(c.cat).icon} size=${15} />
              </span>
            </div>
            <h3 class="mt-3 text-[15px] font-semibold leading-snug text-slate-800">${c.title}</h3>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-[30px] font-semibold leading-none tracking-[-0.02em]"
                style=${{ color: c.kind === "myth" ? "#94A3B8" : t.ink }}>${c.stat}</span>
              <span class="text-[12px] text-slate-400">${c.statSub}</span>
            </div>
            <p class="mt-3 text-[13px] leading-relaxed text-slate-500">${c.body}</p>
          </article>`;
      })}
    </div>`;
}

/* --------------------------- holiday sensitivity ------------------------- */
/* Answers "how close to the holiday, and does it move?" for every category that
   has readable weekly rows. A claimed tie-in that fails is shown, not hidden —
   those are the ones a plan is most likely to be built on. */
function HolidayPanel({ rows }) {
  const items = [];
  const untestable = [];
  for (const row of rows) {
    const wt = weeklyTermFor(row.cat.id);
    if (!wt || !wt.usable) {
      untestable.push({ cat: row.cat.id,
        why: !wt ? "no weekly export" : `weekly series too coarse (${wt.a.weekly.resolution.stepPct}% per step)` });
      continue;
    }
    for (const h of holidaysFor(PLANNING_YEAR)) {
      const s = holidaySensitivity(wt.a.weekly, h.id);
      if (!s) continue;
      const claimed = h.tags.includes(row.cat.id);
      if (!s.lands && !claimed) continue;
      items.push({ cat: row.cat.id, term: wt.name, h, s, claimed });
    }
  }
  items.sort((a, b) => (b.s.lands - a.s.lands) || (b.s.bestMedian - a.s.bestMedian));
  if (!items.length && !untestable.length) return null;

  const when = off => off === 0 ? "holiday week"
    : off < 0 ? `${-off} wk${off === -1 ? "" : "s"} before` : "week after";

  return html`
    <div class=${CARD + " overflow-hidden"}>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr class="border-b border-[#E2E8F0] text-left text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">
              <th class="px-5 py-3">Holiday</th><th class="py-3">Category</th>
              <th class="py-3">Strongest week</th><th class="py-3 text-right">Index</th>
              <th class="py-3 text-right">Years</th><th class="px-5 py-3">Verdict</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(({ cat, term, h, s, claimed }) => {
              const t = theme(cat);
              return html`
                <tr key=${cat + h.id} class="border-b border-[#F1F5F9] transition-colors last:border-0 hover:bg-slate-50/70">
                  <td class="px-5 py-3">
                    <span class="flex items-center gap-2 font-medium text-slate-700">
                      <${Icon} name=${h.icon} size=${14} className="text-slate-400" />
                      ${h.name}
                      <span class="text-[11px] tabular-nums font-normal text-slate-400">
                        ${MONTHS[h.date.getUTCMonth()]} ${h.date.getUTCDate()}
                      </span>
                    </span>
                  </td>
                  <td class="py-3">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                      style=${{ background: t.soft, color: t.ink }}>
                      <${Icon} name=${t.icon} size=${11} /> ${t.label}
                    </span>
                  </td>
                  <td class="py-3 text-slate-600">${when(s.bestOffset)}</td>
                  <td class="py-3 text-right tabular-nums font-semibold"
                    style=${{ color: s.lands ? t.ink : "#94A3B8" }}>${s.bestMedian}</td>
                  <td class="py-3 text-right tabular-nums text-slate-500">
                    ${Math.round(s.consistency * 100)}% of ${s.years}
                  </td>
                  <td class="px-5 py-3 text-[12.5px] leading-snug">
                    ${s.lands
                      ? html`<span class="font-semibold text-emerald-700">Lands.</span>
                          <span class="text-slate-500"> Shift budget into that week.</span>`
                      : html`<span class="font-semibold text-slate-500">No lift.</span>
                          <span class="text-slate-400">
                            ${claimed ? " Claimed tie-in doesn't show up in the data." : ""}</span>`}
                    <span class="block text-[11px] text-slate-400">measured on “${term}”</span>
                  </td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${untestable.length > 0 && html`
        <div class="flex gap-2.5 border-t border-[#E2E8F0] bg-amber-50/60 px-5 py-3 text-[12px] leading-relaxed text-amber-900">
          <${Icon} name="triangle-alert" size=${14} className="mt-0.5 text-amber-500" />
          <span>
            Not testable yet: ${untestable.map(u => `${theme(u.cat).label} (${u.why})`).join(", ")}.
            Holiday lift needs a <b>Past 5 years</b> weekly export of that category's headline term.
          </span>
        </div>`}
    </div>`;
}

/* --------------------------- editorial pipeline -------------------------- */
/* Answers the "what to publish" half of the brief. Related-query lists carry no
   dates, so this ranks and buckets topics but never dates one — the deadline
   comes from the parent term's own timing. */
const BUCKETS = {
  write:   { label: "Write these",     icon: "sparkles",      ink: "#059669", bg: "#ECFDF5",
             blurb: "Rising fast, still small. New demand before the field crowds in.",
             when: t => t ? `Ship before ${t.publishBy}.` : "Ship on an evergreen cadence." },
  double:  { label: "Double down",     icon: "trending-up",   ink: "#2563EB", bg: "#EFF6FF",
             blurb: "Already big and still growing. Refresh, expand, add depth.",
             when: t => t ? `Live and updated by ${t.publishBy}.` : "Keep current year-round." },
  refresh: { label: "Refresh",         icon: "zap",           ink: "#D97706", bg: "#FFFBEB",
             blurb: "Large but slipping. The page exists and is losing ground.",
             when: () => "Off-season work — use the quiet months." },
  retire:  { label: "Retire or merge", icon: "trending-down", ink: "#94A3B8", bg: "#F8FAFC",
             blurb: "Small and shrinking. Stop spending effort here.",
             when: () => "No deadline. Consolidate into stronger pages." },
};

function TopicPipeline({ rows }) {
  const [openBucket, setOpenBucket] = useState(null);
  const withTopics = rows.filter(r => r.cat.topics?.topics?.length);
  if (!withTopics.length) return html`
    <div class=${CARD + " flex gap-3 p-5 text-[13px] leading-relaxed text-slate-500"}>
      <${Icon} name="info" size=${16} className="mt-0.5 text-slate-400" />
      <span>No related-query lists loaded for the selected categories. On the Trends
        page, scroll to <b>Related queries</b>, switch between <b>Top</b> and
        <b>Rising</b>, and download each — then save them into <code>data/</code> as
        <code>related-queries-&lt;term&gt;-top.csv</code> and
        <code>-rising.csv</code>.</span>
    </div>`;

  return html`
    <div class="space-y-4">
      ${withTopics.map(row => {
        const t = theme(row.cat.id), pack = row.cat.topics;
        const parent = getAnalysis(row.cat.id, pack.term);
        const tim = parent.timing;
        const publishBy = tim
          ? (tim.precision === "week" ? fmtWeek(tim.publishWeek)
                                      : MONTHS[(tim.rampMonth + 9) % 12])
          : null;
        const deadline = publishBy ? { publishBy } : null;
        const groups = ["write", "double", "refresh", "retire"]
          .map(b => [b, pack.topics.filter(x => x.bucket === b)])
          .filter(([, list]) => list.length);
        return html`
          <div key=${row.cat.id} class=${CARD + " overflow-hidden"}>
            <div class="flex flex-wrap items-center gap-2.5 border-b border-[#E2E8F0] px-5 py-4"
              style=${{ background: `linear-gradient(180deg, ${t.soft}55, transparent)` }}>
              <span class="grid h-8 w-8 place-items-center rounded-xl"
                style=${{ background: t.soft, color: t.mid }}>
                <${Icon} name=${t.icon} size=${16} />
              </span>
              <div>
                <div class="text-[15px] font-semibold text-slate-800">
                  ${t.label} — ${pack.topics.length} topics from “${pack.term}”
                </div>
                <div class="text-[11.5px] text-slate-400">
                  ${publishBy
                    ? `Everything in "Write these" has to be live by ${publishBy} to rank for the peak.`
                    : "No season for this term — publish on a steady cadence."}
                </div>
              </div>
            </div>

            <div class="grid gap-px bg-[#E2E8F0] sm:grid-cols-2 lg:grid-cols-4">
              ${groups.map(([b, list]) => {
                const B = BUCKETS[b], open = openBucket === row.cat.id + b;
                const shown = open ? list : list.slice(0, 5);
                return html`
                  <div key=${b} class="bg-white p-4">
                    <div class="flex items-center gap-2">
                      <span class="grid h-6 w-6 place-items-center rounded-lg"
                        style=${{ background: B.bg, color: B.ink }}>
                        <${Icon} name=${B.icon} size=${13} />
                      </span>
                      <span class="text-[13px] font-semibold text-slate-700">${B.label}</span>
                      <span class="ml-auto text-[15px] font-semibold tabular-nums"
                        style=${{ color: B.ink }}>${list.length}</span>
                    </div>
                    <p class="mt-2 text-[11.5px] leading-relaxed text-slate-400">${B.blurb}</p>
                    <p class="mt-1 text-[11.5px] font-medium" style=${{ color: B.ink }}>
                      ${B.when(deadline)}
                    </p>
                    <ol class="mt-3 space-y-1.5">
                      ${shown.map((q, i) => html`
                        <li key=${q.query} class="group flex items-baseline gap-2 text-[12px]">
                          <span class="w-4 shrink-0 text-right tabular-nums text-slate-300">${i + 1}</span>
                          <span class="min-w-0 flex-1 truncate text-slate-600 group-hover:text-slate-900"
                            title=${q.query}>${q.query}</span>
                          <span class="shrink-0 tabular-nums text-[11px] font-medium"
                            style=${{ color: q.change > 0 ? B.ink : "#94A3B8" }}>
                            ${q.change > 0 ? "+" : ""}${Math.round(q.change)}%
                          </span>
                        </li>`)}
                    </ol>
                    ${list.length > 5 && html`
                      <button onClick=${() => setOpenBucket(open ? null : row.cat.id + b)}
                        class="mt-2.5 text-[11.5px] font-medium text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline">
                        ${open ? "Show fewer" : `Show all ${list.length}`}
                      </button>`}
                  </div>`;
              })}
            </div>

            <div class="flex gap-2.5 border-t border-[#E2E8F0] bg-slate-50/60 px-5 py-3 text-[11.5px] leading-relaxed text-slate-400">
              <${Icon} name="info" size=${13} className="mt-0.5 shrink-0" />
              <span>Related-query lists have no dates, so topics are <b>ranked and bucketed,
                not individually scheduled</b>. They all serve the same peak; the deadline above
                is the parent term's. Percentages are Trends' own change figures.</span>
            </div>
          </div>`;
      })}
    </div>`;
}

/* ------------------------------ scoreboard ------------------------------- */
function Scoreboard({ cats }) {
  const counts = { CONFIRMED: 0, MISTIMED: 0, OVERRATED: 0, BUSTED: 0 };
  for (const c of cats) for (const as of assumedFor(c.id)) counts[verdictFor(c.id, as).v]++;
  const meta = {
    CONFIRMED: ["#059669", "#ECFDF5", "circle-check", "held up"],
    MISTIMED:  ["#D97706", "#FFFBEB", "circle-alert", "real, wrong month"],
    OVERRATED: ["#EA580C", "#FFF7ED", "minus", "a bump, not a peak"],
    BUSTED:    ["#E11D48", "#FFF1F2", "circle-x", "no peak in the data"],
  };
  return html`
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${Object.keys(counts).map(k => {
        const [ink, bg, icon, blurb] = meta[k];
        return html`
          <div key=${k} class=${CARD + " " + CARD_HOVER + " p-4"}>
            <div class="flex items-center gap-2">
              <span class="grid h-7 w-7 place-items-center rounded-lg" style=${{ background: bg, color: ink }}>
                <${Icon} name=${icon} size=${15} />
              </span>
              <span class="text-[32px] font-semibold leading-none tracking-[-0.02em]" style=${{ color: ink }}>${counts[k]}</span>
            </div>
            <div class="mt-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-slate-600">${k}</div>
            <div class="text-[12px] text-slate-400">${blurb}</div>
          </div>`;
      })}
    </div>`;
}

/* ------------------------------ mini charts ------------------------------ */
function MonthlyBars({ row, setTip }) {
  const t = theme(row.cat.id), months = row.a.monthly?.months || {};
  const vals = Object.values(months).map(m => m.index);
  if (!vals.length) return null;
  const max = Math.max(125, ...vals), min = Math.min(80, ...vals);
  const h = 132, base = v => ((v - min) / (max - min)) * (h - 26);
  return html`
    <div class="flex h-[132px] items-end gap-[3px]">
      ${MONTHS.map((mn, i) => {
        const info = months[i + 1];
        if (!info) return html`<div key=${mn} class="flex-1" />`;
        const strong = ["REAL PEAK", "MILD BUMP"].includes(info.label);
        return html`
          <div key=${mn} class="group flex flex-1 flex-col items-center justify-end gap-1"
            onMouseMove=${e => setTip({ x: e.clientX, y: e.clientY,
              html: `<b>${mn}</b> · index ${info.index}<br/>${info.label} · ${Math.round(info.consistency * 100)}% of years` })}
            onMouseLeave=${() => setTip(null)}>
            <div class="w-full max-w-[22px] rounded-t-[4px] transition-all duration-200 group-hover:opacity-80"
              style=${{ height: Math.max(base(info.index), 3) + "px",
                        background: strong ? t.mid : t.edge }} />
            <span class="text-[9.5px] font-medium text-slate-400">${mn[0]}</span>
          </div>`;
      })}
    </div>`;
}

function Sparkline({ row }) {
  const t = theme(row.cat.id);
  const src = row.a.monthly || row.a.weekly;
  if (!src) return null;
  const v = src.vals, n = v.length, max = Math.max(...v), min = Math.min(...v);
  const W = 260, H = 40;
  const pts = v.map((y, i) => [i / (n - 1) * W, H - ((y - min) / (max - min || 1)) * (H - 6) - 3]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return html`
    <svg viewBox=${`0 0 ${W} ${H}`} class="h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d=${d + ` L ${W} ${H} L 0 ${H} Z`} fill=${t.soft} opacity="0.7" />
      <path d=${d} fill="none" stroke=${t.mid} stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>`;
}

/* --------------------------- category detail ----------------------------- */
function CategoryCard({ row, setTip }) {
  const t = theme(row.cat.id), a = row.a, res = a.resolution;
  const timing = a.timing;
  const stat = (label, value, note) => html`
    <div>
      <div class="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">${label}</div>
      <div class="mt-0.5 text-[17px] font-semibold text-slate-800">${value}</div>
      ${note && html`<div class="text-[11.5px] text-slate-400">${note}</div>`}
    </div>`;
  return html`
    <article class=${CARD + " " + CARD_HOVER + " overflow-hidden"}>
      <div class="flex items-center gap-2.5 border-b border-[#E2E8F0] px-5 py-4"
        style=${{ background: `linear-gradient(180deg, ${t.soft}55, transparent)` }}>
        <span class="grid h-8 w-8 place-items-center rounded-xl" style=${{ background: t.soft, color: t.mid }}>
          <${Icon} name=${t.icon} size=${16} />
        </span>
        <div>
          <div class="text-[15px] font-semibold text-slate-800">${t.label}</div>
          <div class="text-[11.5px] text-slate-400">“${row.term}”</div>
        </div>
        <span class=${"ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] "
            + (timing ? "" : "bg-slate-100 text-slate-500")}
          style=${timing ? { background: t.soft, color: t.ink } : undefined}>
          ${timing ? "Seasonal" : "No season"}
        </span>
      </div>
      <div class="px-5 pt-4"><${Sparkline} row=${row} /></div>
      <div class="grid grid-cols-3 gap-3 px-5 py-4">
        ${timing
          ? [stat("Peak", timing.precision === "week" ? fmtWeek(timing.peakWeek) : MONTHS[timing.peakMonth - 1]),
             stat("Ramp", timing.precision === "week" ? fmtWeek(timing.rampWeek) : MONTHS[timing.rampMonth - 1]),
             stat("Publish by", timing.precision === "week" ? fmtWeek(timing.publishWeek)
                    : MONTHS[(timing.rampMonth + 9) % 12])]
          : [stat("Peak", "None", "no month reliably hotter"),
             stat("Ramp", "—", "nothing to lead"),
             stat("Publish", "Any time", "evergreen cadence")]}
      </div>
      <div class="px-5 pb-5"><${MonthlyBars} row=${row} setTip=${setTip} /></div>
      ${!timing && a.weeklyVeto && html`
        <div class="mx-5 mb-5 flex gap-2.5 rounded-xl border border-[#E2E8F0] bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-500">
          <${Icon} name="info" size=${15} className="mt-px text-slate-400" />
          <span>The average year <i>does</i> rise
            ${Math.round((a.weeklyVeto.amplitude || 0) * 100)}% into
            ${fmtWeek(a.weeklyVeto.peakWeek)} — but ${a.weeklyVeto.label}. Markers are
            withheld rather than dating a campaign against noise.</span>
        </div>`}
      ${res && !res.usable && html`
        <div class="mx-5 mb-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
          <${Icon} name="triangle-alert" size=${15} className="mt-px text-amber-500" />
          <span><b>Low resolution.</b> “${row.term}” averages ${res.mean} on this export's shared
            0–100 scale with only ${res.distinct} distinct values — one step is ${res.stepPct}% of its
            mean, so the index is largely rounding error. Re-export it on its own.</span>
        </div>`}
    </article>`;
}

/* ---------------------------- budget planner ----------------------------- */
function Slider({ label, value, min, max, step, onChange, hint, display }) {
  return html`
    <div>
      <div class="flex items-baseline justify-between">
        <label class="text-[12px] font-medium text-slate-500">${label}</label>
        <span class="text-[12.5px] font-semibold text-slate-700">${display}</span>
      </div>
      <input type="range" min=${min} max=${max} step=${step} value=${value}
        onInput=${e => onChange(+e.target.value)}
        class="mt-2 w-full accent-violet-500" />
      <p class="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">${hint}</p>
    </div>`;
}

function BudgetView({ cats, setTip }) {
  const [st, setSt] = useState(() => budgetState());
  const patch = p => { const next = { ...st, ...p }; save(LS_BUDGET, next); setSt(next); };
  const role = ROLES.find(r => r.id === st.role) || ROLES[0];
  const catId = role.id === "custom" ? st.cat : role.cat;
  const cat = cats.find(c => c.id === catId) || cats[0];
  const term = defaultTerm(cat);
  const a = getAnalysis(cat.id, term);
  const months = a.monthly?.months || {};
  const phases = buildPhases(a);
  // Prefer the weekly curve where it exists — a month average can hide the best
  // week of the year, which for "wedding venues" is exactly what happens.
  const wWeights = useMemo(
    () => weeklyAllocationWeights(a.weekly, st.conc / 10, PLANNING_YEAR),
    [a.weekly, st.conc]);
  const alloc = allocate(months, st.budget, st.mix / 100, st.conc / 10, wWeights);
  const t = theme(cat.id);
  const [budgetText, setBudgetText] = useState(st.budget.toLocaleString("en-US"));
  useEffect(() => { setBudgetText(st.budget.toLocaleString("en-US")); }, [st.role]);

  const PH_TONE = { peak: t.mid, ramp: t.edge, second: t.edge, publish: t.soft,
                    cool: "#F1F5F9", off: "#F1F5F9", steady: "#F1F5F9" };
  const max = Math.max(...alloc.dollars, 1);

  // Demand per month, from the same signal that drove the allocation — otherwise
  // the chart and the table would argue with the plan sitting next to them.
  const demandIdx = useMemo(() => {
    const fallback = MONTHS.map((_, i) => months[i + 1]?.index ?? 100);
    if (!wWeights) return fallback;
    const raw = monthWeightsFromWeekly(a.weekly, 1, 0, PLANNING_YEAR);
    return raw ? raw.map(v => Math.round(v * 1000) / 10) : fallback;
  }, [wWeights, months, a.weekly]);

  // Spend share and demand share are both "% of the annual total", so they share
  // one axis honestly — and the gap is the point: spend sits left of demand.
  const idxSum = demandIdx.reduce((s, v) => s + v, 0) || 1;
  const demandShare = demandIdx.map(v => v / idxSum);
  const peakDemandM = demandShare.indexOf(Math.max(...demandShare));
  const peakSpendM = alloc.fracs.indexOf(Math.max(...alloc.fracs));
  // Signed, so spend landing *after* demand reads as late rather than as an
  // eleven-month head start.
  let leadMonths = (peakDemandM - peakSpendM + 12) % 12;
  if (leadMonths > 6) leadMonths -= 12;
  // Draw demand at week resolution where we have it. Averaging it back up to
  // months would erase the very thing that justifies the plan: "wedding venues"
  // spends its December on one enormous week, and a December month-average of 99
  // makes the heaviest spend of the year look unmotivated.
  //
  // Weekly shares are scaled to a month-equivalent (x 52/12) so both series read
  // as "share of the annual total per month" — a flat year puts both at 8.3%.
  const demandCurve = useMemo(() => {
    const idx = wWeights ? weeklyIndexByYear(a.weekly) : null;
    if (!idx || !Object.keys(idx).length) return null;
    const wk = [];
    for (let w = 1; w <= 52; w++) wk.push(medianWeekIndex(idx, w) ?? 100);
    const sum = wk.reduce((x, y) => x + y, 0) || 1;
    return wk.map((v, i) => ({ x: (i + 0.5) / 52, share: (v / sum) * (52 / 12) }));
  }, [wWeights, a.weekly]);

  // One shared ceiling so the spend bars and the demand line are read together.
  const chartMax = Math.max(...alloc.fracs, ...demandShare,
    ...(demandCurve ? demandCurve.map(p => p.share) : [])) * 1.1;

  const q = [0, 1, 2, 3].map(k => alloc.fracs.slice(k * 3, k * 3 + 3).reduce((x, y) => x + y, 0));
  const qd = [0, 1, 2, 3].map(k => alloc.dollars.slice(k * 3, k * 3 + 3).reduce((x, y) => x + y, 0));

  const csv = () => {
    const rows = [["Month", "Phase", "Share", "Spend (USD)", "Demand index", "Rationale"]];
    for (let m = 1; m <= 12; m++)
      rows.push([MONTHS[m - 1], PHASE_META[phases[m]].label, pct(alloc.fracs[m - 1]),
                 alloc.dollars[m - 1], demandIdx[m - 1].toFixed(1),
                 reasonFor(m, alloc, months, phases)]);
    const text = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const el = document.createElement("a");
    el.href = url; el.download = `demand-calendar-${cat.id}-${role.id}.csv`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return html`
    <div class="pt-10">
      <h1 class="text-[32px] font-semibold tracking-[-0.025em] text-slate-800">Budget planner</h1>
      <p class="mt-2.5 max-w-2xl text-[14.5px] leading-relaxed text-slate-500">
        Tell it your job and your budget. It returns a month-by-month plan that buys ahead of
        demand instead of chasing it — content earliest, paid latest.
      </p>

      <!-- hero band -->
      <div class="relative mt-7 overflow-hidden rounded-2xl border border-[#E2E8F0] p-6 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-16px_rgba(15,23,42,.14)]"
        style=${{ background: `linear-gradient(135deg, ${t.soft} 0%, #FFFFFF 45%, ${t.soft}66 100%)` }}>
        <div class="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-30 blur-3xl"
          style=${{ background: t.mid }} />
        <div class="relative flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style=${{ color: t.ink }}>
              <${Icon} name=${t.icon} size=${13} /> ${t.label} · ${role.label}
            </div>
            <div class="mt-1 text-[46px] font-semibold leading-none tracking-[-0.03em] text-slate-800">
              ${fmtMoney(st.budget)}
            </div>
            <div class="mt-1.5 text-[12.5px] text-slate-500">annual budget, allocated across 12 months</div>
          </div>
          <div class="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <div class="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">Heaviest month</div>
              <div class="mt-0.5 text-[22px] font-semibold text-slate-800">${MONTHS[peakSpendM]}</div>
              <div class="text-[11.5px] text-slate-400">${fmtMoney(alloc.dollars[peakSpendM])} · ${pct(alloc.fracs[peakSpendM])}</div>
            </div>
            <div>
              <div class="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">Demand peaks</div>
              <div class="mt-0.5 text-[22px] font-semibold text-slate-800">
                ${a.timing ? (a.timing.precision === "week" ? fmtWeek(a.timing.peakWeek).replace("~", "")
                                                            : MONTHS[a.timing.peakMonth - 1]) : "No season"}
              </div>
              <div class="text-[11.5px] text-slate-400">
                ${!a.timing ? "flat demand, level spend"
                  : leadMonths === 0 ? "spend lands in the peak month"
                  : leadMonths > 0 ? `spend leads it by ${leadMonths} month${leadMonths === 1 ? "" : "s"}`
                  : `spend trails it by ${-leadMonths} month${leadMonths === -1 ? "" : "s"}`}
              </div>
            </div>
            <div>
              <div class="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">Split</div>
              <div class="mt-0.5 text-[22px] font-semibold text-slate-800">${st.mix}<span class="text-[15px] text-slate-400">/${100 - st.mix}</span></div>
              <div class="text-[11.5px] text-slate-400">content / paid</div>
            </div>
          </div>
        </div>

        <!-- allocation ribbon: the whole year at a glance -->
        <div class="relative mt-6">
          <div class="flex h-9 gap-[2px] overflow-hidden rounded-lg">
            ${alloc.fracs.map((f, i) => {
              const ph = phases[i + 1];
              return html`
                <div key=${i} class="group relative grid place-items-center transition-all duration-200 hover:brightness-95"
                  style=${{ flexGrow: Math.max(f, 0.001), background: PH_TONE[ph],
                            minWidth: "8px" }}
                  onMouseMove=${e => setTip({ x: e.clientX, y: e.clientY,
                    html: `<b>${MONTHS[i]}</b> — ${fmtMoney(alloc.dollars[i])}<br/>`
                      + `${pct(f)} of budget · ${PHASE_META[ph].label}` })}
                  onMouseLeave=${() => setTip(null)}>
                  <span class="text-[10px] font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style=${{ color: ph === "peak" ? "#fff" : t.ink }}>${MONTHS[i][0]}</span>
                </div>`;
            })}
          </div>
          <div class="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wider text-slate-400">
            <span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span>
          </div>
        </div>
      </div>

      <div class=${CARD + " mt-7 p-5"}>
        <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="text-[12px] font-medium text-slate-500">What's your job?</label>
            <select value=${st.role} onChange=${e => {
                const r = ROLES.find(x => x.id === e.target.value);
                patch({ role: r.id, cat: r.cat, budget: r.budget, mix: r.mix });
              }}
              class="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[13.5px] text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100">
              ${ROLES.map(r => html`<option key=${r.id} value=${r.id}>${r.label}</option>`)}
            </select>
          </div>
          ${role.id === "custom" && html`
            <div>
              <label class="text-[12px] font-medium text-slate-500">Category</label>
              <select value=${catId} onChange=${e => patch({ cat: e.target.value })}
                class="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[13.5px] text-slate-700 shadow-sm">
                ${cats.map(c => html`<option key=${c.id} value=${c.id}>${theme(c.id).label}</option>`)}
              </select>
            </div>`}
          <div>
            <label class="text-[12px] font-medium text-slate-500">Annual budget</label>
            <div class="mt-2 flex items-center rounded-xl border border-[#E2E8F0] bg-white shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <span class="pl-3 text-slate-400">$</span>
              <input value=${budgetText} inputMode="numeric"
                onInput=${e => setBudgetText(e.target.value)}
                onBlur=${() => { const n = Math.max(0, Math.round(Number(budgetText.replace(/[^0-9.]/g, "")) || 0));
                                 patch({ budget: n }); setBudgetText(n.toLocaleString("en-US")); }}
                onKeyDown=${e => { if (e.key === "Enter") e.target.blur(); }}
                class="w-full bg-transparent px-2 py-2 text-[13.5px] tabular-nums text-slate-700 outline-none" />
            </div>
          </div>
          <${Slider} label="Content & SEO share" value=${st.mix} min=${0} max=${70} step=${5}
            display=${st.mix + "%"} onChange=${v => patch({ mix: v })}
            hint="The rest goes to paid. Content spend lands ~3 months before the demand it serves; paid lands just ahead of it." />
          <${Slider} label="Concentration" value=${st.conc} min=${10} max=${40} step=${5}
            display=${st.conc / 10 <= 1.5 ? "Even" : st.conc / 10 <= 2.5 ? "Balanced" : st.conc / 10 <= 3.2 ? "Aggressive" : "All-in"}
            onChange=${v => patch({ conc: v })}
            hint="How hard to push budget into peak months versus spreading it evenly." />
        </div>

        <div class="mt-5 flex gap-3 rounded-xl border-l-[3px] p-4 text-[13px] leading-relaxed"
          style=${{ borderColor: t.mid, background: t.soft + "44" }}>
          <${Icon} name=${a.timing ? "target" : "info"} size=${16}
            className="mt-0.5" style=${{ color: t.mid }} />
          <div class="text-slate-600">
            ${a.timing
              ? html`As a <b>${role.label.toLowerCase()}</b>, your demand is
                  <b>${t.label.toLowerCase()}</b>, read through “${term}”. Interest peaks in
                  <b>${a.timing.precision === "week" ? fmtWeek(a.timing.peakWeek) : MONTHS[a.timing.peakMonth - 1]}</b>,
                  so the plan front-loads spend into the months <i>before</i> that.`
              : html`As a <b>${role.label.toLowerCase()}</b>, your demand is
                  <b>${t.label.toLowerCase()}</b>, read through “${term}”.
                  <b>This category has no season.</b> The plan below is close to even by design —
                  a flat budget is the right answer to flat demand, and the month-to-month wobble
                  you see is the model tracking noise, not opportunity.`}
            ${a.resolution && !a.resolution.usable && html`
              <div class="mt-2 font-medium text-amber-700">
                ⚠ “${term}” is low-resolution (one step = ${a.resolution.stepPct}% of its mean).
                Re-export it alone before trusting these numbers.
              </div>`}
          </div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${qd.map((v, k) => html`
          <div key=${k} class=${CARD + " " + CARD_HOVER + " p-4"}>
            <div class="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">
              Q${k + 1} · ${MONTHS[k * 3]}–${MONTHS[k * 3 + 2]}
            </div>
            <div class="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-slate-800">${fmtCompact(v)}</div>
            <div class="text-[12px] text-slate-400">${pct(q[k])} of budget</div>
          </div>`)}
      </div>

      <div class=${CARD + " mt-4 p-5"}>
        <div class="flex items-baseline justify-between">
          <h2 class="text-[15px] font-semibold text-slate-800">${fmtMoney(st.budget)} across the year</h2>
          <button onClick=${csv}
            class="rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-900">
            Download CSV
          </button>
        </div>
        <p class="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          Bars are spend, the line is demand${demandCurve ? " week by week" : ""} — both as a
          share of their own annual total per month, so a flat year puts each at 8.3%.
          ${a.timing
            ? html`The bars should sit <b>to the left of</b> the line: that gap is the plan
                buying ahead of demand rather than chasing it.`
            : html`With no season, both run flat — there is nothing to lead.`}
        </p>

        <div class="relative mt-5 h-[200px]">
          <!-- gridlines -->
          ${[0, .25, .5, .75, 1].map(g => html`
            <div key=${g} class="absolute inset-x-0 border-t border-[#F1F5F9]"
              style=${{ bottom: (26 + g * 150) + "px" }} />`)}
          <div class="absolute inset-x-0 bottom-[26px] border-t border-[#E2E8F0]" />

          <!-- demand line, drawn over the bars -->
          <svg class="pointer-events-none absolute inset-x-0" style=${{ bottom: "26px", height: "150px" }}
            viewBox="0 0 1200 150" preserveAspectRatio="none" aria-hidden="true">
            <path d=${(demandCurve
                ? demandCurve.map((p, i) =>
                    (i ? "L" : "M") + (p.x * 1200).toFixed(1) + " "
                    + (150 - (p.share / chartMax) * 150).toFixed(1))
                : demandShare.map((v, i) =>
                    (i ? "L" : "M") + (50 + i * 100) + " "
                    + (150 - (v / chartMax) * 150).toFixed(1))).join(" ")}
              fill="none" stroke=${t.ink} stroke-width="2" stroke-linejoin="round"
              stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.85" />
          </svg>

          <div class="absolute inset-0 flex items-end gap-1.5">
            ${alloc.dollars.map((v, i) => html`
              <div key=${i} class="group relative flex flex-1 flex-col items-center justify-end"
                onMouseMove=${e => setTip({ x: e.clientX, y: e.clientY,
                  html: `<b>${MONTHS[i]}</b> — ${fmtMoney(v)}<br/>`
                    + `spend ${pct(alloc.fracs[i])} · demand ${pct(demandShare[i])}<br/>`
                    + `<span class="text-slate-500">${PHASE_META[phases[i + 1]].label}</span>` })}
                onMouseLeave=${() => setTip(null)}>
                <span class="mb-1 text-[10.5px] font-semibold tabular-nums text-slate-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  ${fmtCompact(v)}
                </span>
                <div class="w-full max-w-[38px] rounded-t-[5px] transition-all duration-200 group-hover:brightness-95"
                  style=${{ height: Math.max((alloc.fracs[i] / chartMax) * 150, 4) + "px",
                            background: PH_TONE[phases[i + 1]] }} />
                <span class="mt-1.5 h-[16px] text-[10.5px] font-medium text-slate-400">${MONTHS[i]}</span>
              </div>`)}
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#E2E8F0] pt-3 text-[11.5px] text-slate-400">
          ${[["peak", "Peak — heaviest flight"], ["ramp", "Pre-peak ramp"],
             ["publish", "Publish window"], ["steady", "Cool-down & always-on"]].map(([k, lbl]) => html`
            <span key=${k} class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-[3px]" style=${{ background: PH_TONE[k] }} /> ${lbl}
            </span>`)}
          <span class="flex items-center gap-1.5">
            <span class="h-[2px] w-5 rounded-full" style=${{ background: t.ink }} /> demand
          </span>
        </div>
      </div>

      <div class=${CARD + " mt-4 overflow-hidden"}>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr class="border-b border-[#E2E8F0] text-left text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">
                <th class="px-5 py-3">Month</th><th class="py-3">Phase</th>
                <th class="px-3 py-3 text-right">Share</th>
                <th class="px-3 py-3 text-right">Spend</th>
                <th class="px-3 py-3 text-right">Demand</th>
                <th class="px-5 py-3">Why this number</th>
              </tr>
            </thead>
            <tbody>
              ${MONTHS.map((mn, i) => {
                const m = i + 1, ph = phases[m];
                return html`
                  <tr key=${mn} class="border-b border-[#F1F5F9] transition-colors last:border-0 hover:bg-slate-50/70">
                    <td class="px-5 py-3 font-semibold text-slate-700">${mn}</td>
                    <td class="py-3">
                      <span class="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                        <span class="h-2.5 w-2.5 rounded-[3px]" style=${{ background: PH_TONE[ph] }} />
                        ${PHASE_META[ph].label}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-right tabular-nums text-slate-500">${pct(alloc.fracs[i])}</td>
                    <td class="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">${fmtMoney(alloc.dollars[i])}</td>
                    <td class="px-3 py-3 text-right tabular-nums text-slate-500">${demandIdx[i].toFixed(1)}</td>
                    <td class="px-5 py-3 text-[12.5px] leading-relaxed text-slate-500">${reasonFor(m, alloc, months, phases)}</td>
                  </tr>`;
              })}
            </tbody>
            <tfoot>
              <tr class="border-t border-[#E2E8F0] bg-slate-50/60 font-semibold text-slate-700">
                <td class="px-5 py-3">Total</td><td/>
                <td class="px-3 py-3 text-right tabular-nums">100.0%</td>
                <td class="px-3 py-3 text-right tabular-nums">${fmtMoney(st.budget)}</td>
                <td/><td class="px-5 py-3 text-[12px] font-normal text-slate-400">
                  ${t.label} · “${term}” · ${role.label}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>`;
}

/* --------------------------------- import -------------------------------- */
const unq = s => s.trim().replace(/^"|"$/g, "").trim();

/* Split one CSV row, respecting quoted fields. A plain split(",") turns the
   "$1,200" a spreadsheet exports into two cells and reads it as 1 — silently
   wrong by three orders of magnitude, which is worse than refusing the file. */
function splitCSVLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/* Accept a date in the shapes a spreadsheet actually produces, and return it
   normalised to YYYY-MM-DD. Returns null when the cell isn't a date at all,
   which is how the header row is found. */
function parseDateCell(raw) {
  const s = unq(raw || "");
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);          // 2024-07 / 2024-07-15
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${(m[3] || "01").padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);          // 07/15/2024
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);                      // Jul 2024
  if (m) {
    const i = MONTHS.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}-01`;
  }
  return null;
}

/* Reads a Google Trends export *or* any spreadsheet with dates in the first
   column and numbers after it — bookings, sales, ticket counts. Both speakers
   pitch that second case, so it has to actually work: the header row is found by
   looking for the first row whose first cell is a date, not by matching Trends'
   own column names. */
function parseSeriesCSVText(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map(splitCSVLine);
  const firstData = rows.findIndex(r => parseDateCell(r[0]) !== null);
  if (firstData < 1)
    throw new Error("No dated rows found. The first column needs dates "
      + "(2024-07-15, 07/15/2024 or Jul 2024) and numbers in the columns after it.");

  const header = rows[firstData - 1];
  const names = header.slice(1)
    .map((c, i) => unq(c).split(":")[0].trim() || `Series ${i + 1}`);
  if (!names.length) throw new Error("Found dates but no value columns beside them.");

  const dates = [], cols = names.map(() => []);
  for (const r of rows.slice(firstData)) {
    const d = parseDateCell(r[0]);
    if (!d) continue;
    dates.push(d);
    names.forEach((_, i) => {
      const v = unq(r[i + 1] || "");
      cols[i].push(v === "<1" ? 0.5 : (parseFloat(v.replace(/[$,%\s]/g, "")) || 0));
    });
  }
  if (dates.length < 24)
    throw new Error(`Only ${dates.length} rows of data. Seasonality needs at least `
      + "two years so it can check whether a pattern repeats.");

  const gap = (new Date(dates[1]) - new Date(dates[0])) / 864e5;
  if (gap > 0 && gap < 5)
    throw new Error("This looks like daily data, which is too noisy to read a season "
      + "from. Roll it up to weekly or monthly first.");
  const granularity = gap <= 10 ? "weekly" : "monthly";
  return { granularity, terms: names.map((n, i) => ({ name: n, dates, values: cols[i] })) };
}

function ImportDialog({ cats, open, onClose, onDone }) {
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null);
  const [catId, setCatId] = useState(cats[0].id);
  if (!open) return null;
  return html`
    <div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/25 p-5 backdrop-blur-sm" onClick=${onClose}>
      <div class=${CARD + " w-full max-w-lg p-6"} onClick=${e => e.stopPropagation()}>
        <h2 class="text-[17px] font-semibold text-slate-800">Import your own data</h2>
        <p class="mt-2 text-[13px] leading-relaxed text-slate-500">
          Any spreadsheet with <b>dates in the first column</b> and numbers beside them —
          bookings, sales, ticket counts, web traffic — or a Google Trends export
          (trends.google.com → “Interest over time” → ⬇). Weekly or monthly, at least two
          years so a pattern can be shown to repeat. Granularity is detected automatically.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <select value=${catId} onChange=${e => setCatId(e.target.value)}
            class="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[13.5px] text-slate-700 shadow-sm">
            ${cats.map(c => html`<option key=${c.id} value=${c.id}>${theme(c.id).label}</option>`)}
          </select>
          <input type="file" accept=".csv,text/csv" class="text-[13px] text-slate-600"
            onChange=${async e => {
              const f = e.target.files[0]; if (!f) return;
              try {
                const p = parseSeriesCSVText(await f.text());
                setPending({ p, name: f.name });
                setMsg({ ok: true, text: `Detected ${p.granularity} data · ${p.terms[0].dates.length} rows `
                  + `(${p.terms[0].dates[0]} → ${p.terms[0].dates.at(-1)}) · terms: `
                  + p.terms.map(t => t.name).join(", ") });
              } catch (err) { setPending(null); setMsg({ ok: false, text: err.message }); }
            }} />
        </div>
        ${msg && html`
          <div class=${"mt-4 rounded-xl p-3 text-[12.5px] leading-relaxed "
            + (msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>${msg.text}</div>`}
        <div class="mt-5 flex justify-end gap-2">
          <button onClick=${() => { forget(LS_IMPORT); onDone(); }}
            class="rounded-full px-3.5 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-800">
            Reset imports
          </button>
          <button onClick=${onClose}
            class="rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-medium text-slate-600 hover:border-slate-300">
            Cancel
          </button>
          <button disabled=${!pending}
            onClick=${() => {
              const overlay = store(LS_IMPORT);
              overlay[catId] ??= {};
              for (const t of pending.p.terms) {
                overlay[catId][t.name] ??= {};
                overlay[catId][t.name][pending.p.granularity] = {
                  source: `${pending.name} (imported ${new Date().toISOString().slice(0, 10)})`,
                  dates: t.dates, values: t.values };
              }
              save(LS_IMPORT, overlay); onDone();
            }}
            class="rounded-full bg-slate-800 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-slate-900 disabled:opacity-40">
            Import
          </button>
        </div>
      </div>
    </div>`;
}

/* ----------------------------------- app --------------------------------- */
function App() {
  const [view, setView] = useState("calendar");
  const [nonce, setNonce] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [tip, setTip] = useState(null);
  const [openCell, setOpenCell] = useState(null);
  const cats = useMemo(() => { refreshData(); return CATS; }, [nonce]);
  const [active, setActive] = useState(cats.map(c => c.id));

  // The cameo fires only when a category is switched *on* by its own pill —
  // not on "Show all", which would send four characters across at once, and not
  // on switch-off, where a victory lap makes no sense. `n` retriggers the CSS
  // animation when the same pill is clicked twice.
  const [cameo, setCameo] = useState(null);
  const cameoN = useRef(0);
  // Mirror the selection in a ref. Reading `active` straight from the closure
  // goes stale between two clicks in the same render, which silently swallows
  // the cameo on a quick off-then-on; the ref is current the moment we click.
  const activeRef = useRef(active);
  activeRef.current = active;
  const toggle = id => {
    if (id === "__all") {
      activeRef.current = cats.map(c => c.id);
      setActive(activeRef.current);
      return;
    }
    const on = activeRef.current.includes(id);
    if (on && activeRef.current.length === 1) return;      // never empty the board
    activeRef.current = on ? activeRef.current.filter(x => x !== id)
                           : [...activeRef.current, id];
    setActive(activeRef.current);
    if (!on) setCameo({ id, n: ++cameoN.current });
  };

  const rows = useMemo(() => cats.filter(c => active.includes(c.id)).map(c => {
    const term = defaultTerm(c);
    return { cat: c, term, a: getAnalysis(c.id, term) };
  }), [cats, active, nonce]);

  const callouts = useMemo(() => buildCallouts(rows), [rows]);
  const sample = rows.some(r => [r.a.monthly?.source, r.a.weekly?.source]
    .filter(Boolean).some(s => s.startsWith("SAMPLE")));

  return html`
    <div class="min-h-screen bg-[#F8FAFC] text-slate-700 antialiased">
      <${Header} view=${view} setView=${setView} onImport=${() => setImportOpen(true)} />
      <main class="mx-auto max-w-6xl px-6 pb-24">
        ${view === "calendar" ? html`
          <${Hero} cats=${cats} active=${active} toggle=${toggle} />
          ${sample && html`
            <div class="mb-8 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
              <${Icon} name="triangle-alert" size=${17} className="mt-px text-amber-500" />
              <span><b>Sample data.</b> One or more categories are showing synthetic series —
                import real Google Trends exports before drawing conclusions.</span>
            </div>`}

          <${Section} eyebrow="Seasonality" title="Twelve months, four life events"
            sub=${html`Each row is one category's headline search term, indexed against its own
                 yearly average — so 100 is normal for that term and rows can be read side by
                 side. <b class="text-slate-600">Click any month</b> to open its weeks, days and
                 holidays.`}>
            <${Heatmap} rows=${rows} setTip=${setTip}
              openCell=${openCell} setOpenCell=${setOpenCell} />
            ${openCell && html`
              <${MonthDetail} key=${openCell.catId + openCell.monthNo}
                catId=${openCell.catId} monthNo=${openCell.monthNo}
                onClose=${() => setOpenCell(null)} setTip=${setTip} />`}
          <//>

          <${Section} eyebrow="Findings" title="What the data actually says"
            sub="Generated from the analysis, not written by hand — which is why some of these
                 cards report a peak that isn't there.">
            <${CalloutCards} callouts=${callouts} />
          <//>

          <${Section} eyebrow="Editorial" title="What to publish"
            sub=${html`Rising and top related queries, sorted into what to write, what to
                 reinforce, what to refresh and what to drop. The deadline comes from the
                 parent term's own timing — <b class="text-slate-600">content has to be live
                 before the ramp</b>, not during it.`}>
            <${TopicPipeline} rows=${rows} />
          <//>

          <${Section} eyebrow="Holidays" title="Does the holiday actually move demand?"
            sub=${html`For every category with readable weekly data, the strongest week in the
                 month around each holiday — measured as a median across years, so one unusual
                 year can't invent an effect. Claimed tie-ins are listed
                 <b class="text-slate-600">even when they fail</b>, because those are the ones
                 plans get built on.`}>
            <${HolidayPanel} rows=${rows} />
          <//>

          <${Section} eyebrow="Reality check" title="Assumed peaks, scored"
            sub="Every peak the plan assumes, judged against the long-horizon data.">
            <${Scoreboard} cats=${cats.filter(c => active.includes(c.id))} />
          <//>

          <${Section} eyebrow="Detail" title="Category by category">
            <div class="grid gap-4 lg:grid-cols-2">
              ${rows.map(r => html`<${CategoryCard} key=${r.cat.id} row=${r} setTip=${setTip} />`)}
            </div>
          <//>

          <footer class="border-t border-[#E2E8F0] pt-6 text-[11.5px] leading-relaxed text-slate-400">
            <b class="text-slate-500">Method.</b> Seasonal index = the median across complete years of
            each month's within-year index (100 = that term's own yearly average). A month is a real
            peak at index ≥ 115 when the bump repeats in ≥ 60% of years; 107–115 is a mild bump. Ramp
            timing needs the average year to rise ≥ 10% above its own median, and the weekly and
            monthly tests must agree. One-off spikes are detected by modified z-score against each
            calendar period's median and excluded. Google Trends is a <b class="text-slate-500">relative
            index (0–100)</b> within each query — never search volume, and terms from separate exports
            are not comparable.
          </footer>`
        : html`<${BudgetView} cats=${cats} setTip=${setTip} />`}
      </main>
      <${Tooltip} tip=${tip} />
      <${Cameo} run=${cameo} onDone=${() => setCameo(null)} />
      <${ImportDialog} cats=${cats} open=${importOpen} onClose=${() => setImportOpen(false)}
        onDone=${() => { setImportOpen(false); setNonce(n => n + 1); }} />
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
