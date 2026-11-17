(function (RV) {
"use strict";
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  const contributionAnalysis = (...args) => RV.domain.attribution.contributionAnalysis(...args);
  var target = RV.domain.dailyReview = RV.domain.dailyReview || {};

  /** Panel1 / 贡献 / 异动用（比率类）；不含明细表专用绝对量 */
  const DEFAULT_METRICS = [
    { id: "pass_rate", name: "通过率", numCol: "通过量", denCol: "进件量", direction: "higher" },
    { id: "credit_use_rate", name: "用信率", numCol: "放款订单数", denCol: "通过量", direction: "higher" },
    { id: "t1_credit_use_rate", name: "T1用信率", numCol: "T1_放款订单数", denCol: "通过量", direction: "higher" },
    { id: "ticket", name: "放款件均", numCol: "放款金额", denCol: "放款订单数", direction: "higher" },
    { id: "risk", name: "订单风险", numCol: "fpd1_cnt_fz", denCol: "fpd1_cnt_fm", direction: "lower" },
    { id: "amt_risk", name: "金额风险", numCol: "fpd1_amt_fz", denCol: "fpd1_amt_fm", direction: "lower" },
    { id: "limit_uplift", name: "提额幅度", numCol: "本次额度", denCol: "上次额度", direction: "higher" },
    { id: "limit_up_share", name: "提额订单占比", numCol: "提额订单数", denCol: "通过量", direction: "higher" },
    { id: "prev_ticket", name: "上次授信件均", numCol: "上次额度", denCol: "通过量", direction: "higher" },
    { id: "curr_ticket", name: "授信件均", numCol: "本次额度", denCol: "通过量", direction: "higher" },
  ];

  /** 仅指标明细表：求和绝对量（不进 Panel1 折线/卡片） */
  const DETAIL_EXTRA_METRICS = [
    { id: "apply_vol", name: "进件量", numCol: "进件量", kind: "sum", detailOnly: true, direction: "higher" },
    { id: "loan_amt", name: "放款金额", numCol: "放款金额", kind: "sum", unit: "w", detailOnly: true, direction: "higher" },
    { id: "due_cnt", name: "到期单量", numCol: "fpd1_cnt_fm", kind: "sum", detailOnly: true, direction: "higher" },
    { id: "due_amt", name: "到期金额", numCol: "fpd1_amt_fm", kind: "sum", unit: "w", detailOnly: true, direction: "higher" },
  ];

  const DEFAULT_THRESHOLDS = {
    relDelta: 0.05,
  };

  /** 周粒度：全表该周覆盖自然日 ≤ 此值时，环比跳过该周（用上一周 vs 上上周） */
  const SHORT_WEEK_MAX_DAYS = 4;

  const GRAINS = ["day", "week"];

  function normalizeGrain(grain) {
    if (grain === "day") return "day";
    return "week";
  }

  function grainLabel(grain) {
    return normalizeGrain(grain) === "day" ? "日" : "周";
  }

  const PANEL1_SEGMENT_CAP = 20;
  /** 客群贡献 / 组间翻转 / 总览异动归因：只拆这四项（缺列则跳过） */
  const CONTRIB_METRIC_IDS = ["pass_rate", "risk", "amt_risk", "curr_ticket"];

  function isDerivedMetric(metric) {
    return !!(metric && (metric.kind === "derived" || metric.derivedKind));
  }

  function isSumMetric(metric) {
    if (!metric || isDerivedMetric(metric)) return false;
    return !!(metric.kind === "sum" || metric.detailOnly);
  }

  const DEFAULT_PROFIT_PARAMS = { nominalRate: 0.48, feeRate: 0.48 };

  function resolveProfitParams(config) {
    let nominal = config && config.nominalRate != null ? +config.nominalRate : DEFAULT_PROFIT_PARAMS.nominalRate;
    let fee = config && config.feeRate != null ? +config.feeRate : DEFAULT_PROFIT_PARAMS.feeRate;
    if (!Number.isFinite(nominal)) nominal = DEFAULT_PROFIT_PARAMS.nominalRate;
    if (!Number.isFinite(fee)) fee = DEFAULT_PROFIT_PARAMS.feeRate;
    return { nominalRate: nominal, feeRate: fee };
  }

  /** 名义利率 / (1+费率) */
  function netInterestBase(nominalRate, feeRate) {
    const den = 1 + feeRate;
    if (!(den > 0) || !Number.isFinite(nominalRate)) return null;
    return nominalRate / den;
  }

  function isGoldRateMetric(m) {
    return !!(m && (m.id === "gold_rate" || m.derivedKind === "gold_rate" || m.baseId === "gold_rate"));
  }

  function goldRateMetric() {
    return {
      id: "gold_rate",
      name: "金笔率",
      numCol: "",
      denCol: "",
      direction: "lower",
      kind: "derived",
      derivedKind: "gold_rate",
      detailOnly: false,
    };
  }

  /** 金笔率 = 金额风险 / 订单风险。订单风险为 0 或任一缺失时无值。 */
  function goldRateValue(risk, amt) {
    if (risk == null || amt == null || !Number.isFinite(risk) || !Number.isFinite(amt) || !(risk > 0)) return null;
    return amt / risk;
  }

  function insertGoldRateMetric(metrics) {
    const list = metrics || [];
    if (list.some((m) => m.id === "gold_rate")) return list;
    if (!list.some(isOrderRiskMetric) || !list.some(isAmtRiskMetric)) return list;
    const out = list.slice();
    const at = out.findIndex(isAmtRiskMetric);
    out.splice(at + 1, 0, goldRateMetric());
    return out;
  }

  /**
   * 毛利差 = 名义利率/(1+费率) − 金额风险；
   * 扣除风险毛利 = 到期金额(原始) × 毛利差（展示同到期金额，unit=w → 万）.
   * 金笔率 = 金额风险 / 订单风险。
   */
  function applyDerivedToMetricMap(metricMap, metrics, profitParams) {
    if (!metricMap || !metrics?.length) return;
    if (metrics.some((m) => m.id === "gold_rate")) {
      const rate = goldRateValue(metricMap.risk?.rate, metricMap.amt_risk?.rate);
      if (!metricMap.gold_rate) metricMap.gold_rate = { n: 0, d: 0, rate: null };
      metricMap.gold_rate.rate = rate;
      metricMap.gold_rate.n = rate == null ? 0 : rate;
      metricMap.gold_rate.d = 0;
    }
    const wantSpread = metrics.some((m) => m.id === "net_spread");
    const wantProfit = metrics.some((m) => m.id === "net_profit_risk");
    if (!wantSpread && !wantProfit) return;
    const pp = profitParams || DEFAULT_PROFIT_PARAMS;
    const nir = netInterestBase(pp.nominalRate, pp.feeRate);
    const amtRisk = metricMap.amt_risk?.rate;
    const spread = (nir != null && amtRisk != null && Number.isFinite(amtRisk))
      ? nir - amtRisk
      : null;
    if (wantSpread) {
      if (!metricMap.net_spread) metricMap.net_spread = { n: 0, d: 0, rate: null };
      metricMap.net_spread.rate = spread;
      metricMap.net_spread.n = spread == null ? 0 : spread;
      metricMap.net_spread.d = 0;
    }
    if (wantProfit) {
      const dueAmt = metricMap.due_amt?.rate;
      const profit = (spread != null && dueAmt != null && Number.isFinite(dueAmt))
        ? dueAmt * spread
        : null;
      if (!metricMap.net_profit_risk) metricMap.net_profit_risk = { n: 0, d: 0, rate: null };
      metricMap.net_profit_risk.rate = profit;
      metricMap.net_profit_risk.n = profit == null ? 0 : profit;
      metricMap.net_profit_risk.d = 0;
    }
  }

  function applyDerivedDetailMetrics(series, profitParams) {
    if (!series?.cells || !series.metrics?.length) return series;
    for (const cell of Object.values(series.cells)) {
      if (!cell.metrics) continue;
      applyDerivedToMetricMap(cell.metrics, series.metrics, profitParams);
    }
    return series;
  }

  function applyDerivedToValsMap(vals, metrics, profitParams) {
    if (!vals || !metrics?.length) return vals;
    const mirror = Object.create(null);
    for (const m of metrics) {
      const v = vals[m.id];
      mirror[m.id] = { rate: v?.rate ?? null, n: v?.rate ?? 0, d: 0 };
    }
    applyDerivedToMetricMap(mirror, metrics, profitParams);
    for (const id of ["gold_rate", "net_spread", "net_profit_risk"]) {
      if (!mirror[id]) continue;
      vals[id] = { rate: mirror[id].rate, delta: vals[id]?.delta ?? null };
    }
    return vals;
  }

  /** 金笔率依赖的比率。筛选掉这两列、或贷前表不含它们时，汇总仍要带上 n/d 才能算出 diff。 */
  const GOLD_DEP_IDS = ["risk", "amt_risk"];

  function metricsIncludingGold(metrics) {
    if ((metrics || []).some((m) => m.id === "gold_rate")) return metrics;
    return (metrics || []).concat([goldRateMetric()]);
  }

  function readCellGoldRate(cell) {
    const direct = cell?.metrics?.gold_rate?.rate;
    if (direct != null && Number.isFinite(direct)) return direct;
    return goldRateValue(cell?.metrics?.risk?.rate, cell?.metrics?.amt_risk?.rate);
  }

  function putGoldOnVals(vals, rate) {
    if (!vals || rate == null || !Number.isFinite(rate)) return;
    if (!vals.gold_rate) vals.gold_rate = { rate, delta: null };
    else if (vals.gold_rate.rate == null || !Number.isFinite(vals.gold_rate.rate)) vals.gold_rate.rate = rate;
  }

  function ratioFromAcc(slot) {
    if (!slot || !(slot.d > 0)) return null;
    const rate = slot.n / slot.d;
    return Number.isFinite(rate) ? rate : null;
  }

  /** 可见指标里没有订单风险/金额风险时，从格子上把这两列的分子分母加进累计。 */
  function absorbGoldDeps(acc, sourceCell, metrics) {
    if (!acc || !sourceCell?.metrics) return;
    for (let i = 0; i < GOLD_DEP_IDS.length; i++) {
      const id = GOLD_DEP_IDS[i];
      if ((metrics || []).some((m) => m.id === id)) continue;
      const src = sourceCell.metrics[id];
      if (!src) continue;
      if (!acc[id]) acc[id] = { n: 0, d: 0 };
      acc[id].n += src.n || 0;
      acc[id].d += src.d || 0;
    }
  }

  function stampGoldFromDeps(vals, acc) {
    if (!vals) return;
    const risk = vals.risk?.rate != null ? vals.risk.rate : ratioFromAcc(acc?.risk);
    const amt = vals.amt_risk?.rate != null ? vals.amt_risk.rate : ratioFromAcc(acc?.amt_risk);
    putGoldOnVals(vals, goldRateValue(risk, amt));
  }

  function metricHeaderLabel(metric) {
    if (!metric) return "";
    if (metric.unit === "w") return (metric.name || "") + "(万)";
    return metric.name || "";
  }

  function finalizeMetricRate(slot, metric) {
    if (isDerivedMetric(metric)) {
      // filled by applyDerivedToMetricMap
      return;
    }
    if (isSumMetric(metric)) {
      slot.rate = slot.n;
      return;
    }
    slot.rate = rateOf(slot.n, slot.d);
  }

  /** @param {string[]|null} [headers] when set, drop metrics whose num/den cols are missing */
  function defaultMetrics(headers) {
    const all = DEFAULT_METRICS.map((m) => ({ ...m }));
    if (!headers || !headers.length) return all;
    const hs = new Set(headers);
    return all.filter((m) => hs.has(m.numCol) && hs.has(m.denCol));
  }

  /**
   * Append default metrics (by id) that are available for headers but missing from current list.
   * Does not remove or reorder existing rows — for upgrading sessions after DEFAULT_METRICS grow.
   * @returns {{ metrics: object[], added: object[] }}
   */
  function mergeMissingDefaultMetrics(currentMetrics, headers) {
    const cur = Array.isArray(currentMetrics) ? currentMetrics.slice() : [];
    const have = new Set();
    for (const m of cur) {
      if (m && m.id) have.add(m.id);
    }
    const added = [];
    for (const m of defaultMetrics(headers)) {
      if (!m.id || have.has(m.id)) continue;
      const copy = { ...m };
      cur.push(copy);
      added.push(copy);
      have.add(m.id);
    }
    return { metrics: cur, added };
  }

  /** @param {string[]|null} [headers] */
  function defaultDetailExtraMetrics(headers) {
    const all = DETAIL_EXTRA_METRICS.map((m) => ({ ...m }));
    if (!headers || !headers.length) return all;
    const hs = new Set(headers);
    return all.filter((m) => hs.has(m.numCol));
  }

  /** Sum absolute denom beside a rate metric (到期单量/到期金额). */
  function makeDueExtraFromRate(rateMetric, id, name, unit) {
    const den = rateMetric && rateMetric.denCol;
    if (!den) return null;
    const m = {
      id,
      name,
      numCol: den,
      kind: "sum",
      detailOnly: true,
      direction: "higher",
    };
    if (unit === "w") m.unit = "w";
    return m;
  }

  function isOrderRiskMetric(m) {
    return !!(m && (m.id === "risk" || m.name === "订单风险"));
  }

  function isAmtRiskMetric(m) {
    return !!(m && (m.id === "amt_risk" || m.name === "金额风险"));
  }

  /** 贷后环比卡片：订单风险、金额风险、金笔率 */
  function isPostLoanMetric(m) {
    return isOrderRiskMetric(m) || isAmtRiskMetric(m) || isGoldRateMetric(m);
  }

  /** 贷前环比卡片：非贷后比率指标 */
  function isPreLoanMetric(m) {
    return !!(m && !isPostLoanMetric(m));
  }

  /**
   * Detail-table column order: 进件量 → panel metrics
   * （通过率后插放款金额；订单风险后插到期单量；金额风险后插到期金额）→ …
   * 到期* 优先用风险指标的实际分母列（不写死列名）；缺省再回落 fpd1_*_fm。
   * @param {object[]} panelMetrics
   * @param {string[]|null} [headers]
   */
  function buildDetailMetrics(panelMetrics, headers) {
    const hs = headers && headers.length ? new Set(headers) : null;
    const extras = defaultDetailExtraMetrics(headers);
    const byId = Object.create(null);
    for (const m of extras) byId[m.id] = m;
    const out = [];
    if (byId.apply_vol) out.push({ ...byId.apply_vol });
    let loanPlaced = false;
    let dueCntPlaced = false;
    let dueAmtPlaced = false;

    function pushDue(rateMetric, placedFlag, id, name, unit, fallback) {
      if (placedFlag) return true;
      const candidates = [];
      const fromRate = makeDueExtraFromRate(rateMetric, id, name, unit);
      if (fromRate) candidates.push(fromRate);
      if (fallback) candidates.push({ ...fallback });
      for (let i = 0; i < candidates.length; i++) {
        const due = candidates[i];
        if (hs && !hs.has(due.numCol)) continue;
        out.push(due);
        return true;
      }
      return false;
    }

    for (const m of panelMetrics || []) {
      if (m.id === "gold_rate") continue;
      out.push(m);
      if (m.id === "pass_rate" && byId.loan_amt) {
        out.push({ ...byId.loan_amt });
        loanPlaced = true;
      }
      if (isOrderRiskMetric(m)) {
        dueCntPlaced = pushDue(m, dueCntPlaced, "due_cnt", "到期单量", undefined, byId.due_cnt)
          || dueCntPlaced;
      }
      if (isAmtRiskMetric(m)) {
        dueAmtPlaced = pushDue(m, dueAmtPlaced, "due_amt", "到期金额", "w", byId.due_amt)
          || dueAmtPlaced;
      }
    }
    if (!loanPlaced && byId.loan_amt) out.push({ ...byId.loan_amt });
    if (!dueCntPlaced && byId.due_cnt) out.push({ ...byId.due_cnt });
    if (!dueAmtPlaced && byId.due_amt) out.push({ ...byId.due_amt });
    return appendProfitDetailMetrics(out);
  }

  /** 到期金额后接金笔率，再接毛利差 / 扣除风险毛利。 */
  function appendProfitDetailMetrics(metrics) {
    const out = (metrics || []).slice();
    const hasAmtRisk = out.some(isAmtRiskMetric);
    const hasOrderRisk = out.some(isOrderRiskMetric);
    let at = out.findIndex((m) => m.id === "due_amt");
    if (at < 0) at = out.findIndex(isAmtRiskMetric);
    const extras = [];
    if (hasOrderRisk && hasAmtRisk && at >= 0 && !out.some((m) => m.id === "gold_rate")) {
      extras.push(goldRateMetric());
    }
    if (hasAmtRisk && at >= 0 && !out.some((m) => m.id === "net_spread" || m.id === "net_profit_risk")) {
      extras.push(
        {
          id: "net_spread",
          name: "毛利差",
          kind: "derived",
          derivedKind: "net_spread",
          detailOnly: true,
          direction: "higher",
        },
        {
          id: "net_profit_risk",
          name: "扣除风险毛利",
          kind: "derived",
          derivedKind: "net_profit_risk",
          unit: "w",
          detailOnly: true,
          direction: "higher",
        }
      );
    }
    if (!extras.length || at < 0) return out;
    out.splice(at + 1, 0, ...extras);
    return out;
  }

  function normalizeMetric(m, i) {
    if (m.kind === "derived" || m.derivedKind) {
      const direction = m.direction === "lower" ? "lower" : (m.direction === "none" ? "none" : "higher");
      return {
        id: m.id || ("m" + i),
        name: m.name,
        numCol: "",
        denCol: "",
        direction,
        kind: "derived",
        derivedKind: m.derivedKind || m.id,
        unit: m.unit === "w" ? "w" : undefined,
        detailOnly: m.id === "gold_rate" ? false : true,
      };
    }
    const kind = m.kind === "sum" || m.detailOnly ? "sum" : "rate";
    return {
      id: m.id || ("m" + i),
      name: m.name,
      numCol: m.numCol,
      denCol: kind === "sum" ? (m.denCol || "") : m.denCol,
      direction: m.direction === "lower" ? "lower" : "higher",
      kind,
      unit: m.unit === "w" ? "w" : undefined,
      detailOnly: !!(m.detailOnly || kind === "sum"),
    };
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseDateLike(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    }
    m = s.match(/^(\d{4})[-/](\d{1,2})$/);
    if (m) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, 1));
    }
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const d = new Date(t);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return null;
  }

  function formatDay(d) {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  /** Monday of the week containing `d` (UTC). */
  function weekMonday(d) {
    const monday = new Date(d);
    const dow = monday.getUTCDay();
    const shift = dow === 0 ? -6 : 1 - dow;
    monday.setUTCDate(monday.getUTCDate() + shift);
    return monday;
  }

  /** Week bucket key = that week's Monday as YYYY-MM-DD (display = 周第一天). */
  function formatWeekKey(d) {
    return formatDay(weekMonday(d));
  }

  function formatMonthKey(d) {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1);
  }

  function bucketTime(value, grain) {
    const d = parseDateLike(value);
    if (!d) return null;
    if (grain === "week") return formatWeekKey(d);
    if (grain === "month") return formatMonthKey(d);
    return formatDay(d);
  }

  /** Display label for a period key (week already stored as Monday date). */
  function formatPeriodLabel(period, grain) {
    if (period == null || period === "") return "—";
    const s = String(period);
    if (grain === "week") {
      const m = s.match(/^(\d{4})-W(\d{1,2})$/i);
      if (m) {
        const year = +m[1];
        const week = +m[2];
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const monday = weekMonday(jan4);
        monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
        return formatDay(monday);
      }
    }
    return s;
  }

  /**
   * Distinct calendar-day counts per week bucket (Monday key), from full-table rows.
   * @returns {Object.<string, number>}
   */
  function countWeekDistinctDays(rows, timeCol) {
    const daysByWeek = Object.create(null);
    for (let i = 0; i < (rows || []).length; i++) {
      const d = parseDateLike(rowVal(rows[i], timeCol));
      if (!d) continue;
      const wk = formatWeekKey(d);
      const day = formatDay(d);
      if (!daysByWeek[wk]) daysByWeek[wk] = Object.create(null);
      daysByWeek[wk][day] = 1;
    }
    const out = Object.create(null);
    for (const wk of Object.keys(daysByWeek)) {
      out[wk] = Object.keys(daysByWeek[wk]).length;
    }
    return out;
  }

  function weekDayCount(series, period) {
    if (!series?.weekDayCounts || period == null) return null;
    const n = series.weekDayCounts[period];
    return n != null ? n : null;
  }

  function isShortWeekPeriod(series, period) {
    if (series?.grain !== "week" || !series.weekDayCounts) return false;
    const max = series.shortWeekMaxDays != null ? series.shortWeekMaxDays : SHORT_WEEK_MAX_DAYS;
    const n = weekDayCount(series, period);
    return n != null && n > 0 && n <= max;
  }

  /**
   * Snapshot for a group×metric with optional comparison period.
   * When `cmpPeriod` is null/empty: same as latest valued period (legacy).
   * When set: walk valued rates from that period backward; short-week skip unchanged.
   * @returns {object|null}
   */
  function metricSnapshotAt(series, group, metricId, cmpPeriod) {
    if (!series?.periods?.length) return null;
    let endIdx = series.periods.length - 1;
    if (cmpPeriod != null && cmpPeriod !== "") {
      const idx = series.periods.indexOf(cmpPeriod);
      if (idx < 0) return null;
      const atCell = series.cells[cmpPeriod + "\0" + group];
      const atRate = atCell?.metrics?.[metricId]?.rate;
      if (atRate == null || isNaN(atRate)) return null;
      endIdx = idx;
    }
    const found = [];
    const need = series.grain === "week" && series.weekDayCounts ? 3 : 2;
    for (let i = endIdx; i >= 0 && found.length < need; i--) {
      const period = series.periods[i];
      const cell = series.cells[period + "\0" + group];
      const rate = cell?.metrics?.[metricId]?.rate;
      if (rate != null && !isNaN(rate)) found.push({ period, rate });
    }
    if (!found.length) return null;

    let wowCur = found[0];
    let wowPrev = found[1] || null;
    let skipped = null;
    /** 仅当存在再上一有值周时才跳过短周；否则环比仍含短周（避免无 Δ 导致总览空白） */
    const canSkipShort = isShortWeekPeriod(series, found[0].period) && found.length >= 3;

    if (canSkipShort) {
      skipped = {
        period: found[0].period,
        rate: found[0].rate,
        dayCount: weekDayCount(series, found[0].period),
      };
      wowCur = found[1];
      wowPrev = found[2];
    }

    const delta = (wowPrev && wowCur.rate != null && wowPrev.rate != null)
      ? wowCur.rate - wowPrev.rate
      : null;
    return {
      period: wowCur.period,
      rate: wowCur.rate,
      prevPeriod: wowPrev ? wowPrev.period : null,
      prevRate: wowPrev ? wowPrev.rate : null,
      delta,
      shortWeekSkipped: !!skipped,
      skippedPeriod: skipped?.period ?? null,
      skippedRate: skipped?.rate ?? null,
      skippedDayCount: skipped?.dayCount ?? null,
      displayPeriod: skipped ? skipped.period : wowCur.period,
      displayRate: skipped ? skipped.rate : wowCur.rate,
      priorLevelPeriod: skipped ? wowCur.period : (wowPrev ? wowPrev.period : null),
      priorLevelRate: skipped ? wowCur.rate : (wowPrev ? wowPrev.rate : null),
    };
  }

  /**
   * Latest (and previous) non-null rate snapshots for a group×metric.
   * Skips immature periods (e.g. risk den=0 in the newest week).
   * Week grain: if newest valued week has ≤ SHORT_WEEK_MAX_DAYS distinct calendar days
   * (full-table coverage on series.weekDayCounts), WoW uses the prior two valued weeks;
   * short-week level is still returned for display.
   * @returns {object|null}
   */
  function latestMetricSnapshot(series, group, metricId) {
    return metricSnapshotAt(series, group, metricId, null);
  }

  /**
   * Default comparison period for a metric class: newest period with any valued rate
   * across the given groups × metrics (chronological max in `series.periods`).
   * @returns {string|null}
   */
  function defaultCmpPeriodForMetrics(series, metrics, groups) {
    if (!series?.periods?.length || !metrics?.length) return null;
    const gs = groups?.length
      ? groups
      : Array.from(new Set((series.points || []).map((p) => p.group)));
    if (!gs.length) return null;
    for (let i = series.periods.length - 1; i >= 0; i--) {
      const period = series.periods[i];
      for (const g of gs) {
        const cell = series.cells[period + "\0" + g];
        for (const m of metrics) {
          const rate = cell?.metrics?.[m.id]?.rate;
          if (rate != null && !isNaN(rate)) return period;
        }
      }
    }
    return null;
  }

  function formatShortWeekNote(snap, grain) {
    if (!snap?.shortWeekSkipped || !snap.skippedPeriod) return "";
    const lab = formatPeriodLabel(snap.skippedPeriod, grain || "week");
    const n = snap.skippedDayCount != null ? snap.skippedDayCount : "?";
    return `短周 ${lab}仅${n}天，环比改用上一周 vs 上上周`;
  }

  /** 总览横幅用短句（不逐指标重复） */
  function formatShortWeekBanner(snap, grain) {
    if (!snap?.shortWeekSkipped || !snap.skippedPeriod) return "";
    const lab = formatPeriodLabel(snap.skippedPeriod, grain || "week");
    const n = snap.skippedDayCount != null ? snap.skippedDayCount : "?";
    return `短周 ${lab} 仅${n}天 · 环比用上一周 vs 上上周 · 主数字=短周水平`;
  }

  function guessTimeCol(headers) {
    const hs = headers || [];
    const prefs = [/日期/, /date/i, /放款日/, /申请日/, /submit/i, /月份/, /month/i];
    for (const re of prefs) {
      const hit = hs.find((h) => re.test(h));
      if (hit) return hit;
    }
    return hs[0] || "";
  }

  function isChangeNumColName(h) {
    return /^level_change_num$/i.test(String(h || ""));
  }

  /** Prefer exact `level` / 档位, then loose level|档位 match. Empty if none. */
  function guessLevelCol(headers) {
    const hs = headers || [];
    const exact = hs.find((h) => /^level$/i.test(h) || h === "档位");
    if (exact) return exact;
    const loose = hs.find((h) => /level|档位/i.test(h) && !isChangeNumColName(h));
    return loose || "";
  }

  /** Exact `level_change_num` for Panel6. Empty if none. */
  function guessChangeNumCol(headers) {
    const hs = headers || [];
    return hs.find((h) => isChangeNumColName(h)) || "";
  }

  /** Fixed Panel5 level bins: -1；1–20 step3；21；其他 */
  const LEVEL_BIN_OTHER = "其他";
  const LEVEL_BIN_ORDER = [
    "-1", "1-3", "4-6", "7-9", "10-12", "13-15", "16-18", "19-20", "21", LEVEL_BIN_OTHER,
  ];

  /** Panel6 level_change_num: ≤-4；-3…4 枚举；≥5；其他 */
  const CHANGE_NUM_BIN_OTHER = "其他";
  const CHANGE_NUM_BIN_ORDER = [
    "≤-4", "-3", "-2", "-1", "0", "1", "2", "3", "4", "≥5", CHANGE_NUM_BIN_OTHER,
  ];

  function levelBinLabel(raw) {
    if (raw == null || raw === "") return LEVEL_BIN_OTHER;
    const s = String(raw).trim();
    if (!s) return LEVEL_BIN_OTHER;
    const n = +s;
    if (!Number.isFinite(n)) return LEVEL_BIN_OTHER;
    if (n === -1) return "-1";
    if (n === 21) return "21";
    if (n >= 1 && n <= 18) {
      const start = Math.floor((n - 1) / 3) * 3 + 1;
      return start + "-" + (start + 2);
    }
    if (n === 19 || n === 20) return "19-20";
    return LEVEL_BIN_OTHER;
  }

  function changeNumBinLabel(raw) {
    if (raw == null || raw === "") return CHANGE_NUM_BIN_OTHER;
    const s = String(raw).trim();
    if (!s) return CHANGE_NUM_BIN_OTHER;
    const n = +s;
    if (!Number.isFinite(n) || Math.floor(n) !== n) return CHANGE_NUM_BIN_OTHER;
    if (n <= -4) return "≤-4";
    if (n >= 5) return "≥5";
    if (n >= -3 && n <= 4) return String(n);
    return CHANGE_NUM_BIN_OTHER;
  }

  function sortBinsByOrder(bins, order) {
    const idx = Object.create(null);
    (order || []).forEach((b, i) => { idx[b] = i; });
    return (bins || []).slice().sort((a, b) => {
      const ia = idx[a] != null ? idx[a] : 999;
      const ib = idx[b] != null ? idx[b] : 999;
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b), "zh");
    });
  }

  function sortLevelBins(bins) {
    return sortBinsByOrder(bins, LEVEL_BIN_ORDER);
  }

  function sortChangeNumBins(bins) {
    return sortBinsByOrder(bins, CHANGE_NUM_BIN_ORDER);
  }

  function binnedKindSpec(kind) {
    if (kind === "changeNum") {
      return {
        kind: "changeNum",
        colKey: "levelChangeNumCol",
        seriesAll: "seriesLevelChangeByGrain",
        seriesDec: "seriesLevelChangeDecByGrain",
        seriesDecFine: "seriesLevelChangeDecFineByGrain",
        keysField: "changeNumKeys",
        binOrder: CHANGE_NUM_BIN_ORDER,
        sortBins: sortChangeNumBins,
        presentBins: presentChangeNumBins,
        needCol: "need_change_num_col",
      };
    }
    return {
      kind: "level",
      colKey: "levelCol",
      seriesAll: "seriesLevelByGrain",
      seriesDec: "seriesLevelDecByGrain",
      seriesDecFine: "seriesLevelDecFineByGrain",
      keysField: "levelKeys",
      binOrder: LEVEL_BIN_ORDER,
      sortBins: sortLevelBins,
      presentBins: presentLevelBins,
      needCol: "need_level_col",
    };
  }

  function rateOf(n, d) {
    return d > 0 ? n / d : null;
  }

  function groupKey(parts) {
    return parts.map((p) => (p == null || p === "" ? "(空)" : String(p))).join(" | ");
  }

  /** Level / level_change_num tables only need these detail metrics. */
  const LEVEL_PANEL_METRIC_IDS = [
    "risk", "due_cnt", "amt_risk", "gold_rate", "due_amt",
  ];

  function levelPanelMetrics(detailMetrics) {
    return metricsByIds(detailMetrics, LEVEL_PANEL_METRIC_IDS);
  }

  function addRowToCell(cell, metrics, row) {
    for (const m of metrics) {
      if (isDerivedMetric(m)) continue;
      const slot = cell.metrics[m.id];
      if (!slot) continue;
      const n = parseNum(rowVal(row, m.numCol));
      if (n != null && !isNaN(n)) slot.n += n;
      if (!isSumMetric(m)) {
        const d = parseNum(rowVal(row, m.denCol));
        if (d != null && !isNaN(d)) slot.d += d;
      }
    }
  }

  function touchAggCell(bag, period, gParts, row) {
    bag.periodSet.add(period);
    const g = groupKey(gParts);
    const cellKey = period + "\0" + g;
    let cell = bag.cells[cellKey];
    if (!cell) {
      cell = bag.cells[cellKey] = {
        period,
        group: g,
        groupParts: gParts,
        metrics: {},
      };
      for (const m of bag.metrics) {
        cell.metrics[m.id] = { n: 0, d: 0, rate: null };
      }
    }
    addRowToCell(cell, bag.metrics, row);
  }

  function finishAggregated(bag, grain, groupCols, profitParams) {
    const metrics = bag.metrics;
    const cells = bag.cells;
    const periods = Array.from(bag.periodSet).sort();
    for (const cell of Object.values(cells)) {
      for (const m of metrics) finalizeMetricRate(cell.metrics[m.id], m);
    }
    if (profitParams) applyDerivedDetailMetrics({ cells, metrics }, profitParams);
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    return { periods, cells, points, grain, groupCols, metrics };
  }

  function newAggBag(metrics) {
    return { cells: Object.create(null), periodSet: new Set(), metrics: metrics || [] };
  }

  /**
   * Aggregate rate metrics by time bucket × optional group columns.
   * @param {{ groupValFns?: Object<string, function> }} [opts] map raw group col values (e.g. level → bin)
   * @returns {{ periods: string[], cells: Object, points: Array }}
   */
  function aggregateMetricSeries(rows, opts) {
    const timeCol = opts.timeCol;
    const grain = opts.grain || "day";
    const groupCols = opts.groupCols || [];
    const groupValFns = opts.groupValFns || null;
    const metrics = opts.metrics || [];
    const bag = newAggBag(metrics);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const period = bucketTime(rowVal(r, timeCol), grain);
      if (!period) continue;
      const gParts = groupCols.map((c) => {
        const raw = rowVal(r, c);
        const fn = groupValFns && groupValFns[c];
        return fn ? fn(raw) : raw;
      });
      touchAggCell(bag, period, gParts, r);
    }
    return finishAggregated(bag, grain, groupCols, opts.profitParams);
  }

  function attachMom(series) {
    const { periods, points, metrics } = series;
    const periodIndex = Object.create(null);
    periods.forEach((p, i) => { periodIndex[p] = i; });

    for (const pt of points) {
      const idx = periodIndex[pt.period];
      const prevPeriod = idx > 0 ? periods[idx - 1] : null;
      pt.mom = {};
      for (const m of metrics) {
        const cur = pt.metrics[m.id];
        let prevRate = null;
        if (prevPeriod != null) {
          const prevKey = prevPeriod + "\0" + pt.group;
          const prevCell = series.cells[prevKey];
          if (prevCell) prevRate = prevCell.metrics[m.id].rate;
        }
        const delta = (cur.rate != null && prevRate != null) ? cur.rate - prevRate : null;
        const deltaPct = (delta != null && prevRate != null && Math.abs(prevRate) > 1e-12)
          ? delta / Math.abs(prevRate)
          : null;
        pt.mom[m.id] = {
          prevPeriod,
          prevRate,
          rate: cur.rate,
          delta,
          deltaPct,
        };
      }
    }
    return series;
  }

  /**
   * Project fine series (leadCol × segment) to lead-only series.
   * Used by Panel1 (decision) and Panel5 (level).
   * @param {object} fineSeries groupParts[0]=lead, [1…]=segment
   * @param {string} segmentKey "__all__" or groupKey of segment parts
   */
  function projectDecisionSeries(fineSeries, segmentKey) {
    if (!fineSeries) return null;
    const metrics = fineSeries.metrics || [];
    const key = segmentKey == null || segmentKey === "" ? "__all__" : String(segmentKey);
    const cells = Object.create(null);
    const periodSet = new Set();

    for (const pt of fineSeries.points || []) {
      const parts = pt.groupParts || [];
      const decision = String(parts[0] ?? "(空)");
      const seg = groupKey(parts.slice(1));
      if (key !== "__all__" && seg !== key) continue;
      periodSet.add(pt.period);
      const cellKey = pt.period + "\0" + decision;
      let cell = cells[cellKey];
      if (!cell) {
        cell = cells[cellKey] = {
          period: pt.period,
          group: decision,
          groupParts: [decision],
          metrics: {},
        };
        for (const m of metrics) {
          cell.metrics[m.id] = { n: 0, d: 0, rate: null };
        }
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
    }

    const periods = Array.from(periodSet).sort();
    for (const cell of Object.values(cells)) {
      for (const m of metrics) {
        finalizeMetricRate(cell.metrics[m.id], m);
      }
    }
    if (fineSeries.profitParams) {
      applyDerivedDetailMetrics({ cells, metrics }, fineSeries.profitParams);
    }
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    return attachMom({
      periods,
      cells,
      points,
      grain: fineSeries.grain,
      groupCols: fineSeries.groupCols?.length ? [fineSeries.groupCols[0]] : [],
      metrics,
      profitParams: fineSeries.profitParams,
      weekDayCounts: fineSeries.weekDayCounts,
      shortWeekMaxDays: fineSeries.shortWeekMaxDays,
    });
  }

  /**
   * Sum selected segment crosses back to a decision-group series.
   * opts.segmentKeys required; opts.segmentCols are the projected columns.
   */
  function projectDecisionSeriesByKeys(fineSeries, opts) {
    if (!fineSeries) return null;
    opts = opts || {};
    const metrics = fineSeries.metrics || [];
    const cfgSegs = opts.cfgSegs || (fineSeries.groupCols || []).slice(1);
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const indices = (picked && picked.length)
      ? picked.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0)
      : cfgSegs.map((_, i) => i);
    const allow = new Set((opts.segmentKeys || []).filter((k) => k && k !== "__all__"));
    if (!allow.size) return null;
    const cells = Object.create(null);
    const periodSet = new Set();
    for (const pt of finePointList(fineSeries)) {
      const parts = pt.groupParts || [];
      const decision = String(parts[0] ?? "(空)");
      const seg = groupKey(indices.map((ix) => parts[ix + 1]));
      if (!allow.has(seg)) continue;
      periodSet.add(pt.period);
      const cellKey = pt.period + "\0" + decision;
      let cell = cells[cellKey];
      if (!cell) {
        cell = cells[cellKey] = {
          period: pt.period,
          group: decision,
          groupParts: [decision],
          metrics: {},
        };
        for (const m of metrics) cell.metrics[m.id] = { n: 0, d: 0, rate: null };
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
    }
    const periods = Array.from(periodSet).sort();
    for (const cell of Object.values(cells)) {
      for (const m of metrics) finalizeMetricRate(cell.metrics[m.id], m);
    }
    if (fineSeries.profitParams) applyDerivedDetailMetrics({ cells, metrics }, fineSeries.profitParams);
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    return attachMom({
      periods,
      cells,
      points,
      grain: fineSeries.grain,
      groupCols: fineSeries.groupCols?.length ? [fineSeries.groupCols[0]] : [],
      metrics,
      profitParams: fineSeries.profitParams,
      weekDayCounts: fineSeries.weekDayCounts,
      shortWeekMaxDays: fineSeries.shortWeekMaxDays,
    });
  }

  function presentBinsInOrder(series, order, otherLabel) {
    const seen = new Set();
    for (const pt of series?.points || []) {
      seen.add(String(pt.group ?? otherLabel));
    }
    return sortBinsByOrder((order || []).filter((b) => seen.has(b)), order);
  }

  /** Bin labels from a 分箱×决策组 series (groupParts[0]). */
  function presentBinsFromDec(series, order, otherLabel) {
    const seen = new Set();
    const pts = (series?.points && series.points.length)
      ? series.points
      : Object.values(series?.cells || {});
    for (const pt of pts) {
      seen.add(String((pt.groupParts || [])[0] ?? otherLabel));
    }
    return sortBinsByOrder((order || []).filter((b) => seen.has(b)), order);
  }

  /** Bins present in a level series, in LEVEL_BIN_ORDER. */
  function presentLevelBins(series) {
    return presentBinsInOrder(series, LEVEL_BIN_ORDER, LEVEL_BIN_OTHER);
  }

  function presentChangeNumBins(series) {
    return presentBinsInOrder(series, CHANGE_NUM_BIN_ORDER, CHANGE_NUM_BIN_OTHER);
  }

  /**
   * Panel5 segment keys from level×decision×segment fine (parts[2…]).
   * @returns {string[]}
   */
  function listPanel5SegmentKeys(decFineSeries, limit) {
    const cap = Math.max(1, Math.floor(+limit || PANEL1_SEGMENT_CAP));
    if (!decFineSeries?.points?.length) return ["__all__"];
    const metrics = (decFineSeries.metrics || []).filter((m) => !m.detailOnly);
    const denId = metrics[0]?.id;
    const vol = Object.create(null);
    for (const pt of decFineSeries.points) {
      const seg = groupKey((pt.groupParts || []).slice(2));
      if (!vol[seg]) vol[seg] = 0;
      const slot = denId ? pt.metrics?.[denId] : null;
      vol[seg] += slot ? (slot.d || slot.n || 0) : 1;
    }
    const keys = Object.keys(vol).sort((a, b) => vol[b] - vol[a] || a.localeCompare(b, "zh"));
    return ["__all__"].concat(keys.slice(0, cap));
  }

  /**
   * Panel1 segment chip keys: __all__ + TopN by den volume of first metric.
   * @returns {string[]}
   */
  function listPanel1SegmentKeys(fineSeries, limit) {
    const cap = Math.max(1, Math.floor(+limit || PANEL1_SEGMENT_CAP));
    if (!fineSeries?.points?.length) return ["__all__"];
    const metrics = (fineSeries.metrics || []).filter((m) => !m.detailOnly);
    const denId = metrics[0]?.id;
    const vol = Object.create(null);
    for (const pt of fineSeries.points) {
      const seg = groupKey((pt.groupParts || []).slice(1));
      if (!seg) continue;
      const d = denId ? (pt.metrics?.[denId]?.d || 0) : 0;
      vol[seg] = (vol[seg] || 0) + d;
    }
    const keys = Object.keys(vol).sort((a, b) => {
      const dv = (vol[b] || 0) - (vol[a] || 0);
      if (dv !== 0) return dv;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return ["__all__"].concat(keys.slice(0, cap));
  }

  function isWorseDelta(delta, direction) {
    if (delta == null) return false;
    if (direction === "lower") return delta > 0;
    return delta < 0;
  }

  /** Absolute-level metrics (ticket size etc.) vs rate-like (pass/risk). */
  function isRateLikeMetric(metric) {
    if (isGoldRateMetric(metric)) return false;
    if (isSumMetric(metric) || metric?.unit === "w") return false;
    const name = (metric && metric.name) || "";
    // 「金额风险」是比率；仅「放款金额」等绝对量排除
    if (/件均|均额|额度|余额|件额|进件量/.test(name)) return false;
    if (/金额/.test(name) && !/风险/.test(name)) return false;
    return true;
  }

  function formatDelta(delta, metric) {
    if (delta == null) return "—";
    const sign = delta > 0 ? "+" : "";
    if (metric?.unit === "w") {
      return sign + (delta / 10000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "w";
    }
    if (isSumMetric(metric)) {
      return sign + Number(delta).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (isGoldRateMetric(metric)) {
      const pct = Math.round(delta * 100);
      return (pct > 0 ? "+" : "") + pct + "pp";
    }
    const abs = Math.abs(delta);
    if (isRateLikeMetric(metric) && abs <= 1.5) {
      return sign + (delta * 100).toFixed(2) + "pp";
    }
    if (!isRateLikeMetric(metric) || abs >= 1) {
      return sign + Number(delta).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return sign + (delta * 100).toFixed(2) + "%";
  }

  /** Contribution / effect cells: pp for rates, same unit as metric for ticket size. */
  function formatContribDelta(v, metric) {
    if (v == null || !Number.isFinite(+v)) return "—";
    const n = +v;
    const sign = n > 0 ? "+" : "";
    if (isRateLikeMetric(metric)) {
      return sign + (n * 100).toFixed(2) + "pp";
    }
    return sign + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  /** Relative change vs base period rate: Δ / |基期|. */
  function formatRelDelta(delta, prevRate) {
    if (delta == null || prevRate == null || !Number.isFinite(+delta) || !Number.isFinite(+prevRate)) return null;
    if (Math.abs(prevRate) < 1e-12) return null;
    const pct = (delta / Math.abs(prevRate)) * 100;
    const sign = pct > 0 ? "+" : "";
    return sign + pct.toFixed(1) + "%";
  }

  function formatPeriodRange(prevPeriod, period, grain) {
    if (!prevPeriod || !period) return "";
    return `${formatPeriodLabel(prevPeriod, grain)}→${formatPeriodLabel(period, grain)}`;
  }

  /**
   * Per-metric period rows + multiline hover tip (one metric per line).
   * When group×metric pairs disagree, pick the most common (prev, period) for that metric.
   * @returns {{ rows: Array<{metricId,name,prev,cur,prevLabel,curLabel,multi}>, tip: string }|null}
   */
  function collectBriefPeriodContext(trendItems, grain, metrics) {
    const byMetric = Object.create(null);
    for (const item of trendItems) {
      for (const p of item.metrics || []) {
        if (!p.metricId || !p.period || !p.prevPeriod) continue;
        const id = p.metricId;
        if (!byMetric[id]) {
          byMetric[id] = {
            name: p.metricName || id,
            counts: Object.create(null),
            skippedCounts: Object.create(null),
          };
        }
        const skipped = p.shortWeekSkipped && p.skippedPeriod ? String(p.skippedPeriod) : "";
        const key = `${p.prevPeriod}\0${p.period}\0${skipped}`;
        byMetric[id].counts[key] = (byMetric[id].counts[key] || 0) + 1;
        if (skipped) {
          byMetric[id].skippedCounts[skipped] = (byMetric[id].skippedCounts[skipped] || 0) + 1;
        }
      }
    }
    const order = (metrics || []).map((m) => m.id).filter((id) => byMetric[id]);
    for (const id of Object.keys(byMetric)) {
      if (!order.includes(id)) order.push(id);
    }
    if (!order.length) return null;
    const rows = [];
    for (const id of order) {
      const info = byMetric[id];
      let bestKey = null;
      let bestN = -1;
      let multi = false;
      for (const [k, n] of Object.entries(info.counts)) {
        if (n > bestN) {
          bestN = n;
          bestKey = k;
        }
      }
      if (Object.keys(info.counts).length > 1) multi = true;
      if (!bestKey) continue;
      const parts = bestKey.split("\0");
      const prev = parts[0];
      const cur = parts[1];
      const skipped = parts[2] || "";
      let skippedPeriod = skipped || null;
      if (!skippedPeriod) {
        let bestSkip = null;
        let bestSkipN = -1;
        for (const [sk, n] of Object.entries(info.skippedCounts || {})) {
          if (n > bestSkipN) {
            bestSkipN = n;
            bestSkip = sk;
          }
        }
        skippedPeriod = bestSkip || null;
      }
      rows.push({
        metricId: id,
        name: info.name,
        prev,
        cur,
        prevLabel: formatPeriodLabel(prev, grain),
        curLabel: formatPeriodLabel(cur, grain),
        skippedPeriod,
        skippedLabel: skippedPeriod ? formatPeriodLabel(skippedPeriod, grain) : null,
        shortWeekSkipped: !!skippedPeriod,
        multi,
      });
    }
    if (!rows.length) return null;
    const tip = rows.map((r) => {
      let line;
      if (r.shortWeekSkipped && r.skippedLabel) {
        // 环比实际用上周(cur) vs 上上周(prev)；短周为最新有值但不入环比
        line =
          `指标名称：${r.name}  有值周（短周）：${r.skippedLabel}，上周 ${r.curLabel} vs. 上上周 ${r.prevLabel}`;
      } else {
        line =
          `指标名称：${r.name}  最新有值周：${r.curLabel} vs. 上一有值周：${r.prevLabel}`;
      }
      if (r.multi) line += "（组间取多数）";
      return line;
    }).join("\n");
    return { rows, tip };
  }

  function formatSegmentShort(row, dimCols) {
    const parts = row?.segmentParts;
    if (parts?.length) {
      return parts.map((p) => p.label).filter((x) => x != null && x !== "").join(" · ") || "—";
    }
    const seg = String(row?.segment || "");
    if (!seg) return "—";
    return seg
      .split(/\s*\|\s*/)
      .map((p) => p.replace(/^[^：:]+[：:]/, "").trim())
      .filter(Boolean)
      .join(" · ") || seg;
  }

  function formatRate(rate, metric) {
    if (rate == null || (typeof rate === "number" && isNaN(rate))) return "—";
    if (metric?.unit === "w") {
      return (rate / 10000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "w";
    }
    if (isSumMetric(metric)) {
      return Number(rate).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (isGoldRateMetric(metric)) {
      return Math.round(rate * 100) + "%";
    }
    if (metric && /件均|均额/.test(metric.name)) {
      return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    if (metric && /金额/.test(metric.name) && !/风险/.test(metric.name)) {
      return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    if (Math.abs(rate) <= 1.5) return (rate * 100).toFixed(2) + "%";
    return rate.toFixed(4);
  }

  function detectAnomalies(series, thresholds) {
    const thr = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
    const { periods, metrics } = series;
    if (!periods || periods.length < 2) return [];
    const anomalies = [];
    const groups = Array.from(new Set((series.points || []).map((p) => p.group)));

    for (const g of groups) {
      const samplePt = series.points.find((p) => p.group === g);
      for (const m of metrics) {
        if (m.direction === "none" || m.id === "gold_rate") continue;
        if (m.id === "credit_use_rate" || m.id === "t1_credit_use_rate") continue;
        if (m.baseId === "credit_use_rate" || m.baseId === "t1_credit_use_rate") continue;
        const snap = latestMetricSnapshot(series, g, m.id);
        if (!snap || snap.delta == null) continue;
        const deltaPct = (snap.prevRate != null && Math.abs(snap.prevRate) > 1e-12)
          ? snap.delta / Math.abs(snap.prevRate)
          : null;
        const relHit = deltaPct != null && Math.abs(deltaPct) >= thr.relDelta;
        if (relHit) {
          anomalies.push({
            group: g,
            groupParts: samplePt?.groupParts,
            metricId: m.id,
            metricName: m.name,
            direction: m.direction,
            period: snap.period,
            prevPeriod: snap.prevPeriod,
            rate: snap.rate,
            prevRate: snap.prevRate,
            delta: snap.delta,
            deltaPct,
            worse: isWorseDelta(snap.delta, m.direction),
            shortWeekSkipped: !!snap.shortWeekSkipped,
            skippedPeriod: snap.skippedPeriod || null,
            skippedRate: snap.skippedRate != null ? snap.skippedRate : null,
            skippedDayCount: snap.skippedDayCount != null ? snap.skippedDayCount : null,
            shortWeekNote: formatShortWeekNote(snap, series.grain),
          });
        }
      }
    }
    anomalies.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return anomalies;
  }

  function sentimentLabel(delta, direction) {
    if (delta == null) return "持平";
    const worse = isWorseDelta(delta, direction);
    const better = isWorseDelta(-delta, direction);
    if (Math.abs(delta) < 1e-12) return "持平";
    if (worse) return "偏负面";
    if (better) return "偏正面";
    return "变化";
  }

  function buildDecisionGroupNarratives(seriesByGrain, decisionGroups, thresholds) {
    const thr = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
    const narratives = [];
    for (const grain of GRAINS) {
      const series = seriesByGrain[grain];
      if (!series || !series.periods.length) continue;
      const gLab = grainLabel(grain);
      for (const g of decisionGroups) {
        for (const m of series.metrics) {
          if (m.direction === "none" || m.id === "gold_rate") continue;
          const snap = latestMetricSnapshot(series, g, m.id);
          if (!snap || snap.delta == null) continue;
          const dirTxt = m.direction === "higher" ? "越大越好" : "越小越好";
          const up = snap.delta > 0 ? "上升" : snap.delta < 0 ? "下降" : "持平";
          const curLab = formatPeriodLabel(snap.period, grain);
          const prevLab = formatPeriodLabel(snap.prevPeriod, grain);
          const worse = isWorseDelta(snap.delta, m.direction);
          const deltaPct = (snap.prevRate != null && Math.abs(snap.prevRate) > 1e-12)
            ? snap.delta / Math.abs(snap.prevRate)
            : null;
          const isAnomaly = deltaPct != null && Math.abs(deltaPct) >= thr.relDelta;
          const sentiment = sentimentLabel(snap.delta, m.direction);
          const shortNote = formatShortWeekNote(snap, grain);
          const text =
            `决策组 ${g}「${m.name}」` +
            (snap.shortWeekSkipped
              ? `环比（${prevLab}→${curLab}）`
              : `最新有值${gLab}（${curLab}）相对上期（${prevLab}）`) +
            `${up} ${formatDelta(snap.delta, m)}` +
            `（${formatRate(snap.prevRate, m)} → ${formatRate(snap.rate, m)}；${dirTxt}，${sentiment}）`;
          narratives.push({
            grain,
            group: g,
            metricId: m.id,
            metricName: m.name,
            direction: m.direction,
            period: snap.period,
            prevPeriod: snap.prevPeriod,
            rate: snap.rate,
            prevRate: snap.prevRate,
            delta: snap.delta,
            deltaPct,
            worse,
            isAnomaly,
            sentiment,
            shortWeekSkipped: !!snap.shortWeekSkipped,
            skippedPeriod: snap.skippedPeriod || null,
            skippedRate: snap.skippedRate != null ? snap.skippedRate : null,
            skippedDayCount: snap.skippedDayCount != null ? snap.skippedDayCount : null,
            shortWeekNote: shortNote,
            displayPeriod: snap.displayPeriod || snap.period,
            displayRate: snap.displayRate != null ? snap.displayRate : snap.rate,
            priorLevelPeriod: snap.priorLevelPeriod || null,
            priorLevelRate: snap.priorLevelRate != null ? snap.priorLevelRate : null,
            text,
          });
        }
      }
    }
    narratives.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return narratives;
  }

  function buildPeriodMasks(rows, timeCol, grain, basePeriod, cmpPeriod) {
    const n = rows.length;
    const isBase = new Array(n);
    const isCmp = new Array(n);
    for (let i = 0; i < n; i++) {
      const b = bucketTime(rowVal(rows[i], timeCol), grain);
      isBase[i] = b === basePeriod;
      isCmp[i] = b === cmpPeriod;
    }
    return { isBase, isCmp };
  }

  function filterRowsByDecision(rows, decisionCol, decisionVal) {
    if (!decisionCol || decisionVal == null || decisionVal === "") return rows;
    return rows.filter((r) => String(rowVal(r, decisionCol) ?? "(空)") === String(decisionVal));
  }

  function isContribMetricId(id) {
    return CONTRIB_METRIC_IDS.indexOf(id) >= 0;
  }

  function listContribMetrics(config) {
    return (config?.metrics || []).filter((m) => m && isContribMetricId(m.id));
  }

  function scopedRowsForContrib(rows, config, grain) {
    normalizeGrain(grain);
    return filterRowsToWeekWindow(rows, config.timeCol, config.weekWindow).rows;
  }

  function contribRowProjectKey(row, dimCols, pickedCols) {
    const cols = dimCols || [];
    const picked = pickedCols && pickedCols.length ? pickedCols : cols;
    let parts = row?.segmentParts;
    if ((!parts || !parts.length) && RV.domain.attribution?.parseSegmentParts) {
      parts = RV.domain.attribution.parseSegmentParts(row?.segment, cols);
    }
    return groupKey(picked.map((c) => {
      const hit = (parts || []).find((p) => p.col === c);
      const label = hit && hit.label != null && hit.label !== "" ? String(hit.label) : "(空)";
      return label;
    }));
  }

  function listContribProjectedKeys(items, dimCols, pickedCols) {
    const seen = Object.create(null);
    const out = [];
    for (const it of items || []) {
      const dims = dimCols || it.segmentCols || [];
      for (const row of it.topSegments || []) {
        const k = contribRowProjectKey(row, dims, pickedCols);
        if (!k || seen[k]) continue;
        seen[k] = true;
        out.push(k);
      }
    }
    out.sort((a, b) => a.localeCompare(b, "zh"));
    return out;
  }

  function sameColList(a, b) {
    const x = a || [];
    const y = b || [];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== y[i]) return false;
    }
    return true;
  }

  function parsePartsForCols(row, fromCols) {
    let parts = row?.segmentParts;
    if ((!parts || !parts.length) && RV.domain.attribution?.parseSegmentParts) {
      parts = RV.domain.attribution.parseSegmentParts(row?.segment, fromCols);
    }
    return parts || [];
  }

  /** Roll one contribution card onto `pickedCols` (Σn/Σd, no leftover dims). */
  function rollupContribItemToCols(item, pickedCols) {
    const fromCols = item?.segmentCols || item?.contrib?.dimCols || [];
    const toCols = pickedCols && pickedCols.length ? pickedCols.slice() : fromCols.slice();
    if (!item || sameColList(fromCols, toCols)) return item;
    const src = item.topSegments || item.contrib?.table || [];
    const buckets = Object.create(null);
    for (const row of src) {
      const key = contribRowProjectKey(row, fromCols, toCols);
      if (!key) continue;
      let acc = buckets[key];
      if (!acc) {
        const parts = parsePartsForCols(row, fromCols);
        acc = buckets[key] = {
          segment: key,
          segmentParts: toCols.map((c) => {
            const hit = parts.find((p) => p.col === c);
            return { col: c, label: hit && hit.label != null && hit.label !== "" ? String(hit.label) : "(空)" };
          }),
          num_base: 0, den_base: 0, num_cmp: 0, den_cmp: 0,
        };
      }
      acc.num_base += +row.num_base || 0;
      acc.den_base += +row.den_base || 0;
      acc.num_cmp += +row.num_cmp || 0;
      acc.den_cmp += +row.den_cmp || 0;
    }
    let mBase = +item.contrib?.den_total_base;
    let mCmp = +item.contrib?.den_total_cmp;
    const accs = Object.values(buckets);
    if (!Number.isFinite(mBase) || mBase <= 0) mBase = accs.reduce((s, r) => s + r.den_base, 0);
    if (!Number.isFinite(mCmp) || mCmp <= 0) mCmp = accs.reduce((s, r) => s + r.den_cmp, 0);
    const deltaAll = item.contrib?.delta_rate != null
      ? item.contrib.delta_rate
      : (item.anomaly && item.anomaly.delta != null ? item.anomaly.delta : null);
    const table = Object.keys(buckets).sort((a, b) => a.localeCompare(b, "zh")).map((key) => {
      const acc = buckets[key];
      const r_b = acc.den_base > 0 ? acc.num_base / acc.den_base : 0;
      const r_c = acc.den_cmp > 0 ? acc.num_cmp / acc.den_cmp : 0;
      const w_b = mBase > 0 ? acc.den_base / mBase : 0;
      const w_c = mCmp > 0 ? acc.den_cmp / mCmp : 0;
      const contrib_migration = (r_c - r_b) * w_b;
      const contrib_structure = (w_c - w_b) * r_b;
      const contrib_interaction = (r_c - r_b) * (w_c - w_b);
      const contrib_total = contrib_migration + contrib_structure + contrib_interaction;
      return {
        segment: key,
        segmentParts: acc.segmentParts,
        num_base: acc.num_base,
        den_base: acc.den_base,
        num_cmp: acc.num_cmp,
        den_cmp: acc.den_cmp,
        rate_base: acc.den_base > 0 ? r_b : null,
        rate_cmp: acc.den_cmp > 0 ? r_c : null,
        weight_base: w_b,
        weight_cmp: w_c,
        contrib_total,
        contrib_migration,
        contrib_structure,
        contrib_interaction,
        contrib_pct: deltaAll && Math.abs(deltaAll) > 1e-12 ? (contrib_total / deltaAll * 100) : 0,
      };
    });
    table.sort((a, b) => Math.abs(b.contrib_total) - Math.abs(a.contrib_total));
    const top = table.slice(0, 100);
    const topSeg = top[0];
    const topShort = topSeg ? formatSegmentShort(topSeg, toCols) : "";
    const contrib = Object.assign({}, item.contrib || {}, {
      table,
      dimCols: toCols.slice(),
      dimension: toCols.join(" × "),
      n_segments: table.length,
      sum_contrib: table.reduce((s, t) => s + t.contrib_total, 0),
    });
    let narrativeHead = item.narrativeHead || "";
    let narrativeSub = item.narrativeSub || "";
    let narrative = item.narrative || "";
    if (topSeg) {
      const metric = { name: item.metricName, id: item.metricId };
      const contribTxt = formatContribDelta(topSeg.contrib_total, metric);
      const pctTxt = topSeg.contrib_pct != null ? topSeg.contrib_pct.toFixed(1) + "%" : "—";
      narrativeSub = `主因 ${topShort} · 贡献 ${contribTxt}（占异动 ${pctTxt}）`;
      narrative = narrativeHead ? `${narrativeHead}；${narrativeSub}` : narrativeSub;
    }
    return Object.assign({}, item, {
      segmentCols: toCols.slice(),
      contrib,
      topSegments: top,
      topSegmentShort: topShort,
      narrativeHead,
      narrativeSub,
      narrative,
    });
  }

  function sortContribSegmentKeys(keys, cols) {
    const parse = RV.domain.attribution?.parseSegmentParts;
    return keys.slice().sort((a, b) => {
      if (!cols || cols.length <= 1 || !parse) return String(a).localeCompare(String(b), "zh");
      const pa = parse(a, cols);
      const pb = parse(b, cols);
      const n = Math.max(pa.length, pb.length);
      for (let i = 0; i < n; i++) {
        const av = pa[i]?.label || "";
        const bv = pb[i]?.label || "";
        if (av === bv) continue;
        return String(av).localeCompare(String(bv), "zh");
      }
      return 0;
    });
  }

  /** Same table shape as attribution.contributionAnalysis, from one shared row scan. */
  function contribFromAccum(job, segCols) {
    const all = { rate: job.sumBaseD > 0 ? job.sumBaseN / job.sumBaseD : null };
    const cmpA = { rate: job.sumCmpD > 0 ? job.sumCmpN / job.sumCmpD : null };
    const deltaAll = (all.rate != null && cmpA.rate != null) ? cmpA.rate - all.rate : null;
    const mBase = job.mBase;
    const mCmp = job.mCmp;
    const parseParts = RV.domain.attribution?.parseSegmentParts;
    const table = [];
    for (const seg of sortContribSegmentKeys(Object.keys(job.segMap), segCols)) {
      const b = job.segMap[seg].base;
      const c = job.segMap[seg].cmp;
      const r_b = b.d > 0 ? b.n / b.d : 0;
      const r_c = c.d > 0 ? c.n / c.d : 0;
      const w_b = mBase > 0 ? b.d / mBase : 0;
      const w_c = mCmp > 0 ? c.d / mCmp : 0;
      const contrib_migration = (r_c - r_b) * w_b;
      const contrib_structure = (w_c - w_b) * r_b;
      const contrib_interaction = (r_c - r_b) * (w_c - w_b);
      const contrib_total = contrib_migration + contrib_structure + contrib_interaction;
      table.push({
        segment: seg,
        segmentParts: parseParts ? parseParts(seg, segCols) : [],
        num_base: b.n,
        den_base: b.d,
        num_cmp: c.n,
        den_cmp: c.d,
        rate_base: b.d > 0 ? r_b : null,
        rate_cmp: c.d > 0 ? r_c : null,
        weight_base: w_b,
        weight_cmp: w_c,
        contrib_total,
        contrib_migration,
        contrib_structure,
        contrib_interaction,
        contrib_pct: deltaAll && Math.abs(deltaAll) > 1e-12 ? (contrib_total / deltaAll * 100) : 0,
      });
    }
    const sumContrib = table.reduce((s, t) => s + t.contrib_total, 0);
    return {
      rate_base: all.rate,
      rate_cmp: cmpA.rate,
      delta_rate: deltaAll,
      table,
      sum_contrib: sumContrib,
      reconciliation_error: deltaAll != null ? deltaAll - sumContrib : null,
      den_total_base: mBase,
      den_total_cmp: mCmp,
      n_segments: table.length,
      dimCols: segCols.slice(),
      dimension: segCols.join(" × "),
      binning_specs: [],
    };
  }

  function buildContributionPanel(rows, config, anomalies, grain, opts) {
    const results = [];
    opts = opts || {};
    const cfgSegs = config.segmentCols || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const segCols = (picked && picked.length) ? picked : cfgSegs;
    if (!segCols.length || !anomalies.length) return results;

    const jobs = [];
    const seen = new Set();
    const byGroup = Object.create(null);
    for (const an of anomalies) {
      if (!an.prevPeriod || !an.period) continue;
      if (!isContribMetricId(an.metricId)) continue;
      const key = an.group + "\0" + an.metricId;
      if (seen.has(key)) continue;
      seen.add(key);
      const metric = (config.metrics || []).find((m) => m.id === an.metricId);
      if (!metric) continue;
      const job = {
        an,
        metric,
        segMap: Object.create(null),
        mBase: 0,
        mCmp: 0,
        sumBaseN: 0,
        sumBaseD: 0,
        sumCmpN: 0,
        sumCmpD: 0,
      };
      jobs.push(job);
      const g = String(an.group);
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(job);
    }
    const buildSeg = RV.domain.attribution?.buildSegmentKey;
    if (buildSeg && jobs.length) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const dec = String(rowVal(r, config.decisionCol) ?? "(空)");
        const list = byGroup[dec];
        if (!list) continue;
        const period = bucketTime(rowVal(r, config.timeCol), grain);
        for (let j = 0; j < list.length; j++) {
          const job = list[j];
          const isBase = period === job.an.prevPeriod;
          const isCmp = period === job.an.period;
          if (!isBase && !isCmp) continue;
          const seg = buildSeg(r, segCols, {});
          let bucket = job.segMap[seg];
          if (!bucket) bucket = job.segMap[seg] = { base: { n: 0, d: 0 }, cmp: { n: 0, d: 0 } };
          const n = parseNum(rowVal(r, job.metric.numCol)) || 0;
          const d = parseNum(rowVal(r, job.metric.denCol)) || 0;
          if (isBase) {
            bucket.base.n += n;
            bucket.base.d += d;
            job.mBase += d;
            job.sumBaseN += n;
            job.sumBaseD += d;
          }
          if (isCmp) {
            bucket.cmp.n += n;
            bucket.cmp.d += d;
            job.mCmp += d;
            job.sumCmpN += n;
            job.sumCmpD += d;
          }
        }
      }
    }

    for (const job of jobs) {
      const an = job.an;
      const metric = job.metric;
      const contrib = contribFromAccum(job, segCols);
      const top = (contrib.table || [])
        .slice()
        .sort((a, b) => Math.abs(b.contrib_total) - Math.abs(a.contrib_total))
        .slice(0, 100);

      const topSeg = top[0];
      const topShort = topSeg ? formatSegmentShort(topSeg, segCols) : "";
      const basePeriod = an.prevPeriod;
      const cmpPeriod = an.period;
      const deltaTxt = formatDelta(an.delta, metric);
      const grainLab = grainLabel(grain);
      const shortNote = an.shortWeekNote || formatShortWeekNote(an, grain);
      let narrativeHead = `${an.group} · ${metric.name} ${deltaTxt}`;
      let narrativeSub = `${grainLab}环比异动（${formatPeriodLabel(basePeriod, grain)} → ${formatPeriodLabel(cmpPeriod, grain)}）`;
      let narrative = narrativeHead + " · " + narrativeSub;
      if (topSeg) {
        const contribTxt = formatContribDelta(topSeg.contrib_total, metric);
        const pctTxt = topSeg.contrib_pct != null ? topSeg.contrib_pct.toFixed(1) + "%" : "—";
        narrativeSub =
          `主因 ${topShort} · 贡献 ${contribTxt}（占异动 ${pctTxt}）` +
          ` · ${grainLab} ${formatPeriodLabel(basePeriod, grain)}→${formatPeriodLabel(cmpPeriod, grain)}`;
        narrative = `${narrativeHead}；${narrativeSub}`;
      } else {
        narrativeSub = `有异动，但客群贡献未能分解 · ${grainLab} ${formatPeriodLabel(basePeriod, grain)}→${formatPeriodLabel(cmpPeriod, grain)}`;
        narrative = `${narrativeHead}；${narrativeSub}`;
      }

      results.push({
        grain,
        decisionGroup: an.group,
        metricId: metric.id,
        metricName: metric.name,
        segmentCols: segCols.slice(),
        basePeriod,
        cmpPeriod,
        shortWeekNote: shortNote || null,
        anomaly: an,
        contrib,
        topSegments: top,
        topSegmentShort: topShort,
        narrativeHead,
        narrativeSub,
        narrative,
      });
    }
    return results;
  }

  /** Re-decompose current-grain contributions onto `segmentCols` (in place). */
  function rebuildContributionPanel(rows, result, grain, segmentCols) {
    const g = normalizeGrain(grain);
    const cfg = result?.config;
    if (!cfg) return [];
    const picked = resolvePickedSegmentCols(cfg.segmentCols || [], segmentCols);
    const segs = (picked && picked.length) ? picked : (cfg.segmentCols || []).slice();
    const scoped = scopedRowsForContrib(rows || [], cfg, g);
    const anomalies = (result.anomaliesByGrain?.[g] || []).filter((an) => isContribMetricId(an.metricId));
    const next = buildContributionPanel(scoped, cfg, anomalies, g, { segmentCols: segs });
    if (!result.contributions) result.contributions = {};
    result.contributions[g] = next;
    if (result.briefByGrain) {
      result.briefByGrain[g] = buildExecutiveBrief(result, g);
    }
    return next;
  }

  /** Rebuild from rows, or roll up existing cards when CSV is gone. */
  function ensureContributionPanel(rows, result, grain, segmentCols) {
    const g = normalizeGrain(grain);
    const cfg = result?.config;
    if (!cfg) return [];
    const picked = resolvePickedSegmentCols(cfg.segmentCols || [], segmentCols);
    const segs = (picked && picked.length) ? picked : (cfg.segmentCols || []).slice();
    const items = result.contributions?.[g] || [];
    if (items.length && items.every((it) => sameColList(it.segmentCols, segs))) return items;
    if (rows && rows.length) return rebuildContributionPanel(rows, result, g, segs);
    const next = items.map((it) => rollupContribItemToCols(it, segs));
    if (!result.contributions) result.contributions = {};
    result.contributions[g] = next;
    if (result.briefByGrain) {
      result.briefByGrain[g] = buildExecutiveBrief(result, g);
    }
    return next;
  }

  const pairwiseFineCache = new WeakMap();

  function finePointList(series) {
    return (series?.points && series.points.length)
      ? series.points
      : Object.values(series?.cells || {});
  }

  function slotRate(slot, metric) {
    if (!slot) return null;
    if (isSumMetric(metric)) return slot.n;
    return slot.d > 0 ? slot.n / slot.d : null;
  }

  function pairwiseBundleFromFine(fine, config, segCols) {
    const cfgSegs = config?.segmentCols || [];
    const indices = (segCols || []).map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0);
    const metrics = listContribMetrics(config);
    const acc = Object.create(null);
    const segPartsBySeg = Object.create(null);
    const groupSet = new Set();
    const groups = [];
    for (const pt of finePointList(fine)) {
      const parts = pt.groupParts || [];
      const decision = String(parts[0] ?? "(空)");
      if (!groupSet.has(decision)) {
        groupSet.add(decision);
        groups.push(decision);
      }
      const labels = indices.map((ix) => parts[ix + 1]);
      const seg = groupKey(labels);
      if (!segPartsBySeg[seg]) {
        segPartsBySeg[seg] = (segCols || []).map((c, i) => ({
          col: c,
          label: labels[i] != null && labels[i] !== "" ? String(labels[i]) : "(空)",
        }));
      }
      for (const m of metrics) {
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        const k = seg + "\0" + pt.period + "\0" + decision + "\0" + m.id;
        let slot = acc[k];
        if (!slot) slot = acc[k] = { n: 0, d: 0 };
        slot.n += src.n || 0;
        if (!isSumMetric(m)) slot.d += src.d || 0;
      }
    }
    groups.sort();
    return {
      acc,
      segPartsBySeg,
      groups,
      metrics,
      periods: (fine.periods || []).slice(),
    };
  }

  function cachedPairwiseBundle(fine, config, segCols) {
    const key = (segCols || []).join("\0");
    const hit = pairwiseFineCache.get(fine);
    if (hit && hit.key === key) return hit.bundle;
    const bundle = pairwiseBundleFromFine(fine, config, segCols);
    pairwiseFineCache.set(fine, { key, bundle });
    return bundle;
  }

  function histFromPairwiseBundle(bundle, seg, metric, a, b) {
    const hist = [];
    for (const p of bundle.periods) {
      const sa = bundle.acc[seg + "\0" + p + "\0" + a + "\0" + metric.id];
      const sb = bundle.acc[seg + "\0" + p + "\0" + b + "\0" + metric.id];
      const ra = slotRate(sa, metric);
      const rb = slotRate(sb, metric);
      if (ra == null || rb == null) continue;
      hist.push({
        period: p,
        rateA: ra,
        rateB: rb,
        diff: rb - ra,
        nA: sa.n,
        dA: sa.d,
        nB: sb.n,
        dB: sb.d,
      });
    }
    return hist;
  }

  function pairwiseFromFine(fine, config, grain, opts) {
    const out = { grain, pairs: [], narratives: [], segmentCols: [] };
    const cfgSegs = config.segmentCols || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const segCols = (picked && picked.length) ? picked : cfgSegs.slice();
    out.segmentCols = segCols.slice();
    if (!fine || !segCols.length) return out;
    const bundle = cachedPairwiseBundle(fine, config, segCols);
    if (bundle.groups.length < 2 || !bundle.metrics.length) return out;
    const ab = resolveDecisionAB(bundle.groups);
    const a = ab ? ab.a : bundle.groups[0];
    const b = ab ? ab.b : bundle.groups[1];
    const segments = Object.keys(bundle.segPartsBySeg).sort();
    for (const seg of segments) {
      const segmentParts = bundle.segPartsBySeg[seg] || [];
      for (const m of bundle.metrics) {
        const hist = histFromPairwiseBundle(bundle, seg, m, a, b);
        if (hist.length < 3) continue;
        const flip = pairwiseFlipFromHist(hist, m);
        if (!flip) continue;
        const pair = {
          segment: seg,
          segmentParts,
          segmentCols: segCols.slice(),
          metricId: m.id,
          metricName: m.name,
          groupA: a,
          groupB: b,
          latest: flip.latest,
          histShareBBetter: flip.histShareBBetter,
          flipped: flip.flipped,
        };
        out.pairs.push(pair);
        if (pair.flipped) {
          const dirTxt = m.direction === "lower" ? "更低更好" : "更高更好";
          out.narratives.push({
            grain,
            segment: seg,
            segmentParts,
            metricId: m.id,
            text:
              `客群「${seg}」：往期约 ${(pair.histShareBBetter * 100).toFixed(0)}% 的期次中，` +
              `决策组 ${b} 相对 ${a} 的「${m.name}」更优（${dirTxt}），` +
              `但最新期（${pair.latest.period}）转为 ${b} 劣于 ${a}` +
              `（${a}=${formatRate(pair.latest.rateA, m)}，${b}=${formatRate(pair.latest.rateB, m)}）`,
          });
        }
      }
    }
    out.pairs.sort((x, y) => Number(y.flipped) - Number(x.flipped));
    return out;
  }

  /** Chart points for one pairwise card. Uses stored history, else the fine series. */
  function pairwiseHistoryForPair(result, grain, pair) {
    if (pair?.history?.length) return pair.history;
    const g = normalizeGrain(grain);
    const fine = result?.seriesFineByGrain?.[g];
    if (!fine || !pair) return [];
    const cols = (pair.segmentCols && pair.segmentCols.length)
      ? pair.segmentCols
      : (result?.pairwise?.[g]?.segmentCols || result?.config?.segmentCols || []);
    const bundle = cachedPairwiseBundle(fine, result.config, cols);
    const metric = (bundle.metrics || []).find((m) => m.id === pair.metricId)
      || { id: pair.metricId, name: pair.metricName, direction: "lower", kind: "rate" };
    return histFromPairwiseBundle(bundle, pair.segment, metric, pair.groupA, pair.groupB);
  }

  /**
   * Pairwise A vs B same segment: history advantage flip detection.
   * Only CONTRIB_METRIC_IDS (pass_rate / risk / amt_risk / curr_ticket).
   * Pass opts.fineSeries to project from an existing fine series (no second row scan).
   */
  function buildSegmentPairwiseCompare(rows, config, grain, opts) {
    opts = opts || {};
    if (opts.fineSeries) return pairwiseFromFine(opts.fineSeries, config, grain, opts);
    const out = { grain, pairs: [], narratives: [], segmentCols: [] };
    const cfgSegs = config.segmentCols || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const segCols = (picked && picked.length) ? picked : cfgSegs;
    const metrics = listContribMetrics(config);
    const decisionCol = config.decisionCol;
    out.segmentCols = segCols.slice();
    if (!segCols.length || !decisionCol || !metrics.length) return out;

    // Align with trend charts + diff(B−A): semantic A/B, else sorted labels — never CSV first-seen order
    const groups = listDecisionGroups(rows, decisionCol);
    if (groups.length < 2) return out;
    const ab = resolveDecisionAB(groups);
    const a = ab ? ab.a : groups[0];
    const b = ab ? ab.b : groups[1];

    const series = aggregateMetricSeries(rows, {
      timeCol: config.timeCol,
      grain,
      groupCols: [decisionCol, ...segCols],
      metrics,
    });
    attachMom(series);

    const bySegPeriod = Object.create(null);
    const segPartsBySeg = Object.create(null);
    for (const pt of series.points) {
      const decision = String(pt.groupParts[0] ?? "(空)");
      const labels = pt.groupParts.slice(1);
      const seg = groupKey(labels);
      if (!segPartsBySeg[seg]) {
        segPartsBySeg[seg] = segCols.map((c, i) => ({
          col: c,
          label: labels[i] != null && labels[i] !== "" ? String(labels[i]) : "(空)",
        }));
      }
      const key = seg + "\0" + pt.period;
      if (!bySegPeriod[key]) bySegPeriod[key] = { seg, period: pt.period, byDecision: {} };
      bySegPeriod[key].byDecision[decision] = pt;
    }

    const segments = Object.keys(segPartsBySeg).sort();
    const periods = series.periods;

    for (const seg of segments) {
      const segmentParts = segPartsBySeg[seg] || [];
      for (const m of metrics) {
        const hist = [];
        for (const p of periods) {
          const cell = bySegPeriod[seg + "\0" + p];
          if (!cell) continue;
          const pa = cell.byDecision[a];
          const pb = cell.byDecision[b];
          const sa = pa?.metrics[m.id];
          const sb = pb?.metrics[m.id];
          const ra = sa?.rate;
          const rb = sb?.rate;
          if (ra == null || rb == null) continue;
          hist.push({
            period: p, rateA: ra, rateB: rb, diff: rb - ra,
            nA: sa?.n, dA: sa?.d, nB: sb?.n, dB: sb?.d,
          });
        }
        if (hist.length < 3) continue;

        const recent = hist[hist.length - 1];
        const past = hist.slice(0, -1);
        const betterForLower = (diff) => diff < 0; // B lower than A
        const betterForHigher = (diff) => diff > 0; // B higher than A
        const bWasBetter = (diff) => (m.direction === "lower" ? betterForLower(diff) : betterForHigher(diff));

        const histBetterCount = past.filter((h) => bWasBetter(h.diff)).length;
        const histShare = histBetterCount / past.length;
        const recentBBetter = bWasBetter(recent.diff);
        const flipped = histShare >= 0.6 && !recentBBetter;

        const pair = {
          segment: seg,
          segmentParts,
          segmentCols: segCols.slice(),
          metricId: m.id,
          metricName: m.name,
          groupA: a,
          groupB: b,
          history: hist,
          latest: recent,
          histShareBBetter: histShare,
          flipped,
        };
        out.pairs.push(pair);

        if (flipped) {
          const dirTxt = m.direction === "lower" ? "更低更好" : "更高更好";
          out.narratives.push({
            grain,
            segment: seg,
            segmentParts,
            metricId: m.id,
            text:
              `客群「${seg}」：往期约 ${(histShare * 100).toFixed(0)}% 的期次中，` +
              `决策组 ${b} 相对 ${a} 的「${m.name}」更优（${dirTxt}），` +
              `但最新期（${recent.period}）转为 ${b} 劣于 ${a}` +
              `（${a}=${formatRate(recent.rateA, m)}，${b}=${formatRate(recent.rateB, m)}）`,
          });
        }
      }
    }

    out.pairs.sort((x, y) => Number(y.flipped) - Number(x.flipped));
    return out;
  }

  /** Re-run current-grain pairwise on `segmentCols` (in place). */
  function rebuildSegmentPairwiseCompare(rows, result, grain, segmentCols) {
    const g = normalizeGrain(grain);
    const cfg = result?.config;
    if (!cfg) return { grain: g, pairs: [], narratives: [], segmentCols: [] };
    const picked = resolvePickedSegmentCols(cfg.segmentCols || [], segmentCols);
    const segs = (picked && picked.length) ? picked : (cfg.segmentCols || []).slice();
    const scoped = scopedRowsForContrib(rows || [], cfg, g);
    const next = buildSegmentPairwiseCompare(scoped, cfg, g, {
      segmentCols: segs,
      fineSeries: result?.seriesFineByGrain?.[g] || null,
    });
    if (!result.pairwise) result.pairwise = {};
    result.pairwise[g] = next;
    if (result.briefByGrain) {
      result.briefByGrain[g] = buildExecutiveBrief(result, g);
    }
    return next;
  }

  function listPairwiseProjectedKeys(pairs, dimCols, pickedCols) {
    const seen = Object.create(null);
    const out = [];
    for (const p of pairs || []) {
      const dims = dimCols || p.segmentCols || [];
      const k = contribRowProjectKey(p, dims, pickedCols);
      if (!k || seen[k]) continue;
      seen[k] = true;
      out.push(k);
    }
    out.sort((a, b) => a.localeCompare(b, "zh"));
    return out;
  }

  function pairwiseFlipFromHist(hist, metric) {
    if (!hist || hist.length < 3) return null;
    const recent = hist[hist.length - 1];
    const past = hist.slice(0, -1);
    const bWasBetter = (diff) => (metric?.direction === "lower" ? diff < 0 : diff > 0);
    const histShare = past.filter((h) => bWasBetter(h.diff)).length / past.length;
    return {
      latest: recent,
      histShareBBetter: histShare,
      flipped: histShare >= 0.6 && !bWasBetter(recent.diff),
    };
  }

  function rollupPairwiseCompare(pw, pickedCols, metrics) {
    const fromCols = pw?.segmentCols || [];
    const toCols = pickedCols && pickedCols.length ? pickedCols.slice() : fromCols.slice();
    const srcPairs = pw?.pairs || [];
    if (sameColList(fromCols, toCols) && srcPairs.every((p) => sameColList(p.segmentCols, toCols))) {
      return pw;
    }
    const metricById = Object.create(null);
    for (const m of metrics || []) metricById[m.id] = m;
    const groups = Object.create(null);
    for (const p of srcPairs) {
      const dims = p.segmentCols || fromCols;
      const key = contribRowProjectKey(p, dims, toCols);
      const gk = key + "\0" + p.metricId;
      let g = groups[gk];
      if (!g) {
        const parts = parsePartsForCols(p, dims);
        g = groups[gk] = {
          segment: key,
          segmentParts: toCols.map((c) => {
            const hit = parts.find((x) => x.col === c);
            return { col: c, label: hit && hit.label != null && hit.label !== "" ? String(hit.label) : "(空)" };
          }),
          metricId: p.metricId,
          metricName: p.metricName,
          groupA: p.groupA,
          groupB: p.groupB,
          byPeriod: Object.create(null),
        };
      }
      for (const h of p.history || []) {
        let cell = g.byPeriod[h.period];
        if (!cell) {
          cell = g.byPeriod[h.period] = {
            period: h.period, nA: 0, dA: 0, nB: 0, dB: 0, rateA: null, rateB: null,
          };
        }
        if (h.nA != null || h.dA != null || h.nB != null || h.dB != null) {
          cell.nA += +h.nA || 0;
          cell.dA += +h.dA || 0;
          cell.nB += +h.nB || 0;
          cell.dB += +h.dB || 0;
        } else if (cell.rateA == null) {
          cell.rateA = h.rateA;
          cell.rateB = h.rateB;
        }
      }
    }
    const pairs = [];
    const narratives = [];
    for (const g of Object.values(groups)) {
      const hist = Object.keys(g.byPeriod).sort().map((period) => {
        const cell = g.byPeriod[period];
        let ra = cell.rateA;
        let rb = cell.rateB;
        if (cell.dA > 0) ra = cell.nA / cell.dA;
        if (cell.dB > 0) rb = cell.nB / cell.dB;
        return {
          period, rateA: ra, rateB: rb,
          diff: (ra != null && rb != null) ? rb - ra : null,
          nA: cell.nA, dA: cell.dA, nB: cell.nB, dB: cell.dB,
        };
      }).filter((h) => h.rateA != null && h.rateB != null);
      if (hist.length < 3) continue;
      const m = metricById[g.metricId] || { name: g.metricName, direction: "lower" };
      const flip = pairwiseFlipFromHist(hist, m);
      const pair = {
        segment: g.segment,
        segmentParts: g.segmentParts,
        segmentCols: toCols.slice(),
        metricId: g.metricId,
        metricName: g.metricName,
        groupA: g.groupA,
        groupB: g.groupB,
        history: hist,
        latest: flip.latest,
        histShareBBetter: flip.histShareBBetter,
        flipped: flip.flipped,
      };
      pairs.push(pair);
      if (pair.flipped) {
        const dirTxt = m.direction === "lower" ? "更低更好" : "更高更好";
        narratives.push({
          grain: pw.grain,
          segment: pair.segment,
          segmentParts: pair.segmentParts,
          metricId: pair.metricId,
          text:
            `客群「${pair.segment}」：往期约 ${(pair.histShareBBetter * 100).toFixed(0)}% 的期次中，` +
            `决策组 ${pair.groupB} 相对 ${pair.groupA} 的「${pair.metricName}」更优（${dirTxt}），` +
            `但最新期（${pair.latest.period}）转为 ${pair.groupB} 劣于 ${pair.groupA}` +
            `（${pair.groupA}=${formatRate(pair.latest.rateA, m)}，${pair.groupB}=${formatRate(pair.latest.rateB, m)}）`,
        });
      }
    }
    pairs.sort((x, y) => Number(y.flipped) - Number(x.flipped));
    return { grain: pw.grain, pairs, narratives, segmentCols: toCols.slice() };
  }

  function ensureSegmentPairwiseCompare(rows, result, grain, segmentCols) {
    const g = normalizeGrain(grain);
    const cfg = result?.config;
    if (!cfg) return { grain: g, pairs: [], narratives: [], segmentCols: [] };
    const picked = resolvePickedSegmentCols(cfg.segmentCols || [], segmentCols);
    const segs = (picked && picked.length) ? picked : (cfg.segmentCols || []).slice();
    const cur = result.pairwise?.[g];
    if (cur && sameColList(cur.segmentCols, segs)) return cur;
    if (rows && rows.length) return rebuildSegmentPairwiseCompare(rows, result, g, segs);
    const next = rollupPairwiseCompare(
      cur || { grain: g, pairs: [], narratives: [], segmentCols: [] },
      segs,
      listContribMetrics(cfg)
    );
    if (!result.pairwise) result.pairwise = {};
    result.pairwise[g] = next;
    if (result.briefByGrain) {
      result.briefByGrain[g] = buildExecutiveBrief(result, g);
    }
    return next;
  }

  function takeRecentPeriods(series, windowSize) {
    const nRaw = +windowSize;
    const n = Math.max(1, Number.isFinite(nRaw) && nRaw > 0 ? Math.floor(nRaw) : 8);
    if (!series?.periods?.length || series.periods.length <= n) return series;
    const keep = new Set(series.periods.slice(-n));
    const periods = series.periods.filter((p) => keep.has(p));
    const points = series.points.filter((p) => keep.has(p.period));
    const cells = Object.create(null);
    for (const pt of points) {
      cells[pt.period + "\0" + pt.group] = pt;
    }
    return { ...series, periods, points, cells };
  }

  /** Keep only rows whose week-bucket is among the last `weekWindow` Mondays. */
  function filterRowsToWeekWindow(rows, timeCol, weekWindow) {
    const nRaw = +weekWindow;
    const n = Math.max(1, Number.isFinite(nRaw) && nRaw > 0 ? Math.floor(nRaw) : 16);
    const weekSet = new Set();
    for (let i = 0; i < rows.length; i++) {
      const w = bucketTime(rowVal(rows[i], timeCol), "week");
      if (w) weekSet.add(w);
    }
    const weeks = Array.from(weekSet).sort();
    if (weeks.length <= n) return { rows, weekPeriods: weeks };
    const keep = new Set(weeks.slice(-n));
    const filtered = rows.filter((r) => {
      const w = bucketTime(rowVal(r, timeCol), "week");
      return w && keep.has(w);
    });
    return { rows: filtered, weekPeriods: weeks.slice(-n) };
  }

  function resolveWeekWindow(value) {
    const n = +value;
    if (!Number.isFinite(n) || n < 1) return 16;
    return Math.min(52, Math.max(1, Math.floor(n)));
  }

  /** Rebuild `points` from `cells` after export slim dropped points. */
  function rebuildSeriesPoints(series) {
    if (!series) return series;
    if (Array.isArray(series.points) && series.points.length) return series;
    const cells = series.cells || {};
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    series.points = points;
    return series;
  }

  function hydrateOneSeries(series) {
    if (!series || typeof series !== "object" || !series.cells) return series;
    rebuildSeriesPoints(series);
    if (series.points && series.points.length && series.metrics && series.metrics.length) {
      const sample = series.points[0];
      if (!sample.mom) attachMom(series);
    }
    return series;
  }

  /** Hydrate all series maps on a runDailyReview result (in place). */
  function hydrateDailyReviewSeries(result) {
    if (!result) return result;
    function hydrateMap(map) {
      if (!map || typeof map !== "object") return;
      for (const key of Object.keys(map)) {
        if (map[key] && typeof map[key] === "object") hydrateOneSeries(map[key]);
      }
    }
    hydrateMap(result.seriesByGrain);
    hydrateMap(result.seriesFineByGrain);
    hydrateMap(result.seriesLevelByGrain);
    hydrateMap(result.seriesLevelDecByGrain);
    hydrateMap(result.seriesLevelDecFineByGrain);
    hydrateMap(result.seriesLevelFineByGrain);
    hydrateMap(result.seriesLevelChangeByGrain);
    hydrateMap(result.seriesLevelChangeDecByGrain);
    hydrateMap(result.seriesLevelChangeDecFineByGrain);
    return result;
  }

  function listDecisionGroups(rows, decisionCol) {
    const set = new Set();
    const out = [];
    for (const r of rows) {
      const v = String(rowVal(r, decisionCol) ?? "(空)");
      if (!set.has(v)) {
        set.add(v);
        out.push(v);
      }
    }
    return out.sort();
  }

  /** Distinct values of levelCol (same shape as decision groups). */
  function listLevelKeys(rows, levelCol) {
    if (!levelCol) return [];
    return listDecisionGroups(rows, levelCol);
  }

  function validateConfig(config, headers) {
    const errs = [];
    const hs = new Set(headers || []);
    if (!config.timeCol) errs.push("请选择时间列");
    else if (!hs.has(config.timeCol)) errs.push("时间列不在 CSV 中：" + config.timeCol);
    if (!config.decisionCol) errs.push("请选择决策组列");
    else if (!hs.has(config.decisionCol)) errs.push("决策组列不在 CSV 中：" + config.decisionCol);
    if (config.levelCol && !hs.has(config.levelCol)) {
      errs.push("Level 列不在 CSV 中：" + config.levelCol);
    }
    if (config.levelChangeNumCol && !hs.has(config.levelChangeNumCol)) {
      errs.push("level_change_num 列不在 CSV 中：" + config.levelChangeNumCol);
    }
    if (!config.metrics || !config.metrics.length) errs.push("请至少配置 1 个指标");
    for (const m of config.metrics || []) {
      if (isDerivedMetric(m)) continue;
      if (!m.name) errs.push("指标缺少名称");
      if (!m.numCol || !hs.has(m.numCol)) errs.push(`指标「${m.name || "?"}」分子列无效`);
      if (!isSumMetric(m) && (!m.denCol || !hs.has(m.denCol))) {
        errs.push(`指标「${m.name || "?"}」分母列无效`);
      }
    }
    for (const c of config.segmentCols || []) {
      if (!hs.has(c)) errs.push("客群列不在 CSV 中：" + c);
    }
    return errs;
  }

  /**
   * @param {object[]} rows
   * @param {object} config
   */
  function runDailyReview(rows, config) {
    const headers = config.headers || (rows[0] ? Object.keys(rows[0]) : []);
    const panelMetrics = insertGoldRateMetric((config.metrics || []).map((m, i) => {
      const n = normalizeMetric(m, i);
      n.detailOnly = false;
      n.kind = "rate";
      return n;
    }));
    const detailMetrics = buildDetailMetrics(panelMetrics, headers).map((m, i) => normalizeMetric(m, i));
    const profitParams = resolveProfitParams(config);
    const levelColRaw = (config.levelCol || "").trim();
    const levelCol = levelColRaw && headers.includes(levelColRaw) ? levelColRaw : "";
    const changeNumColRaw = (config.levelChangeNumCol || "").trim();
    const levelChangeNumCol = changeNumColRaw && headers.includes(changeNumColRaw) ? changeNumColRaw : "";
    const cfg = {
      timeCol: config.timeCol,
      decisionCol: config.decisionCol,
      levelCol,
      levelChangeNumCol,
      metrics: panelMetrics,
      detailMetrics,
      segmentCols: config.segmentCols || [],
      weekWindow: resolveWeekWindow(config.weekWindow),
      thresholds: { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) },
      nominalRate: profitParams.nominalRate,
      feeRate: profitParams.feeRate,
    };

    const decisionGroups = listDecisionGroups(rows, cfg.decisionCol);
    const seriesByGrain = {};
    const seriesFineByGrain = {};
    const seriesLevelDecByGrain = {};
    const seriesLevelDecFineByGrain = {};
    const seriesLevelChangeDecByGrain = {};
    const seriesLevelChangeDecFineByGrain = {};
    const anomaliesByGrain = {};
    const levelMetrics = levelPanelMetrics(detailMetrics);
    // Day + week share the recent N week-buckets
    const { rows: weekWindowRows, weekPeriods } = filterRowsToWeekWindow(rows, cfg.timeCol, cfg.weekWindow);
    const hasSeg = !!(cfg.segmentCols && cfg.segmentCols.length);
    const hasLevel = !!levelCol;
    const hasChangeNum = !!levelChangeNumCol;
    /** Full-table week → distinct calendar days（短周判定用全表，不只窗口行） */
    const weekDayCounts = countWeekDistinctDays(rows, cfg.timeCol);

    function finalizeScopedSeries(series, grain) {
      let out = series;
      if (grain === "week") {
        out = takeRecentPeriods(out, cfg.weekWindow);
        out.weekDayCounts = weekDayCounts;
        out.shortWeekMaxDays = SHORT_WEEK_MAX_DAYS;
      }
      out.profitParams = profitParams;
      attachMom(out);
      return out;
    }

    for (const grain of GRAINS) {
      const scopedRows = weekWindowRows;
      const decBag = newAggBag(detailMetrics);
      const fineBag = hasSeg ? newAggBag(detailMetrics) : null;
      const levelDecBag = hasLevel ? newAggBag(levelMetrics) : null;
      const levelFineBag = (hasLevel && hasSeg) ? newAggBag(levelMetrics) : null;
      const changeDecBag = hasChangeNum ? newAggBag(levelMetrics) : null;
      const changeFineBag = (hasChangeNum && hasSeg) ? newAggBag(levelMetrics) : null;
      const segCols = cfg.segmentCols || [];

      for (let i = 0; i < scopedRows.length; i++) {
        const r = scopedRows[i];
        const period = bucketTime(rowVal(r, cfg.timeCol), grain);
        if (!period) continue;
        const dec = rowVal(r, cfg.decisionCol);
        const decParts = [dec];
        touchAggCell(decBag, period, decParts, r);
        const segParts = hasSeg ? segCols.map((c) => rowVal(r, c)) : null;
        if (fineBag) touchAggCell(fineBag, period, decParts.concat(segParts), r);
        if (levelDecBag) {
          const bin = levelBinLabel(rowVal(r, levelCol));
          const binParts = [bin, dec];
          touchAggCell(levelDecBag, period, binParts, r);
          if (levelFineBag) touchAggCell(levelFineBag, period, binParts.concat(segParts), r);
        }
        if (changeDecBag) {
          const bin = changeNumBinLabel(rowVal(r, levelChangeNumCol));
          const binParts = [bin, dec];
          touchAggCell(changeDecBag, period, binParts, r);
          if (changeFineBag) touchAggCell(changeFineBag, period, binParts.concat(segParts), r);
        }
      }

      const series = finalizeScopedSeries(
        finishAggregated(decBag, grain, [cfg.decisionCol], profitParams),
        grain
      );
      seriesByGrain[grain] = series;
      anomaliesByGrain[grain] = detectAnomalies(
        { ...series, metrics: panelMetrics },
        cfg.thresholds
      );
      if (fineBag) {
        seriesFineByGrain[grain] = finalizeScopedSeries(
          finishAggregated(fineBag, grain, [cfg.decisionCol, ...segCols], profitParams),
          grain
        );
      }
      if (levelDecBag) {
        seriesLevelDecByGrain[grain] = finalizeScopedSeries(
          finishAggregated(levelDecBag, grain, [levelCol, cfg.decisionCol], profitParams),
          grain
        );
      }
      if (levelFineBag) {
        seriesLevelDecFineByGrain[grain] = finalizeScopedSeries(
          finishAggregated(levelFineBag, grain, [levelCol, cfg.decisionCol, ...segCols], profitParams),
          grain
        );
      }
      if (changeDecBag) {
        seriesLevelChangeDecByGrain[grain] = finalizeScopedSeries(
          finishAggregated(changeDecBag, grain, [levelChangeNumCol, cfg.decisionCol], profitParams),
          grain
        );
      }
      if (changeFineBag) {
        seriesLevelChangeDecFineByGrain[grain] = finalizeScopedSeries(
          finishAggregated(changeFineBag, grain, [levelChangeNumCol, cfg.decisionCol, ...segCols], profitParams),
          grain
        );
      }
    }

    const narrSeries = {};
    for (const grain of GRAINS) {
      narrSeries[grain] = { ...seriesByGrain[grain], metrics: panelMetrics };
    }
    const narratives = buildDecisionGroupNarratives(narrSeries, decisionGroups, cfg.thresholds);

    const contributions = {};
    const pairwise = {};
    for (const grain of GRAINS) {
      const scopedRows = weekWindowRows;
      contributions[grain] = buildContributionPanel(scopedRows, cfg, anomaliesByGrain[grain], grain);
      pairwise[grain] = buildSegmentPairwiseCompare(scopedRows, cfg, grain, {
        fineSeries: hasSeg ? seriesFineByGrain[grain] : null,
      });
    }

    const panel1SegmentKeys = hasSeg
      ? listPanel1SegmentKeys(
        seriesFineByGrain.week || seriesFineByGrain.day,
        PANEL1_SEGMENT_CAP
      )
      : ["__all__"];

    const panel5SegmentKeys = hasSeg
      ? listPanel5SegmentKeys(
        (hasLevel
          ? (seriesLevelDecFineByGrain.week
            || seriesLevelDecFineByGrain.day)
          : null)
          || (hasChangeNum
            ? (seriesLevelChangeDecFineByGrain.week
              || seriesLevelChangeDecFineByGrain.day)
            : null),
        PANEL1_SEGMENT_CAP
      )
      : ["__all__"];

    const levelKeys = hasLevel
      ? presentBinsFromDec(
        seriesLevelDecByGrain.week || seriesLevelDecByGrain.day,
        LEVEL_BIN_ORDER,
        LEVEL_BIN_OTHER
      )
      : [];
    const changeNumKeys = hasChangeNum
      ? presentBinsFromDec(
        seriesLevelChangeDecByGrain.week || seriesLevelChangeDecByGrain.day,
        CHANGE_NUM_BIN_ORDER,
        CHANGE_NUM_BIN_OTHER
      )
      : [];

    const result = {
      config: cfg,
      decisionGroups,
      levelKeys,
      levelBinOrder: LEVEL_BIN_ORDER.slice(),
      changeNumKeys,
      changeNumBinOrder: CHANGE_NUM_BIN_ORDER.slice(),
      seriesByGrain,
      seriesFineByGrain: hasSeg ? seriesFineByGrain : null,
      seriesLevelByGrain: null,
      seriesLevelDecByGrain: hasLevel ? seriesLevelDecByGrain : null,
      seriesLevelDecFineByGrain: (hasLevel && hasSeg) ? seriesLevelDecFineByGrain : null,
      seriesLevelFineByGrain: null,
      seriesLevelChangeByGrain: null,
      seriesLevelChangeDecByGrain: hasChangeNum ? seriesLevelChangeDecByGrain : null,
      seriesLevelChangeDecFineByGrain: (hasChangeNum && hasSeg) ? seriesLevelChangeDecFineByGrain : null,
      panel1SegmentKeys,
      panel5SegmentKeys,
      anomaliesByGrain,
      narratives,
      contributions,
      pairwise,
      weekPeriods,
      weekDayCounts,
      shortWeekMaxDays: SHORT_WEEK_MAX_DAYS,
      generatedAt: new Date().toISOString(),
    };
    result.briefByGrain = {};
    for (const grain of GRAINS) {
      result.briefByGrain[grain] = buildExecutiveBrief(result, grain);
    }
    return result;
  }

  /** Keep config order; empty/missing metricIds → all metrics. */
  function filterMetricsByIds(metrics, metricIds) {
    const list = (metrics || []).filter((m) => m && m.id);
    if (!metricIds || !metricIds.length) return list.slice();
    const want = new Set(metricIds.map(String));
    return list.filter((m) => want.has(m.id));
  }

  /**
   * Pivot: rows = period; columns = decision group × detail metrics (two-level header).
   * @param {object} result runDailyReview output
   * @param {"day"|"week"} grain
   * @param {{ groups?: string[], segmentKey?: string, segmentKeys?: string[], segmentCols?: string[], from?: string, to?: string, showMom?: boolean, metricIds?: string[] }} [opts]
   */
  function buildMetricDetailTable(result, grain, opts) {
    opts = opts || {};
    const g = normalizeGrain(grain);
    const allDetail = result?.config?.detailMetrics || result?.config?.metrics || [];
    const metrics = filterMetricsByIds(allDetail, opts.metricIds);
    const allGroups = result?.decisionGroups || [];
    let groups = (opts.groups && opts.groups.length)
      ? opts.groups.filter((x) => allGroups.includes(x))
      : allGroups.slice();
    const showMom = !!opts.showMom;
    const seriesAll = result?.seriesByGrain?.[g];
    const seriesFine = result?.seriesFineByGrain?.[g];
    const cfgSegs = result?.config?.segmentCols || [];
    const pickedSegCols = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const profitParams = resolveProfitParams(result?.config || {});
    const projected = pickedSegCols && pickedSegCols.length
      ? rollupFineBySegmentCols(
        seriesFine,
        pickedSegCols.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0),
        metrics,
        profitParams
      )
      : null;
    let wantKeys = [];
    if (Array.isArray(opts.segmentKeys) && opts.segmentKeys.length) {
      wantKeys = opts.segmentKeys.filter((k) => k && k !== "__all__");
    } else if (opts.segmentKey && opts.segmentKey !== "__all__") {
      wantKeys = [String(opts.segmentKey)];
    }
    if (projected) {
      wantKeys = wantKeys.filter((k) => projected.keys.includes(k));
    }
    const useAll = !wantKeys.length
      || !!(projected && wantKeys.length === projected.keys.length);

    const segmentKey = useAll ? "__all__" : (wantKeys.length === 1 ? wantKeys[0] : wantKeys.join(" · "));
    const segmentLabel = useAll
      ? null
      : (wantKeys.length === 1
        ? (formatSegmentShort({ segment: wantKeys[0] }) || wantKeys[0])
        : wantKeys.map((k) => formatSegmentShort({ segment: k }) || k).join("、"));

    // A/B from full decision list — not from current filter chips
    // Diff columns follow visible base metrics (hide with base when filtered)
    const diffPair = resolveDecisionAB(allGroups);
    const diffMetrics = !diffPair ? [] : appendGoldDiff(buildPivotDiffMetrics(metrics), metrics);
    const diffHint = !diffPair ? "未识别 A/B 决策组，diff 列跳过" : null;

    if (!seriesAll?.periods?.length || !metrics.length || !groups.length) {
      return {
        grain: g,
        periods: [],
        groups,
        metrics,
        showMom,
        segmentKey,
        segmentLabel,
        segmentKeys: useAll ? [] : wantKeys.slice(),
        diffPair,
        diffMetrics,
        diffHint,
        rows: [],
      };
    }

    let periods = seriesAll.periods.slice();
    // Only apply from/to when keys belong to this grain (ignore week/day keys on month, etc.)
    const from = opts.from && periods.includes(opts.from) ? opts.from : "";
    const to = opts.to && periods.includes(opts.to) ? opts.to : "";
    if (from) periods = periods.filter((p) => p >= from);
    if (to) periods = periods.filter((p) => p <= to);

    function emptyAcc() {
      const acc = Object.create(null);
      for (const m of metrics) acc[m.id] = { n: 0, d: 0, rate: null };
      return acc;
    }

    function addCellToAcc(acc, cell) {
      if (!acc || !cell) return;
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = cell.metrics?.[m.id];
        if (!src) continue;
        acc[m.id].n += src.n || 0;
        if (!isSumMetric(m)) acc[m.id].d += src.d || 0;
      }
      absorbGoldDeps(acc, cell, metrics);
    }

    function accToCell(acc) {
      const metricsMap = Object.create(null);
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        metricsMap[m.id] = { n: acc[m.id].n, d: acc[m.id].d, rate: null };
        finalizeMetricRate(metricsMap[m.id], m);
      }
      for (let i = 0; i < GOLD_DEP_IDS.length; i++) {
        const id = GOLD_DEP_IDS[i];
        if (metricsMap[id] || !acc[id]) continue;
        metricsMap[id] = { n: acc[id].n, d: acc[id].d, rate: null };
        finalizeMetricRate(metricsMap[id], { id, kind: "rate" });
      }
      applyDerivedToMetricMap(metricsMap, metricsIncludingGold(metrics), profitParams);
      return { metrics: metricsMap };
    }

    function lookupCell(period, decision) {
      if (useAll) {
        return seriesAll.cells[period + "\0" + decision] || null;
      }
      if (projected) {
        const acc = emptyAcc();
        let hit = false;
        for (const sk of wantKeys) {
          const cell = projected.cells[period + "\0" + decision + "\0" + sk];
          if (!cell) continue;
          hit = true;
          addCellToAcc(acc, cell);
        }
        return hit ? accToCell(acc) : null;
      }
      if (!seriesFine) return null;
      if (wantKeys.length === 1) {
        return seriesFine.cells[period + "\0" + decision + " | " + wantKeys[0]] || null;
      }
      const acc = emptyAcc();
      let hit = false;
      for (const sk of wantKeys) {
        const cell = seriesFine.cells[period + "\0" + decision + " | " + sk];
        if (!cell) continue;
        hit = true;
        addCellToAcc(acc, cell);
      }
      return hit ? accToCell(acc) : null;
    }

    function metricValsFromCell(cell) {
      const vals = Object.create(null);
      for (const m of metrics) {
        const slot = cell?.metrics?.[m.id];
        const mom = cell?.mom?.[m.id];
        vals[m.id] = {
          rate: slot?.rate ?? null,
          delta: useAll ? (mom?.delta ?? null) : null,
        };
      }
      putGoldOnVals(vals, readCellGoldRate(cell));
      return vals;
    }

    function accToVals(acc) {
      const vals = Object.create(null);
      for (const m of metrics) {
        const slot = { n: acc[m.id].n, d: acc[m.id].d, rate: null };
        finalizeMetricRate(slot, m);
        vals[m.id] = { rate: slot.rate, delta: null };
      }
      applyDerivedToValsMap(vals, metrics, resolveProfitParams(result?.config || {}));
      stampGoldFromDeps(vals, acc);
      return vals;
    }

    const accDecs = groups.slice();
    if (diffPair) {
      if (!accDecs.includes(diffPair.a)) accDecs.push(diffPair.a);
      if (!accDecs.includes(diffPair.b)) accDecs.push(diffPair.b);
    }
    const grand = Object.create(null);
    for (const dec of accDecs) grand[dec] = emptyAcc();

    const rows = periods.map((period) => {
      const byGroup = Object.create(null);
      for (const decision of groups) {
        const cell = lookupCell(period, decision);
        byGroup[decision] = metricValsFromCell(cell);
        addCellToAcc(grand[decision], cell);
      }
      for (const decision of accDecs) {
        if (groups.includes(decision)) continue;
        addCellToAcc(grand[decision], lookupCell(period, decision));
      }
      // Always pull A/B for diff even when filter shows only one side
      let diffVals = null;
      if (diffPair && diffMetrics.length) {
        const forDiff = Object.create(null);
        forDiff[diffPair.a] = byGroup[diffPair.a] || metricValsFromCell(lookupCell(period, diffPair.a));
        forDiff[diffPair.b] = byGroup[diffPair.b] || metricValsFromCell(lookupCell(period, diffPair.b));
        diffVals = computeDiffVals(forDiff, diffPair, diffMetrics);
      }
      return {
        rowKind: "detail",
        period,
        periodLabel: formatPeriodLabel(period, g),
        byGroup,
        diffVals,
      };
    });

    if (showMom && !useAll) {
      for (let i = 0; i < rows.length; i++) {
        const prev = i > 0 ? rows[i - 1] : null;
        if (!prev) continue;
        for (const decision of groups) {
          for (const m of metrics) {
            const cur = rows[i].byGroup[decision]?.[m.id];
            const prevRate = prev.byGroup[decision]?.[m.id]?.rate;
            if (cur && cur.rate != null && prevRate != null) cur.delta = cur.rate - prevRate;
          }
        }
      }
    }

    if (rows.length) {
      const totalBy = Object.create(null);
      for (const decision of groups) totalBy[decision] = accToVals(grand[decision]);
      let totalDiff = null;
      if (diffPair && diffMetrics.length) {
        const forDiff = Object.create(null);
        forDiff[diffPair.a] = accToVals(grand[diffPair.a] || emptyAcc());
        forDiff[diffPair.b] = accToVals(grand[diffPair.b] || emptyAcc());
        totalDiff = computeDiffVals(forDiff, diffPair, diffMetrics);
      }
      rows.push({
        rowKind: "total",
        period: null,
        periodLabel: "合计",
        byGroup: totalBy,
        diffVals: totalDiff,
      });
    }

    return {
      grain: g,
      periods,
      groups,
      metrics,
      showMom,
      segmentKey,
      segmentLabel,
      segmentKeys: useAll ? [] : wantKeys.slice(),
      diffPair,
      diffMetrics,
      diffHint,
      rows,
    };
  }

  const DETAIL_LATEST_N_DEFAULT = 5;
  const DETAIL_LATEST_N_MAX = 12;
  const PRE_LATEST_METRIC_IDS = [
    "apply_vol", "pass_rate", "credit_use_rate", "t1_credit_use_rate", "loan_amt", "ticket",
    "limit_uplift", "limit_up_share", "prev_ticket", "curr_ticket",
  ];
  const POST_LATEST_METRIC_IDS = [
    "risk", "due_cnt", "amt_risk", "due_amt", "gold_rate", "net_spread", "net_profit_risk",
    "pass_rate", "curr_ticket", "ticket", "apply_vol",
  ];

  /** Pre-table B−A level diffs (派生列，非环比). */
  const PRE_DIFF_SPECS = [
    { id: "diff_pass_rate", name: "diff通过率(B−A)", baseId: "pass_rate" },
    { id: "diff_loan_amt", name: "diff放款金额(B−A)", baseId: "loan_amt" },
    { id: "diff_credit_use_rate", name: "diff用信率(B−A)", baseId: "credit_use_rate" },
    { id: "diff_t1_credit_use_rate", name: "diffT1用信率(B−A)", baseId: "t1_credit_use_rate" },
    { id: "diff_ticket", name: "diff放款件均(B−A)", baseId: "ticket" },
    { id: "diff_curr_ticket", name: "diff授信件均(B−A)", baseId: "curr_ticket" },
    { id: "diff_prev_ticket", name: "diff上次授信件均(B−A)", baseId: "prev_ticket" },
  ];

  /** Post-table B−A level diffs (派生列，非环比). */
  const POST_DIFF_SPECS = [
    { id: "diff_risk", name: "diff订单风险(B−A)", baseId: "risk" },
    { id: "diff_amt_risk", name: "diff金额风险(B−A)", baseId: "amt_risk" },
    { id: "diff_gold_rate", name: "diff金笔率(B−A)", baseId: "gold_rate" },
    { id: "diff_net_profit_risk", name: "diff扣除风险毛利(B−A)", baseId: "net_profit_risk" },
    { id: "diff_pass_rate", name: "diff通过率(B−A)", baseId: "pass_rate" },
    { id: "diff_curr_ticket", name: "diff授信件均(B−A)", baseId: "curr_ticket" },
  ];

  /** 全期透视 B−A（与决策组筛选无关；只筛 A 或只筛 B 仍展示） */
  const PIVOT_DIFF_SPECS = [
    { id: "diff_pass_rate", name: "diff通过率(B−A)", baseId: "pass_rate" },
    { id: "diff_loan_amt", name: "diff放款金额(B−A)", baseId: "loan_amt" },
    { id: "diff_ticket", name: "diff放款件均(B−A)", baseId: "ticket" },
    { id: "diff_amt_risk", name: "diff金额风险(B−A)", baseId: "amt_risk" },
    { id: "diff_gold_rate", name: "diff金笔率(B−A)", baseId: "gold_rate" },
    { id: "diff_net_profit_risk", name: "diff扣除风险毛利(B−A)", baseId: "net_profit_risk" },
    { id: "diff_curr_ticket", name: "diff授信件均(B−A)", baseId: "curr_ticket" },
    { id: "diff_prev_ticket", name: "diff上次授信件均(B−A)", baseId: "prev_ticket" },
  ];

  function clampLatestN(n) {
    const v = Math.floor(+n);
    if (!Number.isFinite(v)) return DETAIL_LATEST_N_DEFAULT;
    return Math.max(1, Math.min(DETAIL_LATEST_N_MAX, v));
  }

  function slicePeriodWindow(periods, from, to) {
    let list = (periods || []).slice();
    if (from) list = list.filter((p) => p >= from);
    if (to) list = list.filter((p) => p <= to);
    return list;
  }

  /** Last N period keys ascending (oldest → newest among the window). */
  function pickRecentPeriodKeys(periods, n) {
    const list = (periods || []).slice().sort();
    const k = clampLatestN(n);
    return list.slice(Math.max(0, list.length - k));
  }

  function resolvePickedSegmentCols(cfgSegs, picked) {
    if (!picked) return null;
    const allow = cfgSegs || [];
    const out = [];
    const seen = Object.create(null);
    for (const c of picked) {
      if (!c || seen[c] || !allow.includes(c)) continue;
      seen[c] = true;
      out.push(c);
    }
    return out;
  }

  function rollupFineBySegmentCols(seriesFine, indices, metrics, profitParams) {
    const cells = Object.create(null);
    const srcList = (seriesFine?.points && seriesFine.points.length)
      ? seriesFine.points
      : Object.values(seriesFine?.cells || {});
    for (let i = 0; i < srcList.length; i++) {
      const pt = srcList[i];
      const parts = pt.groupParts || [];
      const decision = String(parts[0] ?? "(空)");
      const segKey = groupKey(indices.map((ix) => parts[ix + 1]));
      const period = pt.period;
      const k = period + "\0" + decision + "\0" + segKey;
      let cell = cells[k];
      if (!cell) {
        cell = cells[k] = {
          period,
          decision,
          segmentKey: segKey,
          metrics: Object.create(null),
        };
        for (const m of metrics) {
          if (isDerivedMetric(m)) continue;
          cell.metrics[m.id] = { n: 0, d: 0, rate: null };
        }
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src || !cell.metrics[m.id]) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
      absorbGoldDeps(cell.metrics, pt, metrics);
    }
    const keys = [];
    const seen = Object.create(null);
    for (const cell of Object.values(cells)) {
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        if (cell.metrics[m.id]) finalizeMetricRate(cell.metrics[m.id], m);
      }
      for (let i = 0; i < GOLD_DEP_IDS.length; i++) {
        const id = GOLD_DEP_IDS[i];
        if ((metrics || []).some((m) => m.id === id)) continue;
        if (cell.metrics[id]) finalizeMetricRate(cell.metrics[id], { id, kind: "rate" });
      }
      applyDerivedToMetricMap(cell.metrics, metricsIncludingGold(metrics), profitParams);
      if (cell.segmentKey && !seen[cell.segmentKey]) {
        seen[cell.segmentKey] = true;
        keys.push(cell.segmentKey);
      }
    }
    keys.sort((a, b) => a.localeCompare(b, "zh"));
    return { cells, keys };
  }

  /** Observed segment keys after projecting fine series onto `segmentCols`. */
  function listProjectedSegmentKeys(result, grain, segmentCols) {
    const g = normalizeGrain(grain);
    const cfgSegs = result?.config?.segmentCols || [];
    const picked = resolvePickedSegmentCols(
      cfgSegs,
      segmentCols && segmentCols.length ? segmentCols : cfgSegs
    );
    if (!picked || !picked.length) return [];
    const seriesFine = result?.seriesFineByGrain?.[g];
    const indices = picked.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0);
    const seen = Object.create(null);
    const out = [];
    const srcList = (seriesFine?.points && seriesFine.points.length)
      ? seriesFine.points
      : Object.values(seriesFine?.cells || {});
    for (let i = 0; i < srcList.length; i++) {
      const parts = srcList[i].groupParts || [];
      const key = groupKey(indices.map((ix) => parts[ix + 1]));
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    out.sort((a, b) => a.localeCompare(b, "zh"));
    return out;
  }

  function metricsByIds(allMetrics, ids) {
    const byId = Object.create(null);
    for (const m of allMetrics || []) byId[m.id] = m;
    const out = [];
    for (const id of ids || []) {
      if (byId[id]) out.push(byId[id]);
    }
    return out;
  }

  function buildPreLatestMetrics(detailMetrics) {
    return metricsByIds(detailMetrics, PRE_LATEST_METRIC_IDS).filter((m) => m.id !== "risk");
  }

  function buildPostLatestMetrics(detailMetrics) {
    return metricsByIds(detailMetrics, POST_LATEST_METRIC_IDS);
  }

  /**
   * Resolve A/B decision labels from group list (case-insensitive; optional 「组」).
   * @returns {{ a: string, b: string }|null}
   */
  function resolveDecisionAB(groups) {
    const list = (groups || []).map((g) => String(g));
    if (list.length < 2) return null;

    function norm(g) {
      return String(g).trim().toLowerCase().replace(/\s+/g, "").replace(/组$/, "");
    }
    function pick(preds) {
      for (let i = 0; i < preds.length; i++) {
        const hit = list.find((g) => preds[i](norm(g), g));
        if (hit) return hit;
      }
      return null;
    }
    const a = pick([
      (n) => n === "a" || n === "对照",
      (n) => n === "对照组" || n.startsWith("对照"),
      (n) => n === "control",
    ]);
    const b = pick([
      (n) => n === "b",
      (n) => n === "实验" || n === "实验组" || n === "处理组",
      (n) => n === "treatment" || n === "test",
    ]);
    if (a && b && a !== b) return { a, b };
    return null;
  }

  function buildDiffMetricsFromSpecs(panelMetrics, specs) {
    const byId = Object.create(null);
    for (const m of panelMetrics || []) byId[m.id] = m;
    const out = [];
    for (const spec of specs || []) {
      const base = byId[spec.baseId];
      if (!base) continue;
      out.push({
        id: spec.id,
        name: spec.name,
        baseId: spec.baseId,
        baseMetric: base,
        direction: base.direction,
        kind: "diff",
      });
    }
    return out;
  }

  function buildPreDiffMetrics(panelMetrics) {
    return buildDiffMetricsFromSpecs(panelMetrics, PRE_DIFF_SPECS);
  }

  function buildPostDiffMetrics(panelMetrics) {
    return buildDiffMetricsFromSpecs(panelMetrics, POST_DIFF_SPECS);
  }

  function buildPivotDiffMetrics(panelOrDetailMetrics) {
    return buildDiffMetricsFromSpecs(panelOrDetailMetrics, PIVOT_DIFF_SPECS);
  }

  function appendGoldDiff(diffMetrics, catalog) {
    const list = (diffMetrics || []).slice();
    if (list.some((m) => m.id === "diff_gold_rate")) return list;
    const gold = (catalog || []).find((m) => m && m.id === "gold_rate");
    if (!gold) return list;
    const spec = {
      id: "diff_gold_rate",
      name: "diff金笔率(B−A)",
      baseId: "gold_rate",
      baseMetric: gold,
      direction: gold.direction === "higher" ? "higher" : "lower",
      kind: "diff",
    };
    const at = list.findIndex((m) => m.baseId === "amt_risk");
    if (at >= 0) list.splice(at + 1, 0, spec);
    else list.push(spec);
    return list;
  }

  function computeDiffVals(byGroup, pair, diffMetrics) {
    if (!pair || !diffMetrics?.length) return null;
    const out = Object.create(null);
    for (const dm of diffMetrics) {
      const ra = byGroup?.[pair.a]?.[dm.baseId]?.rate;
      const rb = byGroup?.[pair.b]?.[dm.baseId]?.rate;
      out[dm.id] = {
        rate: (ra != null && rb != null && !isNaN(ra) && !isNaN(rb)) ? (rb - ra) : null,
        delta: null,
      };
    }
    return out;
  }

  function aggregateSlots(cells, metrics) {
    const acc = Object.create(null);
    for (const m of metrics) {
      acc[m.id] = { n: 0, d: 0, rate: null };
    }
    for (const cell of cells) {
      if (!cell) continue;
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = cell.metrics?.[m.id];
        if (!src) continue;
        acc[m.id].n += src.n || 0;
        if (!isSumMetric(m)) acc[m.id].d += src.d || 0;
      }
    }
    for (const m of metrics) finalizeMetricRate(acc[m.id], m);
    return acc;
  }

  /**
   * Period is risk-mature if risk den/rate is available under decision scope.
   * decision === "__all__" → sum across all decision groups on seriesByGrain.
   */
  function isRiskMaturePeriod(series, period, riskMetricId, decision) {
    if (!series?.cells || !riskMetricId) return false;
    if (decision && decision !== "__all__") {
      const cell = series.cells[period + "\0" + decision];
      const slot = cell?.metrics?.[riskMetricId];
      return slot != null && slot.rate != null && !isNaN(slot.rate);
    }
    let n = 0;
    let d = 0;
    const prefix = period + "\0";
    for (const key of Object.keys(series.cells)) {
      if (!key.startsWith(prefix)) continue;
      const slot = series.cells[key]?.metrics?.[riskMetricId];
      if (!slot) continue;
      n += slot.n || 0;
      d += slot.d || 0;
    }
    return d > 0;
  }

  function pickRecentRiskMaturePeriods(series, riskMetricId, n, decision) {
    const k = clampLatestN(n);
    const periods = (series?.periods || []).slice().sort();
    const picked = [];
    for (let i = periods.length - 1; i >= 0 && picked.length < k; i--) {
      const p = periods[i];
      if (isRiskMaturePeriod(series, p, riskMetricId, decision)) picked.push(p);
    }
    return picked.reverse();
  }

  /**
   * Observed Level/change_num fine keys after projecting onto `segmentCols`.
   * groupParts: [bin, decision, ...segment]
   */
  function listLevelProjectedKeys(result, grain, segmentCols, kind) {
    const g = normalizeGrain(grain);
    const cfgSegs = result?.config?.segmentCols || [];
    const picked = resolvePickedSegmentCols(
      cfgSegs,
      segmentCols && segmentCols.length ? segmentCols : cfgSegs
    );
    if (!picked || !picked.length) return [];
    const specs = kind
      ? [binnedKindSpec(kind)]
      : [binnedKindSpec("level"), binnedKindSpec("changeNum")];
    const indices = picked.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0);
    const seen = Object.create(null);
    const out = [];
    for (const spec of specs) {
      const seriesFine = result?.[spec.seriesDecFine]?.[g];
      if (!seriesFine) continue;
      const srcList = (seriesFine.points && seriesFine.points.length)
        ? seriesFine.points
        : Object.values(seriesFine.cells || {});
      for (let i = 0; i < srcList.length; i++) {
        const parts = srcList[i].groupParts || [];
        const key = groupKey(indices.map((ix) => parts[ix + 2]));
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push(key);
      }
    }
    out.sort((a, b) => a.localeCompare(b, "zh"));
    return out;
  }

  /**
   * Project level×decision(×segment) series down to level-bin series for one decision.
   * groupParts: [bin, decision, ...segment?]
   * @param {{ cfgSegs?: string[], segmentCols?: string[], segmentKeys?: string[] }} [opts]
   */
  function projectLevelByDecision(decSeries, decision, segmentKey, opts) {
    if (!decSeries || decision == null || decision === "") return null;
    opts = opts || {};
    const metrics = decSeries.metrics || [];
    const wantDec = String(decision);
    const cfgSegs = opts.cfgSegs || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const indices = (picked && picked.length)
      ? picked.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0)
      : null;
    let allow = null;
    if (Array.isArray(opts.segmentKeys) && opts.segmentKeys.length) {
      const ks = opts.segmentKeys.filter((k) => k && k !== "__all__");
      if (ks.length) allow = new Set(ks);
    } else {
      const key = segmentKey == null || segmentKey === "" ? "__all__" : String(segmentKey);
      if (key !== "__all__") allow = new Set([key]);
    }
    const cells = Object.create(null);
    const periodSet = new Set();

    for (const pt of decSeries.points || []) {
      const parts = pt.groupParts || [];
      const bin = String(parts[0] ?? LEVEL_BIN_OTHER);
      const dec = String(parts[1] ?? "(空)");
      if (dec !== wantDec) continue;
      if (allow) {
        const proj = indices && indices.length
          ? groupKey(indices.map((ix) => parts[ix + 2]))
          : groupKey(parts.slice(2));
        if (!allow.has(proj)) continue;
      }
      periodSet.add(pt.period);
      const cellKey = pt.period + "\0" + bin;
      let cell = cells[cellKey];
      if (!cell) {
        cell = cells[cellKey] = {
          period: pt.period,
          group: bin,
          groupParts: [bin],
          metrics: {},
        };
        for (const m of metrics) {
          cell.metrics[m.id] = { n: 0, d: 0, rate: null };
        }
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
    }

    const periods = Array.from(periodSet).sort();
    for (const cell of Object.values(cells)) {
      for (const m of metrics) {
        finalizeMetricRate(cell.metrics[m.id], m);
      }
    }
    if (decSeries.profitParams) {
      applyDerivedDetailMetrics({ cells, metrics }, decSeries.profitParams);
    }
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    return attachMom({
      periods,
      cells,
      points,
      grain: decSeries.grain,
      groupCols: decSeries.groupCols?.length ? [decSeries.groupCols[0]] : [],
      metrics,
      profitParams: decSeries.profitParams,
      weekDayCounts: decSeries.weekDayCounts,
      shortWeekMaxDays: decSeries.shortWeekMaxDays,
    });
  }

  /**
   * Resolve binned series for Panel5 (level) or Panel6 (changeNum).
   * @param {string} [segmentKey] legacy single key or "__all__"
   * @param {string} [decision] when set, slice to that decision group
   * @param {"level"|"changeNum"} [kind]
   * @param {{ segmentCols?: string[], segmentKeys?: string[] }} [opts]
   */
  function resolveLevelSeries(result, grain, segmentKey, decision, kind, opts) {
    opts = opts || {};
    const spec = binnedKindSpec(kind);
    const g = normalizeGrain(grain);
    const cfgSegs = result?.config?.segmentCols || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const segs = (picked && picked.length) ? picked : cfgSegs;
    let keys = [];
    if (Array.isArray(opts.segmentKeys) && opts.segmentKeys.length) {
      keys = opts.segmentKeys.filter((k) => k && k !== "__all__");
    } else if (segmentKey && segmentKey !== "__all__") {
      keys = [String(segmentKey)];
    }
    const avail = segs.length
      ? listLevelProjectedKeys(result, g, segs, spec.kind)
      : [];
    const useAll = !keys.length || (!!avail.length && keys.length === avail.length);
    if (decision != null && decision !== "") {
      const fine = result?.[spec.seriesDecFine]?.[g];
      const base = result?.[spec.seriesDec]?.[g];
      if (useAll || !fine) {
        if (!base) return null;
        return projectLevelByDecision(base, decision, "__all__");
      }
      return projectLevelByDecision(fine, decision, "__all__", {
        cfgSegs,
        segmentCols: segs,
        segmentKeys: keys,
      });
    }
    const levelAll = result?.[spec.seriesAll]?.[g];
    if (levelAll) return levelAll;
    const dec = result?.[spec.seriesDec]?.[g];
    if (!dec) return null;
    return rollupDecSeriesToBins(dec);
  }

  /** Sum a 分箱×决策组 series into 分箱合计 (no decision filter). */
  function rollupDecSeriesToBins(decSeries) {
    if (!decSeries) return null;
    const metrics = decSeries.metrics || [];
    const cells = Object.create(null);
    const periodSet = new Set();
    const pts = (decSeries.points && decSeries.points.length)
      ? decSeries.points
      : Object.values(decSeries.cells || {});
    for (const pt of pts) {
      const bin = String((pt.groupParts || [])[0] ?? "");
      if (!bin) continue;
      periodSet.add(pt.period);
      const cellKey = pt.period + "\0" + bin;
      let cell = cells[cellKey];
      if (!cell) {
        cell = cells[cellKey] = {
          period: pt.period,
          group: bin,
          groupParts: [bin],
          metrics: {},
        };
        for (const m of metrics) cell.metrics[m.id] = { n: 0, d: 0, rate: null };
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
    }
    const periods = Array.from(periodSet).sort();
    for (const cell of Object.values(cells)) {
      for (const m of metrics) finalizeMetricRate(cell.metrics[m.id], m);
    }
    if (decSeries.profitParams) applyDerivedDetailMetrics({ cells, metrics }, decSeries.profitParams);
    const points = Object.values(cells).sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });
    return attachMom({
      periods,
      cells,
      points,
      grain: decSeries.grain,
      groupCols: decSeries.groupCols?.length ? [decSeries.groupCols[0]] : [],
      metrics,
      profitParams: decSeries.profitParams,
      weekDayCounts: decSeries.weekDayCounts,
      shortWeekMaxDays: decSeries.shortWeekMaxDays,
    });
  }

  /**
   * One pass over the fine bin×decision×segment series.
   * Returns per projected segment key: { cells } keyed by period\\0bin.
   * groupParts: [bin, decision, ...segment]
   */
  function levelSplitCells(result, grain, decision, kind, opts) {
    opts = opts || {};
    const spec = binnedKindSpec(kind);
    const g = normalizeGrain(grain);
    const fine = result?.[spec.seriesDecFine]?.[g];
    if (!fine) return null;
    const cfgSegs = result?.config?.segmentCols || [];
    const picked = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const indices = (picked && picked.length)
      ? picked.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0)
      : [];
    if (!indices.length) return null;
    const allowList = (opts.segmentKeys || []).filter((k) => k && k !== "__all__" && k !== "__total__");
    if (!allowList.length) return null;
    const allow = new Set(allowList);
    const metrics = fine.metrics || [];
    const wantDec = String(decision);
    const bags = Object.create(null);
    const srcList = (fine.points && fine.points.length)
      ? fine.points
      : Object.values(fine.cells || {});
    for (let i = 0; i < srcList.length; i++) {
      const pt = srcList[i];
      const parts = pt.groupParts || [];
      if (String(parts[1] ?? "(空)") !== wantDec) continue;
      const proj = groupKey(indices.map((ix) => parts[ix + 2]));
      if (!allow.has(proj)) continue;
      const bin = String(parts[0] ?? LEVEL_BIN_OTHER);
      let bag = bags[proj];
      if (!bag) bag = bags[proj] = { cells: Object.create(null), metrics };
      const cellKey = pt.period + "\0" + bin;
      let cell = bag.cells[cellKey];
      if (!cell) {
        cell = bag.cells[cellKey] = { metrics: {} };
        for (const m of metrics) cell.metrics[m.id] = { n: 0, d: 0, rate: null };
      }
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = pt.metrics?.[m.id];
        if (!src) continue;
        cell.metrics[m.id].n += src.n || 0;
        if (!isSumMetric(m)) cell.metrics[m.id].d += src.d || 0;
      }
    }
    for (const key of Object.keys(bags)) {
      const bag = bags[key];
      for (const cell of Object.values(bag.cells)) {
        for (const m of metrics) finalizeMetricRate(cell.metrics[m.id], m);
      }
      if (fine.profitParams) applyDerivedDetailMetrics(bag, fine.profitParams);
    }
    return bags;
  }

  /**
   * Panel5 Level 贷后 table: rows = level bin → period (+小计/合计); columns = post metrics.
   * With from/to: periods = time window ∩ risk-mature (no immature rows; no N cap; empty if none).
   * Without from/to: last N risk-mature periods (legacy).
   * segmentSplits: when non-empty, also emit one column group per segment key (plus 合计).
   * @param {{ n?: number, segmentKey?: string, segmentCols?: string[], segmentKeys?: string[], segmentSplits?: string[], decision?: string, from?: string, to?: string, showMom?: boolean, metricIds?: string[], kind?: "level"|"changeNum" }} [opts]
   */
  function buildLevelPostTable(result, grain, opts) {
    opts = opts || {};
    const spec = binnedKindSpec(opts.kind);
    const g = normalizeGrain(grain);
    const n = clampLatestN(opts.n != null ? opts.n : DETAIL_LATEST_N_DEFAULT);
    const showMom = !!opts.showMom;
    const segmentKey = opts.segmentKey == null || opts.segmentKey === ""
      ? "__all__"
      : String(opts.segmentKey);
    const decision = opts.decision != null && opts.decision !== "" ? String(opts.decision) : "";
    const detailMetrics = result?.config?.detailMetrics || result?.config?.metrics || [];
    const metricsAll = levelPanelMetrics(detailMetrics);
    const metrics = filterMetricsByIds(metricsAll, opts.metricIds);
    const riskMetric = detailMetrics.find((m) => m.id === "risk")
      || (result?.config?.metrics || []).find((m) => m.id === "risk");
    const levelCol = result?.config?.[spec.colKey] || "";
    const empty = {
      grain: g,
      n,
      levelCol,
      binKind: spec.kind,
      decision,
      levels: [],
      periods: [],
      metrics,
      showMom,
      segmentKey,
      rows: [],
      emptyReason: null,
    };

    if (!levelCol) {
      return { ...empty, emptyReason: spec.needCol };
    }
    if (!decision) {
      return { ...empty, emptyReason: "need_decision" };
    }
    const series = resolveLevelSeries(result, g, segmentKey, decision, spec.kind, {
      segmentCols: opts.segmentCols,
      segmentKeys: opts.segmentKeys,
    });
    if (!series?.periods?.length) {
      return { ...empty, emptyReason: "no_series" };
    }
    if (!metrics.length) {
      return { ...empty, emptyReason: "no_metrics" };
    }
    if (!riskMetric) {
      return { ...empty, emptyReason: "no_risk_metric" };
    }

    const full = (series.periods || []).slice().sort();
    let displayPeriods;
    if (opts.from || opts.to) {
      // Same from/to compare as chart; table keeps only risk-mature rows in window
      let window = full.slice();
      if (opts.from) window = window.filter((p) => p >= opts.from);
      if (opts.to) window = window.filter((p) => p <= opts.to);
      displayPeriods = window.filter((p) => isRiskMaturePeriod(series, p, riskMetric.id, "__all__"));
    } else {
      displayPeriods = pickRecentRiskMaturePeriods(series, riskMetric.id, n, "__all__");
    }
    if (!displayPeriods.length) {
      return { ...empty, emptyReason: "no_risk_periods" };
    }

    let levels = (result[spec.keysField] || []).slice();
    if (!levels.length) levels = spec.presentBins(series);
    else levels = spec.sortBins(levels);
    if (!levels.length) {
      return { ...empty, periods: displayPeriods, emptyReason: "no_levels" };
    }

    const profitParams = resolveProfitParams(result?.config || {});

    function dueOfCell(cell) {
      const d = cell?.metrics?.risk?.d;
      if (d != null && Number.isFinite(d)) return d;
      const n = cell?.metrics?.due_cnt?.n;
      if (n != null && Number.isFinite(n)) return n;
      return null;
    }

    function metricValsFromCell(cell, prevCell) {
      const vals = Object.create(null);
      for (const m of metrics) {
        const rate = cell?.metrics?.[m.id]?.rate ?? null;
        let delta = null;
        if (showMom) {
          const prevRate = prevCell?.metrics?.[m.id]?.rate;
          if (rate != null && prevRate != null) delta = rate - prevRate;
        }
        vals[m.id] = { rate, delta };
      }
      applyDerivedToValsMap(vals, metrics, profitParams);
      vals.due = dueOfCell(cell);
      return vals;
    }

    function emptyAcc() {
      const acc = Object.create(null);
      for (const m of metrics) acc[m.id] = { n: 0, d: 0, rate: null };
      acc.due = 0;
      return acc;
    }

    function addCellToAcc(acc, cell) {
      if (!acc || !cell) return;
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = cell.metrics?.[m.id];
        if (!src) continue;
        acc[m.id].n += src.n || 0;
        if (!isSumMetric(m)) acc[m.id].d += src.d || 0;
      }
      const due = dueOfCell(cell);
      if (due != null && Number.isFinite(due)) acc.due += due;
    }

    function accToVals(acc) {
      const vals = Object.create(null);
      for (const m of metrics) {
        const slot = { n: acc[m.id].n, d: acc[m.id].d, rate: null };
        finalizeMetricRate(slot, m);
        vals[m.id] = { rate: slot.rate, delta: null };
      }
      applyDerivedToValsMap(vals, metrics, profitParams);
      vals.due = acc.due;
      return vals;
    }

    const splitKeys = Array.isArray(opts.segmentSplits)
      ? opts.segmentSplits.filter((k) => k && k !== "__all__" && k !== "__total__")
      : [];
    const splitBags = splitKeys.length
      ? (levelSplitCells(result, g, decision, spec.kind, {
          segmentCols: opts.segmentCols,
          segmentKeys: splitKeys,
        }) || Object.create(null))
      : null;
    const segmentGroups = splitBags
      ? [{ id: "__total__", label: "合计" }].concat(splitKeys.map((k) => ({
          id: k,
          label: formatSegmentShort({ segment: k }) || k,
        })))
      : null;

    function groupValsFromAcc(totalAcc, byGroup) {
      if (!byGroup) return null;
      const out = Object.create(null);
      out.__total__ = accToVals(totalAcc);
      for (const key of splitKeys) out[key] = accToVals(byGroup[key]);
      return out;
    }

    const rows = [];
    const grandAcc = emptyAcc();
    const grandByGroup = splitBags ? Object.create(null) : null;
    if (grandByGroup) {
      for (const key of splitKeys) grandByGroup[key] = emptyAcc();
    }
    for (const level of levels) {
      const levelAcc = emptyAcc();
      const levelByGroup = splitBags ? Object.create(null) : null;
      if (levelByGroup) {
        for (const key of splitKeys) levelByGroup[key] = emptyAcc();
      }
      let prevCell = null;
      const levelRows = [];
      for (const period of displayPeriods) {
        const cellKey = period + "\0" + level;
        const cell = series.cells?.[cellKey] || null;
        const vals = metricValsFromCell(cell, showMom ? prevCell : null);
        prevCell = cell;
        addCellToAcc(levelAcc, cell);
        addCellToAcc(grandAcc, cell);
        let groupVals = null;
        if (splitBags) {
          groupVals = Object.create(null);
          groupVals.__total__ = vals;
          for (const key of splitKeys) {
            const scell = splitBags[key]?.cells?.[cellKey] || null;
            groupVals[key] = metricValsFromCell(scell, null);
            addCellToAcc(levelByGroup[key], scell);
            addCellToAcc(grandByGroup[key], scell);
          }
        }
        levelRows.push({
          rowKind: "detail",
          levelKey: level,
          levelLabel: level,
          period,
          periodLabel: formatPeriodLabel(period, g),
          vals,
          groupVals,
        });
      }
      const any = levelRows.some((r) => {
        const v = r.vals || {};
        return metrics.some((m) => v[m.id]?.rate != null);
      });
      if (!any) continue;
      for (const r of levelRows) rows.push(r);
      rows.push({
        rowKind: "subtotal",
        levelKey: level,
        levelLabel: level,
        period: null,
        periodLabel: "小计",
        vals: accToVals(levelAcc),
        groupVals: groupValsFromAcc(levelAcc, levelByGroup),
      });
    }
    if (!rows.length) {
      return { ...empty, periods: displayPeriods, levels, emptyReason: "no_level_rows" };
    }
    rows.push({
      rowKind: "total",
      levelKey: "__total__",
      levelLabel: "合计",
      period: null,
      periodLabel: "合计",
      vals: accToVals(grandAcc),
      groupVals: groupValsFromAcc(grandAcc, grandByGroup),
    });

    return {
      grain: g,
      n,
      levelCol,
      binKind: spec.kind,
      decision,
      levels,
      periods: displayPeriods,
      periodLabels: displayPeriods.map((p) => formatPeriodLabel(p, g)),
      metrics,
      showMom,
      segmentKey,
      segmentGroups,
      rows,
      emptyReason: null,
    };
  }

  /**
   * Latest-performance pivot: rows = segment → period; columns = decision × metrics.
   * @param {"pre"|"post"|"all"} opts.mode  all = full detail metrics + from/to window
   * @param {string[]} [opts.groups] decision groups to show as column blocks
   * @param {string[]} [opts.metricIds] optional visible metric ids (diff follows base)
   * @param {string} [opts.from] period key (mode=all)
   * @param {string} [opts.to] period key (mode=all)
   * @param {string[]} [opts.segmentCols] subset of config.segmentCols: project + rollup unused dims
   * @param {string[]} [opts.segmentKeys] keep only these projected keys as row groups
   */
  function buildSegmentLatestTable(result, grain, opts) {
    opts = opts || {};
    const g = normalizeGrain(grain);
    const mode = opts.mode === "post" ? "post" : (opts.mode === "all" ? "all" : "pre");
    const n = clampLatestN(opts.n);
    const showMom = !!opts.showMom;
    const allGroups = result?.decisionGroups || [];
    let groups = (opts.groups && opts.groups.length)
      ? opts.groups.filter((x) => allGroups.includes(x))
      : allGroups.slice();
    const detailMetrics = result?.config?.detailMetrics || result?.config?.metrics || [];
    const metricsAll = mode === "post"
      ? buildPostLatestMetrics(detailMetrics)
      : (mode === "all" ? detailMetrics.slice() : buildPreLatestMetrics(detailMetrics));
    const metrics = filterMetricsByIds(metricsAll, opts.metricIds);
    const riskMetric = detailMetrics.find((m) => m.id === "risk")
      || (result?.config?.metrics || []).find((m) => m.id === "risk");
    const seriesAll = result?.seriesByGrain?.[g];
    const seriesFine = result?.seriesFineByGrain?.[g];
    const cfgSegs = result?.config?.segmentCols || [];
    const pickedSegCols = resolvePickedSegmentCols(cfgSegs, opts.segmentCols);
    const profitParamsEarly = resolveProfitParams(result?.config || {});
    let projectedCells = null;
    let segKeys;
    if (pickedSegCols && pickedSegCols.length) {
      const indices = pickedSegCols.map((c) => cfgSegs.indexOf(c)).filter((i) => i >= 0);
      const rolled = rollupFineBySegmentCols(seriesFine, indices, metrics, profitParamsEarly);
      projectedCells = rolled.cells;
      segKeys = rolled.keys;
    } else {
      segKeys = (result?.panel1SegmentKeys || []).filter((k) => k && k !== "__all__");
    }
    if (opts.segmentKeys && opts.segmentKeys.length) {
      const allow = new Set(opts.segmentKeys.filter((k) => k && k !== "__all__"));
      if (allow.size) {
        const filtered = segKeys.filter((k) => allow.has(k));
        if (filtered.length) segKeys = filtered;
      }
    }

    // B−A level diffs: pre / post specs; accumulate A/B even if not selected for display cols
    const diffPair = resolveDecisionAB(allGroups);
    const diffMetrics = !diffPair
      ? []
      : appendGoldDiff(
        mode === "post"
          ? buildPostDiffMetrics(metrics)
          : (mode === "all" ? buildPivotDiffMetrics(metrics) : buildPreDiffMetrics(metrics)),
        metrics
      );
    const diffHint = !diffPair
      ? "未识别 A/B 决策组，diff 列跳过"
      : null;
    const accGroups = (() => {
      const seen = Object.create(null);
      const out = [];
      function add(g) {
        if (!g || seen[g]) return;
        seen[g] = true;
        out.push(g);
      }
      for (const g of groups) add(g);
      if (diffPair) {
        add(diffPair.a);
        add(diffPair.b);
      }
      return out;
    })();

    const empty = {
      grain: g,
      mode,
      n,
      groups,
      periods: [],
      metrics,
      showMom,
      diffPair,
      diffMetrics,
      diffHint,
      rows: [],
      emptyReason: null,
    };

    if (!result?.config?.segmentCols?.length) {
      return { ...empty, emptyReason: "need_segments" };
    }
    if (!seriesFine) {
      return { ...empty, emptyReason: "need_fine_for_grain" };
    }
    if (!metrics.length) {
      return { ...empty, emptyReason: "no_metrics" };
    }
    if (!segKeys.length) {
      return { ...empty, emptyReason: "no_segment_rows" };
    }
    if (!groups.length) {
      return { ...empty, emptyReason: "no_groups" };
    }

    let periods;
    if (mode === "post") {
      if (!riskMetric) {
        return { ...empty, emptyReason: "no_risk_metric" };
      }
      // Mature if any selected decision group has risk den/rate for that period
      const periodsAll = (seriesAll?.periods || []).slice().sort();
      const mature = periodsAll.filter((p) => groups.some((dec) => isRiskMaturePeriod(seriesAll, p, riskMetric.id, dec)));
      periods = slicePeriodWindow(mature, opts.from, opts.to);
      if (!periods.length) {
        return { ...empty, emptyReason: "no_risk_periods" };
      }
    } else if (mode === "pre") {
      const list = (seriesAll?.periods || seriesFine?.periods || []).slice();
      periods = slicePeriodWindow(list, opts.from, opts.to);
      if (!periods.length) {
        return { ...empty, emptyReason: "no_periods" };
      }
    } else if (mode === "all") {
      let list = (seriesAll?.periods || seriesFine.periods || []).slice();
      const from = opts.from && list.includes(opts.from) ? opts.from : "";
      const to = opts.to && list.includes(opts.to) ? opts.to : "";
      if (from) list = list.filter((p) => p >= from);
      if (to) list = list.filter((p) => p <= to);
      periods = list;
      if (!periods.length) {
        return { ...empty, emptyReason: "no_periods" };
      }
    } else {
      periods = [];
      return { ...empty, emptyReason: "no_periods" };
    }

    function metricValsFromCell(cell, prevCell) {
      const vals = Object.create(null);
      for (const m of metrics) {
        const rate = cell?.metrics?.[m.id]?.rate ?? null;
        let delta = null;
        if (showMom) {
          const prevRate = prevCell?.metrics?.[m.id]?.rate;
          if (rate != null && prevRate != null) delta = rate - prevRate;
        }
        vals[m.id] = { rate, delta };
      }
      putGoldOnVals(vals, readCellGoldRate(cell));
      return vals;
    }

    function findFineCell(period, decision, segmentKey) {
      if (projectedCells) {
        return projectedCells[period + "\0" + decision + "\0" + segmentKey] || null;
      }
      const direct = seriesFine.cells[period + "\0" + decision + " | " + segmentKey];
      if (direct) return direct;
      const pts = seriesFine.points || [];
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (pt.period !== period) continue;
        const parts = pt.groupParts || [];
        if (String(parts[0] ?? "(空)") !== String(decision)) continue;
        if (groupKey(parts.slice(1)) !== segmentKey) continue;
        return pt;
      }
      return null;
    }

    function emptyAccByGroup() {
      const by = Object.create(null);
      for (const dec of accGroups) {
        const acc = Object.create(null);
        for (const m of metrics) acc[m.id] = { n: 0, d: 0 };
        by[dec] = acc;
      }
      return by;
    }

    function addCellToAcc(acc, cell) {
      if (!acc || !cell) return;
      for (const m of metrics) {
        if (isDerivedMetric(m)) continue;
        const src = cell.metrics?.[m.id];
        if (!src) continue;
        acc[m.id].n += src.n || 0;
        if (!isSumMetric(m)) acc[m.id].d += src.d || 0;
      }
      absorbGoldDeps(acc, cell, metrics);
    }

    function accByGroupToVals(accByGroup) {
      const profitParams = resolveProfitParams(result?.config || {});
      const byGroup = Object.create(null);
      for (const dec of accGroups) {
        const vals = Object.create(null);
        const acc = accByGroup[dec];
        for (const m of metrics) {
          const slot = { n: acc[m.id].n, d: acc[m.id].d, rate: null };
          finalizeMetricRate(slot, m);
          vals[m.id] = { rate: slot.rate, delta: null };
        }
        applyDerivedToValsMap(vals, metrics, profitParams);
        stampGoldFromDeps(vals, acc);
        byGroup[dec] = vals;
      }
      return byGroup;
    }

    const rows = [];
    const grandAcc = emptyAccByGroup();
    const periodAcc = periods.map(() => emptyAccByGroup());
    for (const segmentKey of segKeys) {
      const segmentLabel = formatSegmentShort({ segment: segmentKey }) || segmentKey;
      const segAcc = emptyAccByGroup();
      const prevCellByGroup = Object.create(null);
      for (let pi = 0; pi < periods.length; pi++) {
        const period = periods[pi];
        const byGroup = Object.create(null);
        for (const dec of accGroups) {
          const cell = findFineCell(period, dec, segmentKey);
          byGroup[dec] = metricValsFromCell(cell, showMom ? prevCellByGroup[dec] : null);
          prevCellByGroup[dec] = cell;
          addCellToAcc(segAcc[dec], cell);
          addCellToAcc(grandAcc[dec], cell);
          addCellToAcc(periodAcc[pi][dec], cell);
        }
        rows.push({
          rowKind: "detail",
          segmentKey,
          segmentLabel,
          period,
          periodLabel: formatPeriodLabel(period, g),
          byGroup,
          diffVals: computeDiffVals(byGroup, diffPair, diffMetrics),
        });
      }
      const subBy = accByGroupToVals(segAcc);
      rows.push({
        rowKind: "subtotal",
        segmentKey,
        segmentLabel,
        period: null,
        periodLabel: "小计",
        byGroup: subBy,
        diffVals: computeDiffVals(subBy, diffPair, diffMetrics),
      });
    }
    const totalBlock = [];
    let prevTotalBy = null;
    for (let pi = 0; pi < periods.length; pi++) {
      const byGroup = accByGroupToVals(periodAcc[pi]);
      if (showMom && prevTotalBy) {
        for (const dec of accGroups) {
          for (const m of metrics) {
            const cur = byGroup[dec]?.[m.id];
            const prevRate = prevTotalBy[dec]?.[m.id]?.rate;
            if (cur && cur.rate != null && prevRate != null) cur.delta = cur.rate - prevRate;
          }
        }
      }
      totalBlock.push({
        rowKind: "detail",
        segmentKey: "__total__",
        segmentLabel: "合计",
        period: periods[pi],
        periodLabel: formatPeriodLabel(periods[pi], g),
        byGroup,
        diffVals: computeDiffVals(byGroup, diffPair, diffMetrics),
      });
      prevTotalBy = byGroup;
    }
    const totalBy = accByGroupToVals(grandAcc);
    totalBlock.push({
      rowKind: "total",
      segmentKey: "__total__",
      segmentLabel: "合计",
      period: null,
      periodLabel: "小计",
      byGroup: totalBy,
      diffVals: computeDiffVals(totalBy, diffPair, diffMetrics),
    });
    rows.unshift.apply(rows, totalBlock);

    return {
      grain: g,
      mode,
      n: mode === "all" ? periods.length : n,
      from: mode === "all" ? (periods[0] || "") : undefined,
      to: mode === "all" ? (periods[periods.length - 1] || "") : undefined,
      groups,
      periods,
      periodLabels: periods.map((p) => formatPeriodLabel(p, g)),
      metrics,
      showMom,
      diffPair,
      diffMetrics,
      diffHint,
      rows,
      emptyReason: null,
    };
  }

  /** Group brief anomaly items: by decision group → worse then better → |deltaPct| desc. */
  function groupAnomalyBriefItems(items, decisionGroups) {
    const byGroup = Object.create(null);
    for (const it of items || []) {
      const g = String(it.group ?? "(空)");
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(it);
    }
    function absRel(it) {
      return it.deltaPct != null && Number.isFinite(it.deltaPct) ? Math.abs(it.deltaPct) : -1;
    }
    function sortSide(list) {
      return list.slice().sort((a, b) => absRel(b) - absRel(a));
    }
    const order = [];
    const seen = new Set();
    for (const g of decisionGroups || []) {
      if (byGroup[g]) {
        order.push(g);
        seen.add(g);
      }
    }
    for (const g of Object.keys(byGroup).sort()) {
      if (!seen.has(g)) order.push(g);
    }
    return order.map((group) => {
      const all = byGroup[group] || [];
      const worse = sortSide(all.filter((it) => it.worse));
      const better = sortSide(all.filter((it) => !it.worse));
      return { group, worse, better, items: worse.concat(better) };
    });
  }

  /**
   * Executive brief: trends by group → anomalies+attribution → flips.
   */
  function buildExecutiveBrief(result, grain) {
    const g = normalizeGrain(grain);
    const grainLab = grainLabel(g);
    const groups = result.decisionGroups || [];
    const metrics = result.config?.metrics || [];
    const series = result.seriesByGrain?.[g];
    const narratives = (result.narratives || []).filter((n) => n.grain === g);
    const anomalies = result.anomaliesByGrain?.[g] || [];
    const contribs = result.contributions?.[g] || [];
    const pwNarr = result.pairwise?.[g]?.narratives || [];

    const trendItems = [];
    const shortWeekTips = [];
    for (const group of groups) {
      const parts = [];
      for (const m of metrics) {
        if (m.id === "gold_rate" || m.direction === "none") continue;
        const n = narratives.find((x) => x.group === group && x.metricId === m.id);
        let snap = null;
        if (!n && series) snap = latestMetricSnapshot(series, group, m.id);
        else if (n && series && n.shortWeekSkipped == null) snap = latestMetricSnapshot(series, group, m.id);
        const delta = n ? n.delta : snap?.delta;
        if (delta == null) continue;
        const rate = n ? n.rate : snap?.rate;
        const prevRate = n ? n.prevRate : snap?.prevRate;
        const period = n?.period ?? snap?.period;
        const prevPeriod = n?.prevPeriod ?? snap?.prevPeriod;
        const shortWeekSkipped = !!(n?.shortWeekSkipped ?? snap?.shortWeekSkipped);
        const skippedPeriod = n?.skippedPeriod ?? snap?.skippedPeriod ?? null;
        const skippedRate = n?.skippedRate ?? snap?.skippedRate;
        const skippedDayCount = n?.skippedDayCount ?? snap?.skippedDayCount;
        const shortWeekNote = n?.shortWeekNote || formatShortWeekNote({
          shortWeekSkipped, skippedPeriod, skippedDayCount,
        }, g);
        if (shortWeekSkipped && shortWeekTips.length < 1) {
          const banner = formatShortWeekBanner({
            shortWeekSkipped, skippedPeriod, skippedDayCount,
          }, g);
          if (banner) shortWeekTips.push(banner);
        }
        const deltaPct = n?.deltaPct ?? (
          (delta != null && prevRate != null && Math.abs(prevRate) > 1e-12)
            ? delta / Math.abs(prevRate)
            : null
        );
        const worse = n ? n.worse : isWorseDelta(delta, m.direction);
        const sentiment = n?.sentiment || sentimentLabel(delta, m.direction);
        const relTxt = formatRelDelta(delta, prevRate);
        const line =
          `${m.name} ${formatDelta(delta, m)}` +
          (relTxt ? `（相对 ${relTxt}）` : "") +
          `（${formatRate(prevRate, m)}→${formatRate(rate, m)}，${sentiment}）`;
        parts.push({
          metricId: m.id,
          metricName: m.name,
          delta,
          deltaPct,
          rate,
          prevRate,
          period,
          prevPeriod,
          worse,
          sentiment,
          shortWeekSkipped,
          skippedPeriod,
          skippedRate,
          skippedDayCount,
          shortWeekNote,
          text: line,
        });
      }
      if (parts.length) {
        trendItems.push({
          group,
          text: `${group}：${parts.map((p) => p.text).join("；")}`,
          metrics: parts,
          worseCount: parts.filter((p) => p.worse).length,
        });
      }
    }

    const anomalyItems = [];
    const seen = new Set();
    for (const an of anomalies) {
      if (!isContribMetricId(an.metricId)) continue;
      const key = an.group + "\0" + an.metricId;
      if (seen.has(key)) continue;
      seen.add(key);
      const metric = metrics.find((m) => m.id === an.metricId) || { name: an.metricName, id: an.metricId };
      const c = contribs.find((it) => it.decisionGroup === an.group && it.metricId === an.metricId);
      const deltaTxt = formatDelta(an.delta, metric);
      const relTxt = formatRelDelta(an.delta, an.prevRate);
      let text = `${an.group} · ${an.metricName} ${deltaTxt}`;
      if (relTxt) text += `（相对 ${relTxt}）`;
      let attribution = null;
      if (c?.topSegments?.[0]) {
        const top = c.topSegments[0];
        const short = c.topSegmentShort || formatSegmentShort(top, c.segmentCols || []);
        const contribTxt = formatContribDelta(top.contrib_total, metric);
        const pctTxt = top.contrib_pct != null ? top.contrib_pct.toFixed(1) + "%" : "—";
        attribution = { segmentShort: short, contrib: top.contrib_total, contribPct: top.contrib_pct };
        text += ` → 主因 ${short} · 贡献 ${contribTxt}（${pctTxt}）`;
      } else if (c?.narrativeSub) {
        text += ` → ${c.narrativeSub.replace(/^主因\s*/, "主因 ")}`;
      } else {
        text += "（未分解到客群）";
      }
      anomalyItems.push({
        group: an.group,
        metricId: an.metricId,
        metricName: an.metricName,
        delta: an.delta,
        deltaPct: an.deltaPct,
        period: an.period,
        prevPeriod: an.prevPeriod,
        worse: an.worse,
        shortWeekNote: an.shortWeekNote || c?.shortWeekNote || null,
        attribution,
        text,
      });
    }

    const flipItems = pwNarr.map((n) => ({
      segment: n.segment,
      metricId: n.metricId,
      text: n.text,
    }));

    const emptyTrend = !trendItems.length
      ? `暂无${grainLab}环比走势（需至少两期有值）。`
      : null;
    const emptyAnomaly = !anomalyItems.length
      ? `本期无超过相对差阈值的${grainLab}异动。`
      : null;
    const emptyFlip = !flipItems.length
      ? "未检测到历史优势近期翻转。"
      : null;

    let periodCtx = collectBriefPeriodContext(trendItems, g, metrics);
    if (shortWeekTips.length) {
      if (!periodCtx) periodCtx = { rows: [], tip: "", shortWeekTips: shortWeekTips.slice() };
      // 短周说明已在各指标 tip 行写清；横幅单独展示，不再追加到 tip 底部
      periodCtx.shortWeekTips = shortWeekTips.slice();
    }
    return {
      grain: g,
      grainLabel: grainLab,
      periodContext: periodCtx,
      periodContextRows: periodCtx ? periodCtx.rows : null,
      shortWeekTips: shortWeekTips.slice(),
      trend: { items: trendItems, empty: emptyTrend },
      anomalies: {
        items: anomalyItems,
        groups: groupAnomalyBriefItems(anomalyItems, groups),
        empty: emptyAnomaly,
      },
      flips: { items: flipItems, empty: emptyFlip },
    };
  }

  function canonLevelValue(label) {
    if (label === "-1" || label === "21") return label;
    if (label === "19-20") return "19";
    const m = /^(\d+)-\d+$/.exec(label || "");
    return m ? m[1] : "";
  }

  function canonChangeValue(label) {
    if (label === "≤-4") return "-4";
    if (label === "≥5") return "5";
    if (label === "-3" || label === "-2" || label === "-1" || label === "0" || label === "1" || label === "2" || label === "3" || label === "4") return label;
    return "";
  }

  /** 日 × 决策组 × 客群取值 × Level 分箱 × level_change 分箱。分子分母相加，供导出后筛选。 */
  function compactDailyRows(rows, config) {
    const cfg = config || {};
    const timeCol = cfg.timeCol || "";
    const decisionCol = cfg.decisionCol || "";
    const levelCol = cfg.levelCol || "";
    const changeCol = cfg.levelChangeNumCol || "";
    const segCols = cfg.segmentCols || [];
    const headers = cfg.headers || [];
    const metrics = (cfg.metrics || []).concat(defaultDetailExtraMetrics(headers));
    const sumCols = [];
    const seen = Object.create(null);
    function addCol(col) {
      if (!col || seen[col]) return;
      seen[col] = true;
      sumCols.push(col);
    }
    metrics.forEach((m) => {
      if (isDerivedMetric(m)) return;
      addCol(m.numCol);
      if (!isSumMetric(m)) addCol(m.denCol);
    });
    const groups = Object.create(null);
    const order = [];
    for (let i = 0; i < (rows || []).length; i++) {
      const row = rows[i];
      const day = bucketTime(rowVal(row, timeCol), "day");
      if (!day) continue;
      const decision = decisionCol ? String(rowVal(row, decisionCol) == null ? "" : rowVal(row, decisionCol)).trim() : "";
      const segs = segCols.map((col) => String(rowVal(row, col) == null ? "" : rowVal(row, col)).trim());
      const level = levelCol ? levelBinLabel(rowVal(row, levelCol)) : "";
      const change = changeCol ? changeNumBinLabel(rowVal(row, changeCol)) : "";
      const key = [day, decision, level, change].concat(segs).join("\0");
      let group = groups[key];
      if (!group) {
        group = groups[key] = { day: day, decision: decision, segs: segs, level: level, change: change, sums: Object.create(null) };
        order.push(group);
      }
      for (let c = 0; c < sumCols.length; c++) {
        const col = sumCols[c];
        const n = parseNum(rowVal(row, col));
        if (n == null || isNaN(n)) continue;
        group.sums[col] = (group.sums[col] || 0) + n;
      }
    }
    return order.map((group) => {
      const out = {};
      if (timeCol) out[timeCol] = group.day;
      if (decisionCol) out[decisionCol] = group.decision;
      segCols.forEach((col, i) => { out[col] = group.segs[i]; });
      if (levelCol) out[levelCol] = canonLevelValue(group.level);
      if (changeCol) out[changeCol] = canonChangeValue(group.change);
      sumCols.forEach((col) => {
        out[col] = group.sums[col] == null ? "" : String(group.sums[col]);
      });
      return out;
    });
  }

  Object.assign(target, {
    DEFAULT_METRICS,
    DETAIL_EXTRA_METRICS,
    DEFAULT_THRESHOLDS,
    SHORT_WEEK_MAX_DAYS,
    DEFAULT_PROFIT_PARAMS,
    GRAINS,
    normalizeGrain,
    grainLabel,
    defaultMetrics,
    mergeMissingDefaultMetrics,
    defaultDetailExtraMetrics,
    buildDetailMetrics,
    normalizeMetric,
    isSumMetric,
    isDerivedMetric,
    resolveProfitParams,
    metricHeaderLabel,
    parseDateLike,
    weekMonday,
    bucketTime,
    formatPeriodLabel,
    latestMetricSnapshot,
    metricSnapshotAt,
    defaultCmpPeriodForMetrics,
    isOrderRiskMetric,
    isAmtRiskMetric,
    isGoldRateMetric,
    isPostLoanMetric,
    isPreLoanMetric,
    countWeekDistinctDays,
    formatShortWeekNote,
    formatShortWeekBanner,
    guessTimeCol,
    guessLevelCol,
    guessChangeNumCol,
    LEVEL_BIN_ORDER,
    LEVEL_BIN_OTHER,
    levelBinLabel,
    CHANGE_NUM_BIN_ORDER,
    CHANGE_NUM_BIN_OTHER,
    changeNumBinLabel,
    sortLevelBins,
    sortChangeNumBins,
    presentLevelBins,
    presentChangeNumBins,
    aggregateMetricSeries,
    attachMom,
    projectDecisionSeries,
    projectLevelByDecision,
    resolveLevelSeries,
    listLevelProjectedKeys,
    listPanel1SegmentKeys,
    listPanel5SegmentKeys,
    listLevelKeys,
    detectAnomalies,
    buildDecisionGroupNarratives,
    buildContributionPanel,
    rebuildContributionPanel,
    ensureContributionPanel,
    rollupContribItemToCols,
    listContribMetrics,
    isContribMetricId,
    CONTRIB_METRIC_IDS,
    contribRowProjectKey,
    listContribProjectedKeys,
    buildSegmentPairwiseCompare,
    pairwiseHistoryForPair,
    projectDecisionSeriesByKeys,
    rebuildSegmentPairwiseCompare,
    ensureSegmentPairwiseCompare,
    rollupPairwiseCompare,
    listPairwiseProjectedKeys,
    buildExecutiveBrief,
    compactDailyRows,
    filterMetricsByIds,
    buildMetricDetailTable,
    listProjectedSegmentKeys,
    buildSegmentLatestTable,
    buildLevelPostTable,
    levelPanelMetrics,
    buildPreLatestMetrics,
    buildPostLatestMetrics,
    buildPreDiffMetrics,
    buildPostDiffMetrics,
    buildPivotDiffMetrics,
    resolveDecisionAB,
    computeDiffVals,
    PRE_DIFF_SPECS,
    POST_DIFF_SPECS,
    PIVOT_DIFF_SPECS,
    pickRecentPeriodKeys,
    slicePeriodWindow,
    isRiskMaturePeriod,
    pickRecentRiskMaturePeriods,
    clampLatestN,
    DETAIL_LATEST_N_DEFAULT,
    DETAIL_LATEST_N_MAX,
    takeRecentPeriods,
    filterRowsToWeekWindow,
    resolveWeekWindow,
    rebuildSeriesPoints,
    hydrateDailyReviewSeries,
    groupAnomalyBriefItems,
    listDecisionGroups,
    validateConfig,
    runDailyReview,
    formatDelta,
    formatContribDelta,
    formatRelDelta,
    formatPeriodRange,
    formatSegmentShort,
    isRateLikeMetric,
    formatRate,
    isWorseDelta,
    sentimentLabel,
  });
})(window.RV);
