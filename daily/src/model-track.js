/**
 * 重点数据跟踪：分周 KS/AUC/IV、评级监控与等频分箱。
 * 在用模型名单默认空。之后可在运行前赋值：
 *   RV.domain.modelTrack.inUseModelCols = ["p3_..."];
 * 或设置 window.DR_IN_USE_MODELS（非空时优先）。
 */
(function (RV) {
  "use strict";

  const inUseModelCols = [];
  const N_BINS = 5;
  const TOP_UNUSED = 5;
  const IV_EPS = 1e-6;

  function getInUseModelCols(headers) {
    const ext = typeof window !== "undefined" ? window.DR_IN_USE_MODELS : null;
    const raw = Array.isArray(ext) && ext.length ? ext : inUseModelCols;
    const known = new Set(headers || []);
    const out = [];
    const seen = Object.create(null);
    for (const col of raw) {
      const name = String(col || "");
      if (!name || seen[name] || (known.size && !known.has(name))) continue;
      seen[name] = true;
      out.push(name);
    }
    return out;
  }

  function listModelCols(headers) {
    return (headers || []).filter((h) => /^(p1_|p3_|p4_)/.test(h));
  }

  function listGradeCols(headers) {
    return (headers || []).filter((h) => /^grade_/.test(String(h || "")));
  }

  function sortEnums(list) {
    return list.slice().sort((a, b) => {
      if (a === "（空）" && b !== "（空）") return -1;
      if (b === "（空）" && a !== "（空）") return 1;
      const an = numOf(a);
      const bn = numOf(b);
      if (an != null && bn != null && an !== bn) return an - bn;
      return String(a).localeCompare(String(b), "zh");
    });
  }

  function normDec(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function resolveSides(groups) {
    const list = (groups || []).map((g) => String(g));
    const find = (pred) => list.find((g) => pred(normDec(g))) || "";
    let a = find((d) => d === "a组" || d === "a" || d === "对照组");
    let b = find((d) => d === "b组" || d === "b" || d === "实验组");
    const rest = list.filter((g) => g !== a && g !== b);
    if (!a) a = rest.shift() || "";
    if (!b) b = rest.shift() || "";
    return {
      a: { id: "a", label: a || "左", value: a },
      b: { id: "b", label: b || "右", value: b },
    };
  }

  function sideIdOf(raw, sides) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    if (sides.a.value && text === sides.a.value) return "a";
    if (sides.b.value && text === sides.b.value) return "b";
    const d = normDec(text);
    if (d === normDec(sides.a.value)) return "a";
    if (d === normDec(sides.b.value)) return "b";
    return "";
  }

  function discrimination(ys, ss) {
    const n = ys.length;
    const empty = { ks: null, auc: null, iv: null, n };
    if (n < 2) return empty;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((i, j) => ss[i] - ss[j] || i - j);
    let nBad = 0;
    let nGood = 0;
    for (let k = 0; k < n; k++) {
      if (ys[idx[k]] === 1) nBad++;
      else nGood++;
    }
    if (!nBad || !nGood) return empty;
    let rankSumBad = 0;
    for (let i = 0; i < n;) {
      let j = i + 1;
      const score = ss[idx[i]];
      while (j < n && ss[idx[j]] === score) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) {
        if (ys[idx[k]] === 1) rankSumBad += avgRank;
      }
      i = j;
    }
    const auc = (rankSumBad - (nBad * (nBad + 1)) / 2) / (nBad * nGood);
    let cumPos = 0;
    let cumNeg = 0;
    let ks = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (ys[idx[i]] === 1) cumPos++;
      else cumNeg++;
      const diff = Math.abs(cumPos / nBad - cumNeg / nGood);
      if (diff > ks) ks = diff;
    }
    let iv = null;
    const nBins = N_BINS;
    if (n >= nBins * 2) {
      const bins = [];
      for (let b = 0; b < nBins; b++) bins.push({ bad: 0, good: 0 });
      for (let r = 0; r < n; r++) {
        const bi = Math.min(nBins - 1, Math.floor((r * nBins) / n));
        if (ys[idx[r]] === 1) bins[bi].bad++;
        else bins[bi].good++;
      }
      const minBad = Math.max(20, Math.floor(nBad / (nBins * 2)));
      const minGood = Math.max(200, Math.floor(nGood / (nBins * 2)));
      let changed = true;
      while (changed && bins.length > 1) {
        changed = false;
        for (let i = 0; i < bins.length; i++) {
          const b = bins[i];
          if (b.bad >= minBad && b.good >= minGood) continue;
          const target = bins[i < bins.length - 1 ? i + 1 : i - 1];
          target.bad += b.bad;
          target.good += b.good;
          bins.splice(i, 1);
          changed = true;
          break;
        }
      }
      let sum = 0;
      for (const b of bins) {
        const badDist = b.bad / nBad;
        const goodDist = b.good / nGood;
        const woe = Math.log((badDist + IV_EPS) / (goodDist + IV_EPS));
        sum += (badDist - goodDist) * woe;
      }
      iv = sum;
    }
    return { ks, auc, iv, n };
  }

  function emptyBag() {
    return { ys: [], ss: [] };
  }

  function pushBag(bag, y, score) {
    bag.ys.push(y);
    bag.ss.push(score);
  }

  function concatBags(bags) {
    const ys = [];
    const ss = [];
    for (const bag of bags) {
      if (!bag) continue;
      for (let i = 0; i < bag.ys.length; i++) {
        ys.push(bag.ys[i]);
        ss.push(bag.ss[i]);
      }
    }
    return { ys, ss };
  }

  function numOf(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * @param {object[]} rows
   * @param {{ timeCol: string, decisionCol: string, weekPeriods: string[], decisionGroups: string[], headers: string[] }} opts
   */
  function buildModelTrack(rows, opts) {
    opts = opts || {};
    const headers = opts.headers || [];
    const modelCols = listModelCols(headers);
    const inUse = getInUseModelCols(headers).filter((c) => modelCols.includes(c));
    const sides = resolveSides(opts.decisionGroups);
    const weeks = (opts.weekPeriods || []).slice().sort();
    const weekSet = new Set(weeks);
    const timeCol = opts.timeCol || "";
    const decisionCol = opts.decisionCol || "";
    const bucket = RV.domain.dailyReview && RV.domain.dailyReview.bucketTime;
    const infra = RV.infra;

    const byCol = Object.create(null);
    for (const col of modelCols) {
      byCol[col] = { a: Object.create(null), b: Object.create(null) };
    }

    const dueRows = [];
    for (let i = 0; i < (rows || []).length; i++) {
      const row = rows[i];
      const fm = numOf(infra.rowVal(row, "fpd1_cnt_fm"));
      if (!(fm > 0)) continue;
      const week = bucket ? bucket(infra.rowVal(row, timeCol), "week") : null;
      if (!week || !weekSet.has(week)) continue;
      const side = sideIdOf(infra.rowVal(row, decisionCol), sides);
      if (side !== "a" && side !== "b") continue;
      const fz = numOf(infra.rowVal(row, "fpd1_cnt_fz"));
      const y = fz != null && fz > 0 ? 1 : 0;
      dueRows.push(row);
      for (const col of modelCols) {
        const score = numOf(infra.rowVal(row, col));
        if (score == null) continue;
        const sideMap = byCol[col][side];
        let bag = sideMap[week];
        if (!bag) bag = sideMap[week] = emptyBag();
        pushBag(bag, y, score);
      }
    }

    function metricsFor(col, side, week) {
      const bag = week
        ? byCol[col][side][week]
        : concatBags(weeks.map((w) => byCol[col][side][w]));
      if (!bag) return discrimination([], []);
      return discrimination(bag.ys, bag.ss);
    }

    const ranked = modelCols.map((col) => {
      const all = concatBags([
        concatBags(weeks.map((w) => byCol[col].a[w])),
        concatBags(weeks.map((w) => byCol[col].b[w])),
      ]);
      const met = discrimination(all.ys, all.ss);
      return { col, ks: met.ks, n: met.n };
    });
    ranked.sort((x, y) => {
      const xk = x.ks == null ? -1 : x.ks;
      const yk = y.ks == null ? -1 : y.ks;
      if (yk !== xk) return yk - xk;
      return x.col < y.col ? -1 : x.col > y.col ? 1 : 0;
    });

    const inUseSet = new Set(inUse);
    const unusedTop = [];
    for (const item of ranked) {
      if (inUseSet.has(item.col)) continue;
      unusedTop.push(item.col);
      if (unusedTop.length >= TOP_UNUSED) break;
    }
    const binCols = inUse.concat(unusedTop);

    const bins = Object.create(null);
    for (const col of binCols) {
      const rule = infra.buildEqualFreqBinRule(dueRows, col, N_BINS);
      const labels = (rule.intervals || []).map((it) => it.label).filter(Boolean);
      const cells = { a: Object.create(null), b: Object.create(null) };
      for (const side of ["a", "b"]) {
        for (const week of weeks) cells[side][week] = Object.create(null);
      }
      for (const row of dueRows) {
        const week = bucket(infra.rowVal(row, timeCol), "week");
        const side = sideIdOf(infra.rowVal(row, decisionCol), sides);
        if (!cells[side] || !cells[side][week]) continue;
        const label = infra.getBinnedLabel(infra.rowVal(row, col), rule);
        if (!labels.includes(label)) continue;
        const slot = cells[side][week];
        let cell = slot[label];
        if (!cell) cell = slot[label] = { bad: 0, due: 0 };
        cell.due += 1;
        const fz = numOf(infra.rowVal(row, "fpd1_cnt_fz"));
        if (fz != null && fz > 0) cell.bad += 1;
      }
      bins[col] = { labels, cells };
    }

    const gradeCols = listGradeCols(headers);
    const grades = Object.create(null);
    for (const col of gradeCols) {
      const seen = Object.create(null);
      const cells = { a: Object.create(null), b: Object.create(null) };
      for (const side of ["a", "b"]) {
        for (const week of weeks) cells[side][week] = Object.create(null);
      }
      for (const row of dueRows) {
        const week = bucket(infra.rowVal(row, timeCol), "week");
        const side = sideIdOf(infra.rowVal(row, decisionCol), sides);
        if (!cells[side] || !cells[side][week]) continue;
        const raw = infra.rowVal(row, col);
        const text = String(raw == null ? "" : raw).trim();
        const label = text ? text : "（空）";
        seen[label] = true;
        const slot = cells[side][week];
        let cell = slot[label];
        if (!cell) cell = slot[label] = { bad: 0, due: 0 };
        cell.due += 1;
        const fz = numOf(infra.rowVal(row, "fpd1_cnt_fz"));
        if (fz != null && fz > 0) cell.bad += 1;
      }
      grades[col] = { labels: sortEnums(Object.keys(seen)), cells };
    }

    const models = ranked.map((item) => {
      const sidesMet = {};
      for (const side of ["a", "b"]) {
        const byWeek = Object.create(null);
        for (const week of weeks) byWeek[week] = metricsFor(item.col, side, week);
        sidesMet[side] = { all: metricsFor(item.col, side, ""), byWeek };
      }
      return { col: item.col, ks: item.ks, n: item.n, sides: sidesMet };
    });

    return {
      sides,
      weeks,
      models,
      inUse,
      unusedTop,
      binCols,
      bins,
      gradeCols,
      grades,
      nDue: dueRows.length,
    };
  }

  RV.domain = RV.domain || {};
  RV.domain.modelTrack = {
    inUseModelCols,
    N_BINS,
    TOP_UNUSED,
    getInUseModelCols,
    listModelCols,
    listGradeCols,
    resolveSides,
    buildModelTrack,
  };
})(window.RV);
