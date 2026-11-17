(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const isBadLabel = RV.infra.isBadLabel;
  var domain = RV.domain = RV.domain || {};
  var target = domain.metrics = domain.metrics || {};

function computePSI(expectedCounts, actualCounts) {
  const totalE = expectedCounts.reduce((s, c) => s + c, 0);
  const totalA = actualCounts.reduce((s, c) => s + c, 0);
  if (!totalE || !totalA) return null;
  let psi = 0;
  for (let i = 0; i < expectedCounts.length; i++) {
    const ePct = Math.max(1e-6, expectedCounts[i] / totalE);
    const aPct = Math.max(1e-6, actualCounts[i] / totalA);
    psi += (aPct - ePct) * Math.log(aPct / ePct);
  }
  return psi;
}

function buildFinitePairs(y, scores) {
  const pairs = [];
  for (let i = 0; i < y.length; i++) {
    if (!Number.isFinite(scores[i])) continue;
    pairs.push({ y: y[i], s: scores[i] });
  }
  return pairs;
}

function aucFromAscPairs(pairs) {
  if (pairs.length < 2) return null;
  let nBad = 0, nGood = 0;
  for (const p of pairs) { if (isBadLabel(p.y)) nBad++; else nGood++; }
  if (!nBad || !nGood) return null;
  let rankSumBad = 0;
  for (let i = 0; i < pairs.length;) {
    let j = i + 1;
    while (j < pairs.length && pairs[j].s === pairs[i].s) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) { if (isBadLabel(pairs[k].y)) rankSumBad += avgRank; }
    i = j;
  }
  return (rankSumBad - (nBad * (nBad + 1)) / 2) / (nBad * nGood);
}

function ksFromAscPairs(pairs) {
  if (pairs.length < 2) return null;
  let nPos = 0, nNeg = 0;
  for (const p of pairs) { if (isBadLabel(p.y)) nPos++; else nNeg++; }
  if (!nPos || !nNeg) return null;
  let cumPos = 0, cumNeg = 0, ks = 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i];
    if (isBadLabel(p.y)) cumPos++; else cumNeg++;
    ks = Math.max(ks, Math.abs(cumPos / nPos - cumNeg / nNeg));
  }
  return ks;
}

function assignQuantileBinsFromAscScores(sortedScores, nBins) {
  const n = sortedScores.length;
  const binIdx = new Array(n);
  for (let r = 0; r < n; r++) {
    binIdx[r] = Math.min(nBins - 1, Math.floor((r * nBins) / n));
  }
  return binIdx;
}

function assignQuantileBins(scores, nBins) {
  const n = scores.length;
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s);
  const binIdx = new Array(n);
  for (let r = 0; r < n; r++) {
    binIdx[order[r].i] = Math.min(nBins - 1, Math.floor((r * nBins) / n));
  }
  return binIdx;
}

function mergeSparseIvBins(binRows, minBad, minGood) {
  if (binRows.length <= 1) return binRows;
  let changed = true;
  while (changed && binRows.length > 1) {
    changed = false;
    for (let i = 0; i < binRows.length; i++) {
      const b = binRows[i];
      if (b.bad >= minBad && b.good >= minGood) continue;
      const targetIdx = i < binRows.length - 1 ? i + 1 : i - 1;
      const t = binRows[targetIdx];
      t.count += b.count; t.bad += b.bad; t.good += b.good;
      binRows.splice(i, 1);
      changed = true;
      break;
    }
  }
  return binRows;
}

function ivFromAscPairs(pairs, nBins) {
  nBins = Math.max(3, Math.min(20, nBins | 0));
  if (pairs.length < nBins * 2) return null;
  let nBad = 0, nGood = 0;
  for (const p of pairs) { if (isBadLabel(p.y)) nBad++; else nGood++; }
  if (!nBad || !nGood) return null;
  const binAssign = assignQuantileBinsFromAscScores(pairs.map((p) => p.s), nBins);
  const binMap = new Map();
  for (let i = 0; i < pairs.length; i++) {
    const bi = binAssign[i];
    if (!binMap.has(bi)) binMap.set(bi, { bin: bi, count: 0, bad: 0, good: 0 });
    const b = binMap.get(bi);
    b.count++;
    if (isBadLabel(pairs[i].y)) b.bad++; else b.good++;
  }
  let binRows = [...binMap.values()].sort((a, b) => a.bin - b.bin);
  binRows = mergeSparseIvBins(
    binRows,
    Math.max(20, Math.floor(nBad / (nBins * 2))),
    Math.max(200, Math.floor(nGood / (nBins * 2)))
  );
  let iv = 0;
  for (const b of binRows) {
    const badDist = b.bad / nBad, goodDist = b.good / nGood;
    const woe = Math.log((badDist + C.IV_LOG_EPS) / (goodDist + C.IV_LOG_EPS));
    iv += (badDist - goodDist) * woe;
  }
  return iv;
}

/** One pair build + one ascending sort → AUC / KS / IV. */
function computeDiscriminationBundle(y, scores, nBins) {
  const pairs = buildFinitePairs(y, scores);
  if (pairs.length < 2) return { auc: null, ks: null, iv: null };
  pairs.sort((a, b) => a.s - b.s || 0);
  return {
    auc: aucFromAscPairs(pairs),
    ks: ksFromAscPairs(pairs),
    iv: ivFromAscPairs(pairs, nBins),
  };
}

function computeAUC(y, scores) {
  const pairs = buildFinitePairs(y, scores);
  if (pairs.length < 2) return null;
  pairs.sort((a, b) => a.s - b.s);
  return aucFromAscPairs(pairs);
}

function computeKS(y, scores) {
  const pairs = buildFinitePairs(y, scores);
  if (pairs.length < 2) return null;
  pairs.sort((a, b) => a.s - b.s);
  return ksFromAscPairs(pairs);
}

function computeIV(y, scores, nBins) {
  const pairs = buildFinitePairs(y, scores);
  nBins = Math.max(3, Math.min(20, nBins | 0));
  if (pairs.length < nBins * 2) return null;
  if (new Set(pairs.map((p) => p.y)).size < 2) return null;
  pairs.sort((a, b) => a.s - b.s);
  return ivFromAscPairs(pairs, nBins);
}

  Object.assign(target, {
    computePSI,
    computeAUC,
    computeKS,
    assignQuantileBins,
    mergeSparseIvBins,
    computeIV,
    computeDiscriminationBundle,
    buildFinitePairs,
  });
})(window.RV);
