(function (RV) {
  "use strict";
  var domain = RV.domain = RV.domain || {};
  var target = domain.riskTarget = domain.riskTarget || {};

  const SCENARIO_MULTIPLES = "multiples";
  const SCENARIO_KNOWN_SWAPOUT = "knownSwapout";

  const DEFAULT_PARAMS = {
    scenario: SCENARIO_MULTIPLES,
    orders: 10000,
    riskPct: 5,
    overdue: 500,
    targetRiskPct: 4.5,
    swapoutMultiple: 2,
    swapinMultiple: 1.3,
    swapoutRiskPct: 8,
  };

  const EPS = 1e-9;

  function pctToDecimal(pct) {
    return pct / 100;
  }

  function resolveOverdue(params) {
    const orders = params.orders;
    if (params.overdue != null && !Number.isNaN(params.overdue)) return params.overdue;
    if (orders != null && params.riskPct != null && !Number.isNaN(params.riskPct)) {
      return orders * pctToDecimal(params.riskPct);
    }
    return NaN;
  }

  function resolveRiskPct(params) {
    const orders = params.orders;
    const overdue = resolveOverdue(params);
    if (orders > 0 && overdue != null && !Number.isNaN(overdue)) {
      return (overdue / orders) * 100;
    }
    if (params.riskPct != null && !Number.isNaN(params.riskPct)) return params.riskPct;
    return NaN;
  }

  function resolveScenario(params) {
    return params.scenario === SCENARIO_KNOWN_SWAPOUT
      ? SCENARIO_KNOWN_SWAPOUT
      : SCENARIO_MULTIPLES;
  }

  function validate(params) {
    const errors = [];
    const scenario = resolveScenario(params);
    const {
      orders, targetRiskPct, swapoutMultiple, swapinMultiple, swapoutRiskPct,
    } = params;
    const overdue = resolveOverdue(params);
    const riskPct = resolveRiskPct(params);

    const base = [orders, overdue, riskPct, targetRiskPct, swapinMultiple];
    if (scenario === SCENARIO_MULTIPLES) base.push(swapoutMultiple);
    else base.push(swapoutRiskPct);

    if (base.some((v) => v === null || v === undefined || Number.isNaN(v))) {
      errors.push("请填写所有参数");
      return errors;
    }
    if (orders <= 0) errors.push("现状订单数须大于 0");
    if (overdue < 0) errors.push("现状逾期订单数不能为负");
    if (overdue > orders + EPS) errors.push("现状逾期订单数不能大于订单数");
    if (riskPct < 0 || riskPct > 100) errors.push("现状风险须在 0% ~ 100% 之间");
    if (targetRiskPct < 0 || targetRiskPct > 100) errors.push("目标风险须在 0% ~ 100% 之间");
    if (swapinMultiple <= 0) errors.push("swapin/inin 倍数须大于 0");
    if (scenario === SCENARIO_MULTIPLES) {
      if (swapoutMultiple <= 0) errors.push("swapout/inin 倍数须大于 0");
    } else if (swapoutRiskPct < 0 || swapoutRiskPct > 100) {
      errors.push("swapout 风险须在 0% ~ 100% 之间");
    }
    return errors;
  }

  function fail(reason, extra) {
    return Object.assign({ ok: false, failReason: reason }, extra || {});
  }

  function finalizePacks(N, D, Rstar, k, N_in, R_in, R_out, currentRiskPct, meta) {
    const N_out = N - N_in;
    const N_si = N_out;
    if (!(N_in > EPS && N_in < N - EPS) || !(N_out > EPS)) {
      return fail("在当前约束下无法达到目标风险（拆包订单数无合理解）", {
        currentRiskPct, N_in, N_out,
      });
    }

    const R_si = k * R_in;
    const D_in = R_in * N_in;
    const D_out = R_out * N_out;
    const D_si = R_si * N_si;

    const risks = [R_in, R_out, R_si];
    if (risks.some((r) => !Number.isFinite(r) || r < -EPS || r > 1 + EPS)) {
      return fail("在当前约束下无法达到目标风险（算出的风险超出 0%~100%）", {
        currentRiskPct, N_in, N_out, R_in, R_out, R_si,
      });
    }
    if ([D_in, D_out, D_si].some((d) => !Number.isFinite(d) || d < -EPS)) {
      return fail("在当前约束下无法达到目标风险（逾期订单数为负）", { currentRiskPct });
    }

    const afterOverdue = D_in + D_si;
    const afterRiskPct = (afterOverdue / N) * 100;
    if (Math.abs(afterRiskPct - meta.targetRiskPct) > 1e-3) {
      // numerical drift guard — still accept if very close; else fail
      if (Math.abs(afterRiskPct - meta.targetRiskPct) > 0.05) {
        return fail("在当前约束下无法达到目标风险（达标校验失败）", { currentRiskPct });
      }
    }

    return {
      ok: true,
      failReason: null,
      scenario: meta.scenario,
      currentOrders: N,
      currentOverdue: D,
      currentRiskPct,
      targetRiskPct: meta.targetRiskPct,
      swapoutMultiple: meta.swapoutMultiple,
      swapinMultiple: k,
      swapoutRiskPct: R_out * 100,
      inin: { orders: N_in, overdue: D_in, riskPct: R_in * 100 },
      swapout: { orders: N_out, overdue: D_out, riskPct: R_out * 100 },
      swapin: { orders: N_si, overdue: D_si, riskPct: R_si * 100 },
      after: { orders: N, overdue: afterOverdue, riskPct: afterRiskPct },
    };
  }

  /**
   * Scenario A: R_out = m * R_in, R_si = k * R_in, equal volume.
   * Closed form for N_in.
   */
  function calculateMultiples(params) {
    const N = params.orders;
    const D = resolveOverdue(params);
    const Rstar = pctToDecimal(params.targetRiskPct);
    const m = params.swapoutMultiple;
    const k = params.swapinMultiple;
    const currentRiskPct = resolveRiskPct(params);

    const denom = Rstar * N * (1 - m) - D * (1 - k);
    const numer = N * (D * k - Rstar * m * N);

    if (!Number.isFinite(denom) || Math.abs(denom) < EPS) {
      return fail("在当前倍数下无法达到目标风险（方程分母为 0）", { currentRiskPct });
    }

    const N_in = numer / denom;
    const N_out = N - N_in;
    const weight = N_in + m * N_out;
    if (!(weight > EPS)) {
      return fail("在当前倍数下无法达到目标风险（inin 风险分母无效）", { currentRiskPct });
    }
    const R_in = D / weight;
    const R_out = m * R_in;

    return finalizePacks(N, D, Rstar, k, N_in, R_in, R_out, currentRiskPct, {
      scenario: SCENARIO_MULTIPLES,
      targetRiskPct: params.targetRiskPct,
      swapoutMultiple: m,
    });
  }

  /**
   * Scenario B: R_out known, R_si = k * R_in, equal volume.
   * Quadratic in R_in; pick the feasible root.
   */
  function calculateKnownSwapout(params) {
    const N = params.orders;
    const D = resolveOverdue(params);
    const Rstar = pctToDecimal(params.targetRiskPct);
    const k = params.swapinMultiple;
    const R_out = pctToDecimal(params.swapoutRiskPct);
    const currentRiskPct = resolveRiskPct(params);

    // a x^2 + b x + c = 0 for x = R_in
    const a = k * N;
    const b = -k * N * R_out + (1 - k) * D - (1 - k) * R_out * N - Rstar * N;
    const c = Rstar * N * R_out;

    const candidates = [];
    if (Math.abs(a) < EPS) {
      // linear: b x + c = 0
      if (Math.abs(b) < EPS) {
        return fail("在当前约束下无法达到目标风险（方程退化）", { currentRiskPct });
      }
      candidates.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -EPS) {
        return fail("在当前约束下无法达到目标风险（无实数解）", { currentRiskPct });
      }
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      candidates.push((-b + sqrtDisc) / (2 * a));
      candidates.push((-b - sqrtDisc) / (2 * a));
    }

    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const R_in = candidates[i];
      if (!Number.isFinite(R_in)) continue;
      if (Math.abs(R_in - R_out) < EPS) continue;
      const N_in = (D - R_out * N) / (R_in - R_out);
      const packed = finalizePacks(N, D, Rstar, k, N_in, R_in, R_out, currentRiskPct, {
        scenario: SCENARIO_KNOWN_SWAPOUT,
        targetRiskPct: params.targetRiskPct,
        swapoutMultiple: R_in > EPS ? R_out / R_in : null,
      });
      if (packed.ok) results.push(packed);
    }

    if (!results.length) {
      return fail("在当前约束下无法达到目标风险（无可行拆包）", {
        currentRiskPct,
        candidateRisks: candidates.map((x) => x * 100),
      });
    }
    // Prefer the root whose implied after-risk is closest to target; else first.
    results.sort((u, v) =>
      Math.abs(u.after.riskPct - params.targetRiskPct) - Math.abs(v.after.riskPct - params.targetRiskPct)
    );
    return results[0];
  }

  function calculate(params) {
    const scenario = resolveScenario(params);
    if (scenario === SCENARIO_KNOWN_SWAPOUT) return calculateKnownSwapout(params);
    return calculateMultiples(params);
  }

  Object.assign(target, {
    SCENARIO_MULTIPLES,
    SCENARIO_KNOWN_SWAPOUT,
    DEFAULT_PARAMS,
    validate,
    calculate,
    calculateMultiples,
    calculateKnownSwapout,
    resolveOverdue,
    resolveRiskPct,
    resolveScenario,
  });
})(window.RV);
