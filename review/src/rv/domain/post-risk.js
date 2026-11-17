(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const aggregateRows = RV.domain.rules.aggregateRows;
  const getApplyVol = RV.infra.getApplyVol;
  const groupPartsFromKey = RV.infra.groupPartsFromKey;
  const indexRowsByGroup = RV.infra.indexRowsByGroup;
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const sumRatio = RV.infra.sumRatio;
  var domain = RV.domain = RV.domain || {};
  var target = domain.postRisk = domain.postRisk || {};

async function computePostRisk(postRows, ratioSpecs, groupCols, onProgress) {
  const overview = await aggregateRows(postRows, onProgress);
  const overall = ratioSpecs.map((spec) => ({
    ...spec,
    ...sumRatio(postRows, spec.num, spec.den),
  }));

  const groups = indexRowsByGroup(postRows, groupCols);
  const trend = sortGroupKeys(Object.keys(groups), groupCols).map((g) => {
    const rows = groups[g];
    const apply = rows.reduce((s, r) => s + getApplyVol(r), 0);
    const parts = groupPartsFromKey(g, groupCols);
    const row = { group: parts.join(" · "), groupParts: parts, apply };
    for (const spec of ratioSpecs) {
      const { rate, num, den } = sumRatio(rows, spec.num, spec.den);
      row[spec.name] = rate;
      row[`${spec.name}_num`] = num;
      row[`${spec.name}_den`] = den;
    }
    return row;
  });

  return { overview, overall, trend, groupCols };
}

  Object.assign(target, { computePostRisk });
})(window.RV);
