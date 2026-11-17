(function (RV) {
  "use strict";
  var domain = RV.domain = RV.domain || {};
  var target = domain.profitability = domain.profitability || {};

  const DEFAULT_PARAMS = {
    principal: 10000,
    totalRepayRatePct: 148,
    overdueRatePct: 30,
    recoveryRatePct: 20,
    fundCostRatePct: 12,
    termMonths: 3,
    cac: 200,
    collectionCostRatePct: 10,
  };

  const COMPARE_METRICS = [
    { key: "expectedCollection", label: "预期回款", type: "money" },
    { key: "grossProfit", label: "产品毛利", type: "money" },
    { key: "grossMargin", label: "产品毛利率", type: "pct" },
    { key: "netProfit", label: "产品净利润", type: "money" },
    { key: "netMargin", label: "产品净利率", type: "pct" },
    { key: "roi", label: "本金回报率", type: "pct" },
    { key: "breakEvenOverdueRate", label: "盈亏平衡逾期率", type: "pct", nullable: true },
  ];

  function pctToDecimal(pct) {
    return pct / 100;
  }

  function validate(params) {
    const errors = [];
    const {
      principal, totalRepayRatePct, overdueRatePct, recoveryRatePct,
      fundCostRatePct, termMonths, cac, collectionCostRatePct,
    } = params;

    if ([principal, totalRepayRatePct, overdueRatePct, recoveryRatePct,
      fundCostRatePct, termMonths, cac, collectionCostRatePct].some((v) => v === null || v === undefined || Number.isNaN(v))) {
      errors.push("请填写所有参数");
    }
    if (principal != null && principal < 0) errors.push("本金不能为负数");
    if (totalRepayRatePct != null && totalRepayRatePct <= 0) errors.push("总应还率须大于 0");
    if (totalRepayRatePct != null && totalRepayRatePct <= 100) errors.push("总应还率须大于 100%（否则无息费收入）");
    if (overdueRatePct != null && (overdueRatePct < 0 || overdueRatePct > 100)) errors.push("逾期率须在 0% ~ 100% 之间");
    if (recoveryRatePct != null && (recoveryRatePct < 0 || recoveryRatePct > 100)) errors.push("逾期回收率须在 0% ~ 100% 之间");
    if (fundCostRatePct != null && (fundCostRatePct < 0 || fundCostRatePct > 100)) errors.push("资金成本率须在 0% ~ 100% 之间");
    if (termMonths != null && termMonths < 0) errors.push("贷款期限不能为负数");
    if (cac != null && cac < 0) errors.push("获客成本不能为负数");
    if (collectionCostRatePct != null && (collectionCostRatePct < 0 || collectionCostRatePct > 100)) {
      errors.push("催收成本率须在 0% ~ 100% 之间");
    }
    return errors;
  }

  function calculate(params) {
    const principal = params.principal;
    const totalRepay = principal * pctToDecimal(params.totalRepayRatePct);
    const overdueRate = pctToDecimal(params.overdueRatePct);
    const recoveryRate = pctToDecimal(params.recoveryRatePct);
    const fundCostRate = pctToDecimal(params.fundCostRatePct);
    const termMonths = params.termMonths;
    const cac = params.cac;
    const collectionCostRate = pctToDecimal(params.collectionCostRatePct);

    const interestFee = totalRepay - principal;
    const overdueAmount = totalRepay * overdueRate;
    const normalRepay = totalRepay - overdueAmount;
    const overdueRecovery = overdueAmount * recoveryRate;
    const overdueLoss = overdueAmount * (1 - recoveryRate);
    const expectedCollection = totalRepay * (1 - overdueRate * (1 - recoveryRate));
    const grossProfit = expectedCollection - principal;

    const fundCost = principal * fundCostRate * (termMonths / 12);
    const collectionCost = overdueAmount * collectionCostRate;
    const totalCost = fundCost + cac + collectionCost;
    const netProfit = grossProfit - totalCost;

    const roi = principal > 0 ? (grossProfit / principal) * 100 : 0;
    const grossMargin = interestFee > 0 ? (grossProfit / interestFee) * 100 : 0;
    const netMargin = principal > 0 ? (netProfit / principal) * 100 : 0;
    const effectiveLossRate = overdueRate * (1 - recoveryRate) * 100;

    let breakEvenOverdueRate = null;
    if (totalRepay > 0 && recoveryRate < 1) {
      breakEvenOverdueRate = ((1 - principal / totalRepay) / (1 - recoveryRate)) * 100;
    }

    return {
      totalRepay,
      interestFee,
      overdueAmount,
      normalRepay,
      overdueRecovery,
      overdueLoss,
      expectedCollection,
      grossProfit,
      fundCost,
      cac,
      collectionCost,
      totalCost,
      netProfit,
      roi,
      grossMargin,
      netMargin,
      effectiveLossRate,
      breakEvenOverdueRate,
    };
  }

  function grossMarginAtOverdueRate(params, overdueRatePct) {
    return calculate({ ...params, overdueRatePct }).grossMargin;
  }

  function buildCurveData(params) {
    const points = [];
    for (let od = 0; od <= 100; od += 0.5) {
      points.push({ x: od, y: grossMarginAtOverdueRate(params, od) });
    }
    return points;
  }

  Object.assign(target, {
    DEFAULT_PARAMS,
    COMPARE_METRICS,
    validate,
    calculate,
    grossMarginAtOverdueRate,
    buildCurveData,
  });
})(window.RV);
