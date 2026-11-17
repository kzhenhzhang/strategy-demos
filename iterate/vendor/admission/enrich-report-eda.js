/**
 * Enrich admission report JSON with monthly KS + bins
 * (equal-freq, or unique values when cardinality < ENUM_UNIQUE_LT).
 * Shared by skill CLI (bin/enrich-eda.js) and admission-iteration-app.
 *
 * enrichReportEda(RV, report, segRows, opts?) → mutates and returns report.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) root.AdmissionEnrichReportEda = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const N_BINS_DEFAULT = 5;
  /** 唯一取值个数 < 该值 → 按枚举值出表；否则等频 N_BINS_DEFAULT 箱 */
  const ENUM_UNIQUE_LT = 12;

  function dec(row, decisionCol) {
    const col = decisionCol || "决策组";
    return String(row[col] || "").toLowerCase();
  }

  function isBGroup(row, decisionCol) {
    const d = dec(row, decisionCol);
    return d === "b组" || d === "b" || d === "实验组";
  }

  function uniqueOkValues(RV, rows, col) {
    const set = new Set();
    for (const r of rows) {
      const p = RV.infra.parseNumericCell(RV.infra.rowVal(r, col));
      if (p.kind === "ok") set.add(p.n);
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  function buildUniqueValueBinRule(RV, col, values) {
    const base = RV.infra.buildEqualFreqBinRule([], col, 2);
    return {
      col,
      nBins: values.length,
      binMode: "unique_values",
      missingLabel: base.missingLabel,
      negativeLabel: base.negativeLabel,
      intervals: values.map((v) => ({
        lo: v,
        hi: v,
        loClosed: true,
        hiClosed: true,
        label: RV.infra.fmtBinCut(v),
        count: 0,
      })),
      nMissing: 0,
      nNegative: 0,
      nNonNeg: values.length,
    };
  }

  function displayBinRule(RV, rows, col, nBins) {
    const values = uniqueOkValues(RV, rows, col);
    const nUnique = values.length;
    if (nUnique > 0 && nUnique < ENUM_UNIQUE_LT) {
      const rule = buildUniqueValueBinRule(RV, col, values);
      return {
        rule,
        labels: rule.intervals.map((it) => it.label),
        binMode: "unique_values",
        nUnique,
      };
    }
    const rule = RV.infra.buildEqualFreqBinRule(rows, col, nBins);
    return {
      rule,
      labels: RV.infra.binLabelOrder(rule),
      binMode: "equal_freq",
      nUnique,
    };
  }

  function binsForRows(RV, rows, col, rule, labels) {
    const buckets = Object.fromEntries(labels.map((l) => [l, []]));
    for (const r of rows) {
      const lab = RV.infra.getBinnedLabel(RV.infra.rowVal(r, col), rule, r);
      if (buckets[lab]) buckets[lab].push(r);
    }
    return labels.map((label) => {
      const m = RV.infra.sumRatio(buckets[label], "fpd1_cnt_fz", "fpd1_cnt_fm");
      return { label, rate: m.rate, num: m.num, den: m.den };
    });
  }

  function planModelCols(plan) {
    const cols = [];
    const seen = new Set();
    const add = (col) => {
      const c = String(col || "").trim();
      if (!c || seen.has(c)) return;
      seen.add(c);
      cols.push(c);
    };
    const fromName = (s) => {
      const re = /(\S+)\s+(gte|lte|gt|lt)\s+/gi;
      let m;
      while ((m = re.exec(String(s || "")))) add(m[1]);
    };
    for (const r of plan.rules || []) fromName(r);
    for (const r of (plan.waterfallDnD && plan.waterfallDnD.rules) || []) fromName(r.name);
    return cols;
  }

  function sumFzFm(idxList, fz, fm) {
    let num = 0;
    let den = 0;
    for (let k = 0; k < idxList.length; k++) {
      const i = idxList[k];
      num += Number(fz[i]) || 0;
      den += Number(fm[i]) || 0;
    }
    return { rate: den > 0 ? num / den : null, num, den };
  }

  function attachPlanEval(RV, plan, postB, months, yB, nBins) {
    if (!plan || typeof plan !== "object") return plan;
    nBins = nBins || N_BINS_DEFAULT;
    months = months || [];
    const cols = planModelCols(plan);
    plan.modelCols = cols;
    plan.modelBins = cols.map((col) => buildBlock(RV, postB, yB, col, months, nBins));

    const dnd = plan.waterfallDnD;
    const post = dnd && dnd.post;
    const rules = (dnd && dnd.rules) || [];
    if (
      !post ||
      !Array.isArray(post.fz) ||
      !Array.isArray(post.fm) ||
      post.n !== postB.length ||
      post.fz.length !== postB.length
    ) {
      plan.ruleMonthHit = [];
      plan.wfHitByMonth = { months, rules: [] };
      plan.evalAlignOk = false;
      return plan;
    }
    plan.evalAlignOk = true;
    const fz = post.fz;
    const fm = post.fm;
    const maskMap = post.masks || {};
    const masks = rules.map((r) => maskMap[r.id] || []);
    const monthOf = postB.map((r) => String(r.submit_month || "").trim());

    function collect(pred) {
      const overall = [];
      const byMonthIdx = Object.fromEntries(months.map((m) => [m, []]));
      for (let i = 0; i < postB.length; i++) {
        if (!pred(i)) continue;
        overall.push(i);
        const m = monthOf[i];
        if (byMonthIdx[m]) byMonthIdx[m].push(i);
      }
      return {
        overall: sumFzFm(overall, fz, fm),
        byMonth: Object.fromEntries(months.map((m) => [m, sumFzFm(byMonthIdx[m], fz, fm)])),
      };
    }

    plan.ruleMonthHit = rules.map((rule, ri) => {
      const mask = masks[ri];
      return {
        ruleId: rule.id,
        name: rule.name,
        kind: rule.kind,
        hit: collect((i) => Number(mask[i]) === 1),
        miss: collect((i) => Number(mask[i]) !== 1),
      };
    });

    plan.wfHitByMonth = {
      months,
      rules: rules.map((r, ri) => {
        const earlier = masks.slice(0, ri);
        const mask = masks[ri];
        const step = collect((i) => {
          if (Number(mask[i]) !== 1) return false;
          for (let e = 0; e < earlier.length; e++) {
            if (Number(earlier[e][i]) === 1) return false;
          }
          return true;
        });
        return {
          ruleId: r.id,
          name: r.name,
          kind: r.kind,
          overall: step.overall,
          byMonth: step.byMonth,
        };
      }),
    };
    return plan;
  }

  function buildBlock(RV, postB, yB, col, months, nBins) {
    const m = RV.domain.eda.computeVarMetrics(postB, yB, col, ["submit_month"], nBins);
    const displayed = displayBinRule(RV, postB, col, nBins);
    const { rule, labels, binMode, nUnique } = displayed;
    const byMonth = RV.infra.indexRowsByGroup(postB, ["submit_month"]);
    const ksByMonth = {};
    for (const g of m.groups || []) {
      const month = (g.groupParts && g.groupParts[0]) || g.group;
      ksByMonth[month] = { ks: g.ks, auc: g.auc, iv: g.iv, psi: g.psi };
    }
    const binsByMonth = {};
    for (const month of months) {
      binsByMonth[month] = binsForRows(RV, byMonth[month] || [], col, rule, labels);
    }
    return {
      col,
      overall: m.overall,
      groups: m.groups,
      months,
      ksByMonth,
      binMode,
      nUnique,
      bins: binsForRows(RV, postB, col, rule, labels),
      binsByMonth,
    };
  }

  /**
   * Parse train/post window text into {col, op, val} predicates.
   * `submit_date>=2026-07-20` must compare submit_date, not submit_month
   * (month key `2026-07` < `2026-07-20` would drop the whole July).
   */
  function parseWindowPredicates(win) {
    const s = String(win || "");
    const preds = [];
    const re = /(submit_date|submit_month)\s*(>=|<=|>|<)\s*([0-9]{4}-[0-9]{2}(?:-[0-9]{2})?)/g;
    let m;
    while ((m = re.exec(s))) {
      preds.push({ col: m[1], op: m[2], val: m[3] });
    }
    if (!preds.length) {
      const loose = s.match(/(>=|<=|>|<)\s*([0-9]{4}-[0-9]{2}(?:-[0-9]{2})?)/);
      if (loose) {
        const val = loose[2];
        preds.push({
          col: val.length >= 10 ? "submit_date" : "submit_month",
          op: loose[1],
          val,
        });
      }
    }
    return preds;
  }

  function rowPassesWindow(row, preds) {
    if (!preds.length) return true;
    return preds.every((p) => {
      const v = String(row[p.col] ?? "").trim();
      if (!v) return false;
      if (p.op === ">=") return v >= p.val;
      if (p.op === "<=") return v <= p.val;
      if (p.op === ">") return v > p.val;
      if (p.op === "<") return v < p.val;
      return true;
    });
  }

  const SLICE_D5_COL = "d5策略通过量";
  const SLICE_D5_VALUES = ["1", "0"];

  function normalizeD5(v) {
    const s = String(v ?? "").trim();
    if (s === "1" || s === "1.0") return "1";
    if (s === "0" || s === "0.0") return "0";
    return null;
  }

  function parseCmpName(name) {
    const m = String(name || "").match(
      /^(\S+)\s+(gte|gt|lte|lt)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i
    );
    if (!m) return null;
    return { column: m[1], operator: m[2].toLowerCase(), threshold: Number(m[3]) };
  }

  function rowHitsCmp(RV, row, spec) {
    if (!spec) return false;
    const p = RV.infra.parseNumericCell(RV.infra.rowVal(row, spec.column));
    if (p.kind !== "ok") return false;
    const t = spec.threshold;
    if (spec.operator === "gte") return p.n >= t;
    if (spec.operator === "gt") return p.n > t;
    if (spec.operator === "lte") return p.n <= t;
    if (spec.operator === "lt") return p.n < t;
    return false;
  }

  function rowsHaveCol(rows, col) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][col] ?? "").trim() !== "") return true;
    }
    return false;
  }

  function metricFromRows(RV, rows) {
    const m = RV.infra.sumRatio(rows, "fpd1_cnt_fz", "fpd1_cnt_fm");
    let hitApply = 0;
    for (let i = 0; i < rows.length; i++) hitApply += RV.infra.getApplyVol(rows[i]);
    return { rate: m.rate, num: m.num, den: m.den, hitApply, n: rows.length };
  }

  function withLift(hit, base) {
    const lift =
      hit.rate != null && base && base.rate ? hit.rate / base.rate : null;
    return Object.assign({}, hit, { lift });
  }

  function candidateRules(plan) {
    const names = (plan.rules || [])
      .map((r) => (typeof r === "string" ? r : r && r.name))
      .filter(Boolean);
    const dndRules = (plan.waterfallDnD && plan.waterfallDnD.rules) || [];
    return names
      .map((name) => {
        const spec = parseCmpName(name);
        const dnd = dndRules.find((r) => r.name === name);
        return { name, spec, id: dnd && dnd.id };
      })
      .filter((r) => r.spec);
  }

  function buildD5Window(RV, rows, months, hitAt) {
    const monthList = months || [];
    const slices = {};
    for (const val of SLICE_D5_VALUES) {
      const baseAll = [];
      const hitAll = [];
      const baseBy = Object.fromEntries(monthList.map((m) => [m, []]));
      const hitBy = Object.fromEntries(monthList.map((m) => [m, []]));
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (normalizeD5(r[SLICE_D5_COL]) !== val) continue;
        const m = String(r.submit_month || "").trim();
        baseAll.push(r);
        if (baseBy[m]) baseBy[m].push(r);
        if (hitAt(i, r)) {
          hitAll.push(r);
          if (hitBy[m]) hitBy[m].push(r);
        }
      }
      const baseOverall = metricFromRows(RV, baseAll);
      const hitOverall = withLift(metricFromRows(RV, hitAll), baseOverall);
      slices[val] = {
        base: {
          overall: baseOverall,
          byMonth: Object.fromEntries(
            monthList.map((m) => [m, metricFromRows(RV, baseBy[m])])
          ),
        },
        hit: {
          overall: hitOverall,
          byMonth: Object.fromEntries(
            monthList.map((m) => [
              m,
              withLift(metricFromRows(RV, hitBy[m]), metricFromRows(RV, baseBy[m])),
            ])
          ),
        },
      };
    }
    return { months: monthList, slices };
  }

  function rowHitsNamedRule(RV, row, rule) {
    const name = String((rule && rule.name) || "");
    const id = String((rule && rule.id) || "");
    const spec = parseCmpName(name);
    if (spec) return rowHitsCmp(RV, row, spec);
    if (id === "hist_pass" || name === "通过量≠1" || name === "通过量!=1") {
      const p = RV.infra.parseNumericCell(RV.infra.rowVal(row, "通过量"));
      return p.kind === "ok" && p.n === 0;
    }
    const col = name || id;
    if (!col) return false;
    const p = RV.infra.parseNumericCell(RV.infra.rowVal(row, col));
    return p.kind === "ok" && p.n === 1;
  }

  function collectByMonth(rows, months, fz, fm, monthOf, pred) {
    const monthList = months || [];
    const overall = [];
    const byMonthIdx = Object.fromEntries(monthList.map((m) => [m, []]));
    for (let i = 0; i < rows.length; i++) {
      if (!pred(i)) continue;
      overall.push(i);
      const m = monthOf[i];
      if (byMonthIdx[m]) byMonthIdx[m].push(i);
    }
    return {
      overall: sumFzFm(overall, fz, fm),
      byMonth: Object.fromEntries(monthList.map((m) => [m, sumFzFm(byMonthIdx[m], fz, fm)])),
    };
  }

  function attachPlanEvalAllTime(RV, plan, rows, months, nBins) {
    if (!plan || typeof plan !== "object") return plan;
    const list = rows || [];
    const monthList = months || [];
    nBins = nBins || N_BINS_DEFAULT;
    const cols = planModelCols(plan);
    plan.modelCols = cols;
    const yAll = RV.domain.eda.buildYVector(list, { col: "fpd1_cnt_fz", threshold: 0 });
    plan.modelBins = cols.map((col) => buildBlock(RV, list, yAll, col, monthList, nBins));
    plan.modelBinsScope = "all_post_b";

    const rules = (plan.waterfallDnD && plan.waterfallDnD.rules) || [];
    if (!rules.length || !list.length) {
      plan.ruleMonthHit = [];
      plan.ruleMonthHitMonths = monthList;
      plan.ruleMonthHitScope = "all_post_b";
      return plan;
    }
    const fz = list.map((r) => RV.infra.parseNumZero(RV.infra.rowVal(r, "fpd1_cnt_fz")));
    const fm = list.map((r) => RV.infra.parseNumZero(RV.infra.rowVal(r, "fpd1_cnt_fm")));
    const monthOf = list.map((r) => String(r.submit_month || "").trim());
    const masks = rules.map((rule) => list.map((r) => (rowHitsNamedRule(RV, r, rule) ? 1 : 0)));
    plan.ruleMonthHit = rules.map((rule, ri) => ({
      ruleId: rule.id,
      name: rule.name,
      kind: rule.kind,
      hit: collectByMonth(list, monthList, fz, fm, monthOf, (i) => Number(masks[ri][i]) === 1),
      miss: collectByMonth(list, monthList, fz, fm, monthOf, (i) => Number(masks[ri][i]) !== 1),
    }));
    plan.ruleMonthHitMonths = monthList;
    plan.ruleMonthHitScope = "all_post_b";
    return plan;
  }

  function attachWfHitAllTime(RV, plan, rows, months) {
    if (!plan || typeof plan !== "object") return plan;
    const rules = (plan.waterfallDnD && plan.waterfallDnD.rules) || [];
    const monthList = months || [];
    if (!rules.length || !rows.length) {
      plan.wfHitAllTime = { months: monthList, scope: "all_post_b", rules: [] };
      return plan;
    }
    const fz = rows.map((r) => RV.infra.parseNumZero(RV.infra.rowVal(r, "fpd1_cnt_fz")));
    const fm = rows.map((r) => RV.infra.parseNumZero(RV.infra.rowVal(r, "fpd1_cnt_fm")));
    const monthOf = rows.map((r) => String(r.submit_month || "").trim());
    const masks = rules.map((rule) => rows.map((r) => (rowHitsNamedRule(RV, r, rule) ? 1 : 0)));
    function collect(pred) {
      const overall = [];
      const byMonthIdx = Object.fromEntries(monthList.map((m) => [m, []]));
      for (let i = 0; i < rows.length; i++) {
        if (!pred(i)) continue;
        overall.push(i);
        const m = monthOf[i];
        if (byMonthIdx[m]) byMonthIdx[m].push(i);
      }
      return {
        overall: sumFzFm(overall, fz, fm),
        byMonth: Object.fromEntries(monthList.map((m) => [m, sumFzFm(byMonthIdx[m], fz, fm)])),
      };
    }
    plan.wfHitAllTime = {
      months: monthList,
      scope: "all_post_b",
      rules: rules.map((r, ri) => {
        const earlier = masks.slice(0, ri);
        const mask = masks[ri];
        const step = collect((i) => {
          if (Number(mask[i]) !== 1) return false;
          for (let e = 0; e < earlier.length; e++) {
            if (Number(earlier[e][i]) === 1) return false;
          }
          return true;
        });
        return {
          ruleId: r.id,
          name: r.name,
          kind: r.kind,
          overall: step.overall,
          byMonth: step.byMonth,
        };
      }),
    };
    return plan;
  }

  function attachRuleSliceByD5(RV, plan, rows, months) {
    if (!plan || typeof plan !== "object") return plan;
    const list = rows || [];
    if (!rowsHaveCol(list, SLICE_D5_COL)) {
      delete plan.ruleSliceByD5;
      return plan;
    }
    const rules = candidateRules(plan);
    if (!rules.length) {
      delete plan.ruleSliceByD5;
      return plan;
    }
    plan.ruleSliceByD5 = {
      col: SLICE_D5_COL,
      values: SLICE_D5_VALUES.slice(),
      scope: "all_post_b",
      all: {
        months: months || [],
        rules: rules.map((rule) =>
          Object.assign(
            { name: rule.name, ruleId: rule.id || null },
            buildD5Window(RV, list, months, (i, r) => rowHitsCmp(RV, r, rule.spec))
          )
        ),
      },
    };
    return plan;
  }

  /**
   * @param {object} RV
   * @param {object} report
   * @param {object[]} segRows already segment-filtered rows (same as skill out/seg.json)
   * @param {{ nBins?: number, decisionCol?: string, riskNumCol?: string, postMonthCol?: string }} [opts]
   */
  function enrichReportEda(RV, report, segRows, opts) {
    opts = opts || {};
    const nBins = opts.nBins || N_BINS_DEFAULT;
    const decisionCol = opts.decisionCol || "决策组";
    const riskNumCol = opts.riskNumCol || "fpd1_cnt_fz";
    const postMonthCol =
      opts.postMonthCol ||
      report.fieldMap?.postMonthCol ||
      "submit_month";

    if (!report || typeof report !== "object") {
      throw new Error("enrichReportEda: report required");
    }
    const rows = Array.isArray(segRows) ? segRows : [];

    const winPost = String(report.windows?.post || report.windows?.train?.post || "");
    const postPreds = parseWindowPredicates(winPost);
    const postRows = postPreds.length
      ? rows.filter((r) => rowPassesWindow(r, postPreds))
      : rows.slice();
    const postB = postRows.filter((r) => isBGroup(r, decisionCol));

    const yB = RV.domain.eda.buildYVector(postB, { col: riskNumCol, threshold: 0 });

    const monthSet = new Set();
    for (const r of postB) {
      const m = String(r[postMonthCol] ?? r.submit_month ?? "").trim();
      if (m) monthSet.add(m);
    }
    const months = [...monthSet].sort();

    const inUseCols = report.inUseModels || (report.inUseBlocks || []).map((b) => b.col);
    const potCols = (report.top10 || []).map((t) => t.col);

    // buildBlock groups by submit_month for SPA parity — alias onto row for EDA month split
    const postBForEda =
      postMonthCol === "submit_month"
        ? postB
        : postB.map((r) => {
            if (r.submit_month === r[postMonthCol]) return r;
            const o = Object.assign({}, r);
            o.submit_month = r[postMonthCol];
            return o;
          });

    report.months = months;
    report.inUseBlocks = (inUseCols || []).map((col) =>
      buildBlock(RV, postBForEda, yB, col, months, nBins)
    );
    report.potentialBlocks = (potCols || []).map((col) =>
      buildBlock(RV, postBForEda, yB, col, months, nBins)
    );

    const potMap = Object.fromEntries(report.potentialBlocks.map((b) => [b.col, b]));
    report.top10 = (report.top10 || []).map((t) => {
      const b = potMap[t.col];
      return b
        ? { col: t.col, ks: b.overall.ks, auc: b.overall.auc, iv: b.overall.iv }
        : t;
    });

    const allPostB = rows.filter((r) => isBGroup(r, decisionCol));
    const allMonthSet = new Set();
    for (const r of allPostB) {
      const m = String(r[postMonthCol] ?? r.submit_month ?? "").trim();
      if (m) allMonthSet.add(m);
    }
    const allMonths = [...allMonthSet].sort();
    const allPostBForEda =
      postMonthCol === "submit_month"
        ? allPostB
        : allPostB.map((r) => {
            if (r.submit_month === r[postMonthCol]) return r;
            const o = Object.assign({}, r);
            o.submit_month = r[postMonthCol];
            return o;
          });

    if (report.planDetails?.risk) {
      attachPlanEval(RV, report.planDetails.risk, postBForEda, months, yB, nBins);
      attachPlanEvalAllTime(RV, report.planDetails.risk, allPostBForEda, allMonths, nBins);
      attachWfHitAllTime(RV, report.planDetails.risk, allPostBForEda, allMonths);
      attachRuleSliceByD5(RV, report.planDetails.risk, allPostBForEda, allMonths);
    }
    if (report.planDetails?.pass) {
      attachPlanEval(RV, report.planDetails.pass, postBForEda, months, yB, nBins);
      attachPlanEvalAllTime(RV, report.planDetails.pass, allPostBForEda, allMonths, nBins);
      attachWfHitAllTime(RV, report.planDetails.pass, allPostBForEda, allMonths);
      attachRuleSliceByD5(RV, report.planDetails.pass, allPostBForEda, allMonths);
    }

    report.nearMiss = (report.nearMiss || []).map((c) => {
      const gateMonths = c.stable?.months || c.gateMonths || [];
      if (c.byMonth && Object.keys(c.byMonth).length) {
        return Object.assign({}, c, { gateMonths });
      }
      const src = c.monthsAll?.length ? c.monthsAll : c.stable?.detail || [];
      const byMonth = {};
      for (const d of src) {
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
      return Object.assign({}, c, { byMonth, gateMonths });
    });

    return report;
  }

  return {
    enrichReportEda,
    attachPlanEval,
    attachPlanEvalAllTime,
    attachWfHitAllTime,
    attachRuleSliceByD5,
    buildBinBlock: buildBlock,
  };
});
