(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  var infra = RV.infra = RV.infra || {};
  var target = infra;

function normalizeColName(name) {
  return String(name == null ? "" : name).replace(/\u00a0/g, " ").trim();
}
function getChecked(container) {
  if (!container) return [];
  const cp = RV.ui?.collapsedPicker;
  const pickerId = container.dataset?.pickerId
    || (cp?.findPickerIdByChecksEl && cp.findPickerIdByChecksEl(container));
  if (pickerId && cp?.getPickerSelection) {
    return cp.getPickerSelection(pickerId);
  }
  return [...container.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
}
function isBadLabel(y) {
  return (Number(y) | 0) === 1;
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rowVal(row, col) {
  if (!row || col == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
  const want = normalizeColName(col);
  for (const k of Object.keys(row)) {
    if (normalizeColName(k) === want) return row[k];
  }
  return undefined;
}
function parseNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function parseNumZero(v) {
  const n = parseNum(v);
  return n == null ? 0 : n;
}
function strVal(v) {
  if (v === null || v === undefined || v === "") return "(缺失)";
  return String(v);
}
function getApplyVol(row) { return parseNumZero(rowVal(row, C.APPLY_COL)); }
function getPassVol(row) { return parseNumZero(rowVal(row, C.PASS_COL)); }
function groupKeyFromRow(row, groupCols) {
  if (!groupCols || !groupCols.length) return "全部";
  return groupCols.map((c) => strVal(rowVal(row, c))).join(C.GROUP_KEY_SEP);
}
function groupPartsFromKey(key, groupCols) {
  if (key === "全部") return ["全部"];
  return key.split(C.GROUP_KEY_SEP);
}
function compareDimValue(a, b) {
  const av = String(a ?? "");
  const bv = String(b ?? "");
  const an = parseNum(av);
  const bn = parseNum(bv);
  if (an != null && bn != null && an !== bn) return an - bn;
  return av.localeCompare(bv, "zh-CN", { numeric: true, sensitivity: "base" });
}
function compareGroupKeys(ka, kb, groupCols) {
  if (ka === "全部" && kb === "全部") return 0;
  if (ka === "全部") return -1;
  if (kb === "全部") return 1;
  const aParts = groupPartsFromKey(ka, groupCols);
  const bParts = groupPartsFromKey(kb, groupCols);
  for (let i = 0; i < groupCols.length; i++) {
    const cmp = compareDimValue(aParts[i], bParts[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}
function sortGroupKeys(keys, groupCols) {
  if (!groupCols.length) return keys.slice();
  return keys.slice().sort((a, b) => compareGroupKeys(a, b, groupCols));
}
function formatGroupLabels(groupCols) {
  if (!groupCols || !groupCols.length) return "分组";
  return groupCols.join(" × ");
}
function indexRowsByGroup(rows, groupCols) {
  const map = {};
  if (!groupCols.length) {
    map["全部"] = rows.slice();
    return map;
  }
  for (const r of rows) {
    const k = groupKeyFromRow(r, groupCols);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  return map;
}
function safeRate(num, den) {
  if (!den || den <= 0) return null;
  return num / den;
}
function pct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return (v * 100).toFixed(digits) + "%";
}
function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
/** t∈[0,1]：青(低) → 橙(高)；A+B 方案（提亮 + gamma） */
function cyanAmberHeatStyle(t) {
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  const g = Math.pow(u, 0.85); /* gamma: mid-high contrast boost */
  const hue = 192 - g * 146; /* 192 cyan → 46 amber-orange */
  const sat = 64 + g * 28; /* 64 → 92 */
  const bgL = 28 + g * 30; /* 28 → 58 */
  const fgL = bgL >= 42 ? 14 + (58 - bgL) * 0.34 : 95 - g * 11;
  const fgSat = bgL >= 42 ? Math.min(58, sat) : Math.max(26, sat - 18);
  const bg = `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${bgL.toFixed(1)}%)`;
  const fg = `hsl(${hue.toFixed(1)} ${fgSat.toFixed(1)}% ${fgL.toFixed(1)}%)`;
  return `background:${bg};color:${fg}`;
}
/** t∈[0,1]：绿低 → 暗底 → 红高。两段分开着色，色相不经过黄。 */
function neutralHeatStyle(t) {
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  const low = [[0, 0.62, 0.13], [0.25, 0.42, 0.08], [0.5, 0.24, 0.012]];
  const high = [[0.5, 0.24, 0.012], [0.75, 0.45, 0.12], [1, 0.62, 0.16]];
  const stops = u <= 0.5 ? low : high;
  const hue = u <= 0.5 ? 155 : 25;
  let i = 0;
  while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const k = (u - a[0]) / (b[0] - a[0] || 1);
  let L = a[1] + (b[1] - a[1]) * k;
  const C = a[2] + (b[2] - a[2]) * k;
  /* 明度 0.52–0.58 时深字和浅字都过不了 4.5:1。绿段压到浅字能读的一侧。 */
  if (hue === 155 && L > 0.52 && L < 0.58) L = 0.52;
  const fg = L >= 0.58 ? "oklch(0.16 0.02 286)" : "oklch(0.96 0.005 286)";
  return `background:oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue});color:${fg}`;
}
function rateHeatStyle(rate, min, max) {
  if (rate == null || !Number.isFinite(rate)) return "";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const span = max - min;
  const t = span > 1e-12 ? Math.min(1, Math.max(0, (rate - min) / span)) : 0.5;
  return neutralHeatStyle(t);
}
function trendRateScales(trend, ratioSpecs) {
  return ratioSpecs.map((spec) => {
    const vals = trend
      .map((row) => row[spec.name])
      .filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });
}
function summaryTrendRateScales(trend, field) {
  const vals = trend.map((r) => r[field]).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return { min: 0, max: 0 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
function sumRatio(rows, numCol, denCol) {
  let num = 0, den = 0;
  for (const r of rows) {
    num += parseNumZero(rowVal(r, numCol));
    den += parseNumZero(rowVal(r, denCol));
  }
  return { num, den, rate: safeRate(num, den) };
}
function buildEqualFreqBinRule(rows, col, nBins) {
  nBins = Math.max(2, Math.min(20, nBins | 0));
  let nMissing = 0, nNegative = 0;
  const nonNeg = [];
  for (let i = 0; i < rows.length; i++) {
    const p = parseNumericCell(rowVal(rows[i], col));
    if (p.kind === "missing") nMissing++;
    else if (p.kind === "negative") nNegative++;
    else nonNeg.push(p.n);
  }
  const rule = {
    col, nBins, missingLabel: C.BIN_MISSING_LABEL, negativeLabel: C.BIN_NEGATIVE_LABEL,
    intervals: [], nMissing, nNegative, nNonNeg: nonNeg.length,
  };
  nonNeg.sort((a, b) => a - b);
  if (!nonNeg.length) return rule;
  const actualBins = Math.min(nBins, nonNeg.length);
  let start = 0;
  for (let b = 0; b < actualBins; b++) {
    const end = b === actualBins - 1 ? nonNeg.length : Math.floor((b + 1) * nonNeg.length / actualBins);
    if (end <= start) continue;
    const lo = nonNeg[start], hi = nonNeg[end - 1];
    const isLast = b === actualBins - 1;
    rule.intervals.push({ lo, hi, loClosed: true, hiClosed: isLast, label: formatIntervalLabel(lo, hi, true, isLast), count: end - start });
    start = end;
  }
  return rule;
}
function buildDenWeightedBinRule(rows, col, nBins, denCol) {
  nBins = Math.max(2, Math.min(20, nBins | 0));
  let nMissing = 0, nNegative = 0;
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const p = parseNumericCell(rowVal(rows[i], col));
    if (p.kind === "missing") { nMissing++; continue; }
    if (p.kind === "negative") { nNegative++; continue; }
    items.push({ n: p.n, den: parseNumZero(rowVal(rows[i], denCol)), row: rows[i] });
  }
  const rowLabels = new Map();
  const rule = {
    col, nBins, missingLabel: C.BIN_MISSING_LABEL, negativeLabel: C.BIN_NEGATIVE_LABEL,
    intervals: [], nMissing, nNegative, nNonNeg: items.length, rowLabels,
  };
  items.sort((a, b) => a.n - b.n);
  if (!items.length) return rule;

  function pushSliceInterval(sliceItems) {
    if (!sliceItems.length) return;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < sliceItems.length; i++) {
      const n = sliceItems[i].n;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    const label = formatIntervalLabel(lo, hi, true, true);
    rule.intervals.push({
      lo, hi, loClosed: true, hiClosed: true,
      label, count: sliceItems.length,
    });
    for (const it of sliceItems) {
      if (it.row) rowLabels.set(it.row, label);
    }
  }

  const totalDen = items.reduce((s, x) => s + x.den, 0);
  const actualBins = Math.min(nBins, items.length);

  if (totalDen <= 0) {
    let start = 0;
    for (let b = 0; b < actualBins; b++) {
      const end = b === actualBins - 1 ? items.length : Math.floor((b + 1) * items.length / actualBins);
      if (end <= start) continue;
      pushSliceInterval(items.slice(start, end));
      start = end;
    }
    return rule;
  }

  const targetDen = totalDen / actualBins;
  let start = 0;
  for (let b = 0; b < actualBins; b++) {
    if (start >= items.length) break;
    let cumDen = 0;
    let end = start;
    const isLastBin = b === actualBins - 1;
    while (end < items.length) {
      cumDen += items[end].den;
      end++;
      if (isLastBin) continue;
      if (cumDen >= targetDen && end > start) break;
    }
    if (end <= start) end = Math.min(start + 1, items.length);
    pushSliceInterval(items.slice(start, end));
    start = end;
  }
  return rule;
}
function buildCustomShareBinRule(rows, col, shares, denCol) {
  const shareList = (shares || []).map((s) => Number(s));
  const nBins = shareList.length;
  let nMissing = 0, nNegative = 0;
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const p = parseNumericCell(rowVal(rows[i], col));
    if (p.kind === "missing") { nMissing++; continue; }
    if (p.kind === "negative") { nNegative++; continue; }
    items.push({ n: p.n, den: parseNumZero(rowVal(rows[i], denCol)), row: rows[i] });
  }
  const rowLabels = new Map();
  const rule = {
    col, nBins, shares: shareList.slice(), missingLabel: C.BIN_MISSING_LABEL, negativeLabel: C.BIN_NEGATIVE_LABEL,
    intervals: [], nMissing, nNegative, nNonNeg: items.length, rowLabels, binMode: "custom_share",
  };
  items.sort((a, b) => a.n - b.n);
  if (!items.length || !nBins) return rule;

  function pushSliceInterval(sliceItems) {
    if (!sliceItems.length) return;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < sliceItems.length; i++) {
      const n = sliceItems[i].n;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    const label = formatIntervalLabel(lo, hi, true, true);
    rule.intervals.push({
      lo, hi, loClosed: true, hiClosed: true,
      label, count: sliceItems.length,
    });
    for (const it of sliceItems) {
      if (it.row) rowLabels.set(it.row, label);
    }
  }

  function attachCustomShareStats() {
    if (!rule.intervals.length || totalDen <= 0) return;
    const denByLabel = {};
    for (const it of items) {
      const lab = rowLabels.get(it.row);
      if (!lab) continue;
      denByLabel[lab] = (denByLabel[lab] || 0) + it.den;
    }
    const actualDenShares = rule.intervals.map((it) => (denByLabel[it.label] || 0) / totalDen * 100);
    let maxShareDevPct = 0;
    for (let i = 0; i < shareList.length; i++) {
      const actual = actualDenShares[i] ?? 0;
      maxShareDevPct = Math.max(maxShareDevPct, Math.abs(actual - shareList[i]));
    }
    rule.actualDenShares = actualDenShares;
    rule.maxShareDevPct = maxShareDevPct;
  }

  const totalDen = items.reduce((s, x) => s + x.den, 0);
  const actualBins = Math.min(nBins, items.length);

  if (totalDen <= 0) {
    let start = 0;
    for (let b = 0; b < actualBins; b++) {
      const end = b === actualBins - 1 ? items.length : Math.floor((b + 1) * items.length / actualBins);
      if (end <= start) continue;
      pushSliceInterval(items.slice(start, end));
      start = end;
    }
    attachCustomShareStats();
    return rule;
  }

  let cumShare = 0;
  let start = 0;
  for (let b = 0; b < actualBins; b++) {
    if (start >= items.length) break;
    cumShare += shareList[b] ?? 0;
    const isLastBin = b === actualBins - 1;
    const targetCumDen = isLastBin ? totalDen : (cumShare / 100) * totalDen;
    let end = items.length;
    if (!isLastBin) {
      const remainingBins = actualBins - b - 1;
      let globalCum = 0;
      end = start;
      for (let i = 0; i < items.length; i++) {
        globalCum += items[i].den;
        if (globalCum >= targetCumDen) {
          end = i + 1;
          break;
        }
      }
      if (end <= start) end = Math.min(start + 1, items.length);
      if (remainingBins > 0 && end > items.length - remainingBins) {
        end = items.length - remainingBins;
      }
    }
    pushSliceInterval(items.slice(start, end));
    start = end;
  }
  attachCustomShareStats();
  return rule;
}
function formatManualIntervalLabel(lo, hi, loClosed, hiClosed) {
  const lc = loClosed ? "[" : "(";
  const rc = hiClosed ? "]" : ")";
  const loTxt = Number.isFinite(lo) ? fmtBinCut(lo) : "-∞";
  const hiTxt = Number.isFinite(hi) ? fmtBinCut(hi) : "+∞";
  return `${lc}${loTxt}, ${hiTxt}${rc}`;
}
function buildManualThresholdBinRule(rows, col, thresholds) {
  const cuts = [...new Set((thresholds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0))]
    .sort((a, b) => a - b);
  let nMissing = 0, nNegative = 0;
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const p = parseNumericCell(rowVal(rows[i], col));
    if (p.kind === "missing") { nMissing++; continue; }
    if (p.kind === "negative") { nNegative++; continue; }
    items.push({ n: p.n, row: rows[i] });
  }
  const rowLabels = new Map();
  const rule = {
    col,
    nBins: cuts.length + 1,
    thresholds: cuts.slice(),
    missingLabel: C.BIN_MISSING_LABEL,
    negativeLabel: C.BIN_NEGATIVE_LABEL,
    intervals: [],
    nMissing,
    nNegative,
    nNonNeg: items.length,
    rowLabels,
    binMode: "manual_thresholds",
  };
  if (!items.length) return rule;
  items.sort((a, b) => a.n - b.n);
  let lo = 0;
  for (let i = 0; i < cuts.length; i++) {
    const hi = cuts[i];
    const loClosed = i === 0;
    const hiClosed = true;
    rule.intervals.push({
      lo,
      hi,
      loClosed,
      hiClosed,
      label: formatManualIntervalLabel(lo, hi, loClosed, hiClosed),
      count: 0,
    });
    lo = hi;
  }
  rule.intervals.push({
    lo,
    hi: Infinity,
    loClosed: cuts.length === 0,
    hiClosed: true,
    label: formatManualIntervalLabel(lo, Infinity, cuts.length === 0, true),
    count: 0,
  });
  for (const it of items) {
    for (let i = 0; i < rule.intervals.length; i++) {
      const interval = rule.intervals[i];
      if (!valueInInterval(it.n, interval)) continue;
      interval.count += 1;
      rowLabels.set(it.row, interval.label);
      break;
    }
  }
  return rule;
}
function valueInInterval(n, it) {
  const loOk = it.loClosed ? n >= it.lo : n > it.lo;
  const hiOk = it.hiClosed ? n <= it.hi : n < it.hi;
  return loOk && hiOk;
}
function getBinnedLabel(rawVal, rule, row) {
  if (row != null && rule.rowLabels?.has(row)) return rule.rowLabels.get(row);
  const p = parseNumericCell(rawVal);
  if (p.kind === "missing") return rule.missingLabel;
  if (p.kind === "negative") return rule.negativeLabel;
  for (let i = 0; i < rule.intervals.length; i++) {
    if (valueInInterval(p.n, rule.intervals[i])) return rule.intervals[i].label;
  }
  if (rule.intervals.length) return rule.intervals[rule.intervals.length - 1].label;
  return rule.missingLabel;
}
function binLabelOrder(rule) {
  return [rule.missingLabel, rule.negativeLabel, ...rule.intervals.map((it) => it.label)];
}
function countBinLabels(rows, col, rule) {
  const order = binLabelOrder(rule);
  const map = Object.fromEntries(order.map((k) => [k, 0]));
  for (const r of rows) {
    const lab = getBinnedLabel(rowVal(r, col), rule, r);
    if (map[lab] == null) map[lab] = 0;
    map[lab]++;
  }
  return order.map((k) => map[k] || 0);
}
function fmtMetric(v) {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return (Math.round(v * 10000) / 10000).toFixed(4);
}
function fmtBinCut(x) {
  if (!Number.isFinite(x)) return String(x);
  const ax = Math.abs(x);
  if (ax >= 1e15 || (ax > 0 && ax < 1e-8)) return x.toPrecision(6);
  if (Math.abs(x - Math.round(x)) < 1e-6) return Math.round(x).toLocaleString("zh-CN");
  return x.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}
function formatIntervalLabel(lo, hi, loClosed, hiClosed) {
  const lc = loClosed ? "[" : "(";
  const rc = hiClosed ? "]" : ")";
  return `${lc}${fmtBinCut(lo)}, ${fmtBinCut(hi)}${rc}`;
}
function parseNumericCell(v) {
  if (v === null || v === undefined || String(v).trim() === "") return { kind: "missing" };
  const n = Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return { kind: "missing" };
  if (n < 0) return { kind: "negative", n };
  return { kind: "ok", n };
}
function corrHeatStyle(r) {
  if (r == null || !Number.isFinite(r)) return "";
  const t = Math.max(-1, Math.min(1, r));
  if (Math.abs(t) < 0.05) return "background:var(--surface);color:var(--text-muted)";
  return neutralHeatStyle(Math.abs(t));
}
function metricColumnScales(rows, keys) {
  const scales = {};
  for (const k of keys) {
    const vals = rows.map((r) => r[k]).filter((v) => v != null && Number.isFinite(v));
    scales[k] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
  }
  return scales;
}
function metricHeatCell(val, scale) {
  const heat = rateHeatStyle(val, scale.min, scale.max);
  return heat ? ` class="num rate-heat" style="${heat}"` : ' class="num"';
}
function thWithResizer(innerHtml) {
  return `<th><div class="th-cell">${innerHtml}<span class="col-resizer" title="拖动调整列宽"></span></div></th>`;
}
function thWithRowResizer(innerHtml) {
  return `<th scope="row"><div class="th-cell">${innerHtml}<span class="col-resizer" title="拖动调整列宽"></span></div></th>`;
}
function setTableColWidth(table, colIdx, widthPx) {
  if (table && table.style) table.style.tableLayout = "fixed";
  const w = Math.max(56, Math.round(widthPx)) + "px";
  const th = table.querySelectorAll("thead th")[colIdx];
  if (th) th.style.width = w;
  table.querySelectorAll("tbody tr").forEach((tr) => {
    const td = tr.children[colIdx];
    if (td) td.style.width = w;
  });
}
function bindColResizer(table, resizer, colIdx) {
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const th = resizer.closest("th");
    if (!th) return;
    const startX = e.clientX;
    const startW = th.offsetWidth;
    resizer.classList.add("active");
    document.body.classList.add("table-dragging");
    const onMove = (ev) => setTableColWidth(table, colIdx, startW + (ev.clientX - startX));
    const onUp = () => {
      resizer.classList.remove("active");
      document.body.classList.remove("table-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) {
    return fallback;
  }
}
function chartPalette() {
  return {
    axis: cssVar("--chart-grid", "#4b5563"),
    tick: cssVar("--chart-axis", "#94a3b8"),
    grid: cssVar("--chart-grid", "#374151"),
    label: cssVar("--chart-label", "#cbd5e1"),
    hard: cssVar("--hard", "#f87171"),
    soft: cssVar("--soft", "#4ade80"),
    accent: cssVar("--accent", "#60a5fa"),
    cross: cssVar("--track-cross", "#c084fc"),
    danger: cssVar("--danger", "#f87171"),
    warn: cssVar("--warn", "#fbbf24"),
    text: cssVar("--text", "#e2e8f0"),
    onAccent: cssVar("--on-accent", "#fff"),
  };
}
function svgEl(tag, attrs) {
  const el = document.createElementNS(C.SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}
function svgText(x, y, text, attrs) {
  const fill = chartPalette().label;
  const el = svgEl("text", { x, y, "font-size": "10", fill, ...(attrs || {}) });
  el.textContent = text;
  return el;
}
function formatAxisTick(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1e6 || (a > 0 && a < 1e-3)) return v.toExponential(2);
  return Number(v.toPrecision(4)).toString();
}
function sampleArr(arr, maxN) {
  if (arr.length <= maxN) return arr;
  const out = [];
  const step = arr.length / maxN;
  for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}
/** Loop min/max — avoid Math.min(...huge) which throws "Maximum call stack size exceeded" in V8 (~150k+ args). */
function minMaxNumbers(arr) {
  if (!arr?.length) return { min: 0, max: 0, empty: true };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return { min: 0, max: 0, empty: true };
  return { min, max, empty: false };
}
function finiteNums(arr) {
  const out = [];
  if (!arr) return out;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
function uniqueSortedNums(arr) {
  const s = (arr || []).slice().sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (!out.length || out[out.length - 1] !== s[i]) out.push(s[i]);
  }
  return out;
}
/**
 * Shared equal-width (or enum) histogram; bar height = within-group share.
 * groupValues: array of numeric arrays (one per facet/group).
 */
function groupShareHistograms(groupValues, nBins) {
  nBins = Math.max(1, Math.floor(Number(nBins) || 20));
  const cleaned = (groupValues || []).map(finiteNums);
  const all = [];
  for (let g = 0; g < cleaned.length; g++) {
    const arr = cleaned[g];
    for (let i = 0; i < arr.length; i++) all.push(arr[i]);
  }
  const ns = cleaned.map((g) => g.length);
  if (!all.length) {
    return {
      mode: "empty",
      nBins: 0,
      min: null,
      max: null,
      edges: [],
      centers: [],
      shares: cleaned.map(() => []),
      counts: cleaned.map(() => []),
      ns,
    };
  }
  const uniq = uniqueSortedNums(all);
  const min = uniq[0];
  const max = uniq[uniq.length - 1];
  let mode;
  let nOut;
  let edges;
  let centers;
  if (uniq.length <= nBins) {
    mode = "enum";
    nOut = uniq.length;
    centers = uniq.slice();
    edges = uniq.slice();
  } else {
    mode = "equal_width";
    nOut = nBins;
    edges = new Array(nBins + 1);
    centers = new Array(nBins);
    const span = max - min;
    for (let i = 0; i <= nBins; i++) edges[i] = min + (span * i) / nBins;
    for (let i = 0; i < nBins; i++) centers[i] = (edges[i] + edges[i + 1]) / 2;
  }
  const counts = cleaned.map((g) => {
    const c = new Array(nOut).fill(0);
    if (!g.length) return c;
    if (mode === "enum") {
      const idx = new Map();
      for (let i = 0; i < uniq.length; i++) idx.set(uniq[i], i);
      for (let i = 0; i < g.length; i++) {
        const j = idx.get(g[i]);
        if (j != null) c[j]++;
      }
    } else {
      for (let i = 0; i < g.length; i++) {
        let j = nOut === 1 || max <= min ? 0 : Math.floor(((g[i] - min) / (max - min)) * nOut);
        if (j >= nOut) j = nOut - 1;
        if (j < 0) j = 0;
        c[j]++;
      }
    }
    return c;
  });
  const shares = counts.map((c, gi) => {
    const n = ns[gi] || 0;
    return c.map((k) => (n ? k / n : 0));
  });
  return { mode, nBins: nOut, min, max, edges, centers, shares, counts, ns };
}
function kdeDensity(data, xs) {
  if (data.length < 2) return xs.map(() => 0);
  const sample = data.length > C.KDE_MAX_SAMPLES ? sampleArr(data, C.KDE_MAX_SAMPLES) : data;
  const n = sample.length;
  let mean = 0;
  for (const v of sample) mean += v;
  mean /= n;
  let vsum = 0;
  for (const v of sample) vsum += (v - mean) ** 2;
  const std = Math.sqrt(vsum / (n - 1)) || 1e-6;
  const h = 1.06 * std * Math.pow(n, -0.2);
  const coef = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return xs.map((x) => {
    let s = 0;
    for (const xi of sample) {
      const u = (x - xi) / h;
      s += Math.exp(-0.5 * u * u);
    }
    return s * coef;
  });
}
function smoothCurvePath(xs, ys, min, max, maxY, pad, innerW, innerH) {
  if (max <= min || maxY <= 0) return "";
  const pts = [];
  for (let i = 0; i < xs.length; i++) {
    const px = pad.l + ((xs[i] - min) / (max - min)) * innerW;
    const py = pad.t + innerH - (ys[i] / maxY) * innerH;
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}
/** Catmull–Rom through pts → SVG cubic path. 2 points stay a line. */
function catmullRomPath(pts) {
  if (!pts || !pts.length) return "";
  const fmt = (v) => Number(v).toFixed(2);
  if (pts.length === 1) return `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  if (pts.length === 2) {
    return `M ${fmt(pts[0].x)} ${fmt(pts[0].y)} L ${fmt(pts[1].x)} ${fmt(pts[1].y)}`;
  }
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}
function pearson(x, y) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    n++; sx += xi; sy += yi; sxx += xi * xi; syy += yi * yi; sxy += xi * yi;
  }
  if (n < 3) return null;
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}
function validityPivotHeatScales(pivotRows, byGroup) {
  const scales = {};
  for (const row of pivotRows) {
    const sk = byGroup
      ? `${row.groupKey}\u0001${row.customRuleId}\u0001${row.softRuleId}`
      : `${row.customRuleId}\u0001${row.softRuleId}`;
    const vals = C.VALIDITY_SEGMENTS
      .map((s) => row.segments[s.key]?.rate)
      .filter((v) => v != null && Number.isFinite(v));
    scales[sk] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
  }
  return scales;
}
function swapRiskHeatScale(swapRow) {
  const vals = [
    ...C.SWAP_SEGMENTS.map((s) => swapRow.segments[s.key]?.risk?.rate),
    swapRow.onlinePass?.risk?.rate,
    swapRow.newPass?.risk?.rate,
  ].filter((v) => v != null && Number.isFinite(v));
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
}
function riskEstHeatScale(estRows) {
  const vals = [];
  for (const r of estRows || []) {
    if (r.newPassRate != null && Number.isFinite(r.newPassRate)) vals.push(r.newPassRate);
    if (r.newRejectRate != null && Number.isFinite(r.newRejectRate)) vals.push(r.newRejectRate);
    if (r.inferredRisk != null && Number.isFinite(r.inferredRisk)) vals.push(r.inferredRisk);
  }
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
}
function validityHeatScales(rows) {
  const map = {};
  for (const r of rows) {
    const key = `${r.groupKey}\u0001${r.customRuleId}\u0001${r.softRuleId}`;
    if (!map[key]) map[key] = [];
    if (r.rate != null && Number.isFinite(r.rate)) map[key].push(r.rate);
  }
  const scales = {};
  for (const [k, vals] of Object.entries(map)) {
    scales[k] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
  }
  return scales;
}
let lastCsvEncoding = "";
const CSV_FALLBACK_ENCODINGS = (function () {
  const out = [];
  for (const enc of ["gb18030", "gbk"]) {
    try {
      new TextDecoder(enc);
      out.push(enc);
    } catch {
      /* unsupported in this browser */
    }
  }
  return out;
})();
function decodeCsvBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(buffer.slice(3)), encoding: "utf-8-bom" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    for (const enc of CSV_FALLBACK_ENCODINGS) {
      try {
        return { text: new TextDecoder(enc).decode(buffer), encoding: enc };
      } catch {
        /* try next */
      }
    }
    if (!CSV_FALLBACK_ENCODINGS.length) {
      throw new Error("当前浏览器不支持 GBK 解码，请将 CSV 另存为 UTF-8（带 BOM）后重试，或使用 Chrome/Edge");
    }
    throw new Error("CSV 编码无法识别（非 UTF-8 / GBK），请另存为 UTF-8 CSV 后重试");
  }
}
function getLastCsvEncoding() {
  return lastCsvEncoding;
}
async function readFileAsText(file) {
  if (typeof TextDecoder === "undefined") {
    lastCsvEncoding = "utf-8-legacy";
    if (typeof file.text === "function") return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(String(ev.target.result || ""));
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "UTF-8");
    });
  }
  if (typeof file.arrayBuffer !== "function") {
    throw new Error("无法读取文件内容");
  }
  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeCsvBytes(buffer);
  lastCsvEncoding = encoding;
  return text;
}
function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 200);
}
function fmtAttrNumber(v) {
  const C = RV.app.constants;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) >= 1000) return String(v);
    return v.toFixed(C.ATTR_DECIMAL_PLACES ?? 4);
  }
  return String(v);
}
function headerIsRateOrWeight(header) {
  if (!header) return false;
  if (header === "ΔR") return true;
  if (header.includes("权重")) return true;
  if (header.includes("比率") && !header.includes("贡献")) return true;
  return false;
}
function headerIsPercent(header) {
  return header.includes("%") || header.includes("占比");
}
function toPercentDisplay(v, alreadyScaled) {
  const C = RV.app.constants;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const num = alreadyScaled ? Number(v) : Number(v) * 100;
  return num.toFixed(C.ATTR_PCT_PLACES ?? 2) + "%";
}
function fmtAttrCell(header, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (typeof v === "string") return esc(v);
  if (headerIsRateOrWeight(header)) return toPercentDisplay(v, false);
  if (headerIsPercent(header)) return toPercentDisplay(v, true);
  if (header === "N" || header === "count" || header === "样本数") return String(Math.round(v));
  return fmtAttrNumber(v);
}
function fmtAttrSignedCell(header, v) {
  const C = RV.app.constants;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  let text;
  if (header === "贡献%") text = n.toFixed(C.ATTR_PCT_PLACES ?? 2) + "%";
  else text = n.toFixed(C.ATTR_DECIMAL_PLACES ?? 4);
  if (n > 0) return `<span class="delta-pos">↑ ${text}</span>`;
  if (n < 0) return `<span class="delta-neg">↓ ${text}</span>`;
  return text;
}
function plainTipText(htmlOrText) {
  return String(htmlOrText == null ? "" : htmlOrText)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(strong|b|em|i|code|span)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
/** HeroUI-style ⓘ badge; tip is plain text for CSS attr() tooltip. */
function hintBadgeHtml(tip, { aria = "说明" } = {}) {
  const t = plainTipText(tip);
  if (!t) return "";
  return `<span class="rv-hint rv-tip-anchor" data-rv-tip="${esc(t)}" tabindex="0" role="img" aria-label="${esc(aria)}：${esc(t)}">ⓘ</span>`;
}
function withHintHtml(label, tip, { escapeLabel = true, aria } = {}) {
  const lab = escapeLabel ? esc(label) : String(label == null ? "" : label);
  return `${lab}${hintBadgeHtml(tip, { aria: aria || String(label || "说明") })}`;
}
function helpTipHtml(label, tip) {
  if (!tip) return esc(label);
  return withHintHtml(label, tip);
}

  Object.assign(target, { normalizeColName, getChecked, isBadLabel, esc, rowVal, parseNum, parseNumZero, strVal, getApplyVol, getPassVol, groupKeyFromRow, groupPartsFromKey, compareDimValue, compareGroupKeys, sortGroupKeys, formatGroupLabels, indexRowsByGroup, safeRate, pct, fmtNum, cyanAmberHeatStyle, rateHeatStyle, trendRateScales, summaryTrendRateScales, sumRatio, buildEqualFreqBinRule, buildDenWeightedBinRule, buildCustomShareBinRule, buildManualThresholdBinRule, valueInInterval, getBinnedLabel, binLabelOrder, countBinLabels, fmtMetric, fmtBinCut, formatIntervalLabel, parseNumericCell, corrHeatStyle, metricColumnScales, metricHeatCell, thWithResizer, thWithRowResizer, setTableColWidth, bindColResizer, cssVar, chartPalette, svgEl, svgText, formatAxisTick, sampleArr, minMaxNumbers, groupShareHistograms, kdeDensity, smoothCurvePath, catmullRomPath, pearson, validityPivotHeatScales, swapRiskHeatScale, riskEstHeatScale, validityHeatScales, decodeCsvBytes, getLastCsvEncoding, readFileAsText, downloadBlob, fmtAttrNumber, fmtAttrCell, fmtAttrSignedCell, toPercentDisplay, plainTipText, hintBadgeHtml, withHintHtml, helpTipHtml, headerIsRateOrWeight, headerIsPercent });
})(window.RV);
