(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const binLabelOrder = RV.infra.binLabelOrder;
  const buildCustomShareBinRule = RV.infra.buildCustomShareBinRule;
  const buildDenWeightedBinRule = RV.infra.buildDenWeightedBinRule;
  const buildManualThresholdBinRule = RV.infra.buildManualThresholdBinRule;
  const countBinLabels = RV.infra.countBinLabels;
  const compareGroupKeys = RV.infra.compareGroupKeys;
  const getApplyVol = RV.infra.getApplyVol;
  const getBinnedLabel = RV.infra.getBinnedLabel;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const indexRowsByGroup = RV.infra.indexRowsByGroup;
  const parseNumericCell = RV.infra.parseNumericCell;
  const rowVal = RV.infra.rowVal;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const sumRatio = RV.infra.sumRatio;
  var domain = RV.domain = RV.domain || {};
  var target = domain.binning = domain.binning || {};

function sliceMatchesStratFilter(t, stratFilterMap) {
  const cols = t.stratCols || [];
  if (!cols.length) return true;
  if (!stratFilterMap || !Object.keys(stratFilterMap).length) return true;
  for (const col of cols) {
    const allowed = stratFilterMap[col];
    if (!allowed || !allowed.size) return false;
    if (!allowed.has(String(t.stratParts?.[col] ?? ""))) return false;
  }
  return true;
}
function rowAnySidebarRuleHit(row, hardRules, softRules) {
  const hitAny = RV.domain.rules.rowHitsAnyRule;
  return hitAny(row, hardRules) || hitAny(row, softRules);
}
function emptyPreApplyMetrics() {
  return { preApplyVol: null, preRuleHitApplyVol: null, preRuleMissApplyVol: null };
}
function aggregatePreApplyForRows(rows, hardRules, softRules) {
  if (!rows?.length) return emptyPreApplyMetrics();
  const hasRules = (hardRules?.length || 0) + (softRules?.length || 0) > 0;
  let preApplyVol = 0;
  let preRuleHitApplyVol = 0;
  let preRuleMissApplyVol = 0;
  for (const r of rows) {
    const vol = getApplyVol(r);
    preApplyVol += vol;
    if (hasRules) {
      if (rowAnySidebarRuleHit(r, hardRules, softRules)) preRuleHitApplyVol += vol;
      else preRuleMissApplyVol += vol;
    }
  }
  if (!hasRules) {
    return { preApplyVol, preRuleHitApplyVol: null, preRuleMissApplyVol: null };
  }
  return { preApplyVol, preRuleHitApplyVol, preRuleMissApplyVol };
}
function attachBinRowShareMetrics(rows) {
  if (!rows?.length) return rows;
  let totalDen = 0;
  let totalPreApply = 0;
  let totalPreHit = 0;
  let totalPreMiss = 0;
  let hasPreApplyData = false;
  let hasRuleHitMissData = false;
  for (const r of rows) {
    if (r.hasPostStrat !== false && r.den != null) totalDen += r.den;
    if (r.preApplyVol != null) {
      hasPreApplyData = true;
      totalPreApply += r.preApplyVol;
    }
    if (r.preRuleHitApplyVol != null) {
      hasRuleHitMissData = true;
      totalPreHit += r.preRuleHitApplyVol;
    }
    if (r.preRuleMissApplyVol != null) {
      hasRuleHitMissData = true;
      totalPreMiss += r.preRuleMissApplyVol;
    }
  }
  for (const r of rows) {
    if (r.hasPostStrat === false || r.den == null || r.den <= 0 || totalDen <= 0) {
      r.denSharePct = null;
    } else {
      r.denSharePct = (r.den / totalDen) * 100;
    }
    if (!hasPreApplyData || r.preApplyVol == null || r.preApplyVol <= 0 || totalPreApply <= 0) {
      r.preApplySharePct = null;
    } else {
      r.preApplySharePct = (r.preApplyVol / totalPreApply) * 100;
    }
    if (!hasRuleHitMissData || r.preRuleHitApplyVol == null || r.preRuleHitApplyVol <= 0 || totalPreHit <= 0) {
      r.preRuleHitSharePct = null;
    } else {
      r.preRuleHitSharePct = (r.preRuleHitApplyVol / totalPreHit) * 100;
    }
    if (!hasRuleHitMissData || r.preRuleMissApplyVol == null || r.preRuleMissApplyVol <= 0 || totalPreMiss <= 0) {
      r.preRuleMissSharePct = null;
    } else {
      r.preRuleMissSharePct = (r.preRuleMissApplyVol / totalPreMiss) * 100;
    }
  }
  return rows;
}
function mergeStratKeys(postGroups, preGroups, stratColList) {
  if (!stratColList.length) return ["全部"];
  const keys = new Set([...Object.keys(postGroups || {}), ...Object.keys(preGroups || {})]);
  return sortGroupKeys([...keys], stratColList);
}
function isSpecialBinLabel(label, rule) {
  if (!rule || label == null) return false;
  return label === rule.missingLabel || label === rule.negativeLabel;
}
function displayBinLabels(rule, { showSpecialBins = false } = {}) {
  if (showSpecialBins) return binLabelOrder(rule);
  return (rule.intervals || []).map((it) => it.label);
}
function countSpecialBinRows(rows, varCol, rule) {
  let nMissing = 0;
  let nNegative = 0;
  for (const r of rows || []) {
    const lab = getBinnedLabel(rowVal(r, varCol), rule, r);
    if (lab === rule.missingLabel) nMissing++;
    else if (lab === rule.negativeLabel) nNegative++;
  }
  return { nMissing, nNegative };
}
function buildMainBinRule(postRows, varCol, nBins, binMode, shares, denCol, manualThresholds) {
  if (binMode === "manual_thresholds") {
    return buildManualThresholdBinRule(postRows, varCol, manualThresholds?.[varCol] || []);
  }
  if (binMode === "custom_share" && shares?.length) {
    return buildCustomShareBinRule(postRows, varCol, shares, denCol);
  }
  return buildDenWeightedBinRule(postRows, varCol, nBins, denCol);
}
function computeBinRiskTables(
  postRows, preRows, hardRules, softRules, vars, nBins, stratCols, ratioSpec, overallRate,
  binMode, shares, showSpecialBins, manualThresholds
) {
  const tables = [];
  const excludedByVar = {};
  const shareDeviationByVar = {};
  const stratColList = stratCols || [];
  const postGroups = indexRowsByGroup(postRows, stratColList);
  const preGroups = indexRowsByGroup(preRows || [], stratColList);
  const stratKeys = mergeStratKeys(postGroups, preGroups, stratColList);
  const includeSpecial = !!showSpecialBins;

  for (const v of vars) {
    const rule = buildMainBinRule(postRows, v, nBins, binMode, shares, ratioSpec.den, manualThresholds);
    excludedByVar[v] = countSpecialBinRows(postRows, v, rule);
    if (rule.binMode === "custom_share" && rule.maxShareDevPct != null) {
      shareDeviationByVar[v] = {
        maxDevPct: rule.maxShareDevPct,
        actualShares: rule.actualDenShares,
        targetShares: rule.shares,
      };
    }
    const labels = displayBinLabels(rule, { showSpecialBins: includeSpecial });
    for (const sk of stratKeys) {
      const postSubset = stratColList.length ? (postGroups[sk] || []) : postRows;
      const preSubset = stratColList.length ? (preGroups[sk] || []) : (preRows || []);
      const hasPostStrat = postSubset.length > 0;
      const stratParts = {};
      if (stratColList.length) {
        const parts = groupPartsFromKey(sk, stratColList);
        stratColList.forEach((c, i) => { stratParts[c] = parts[i]; });
      }
      const postBinRows = {};
      const preBinRows = {};
      for (const lab of labels) {
        postBinRows[lab] = [];
        preBinRows[lab] = [];
      }
      for (const r of postSubset) {
        const lab = getBinnedLabel(rowVal(r, v), rule, r);
        if (!includeSpecial && isSpecialBinLabel(lab, rule)) continue;
        if (!postBinRows[lab]) postBinRows[lab] = [];
        postBinRows[lab].push(r);
      }
      for (const r of preSubset) {
        const lab = getBinnedLabel(rowVal(r, v), rule, r);
        if (!includeSpecial && isSpecialBinLabel(lab, rule)) continue;
        if (!preBinRows[lab]) preBinRows[lab] = [];
        preBinRows[lab].push(r);
      }
      const rowsOut = [];
      for (const lab of labels) {
        const br = postBinRows[lab] || [];
        const preBr = preBinRows[lab] || [];
        const postMetrics = hasPostStrat
          ? sumRatio(br, ratioSpec.num, ratioSpec.den)
          : { num: null, den: null, rate: null };
        const lift = hasPostStrat && overallRate && postMetrics.rate != null
          ? postMetrics.rate / overallRate
          : null;
        rowsOut.push({
          label: lab,
          num: postMetrics.num,
          den: postMetrics.den,
          rate: postMetrics.rate,
          lift,
          hasPostStrat,
          ...aggregatePreApplyForRows(preBr, hardRules, softRules),
        });
      }
      attachBinRowShareMetrics(rowsOut);
      tables.push({
        var: v,
        stratCols: stratColList,
        stratKey: stratColList.length ? sk : "__all__",
        stratParts,
        hasPostStrat,
        rule,
        rows: rowsOut,
      });
    }
  }
  return { tables, excludedByVar, shareDeviationByVar };
}
function computeCrossBinRiskTables(
  postRows,
  xVar,
  yVar,
  xBins,
  yBins,
  stratCols,
  ratioSpec,
  manualThresholds
) {
  if (!postRows?.length || !xVar || !yVar || !ratioSpec?.num || !ratioSpec?.den) {
    return { xLabels: [], yLabels: [], tables: [] };
  }
  const stratColList = stratCols || [];
  const groups = indexRowsByGroup(postRows, stratColList);
  const stratKeys = stratColList.length ? sortGroupKeys(Object.keys(groups), stratColList) : ["全部"];
  const mode = manualThresholds ? "manual_thresholds" : "equal_freq";
  const xRule = buildMainBinRule(postRows, xVar, Math.max(2, Math.min(20, xBins | 0)), mode, null, ratioSpec.den, manualThresholds);
  const yRule = buildMainBinRule(postRows, yVar, Math.max(2, Math.min(20, yBins | 0)), mode, null, ratioSpec.den, manualThresholds);
  const xLabels = displayBinLabels(xRule, { showSpecialBins: false });
  const yLabels = displayBinLabels(yRule, { showSpecialBins: false });
  const tables = [];

  for (const sk of stratKeys) {
    const subset = stratColList.length ? (groups[sk] || []) : postRows;
    if (!subset.length) continue;
    const stratParts = {};
    if (stratColList.length) {
      const parts = groupPartsFromKey(sk, stratColList);
      stratColList.forEach((c, i) => { stratParts[c] = parts[i]; });
    }
    const cells = xLabels.map(() =>
      yLabels.map(() => ({ num: 0, den: 0, rowCount: 0, rate: null, lowConfidence: false }))
    );
    const xPos = new Map(xLabels.map((lab, i) => [lab, i]));
    const yPos = new Map(yLabels.map((lab, i) => [lab, i]));

    for (const row of subset) {
      const xLab = getBinnedLabel(rowVal(row, xVar), xRule, row);
      const yLab = getBinnedLabel(rowVal(row, yVar), yRule, row);
      if (isSpecialBinLabel(xLab, xRule) || isSpecialBinLabel(yLab, yRule)) continue;
      const xi = xPos.get(xLab);
      const yi = yPos.get(yLab);
      if (xi == null || yi == null) continue;
      const c = cells[xi][yi];
      const num = Number(rowVal(row, ratioSpec.num));
      const den = Number(rowVal(row, ratioSpec.den));
      c.rowCount += 1;
      if (Number.isFinite(num)) c.num += num;
      if (Number.isFinite(den)) c.den += den;
    }
    let maxRate = 0;
    for (const row of cells) {
      for (const c of row) {
        c.rate = c.den > 0 ? (c.num / c.den) : null;
        c.lowConfidence = c.rowCount > 0 && c.rowCount < C.MIN_BIN_DRILL_ROWS;
        if (c.rate != null && Number.isFinite(c.rate)) maxRate = Math.max(maxRate, c.rate);
      }
    }
    tables.push({
      stratCols: stratColList,
      stratKey: stratColList.length ? sk : "__all__",
      stratParts,
      xVar,
      yVar,
      xLabels,
      yLabels,
      cells,
      maxRate,
    });
  }

  return {
    xVar,
    yVar,
    xBins,
    yBins,
    stratCols: stratColList,
    xLabels,
    yLabels,
    tables,
  };
}
function isDrillableBinLabel(label, rule) {
  if (!rule) return false;
  return !isSpecialBinLabel(label, rule);
}
function getBinSliceRows(sampleRows, slice) {
  if (!slice.stratCols?.length) return sampleRows || [];
  const groups = indexRowsByGroup(sampleRows || [], slice.stratCols);
  return groups[slice.stratKey] || [];
}
function getRowsInParentBin(postRows, slice, parentLabel) {
  const subset = getBinSliceRows(postRows, slice);
  const varCol = slice.var;
  const rule = slice.rule;
  return subset.filter((r) => getBinnedLabel(rowVal(r, varCol), rule, r) === parentLabel);
}
function getPreRowsInParentBin(preRows, slice, parentLabel) {
  return getRowsInParentBin(preRows, slice, parentLabel);
}
function computeSubBinMetricRows(postSubsetRows, preSubsetRows, varCol, subRule, ratioSpec, overallRate, hardRules, softRules) {
  const labels = binLabelOrder(subRule);
  const postBinRows = {};
  const preBinRows = {};
  for (const lab of labels) {
    postBinRows[lab] = [];
    preBinRows[lab] = [];
  }
  for (const r of postSubsetRows || []) {
    const lab = getBinnedLabel(rowVal(r, varCol), subRule, r);
    if (!postBinRows[lab]) postBinRows[lab] = [];
    postBinRows[lab].push(r);
  }
  for (const r of preSubsetRows || []) {
    const lab = getBinnedLabel(rowVal(r, varCol), subRule, r);
    if (!preBinRows[lab]) preBinRows[lab] = [];
    preBinRows[lab].push(r);
  }
  const hasPostParent = (postSubsetRows?.length || 0) > 0;
  const rowsOut = [];
  for (const lab of labels) {
    const br = postBinRows[lab] || [];
    const preBr = preBinRows[lab] || [];
    const postMetrics = hasPostParent
      ? sumRatio(br, ratioSpec.num, ratioSpec.den)
      : { num: null, den: null, rate: null };
    const lift = hasPostParent && overallRate != null && postMetrics.rate != null
      ? postMetrics.rate / overallRate
      : null;
    rowsOut.push({
      label: lab,
      num: postMetrics.num,
      den: postMetrics.den,
      rate: postMetrics.rate,
      lift,
      hasPostStrat: hasPostParent,
      ...aggregatePreApplyForRows(preBr, hardRules, softRules),
    });
  }
  return attachBinRowShareMetrics(rowsOut);
}
function collectDrillStratSlices(binTables, varName, parentLabel, stratFilterMap) {
  return (binTables || []).filter((t) => {
    if (t.var !== varName) return false;
    if (!sliceMatchesStratFilter(t, stratFilterMap)) return false;
    if (!isDrillableBinLabel(parentLabel, t.rule)) return false;
    return (t.rows || []).some((r) => r.label === parentLabel);
  });
}
function computeBinDrilldownMulti(
  postRows, preRows, hardRules, softRules,
  binTables, varName, parentLabel, subNBins, ratioSpec, overallRate, stratFilterMap, stratCols
) {
  const slicesIn = collectDrillStratSlices(binTables, varName, parentLabel, stratFilterMap);
  const subNBinsClamped = Math.max(2, Math.min(20, subNBins | 0));
  const result = {
    var: varName,
    parentLabel,
    subNBins: subNBinsClamped,
    stratCols: stratCols || [],
    subRule: null,
    parentRowCount: 0,
    slices: [],
  };

  if (!slicesIn.length) {
    return { ...result, error: "当前分层值筛选下无匹配的父箱数据" };
  }

  const allPostParentRows = [];
  const allPreParentRows = [];
  for (const slice of slicesIn) {
    allPostParentRows.push(...getRowsInParentBin(postRows, slice, parentLabel));
    allPreParentRows.push(...getPreRowsInParentBin(preRows, slice, parentLabel));
  }
  result.parentRowCount = allPostParentRows.length;
  const ruleBasisRows = allPostParentRows.length >= C.MIN_BIN_DRILL_ROWS
    ? allPostParentRows
    : allPostParentRows.concat(allPreParentRows);

  if (ruleBasisRows.length < C.MIN_BIN_DRILL_ROWS) {
    return {
      ...result,
      error: `父箱样本不足（${ruleBasisRows.length.toLocaleString()} 行，至少需要 ${C.MIN_BIN_DRILL_ROWS} 行）`,
    };
  }

  let validCount = 0;
  for (const r of ruleBasisRows) {
    if (parseNumericCell(rowVal(r, varName)).kind === "ok") validCount++;
  }
  if (validCount < 2) {
    return { ...result, error: `有效数值不足（${validCount.toLocaleString()} 行）` };
  }

  const subRule = buildDenWeightedBinRule(ruleBasisRows, varName, subNBinsClamped, ratioSpec.den);
  result.subRule = subRule;

  for (const slice of slicesIn) {
    const parentPostRows = getRowsInParentBin(postRows, slice, parentLabel);
    const parentPreRows = getPreRowsInParentBin(preRows, slice, parentLabel);
    if (!parentPostRows.length && !parentPreRows.length) continue;
    const rows = computeSubBinMetricRows(
      parentPostRows, parentPreRows, varName, subRule, ratioSpec, overallRate, hardRules, softRules
    );
    result.slices.push({
      stratKey: slice.stratKey,
      stratParts: slice.stratParts,
      parentRowCount: parentPostRows.length,
      rows,
    });
  }

  if (!result.slices.length) {
    return { ...result, error: "无分组可展示" };
  }
  return result;
}
function formatBinDrillPath(drill) {
  if (!drill) return "";
  return [drill.var, drill.parentLabel].filter(Boolean).join(" · ");
}
function flattenDrillSliceRows(drill) {
  const stratCols = drill?.stratCols || [];
  const sorted = [...(drill?.slices || [])].sort((a, b) => {
    const ka = a.stratKey === "__all__" ? "全部" : a.stratKey;
    const kb = b.stratKey === "__all__" ? "全部" : b.stratKey;
    return compareGroupKeys(ka, kb, stratCols);
  });
  const flat = [];
  for (const s of sorted) {
    for (const r of s.rows || []) {
      flat.push({ stratParts: s.stratParts, stratKey: s.stratKey, ...r });
    }
  }
  return flat;
}
/**
 * Reshape per-var binTables into a cross-var risk summary aligned by bin ordinal index.
 * Special bins (missing/negative) are excluded; only rule.intervals order is used.
 * Skips strat groups with no post sample for any shown var.
 * emptyReason: null | "no_vars" | "no_strat" | "no_post_strat"
 * cell.emptyReason: null | "no_bin" | "no_post" | "no_rate"
 */
function buildBinRiskSummary(binTables, { varsShown, stratFilterMap, varsOrder } = {}) {
  const byVarOnly = (binTables || []).filter((t) => {
    if (varsShown?.size && !varsShown.has(t.var)) return false;
    return true;
  });
  if (!byVarOnly.length) {
    return { stratCols: [], vars: [], maxBins: 0, rows: [], emptyReason: "no_vars" };
  }

  const collectVars = (tables) => {
    const seen = new Set();
    const vars = [];
    const preferOrder = Array.isArray(varsOrder) && varsOrder.length ? varsOrder : null;
    if (preferOrder) {
      for (const v of preferOrder) {
        if (varsShown?.size && !varsShown.has(v)) continue;
        if (tables.some((t) => t.var === v) && !seen.has(v)) {
          seen.add(v);
          vars.push(v);
        }
      }
    }
    for (const t of tables) {
      if (!seen.has(t.var)) {
        seen.add(t.var);
        vars.push(t.var);
      }
    }
    return vars;
  };

  const filtered = byVarOnly.filter((t) => sliceMatchesStratFilter(t, stratFilterMap || {}));
  if (!filtered.length) {
    return {
      stratCols: byVarOnly[0]?.stratCols || [],
      vars: collectVars(byVarOnly),
      maxBins: 0,
      rows: [],
      emptyReason: "no_strat",
    };
  }

  const vars = collectVars(filtered);
  const stratCols = filtered[0]?.stratCols || [];
  const byStrat = new Map();
  let maxBins = 0;

  for (const t of filtered) {
    let ordered = [];
    if (t.rule?.intervals?.length) {
      for (const it of t.rule.intervals) {
        const row = (t.rows || []).find((r) => r.label === it.label);
        if (row) ordered.push(row);
      }
    } else {
      for (const r of t.rows || []) {
        if (!isSpecialBinLabel(r.label, t.rule)) ordered.push(r);
      }
    }
    maxBins = Math.max(maxBins, ordered.length);
    const sk = t.stratKey || "__all__";
    if (!byStrat.has(sk)) {
      byStrat.set(sk, { stratKey: sk, stratParts: t.stratParts || {}, byVar: {} });
    }
    byStrat.get(sk).byVar[t.var] = ordered;
  }

  if (!maxBins || !vars.length) {
    return { stratCols, vars, maxBins: 0, rows: [], emptyReason: "no_vars" };
  }

  const stratKeys = [...byStrat.keys()].sort((a, b) => {
    const ka = a === "__all__" ? "全部" : a;
    const kb = b === "__all__" ? "全部" : b;
    return compareGroupKeys(ka, kb, stratCols);
  });

  const rows = [];
  for (const sk of stratKeys) {
    const entry = byStrat.get(sk);
    const stratHasPost = vars.some((v) =>
      (entry.byVar[v] || []).some((r) => r && r.hasPostStrat !== false)
    );
    if (!stratHasPost) continue;

    for (let i = 1; i <= maxBins; i++) {
      const cells = {};
      for (const v of vars) {
        const cellRow = entry.byVar[v]?.[i - 1];
        if (!cellRow) {
          cells[v] = { rate: null, den: null, label: null, emptyReason: "no_bin" };
        } else if (cellRow.hasPostStrat === false) {
          cells[v] = {
            rate: null,
            den: cellRow.den ?? null,
            label: cellRow.label ?? null,
            emptyReason: "no_post",
          };
        } else if (cellRow.rate == null || !Number.isFinite(cellRow.rate)) {
          cells[v] = {
            rate: null,
            den: cellRow.den ?? null,
            label: cellRow.label ?? null,
            emptyReason: "no_rate",
          };
        } else {
          cells[v] = {
            rate: cellRow.rate,
            den: cellRow.den,
            label: cellRow.label,
            emptyReason: null,
          };
        }
      }
      rows.push({
        stratKey: sk,
        stratParts: entry.stratParts,
        binIndex: i,
        cells,
      });
    }
  }

  if (!rows.length) {
    return { stratCols, vars, maxBins, rows: [], emptyReason: "no_post_strat" };
  }

  return { stratCols, vars, maxBins, rows, emptyReason: null };
}

/**
 * Pure preview data for manual-threshold bins (no DOM).
 * @returns {{ ok:true, sampleN, items:[{ var, cuts, labels, counts, shares }] } | { ok:false, reason:string }}
 */
function buildManualThresholdPreviewData(postRows, thresholdMap, vars) {
  if (!postRows?.length) {
    return { ok: false, reason: "empty_sample" };
  }
  const usedVars = (vars || []).filter((v) => thresholdMap?.[v]?.length);
  if (!usedVars.length) {
    return { ok: false, reason: "no_thresholds" };
  }
  const sampleN = postRows.length;
  const items = [];
  for (const v of usedVars) {
    const cuts = thresholdMap[v] || [];
    const rule = buildManualThresholdBinRule(postRows, v, cuts);
    const labels = [rule.missingLabel, rule.negativeLabel, ...(rule.intervals || []).map((it) => it.label)];
    const counts = countBinLabels(postRows, v, rule);
    const shares = labels.map((_, i) => {
      const c = counts[i] || 0;
      return sampleN ? (c / sampleN) * 100 : 0;
    });
    items.push({ var: v, cuts, labels, counts, shares });
  }
  return { ok: true, sampleN, items };
}

  Object.assign(target, {
    buildMainBinRule, isSpecialBinLabel, displayBinLabels, countSpecialBinRows, attachBinRowShareMetrics,
    sliceMatchesStratFilter, computeBinRiskTables, isDrillableBinLabel,
    getBinSliceRows, getRowsInParentBin, getPreRowsInParentBin,
    computeSubBinMetricRows, collectDrillStratSlices, computeBinDrilldownMulti,
    formatBinDrillPath, flattenDrillSliceRows, aggregatePreApplyForRows, computeCrossBinRiskTables,
    buildBinRiskSummary, buildManualThresholdPreviewData,
  });
})(window.RV);
