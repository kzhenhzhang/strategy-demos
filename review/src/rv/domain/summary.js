(function (RV) {
"use strict";
  const collectOnlyHitRows = RV.domain.preStrategy.collectOnlyHitRows;
  const collectWaterfallStepRows = RV.domain.preStrategy.collectWaterfallStepRows;
  const evalRule = RV.domain.rules.evalRule;
  const buildHitMasksForRules = RV.domain.rules.buildHitMasksForRules;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const indexRowsByGroup = RV.infra.indexRowsByGroup;
  const ruleDisplayName = RV.domain.rules.ruleDisplayName;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const sumRatio = RV.infra.sumRatio;
  var domain = RV.domain = RV.domain || {};
  var target = domain.summary = domain.summary || {};

const MISS_ALL_RULES_SEGMENT_ID = "segment_miss_all_rules";
const MISS_ALL_RULES_SEGMENT_NAME = "未命中任意规则";

function riskDenAndRate(rows, riskSpec) {
  if (!riskSpec) return { rate: null, den: null };
  const { rate, den } = sumRatio(rows, riskSpec.num, riskSpec.den);
  return { rate, den };
}
function ruleReviewMetrics(hitRows, missRows, riskSpec) {
  if (!riskSpec) {
    return { postHitVol: null, postMissVol: null, riskHit: null, riskMiss: null };
  }
  const hit = sumRatio(hitRows, riskSpec.num, riskSpec.den);
  const miss = sumRatio(missRows, riskSpec.num, riskSpec.den);
  return {
    postHitVol: hit.den,
    postMissVol: miss.den,
    riskHit: hit.rate,
    riskMiss: miss.rate,
  };
}

/** OR of per-rule hit masks → any sidebar hard∪soft hit. */
function buildAnyHitMask(masks, n) {
  const anyHit = new Uint8Array(n);
  for (let ri = 0; ri < (masks || []).length; ri++) {
    const mask = masks[ri];
    if (!mask) continue;
    for (let i = 0; i < n; i++) {
      if (mask[i]) anyHit[i] = 1;
    }
  }
  return anyHit;
}

function missAllSegmentRow(postHitRows, postMissRows, riskSpec) {
  return {
    ruleId: MISS_ALL_RULES_SEGMENT_ID,
    name: MISS_ALL_RULES_SEGMENT_NAME,
    kind: "segment",
    ...ruleReviewMetrics(postHitRows, postMissRows, riskSpec),
    wfHitRisk: null,
    wfHitDen: null,
    onlyHitRisk: null,
    onlyHitDen: null,
  };
}

function missAllTrendRow(parts, postHitRows, postMissRows, riskSpec) {
  return {
    group: parts.join(" · "),
    groupParts: parts,
    ruleName: MISS_ALL_RULES_SEGMENT_NAME,
    kind: "segment",
    ...ruleReviewMetrics(postHitRows, postMissRows, riskSpec),
  };
}

function computeSummaryTrend(postRows, allRules, groupCols, ratioSpecs, hitMasks) {
  if (!groupCols.length) return [];
  const riskSpec = ratioSpecs?.[0];
  const masks = hitMasks || buildHitMasksForRules(postRows, allRules);
  const postByGroup = indexRowsByGroup(postRows, groupCols);
  const groupKeys = sortGroupKeys(Object.keys(postByGroup), groupCols);
  const rowIndex = new Map();
  for (let i = 0; i < postRows.length; i++) rowIndex.set(postRows[i], i);

  const trend = [];
  for (let ri = 0; ri < allRules.length; ri++) {
    const rule = allRules[ri];
    const mask = masks[ri];
    for (const g of groupKeys) {
      const postG = postByGroup[g] || [];
      const parts = groupPartsFromKey(g, groupCols);
      const postHitRows = [], postMissRows = [];
      for (const r of postG) {
        const idx = rowIndex.get(r);
        const hit = mask && idx != null ? mask[idx] === 1 : evalRule(r, rule);
        if (hit) postHitRows.push(r);
        else postMissRows.push(r);
      }
      const m = ruleReviewMetrics(postHitRows, postMissRows, riskSpec);
      trend.push({
        group: parts.join(" · "),
        groupParts: parts,
        ruleName: ruleDisplayName(rule),
        kind: rule.isHard ? "hard" : "soft",
        ...m,
      });
    }
  }

  const anyHit = buildAnyHitMask(masks, postRows.length);
  for (const g of groupKeys) {
    const postG = postByGroup[g] || [];
    const parts = groupPartsFromKey(g, groupCols);
    const hitAnyRows = [], missAllRows = [];
    for (const r of postG) {
      const idx = rowIndex.get(r);
      if (idx != null && anyHit[idx]) hitAnyRows.push(r);
      else missAllRows.push(r);
    }
    trend.push(missAllTrendRow(parts, hitAnyRows, missAllRows, riskSpec));
  }
  return trend;
}

/**
 * @param {object[]} postRows
 * @param {object[]} hardRules
 * @param {object[]} softRules
 * @param {string[]} groupCols
 * @param {object[]} waterfallOrder
 * @param {object[]|function} [ratioSpecsOrOnProgress] — ratioSpecs preferred; legacy callers may pass onProgress
 * @param {function} [maybeOnProgress]
 */
async function computeSummary(postRows, hardRules, softRules, groupCols, waterfallOrder, ratioSpecsOrOnProgress, maybeOnProgress) {
  const allRules = [...hardRules, ...softRules];
  let ratioSpecs;
  let onProgress;
  if (typeof ratioSpecsOrOnProgress === "function") {
    ratioSpecs = null;
    onProgress = ratioSpecsOrOnProgress;
  } else if (Array.isArray(ratioSpecsOrOnProgress)) {
    ratioSpecs = ratioSpecsOrOnProgress;
    onProgress = maybeOnProgress;
  } else {
    ratioSpecs = null;
    onProgress = maybeOnProgress;
  }
  if (!ratioSpecs) {
    // Legacy fallback only — prefer App/UI passing ratioSpecs explicitly.
    ratioSpecs = RV.ui?.sidebar?.collectRatioSpecs?.() || [];
  }
  const riskMetric = ratioSpecs[0]?.name || "—";
  const rows = [];
  const riskSpec = ratioSpecs[0] || null;
  const order = waterfallOrder?.length ? waterfallOrder : allRules;
  const wfByRule = collectWaterfallStepRows(postRows, order);
  const onlyByRule = collectOnlyHitRows(postRows, hardRules, softRules);
  const hitMasks = buildHitMasksForRules(postRows, allRules);

  for (let ri = 0; ri < allRules.length; ri++) {
    const rule = allRules[ri];
    const mask = hitMasks[ri];
    const postHitRows = [], postMissRows = [];
    for (let i = 0; i < postRows.length; i++) {
      if (mask[i]) postHitRows.push(postRows[i]);
      else postMissRows.push(postRows[i]);
    }
    const wfRows = wfByRule.get(rule.id) || [];
    const wf = riskDenAndRate(wfRows, riskSpec);
    const onlyRows = rule.isHard ? [] : (onlyByRule.get(rule.id) || []);
    const only = rule.isHard ? { rate: null, den: null } : riskDenAndRate(onlyRows, riskSpec);

    rows.push({
      ruleId: rule.id,
      name: ruleDisplayName(rule),
      kind: rule.isHard ? "hard" : "soft",
      ...ruleReviewMetrics(postHitRows, postMissRows, riskSpec),
      wfHitRisk: wf.rate,
      wfHitDen: wf.den,
      onlyHitRisk: only.rate,
      onlyHitDen: only.den,
    });
    if (onProgress) await new Promise((r) => setTimeout(r, 0));
  }

  const anyHit = buildAnyHitMask(hitMasks, postRows.length);
  const hitAnyRows = [], missAllRows = [];
  for (let i = 0; i < postRows.length; i++) {
    if (anyHit[i]) hitAnyRows.push(postRows[i]);
    else missAllRows.push(postRows[i]);
  }
  rows.push(missAllSegmentRow(hitAnyRows, missAllRows, riskSpec));

  const trend = computeSummaryTrend(postRows, allRules, groupCols, ratioSpecs, hitMasks);
  return { rows, trend, groupCols, riskMetric, riskDenCol: riskSpec?.den || null };
}

  Object.assign(target, {
    MISS_ALL_RULES_SEGMENT_ID,
    MISS_ALL_RULES_SEGMENT_NAME,
    computeSummaryTrend,
    computeSummary,
  });
})(window.RV);
