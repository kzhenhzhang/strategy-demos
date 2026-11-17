(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const binLabelOrder = RV.infra.binLabelOrder;
  const buildEqualFreqBinRule = RV.infra.buildEqualFreqBinRule;
  const groupKeyFromRow = RV.infra.groupKeyFromRow;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const computeAUC = RV.domain.metrics.computeAUC;
  const computeDiscriminationBundle = RV.domain.metrics.computeDiscriminationBundle;
  const computePSI = RV.domain.metrics.computePSI;
  const countBinLabels = RV.infra.countBinLabels;
  const getBinnedLabel = RV.infra.getBinnedLabel;
  const isBadLabel = RV.infra.isBadLabel;
  const parseNum = RV.infra.parseNum;
  const pearson = RV.infra.pearson;
  const rowVal = RV.infra.rowVal;
  var domain = RV.domain = RV.domain || {};
  var target = domain.eda = domain.eda || {};

function parseModelScore(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function resolveRiskScores(y, rawScores, preferCreditStyle) {
  const neg = rawScores.map((s) => (Number.isFinite(s) ? -s : s));
  const options = preferCreditStyle
    ? [{ sc: neg, scoreNegated: true }, { sc: rawScores, scoreNegated: false }]
    : [{ sc: rawScores, scoreNegated: false }, { sc: neg, scoreNegated: true }];
  let best = options[0];
  let bestAuc = computeAUC(y, best.sc);
  for (let i = 1; i < options.length; i++) {
    const auc = computeAUC(y, options[i].sc);
    if (auc != null && (bestAuc == null || auc > bestAuc)) { bestAuc = auc; best = options[i]; }
  }
  return best;
}

function buildYVector(rows, badSpec) {
  const y = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = parseNum(rowVal(rows[i], badSpec.col));
    y[i] = v != null && v > badSpec.threshold ? 1 : 0;
  }
  return y;
}

function buildScoreVector(rows, col) {
  const sc = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) sc[i] = parseModelScore(rowVal(rows[i], col));
  return sc;
}

/** One pass: col → Float64Array with NaN for missing. */
function materializeScoreColumns(rows, cols) {
  const n = rows.length;
  const out = {};
  for (const col of cols || []) {
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = parseModelScore(rowVal(rows[i], col));
      arr[i] = v == null ? Number.NaN : v;
    }
    out[col] = arr;
  }
  return out;
}

function scoreVectorFromCache(colCache, col, n) {
  if (colCache?.[col]) {
    const src = colCache[col];
    const sc = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = src[i];
      sc[i] = Number.isFinite(v) ? v : null;
    }
    return sc;
  }
  return null;
}

function buildGroupIndex(rows, groupCols) {
  const cols = (groupCols || []).filter(Boolean);
  const groupIdx = {};
  if (!cols.length) return { cols, groupIdx, groupKeys: [] };
  for (let i = 0; i < rows.length; i++) {
    const gk = groupKeyFromRow(rows[i], cols);
    if (!groupIdx[gk]) groupIdx[gk] = [];
    groupIdx[gk].push(i);
  }
  const groupKeys = sortGroupKeys(Object.keys(groupIdx), cols);
  return { cols, groupIdx, groupKeys };
}

