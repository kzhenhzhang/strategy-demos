(function (RV) {
"use strict";
  var domain = RV.domain = RV.domain || {};
  var target = domain.attribution = domain.attribution || {};
  var C = RV.app.constants;
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  const strVal = RV.infra.strVal;
  const parseNumericCell = RV.infra.parseNumericCell;
  const sampleArr = RV.infra.sampleArr;

function aggregateRatio(rows, numCol, denCol) {
  let num = 0, den = 0;
  for (const r of rows) {
    num += parseNum(rowVal(r, numCol));
    den += parseNum(rowVal(r, denCol));
  }
  return { rate: den > 0 ? num / den : null, num, den };
}

function checkNumericColumn(rows, col, minRate = 0.85) {
  const n = Math.min(rows.length, 8000);
  if (!n) return { ok: false, reason: "无样本" };
  let nonEmpty = 0;
  let numeric = 0;
  const step = rows.length <= n ? 1 : Math.ceil(rows.length / n);
  for (let i = 0; i < rows.length; i += step) {
    const p = parseNumericCell(rowVal(rows[i], col));
    if (p.kind === "missing") continue;
    nonEmpty++;
    if (p.kind === "ok" || p.kind === "negative") numeric++;
  }
  if (!nonEmpty) return { ok: false, reason: "无有效取值" };
  const rate = numeric / nonEmpty;
  if (rate < minRate) {
    return { ok: false, reason: `可解析为数值的比例 ${(rate * 100).toFixed(1)}% 不足` };
  }
  return { ok: true, rate };
}
function buildEqualFreqBinRule(rows, col, nBins) {
  const rule = RV.infra.buildEqualFreqBinRule(rows, col, nBins);
  const nTotal = rows.length;
  rule.numericRate = nTotal ? (nTotal - (rule.nMissing || 0)) / nTotal : 0;
  return rule;
}
function getBinnedLabel(rawVal, rule) {
  return RV.infra.getBinnedLabel(rawVal, rule);
}
function buildDimBinRules(rows, binCols, nBins, isBase, isCmp) {
  const rules = {};
  const periodRows = [];
  for (let i = 0; i < rows.length; i++) {
    if (isBase[i] || isCmp[i]) periodRows.push(rows[i]);
  }
  for (const col of binCols) {
    const rule = buildEqualFreqBinRule(periodRows, col, nBins);
    rule.basisCount = periodRows.length;
    rule.basisNote = "筛选后基期/比较期";
    rules[col] = rule;
  }
  return rules;
}
/** dimensionSpecs: { col, mode: "enum"|"bin", nBins? }[] */
function buildDimBinRulesFromSpecs(rows, dimensionSpecs, isBase, isCmp) {
  const binSpecs = (dimensionSpecs || []).filter((s) => s.mode === "bin" && s.col);
  if (!binSpecs.length) return null;
  const rules = {};
  const periodRows = [];
  for (let i = 0; i < rows.length; i++) {
    if (isBase[i] || isCmp[i]) periodRows.push(rows[i]);
  }
  for (const spec of binSpecs) {
    const nBins = Math.max(2, Math.min(20, parseInt(spec.nBins, 10) || 5));
    const rule = buildEqualFreqBinRule(periodRows, spec.col, nBins);
    rule.basisCount = periodRows.length;
    rule.basisNote = "筛选后基期/比较期";
    rules[spec.col] = rule;
  }
  return rules;
}
function dimensionSpecsToCols(dimensionSpecs) {
  return (dimensionSpecs || []).map((s) => s.col).filter(Boolean);
}
function dimLabelForSegment(col, binRules) {
  return binRules && binRules[col] ? `${col}（等频${binRules[col].nBins}箱）` : col;
}
function buildSegmentKey(row, dimCols, binRules) {
  const parts = dimCols.map((col) => {
    const label = binRules && binRules[col]
      ? getBinnedLabel(rowVal(row, col), binRules[col])
      : strVal(rowVal(row, col));
    return dimCols.length === 1 ? label : `${col}：${label}`;
  });
  return parts.join(C.SEGMENT_SEP);
}
/** Split a segment key into per-dimension labels (same rules as buildSegmentKey). */
function parseSegmentParts(segment, dimCols) {
  const cols = Array.isArray(dimCols) ? dimCols.filter(Boolean) : [dimCols].filter(Boolean);
  if (!cols.length) return [];
  if (cols.length === 1) {
    return [{ col: cols[0], label: String(segment ?? "") }];
  }
  const raw = String(segment ?? "").split(C.SEGMENT_SEP);
  return cols.map((col, i) => {
    let part = raw[i] != null ? String(raw[i]) : "";
    const prefixes = [col + "：", col + ":"];
    for (const prefix of prefixes) {
      if (part.startsWith(prefix)) {
        part = part.slice(prefix.length);
        break;
      }
    }
    return { col, label: part };
  });
}
function formatDimensionDisplay(dimCols, binRules) {
  return dimCols.map((c) => dimLabelForSegment(c, binRules)).join(" × ");
}
function estimateSegmentCount(rows, isBase, isCmp, dimCols, binRules) {
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (!isBase[i] && !isCmp[i]) continue;
    seen.add(buildSegmentKey(rows[i], dimCols, binRules));
  }
  return seen.size;
}
function binLabelRank(label, rule) {
  if (label === rule.missingLabel) return 0;
  if (label === rule.negativeLabel) return 1;
  for (let i = 0; i < rule.intervals.length; i++) {
    if (rule.intervals[i].label === label) return 2 + i;
  }
  return 9999;
}
function segmentSortKey(segment, dimCols, binRules) {
  const cols = Array.isArray(dimCols) ? dimCols : [dimCols];
  if (cols.length === 1 && binRules && binRules[cols[0]]) {
    return [binLabelRank(segment, binRules[cols[0]])];
  }
  const parts = cols.length === 1 ? [segment] : String(segment).split(C.SEGMENT_SEP);
  const key = [];
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    let part = parts[i] != null ? parts[i] : "";
    if (cols.length > 1) {
      const prefix = col + "：";
      part = part.startsWith(prefix) ? part.slice(prefix.length) : part;
    }
    if (binRules && binRules[col]) {
      key.push(binLabelRank(part, binRules[col]));
    } else {
      key.push(0, part);
    }
  }
  return key;
}
function compareSegmentSortKeys(ka, kb) {
  const a = Array.isArray(ka) ? ka : [ka];
  const b = Array.isArray(kb) ? kb : [kb];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), "zh");
  }
  return 0;
}
function sortSegments(segments, dimCols, binRules) {
  return segments.slice().sort(
    (a, b) => compareSegmentSortKeys(segmentSortKey(a, dimCols, binRules), segmentSortKey(b, dimCols, binRules))
  );
}

