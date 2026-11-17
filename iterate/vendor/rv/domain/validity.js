(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const binLabelOrder = RV.infra.binLabelOrder;
  const buildEqualFreqBinRule = RV.infra.buildEqualFreqBinRule;
  const buildHardUnionMask = RV.domain.rules.buildHardUnionMask;
  const buildHitMap = RV.domain.preStrategy.buildHitMap;
  const computeHitMetrics = RV.domain.preStrategy.computeHitMetrics;
  const computeWaterfall = RV.domain.preStrategy.computeWaterfall;
  const evalCompositeRule = RV.domain.rules.evalCompositeRule;
  const evalRule = RV.domain.rules.evalRule;
  const getApplyVol = RV.infra.getApplyVol;
  const getBinnedLabel = RV.infra.getBinnedLabel;
  const groupKeyFromRow = RV.infra.groupKeyFromRow;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const indexRowsByGroup = RV.infra.indexRowsByGroup;
  const parseNum = RV.infra.parseNum;
  const parseNumZero = RV.infra.parseNumZero;
  const rowVal = RV.infra.rowVal;
  const ruleDisplayName = RV.domain.rules.ruleDisplayName;
  const computeSummary = RV.domain.summary.computeSummary;
  const safeRate = RV.infra.safeRate;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const sumRatio = RV.infra.sumRatio;
  var domain = RV.domain = RV.domain || {};
  var target = domain.validity = domain.validity || {};

function rowMatchesRvGroupFilter(row, groupCols, filterMap) {
  for (let i = 0; i < groupCols.length; i++) {
    const col = groupCols[i];
    const allowed = filterMap[col];
    if (!allowed) continue;
    if (!allowed.size) return false;
    const val = String(row.groupParts?.[i] ?? "");
    if (!allowed.has(val)) return false;
  }
  return true;
}

async function computeValidityCrossTable(postRows, hardRules, softRules, customRules, groupCols, ratioSpec, onProgress) {
  const hardUnionMask = hardRules.length
    ? await buildHardUnionMask(postRows, hardRules, onProgress)
    : new Array(postRows.length).fill(false);

  const eligible = [];
  for (let i = 0; i < postRows.length; i++) {
    if (!hardUnionMask[i]) eligible.push(postRows[i]);
  }
  const hardExcluded = postRows.length - eligible.length;

  const customHits = customRules.map((r) => eligible.map((row) => evalCompositeRule(row, r.root)));
  const softHits = softRules.map((r) => eligible.map((row) => evalRule(row, r)));

  let groupIndexMap;
  let groupKeys;
  if (!groupCols.length) {
    groupKeys = ["__all__"];
    groupIndexMap = { __all__: eligible.map((_, i) => i) };
  } else {
    groupIndexMap = {};
    for (let i = 0; i < eligible.length; i++) {
      const k = groupKeyFromRow(eligible[i], groupCols);
      if (!groupIndexMap[k]) groupIndexMap[k] = [];
      groupIndexMap[k].push(i);
    }
    groupKeys = sortGroupKeys(Object.keys(groupIndexMap), groupCols);
  }

  const outRows = [];
  let progress = 0;
  const totalCombos = customRules.length * softRules.length * groupKeys.length;

  for (let ci = 0; ci < customRules.length; ci++) {
    const customRule = customRules[ci];
    for (let si = 0; si < softRules.length; si++) {
      const softRule = softRules[si];
      for (const gk of groupKeys) {
        const idxs = groupIndexMap[gk] || [];
        const parts = groupCols.length ? groupPartsFromKey(gk, groupCols) : [];
        const groupLabel = groupCols.length ? parts.join(" · ") : "全部";

        for (const seg of C.VALIDITY_SEGMENTS) {
          const segRows = [];
          for (const idx of idxs) {
            const cHit = customHits[ci][idx];
            const sHit = softHits[si][idx];
            if (seg.test(cHit, sHit)) segRows.push(eligible[idx]);
          }
          const { num, den, rate } = sumRatio(segRows, ratioSpec.num, ratioSpec.den);
          outRows.push({
            groupParts: parts,
            groupLabel,
            groupKey: gk,
            customRuleId: customRule.id,
            customRuleName: customRule.name,
            softRuleId: softRule.id,
            softRuleName: ruleDisplayName(softRule),
            segment: seg.key,
            segmentLabel: seg.label,
            num,
            den,
            rate,
            rowCount: segRows.length,
          });
        }
        progress++;
        if (onProgress && progress % 20 === 0) {
          onProgress(progress, totalCombos);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  }

  return { rows: outRows, eligibleCount: eligible.length, hardExcluded, groupCols };
}
function aggregateQuadrantRows(rows, { byGroup = false } = {}) {
  const map = new Map();
  for (const r of rows) {
    const key = byGroup
      ? `${r.groupKey}\u0001${r.customRuleId}\u0001${r.softRuleId}\u0001${r.segment}`
      : `${r.customRuleId}\u0001${r.softRuleId}\u0001${r.segment}`;
    const cur = map.get(key) || {
      groupKey: r.groupKey,
      groupParts: r.groupParts,
      customRuleId: r.customRuleId,
      customRuleName: r.customRuleName,
      softRuleId: r.softRuleId,
      softRuleName: r.softRuleName,
      segment: r.segment,
      segmentLabel: r.segmentLabel,
      num: 0,
      den: 0,
    };
    cur.num += r.num;
    cur.den += r.den;
    map.set(key, cur);
  }
  const out = [];
  for (const cur of map.values()) {
    cur.rate = safeRate(cur.num, cur.den);
    out.push(cur);
  }
  return out;
}
function pivotQuadrantAggregates(aggregatedRows) {
  const map = new Map();
  for (const r of aggregatedRows) {
    const key = r.groupKey != null && r.groupKey !== "__all__"
      ? `${r.groupKey}\u0001${r.customRuleId}\u0001${r.softRuleId}`
      : `${r.customRuleId}\u0001${r.softRuleId}`;
    if (!map.has(key)) {
      map.set(key, {
        groupKey: r.groupKey,
        groupParts: r.groupParts,
        customRuleId: r.customRuleId,
        customRuleName: r.customRuleName,
        softRuleId: r.softRuleId,
        softRuleName: r.softRuleName,
        segments: {},
      });
    }
    map.get(key).segments[r.segment] = {
      num: r.num, den: r.den, rate: r.rate, segmentLabel: r.segmentLabel,
    };
  }
  return [...map.values()];
}
function sortPivotQuadrantRows(pivotRows, groupCols) {
  return pivotRows.sort((a, b) => {
    if (groupCols?.length) {
      const gkA = a.groupKey || "";
      const gkB = b.groupKey || "";
      if (gkA !== gkB) {
        const keys = sortGroupKeys([gkA, gkB], groupCols);
        return keys.indexOf(gkA) - keys.indexOf(gkB);
      }
    }
    const cn = (a.customRuleName || "").localeCompare(b.customRuleName || "", "zh-CN");
    if (cn) return cn;
    return (a.softRuleName || "").localeCompare(b.softRuleName || "", "zh-CN");
  });
}
function customRulesAsSoftRules(customRules) {
  return (customRules || []).map((r) => ({
    id: r.id,
    name: r.name,
    type: "composite",
    root: r.root,
    isHard: false,
  }));
}
function dedupeWaterfallRules(rules) {
  const seen = new Set();
  const out = [];
  for (const r of rules || []) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
function filterPreRowsByRvGroupFilter(preRows, groupCols, filterMap) {
  if (!groupCols?.length || !filterMap) return preRows;
  return preRows.filter((row) => {
    const parts = groupCols.map((c) => String(rowVal(row, c) ?? ""));
    return rowMatchesRvGroupFilter({ groupParts: parts }, groupCols, filterMap);
  });
}
function rowOnlineReject(row, hardRules, softRules) {
  for (const r of hardRules) {
    if (evalRule(row, r)) return true;
  }
  for (const r of softRules) {
    if (evalRule(row, r)) return true;
  }
  return false;
}
function rowNewReject(row, hardRules, customRules) {
  for (const r of hardRules) {
    if (evalRule(row, r)) return true;
  }
  for (const cr of customRules) {
    if (cr.root && evalCompositeRule(row, cr.root)) return true;
  }
  return false;
}
/** Keep rows that pass the new strategy (miss hard ∪ candidate). Uses hit masks when available. */
function filterNewStrategyPassRows(rows, hardRules, customRules) {
  const hard = hardRules || [];
  const custom = customRules || [];
  const list = rows || [];
  if (!list.length) return [];
  if (!hard.length && !custom.length) return list.slice();

  const buildMasks = RV.domain.rules?.buildHitMasksForRules;
  if (typeof buildMasks === "function") {
    const allRules = [...hard, ...custom].filter(Boolean);
    const masks = buildMasks(list, allRules);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      let reject = false;
      for (let j = 0; j < masks.length; j++) {
        if (masks[j]?.[i]) { reject = true; break; }
      }
      if (!reject) out.push(list[i]);
    }
    return out;
  }
  return list.filter((r) => !rowNewReject(r, hard, custom));
}
function emptySwapSegmentAgg() {
  return { rowCount: 0, applyVol: 0, applyShare: null, risk: { num: 0, den: 0, rate: null } };
}
function addSwapSegmentRisk(target, row, numCol, denCol) {
  if (!target.risk) target.risk = { num: 0, den: 0, rate: null };
  target.risk.num += parseNumZero(rowVal(row, numCol));
  target.risk.den += parseNumZero(rowVal(row, denCol));
}
function finalizeSwapSegmentRisk(target) {
  if (!target?.risk) return;
  target.risk.rate = safeRate(target.risk.num, target.risk.den);
}
function initSwapGroupAgg() {
  const segments = {};
  for (const seg of C.SWAP_SEGMENTS) segments[seg.key] = emptySwapSegmentAgg();
  return {
    totalRows: 0,
    totalApply: 0,
    segments,
    onlinePass: emptySwapSegmentAgg(),
    newPass: emptySwapSegmentAgg(),
  };
}
async function computeValiditySwapTable(
  preRows, postRows, hardRules, softRules, customRules, groupCols, ratioSpec, onProgress
) {
  const buildGroups = (rows) => {
    if (!groupCols.length) return { __all__: rows };
    return indexRowsByGroup(rows, groupCols);
  };

  const preGroups = buildGroups(preRows);
  const postGroups = buildGroups(postRows || []);
  const groupKeys = sortGroupKeys(
    [...new Set([...Object.keys(preGroups), ...Object.keys(postGroups)])],
    groupCols
  );

  const aggMap = {};
  for (const gk of groupKeys) {
    aggMap[gk] = {
      ...initSwapGroupAgg(),
      groupKey: gk,
      groupParts: groupCols.length ? groupPartsFromKey(gk, groupCols) : [],
    };
  }

  for (const gk of groupKeys) {
    const subset = preGroups[gk] || [];
    const agg = aggMap[gk];

    for (let i = 0; i < subset.length; i++) {
      const row = subset[i];
      const vol = getApplyVol(row);
      const oRej = rowOnlineReject(row, hardRules, softRules);
      const nRej = rowNewReject(row, hardRules, customRules);

      agg.totalRows++;
      agg.totalApply += vol;

      for (const seg of C.SWAP_SEGMENTS) {
        if (seg.test(oRej, nRej)) {
          agg.segments[seg.key].rowCount++;
          agg.segments[seg.key].applyVol += vol;
        }
      }
      if (!oRej) {
        agg.onlinePass.rowCount++;
        agg.onlinePass.applyVol += vol;
      }
      if (!nRej) {
        agg.newPass.rowCount++;
        agg.newPass.applyVol += vol;
      }

      if (onProgress && i > 0 && i % 50000 === 0) {
        onProgress(i, subset.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const denom = agg.totalApply;
    for (const seg of C.SWAP_SEGMENTS) {
      const s = agg.segments[seg.key];
      s.applyShare = safeRate(s.applyVol, denom);
    }
    agg.onlinePass.applyShare = safeRate(agg.onlinePass.applyVol, denom);
    agg.newPass.applyShare = safeRate(agg.newPass.applyVol, denom);
    await new Promise((r) => setTimeout(r, 0));
  }

  if (ratioSpec) {
    const numCol = ratioSpec.num;
    const denCol = ratioSpec.den;
    for (const gk of groupKeys) {
      const subset = postGroups[gk] || [];
      const agg = aggMap[gk];

      for (let i = 0; i < subset.length; i++) {
        const row = subset[i];
        const oRej = rowOnlineReject(row, hardRules, softRules);
        const nRej = rowNewReject(row, hardRules, customRules);

        for (const seg of C.SWAP_SEGMENTS) {
          if (seg.test(oRej, nRej)) {
            addSwapSegmentRisk(agg.segments[seg.key], row, numCol, denCol);
          }
        }
        if (!oRej) addSwapSegmentRisk(agg.onlinePass, row, numCol, denCol);
        if (!nRej) addSwapSegmentRisk(agg.newPass, row, numCol, denCol);

        if (onProgress && i > 0 && i % 50000 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const out = [];
  for (const gk of groupKeys) {
    const agg = aggMap[gk];
    for (const seg of C.SWAP_SEGMENTS) finalizeSwapSegmentRisk(agg.segments[seg.key]);
    finalizeSwapSegmentRisk(agg.onlinePass);
    finalizeSwapSegmentRisk(agg.newPass);
    out.push({
      groupKey: agg.groupKey,
      groupParts: agg.groupParts,
      totalRows: agg.totalRows,
      totalApply: agg.totalApply,
      segments: agg.segments,
      onlinePass: agg.onlinePass,
      newPass: agg.newPass,
    });
  }
  return out;
}
function emptyRiskEstBinBucket(lab) {
  return {
    binLabel: lab,
    segments: Object.fromEntries(C.SWAP_SEGMENTS.map((s) => [s.key, 0])),
    newPassDen: 0,
    newPassNum: 0,
    newPassRate: null,
    newRejectDen: 0,
    newRejectNum: 0,
    newRejectRate: null,
    inferredRisk: null,
  };
}
function computeRiskEstTable(
  riskPostRows, preRows, binCol, nBins, multiplier, hardRules, softRules, customRules, ratioSpec
) {
  nBins = Math.max(2, Math.min(20, nBins | 0));
  multiplier = Number.isFinite(multiplier) ? multiplier : 1;
  const rule = buildEqualFreqBinRule(riskPostRows, binCol, nBins);
  const labels = binLabelOrder(rule);
  const binMap = {};
  for (const lab of labels) {
    binMap[lab] = emptyRiskEstBinBucket(lab);
  }

  if (ratioSpec) {
    const numCol = ratioSpec.num;
    const denCol = ratioSpec.den;
    for (const row of riskPostRows) {
      const lab = getBinnedLabel(rowVal(row, binCol), rule, row);
      const bucket = binMap[lab];
      if (!bucket) continue;
      const nRej = rowNewReject(row, hardRules, customRules);
      const num = parseNumZero(rowVal(row, numCol));
      const den = parseNumZero(rowVal(row, denCol));
      if (nRej) {
        bucket.newRejectNum += num;
        bucket.newRejectDen += den;
      } else {
        bucket.newPassNum += num;
        bucket.newPassDen += den;
      }
    }
  }

  for (const row of preRows) {
    const lab = getBinnedLabel(rowVal(row, binCol), rule, row);
    const bucket = binMap[lab];
    if (!bucket) continue;
    const oRej = rowOnlineReject(row, hardRules, softRules);
    const nRej = rowNewReject(row, hardRules, customRules);
    for (const seg of C.SWAP_SEGMENTS) {
      if (seg.test(oRej, nRej)) bucket.segments[seg.key]++;
    }
  }

  const rows = labels.map((lab) => {
    const b = binMap[lab];
    b.newPassRate = safeRate(b.newPassNum, b.newPassDen);
    b.newRejectRate = safeRate(b.newRejectNum, b.newRejectDen);
    b.inferredRisk = b.newPassRate != null ? b.newPassRate * multiplier : null;
    return b;
  });

  return { rule, rows, binCol, multiplier };
}
async function computeValidityPreHitTable(preRows, hardRules, customRules, groupCols, waterfallOrder) {
  const customSoft = customRulesAsSoftRules(customRules);
  const order = waterfallOrder?.length ? waterfallOrder : [...hardRules, ...customSoft];
  let groupKeys;
  let groups;
  if (!groupCols.length) {
    groupKeys = ["__all__"];
    groups = { __all__: preRows };
  } else {
    groups = indexRowsByGroup(preRows, groupCols);
    groupKeys = sortGroupKeys(Object.keys(groups), groupCols);
  }

  const out = [];
  for (const gk of groupKeys) {
    const subset = groups[gk] || [];
    const parts = groupCols.length ? groupPartsFromKey(gk, groupCols) : [];
    const hitMetrics = await computeHitMetrics(subset, hardRules, customSoft);
    const wf = await computeWaterfall(subset, order);
    const hitMap = buildHitMap(hitMetrics);
    const stepMap = {};
    wf.steps.forEach((s) => { stepMap[s.rule.id] = s; });

    for (const rule of order) {
      const hit = hitMap[rule.id] || {};
      const step = stepMap[rule.id] || {};
      out.push({
        groupKey: gk,
        groupParts: parts,
        ruleId: rule.id,
        ruleName: ruleDisplayName(rule),
        kind: rule.isHard ? "hard" : "custom",
        hitVol: hit.hitVol || 0,
        hitRate: hit.hitRate ?? null,
        onlyVol: hit.onlyVol ?? null,
        onlyRate: hit.onlyRate ?? null,
        stepVol: step.stepVol || 0,
        stepRate: step.stepRate ?? null,
        cumVol: step.cumVol || 0,
      });
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
function getRvPreHitFirstGroupKey(preHitRows, groupCols) {
  if (!groupCols?.length || !preHitRows?.length) return null;
  const keys = sortGroupKeys([...new Set(preHitRows.map((r) => r.groupKey))], groupCols);
  return keys[0] || null;
}
async function computeValidityPostWaterfallRisk(postRows, hardRules, customRules, waterfallOrder) {
  const customSoft = customRulesAsSoftRules(customRules);
  const order = dedupeWaterfallRules(
    waterfallOrder?.length ? waterfallOrder : [...hardRules, ...customSoft]
  );
  const summary = await computeSummary(postRows, hardRules, customSoft, [], order);
  const customIds = new Set(customSoft.map((r) => r.id));
  summary.rows = (summary.rows || []).map((r) => ({
    ...r,
    kind: r.kind === "hard" ? "hard" : customIds.has(r.ruleId) ? "custom" : r.kind,
  }));
  return summary;
}

  Object.assign(target, { computeValidityCrossTable, aggregateQuadrantRows, pivotQuadrantAggregates, sortPivotQuadrantRows, customRulesAsSoftRules, dedupeWaterfallRules, filterPreRowsByRvGroupFilter, rowOnlineReject, rowNewReject, filterNewStrategyPassRows, emptySwapSegmentAgg, addSwapSegmentRisk, finalizeSwapSegmentRisk, initSwapGroupAgg, computeValiditySwapTable, emptyRiskEstBinBucket, computeRiskEstTable, computeValidityPreHitTable, getRvPreHitFirstGroupKey, computeValidityPostWaterfallRisk });
})(window.RV);
