(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const aggregateRows = RV.domain.rules.aggregateRows;
  const buildHardUnionMask = RV.domain.rules.buildHardUnionMask;
  const computeRuleVolumes = RV.domain.rules.computeRuleVolumes;
  const evalRule = RV.domain.rules.evalRule;
  const getApplyVol = RV.infra.getApplyVol;
  const getPassVol = RV.infra.getPassVol;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const indexRowsByGroup = RV.infra.indexRowsByGroup;
  const ruleDisplayName = RV.domain.rules.ruleDisplayName;
  const safeRate = RV.infra.safeRate;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  var domain = RV.domain = RV.domain || {};
  var target = domain.preStrategy = domain.preStrategy || {};

function buildHitMap(hitMetrics) {
  const m = {};
  [...hitMetrics.hardRows, ...hitMetrics.softRows].forEach((r) => { m[r.rule.id] = r; });
  return m;
}

async function computeHitMetrics(preRows, hardRules, softRules, onProgress) {
  const overview = await aggregateRows(preRows, onProgress);
  const totalApply = overview.totalApply;

  const hardVol = hardRules.length
    ? (await computeRuleVolumes(preRows, hardRules, null, onProgress)).volumes
    : [];
  const hardUnionMask = await buildHardUnionMask(preRows, hardRules, onProgress);
  const softAgg = softRules.length
    ? await computeRuleVolumes(preRows, softRules, hardUnionMask, onProgress)
    : { volumes: [], onlyVolumes: [] };

  const hardRows = hardRules.map((r, i) => ({
    rule: r,
    name: ruleDisplayName(r),
    kind: "hard",
    hitVol: hardVol[i] || 0,
    hitRate: safeRate(hardVol[i] || 0, totalApply),
    onlyVol: null,
    onlyRate: null,
  }));

  const softRows = softRules.map((r, i) => ({
    rule: r,
    name: ruleDisplayName(r),
    kind: "soft",
    hitVol: softAgg.volumes[i] || 0,
    hitRate: safeRate(softAgg.volumes[i] || 0, totalApply),
    onlyVol: softAgg.onlyVolumes[i] || 0,
    onlyRate: safeRate(softAgg.onlyVolumes[i] || 0, totalApply),
  }));

  const hardUnionVol = (() => {
    let s = 0;
    for (let i = 0; i < preRows.length; i++) {
      if (hardUnionMask[i]) s += getApplyVol(preRows[i]);
    }
    return s;
  })();

  return { overview, totalApply, hardUnionVol, hardRows, softRows };
}
function collectWaterfallStepRows(rows, orderedRules) {
  const byRule = new Map();
  for (const rule of orderedRules) byRule.set(rule.id, []);
  const n = rows.length;
  const cumulative = new Array(n).fill(false);
  for (const rule of orderedRules) {
    const stepRows = byRule.get(rule.id) || [];
    for (let i = 0; i < n; i++) {
      if (!cumulative[i] && evalRule(rows[i], rule)) {
        stepRows.push(rows[i]);
        cumulative[i] = true;
      }
    }
  }
  return byRule;
}
function buildHardUnionMaskSync(rows, hardRules) {
  const mask = new Array(rows.length).fill(false);
  if (!hardRules.length) return mask;
  for (let i = 0; i < rows.length; i++) {
    for (const r of hardRules) {
      if (evalRule(rows[i], r)) { mask[i] = true; break; }
    }
  }
  return mask;
}
function collectOnlyHitRows(rows, hardRules, softRules) {
  const byRule = new Map();
  for (const r of softRules) byRule.set(r.id, []);
  if (!softRules.length) return byRule;

  const hardUnionMask = buildHardUnionMaskSync(rows, hardRules);
  const n = rows.length;
  for (let i = 0; i < n; i++) {
    const hardExcluded = hardUnionMask[i];
    const hits = softRules.map((r) => evalRule(rows[i], r));
    for (let j = 0; j < softRules.length; j++) {
      if (!hits[j] || hardExcluded) continue;
      let only = true;
      for (let k = 0; k < softRules.length; k++) {
        if (k !== j && hits[k]) { only = false; break; }
      }
      if (only) byRule.get(softRules[j].id).push(rows[i]);
    }
  }
  return byRule;
}
async function computeWaterfall(preRows, orderedRules, onProgress) {
  const totalApply = (await aggregateRows(preRows)).totalApply;
  const n = preRows.length;
  const cumulative = new Array(n).fill(false);
  const steps = [];

  for (const rule of orderedRules) {
    let stepVol = 0;
    for (let i = 0; i < n; i++) {
      if (!cumulative[i] && evalRule(preRows[i], rule)) {
        stepVol += getApplyVol(preRows[i]);
        cumulative[i] = true;
      }
    }
    steps.push({
      rule,
      name: ruleDisplayName(rule),
      kind: rule.isHard ? "hard" : "soft",
      stepVol,
      stepRate: safeRate(stepVol, totalApply),
      cumVol: steps.reduce((s, x) => s + x.stepVol, 0) + stepVol,
    });
    if (onProgress) await new Promise((r) => setTimeout(r, 0));
  }
  const totalReject = steps.reduce((s, x) => s + x.stepVol, 0);
  return { totalApply, steps, totalReject, remainVol: totalApply - totalReject };
}
async function computePreGroupOverview(preRows, groupCols, onProgress) {
  const overview = await aggregateRows(preRows, onProgress);
  if (!groupCols.length) {
    return { overview, trend: [], groupCols: [] };
  }
  const groups = indexRowsByGroup(preRows, groupCols);
  const trend = sortGroupKeys(Object.keys(groups), groupCols).map((g) => {
    const rows = groups[g];
    let totalApply = 0, totalPass = 0;
    for (const r of rows) {
      totalApply += getApplyVol(r);
      totalPass += getPassVol(r);
    }
    const parts = groupPartsFromKey(g, groupCols);
    return {
      group: parts.join(" · "),
      groupParts: parts,
      totalApply,
      totalPass,
      passRate: safeRate(totalPass, totalApply),
    };
  });
  return { overview, trend, groupCols };
}

  Object.assign(target, {
    buildHitMap, computeHitMetrics, collectWaterfallStepRows, collectOnlyHitRows,
    computeWaterfall, computePreGroupOverview,
  });
})(window.RV);