function contributionAnalysis(rows, isBase, isCmp, numCol, denCol, dimCols, binRules) {
  const cols = Array.isArray(dimCols) ? dimCols : [dimCols];
  const segMap = {};
  let mBase = 0, mCmp = 0;
  let sumBaseN = 0, sumBaseD = 0, sumCmpN = 0, sumCmpD = 0;

  for (let i = 0; i < rows.length; i++) {
    if (!isBase[i] && !isCmp[i]) continue;
    const r = rows[i];
    const seg = buildSegmentKey(r, cols, binRules);
    if (!segMap[seg]) segMap[seg] = { base: { n: 0, d: 0 }, cmp: { n: 0, d: 0 } };
    const n = parseNum(rowVal(r, numCol)), d = parseNum(rowVal(r, denCol));
    if (isBase[i]) {
      segMap[seg].base.n += n;
      segMap[seg].base.d += d;
      mBase += d;
      sumBaseN += n;
      sumBaseD += d;
    }
    if (isCmp[i]) {
      segMap[seg].cmp.n += n;
      segMap[seg].cmp.d += d;
      mCmp += d;
      sumCmpN += n;
      sumCmpD += d;
    }
  }

  const all = { rate: sumBaseD > 0 ? sumBaseN / sumBaseD : null };
  const cmpA = { rate: sumCmpD > 0 ? sumCmpN / sumCmpD : null };
  const deltaAll = (all.rate != null && cmpA.rate != null) ? cmpA.rate - all.rate : null;

  const table = [];
  for (const seg of sortSegments(Object.keys(segMap), cols, binRules)) {
    const b = segMap[seg].base, c = segMap[seg].cmp;
    const r_b = b.d > 0 ? b.n / b.d : 0;
    const r_c = c.d > 0 ? c.n / c.d : 0;
    const w_b = mBase > 0 ? b.d / mBase : 0;
    const w_c = mCmp > 0 ? c.d / mCmp : 0;
    const contrib_migration = (r_c - r_b) * w_b;
    const contrib_structure = (w_c - w_b) * r_b;
    const contrib_interaction = (r_c - r_b) * (w_c - w_b);
    const contrib_total = contrib_migration + contrib_structure + contrib_interaction;
    table.push({
      segment: seg,
      segmentParts: parseSegmentParts(seg, cols),
      num_base: b.n,
      den_base: b.d,
      num_cmp: c.n,
      den_cmp: c.d,
      rate_base: b.d > 0 ? r_b : null,
      rate_cmp: c.d > 0 ? r_c : null,
      weight_base: w_b,
      weight_cmp: w_c,
      contrib_total,
      contrib_migration,
      contrib_structure,
      contrib_interaction,
      contrib_pct: deltaAll && Math.abs(deltaAll) > 1e-12 ? (contrib_total / deltaAll * 100) : 0,
    });
  }
  const sumContrib = table.reduce((s, t) => s + t.contrib_total, 0);
  return {
    rate_base: all.rate, rate_cmp: cmpA.rate, delta_rate: deltaAll,
    table, sum_contrib: sumContrib,
    reconciliation_error: deltaAll != null ? deltaAll - sumContrib : null,
    den_total_base: mBase, den_total_cmp: mCmp,
    n_segments: table.length,
    dimCols: cols.slice(),
    dimension: formatDimensionDisplay(cols, binRules),
    binning_specs: binRules
      ? cols.filter((c) => binRules[c]).map((c) => binRules[c])
      : [],
  };
}
function buildContributionsForRatio(rows, isBase, isCmp, ratio, dims, binRules) {
  const singles = dims.map((d) => {
    const br = binRules && binRules[d] ? { [d]: binRules[d] } : null;
    return {
      ...contributionAnalysis(rows, isBase, isCmp, ratio.num, ratio.den, [d], br),
      kind: "single",
    };
  });
  let cross = null;
  if (dims.length > 1) {
    cross = {
      ...contributionAnalysis(rows, isBase, isCmp, ratio.num, ratio.den, dims, binRules),
      kind: "cross",
    };
  }
  return { rate_name: ratio.name, singles, cross };
}

