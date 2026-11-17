/**
 * Admission iteration engine — aligned with admission-strategy-iteration/bin/run.js
 */
(function (global) {
  "use strict";

  let CFG = {};
  let log = function () {};

  function buildBaselineFromInput(RV, input) {
    const warnings = input.baselineWarnings ? input.baselineWarnings.slice() : [];
    if (input.hardRuntime && input.softRuntime) {
      return {
        hardRuntime: input.hardRuntime,
        softRuntime: input.softRuntime,
        warnings,
      };
    }
    return {
      hardRuntime: [{
        id: "hard_rej",
        type: "binary_col",
        column: "hard_rej",
        hitWhen: "one",
        isHard: true,
        name: "hard_rej",
      }],
      softRuntime: [],
      warnings: warnings.concat(["未提供 Baseline 软规则"]),
    };
  }

function softRuleColumn(r) {
  return r?.column || r?.root?.column || null;
}

/** 新策略 Soft：仅去掉 CFG.dropSoftCols（默认空=不剔除） */
function filterSoftForNewStrategy(softOnline) {
  const drop = new Set(CFG.dropSoftCols || []);
  if (!drop.size) return (softOnline || []).slice();
  return (softOnline || []).filter((r) => {
    const col = softRuleColumn(r);
    if (col && drop.has(col)) return false;
    return true;
  });
}

function softRuntimeAsWfSoft(softList) {
  return (softList || []).map((r, i) => ({
    ...r,
    id: r.id || `base_soft_${i}`,
    isHard: false,
  }));
}
/** 报告短标签 + 可折叠细则（note 长串仅兼容旧消费） */
function buildGateBullets() {
  return [
    { id: "minHit", label: `命中进件≥${CFG.minHit}`, detail: CFG.minHitNote },
    {
      id: "minLift",
      label: CFG.minLift > 0 ? `Lift≥${CFG.minLift}` : "Lift不限制",
      detail: CFG.minLiftNote,
    },
    {
      id: "stack",
      label: CFG.keepBaselineSoft ? "老规则不下线" : "可下线Baseline软",
      detail: CFG.stackNote,
    },
    { id: "passMetric", label: "放行率口径", detail: CFG.passMetricNote },
    { id: "prune", label: "仅命中剪枝", detail: CFG.pruneNote },
    { id: "assemble", label: "辅约束回退续挖", detail: CFG.assembleNote },
  ];
}

function candExpr(c) {
  return `${c.column} ${c.operator} ${c.threshold}`;
}

/** 已保留 gte 切点的阈值下界：新候选须严格更大（更紧），否则视为更松 */
function gteFloorFromCustoms(customs) {
  const m = {};
  for (const c of customs || []) {
    const col = c.root?.column ?? c.column ?? c.meta?.column;
    const op = c.root?.operator ?? c.operator ?? c.meta?.operator;
    const thr = c.root?.threshold ?? c.threshold ?? c.meta?.threshold;
    if (op === "gte" && col != null && thr != null && Number.isFinite(Number(thr))) {
      const t = Number(thr);
      m[col] = m[col] == null ? t : Math.max(m[col], t);
    }
  }
  return m;
}

function isBlockedCand(cand, floorMap, bannedExprs) {
  const expr = candExpr(cand);
  if (bannedExprs && bannedExprs.has(expr)) return { blocked: true, why: "banned_expr" };
  if (
    cand.operator === "gte" &&
    floorMap &&
    floorMap[cand.column] != null &&
    Number(cand.threshold) <= floorMap[cand.column]
  ) {
    return { blocked: true, why: "looser_gte" };
  }
  return { blocked: false };
}

function liftPass(lift) {
  if (!(CFG.minLift > 0)) return true;
  return lift != null && lift >= CFG.minLift;
}

/** Baseline softRuntime → customRules 形态（供 new-strategy / 残差叠加） */
function softRuntimeAsCustom(softRuntime) {
  return (softRuntime || []).map((r, i) => {
    const id = r.id || `base_soft_${i}`;
    const name = r.name || id;
    if (r.root) return { id, name, root: r.root };
    if (r.type === "numeric_cmp") {
      return {
        id,
        name,
        root: {
          type: "numeric_cmp",
          column: r.column,
          operator: r.operator,
          threshold: r.threshold,
          includeMissing: !!r.includeMissing,
        },
      };
    }
    if (r.type === "binary_col") {
      return {
        id,
        name,
        root: {
          type: "binary_col",
          column: r.column,
          hitWhen: r.hitWhen || "one",
        },
      };
    }
    if (r.type === "composite" && r.root) return { id, name, root: r.root };
    return { id, name, root: r };
  });
}

function stackNewCustoms(baselineSoftCustom, candCustoms) {
  if (!CFG.keepBaselineSoft) return candCustoms || [];
  return [...(baselineSoftCustom || []), ...(candCustoms || [])];
}

function dec(row) {
  const col = CFG.decisionCol || "决策组";
  return String(row[col] || "").toLowerCase();
}
function isGroupB(row) {
  const v = dec(row);
  return (CFG.groupB || ["b组", "b"]).map((x) => String(x).toLowerCase()).includes(v);
}
function isGroupA(row) {
  const v = dec(row);
  return (CFG.groupA || ["a组", "a", "对照组"]).map((x) => String(x).toLowerCase()).includes(v);
}

function riskOf(rows) {
  let n = 0;
  let d = 0;
  const nCol = CFG.riskNumCol || "fpd1_cnt_fz";
  const dCol = CFG.riskDenCol || "fpd1_cnt_fm";
  for (const r of rows) {
    const fz = Number(r[nCol]);
    const fm = Number(r[dCol]);
    if (Number.isFinite(fz) && Number.isFinite(fm)) {
      n += fz;
      d += fm;
    }
  }
  return { n, d, rate: d > 0 ? n / d : null, rows: rows.length };
}

function passOf(rows) {
  let a = 0;
  let p = 0;
  for (const r of rows) {
    const av = Number(r["进件量"]);
    const pv = Number(r["通过量"]);
    if (Number.isFinite(av)) a += av;
    if (Number.isFinite(pv)) p += pv;
  }
  return { apply: a, pass: p, rate: a > 0 ? p / a : null, rows: rows.length };
}

function monthKeyOf(row) {
  const col = (CFG && CFG.postMonthCol) || "submit_month";
  return String(row?.[col] ?? row?.submit_month ?? "").trim();
}

function preDateOf(row) {
  const col = (CFG && CFG.preDateCol) || "submit_date";
  return String(row?.[col] ?? row?.submit_date ?? "").trim();
}

/** 按贷后月份列汇总 fpd1_cnt%（现状分月风险） */
function riskByMonth(rows) {
  const buckets = {};
  for (const r of rows || []) {
    const m = monthKeyOf(r);
    if (!m) continue;
    if (!buckets[m]) buckets[m] = [];
    buckets[m].push(r);
  }
  return Object.keys(buckets)
    .sort()
    .map((month) => {
      const risk = riskOf(buckets[month]);
      return {
        month,
        n: risk.n,
        d: risk.d,
        rate: risk.rate,
        rows: risk.rows,
      };
    });
}

/** 策略放行率 = 仍放行进件 / 窗内总进件（方案主口径；非历史通过率） */
function strategyAdmitOf(preRowsAll, preRowsAdmit) {
  const total = passOf(preRowsAll);
  const admit = passOf(preRowsAdmit);
  return {
    apply: total.apply,
    admit: admit.apply,
    rate: total.apply > 0 ? admit.apply / total.apply : null,
    histPass: admit.pass,
    histRate: admit.rate,
    metric: "strategy_admit_rate",
    rows: preRowsAdmit.length,
  };
}

function candToCustom(c, idx) {
  const op = c.operator === "lte" ? "lte" : "gte";
  return {
    id: `cand_${idx}`,
    name: `${c.column} ${op} ${c.threshold}`,
    root: {
      type: "numeric_cmp",
      column: c.column,
      operator: op,
      threshold: Number(c.threshold),
      includeMissing: false,
    },
  };
}

/** Hit test aligned with rule-mining numeric operators (missing never hits). */
function rowHitsCand(RV, row, cand) {
  const v = RV.domain.eda.parseModelScore(RV.infra.rowVal(row, cand.column));
  if (v == null || !Number.isFinite(v)) return false;
  const thr = Number(cand.threshold);
  const op = cand.operator;
  if (op === "gte") return v >= thr;
  if (op === "gt") return v > thr;
  if (op === "lte") return v <= thr;
  if (op === "lt") return v < thr;
  return false;
}

/**
 * Business risk for a candidate: fpd1_cnt% on hit subset + Lift vs overall.
 * hitApplyVol = Σ进件量 on hits；riskDen = Σfpd1_cnt_fm（风险样本量）.
 * (Do NOT use scan's row-label badRate for gates / report.)
 */
function candBizMetrics(RV, rows, cand, overallRate) {
  const hitRows = [];
  for (const r of rows) {
    if (rowHitsCand(RV, r, cand)) hitRows.push(r);
  }
  const risk = riskOf(hitRows);
  let hitApplyVol = 0;
  for (const r of hitRows) hitApplyVol += RV.infra.getApplyVol(r);
  const lift =
    overallRate != null && overallRate > 0 && risk.rate != null ? risk.rate / overallRate : null;
  return {
    hitCount: hitRows.length,
    hitApplyVol,
    badRate: risk.rate,
    riskNum: risk.n,
    riskDen: risk.d,
    lift,
    labelBadRate: cand.badRate != null ? cand.badRate : null,
  };
}

function attachBizMetrics(RV, rows, cand, overallRate) {
  const biz = candBizMetrics(RV, rows, cand, overallRate);
  return {
    ...cand,
    hitCount: biz.hitCount,
    hitApplyVol: biz.hitApplyVol,
    badRate: biz.badRate,
    lift: biz.lift,
    riskNum: biz.riskNum,
    riskDen: biz.riskDen,
    labelBadRate: biz.labelBadRate,
    riskMetric: "fpd1_cnt%",
  };
}

/**
 * 全部分月业务指标（附录展示用）。
 * monthAxis：训练窗完整月份（如 postB 各月）；缺月用空子集算出 0/null，避免表头有月、单元格整列「—」。
 * 跨月硬门禁仍只取近 3 月（monthsStable）。
 */
function monthsBizAll(RV, rows, cand, overallByMonth, monthAxis) {
  const monthCol = (CFG && CFG.postMonthCol) || "submit_month";
  const byMonth = RV.infra.indexRowsByGroup(rows, [monthCol]);
  const monthKeys = (monthAxis && monthAxis.length
    ? monthAxis
    : Object.keys(overallByMonth || {}).length
      ? Object.keys(overallByMonth).sort()
      : Object.keys(byMonth).sort()
  ).slice().sort();
  return monthKeys.map((month) => {
    const monthRows = byMonth[month] || [];
    const base =
      overallByMonth[month] != null
        ? overallByMonth[month]
        : monthRows.length
          ? riskOf(monthRows).rate
          : null;
    const biz = candBizMetrics(RV, monthRows, cand, base);
    return {
      month,
      hit: biz.hitApplyVol,
      hitApplyVol: biz.hitApplyVol,
      hitCount: biz.hitCount,
      badRate: biz.badRate,
      riskNum: biz.riskNum,
      riskDen: biz.riskDen,
      lift: biz.lift,
      pass:
        biz.hitApplyVol >= CFG.minHit &&
        biz.badRate != null &&
        biz.badRate > CFG.minAbsRisk &&
        liftPass(biz.lift),
    };
  });
}

function monthsStable(RV, rows, cand, overallByMonth) {
  // 门禁只看工作样本实际出现的月份中近 3 个（与附录全量轴解耦，避免空月改变门禁）
  const monthCol = (CFG && CFG.postMonthCol) || "submit_month";
  const present = Object.keys(RV.infra.indexRowsByGroup(rows, [monthCol])).sort();
  const use = present.slice(-3);
  const detail = monthsBizAll(RV, rows, cand, overallByMonth, use);
  const ok = detail.length > 0 && detail.every((d) => d.pass);
  return {
    ok,
    months: use,
    detail,
    monthCount: detail.length,
    riskMetric: "fpd1_cnt%",
  };
}

function monthDetailToByMonth(detailList) {
  const byMonth = {};
  for (const d of detailList || []) {
    byMonth[d.month] = {
      hit: d.hitApplyVol ?? d.hit,
      hitApplyVol: d.hitApplyVol ?? d.hit,
      hitCount: d.hitCount,
      badRate: d.badRate,
      lift: d.lift,
      pass: d.pass,
      riskNum: d.riskNum,
      riskDen: d.riskDen,
    };
  }
  return byMonth;
}

function newStrategyMetrics(RV, postRows, preRows, hardRuntime, customRules) {
  const postPass = RV.domain.validity.filterNewStrategyPassRows(postRows, hardRuntime, customRules);
  const prePass = RV.domain.validity.filterNewStrategyPassRows(preRows, hardRuntime, customRules);
  return {
    risk: riskOf(postPass),
    pass: strategyAdmitOf(preRows, prePass),
    postPassN: postPass.length,
    prePassN: prePass.length,
  };
}

function relDev(actual, target) {
  if (target === 0) return Math.abs(actual - target);
  return Math.abs(actual - target) / Math.abs(target);
}

/**
 * Equal-freq bin fpd1 rates on rows (label order = score direction).
 * @returns {{ labels: string[], rates: (number|null)[], dens: number[] }}
 */
function equalFreqBinRiskRates(RV, rows, col, nBins) {
  const rule = RV.infra.buildEqualFreqBinRule(rows, col, nBins);
  const labels = RV.infra.binLabelOrder(rule);
  const buckets = Object.fromEntries(labels.map((lab) => [lab, []]));
  for (const r of rows) {
    const lab = RV.infra.getBinnedLabel(RV.infra.rowVal(r, col), rule, r);
    if (buckets[lab]) buckets[lab].push(r);
  }
  const rates = [];
  const dens = [];
  for (const lab of labels) {
    const m = RV.infra.sumRatio(buckets[lab], CFG.riskNumCol || "fpd1_cnt_fz", CFG.riskDenCol || "fpd1_cnt_fm");
    rates.push(m.rate);
    dens.push(m.den);
  }
  return { labels, rates, dens, rule };
}

/**
 * Strict monotone gradient on bin rates (score order): non-flat and no inflection.
 * Null-rate bins skipped; valid bins < 2 → no gradient.
 */
function hasStrictBinGradient(rates) {
  const seq = [];
  for (const r of rates) {
    if (r != null && Number.isFinite(r)) seq.push(r);
  }
  if (seq.length < 2) {
    return { ok: false, reason: "有效箱<2，无法判梯度", inflection: null, validBins: seq.length };
  }
  let trend = 0;
  let inflection = 0;
  let nonZeroSteps = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i] - seq[i - 1];
    if (d === 0) continue;
    nonZeroSteps += 1;
    const s = d > 0 ? 1 : -1;
    if (trend === 0) trend = s;
    else if (s !== trend) inflection += 1;
  }
  if (nonZeroSteps === 0) {
    return { ok: false, reason: "箱风险全平，无梯度", inflection: 0, validBins: seq.length };
  }
  if (inflection > 0) {
    return {
      ok: false,
      reason: `4箱风险非严格单调（拐点=${inflection}）`,
      inflection,
      validBins: seq.length,
    };
  }
  return {
    ok: true,
    reason: trend > 0 ? "4箱风险严格单调升" : "4箱风险严格单调降",
    inflection: 0,
    validBins: seq.length,
    direction: trend > 0 ? "up" : "down",
  };
}


  async function runAdmissionEngine(RV, input, onProgress) {
    const dcfg = {
      targetRisk: 0.28,
      targetPass: 0.8,
      k: 1.2,
      postFrom: "2026-02",
      preFrom: "2026-07-10",
      btPostFrom: "2026-07",
      btPreFrom: "",
      decisionCol: "决策组",
      groupB: ["b组", "b", "B组", "B"],
      groupA: ["a组", "a", "A组", "A", "对照组"],
      inUseModels: [],
      dropSoftCols: [],
      baselineSoftOnlineLabels: [],
      baselineSoftNewDropLabels: [],
      minHit: 30,
      minAbsRisk: 0.35,
      minLift: 1.5,
      keepBaselineSoft: true,
      maxRules: 6,
      maxRounds: 10,
      allowedOperators: ["gte"],
      swapinEstNbins: 4,
      auxBand: 0.05,
      riskNumCol: "fpd1_cnt_fz",
      riskDenCol: "fpd1_cnt_fm",
      postMonthCol: "submit_month",
      preDateCol: "submit_date",
      minHitNote: "命中进件量门槛≥30",
      minLiftNote: "Lift 门禁≥1.5",
      stackNote: "老规则不下线：新策略=硬∪Baseline软∪Candidates（与线上 Soft 一致，除非调用方指定 dropSoftCols）",
      passMetricNote: "方案主口径=策略放行率；现状=历史通过率",
      pruneNote: "仅命中剪枝",
      assembleNote: "辅约束回退续挖",
      operatorNote: "仅 gte",
    };
    const t = input.targets || {};
    const tw = input.trainWindow || {};
    const bt = input.backtestWindow || {};
    const mine = input.mineOpts || {};
    CFG = Object.assign({}, dcfg, {
      targetRisk: Number(t.risk != null ? t.risk : dcfg.targetRisk),
      targetPass: Number(t.pass != null ? t.pass : dcfg.targetPass),
      k: Number(t.k != null ? t.k : dcfg.k),
      postFrom: tw.postFrom || dcfg.postFrom,
      preFrom: tw.preFrom || dcfg.preFrom,
      btPostFrom: (bt && bt.postFrom) || "",
      btPreFrom: bt && bt.preSameAsTrain ? "" : ((bt && bt.preFrom) || ""),
      inUseModels: (input.inUseModels || []).slice(),
      dropSoftCols: input.dropSoftCols != null ? input.dropSoftCols.slice() : dcfg.dropSoftCols.slice(),
      baselineSoftOnlineLabels: (input.baselineSoftOnlineLabels || []).slice(),
      baselineSoftNewDropLabels: (input.baselineSoftNewDropLabels || []).slice(),
      minHit: mine.minHit != null ? Number(mine.minHit) : dcfg.minHit,
      minAbsRisk: mine.minAbsRisk != null ? Number(mine.minAbsRisk) : dcfg.minAbsRisk,
      minLift: mine.minLift != null ? Number(mine.minLift) : dcfg.minLift,
      keepBaselineSoft: input.keepOnlineSoft != null ? !!input.keepOnlineSoft : true,
      maxRules: mine.maxCandidates != null ? Number(mine.maxCandidates) : dcfg.maxRules,
      maxRounds: mine.residualRounds != null ? Number(mine.residualRounds) : dcfg.maxRounds,
      riskNumCol: (input.fields && input.fields.riskNumCol) || dcfg.riskNumCol,
      riskDenCol: (input.fields && input.fields.riskDenCol) || dcfg.riskDenCol,
      decisionCol: (input.fields && input.fields.decisionCol) || dcfg.decisionCol,
      postMonthCol: (input.fields && input.fields.postMonthCol) || dcfg.postMonthCol,
      preDateCol: (input.fields && input.fields.preDateCol) || dcfg.preDateCol,
    });
    CFG.minLiftNote = CFG.minLift > 0 ? ("Lift 门禁≥" + CFG.minLift) : "Lift 门禁已取消";
    CFG.minHitNote = "命中进件量门槛≥" + CFG.minHit;
    let pct = 5;
    log = function () {
      const msg = Array.prototype.slice.call(arguments).join(" ");
      pct = Math.min(95, pct + 2);
      if (onProgress) onProgress(pct, msg);
    };


  const seg = input.rows || [];
  if (!seg.length) throw new Error("无样本行");
  log("seg rows", seg.length);
  log("date cols postMonth=", CFG.postMonthCol, "preDate=", CFG.preDateCol);

  // 训练窗：贷后月份列 / 贷前日期列（字段映射可配，默认 submit_month / submit_date）
  const postRows = seg.filter((r) => monthKeyOf(r) >= CFG.postFrom);
  const preRows = seg.filter((r) => preDateOf(r) >= CFG.preFrom);
  const postB = postRows.filter(isGroupB);
  const postA = postRows.filter(isGroupA);
  const preB = preRows.filter(isGroupB);
  const preA = preRows.filter(isGroupA);

  // 回测窗：同客群；规则冻结后只重算 Swap / 贷后瀑布
  const btPreMin = CFG.btPreFrom || CFG.preFrom;
  const postRowsBt = CFG.btPostFrom
    ? seg.filter((r) => monthKeyOf(r) >= CFG.btPostFrom)
    : [];
  const preRowsBt = CFG.btPostFrom
    ? seg.filter((r) => preDateOf(r) >= btPreMin)
    : [];
  const postBBt = postRowsBt.filter(isGroupB);
  const preBBt = preRowsBt.filter(isGroupB);
  log(
    "windows train post>=",
    CFG.postFrom,
    "pre>=",
    CFG.preFrom,
    "| backtest post>=",
    CFG.btPostFrom,
    "pre>=",
    btPreMin,
    "| postB/preB",
    postB.length,
    preB.length,
    "| bt postB/preB",
    postBBt.length,
    preBBt.length
  );
  if (!postB.length) {
    throw new Error(
      `训练贷后窗内 B 组样本为 0。请检查「贷后月份」列是否映射为 ${CFG.postMonthCol}，以及月份起 ${CFG.postFrom} 是否落在数据范围内。`
    );
  }
  if (!preB.length) {
    throw new Error(
      `训练贷前窗内 B 组样本为 0。请检查「贷前日期」列是否映射为 ${CFG.preDateCol}，以及日期起 ${CFG.preFrom} 是否落在数据范围内（本文件若申请日期只到 6 月，勿用 7 月默认起点）。`
    );
  }

  const { hardRuntime, softRuntime, warnings } = buildBaselineFromInput(RV, input);
  /** 线上 Soft（含 p1）→ Swap online / rowOnlineReject */
  const softOnline = softRuntime;
  /** 新策略 Soft（默认同线上；仅 dropSoftCols 剔除）→ 挖规残差 / 叠规 / 瀑布 / 剪枝 */
  const softNewBase = filterSoftForNewStrategy(softOnline);
  const baselineSoftCustom = softRuntimeAsCustom(softNewBase);
  /** 线上 Baseline Soft 全量（含 p1）→ 影响对照「Baseline放行」分母 */
  const baselineOnlineCustom = softRuntimeAsCustom(softOnline);
  if (!CFG.inUseModels.length) {
    CFG.inUseModels = softOnline.map((r) => softRuleColumn(r) || r.column).filter(Boolean);
  }
  if (!CFG.baselineSoftOnlineLabels.length) {
    CFG.baselineSoftOnlineLabels = softOnline.map((r) => r.name).filter(Boolean);
  }
  if (!CFG.baselineSoftNewDropLabels.length && CFG.dropSoftCols.length) {
    CFG.baselineSoftNewDropLabels = softOnline
      .filter((r) => {
        const col = softRuleColumn(r);
        return col && CFG.dropSoftCols.includes(col);
      })
      .map((r) => `${r.name}（列 ${softRuleColumn(r)}；线上仍有，新策略不含）`);
  }
  log(
    "softOnline",
    softOnline.map((r) => r.name || softRuleColumn(r)).join(" | "),
    "| softNewBase",
    softNewBase.map((r) => r.name || softRuleColumn(r)).join(" | ")
  );

  // Y only for scan cut discovery; gates/sort/report use fpd1_cnt%
  const yB = RV.domain.eda.buildYVector(postB, { col: CFG.riskNumCol, threshold: 0 });
  const overallBiz = riskOf(postB).rate;
  const overallByMonth = {};
  {
    const byM = RV.infra.indexRowsByGroup(postB, [CFG.postMonthCol || "submit_month"]);
    for (const m of Object.keys(byM)) overallByMonth[m] = riskOf(byM[m]).rate;
  }

  const headers = Object.keys(seg[0] || {});
  const pool = headers.filter(
    (h) => ((h.startsWith("p3_") && !h.includes("_bin")) || h.startsWith("reb_") || h.startsWith("p4_"))
  );

  log("KS ranking…", pool.length);
  const ranking = pool
    .map((col) => {
      const m = RV.domain.eda.computeVarMetrics(postB, yB, col, [], 5);
      return {
        col,
        ks: m.overall?.ks ?? null,
        auc: m.overall?.auc ?? null,
        iv: m.overall?.iv ?? null,
      };
    })
    .sort((a, b) => (b.ks ?? -1) - (a.ks ?? -1));
  const top10 = ranking.slice(0, 10);

  // 第 1 轮：在「未命中硬∪Baseline软」残差上挖（老规则已生效）；其后叠 Candidates
  const candidates = [];
  const mineLog = [];
  const nearMiss = [];
  const mineRounds = [];
  const features = top10.map((t) => t.col);
  let candSeq = 0;

  function residualOf(customs) {
    return RV.domain.validity.filterNewStrategyPassRows(
      postB,
      hardRuntime,
      stackNewCustoms(baselineSoftCustom, customs)
    );
  }

  function makeMineEntry(round, c, stab, monthsAll, extra) {
    return {
      round,
      expr: candExpr(c),
      hit: c.hitApplyVol,
      hitApplyVol: c.hitApplyVol,
      hitCount: c.hitCount,
      badRate: c.badRate,
      riskNum: c.riskNum,
      riskDen: c.riskDen,
      lift: c.lift,
      labelBadRate: c.labelBadRate,
      riskMetric: "fpd1_cnt%",
      overallAbsOk: c.badRate != null && c.badRate > CFG.minAbsRisk,
      stable: stab,
      monthsAll,
      ...extra,
    };
  }

  /**
   * 在给定残差上扫描并采纳 1 条过跨月门禁的候选。
   * floorMap/bannedExprs：续挖时禁同列更松 / 已回退表达式；preferOtherCols：优先未用列。
   */
  function scanAdoptOne(workRows, opts = {}) {
    const {
      round = 0,
      planTag = "shared",
      floorMap = {},
      bannedExprs = new Set(),
      preferOtherCols = new Set(),
      pushNearMissExtras = true,
    } = opts;
    const workY = RV.domain.eda.buildYVector(workRows, { col: CFG.riskNumCol, threshold: 0 });
    const workOverall = riskOf(workRows).rate;
    const workByMonth = {};
    {
      const byM = RV.infra.indexRowsByGroup(workRows, [CFG.postMonthCol || "submit_month"]);
      for (const m of Object.keys(byM)) workByMonth[m] = riskOf(byM[m]).rate;
    }
    log(
      "mine",
      planTag,
      "round",
      round,
      "workN",
      workRows.length,
      "bizRisk",
      workOverall
    );
    const scanned = RV.domain.ruleMining.scanSingleFeatureThresholds(workRows, workY, features, {
      mineTarget: "risk",
      minLift: 0,
      minSamples: CFG.minHit,
      minHitRate: 0,
      topKPerFeature: 12,
      maxCuts: 30,
    });
    const rescored = scanned
      .filter((c) => CFG.allowedOperators.includes(c.operator))
      .map((c) => attachBizMetrics(RV, workRows, c, workOverall))
      .filter(
        (c) =>
          (c.hitApplyVol ?? c.hitCount) >= CFG.minHit &&
          c.badRate != null &&
          c.badRate > CFG.minAbsRisk &&
          liftPass(c.lift)
      )
      .filter((c) => !isBlockedCand(c, floorMap, bannedExprs).blocked)
      .sort((a, b) => {
        const au = preferOtherCols.has(a.column) ? 1 : 0;
        const bu = preferOtherCols.has(b.column) ? 1 : 0;
        if (au !== bu) return au - bu; // 未用列优先
        return (b.badRate ?? 0) - (a.badRate ?? 0) || (b.lift ?? 0) - (a.lift ?? 0);
      });

    const trainMonths = Object.keys(overallByMonth).sort();
    const monthBase = { ...overallByMonth, ...workByMonth };
    let adopted = null;
    let adoptedEntry = null;
    let adoptedStab = null;
    for (const c of rescored) {
      const stab = monthsStable(RV, workRows, c, workByMonth);
      const monthsAll = monthsBizAll(RV, workRows, c, monthBase, trainMonths);
      const entry = makeMineEntry(round, c, stab, monthsAll, { planTag });
      mineLog.push(entry);
      if (!stab.ok) nearMiss.push(entry);
      if (stab.ok) {
        adopted = c;
        adoptedEntry = entry;
        adoptedStab = stab;
        break;
      }
    }
    if (!adopted) {
      if (pushNearMissExtras) {
        const extras = scanned
          .filter((c) => CFG.allowedOperators.includes(c.operator))
          .map((c) => attachBizMetrics(RV, workRows, c, workOverall))
          .filter((c) => (c.hitApplyVol ?? c.hitCount) >= CFG.minHit)
          .filter((c) => !isBlockedCand(c, floorMap, bannedExprs).blocked)
          .sort((a, b) => (b.badRate ?? 0) - (a.badRate ?? 0) || (b.lift ?? 0) - (a.lift ?? 0))
          .slice(0, 8);
        for (const c of extras) {
          if (mineLog.some((e) => e.expr === candExpr(c) && e.round === round && e.planTag === planTag))
            continue;
          const stab = monthsStable(RV, workRows, c, workByMonth);
          const monthsAll = monthsBizAll(RV, workRows, c, monthBase, trainMonths);
          const entry = makeMineEntry(round, c, stab, monthsAll, { planTag });
          mineLog.push(entry);
          nearMiss.push(entry);
        }
      }
      mineLog.push({
        round,
        planTag,
        note: "no candidate passed monthly gate (fpd1_cnt%)",
      });
      return null;
    }
    return {
      cand: adopted,
      entry: adoptedEntry,
      stab: adoptedStab,
      workN: workRows.length,
      workBizRisk: workOverall,
    };
  }

  function pushMineRound(adoptedPack, scope, planTag) {
    const { cand, entry, stab, workN, workBizRisk } = adoptedPack;
    mineRounds.push({
      round: entry.round,
      planTag,
      scope,
      workN,
      workBizRisk,
      expr: entry.expr,
      column: cand.column,
      operator: cand.operator,
      threshold: cand.threshold,
      hit: cand.hitApplyVol,
      hitApplyVol: cand.hitApplyVol,
      hitCount: cand.hitCount,
      badRate: cand.badRate,
      riskNum: cand.riskNum,
      riskDen: cand.riskDen,
      lift: cand.lift,
      riskMetric: "fpd1_cnt%",
      months: (stab.detail || []).map((d) => ({
        month: d.month,
        hit: d.hitApplyVol ?? d.hit,
        hitApplyVol: d.hitApplyVol ?? d.hit,
        hitCount: d.hitCount,
        badRate: d.badRate,
        riskNum: d.riskNum,
        riskDen: d.riskDen,
        lift: d.lift,
        pass: d.pass,
      })),
    });
  }

  // —— 共享挖规：产出 Candidates 池（供两方案试装；不做辅约束回退）——
  {
    let workRows = residualOf([]);
    for (let round = 1; round <= CFG.maxRounds && candidates.length < CFG.maxRules; round++) {
      const pack = scanAdoptOne(workRows, {
        round,
        planTag: "shared",
        floorMap: {},
        bannedExprs: new Set(),
        preferOtherCols: new Set(),
      });
      if (!pack) break;
      candSeq += 1;
      const custom = candToCustom(pack.cand, candSeq);
      candidates.push({ ...custom, meta: pack.cand });
      pushMineRound(pack, round === 1 ? "工作样本" : "残差", "shared");
      workRows = residualOf(candidates);
    }
  }

  function evalCustoms(customs) {
    const stacked = stackNewCustoms(baselineSoftCustom, customs);
    const mB = newStrategyMetrics(RV, postB, preB, hardRuntime, stacked);
    const mA = newStrategyMetrics(RV, postA, preA, hardRuntime, stacked);
    return { B: mB, A: mA, customs };
  }

  function riskDualOk(ev) {
    const riskOk = ev.B.risk.rate != null && ev.B.risk.rate <= CFG.targetRisk;
    const passBand =
      ev.B.pass.rate != null && relDev(ev.B.pass.rate, CFG.targetPass) <= CFG.auxBand;
    return riskOk && passBand;
  }
  function passDualOk(ev) {
    const passOk = ev.B.pass.rate != null && ev.B.pass.rate >= CFG.targetPass;
    const riskBand =
      ev.B.risk.rate != null && relDev(ev.B.risk.rate, CFG.targetRisk) <= CFG.auxBand;
    return passOk && riskBand;
  }
  function riskAuxOk(ev) {
    return ev.B.pass.rate != null && relDev(ev.B.pass.rate, CFG.targetPass) <= CFG.auxBand;
  }
  function passAuxOk(ev) {
    return ev.B.risk.rate != null && relDev(ev.B.risk.rate, CFG.targetRisk) <= CFG.auxBand;
  }

  /**
   * 方案组装：试加 → 辅约束破则回退并禁该表达式 → 未双达标则残差续挖（禁同列更松，优先其他列）。
   */
  function assemblePlan(planKind) {
    const isRisk = planKind === "risk";
    const dualOk = isRisk ? riskDualOk : passDualOk;
    const auxOk = isRisk ? riskAuxOk : passAuxOk;
    const auxLabel = isRisk ? "放行率辅约束" : "风险辅约束";
    const customs = [];
    const bannedExprs = new Set();
    const assembleLog = [];
    let metrics = evalCustoms([]);
    let resumeRound = 0;

    function usedCols() {
      return new Set(
        customs.map((c) => c.root?.column || c.meta?.column).filter(Boolean)
      );
    }

    function tryAccept(metaOrCand, source) {
      const cand = metaOrCand.meta || metaOrCand;
      const expr = candExpr(cand);
      const floorMap = gteFloorFromCustoms(customs);
      const blk = isBlockedCand(cand, floorMap, bannedExprs);
      if (blk.blocked) {
        assembleLog.push({
          plan: planKind,
          action: "skip",
          source,
          expr,
          why: blk.why,
        });
        return "skip";
      }
      const custom =
        metaOrCand.root != null
          ? metaOrCand
          : { ...candToCustom(cand, (candSeq += 1)), meta: cand };
      const ev = evalCustoms([...customs, custom]);
      if (!auxOk(ev)) {
        bannedExprs.add(expr);
        assembleLog.push({
          plan: planKind,
          action: "rollback_aux",
          source,
          expr,
          why: auxLabel,
          pass: ev.B.pass?.rate,
          risk: ev.B.risk?.rate,
        });
        log("assemble", planKind, "rollback_aux", expr, auxLabel);
        return "rollback";
      }
      customs.push(custom);
      metrics = ev;
      assembleLog.push({
        plan: planKind,
        action: "accept",
        source,
        expr,
        pass: ev.B.pass?.rate,
        risk: ev.B.risk?.rate,
      });
      log("assemble", planKind, "accept", expr);
      return dualOk(ev) ? "done" : "continue";
    }

    // A. 共享 Candidates 池按序试装
    for (const c of candidates) {
      const r = tryAccept(c, "shared");
      if (r === "done") {
        return { customs, metrics, assembleLog };
      }
    }

    // B. 未双达标 → 在已保留规则残差上续挖
    while (!dualOk(metrics) && customs.length < CFG.maxRules && resumeRound < CFG.maxRounds) {
      resumeRound += 1;
      const workRows = residualOf(customs);
      const pack = scanAdoptOne(workRows, {
        round: resumeRound,
        planTag: `${planKind}-resume`,
        floorMap: gteFloorFromCustoms(customs),
        bannedExprs,
        preferOtherCols: usedCols(),
        pushNearMissExtras: resumeRound <= 2,
      });
      if (!pack) {
        assembleLog.push({
          plan: planKind,
          action: "mine_exhausted",
          resumeRound,
        });
        break;
      }
      const r = tryAccept(pack.cand, "resume");
      if (r === "rollback" || r === "skip") {
        // 已 ban；继续下一轮挖别的切点/模型
        continue;
      }
      pushMineRound(
        { ...pack, entry: { ...pack.entry, round: resumeRound } },
        "方案残差续挖",
        `${planKind}-resume`
      );
      if (r === "done") break;
    }

    if (!dualOk(metrics)) {
      assembleLog.push({
        plan: planKind,
        action: "gap",
        reason: "触顶或续挖无解，未同时满足主停+辅约束",
        risk: metrics.B.risk?.rate,
        pass: metrics.B.pass?.rate,
      });
    }
    return { customs, metrics, assembleLog };
  }

  log("assembling risk / pass plans (rollback-aux + resume-mine)…");
  const riskAsm = assemblePlan("risk");
  const passAsm = assemblePlan("pass");
  const riskPlanCustoms = riskAsm.customs;
  const passPlanCustoms = passAsm.customs;
  let riskPlan = riskAsm.metrics;
  let passPlan = passAsm.metrics;
  const assembleLog = [...riskAsm.assembleLog, ...passAsm.assembleLog];

  const ratioSpec = { name: "fpd1_cnt%", num: CFG.riskNumCol, den: CFG.riskDenCol };

  /**
   * 新增 Candidates：贷后仅命中风险无（den=0/空）或贷前仅命中率为空/0 → 删除并迭代重审。
   * 不删 Baseline 软规则。
   */
  async function inspectCandidateOnlyHit(customs) {
    const stackedCustoms = stackNewCustoms(baselineSoftCustom, customs);
    const customSoft = RV.domain.validity.customRulesAsSoftRules(customs);
    const softForWf = CFG.keepBaselineSoft
      ? [...softRuntimeAsWfSoft(softNewBase), ...customSoft]
      : customSoft;
    const order = RV.domain.validity.dedupeWaterfallRules([...hardRuntime, ...softForWf]);
    const postWf = await RV.domain.summary.computeSummary(
      postB,
      hardRuntime,
      softForWf,
      [],
      order,
      [ratioSpec]
    );
    const preHit = await RV.domain.validity.computeValidityPreHitTable(
      preB,
      hardRuntime,
      stackedCustoms,
      [],
      order
    );
    const preAll = (preHit || []).filter((r) => r.groupKey === "__all__" || !r.groupKey);
    return { postRows: postWf.rows || [], preRows: preAll };
  }

  function candidateOnlyHitFail(c, postRows, preRows) {
    const post =
      (postRows || []).find((r) => r.ruleId === c.id || r.name === c.name) || null;
    const pre =
      (preRows || []).find((r) => r.ruleId === c.id || r.ruleName === c.name) || null;
    const postDen = post?.onlyHitDen;
    const postRisk = post?.onlyHitRisk;
    const postBad =
      post == null ||
      postDen == null ||
      postDen === 0 ||
      postRisk == null;
    const preRate = pre?.onlyRate;
    const preBad = pre == null || preRate == null || preRate === 0;
    return {
      bad: postBad || preBad,
      postBad,
      preBad,
      onlyHitDen: postDen ?? null,
      onlyHitRisk: postRisk ?? null,
      onlyRate: preRate ?? null,
    };
  }

  async function pruneCustomsByOnlyHit(customs, planLabel) {
    let cur = (customs || []).slice();
    const removed = [];
    for (let iter = 1; iter <= 20; iter++) {
      if (!cur.length) break;
      const { postRows, preRows } = await inspectCandidateOnlyHit(cur);
      const batch = [];
      for (const c of cur) {
        const fail = candidateOnlyHitFail(c, postRows, preRows);
        if (fail.bad) {
          batch.push({
            plan: planLabel,
            iter,
            id: c.id,
            name: c.name,
            reasons: [
              fail.postBad ? "贷后仅命中风险无(den=0/空)" : null,
              fail.preBad ? "贷前仅命中率为空或0" : null,
            ].filter(Boolean),
            onlyHitDen: fail.onlyHitDen,
            onlyHitRisk: fail.onlyHitRisk,
            onlyRate: fail.onlyRate,
          });
        }
      }
      if (!batch.length) break;
      const rm = new Set(batch.map((b) => b.id));
      cur = cur.filter((c) => !rm.has(c.id));
      removed.push(...batch);
      log(
        "pruneOnlyHit",
        planLabel,
        "iter",
        iter,
        "removed",
        batch.map((b) => b.name),
        "left",
        cur.length
      );
    }
    return { customs: cur, removed };
  }

  log("pruning plans by only-hit gates…");
  const riskPrune = await pruneCustomsByOnlyHit(riskPlanCustoms, "risk");
  riskPlanCustoms.length = 0;
  riskPlanCustoms.push(...riskPrune.customs);
  riskPlan = evalCustoms(riskPlanCustoms);

  const passPrune = await pruneCustomsByOnlyHit(passPlanCustoms, "pass");
  passPlanCustoms.length = 0;
  passPlanCustoms.push(...passPrune.customs);
  passPlan = evalCustoms(passPlanCustoms);

  const pruneLog = [...riskPrune.removed, ...passPrune.removed];
  function assembleGapNote(planKind, customs, pruneRemoved) {
    if (!customs.length && pruneRemoved.length) {
      return "仅命中剪枝后 Candidates 为空 → Baseline-only；无增量新规可交";
    }
    if (!customs.length && !candidates.length) {
      return "未挖到合法 Candidates → Baseline-only";
    }
    const ev = planKind === "risk" ? riskPlan : passPlan;
    const dual = planKind === "risk" ? riskDualOk(ev) : passDualOk(ev);
    if (!dual) {
      const rolls = assembleLog.filter(
        (a) => a.plan === planKind && a.action === "rollback_aux"
      ).length;
      const resumes = assembleLog.filter(
        (a) => a.plan === planKind && a.source === "resume" && a.action === "accept"
      ).length;
      return `未同时满足主停+辅约束（辅约束回退 ${rolls} 次；残差续挖接纳 ${resumes} 条）；见 assembleLog`;
    }
    return null;
  }
  const riskPlanGap = assembleGapNote("risk", riskPlanCustoms, riskPrune.removed);
  const passPlanGap = assembleGapNote("pass", passPlanCustoms, passPrune.removed);
  const SEG_LABELS = {
    inin: "双方通过",
    swapin: "新进",
    swapout: "换出",
    outout: "双方拒绝",
  };

  /**
   * swapin 预估：模型等频分箱 → 箱内 R_swapin = R_inin × k → 按各箱贷前 swapin 进件结构加权。
   * 汇总 R̂：inin 观测风险与 swapin 预估，按贷前 inin/swapin 进件结构加权。
   */
  function estimateSwapinByBinIninK(customs, binCol, nBins, k, postSample, preSample) {
    if (!binCol) return null;
    const postS = postSample || postB;
    const preS = preSample || preB;
    const rule = RV.infra.buildEqualFreqBinRule(postS, binCol, nBins);
    const labels = RV.infra.binLabelOrder(rule);
    const buckets = Object.fromEntries(
      labels.map((lab) => [
        lab,
        {
          label: lab,
          ininNum: 0,
          ininDen: 0,
          swapinNum: 0,
          swapinDen: 0,
          swapinPreApply: 0,
        },
      ])
    );

    const stackedCustoms = stackNewCustoms(baselineSoftCustom, customs);
    for (const row of postS) {
      const lab = RV.infra.getBinnedLabel(RV.infra.rowVal(row, binCol), rule, row);
      const b = buckets[lab];
      if (!b) continue;
      const oRej = RV.domain.validity.rowOnlineReject(row, hardRuntime, softOnline);
      const nRej = RV.domain.validity.rowNewReject(row, hardRuntime, stackedCustoms);
      const num = RV.infra.parseNumZero(RV.infra.rowVal(row, ratioSpec.num));
      const den = RV.infra.parseNumZero(RV.infra.rowVal(row, ratioSpec.den));
      if (!oRej && !nRej) {
        b.ininNum += num;
        b.ininDen += den;
      } else if (oRej && !nRej) {
        b.swapinNum += num;
        b.swapinDen += den;
      }
    }
    for (const row of preS) {
      const lab = RV.infra.getBinnedLabel(RV.infra.rowVal(row, binCol), rule, row);
      const b = buckets[lab];
      if (!b) continue;
      const oRej = RV.domain.validity.rowOnlineReject(row, hardRuntime, softOnline);
      const nRej = RV.domain.validity.rowNewReject(row, hardRuntime, stackedCustoms);
      if (oRej && !nRej) b.swapinPreApply += RV.infra.getApplyVol(row);
    }

    const preSwapinTotal = labels.reduce((s, lab) => s + (buckets[lab].swapinPreApply || 0), 0);
    const bins = labels.map((lab) => {
      const b = buckets[lab];
      const ininRate = b.ininDen > 0 ? b.ininNum / b.ininDen : null;
      const swapinObs = b.swapinDen > 0 ? b.swapinNum / b.swapinDen : null;
      const swapinEst = ininRate != null ? ininRate * k : null;
      const weight = b.swapinPreApply;
      const share = preSwapinTotal > 0 ? weight / preSwapinTotal : 0;
      return {
        label: lab,
        ininRate,
        ininNum: b.ininNum,
        ininDen: b.ininDen,
        swapinObs,
        swapinEst,
        swapinDen: b.swapinDen,
        swapinPreApply: b.swapinPreApply,
        weight,
        share,
      };
    });

    let rSum = 0;
    let shareSum = 0;
    for (const b of bins) {
      if (b.swapinEst != null && b.weight > 0) {
        rSum += b.share * b.swapinEst;
        shareSum += b.share;
      }
    }
    // share already normalized over all pre-swapin; if some bins lack inin, renormalize over usable shares
    const swapinEstRate = shareSum > 0 ? rSum / shareSum : null;
    return {
      method: "bin_inin_x_k_pre_structure",
      binCol,
      nBins,
      k,
      weightBasis: "swapin_pre_apply",
      bins,
      swapinEstRate,
      preSwapinApplyTotal: preSwapinTotal,
    };
  }

  /**
   * Pick swapin bin column: KS desc → first with strict 4-bin gradient on postB;
   * else max R^est_swapin among pool (fallback).
   */
  function pickSwapinBinCol(customs) {
    const pool = ranking.length ? ranking : top10;
    const tried = [];
    for (let i = 0; i < pool.length; i++) {
      const col = pool[i].col;
      const ks = pool[i].ks;
      let grad;
      try {
        const { rates } = equalFreqBinRiskRates(RV, postB, col, CFG.swapinEstNbins);
        grad = hasStrictBinGradient(rates);
      } catch (e) {
        grad = { ok: false, reason: `分箱失败: ${e.message || e}`, inflection: null, validBins: 0 };
      }
      tried.push({
        col,
        ks,
        ksRank: i + 1,
        hasGradient: !!grad.ok,
        reason: grad.reason,
        inflection: grad.inflection,
        validBins: grad.validBins,
        direction: grad.direction || null,
      });
      if (grad.ok) {
        return {
          chosen: col,
          ksRank: i + 1,
          ks,
          mode: "ks_gradient",
          modeLabel: "KS序·首个有4箱严格单调梯度",
          nBins: CFG.swapinEstNbins,
          tried,
          fallbackSwapinEstRate: null,
        };
      }
    }

    let best = null;
    for (const t of tried) {
      const est = estimateSwapinByBinIninK(customs, t.col, CFG.swapinEstNbins, CFG.k);
      const rate = est?.swapinEstRate ?? null;
      t.swapinEstRate = rate;
      if (rate != null && Number.isFinite(rate) && (!best || rate > best.rate)) {
        best = { col: t.col, rate, ksRank: t.ksRank, ks: t.ks };
      }
    }
    if (!best) {
      const fb = pool[0] || null;
      return {
        chosen: fb ? fb.col : null,
        ksRank: fb ? 1 : null,
        ks: fb ? fb.ks : null,
        mode: "none",
        modeLabel: "无可用列（回退KS#1或空）",
        nBins: CFG.swapinEstNbins,
        tried,
        fallbackSwapinEstRate: null,
      };
    }
    return {
      chosen: best.col,
      ksRank: best.ksRank,
      ks: best.ks,
      mode: "max_swapin_est_fallback",
      modeLabel: "全无梯度·取预估swapin风险最高",
      nBins: CFG.swapinEstNbins,
      tried,
      fallbackSwapinEstRate: best.rate,
    };
  }

  function slimSwap(swapRows, customs, binColSelection, postSample, preSample) {
    const row = swapRows?.[0] || null;
    if (!row) return null;
    const binCol = binColSelection?.chosen || null;
    const postS = postSample || postB;
    const preS = preSample || preB;
    const segs = {};
    for (const key of Object.keys(SEG_LABELS)) {
      const s = row.segments?.[key] || {};
      segs[key] = {
        label: SEG_LABELS[key],
        rowCount: s.rowCount ?? 0,
        applyVol: s.applyVol ?? 0,
        applyShare: s.applyShare ?? null,
        risk: s.risk || null,
      };
    }
    const inin = segs.inin?.risk || null;
    const swapin = segs.swapin?.risk || null;
    const swapout = segs.swapout?.risk || null;
    const Vin = segs.inin?.applyVol ?? 0;
    const Vsw = segs.swapin?.applyVol ?? 0;

    let RhatObs = null;
    if (inin && swapin && Vin + Vsw > 0) {
      const wPre = Vin / (Vin + Vsw);
      RhatObs = {
        w: wPre,
        R: wPre * (inin.rate ?? 0) + (1 - wPre) * (swapin.rate ?? 0),
        ininRate: inin.rate,
        swapinRate: swapin.rate,
        swapoutRate: swapout?.rate ?? null,
        method: "observed_swapin_pre_structure",
        weightBasis: "pre_apply",
        preIninApply: Vin,
        preSwapinApply: Vsw,
      };
    }

    const swapinEst = estimateSwapinByBinIninK(
      customs,
      binCol,
      CFG.swapinEstNbins,
      CFG.k,
      postS,
      preS
    );
    let Rhat = null;
    if (inin?.rate != null && swapinEst?.swapinEstRate != null && Vin + Vsw > 0) {
      const wPre = Vin / (Vin + Vsw);
      Rhat = {
        w: wPre,
        R: wPre * inin.rate + (1 - wPre) * swapinEst.swapinEstRate,
        ininRate: inin.rate,
        swapinRate: swapinEst.swapinEstRate,
        swapinRateObs: swapin?.rate ?? null,
        swapoutRate: swapout?.rate ?? null,
        method: "bin_inin_x_k_pre_structure",
        weightBasis: "pre_apply",
        binCol: swapinEst.binCol,
        nBins: swapinEst.nBins,
        k: swapinEst.k,
        preIninApply: Vin,
        preSwapinApply: Vsw,
      };
    } else {
      Rhat = RhatObs;
    }

    return {
      totalApply: row.totalApply,
      segments: segs,
      Rhat,
      RhatObs,
      swapinEst,
      binColSelection,
      onlinePass: row.onlinePass
        ? { applyVol: row.onlinePass.applyVol, risk: row.onlinePass.risk }
        : null,
      newPass: row.newPass
        ? { applyVol: row.newPass.applyVol, risk: row.newPass.risk }
        : null,
    };
  }

  async function buildBacktestBlock(customs, binColSelection, softForWf, order, stackedCustoms) {
    const swapRowsBt = await RV.domain.validity.computeValiditySwapTable(
      preBBt,
      postBBt,
      hardRuntime,
      softOnline,
      stackedCustoms,
      [],
      ratioSpec,
      null
    );
    const postWfBt = await RV.domain.summary.computeSummary(
      postBBt,
      hardRuntime,
      softForWf,
      [],
      order,
      [ratioSpec]
    );
    const mapPostWfRow = (r) => ({
      ruleId: r.ruleId,
      name: r.name,
      kind: r.kind,
      postHitVol: r.postHitVol,
      riskHit: r.riskHit,
      postMissVol: r.postMissVol,
      riskMiss: r.riskMiss,
      wfHitRisk: r.wfHitRisk,
      wfHitDen: r.wfHitDen,
      onlyHitRisk: r.onlyHitRisk,
      onlyHitDen: r.onlyHitDen,
    });
    const baselineOnlineBt = newStrategyMetrics(
      RV,
      postBBt,
      preBBt,
      hardRuntime,
      baselineOnlineCustom
    );
    const newStrategyBaseBt = newStrategyMetrics(
      RV,
      postBBt,
      preBBt,
      hardRuntime,
      stackNewCustoms(baselineSoftCustom, [])
    );
    const planMetricsBt = newStrategyMetrics(
      RV,
      postBBt,
      preBBt,
      hardRuntime,
      stackedCustoms
    );
    return {
      note: "规则冻结自训练窗；回测窗仅重算 Swap/R̂ 与贷后瀑布，不重挖不重剪枝",
      windows: {
        post: `${CFG.postMonthCol}>=${CFG.btPostFrom}`,
        pre: `${CFG.preDateCol}>=${btPreMin}`,
      },
      segment: {
        postN: postRowsBt.length,
        postB: postBBt.length,
        preN: preRowsBt.length,
        preB: preBBt.length,
      },
      riskB: riskOf(postBBt),
      /** 回测窗历史通过率（对照） */
      passBHist: passOf(preBBt),
      /**
       * 线上 Baseline 策略放行 = 硬 ∪ 线上 Soft 全量（含 p1）；影响对照分母。
       * @deprecated 字段名 baselineOnly 保留兼容；语义已改为 online。
       */
      baselineOnly: {
        risk: baselineOnlineBt.risk,
        pass: baselineOnlineBt.pass,
      },
      baselineOnline: {
        risk: baselineOnlineBt.risk,
        pass: baselineOnlineBt.pass,
      },
      /** 新策略底（硬∪新策略侧 Soft、无 Candidates）— 对照用 */
      newStrategyBase: {
        risk: newStrategyBaseBt.risk,
        pass: newStrategyBaseBt.pass,
      },
      /** 冻结方案在回测窗的策略放行 / 观测风险 */
      planMetrics: {
        risk: planMetricsBt.risk,
        pass: planMetricsBt.pass,
      },
      // binCol 沿用训练窗选用，避免回测重选列导致口径漂移
      swap: slimSwap(swapRowsBt, customs, binColSelection, postBBt, preBBt),
      postWaterfall: (postWfBt.rows || [])
        .filter((r) => r.kind !== "segment")
        .map(mapPostWfRow),
      postWaterfallSegment: (postWfBt.rows || [])
        .filter((r) => r.kind === "segment")
        .map(mapPostWfRow),
    };
  }

  /** 相对影响 (新-旧)/旧；旧为 0 时改用绝对差 */
  function relativeImpact(next, base) {
    if (next == null || base == null || !Number.isFinite(next) || !Number.isFinite(base)) {
      return { rel: null, pp: null };
    }
    const pp = next - base;
    const rel = base === 0 ? pp : pp / Math.abs(base);
    return { rel, pp };
  }

  function buildWindowImpact({
    statusRisk,
    rhat,
    histPass,
    baselinePass,
    planPass,
    newStrategyBasePass,
  }) {
    const riskImp = relativeImpact(rhat, statusRisk);
    const passImp = relativeImpact(planPass, baselinePass);
    return {
      statusRisk,
      rhat,
      riskRel: riskImp.rel,
      riskPp: riskImp.pp,
      histPass,
      /** 线上 Baseline：硬 ∪ 线上 Soft 全量（含 p1） */
      baselinePass,
      /** 新策略底：硬 ∪ 新策略侧 Soft（无 Candidates）；仅对照 */
      newStrategyBasePass: newStrategyBasePass ?? null,
      planPass,
      passRel: passImp.rel,
      passPp: passImp.pp,
    };
  }

  async function buildPlanDetail(label, customs, metrics) {
    const names = new Set(customs.map((c) => c.name));
    const rounds = mineRounds.filter((r) => names.has(r.expr) || names.has(`${r.column} ${r.operator} ${r.threshold}`));
    // match by order if names differ slightly
    const roundsByOrder = mineRounds.slice(0, customs.length);

    const binColSelection = pickSwapinBinCol(customs);
    log(
      "swapinEst pick",
      label,
      "mode=",
      binColSelection.mode,
      "binCol=",
      binColSelection.chosen,
      "ksRank=",
      binColSelection.ksRank,
      "nBins=",
      CFG.swapinEstNbins,
      "k=",
      CFG.k
    );

    const stackedCustoms = stackNewCustoms(baselineSoftCustom, customs);
    const swapRows = await RV.domain.validity.computeValiditySwapTable(
      preB,
      postB,
      hardRuntime,
      softOnline,
      stackedCustoms,
      [],
      ratioSpec,
      null
    );
    const customSoft = RV.domain.validity.customRulesAsSoftRules(customs);
    const softForWf = CFG.keepBaselineSoft
      ? [...softRuntimeAsWfSoft(softNewBase), ...customSoft]
      : customSoft;
    const order = RV.domain.validity.dedupeWaterfallRules([...hardRuntime, ...softForWf]);
    const postWf = await RV.domain.summary.computeSummary(
      postB,
      hardRuntime,
      softForWf,
      [],
      order,
      [ratioSpec]
    );
    const preHit = await RV.domain.validity.computeValidityPreHitTable(
      preB,
      hardRuntime,
      stackedCustoms,
      [],
      order
    );
    const preHitAll = (preHit || []).filter((r) => r.groupKey === "__all__" || !r.groupKey);

    // 报告内瀑布 DnD：导出命中掩码，客户端改序后重算序变列（不嵌整包 domain）
    const dndRules = order.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      kind: r.isHard ? "hard" : r.kind === "hard" ? "hard" : "soft",
      draggable: !r.isHard,
    }));
    const postMasksRaw = RV.domain.rules.buildHitMasksForRules(postB, order);
    const preMasksRaw = RV.domain.rules.buildHitMasksForRules(preB, order);
    const masksToObj = (rulesList, masksArr) => {
      const out = {};
      for (let i = 0; i < rulesList.length; i++) {
        const m = masksArr[i] || [];
        out[rulesList[i].id] = Array.from(m, (v) => (v ? 1 : 0));
      }
      return out;
    };
    let preTotalApply = 0;
    const preApply = preB.map((row) => {
      const v = RV.infra.getApplyVol(row);
      preTotalApply += v;
      return v;
    });
    const postFz = postB.map((row) => RV.infra.parseNumZero(RV.infra.rowVal(row, ratioSpec.num)));
    const postFm = postB.map((row) => RV.infra.parseNumZero(RV.infra.rowVal(row, ratioSpec.den)));
    const waterfallDnD = null; // offline package omits mask payload

    const mapPostWfRow = (r) => ({
      ruleId: r.ruleId,
      name: r.name,
      kind: r.kind,
      postHitVol: r.postHitVol,
      riskHit: r.riskHit,
      postMissVol: r.postMissVol,
      riskMiss: r.riskMiss,
      wfHitRisk: r.wfHitRisk,
      wfHitDen: r.wfHitDen,
      onlyHitRisk: r.onlyHitRisk,
      onlyHitDen: r.onlyHitDen,
    });
    const postWfRuleRows = (postWf.rows || [])
      .filter((r) => r.kind !== "segment")
      .map(mapPostWfRow);
    const postWfSegmentRows = (postWf.rows || [])
      .filter((r) => r.kind === "segment")
      .map(mapPostWfRow);
    const swapSlim = slimSwap(swapRows, customs, binColSelection, postB, preB);
    const backtest = CFG.btPostFrom
      ? await buildBacktestBlock(
          customs,
          binColSelection,
          softForWf,
          order,
          stackedCustoms
        )
      : null;
    const impact = {
      note:
        "风险相对影响=(R̂−现状风险)/现状风险；放行相对影响=(新方案放行−线上Baseline放行)/线上Baseline放行；Baseline=硬∪线上Soft全量（含p1）；均为相对%",
      train: buildWindowImpact({
        statusRisk: statusRiskTrain,
        rhat: swapSlim.Rhat?.R ?? null,
        histPass: statusHistPassTrain,
        baselinePass: baselineOnline.pass?.rate ?? null,
        planPass: metrics.B.pass?.rate ?? null,
        newStrategyBasePass: newStrategyBaseOnly.pass?.rate ?? null,
      }),
      backtest: backtest
        ? buildWindowImpact({
            statusRisk: backtest.riskB?.rate ?? null,
            rhat: backtest.swap?.Rhat?.R ?? null,
            histPass: backtest.passBHist?.rate ?? null,
            baselinePass: backtest.baselineOnline?.pass?.rate ?? backtest.baselineOnly?.pass?.rate ?? null,
            planPass: backtest.planMetrics?.pass?.rate ?? null,
            newStrategyBasePass: backtest.newStrategyBase?.pass?.rate ?? null,
          })
        : null,
    };
    return {
      label,
      target:
        label === "risk"
          ? { kind: "风险", stop: CFG.targetRisk, metric: "fpd1_cnt%" }
          : { kind: "通过率", stop: CFG.targetPass, metric: "pass_rate" },
      rules: customs.map((c) => c.name),
      metrics: { risk: metrics.B.risk, pass: metrics.B.pass },
      rounds: (rounds.length ? rounds : roundsByOrder).map((r, i) => ({
        ...r,
        planRound: i + 1,
      })),
      binColSelection,
      swap: swapSlim,
      postWaterfall: postWfRuleRows,
      postWaterfallSegment: postWfSegmentRows,
      preHit: preHitAll.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        kind: r.kind,
        hitVol: r.hitVol,
        hitRate: r.hitRate,
        onlyVol: r.onlyVol,
        onlyRate: r.onlyRate,
        stepVol: r.stepVol,
        stepRate: r.stepRate,
        cumVol: r.cumVol,
      })),
      waterfallDnD,
      backtest,
      impact,
      pruneRemoved: (pruneLog || []).filter((p) => p.plan === label),
      assembleLog: (assembleLog || []).filter((a) => a.plan === label),
      gap: label === "risk" ? riskPlanGap : passPlanGap,
    };
  }

  /** 新策略底（硬∪新策略侧 Soft）— 挖规/叠规底，非影响表 Baseline 列 */
  const newStrategyBaseOnly = newStrategyMetrics(
    RV,
    postB,
    preB,
    hardRuntime,
    stackNewCustoms(baselineSoftCustom, [])
  );
  /** 线上 Baseline（硬∪线上 Soft 全量含 p1）— 影响对照 Baseline放行 */
  const baselineOnline = newStrategyMetrics(
    RV,
    postB,
    preB,
    hardRuntime,
    baselineOnlineCustom
  );
  /** @deprecated 兼容：曾表示新策略底；现与 baselineOnline 对齐为线上口径 */
  const baselineOnly = baselineOnline;
  const statusRiskTrain = riskOf(postB).rate;
  const statusHistPassTrain = passOf(preB).rate;

  log("building planDetails…");
  const planDetails = {
    risk: await buildPlanDetail("risk", riskPlanCustoms, riskPlan),
    pass: await buildPlanDetail("pass", passPlanCustoms, passPlan),
  };

  const nearMissOut = nearMiss.slice(0, 12).map((c) => {
    const { monthsAll, ...rest } = c;
    return {
      ...rest,
      // 附录展示：工作样本全部分月；门禁仍只用 stable（近3月）
      byMonth: monthDetailToByMonth(monthsAll?.length ? monthsAll : c.stable?.detail),
      gateMonths: c.stable?.months || [],
    };
  });

  const report = {
    path: "domain",
    tool: "admission-iteration-app",
    generatedAt: new Date().toISOString(),
    windows: {
      post: `${CFG.postMonthCol}>=${CFG.postFrom}`,
      pre: `${CFG.preDateCol}>=${CFG.preFrom}`,
      train: {
        post: `${CFG.postMonthCol}>=${CFG.postFrom}`,
        pre: `${CFG.preDateCol}>=${CFG.preFrom}`,
      },
      backtest: CFG.btPostFrom
        ? {
            post: `${CFG.postMonthCol}>=${CFG.btPostFrom}`,
            pre: `${CFG.preDateCol}>=${btPreMin}`,
            preSameAsTrain: !CFG.btPreFrom,
          }
        : null,
    },
    fieldMap: {
      postMonthCol: CFG.postMonthCol,
      preDateCol: CFG.preDateCol,
      decisionCol: CFG.decisionCol,
      riskNumCol: CFG.riskNumCol,
      riskDenCol: CFG.riskDenCol,
    },
    segment: Object.assign({}, input.segmentMeta || {}, {
      n: seg.length,
      postN: postRows.length,
      postB: postB.length,
      backtest: {
        postN: postRowsBt.length,
        postB: postBBt.length,
        preN: preRowsBt.length,
        preB: preBBt.length,
      },
      preB: preB.length,
    }),
    targets: { risk: CFG.targetRisk, pass: CFG.targetPass, k: CFG.k },
    inUseModels: CFG.inUseModels.slice(),
    baselineSoftOnline: CFG.baselineSoftOnlineLabels.slice(),
    baselineSoftNewDrop: CFG.baselineSoftNewDropLabels.slice(),
    /** @deprecated 兼容旧字段名：意为「新策略不含」，非线上已删 */
    baselineSoftOffline: CFG.baselineSoftNewDropLabels.slice(),
    baselineWarnings: warnings,
    statusQuo: {
      riskB: riskOf(postB),
      riskA: riskOf(postA),
      passB: passOf(preB),
      passA: passOf(preA),
      /** 训练贷后窗 · A/B 组分月 fpd1_cnt% */
      riskByMonthB: riskByMonth(postB),
      riskByMonthA: riskByMonth(postA),
    },
    ranking,
    top10,
    mineLog,
    mineRounds,
    nearMiss: nearMissOut,
    candidates: candidates.map((c) => ({
      name: c.name,
      column: c.meta.column,
      operator: c.meta.operator,
      threshold: c.meta.threshold,
      hit: c.meta.hitApplyVol ?? c.meta.hitCount,
      hitApplyVol: c.meta.hitApplyVol ?? c.meta.hitCount,
      hitCount: c.meta.hitCount,
      badRate: c.meta.badRate,
      riskNum: c.meta.riskNum,
      riskDen: c.meta.riskDen,
      lift: c.meta.lift,
      riskMetric: "fpd1_cnt%",
    })),
    riskMetric: "fpd1_cnt%",
    baselineOnly: {
      risk: baselineOnly.risk,
      pass: baselineOnly.pass,
      note: "硬∪线上Soft全量（含p1）；影响对照Baseline放行分母",
    },
    baselineOnline: {
      risk: baselineOnline.risk,
      pass: baselineOnline.pass,
    },
    newStrategyBaseOnly: {
      risk: newStrategyBaseOnly.risk,
      pass: newStrategyBaseOnly.pass,
      note: "硬∪新策略侧Soft、无Candidates",
    },
    riskPlan: {
      rules: riskPlanCustoms.map((c) => c.name),
      risk: riskPlan.B.risk,
      pass: riskPlan.B.pass,
      gap: riskPlanGap,
    },
    passPlan: {
      rules: passPlanCustoms.map((c) => c.name),
      risk: passPlan.B.risk,
      pass: passPlan.B.pass,
      gap: passPlanGap,
    },
    assembleLog,
    planDetails,
    binColSelection: planDetails.risk.binColSelection || null,
    swap: planDetails.risk.swap, // backward compat: full risk-plan swap
    overallBizRisk: overallBiz,
    pruneLog,
    gateOverrides: (() => {
      const bullets = buildGateBullets();
      return {
        minHit: CFG.minHit,
        bullets,
        note: bullets.map((b) => b.detail).join("；"),
        minAbsRisk: CFG.minAbsRisk,
        minLift: CFG.minLift,
        minLiftNote: CFG.minLiftNote,
        keepBaselineSoft: CFG.keepBaselineSoft,
        stackNote: CFG.stackNote,
        passMetricNote: CFG.passMetricNote,
        pruneNote: CFG.pruneNote,
        assembleNote: CFG.assembleNote,
        pruneOnlyHit: true,
        passMetricPlan: "strategy_admit_rate",
        passMetricStatus: "hist_pass_rate",
        allowedOperators: CFG.allowedOperators,
        operatorNote: CFG.operatorNote,
      };
    })(),
  };


    if (onProgress) onProgress(100, "完成");
    return report;
  }

  global.AdmissionEngine = { runAdmissionEngine };
})(typeof window !== "undefined" ? window : global);
