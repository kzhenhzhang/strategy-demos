(function (RV) {
"use strict";
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  var domain = RV.domain = RV.domain || {};
  var target = domain.ruleMining = domain.ruleMining || {};

  function quantileCuts(sortedVals, maxCuts) {
    const n = sortedVals.length;
    if (n < 2) return [];
    const cuts = new Set();
    const steps = Math.max(2, Math.min(maxCuts, n - 1));
    for (let i = 1; i < steps; i++) {
      const idx = Math.min(n - 1, Math.floor((i / steps) * (n - 1)));
      const v = sortedVals[idx];
      if (v != null && Number.isFinite(v)) cuts.add(v);
    }
    return [...cuts].sort((a, b) => a - b);
  }

  function collectFiniteAligned(rows, y, col) {
    const values = [];
    const yBad = [];
    for (let i = 0; i < rows.length; i++) {
      const n = parseNum(rowVal(rows[i], col));
      if (n == null || !Number.isFinite(n)) continue;
      values.push(n);
      yBad.push(y[i] === 1 ? 1 : 0);
    }
    return { values, yBad };
  }

  function lowerBound(sorted, t) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(sorted, t) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function evalNumericHit(v, operator, threshold) {
    if (v == null || !Number.isFinite(v)) return false;
    if (operator === "gte") return v >= threshold;
    if (operator === "gt") return v > threshold;
    if (operator === "lte") return v <= threshold;
    if (operator === "lt") return v < threshold;
    return false;
  }

  function formatRuleLabel(column, operator, threshold) {
    const sym = { gte: "≥", gt: ">", lte: "≤", lt: "<" }[operator] || operator;
    return `${column} ${sym} ${threshold}`;
  }

  /** @returns {string|null} human reason to block scan, or null if ready */
  function getScanBlockReason(rows, y) {
    if (!rows?.length) return "当前工作样本为空";
    if (!y?.length || y.length !== rows.length) return "Y 标签与样本行数不一致";
    let totalBad = 0;
    for (let i = 0; i < y.length; i++) if (y[i] === 1) totalBad++;
    if (!totalBad) return "当前样本无坏标签（坏账率为 0），无法计算 Lift";
    return null;
  }

  function resolveMineTarget(opts) {
    return opts?.mineTarget === "quality" ? "quality" : "risk";
  }

  function resolveLiftThresholds(opts) {
    const mineTarget = resolveMineTarget(opts);
    const minLift = opts?.minLift != null ? Number(opts.minLift) : 1.1;
    const maxLift = opts?.maxLift != null ? Number(opts.maxLift) : 0.9;
    return { mineTarget, minLift, maxLift };
  }

  /** risk: lift > minLift; quality: lift < maxLift (both strict). */
  function passesLiftFilter(lift, mineTarget, minLift, maxLift) {
    if (mineTarget === "quality") return lift < maxLift;
    return lift > minLift;
  }

  function compareCandidatesByTarget(a, b, mineTarget) {
    if (mineTarget === "quality") {
      const goodA = 1 - (a.badRate || 0);
      const goodB = 1 - (b.badRate || 0);
      return (a.lift - b.lift) || (goodB - goodA) || (b.hitRate - a.hitRate);
    }
    return (b.lift - a.lift) || (b.recall - a.recall) || (b.hitRate - a.hitRate);
  }

  function invertOperator(op) {
    return ({ gte: "lt", gt: "lte", lte: "gt", lt: "gte" })[op] || null;
  }

  function invertNumericCmpNode(node) {
    if (!node || node.type !== "numeric_cmp") return null;
    const op = invertOperator(node.operator);
    if (!op || node.threshold == null || !node.column) return null;
    return {
      type: "numeric_cmp",
      column: node.column,
      operator: op,
      threshold: node.threshold,
      includeMissing: false,
    };
  }

  /**
   * Quality adopt path (方案 C): keep strat enums; invert numeric slice to reject complement.
   * Single bound → invert op; two bounds on same col → OR of inverted bounds; wrap with AND(strat…).
   */
  function toRejectComplementPreset(candidate) {
    if (candidate?.mineIntent === "reject_complement"
      || String(candidate?.name || candidate?.label || "").indexOf("拒补集") === 0) {
      return { ok: false, reason: "already_complement" };
    }
    const good = numericSpecToCandidatePreset(candidate);
    if (!good?.root) return { ok: false, reason: "empty" };
    const root = good.root;
    const goodLabel = good.name || candidate?.label || "好人切点";

    function fail(reason) {
      return { ok: false, reason };
    }

    function leafKind(n) {
      if (n?.type === "enum_cmp") return "enum";
      if (n?.type === "numeric_cmp") return "numeric";
      return "other";
    }

    let enums = [];
    let numerics = [];

    if (root.type === "numeric_cmp") {
      numerics = [root];
    } else if (root.type === "composite" && root.op === "and") {
      for (const ch of root.children || []) {
        const k = leafKind(ch);
        if (k === "enum") enums.push(ch);
        else if (k === "numeric") numerics.push(ch);
        else return fail("unsupported_child");
      }
    } else if (root.type === "composite" && root.op === "or") {
      return fail("already_or");
    } else {
      return fail("unsupported_root");
    }

    if (!numerics.length) return fail("no_numeric");

    const inverted = [];
    for (const n of numerics) {
      const inv = invertNumericCmpNode(n);
      if (!inv) return fail("invert_failed");
      inverted.push(inv);
    }

    let rejectNumericRoot;
    if (inverted.length === 1) {
      rejectNumericRoot = inverted[0];
    } else {
      rejectNumericRoot = { type: "composite", op: "or", children: inverted };
    }

    let rejectRoot;
    if (enums.length) {
      rejectRoot = {
        type: "composite",
        op: "and",
        children: [...enums.map((e) => ({ ...e })), rejectNumericRoot],
      };
    } else if (rejectNumericRoot.type === "composite") {
      rejectRoot = rejectNumericRoot;
    } else {
      rejectRoot = {
        type: "composite",
        op: "and",
        children: [rejectNumericRoot],
      };
    }

    const rejectLabel = formatRejectComplementLabel(goodLabel, rejectRoot, { strat: enums.length > 0 });
    return {
      ok: true,
      preset: {
        name: rejectLabel,
        root: rejectRoot,
        openEditor: false,
        isHard: false,
        mineIntent: "reject_complement",
        sourceGoodLabel: goodLabel,
      },
    };
  }

  function formatRejectComplementLabel(goodLabel, rejectRoot, opts) {
    const stratHint = opts?.strat ? "分层内" : "";
    try {
      const expr = RV.domain.rules?.formatCompositeExpr?.(rejectRoot);
      if (expr) return `拒补集${stratHint ? `（${stratHint}）` : ""}：${expr}（由好人切点「${goodLabel}」取反）`;
    } catch (_) { /* fall through */ }
    return `拒补集${stratHint ? `（${stratHint}）` : ""}（由好人切点「${goodLabel}」取反）`;
  }

  function pushCandidate(list, col, operator, threshold, hit, badHit, n, totalBad, overallBadRate, minSamples, minHitRate, liftOpts, source) {
    if (hit < minSamples) return;
    const hitRate = hit / n;
    if (hitRate < minHitRate) return;
    const badRate = badHit / hit;
    const lift = overallBadRate > 0 ? badRate / overallBadRate : 0;
    const { mineTarget, minLift, maxLift } = resolveLiftThresholds(liftOpts || {});
    if (!passesLiftFilter(lift, mineTarget, minLift, maxLift)) return;
    const recall = totalBad > 0 ? badHit / totalBad : 0;
    list.push({
      column: col,
      operator,
      threshold,
      hitCount: hit,
      hitRate,
      badRate,
      lift,
      recall,
      label: formatRuleLabel(col, operator, threshold),
      source: source || "scan",
      mineTarget,
    });
  }

  /**
   * Prefix-sum single-feature scan. O(N log N + C log N) per feature.
   * Lift filter: risk lift > minLift; quality lift < maxLift. Missing values never hit.
   */
  function scanSingleFeatureThresholds(rows, y, features, opts) {
    opts = opts || {};
    const { mineTarget, minLift, maxLift } = resolveLiftThresholds(opts);
    const liftOpts = { mineTarget, minLift, maxLift };
    const minHitRate = opts.minHitRate != null ? Number(opts.minHitRate) : 0.01;
    const minSamples = opts.minSamples != null ? Number(opts.minSamples) : 30;
    const topK = opts.topKPerFeature != null ? Number(opts.topKPerFeature) : 3;
    const maxCuts = opts.maxCuts != null ? Number(opts.maxCuts) : 20;
    const n = rows.length;
    if (getScanBlockReason(rows, y)) return [];

    let totalBad = 0;
    for (let i = 0; i < n; i++) if (y[i] === 1) totalBad++;
    const overallBadRate = totalBad / n;

    const out = [];
    for (const col of features || []) {
      if (!col) continue;
      const { values, yBad } = collectFiniteAligned(rows, y, col);
      const m = values.length;
      if (m < minSamples) continue;

      const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b] || a - b);
      const sorted = new Array(m);
      const badPrefix = new Array(m + 1);
      badPrefix[0] = 0;
      for (let i = 0; i < m; i++) {
        const src = order[i];
        sorted[i] = values[src];
        badPrefix[i + 1] = badPrefix[i] + yBad[src];
      }

      const cuts = quantileCuts(sorted, maxCuts);
      if (!cuts.length) continue;

      const candidates = [];
      for (const threshold of cuts) {
        const iGte = lowerBound(sorted, threshold);
        const hitGte = m - iGte;
        const badGte = badPrefix[m] - badPrefix[iGte];
        pushCandidate(candidates, col, "gte", threshold, hitGte, badGte, n, totalBad, overallBadRate, minSamples, minHitRate, liftOpts, "scan");

        const iLteEnd = upperBound(sorted, threshold);
        const hitLte = iLteEnd;
        const badLte = badPrefix[iLteEnd];
        pushCandidate(candidates, col, "lte", threshold, hitLte, badLte, n, totalBad, overallBadRate, minSamples, minHitRate, liftOpts, "scan");
      }
      candidates.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
      out.push(...candidates.slice(0, Math.max(1, topK)));
    }
    out.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
    return out;
  }

  function equalFreqGteCuts(rows, col, nBins) {
    const rule = RV.infra.buildEqualFreqBinRule(rows, col, nBins || 10);
    const cuts = [];
    const seen = new Set();
    for (const it of rule.intervals || []) {
      const lo = it.lo;
      if (!Number.isFinite(lo)) continue;
      const k = String(lo);
      if (seen.has(k)) continue;
      seen.add(k);
      cuts.push(lo);
    }
    return cuts;
  }

  /**
   * Two-feature AND of gte cuts from equal-freq bin lower bounds.
   * Rule shape: colA gte ta AND colB gte tb (upper-right rectangle, not a single bin cell).
   */
  function scanTwoFeatureGteAnd(rows, colA, colB, opts) {
    opts = opts || {};
    const { mineTarget, minLift, maxLift } = resolveLiftThresholds(opts);
    const minHitRate = opts.minHitRate != null ? Number(opts.minHitRate) : 0;
    const minSamples = opts.minSamples != null ? Number(opts.minSamples) : 30;
    const topK = opts.topK != null ? Number(opts.topK) : 12;
    const nBins = opts.nBins != null ? Number(opts.nBins) : 10;
    const n = rows.length;
    const y = opts.y;
    if (!colA || !colB || colA === colB) return [];
    if (!y || y.length !== n) return [];
    if (getScanBlockReason(rows, y)) return [];

    const parse = RV.domain.eda.parseModelScore;
    const va = new Array(n);
    const vb = new Array(n);
    for (let i = 0; i < n; i++) {
      va[i] = parse(RV.infra.rowVal(rows[i], colA));
      vb[i] = parse(RV.infra.rowVal(rows[i], colB));
    }
    const cutsA = equalFreqGteCuts(rows, colA, nBins);
    const cutsB = equalFreqGteCuts(rows, colB, nBins);
    if (!cutsA.length || !cutsB.length) return [];

    let totalBad = 0;
    for (let i = 0; i < n; i++) if (y[i] === 1) totalBad++;
    const overallBadRate = totalBad / n;

    const candidates = [];
    for (let ia = 0; ia < cutsA.length; ia++) {
      const ta = cutsA[ia];
      for (let ib = 0; ib < cutsB.length; ib++) {
        const tb = cutsB[ib];
        let hit = 0;
        let badHit = 0;
        for (let i = 0; i < n; i++) {
          const a = va[i];
          const b = vb[i];
          if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) continue;
          if (a >= ta && b >= tb) {
            hit++;
            if (y[i] === 1) badHit++;
          }
        }
        if (hit < minSamples) continue;
        const hitRate = hit / n;
        if (hitRate < minHitRate) continue;
        const badRate = hit ? badHit / hit : 0;
        const lift = overallBadRate > 0 ? badRate / overallBadRate : 0;
        if (!passesLiftFilter(lift, mineTarget, minLift, maxLift)) continue;
        const recall = totalBad > 0 ? badHit / totalBad : 0;
        const label = `${colA} gte ${ta} AND ${colB} gte ${tb}`;
        candidates.push({
          column: colA,
          columnB: colB,
          operator: "gte",
          threshold: ta,
          thresholdB: tb,
          hitCount: hit,
          hitRate,
          badRate,
          lift,
          recall,
          label,
          source: "cross",
          root: {
            type: "composite",
            op: "and",
            children: [
              { type: "numeric_cmp", column: colA, operator: "gte", threshold: ta, includeMissing: false },
              { type: "numeric_cmp", column: colB, operator: "gte", threshold: tb, includeMissing: false },
            ],
          },
        });
      }
    }
    candidates.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
    return candidates.slice(0, Math.max(1, topK));
  }

  /** Brute O(F·C·N) scanner — for e2e parity checks only. */
  function scanSingleFeatureThresholdsBrute(rows, y, features, opts) {
    opts = opts || {};
    const { mineTarget, minLift, maxLift } = resolveLiftThresholds(opts);
    const liftOpts = { mineTarget, minLift, maxLift };
    const minHitRate = opts.minHitRate != null ? Number(opts.minHitRate) : 0.01;
    const minSamples = opts.minSamples != null ? Number(opts.minSamples) : 30;
    const topK = opts.topKPerFeature != null ? Number(opts.topKPerFeature) : 3;
    const maxCuts = opts.maxCuts != null ? Number(opts.maxCuts) : 20;
    const n = rows.length;
    if (getScanBlockReason(rows, y)) return [];
    let totalBad = 0;
    for (let i = 0; i < n; i++) if (y[i] === 1) totalBad++;
    const overallBadRate = totalBad / n;
    const out = [];
    for (const col of features || []) {
      if (!col) continue;
      const { values } = collectFiniteAligned(rows, y, col);
      if (values.length < minSamples) continue;
      const sorted = values.slice().sort((a, b) => a - b);
      const cuts = quantileCuts(sorted, maxCuts);
      if (!cuts.length) continue;
      const candidates = [];
      for (const threshold of cuts) {
        for (const operator of ["gte", "lte"]) {
          let hit = 0;
          let badHit = 0;
          for (let i = 0; i < n; i++) {
            const v = parseNum(rowVal(rows[i], col));
            if (!evalNumericHit(v, operator, threshold)) continue;
            hit++;
            if (y[i] === 1) badHit++;
          }
          pushCandidate(candidates, col, operator, threshold, hit, badHit, n, totalBad, overallBadRate, minSamples, minHitRate, liftOpts, "scan");
        }
      }
      candidates.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
      out.push(...candidates.slice(0, Math.max(1, topK)));
    }
    out.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
    return out;
  }

  function recommendMiningVars(metricsByVar, opts) {
    opts = opts || {};
    const ivMin = opts.ivMin != null ? Number(opts.ivMin) : 0.02;
    const psiMax = opts.psiMax != null ? Number(opts.psiMax) : 0.25;
    const topN = opts.topN != null ? Number(opts.topN) : 10;
    const rows = (metricsByVar || [])
      .map((m) => {
        const iv = m?.overall?.iv;
        const psiVals = (m?.groups || []).map((g) => g.psi).filter((p) => p != null && Number.isFinite(p));
        const maxPsi = psiVals.length ? Math.max(...psiVals) : null;
        const psiChecked = maxPsi != null;
        return {
          col: m.col,
          iv: iv != null ? iv : 0,
          maxPsi: maxPsi == null ? null : maxPsi,
          psiChecked,
        };
      })
      .filter((r) => {
        if (!r.col || !(r.iv >= ivMin)) return false;
        if (r.psiChecked && !(r.maxPsi <= psiMax)) return false;
        return true;
      });
    rows.sort((a, b) => b.iv - a.iv);
    return rows.slice(0, topN);
  }

  /**
   * @param {{ isLastInterval?: boolean, avoidAdjacentOverlap?: boolean }} [opts]
   * Non-last closed-closed intervals → half-open hi (lt) to avoid adjacent double-hit.
   */
  function binIntervalToRuleRoot(column, interval, opts) {
    if (!column || !interval) return null;
    opts = opts || {};
    const children = [];
    const lo = interval.lo;
    const hi = interval.hi;
    const loClosed = interval.loClosed !== false;
    let hiClosed = !!interval.hiClosed;
    const avoidOverlap = opts.avoidAdjacentOverlap !== false;
    const isLast = !!opts.isLastInterval;
    if (avoidOverlap && Number.isFinite(lo) && Number.isFinite(hi) && hiClosed && !isLast) {
      hiClosed = false;
    }
    if (Number.isFinite(lo)) {
      children.push({
        type: "numeric_cmp",
        column,
        operator: loClosed ? "gte" : "gt",
        threshold: lo,
        includeMissing: false,
      });
    }
    if (Number.isFinite(hi)) {
      children.push({
        type: "numeric_cmp",
        column,
        operator: hiClosed ? "lte" : "lt",
        threshold: hi,
        includeMissing: false,
      });
    }
    if (!children.length) return null;
    return { type: "composite", op: "and", children };
  }

  function findIntervalByLabel(rule, label) {
    if (!rule || label == null) return null;
    return (rule.intervals || []).find((it) => it.label === label) || null;
  }

  function findIntervalIndexByLabel(rule, label) {
    if (!rule || label == null) return -1;
    return (rule.intervals || []).findIndex((it) => it.label === label);
  }

  function stableRootKey(node) {
    if (!node || typeof node !== "object") return String(node);
    if (node.type === "numeric_cmp") {
      return `n:${node.column}|${node.operator}|${node.threshold}|${node.includeMissing ? 1 : 0}`;
    }
    if (node.type === "enum_cmp") {
      return `e:${node.column}|${node.operator}|${node.value}`;
    }
    if (node.type === "binary_cmp") {
      return `b:${node.column}|${node.hitWhen || "one"}`;
    }
    if (node.type === "composite") {
      const kids = (node.children || []).map(stableRootKey).sort();
      return `c:${node.op}|${kids.join(";")}`;
    }
    return JSON.stringify(node);
  }

  function numericSpecToCandidatePreset(spec) {
    if (spec?.root) {
      return { name: spec.label || spec.name || "候选规则", root: spec.root, openEditor: false };
    }
    if (!spec?.column || spec.threshold == null || !spec.operator) return null;
    const label = spec.label || formatRuleLabel(spec.column, spec.operator, spec.threshold);
    return {
      name: label,
      root: {
        type: "composite",
        op: "and",
        children: [{
          type: "numeric_cmp",
          column: spec.column,
          operator: spec.operator,
          threshold: spec.threshold,
          includeMissing: !!spec.includeMissing,
        }],
      },
      openEditor: false,
    };
  }

  /**
   * @param {{ isLastInterval?: boolean, stratParts?: Record<string, string>, avoidAdjacentOverlap?: boolean }} [opts]
   * Strat values are String(...) to match evalEnumCmp (both sides trimmed string).
   */
  function binIntervalToCandidatePreset(column, interval, label, opts) {
    opts = opts || {};
    const root = binIntervalToRuleRoot(column, interval, opts);
    if (!root) return null;
    const stratParts = opts.stratParts && typeof opts.stratParts === "object" ? opts.stratParts : null;
    if (stratParts) {
      const stratChildren = [];
      for (const [col, val] of Object.entries(stratParts)) {
        if (!col) continue;
        stratChildren.push({
          type: "enum_cmp",
          column: col,
          operator: "eq",
          value: String(val ?? "").trim(),
        });
      }
      if (stratChildren.length) {
        root.children = [...stratChildren, ...root.children];
      }
    }
    let name = label
      ? `${column} · ${label}`
      : (root.children.filter((c) => c.type === "numeric_cmp").length === 1
        ? formatRuleLabel(column, root.children.find((c) => c.type === "numeric_cmp").operator,
          root.children.find((c) => c.type === "numeric_cmp").threshold)
        : `${column} 区间`);
    if (stratParts && Object.keys(stratParts).length) {
      const stratTxt = Object.entries(stratParts).map(([k, v]) => `${k}=${String(v ?? "").trim()}`).join("·");
      name = `${name}（${stratTxt}）`;
    }
    return { name, root, openEditor: false };
  }

  /**
   * Score existing bin intervals on current work sample (same root as P1 生成规则).
   * One row per slice × interval; filtered by mineTarget Lift / minSamples / minHitRate.
   */
  function scoreBinEdgesAsCandidates(rows, y, binTables, opts) {
    opts = opts || {};
    const { mineTarget, minLift, maxLift } = resolveLiftThresholds(opts);
    const minHitRate = opts.minHitRate != null ? Number(opts.minHitRate) : 0.01;
    const minSamples = opts.minSamples != null ? Number(opts.minSamples) : 30;
    const n = rows?.length || 0;
    if (getScanBlockReason(rows, y)) return [];
    const evalComposite = RV.domain.rules?.evalCompositeRule;
    if (!evalComposite) return [];

    let totalBad = 0;
    for (let i = 0; i < n; i++) if (y[i] === 1) totalBad++;
    const overallBadRate = totalBad / n;
    const out = [];

    for (const slice of binTables || []) {
      const varName = slice.var;
      const intervals = slice.rule?.intervals || [];
      if (!varName || !intervals.length) continue;
      const stratParts = (slice.stratCols || []).length ? (slice.stratParts || null) : null;
      for (let idx = 0; idx < intervals.length; idx++) {
        const interval = intervals[idx];
        const isLast = idx === intervals.length - 1;
        const preset = binIntervalToCandidatePreset(varName, interval, interval.label, {
          isLastInterval: isLast,
          stratParts,
        });
        if (!preset?.root) continue;
        let hit = 0;
        let badHit = 0;
        for (let i = 0; i < n; i++) {
          if (!evalComposite(rows[i], preset.root)) continue;
          hit++;
          if (y[i] === 1) badHit++;
        }
        if (hit < minSamples) continue;
        const hitRate = hit / n;
        if (hitRate < minHitRate) continue;
        const badRate = badHit / hit;
        const lift = overallBadRate > 0 ? badRate / overallBadRate : 0;
        if (!passesLiftFilter(lift, mineTarget, minLift, maxLift)) continue;
        const recall = totalBad > 0 ? badHit / totalBad : 0;
        out.push({
          column: varName,
          operator: null,
          threshold: null,
          hitCount: hit,
          hitRate,
          badRate,
          lift,
          recall,
          label: preset.name,
          source: "bin",
          root: preset.root,
          binLabel: interval.label,
          stratKey: slice.stratKey,
          mineTarget,
        });
      }
    }
    out.sort((a, b) => compareCandidatesByTarget(a, b, mineTarget));
    return out;
  }

  /**
   * Per-candidate × group trend on work sample.
   * Lift within group = hitBadRate / groupBadRate (group baseline).
   */
  function resolveCandidateRoot(candidate) {
    if (candidate?.root) return candidate.root;
    const preset = numericSpecToCandidatePreset(candidate);
    return preset?.root || null;
  }

  function computeMineCandidateGroupTrend(rows, y, candidates, groupCols, opts) {
    opts = opts || {};
    const maxRows = opts.maxRows;
    const evalComposite = RV.domain.rules?.evalCompositeRule;
    const indexRowsByGroup = RV.infra.indexRowsByGroup;
    const groupPartsFromKey = RV.infra.groupPartsFromKey;
    const sortGroupKeys = RV.infra.sortGroupKeys;
    if (!evalComposite || !groupCols?.length || !rows?.length || !candidates?.length) return [];
    if (!y?.length || y.length !== rows.length) return [];

    const byGroup = indexRowsByGroup(rows, groupCols);
    const groupKeys = sortGroupKeys(Object.keys(byGroup), groupCols);
    const rowIndex = new Map();
    for (let i = 0; i < rows.length; i++) rowIndex.set(rows[i], i);

    const trend = [];
    const projectedTotal = candidates.length * groupKeys.length;
    for (let ci = 0; ci < candidates.length; ci++) {
      const cand = candidates[ci];
      const root = resolveCandidateRoot(cand);
      if (!root) continue;
      for (const g of groupKeys) {
        const groupRows = byGroup[g] || [];
        const parts = groupPartsFromKey(g, groupCols);
        let n = 0;
        let groupBad = 0;
        let hit = 0;
        let badHit = 0;
        for (const r of groupRows) {
          const idx = rowIndex.get(r);
          if (idx == null) continue;
          n++;
          if (y[idx] === 1) groupBad++;
          if (evalComposite(r, root)) {
            hit++;
            if (y[idx] === 1) badHit++;
          }
        }
        const hitRate = n > 0 ? hit / n : null;
        const badRate = hit > 0 ? badHit / hit : null;
        const groupBadRate = n > 0 ? groupBad / n : null;
        const lift = groupBadRate > 0 && badRate != null ? badRate / groupBadRate : null;
        trend.push({
          candidateIdx: ci,
          ruleLabel: cand.label || cand.column || `候选${ci + 1}`,
          group: parts.join(" · "),
          groupParts: parts,
          hitCount: hit,
          hitRate,
          badRate,
          groupBadRate,
          lift,
          groupN: n,
        });
        if (maxRows != null && trend.length >= maxRows) {
          trend.truncated = true;
          trend.total = projectedTotal;
          return trend;
        }
      }
    }
    return trend;
  }

  Object.assign(target, {
    scanSingleFeatureThresholds,
    scanSingleFeatureThresholdsBrute,
    scanTwoFeatureGteAnd,
    getScanBlockReason,
    recommendMiningVars,
    binIntervalToRuleRoot,
    findIntervalByLabel,
    findIntervalIndexByLabel,
    stableRootKey,
    numericSpecToCandidatePreset,
    binIntervalToCandidatePreset,
    scoreBinEdgesAsCandidates,
    computeMineCandidateGroupTrend,
    resolveCandidateRoot,
    formatRuleLabel,
    resolveMineTarget,
    passesLiftFilter,
    compareCandidatesByTarget,
    invertOperator,
    toRejectComplementPreset,
  });
})(window.RV);
