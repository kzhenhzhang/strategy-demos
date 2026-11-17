/**
 * 资产包 EL 调配（domain）
 * 固定人数占比/用信率，在相对变动与同向约束下调整通过率、件均、金额风险。
 */
(function (RV) {
  "use strict";
  var domain = RV.domain = RV.domain || {};
  var target = domain.elAllocator = domain.elAllocator || {};

  const DEFAULT_PACKAGES = [
    { name: "资产包1", risk: 0.3242, share: 0.3486, pass: 0.6965, ticket: 11530, util: 0.6520 },
    { name: "资产包2", risk: 0.3750, share: 0.1238, pass: 0.0870, ticket: 9139, util: 0.7132 },
    { name: "资产包3", risk: 0.2310, share: 0.4508, pass: 0.8906, ticket: 16166, util: 0.6704 },
    { name: "资产包4", risk: 0.2727, share: 0.0768, pass: 0.0660, ticket: 10966, util: 0.6094 },
  ];

  const DEFAULT_OPTS = {
    targetEl: 0.24,
    relMax: 0.05,
    gridN: 5,
    objective: "min", // min | target
    algo: "auto", // auto | grid | descent
    restarts: 24,
    couplePR: true,
    coupleAR: true,
    riskOnlyDown: false,
  };

  function clip(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function linspace(min, max, n) {
    if (n <= 1) return [0];
    const out = [];
    for (let i = 0; i < n; i++) out.push(min + (max - min) * i / (n - 1));
    return out;
  }

  function* product(lists) {
    if (!lists.length) {
      yield [];
      return;
    }
    const [head, ...tail] = lists;
    for (const h of head) {
      for (const rest of product(tail)) yield [h, ...rest];
    }
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function normalizePackage(p, idx) {
    return {
      name: String(p.name || `资产包${idx + 1}`),
      risk: Number(p.risk),
      share: Number(p.share),
      pass: Number(p.pass),
      ticket: Number(p.ticket),
      util: Number(p.util),
    };
  }

  function validatePackages(packages) {
    const errors = [];
    if (!Array.isArray(packages) || packages.length < 2) {
      errors.push("至少需要 2 个资产包");
      return errors;
    }
    packages.forEach((raw, i) => {
      const p = normalizePackage(raw, i);
      if (!(p.risk > 0 && p.pass > 0 && p.ticket > 0 && p.util > 0)) {
        errors.push(`第 ${i + 1} 行：风险/通过率/件均/用信率须为正`);
      }
      if (!(p.share >= 0)) errors.push(`第 ${i + 1} 行：人数占比不能为负`);
    });
    return errors;
  }

  function packFromTheta(base, tp, ta, tr) {
    const n = base.length;
    const p = new Array(n);
    const a = new Array(n);
    const r = new Array(n);
    const V = new Array(n);
    let sumV = 0;
    for (let i = 0; i < n; i++) {
      p[i] = base[i].pass * (1 + tp[i]);
      a[i] = base[i].ticket * (1 + ta[i]);
      r[i] = base[i].risk * (1 + tr[i]);
      V[i] = base[i].share * p[i] * base[i].util * a[i];
      sumV += V[i];
    }
    if (!(sumV > 0)) return null;
    const w = V.map((v) => v / sumV);
    let el = 0;
    for (let i = 0; i < n; i++) el += w[i] * r[i];
    return { p, a, r, w, el, V };
  }

  function feasibleTrBounds(tp, ta, opts) {
    let lo = -opts.relMax;
    let hi = opts.riskOnlyDown ? 0 : opts.relMax;
    if (opts.couplePR) {
      if (tp > 1e-12) lo = Math.max(lo, 0);
      else if (tp < -1e-12) hi = Math.min(hi, 0);
    }
    if (opts.coupleAR) {
      if (ta > 1e-12) lo = Math.max(lo, 0);
      else if (ta < -1e-12) hi = Math.min(hi, 0);
    }
    if (lo > hi + 1e-12) return null;
    return [lo, hi];
  }

  function chooseTr(base, tp, ta, opts) {
    const n = base.length;
    const bounds = [];
    for (let i = 0; i < n; i++) {
      const b = feasibleTrBounds(tp[i], ta[i], opts);
      if (!b) return null;
      bounds.push(b);
    }
    const tr = bounds.map(([lo]) => lo);
    if (opts.objective !== "target") return tr;

    let packed = packFromTheta(base, tp, ta, tr);
    if (!packed) return null;
    if (packed.el >= opts.targetEl - 1e-15) return tr;

    for (let pass = 0; pass < n * 8; pass++) {
      packed = packFromTheta(base, tp, ta, tr);
      if (!packed || packed.el >= opts.targetEl - 1e-15) break;
      let bestI = -1;
      let bestEff = -1;
      for (let i = 0; i < n; i++) {
        if (bounds[i][1] - tr[i] <= 1e-15) continue;
        const impact = packed.w[i] * base[i].risk;
        if (impact > bestEff) {
          bestEff = impact;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      const need = opts.targetEl - packed.el;
      const impact = packed.w[bestI] * base[bestI].risk;
      const step = Math.min(bounds[bestI][1] - tr[bestI], need / Math.max(impact, 1e-12));
      tr[bestI] += step;
    }
    return tr;
  }

  function scoreOf(packed, tp, ta, tr, opts) {
    if (!packed) return null;
    const effort = tp.reduce((s, x, i) => s + x * x + ta[i] * ta[i] + tr[i] * tr[i], 0);
    const score = opts.objective === "target"
      ? (packed.el - opts.targetEl) ** 2
      : packed.el;
    return { score, effort, key: [score, effort] };
  }

  function better(a, b) {
    if (!b) return true;
    if (!a) return false;
    return a.key[0] < b.key[0] - 1e-15 ||
      (Math.abs(a.key[0] - b.key[0]) <= 1e-15 && a.key[1] < b.key[1]);
  }

  function evaluateCandidate(base, tp, ta, opts, bestRef) {
    const tr = chooseTr(base, tp, ta, opts);
    bestRef.checked++;
    if (!tr) return;
    const packed = packFromTheta(base, tp, ta, tr);
    const sc = scoreOf(packed, tp, ta, tr, opts);
    if (!sc) return;
    const cand = { key: sc.key, tp: tp.slice(), ta: ta.slice(), tr: tr.slice(), ...packed };
    if (better(cand, bestRef.best)) bestRef.best = cand;
  }

  function estimateGridCombos(n, gridN) {
    return Math.pow(gridN, 2 * n);
  }

  function optimizeGrid(base, opts, bestRef) {
    const n = base.length;
    const grid = linspace(-opts.relMax, opts.relMax, opts.gridN);
    const lists = Array.from({ length: 2 * n }, () => grid);
    for (const choice of product(lists)) {
      evaluateCandidate(base, choice.slice(0, n), choice.slice(n), opts, bestRef);
    }
  }

  function heuristicStarts(base, opts) {
    const n = base.length;
    const d = opts.relMax;
    const zeros = () => Array(n).fill(0);
    const starts = [];
    starts.push({ tp: zeros(), ta: zeros() });

    const order = base.map((b, i) => [b.risk, i]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    const tpA = zeros();
    const taA = zeros();
    const cutCount = Math.max(1, Math.floor(n / 2));
    for (let k = 0; k < cutCount; k++) {
      tpA[order[k]] = -d;
      taA[order[k]] = -d;
    }
    starts.push({ tp: tpA, ta: taA });

    const tpB = Array(n).fill(-d);
    const taB = Array(n).fill(-d);
    const low = order[order.length - 1];
    tpB[low] = 0;
    taB[low] = 0;
    starts.push({ tp: tpB, ta: taB });
    starts.push({ tp: Array(n).fill(-d), ta: Array(n).fill(-d) });

    const tpC = zeros();
    const taC = zeros();
    for (let rank = 0; rank < n; rank++) {
      const i = order[rank];
      const t = -d * (n - rank) / n;
      tpC[i] = t;
      taC[i] = t;
    }
    starts.push({ tp: tpC, ta: taC });
    return starts;
  }

  function randomStart(n, relMax, rng) {
    const tp = Array(n);
    const ta = Array(n);
    for (let i = 0; i < n; i++) {
      tp[i] = (rng() * 2 - 1) * relMax;
      ta[i] = (rng() * 2 - 1) * relMax;
    }
    return { tp, ta };
  }

  function coordinateDescent(base, opts, start, bestRef) {
    const n = base.length;
    const grid = linspace(-opts.relMax, opts.relMax, opts.gridN);
    const stepSet = new Set(grid.map((x) => +x.toFixed(8)));
    [-opts.relMax, 0, opts.relMax].forEach((x) => stepSet.add(+x.toFixed(8)));
    const fine = opts.relMax / Math.max(opts.gridN - 1, 1);
    for (let k = 1; k <= 6; k++) {
      const step = +(k * fine).toFixed(8);
      if (Math.abs(step) <= opts.relMax + 1e-12) {
        stepSet.add(step);
        stepSet.add(-step);
      }
    }
    const deltas = [...stepSet].sort((a, b) => a - b);

    let tp = start.tp.map((x) => clip(x, -opts.relMax, opts.relMax));
    let ta = start.ta.map((x) => clip(x, -opts.relMax, opts.relMax));
    evaluateCandidate(base, tp, ta, opts, bestRef);

    let improved = true;
    let rounds = 0;
    while (improved && rounds < 50) {
      improved = false;
      rounds++;
      for (let kind = 0; kind < 2; kind++) {
        for (let i = 0; i < n; i++) {
          const curVal = kind === 0 ? tp[i] : ta[i];
          let bestLocal = null;
          const probes = new Set();
          for (const d of deltas) {
            // absolute candidates already in [-relMax, relMax]
            probes.add(+clip(d, -opts.relMax, opts.relMax).toFixed(8));
            // relative nudges from current value
            probes.add(+clip(curVal + d, -opts.relMax, opts.relMax).toFixed(8));
          }
          probes.add(+clip(curVal, -opts.relMax, opts.relMax).toFixed(8));
          for (const val of probes) {
            const clipped = clip(val, -opts.relMax, opts.relMax);
            const tp2 = tp.slice();
            const ta2 = ta.slice();
            if (kind === 0) tp2[i] = clipped;
            else ta2[i] = clipped;
            const tr = chooseTr(base, tp2, ta2, opts);
            bestRef.checked++;
            if (!tr) continue;
            const packed = packFromTheta(base, tp2, ta2, tr);
            const sc = scoreOf(packed, tp2, ta2, tr, opts);
            if (!sc) continue;
            const cand = { key: sc.key, tp: tp2, ta: ta2, tr: tr.slice(), ...packed };
            if (better(cand, bestRef.best)) bestRef.best = cand;
            if (!bestLocal || better(cand, { key: bestLocal.key })) {
              bestLocal = { val: clipped, tp: tp2, ta: ta2, key: sc.key };
            }
          }
          if (bestLocal && Math.abs(bestLocal.val - curVal) > 1e-12) {
            tp = bestLocal.tp;
            ta = bestLocal.ta;
            improved = true;
          }
        }
      }
    }
  }

  function optimizeDescent(base, opts, bestRef) {
    const n = base.length;
    const rng = mulberry32(42 + n * 17 + opts.gridN);
    const starts = heuristicStarts(base, opts);
    while (starts.length < opts.restarts) {
      starts.push(randomStart(n, opts.relMax, rng));
    }
    for (let s = 0; s < opts.restarts; s++) {
      coordinateDescent(base, opts, starts[s] || randomStart(n, opts.relMax, rng), bestRef);
    }
  }

  function currentState(base) {
    const zeros = base.map(() => 0);
    return packFromTheta(base, zeros, zeros, zeros);
  }

  /**
   * @param {Array} packages decimal rates
   * @param {object} userOpts
   */
  function optimize(packages, userOpts) {
    const errors = validatePackages(packages);
    if (errors.length) {
      return { ok: false, errors, best: null, current: null };
    }
    const base = packages.map(normalizePackage);
    const opts = { ...DEFAULT_OPTS, ...(userOpts || {}) };
    opts.relMax = Number(opts.relMax);
    opts.targetEl = Number(opts.targetEl);
    opts.gridN = Math.max(3, Number(opts.gridN) || 5);
    opts.restarts = Math.max(4, Number(opts.restarts) || 24);

    const combos = estimateGridCombos(base.length, opts.gridN);
    const GRID_LIMIT = 600000;
    let mode = opts.algo;
    if (mode === "auto") mode = combos <= GRID_LIMIT ? "grid" : "descent";
    if (mode === "grid" && combos > 5e6) mode = "descent";

    const bestRef = { best: null, checked: 0 };
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (mode === "grid") optimizeGrid(base, opts, bestRef);
    else optimizeDescent(base, opts, bestRef);
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const current = currentState(base);
    if (!bestRef.best || !current) {
      return { ok: false, errors: ["无可行解，请放松约束"], best: null, current };
    }

    return {
      ok: true,
      errors: [],
      current,
      best: bestRef.best,
      checked: bestRef.checked,
      algoUsed: mode,
      ms: t1 - t0,
      combosEstimate: combos,
      opts,
      base,
    };
  }

  Object.assign(target, {
    DEFAULT_PACKAGES,
    DEFAULT_OPTS,
    validatePackages,
    packFromTheta,
    currentState,
    optimize,
  });
})(window.RV);