/** Fixed contribution metrics (UI may remap num/den if columns differ). */
const ATTR_FIXED_METRICS = [
  { id: "pass_rate", name: "通过率", numCol: "通过量", denCol: "进件量" },
  { id: "risk", name: "订单风险", numCol: "fpd1_cnt_fz", denCol: "fpd1_cnt_fm" },
  { id: "amt_risk", name: "金额风险", numCol: "fpd1_amt_fz", denCol: "fpd1_amt_fm" },
  { id: "curr_ticket", name: "授信件均", numCol: "本次额度", denCol: "通过量" },
];
const ATTR_SECOND_DIM_TOP_K = 8;

function dimBinSubset(binRules, col) {
  return binRules && binRules[col] ? { [col]: binRules[col] } : null;
}

/**
 * Ordered two-dim contribution: dim1 on full sample, then dim2 inside
 * each top-|contrib| dim1 segment (subset masks). Segment-level tables
 * reconcile to that segment's ΔR, not the global ΔR.
 */
function buildOrderedDimContributions(rows, isBase, isCmp, ratio, dim1, dim2, binRules, opts) {
  const topK = Math.max(1, Math.min(20, (opts && opts.topK) || ATTR_SECOND_DIM_TOP_K));
  const br1 = dimBinSubset(binRules, dim1);
  const br2 = dimBinSubset(binRules, dim2);
  const first = {
    ...contributionAnalysis(rows, isBase, isCmp, ratio.num, ratio.den, [dim1], br1),
    kind: "single",
    dim_col: dim1,
    rate_name: ratio.name,
  };
  const ranked = (first.table || []).slice().sort((a, b) => (
    Math.abs(b.contrib_total || 0) - Math.abs(a.contrib_total || 0)
  ));
  const picked = ranked.slice(0, topK);
  const further = [];
  for (let p = 0; p < picked.length; p++) {
    const seg = picked[p].segment;
    const maskBase = new Array(rows.length);
    const maskCmp = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const inSeg = buildSegmentKey(rows[i], [dim1], br1) === seg;
      maskBase[i] = !!(isBase[i] && inSeg);
      maskCmp[i] = !!(isCmp[i] && inSeg);
    }
    further.push({
      ...contributionAnalysis(rows, maskBase, maskCmp, ratio.num, ratio.den, [dim2], br2),
      kind: "second",
      dim_col: dim2,
      parent_dim: dim1,
      parent_segment: seg,
      parent_contrib_total: picked[p].contrib_total,
      rate_name: ratio.name,
    });
  }
  return {
    rate_name: ratio.name,
    dim1,
    dim2,
    first,
    singles: [first],
    further,
    furtherTopK: topK,
    furtherTruncated: ranked.length > topK,
    furtherTotalSegments: ranked.length,
    cross: null,
  };
}