async function computeCorrelationMatrix(rows, cols, onProgress, colCache) {
  const n = rows.length;
  const cache = colCache || materializeScoreColumns(rows, cols);
  const colData = {};
  for (const c of cols) {
    colData[c] = scoreVectorFromCache(cache, c, n) || buildScoreVector(rows, c);
  }
  const matrix = {};
  for (let i = 0; i < cols.length; i++) {
    matrix[cols[i]] = matrix[cols[i]] || {};
    matrix[cols[i]][cols[i]] = 1;
    for (let j = i + 1; j < cols.length; j++) {
      const r = pearson(colData[cols[i]], colData[cols[j]]);
      matrix[cols[i]][cols[j]] = r;
      if (!matrix[cols[j]]) matrix[cols[j]] = {};
      matrix[cols[j]][cols[i]] = r;
    }
    if (onProgress && i % 3 === 0) {
      onProgress(i + 1, cols.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  for (const c of cols) {
    if (!matrix[c]) matrix[c] = {};
    for (const d of cols) {
      if (matrix[c][d] === undefined) matrix[c][d] = c === d ? 1 : null;
    }
  }
  return matrix;
}

function computeVarMissingStats(rows, col, colCache) {
  const n = rows.length;
  let missing = 0, valid = 0;
  if (colCache?.[col]) {
    const arr = colCache[col];
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(arr[i])) valid++;
      else missing++;
    }
  } else {
    for (const r of rows) {
      const v = parseModelScore(rowVal(r, col));
      if (v == null) missing++;
      else valid++;
    }
  }
  return { col, count: n, valid, missing, missingRate: n ? (missing / n) * 100 : 100 };
}

/**
 * Metrics + optional dist groups in one pass.
 * @param {{ colCache?: object, groupIndex?: { cols, groupIdx, groupKeys }, withDist?: boolean }} [opts]
 */
function computeVarMetrics(rows, y, col, groupCols, ivBins, opts) {
  opts = opts || {};
  const n = rows.length;
  const rawSc = scoreVectorFromCache(opts.colCache, col, n) || buildScoreVector(rows, col);
  const { sc, scoreNegated } = resolveRiskScores(y, rawSc);
  const overallBundle = computeDiscriminationBundle(y, sc, ivBins);
  const overall = {
    auc: overallBundle.auc,
    ks: overallBundle.ks,
    iv: overallBundle.iv,
    scoreNegated,
  };
  const result = { col, overall, groups: [], distSpec: null };
  const gi = opts.groupIndex || buildGroupIndex(rows, groupCols);
  const cols = gi.cols;
  if (!cols.length) return result;

  const binRule = buildEqualFreqBinRule(rows, col, ivBins);
  const expectedCounts = countBinLabels(rows, col, binRule);
  const distGroups = opts.withDist ? [] : null;

  for (const gk of gi.groupKeys) {
    const idx = gi.groupIdx[gk];
    const parts = groupPartsFromKey(gk, cols);
    const yG = new Array(idx.length);
    const scG = new Array(idx.length);
    const groupRows = new Array(idx.length);
    const distVals = opts.withDist ? [] : null;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      yG[k] = y[i];
      scG[k] = sc[i];
      groupRows[k] = rows[i];
      if (distVals && Number.isFinite(sc[i])) distVals.push(sc[i]);
    }
    const bundle = computeDiscriminationBundle(yG, scG, ivBins);
    const actualCounts = countBinLabels(groupRows, col, binRule);
    result.groups.push({
      group: parts.join(" · "),
      groupParts: parts,
      auc: bundle.auc,
      ks: bundle.ks,
      iv: bundle.iv,
      psi: computePSI(expectedCounts, actualCounts),
    });
    if (distVals) {
      distGroups.push({
        label: parts.join(" · "),
        groupParts: parts,
        values: distVals,
        n: distVals.length,
      });
    }
  }
  if (opts.withDist) {
    result.distSpec = { var: col, scoreNegated, groups: distGroups, groupCols: cols };
  }
  return result;
}

function computeSampleDistBins(postRows, y, col, nBins = 5) {
  const rule = buildEqualFreqBinRule(postRows, col, nBins);
  const labels = binLabelOrder(rule);
  const binCounts = Object.fromEntries(labels.map((l) => [l, { total: 0, good: 0, bad: 0 }]));
  let validTotal = 0;
  for (let i = 0; i < postRows.length; i++) {
    const n = parseModelScore(rowVal(postRows[i], col));
    if (n == null) continue;
    const lab = getBinnedLabel(rowVal(postRows[i], col), rule, postRows[i]);
    if (!binCounts[lab]) continue;
    validTotal++;
    binCounts[lab].total++;
    if (isBadLabel(y[i])) binCounts[lab].bad++;
    else binCounts[lab].good++;
  }
  return labels.map((label) => {
    const b = binCounts[label] || { total: 0, good: 0, bad: 0 };
    return {
      label,
      count: b.total,
      samplePct: validTotal ? (b.total / validTotal) * 100 : 0,
      goodPct: b.total ? (b.good / b.total) * 100 : 0,
      badPct: b.total ? (b.bad / b.total) * 100 : 0,
    };
  });
}

/** Prefer projecting from metrics results; fallback to standalone scan. */
function buildGroupDistSpecs(postRows, y, vars, groupCols, opts) {
  opts = opts || {};
  const cols = (groupCols || []).filter(Boolean);
  if (!cols.length) return [];
  if (opts.metricsByVar?.length) {
    return opts.metricsByVar
      .filter((m) => m?.distSpec)
      .map((m) => m.distSpec);
  }
  const groupIndex = opts.groupIndex || buildGroupIndex(postRows, cols);
  const colCache = opts.colCache;
  return (vars || []).map((v) => {
    const m = computeVarMetrics(postRows, y, v, cols, opts.ivBins || 5, {
      colCache,
      groupIndex,
      withDist: true,
    });
    return m.distSpec;
  }).filter(Boolean);
}

  Object.assign(target, {
    resolveRiskScores,
    buildYVector,
    buildScoreVector,
    materializeScoreColumns,
    buildGroupIndex,
    computeCorrelationMatrix,
    computeVarMetrics,
    computeVarMissingStats,
    computeSampleDistBins,
    buildGroupDistSpecs,
    isBadLabel,
    parseModelScore,
  });
})(window.RV);