function computeModelCompare(rows, isBase, isCmp, yAll, modelCols, options) {
  options = options || {};
  const ivBins = options.ivBins != null ? options.ivBins : 5;
  const preferCreditStyle = !!options.preferCreditStyle;
  const parseModelScore = RV.domain.eda.parseModelScore;
  const resolveRiskScores = RV.domain.eda.resolveRiskScores;
  const computeAUC = RV.domain.metrics.computeAUC;
  const computeKS = RV.domain.metrics.computeKS;
  const computeIV = RV.domain.metrics.computeIV;

  const baseIdx = [];
  const cmpIdx = [];
  for (let i = 0; i < rows.length; i++) {
    if (isBase[i]) baseIdx.push(i);
    if (isCmp[i]) cmpIdx.push(i);
  }

  function buildVectors(indices, modelCol) {
    const y = [];
    const rawSc = [];
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const s = parseModelScore(rowVal(rows[i], modelCol));
      if (s === null) continue;
      y.push(yAll[i] | 0);
      rawSc.push(s);
    }
    const { sc, scoreNegated } = resolveRiskScores(y, rawSc, preferCreditStyle);
    return { y, sc, scoreNegated };
  }

  const dirLabel = (neg) => (neg ? "越大越好" : "越大越差");
  const modelCompare = [];
  for (const model of (modelCols || []).filter(Boolean)) {
    const b = buildVectors(baseIdx, model);
    const c = buildVectors(cmpIdx, model);
    const mb = {
      auc: computeAUC(b.y, b.sc),
      ks: computeKS(b.y, b.sc),
      iv: computeIV(b.y, b.sc, ivBins),
    };
    const mc = {
      auc: computeAUC(c.y, c.sc),
      ks: computeKS(c.y, c.sc),
      iv: computeIV(c.y, c.sc, ivBins),
    };
    modelCompare.push({
      model,
      score_dir_base: dirLabel(b.scoreNegated),
      score_dir_cmp: dirLabel(c.scoreNegated),
      auc_base: mb.auc,
      auc_cmp: mc.auc,
      auc_delta: mb.auc != null && mc.auc != null ? mc.auc - mb.auc : null,
      ks_base: mb.ks,
      ks_cmp: mc.ks,
      ks_delta: mb.ks != null && mc.ks != null ? mc.ks - mb.ks : null,
      iv_base: mb.iv,
      iv_cmp: mc.iv,
      iv_delta: mb.iv != null && mc.iv != null ? mc.iv - mb.iv : null,
    });
  }
  return modelCompare;
}

function profileStats(rows, col, keepVals = false) {
  const vals = [];
  let miss = 0;
  for (const r of rows) {
    const v = rowVal(r, col);
    if (v === "" || v == null) { miss++; continue; }
    const n = Number(String(v).replace(/,/g, ""));
    if (Number.isFinite(n)) vals.push(n);
    else miss++;
  }
  if (!vals.length) {
    return { count: rows.length, missing_pct: 100, mean: null, median: null, std: null, vals: keepVals ? [] : undefined };
  }
  const maxN = C.KDE_MAX_SAMPLES || 10000;
  const statVals = vals.length > maxN ? sampleArr(vals, maxN) : vals;
  statVals.sort((a, b) => a - b);
  const mean = statVals.reduce((a, b) => a + b, 0) / statVals.length;
  const mid = Math.floor(statVals.length / 2);
  const median = statVals.length % 2 ? statVals[mid] : (statVals[mid - 1] + statVals[mid]) / 2;
  const variance = statVals.reduce((s, x) => s + (x - mean) ** 2, 0) / (statVals.length - 1 || 1);
  const out = {
    count: rows.length,
    missing_pct: (miss / rows.length) * 100,
    mean, median,
    std: statVals.length > 1 ? Math.sqrt(variance) : null,
  };
  if (keepVals) out.vals = vals.length > maxN ? sampleArr(vals, maxN) : vals;
  return out;
}

  Object.assign(target, {
    aggregateRatio,
    checkNumericColumn, buildEqualFreqBinRule, getBinnedLabel,
    buildDimBinRules, buildDimBinRulesFromSpecs, dimensionSpecsToCols, dimLabelForSegment, buildSegmentKey, parseSegmentParts, formatDimensionDisplay,
    estimateSegmentCount, binLabelRank, segmentSortKey, compareSegmentSortKeys, sortSegments,
    contributionAnalysis, buildContributionsForRatio,
    ATTR_FIXED_METRICS, ATTR_SECOND_DIM_TOP_K, buildOrderedDimContributions,
    computeModelCompare,
    profileStats,
  });
})(window.RV);
