/**
 * 准入策略监控的计算。界面在 src/strategy-monitor-ui.js。
 * rej_ 列 1 = 拒绝。空值和 0 合并成枚举 0，表上展示为 0。
 */
(function (RV) {
  "use strict";

  const METRICS = [
    { id: "risk", name: "订单风险", kind: "rate" },
    { id: "amt_risk", name: "金额风险", kind: "rate" },
    { id: "gold_rate", name: "金笔率", kind: "ratio" },
    { id: "due_cnt", name: "到期单量", kind: "sum" },
    { id: "due_amt", name: "到期金额", kind: "wan" },
  ];
  const STATUS_METRICS = [
    { id: "apply", name: "进件量", kind: "sum" },
    { id: "pass_rate", name: "通过率", kind: "rate" },
    { id: "ticket", name: "授信件均", kind: "num" },
    { id: "risk", name: "订单风险", kind: "rate" },
    { id: "amt_risk", name: "金额风险", kind: "rate" },
    { id: "use_rate", name: "用信率", kind: "rate" },
    { id: "t1_use_rate", name: "T1用信率", kind: "rate" },
  ];
  const TRAFFIC_COL = "策略版本";

  function infra() {
    return RV.infra;
  }

  function strOf(v) {
    return String(v == null ? "" : v).trim();
  }

  function isPassZeroCol(col) {
    const name = String(col || "");
    return /^rej_/i.test(name) || /_rej$/i.test(name) || name === "hard_rej";
  }

  function rejKey(value) {
    const text = strOf(value);
    if (!text) return "0";
    const n = infra().parseNum(text);
    if (n === 0) return "0";
    if (n === 1) return "1";
    return text;
  }

  function normalizeEnums(enums) {
    const out = Object.create(null);
    Object.keys(enums || {}).forEach((col) => {
      const seen = Object.create(null);
      const list = [];
      (enums[col] || []).forEach((value) => {
        const key = rejKey(value);
        if (seen[key]) return;
        seen[key] = true;
        list.push(key);
      });
      out[col] = sortValues(list);
    });
    return out;
  }

  function numOf(v) {
    const n = infra().parseNum(v);
    return n == null || !Number.isFinite(n) ? 0 : n;
  }

  function emptyBag() {
    return { fz: 0, fm: 0, afz: 0, afm: 0, n: 0, apply: 0 };
  }

  function addBag(bag, rec) {
    bag.fz += rec.fz;
    bag.fm += rec.fm;
    bag.afz += rec.afz;
    bag.afm += rec.afm;
    bag.n += 1;
    bag.apply += rec.apply;
  }

  function sumBags(bags) {
    const out = emptyBag();
    let any = false;
    (bags || []).forEach((bag) => {
      if (!bag || !bag.n) return;
      out.fz += bag.fz;
      out.fm += bag.fm;
      out.afz += bag.afz;
      out.afm += bag.afm;
      out.n += bag.n;
      out.apply += bag.apply;
      any = true;
    });
    return any ? out : null;
  }

  function metricValue(bag, id) {
    if (!bag || !bag.n) return null;
    if (id === "risk") return bag.fm > 0 ? bag.fz / bag.fm : null;
    if (id === "amt_risk") return bag.afm > 0 ? bag.afz / bag.afm : null;
    if (id === "gold_rate") {
      const risk = bag.fm > 0 ? bag.fz / bag.fm : null;
      const amt = bag.afm > 0 ? bag.afz / bag.afm : null;
      if (risk == null || amt == null || !(risk > 0)) return null;
      return amt / risk;
    }
    if (id === "due_cnt") return bag.fm;
    if (id === "due_amt") return bag.afm / 10000;
    return null;
  }

  function normDec(value) {
    return strOf(value).toLowerCase();
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
    const text = strOf(raw);
    if (!text) return "";
    if (sides.a.value && text === sides.a.value) return "a";
    if (sides.b.value && text === sides.b.value) return "b";
    return "";
  }

  function sortValues(list) {
    return list.slice().sort((a, b) => {
      const an = infra().parseNum(a);
      const bn = infra().parseNum(b);
      if (an != null && bn != null && an !== bn) return an - bn;
      return String(a).localeCompare(String(b), "zh");
    });
  }

  function inWeek(week, from, to) {
    if (!week) return false;
    if (from && week < from) return false;
    if (to && week > to) return false;
    return true;
  }

  function segPass(raw, filters) {
    if (!filters || !filters.length) return true;
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      if (!f || !f.values || !f.values.length) continue;
      if (f.values.indexOf(strOf(infra().rowVal(raw, f.col))) < 0) return false;
    }
    return true;
  }

  function prepare(rows, opts) {
    const headers = opts.headers || [];
    const timeCol = opts.timeCol;
    const decisionCol = opts.decisionCol;
    const bucket = RV.domain.dailyReview && RV.domain.dailyReview.bucketTime;
    const weekSet = Object.create(null);
    (opts.weekPeriods || []).forEach((w) => { weekSet[w] = true; });
    const sides = resolveSides(opts.decisionGroups || []);
    const rejCols = headers.filter((h) => /^rej_/.test(h));
    const rejEnums = Object.create(null);
    rejCols.forEach((c) => { rejEnums[c] = Object.create(null); });
    const decisions = [];
    const decisionSeen = Object.create(null);
    (opts.decisionGroups || []).forEach((g) => {
      const name = String(g);
      if (decisionSeen[name]) return;
      decisionSeen[name] = true;
      decisions.push(name);
    });
    const trafficSeen = Object.create(null);
    const recs = [];
    const list = rows || [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const week = bucket ? bucket(infra().rowVal(row, timeCol), "week") : null;
      if (!week || !weekSet[week]) continue;
      const decision = strOf(infra().rowVal(row, decisionCol));
      if (decision && !decisionSeen[decision]) {
        decisionSeen[decision] = true;
        decisions.push(decision);
      }
      const traffic = strOf(infra().rowVal(row, TRAFFIC_COL));
      trafficSeen[traffic] = true;
      const rej = [];
      for (let c = 0; c < rejCols.length; c++) {
        const value = rejKey(infra().rowVal(row, rejCols[c]));
        rej.push(value);
        rejEnums[rejCols[c]][value] = true;
      }
      recs.push({
        i,
        week,
        side: sideIdOf(decision, sides),
        decision,
        traffic,
        rej,
        fz: numOf(infra().rowVal(row, "fpd1_cnt_fz")),
        fm: numOf(infra().rowVal(row, "fpd1_cnt_fm")),
        afz: numOf(infra().rowVal(row, "fpd1_amt_fz")),
        afm: numOf(infra().rowVal(row, "fpd1_amt_fm")),
        apply: infra().getApplyVol ? infra().getApplyVol(row) : 1,
        pass: infra().getPassVol ? infra().getPassVol(row) : numOf(infra().rowVal(row, "通过量")),
        credit: numOf(infra().rowVal(row, "本次额度")),
        loan: numOf(infra().rowVal(row, "放款订单数")),
        t1: numOf(infra().rowVal(row, "T1_放款订单数")),
        n: 1,
      });
    }
    const enums = Object.create(null);
    rejCols.forEach((c) => { enums[c] = sortValues(Object.keys(rejEnums[c])); });
    const weeks = (opts.weekPeriods || []).filter((w) => weekSet[w]);
    return {
      raw: list,
      recs,
      weeks,
      sides,
      rejCols,
      enums,
      decisions,
      traffics: sortValues(Object.keys(trafficSeen)),
      headers: headers.slice(),
    };
  }

  function listColumnValues(ctx, col, from, to) {
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!inWeek(rec.week, from, to)) continue;
      const value = strOf(infra().rowVal(ctx.raw[rec.i], col));
      if (seen[value]) continue;
      seen[value] = true;
      out.push(value);
    }
    return sortValues(out);
  }

  function bagAt(root, key) {
    let bag = root[key];
    if (!bag) bag = root[key] = emptyBag();
    return bag;
  }

  function replay(ctx, spec) {
    const cols = (spec.rejCols || []).filter((c) => ctx.rejCols.indexOf(c) >= 0);
    const sides = { a: Object.create(null), b: Object.create(null) };
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (rec.side !== "a" && rec.side !== "b") continue;
      if (!inWeek(rec.week, spec.weekFrom, spec.weekTo)) continue;
      if (!segPass(ctx.raw[rec.i], spec.segFilters)) continue;
      let byWeek = sides[rec.side][rec.week];
      if (!byWeek) byWeek = sides[rec.side][rec.week] = Object.create(null);
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const idx = ctx.rejCols.indexOf(col);
        let byCol = byWeek[col];
        if (!byCol) byCol = byWeek[col] = Object.create(null);
        addBag(bagAt(byCol, rec.rej[idx]), rec);
      }
    }
    const enums = Object.create(null);
    cols.forEach((c) => { enums[c] = ctx.enums[c] || []; });
    return { cols, enums, sides };
  }

  function activeValues(selected, all) {
    if (!selected || !selected.length) return all.slice();
    const keep = selected.filter((v) => all.indexOf(v) >= 0);
    return keep.length ? keep : all.slice();
  }

  function emptyStatus() {
    return { fz: 0, fm: 0, afz: 0, afm: 0, n: 0, apply: 0, pass: 0, credit: 0, loan: 0, t1: 0 };
  }

  function addStatus(bag, rec) {
    bag.fz += rec.fz || 0;
    bag.fm += rec.fm || 0;
    bag.afz += rec.afz || 0;
    bag.afm += rec.afm || 0;
    bag.apply += rec.apply || 0;
    bag.pass += rec.pass || 0;
    bag.credit += rec.credit || 0;
    bag.loan += rec.loan || 0;
    bag.t1 += rec.t1 || 0;
    bag.n += rec.n > 0 ? rec.n : 1;
  }

  function sumStatus(bags) {
    const out = emptyStatus();
    let any = false;
    (bags || []).forEach((bag) => {
      if (!bag || !bag.n) return;
      addStatus(out, bag);
      any = true;
    });
    return any ? out : null;
  }

  function statusValue(bag, id) {
    if (!bag || !bag.n) return null;
    if (id === "apply") return bag.apply;
    if (id === "pass_rate") return bag.apply > 0 ? bag.pass / bag.apply : null;
    if (id === "ticket") return bag.pass > 0 ? bag.credit / bag.pass : null;
    if (id === "risk") return bag.fm > 0 ? bag.fz / bag.fm : null;
    if (id === "amt_risk") return bag.afm > 0 ? bag.afz / bag.afm : null;
    if (id === "use_rate") return bag.pass > 0 ? bag.loan / bag.pass : null;
    if (id === "t1_use_rate") return bag.pass > 0 ? bag.t1 / bag.pass : null;
    return null;
  }

  function versionStatus(ctx, spec) {
    const weeks = (ctx.weeks || []).filter((w) => inWeek(w, spec.weekFrom, spec.weekTo));
    const byPair = Object.create(null);
    const seen = Object.create(null);
    const pairs = [];
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!inWeek(rec.week, spec.weekFrom, spec.weekTo)) continue;
      if (!segPass(ctx.raw[rec.i], spec.segFilters)) continue;
      const decision = rec.decision;
      const version = rec.traffic;
      const key = decision + "\0" + version;
      if (!seen[key]) {
        seen[key] = true;
        pairs.push({ decision: decision, version: version });
      }
      let byWeek = byPair[key];
      if (!byWeek) byWeek = byPair[key] = Object.create(null);
      let bag = byWeek[rec.week];
      if (!bag) bag = byWeek[rec.week] = emptyStatus();
      addStatus(bag, rec);
    }
    const decOrder = ctx.decisions || [];
    pairs.sort((a, b) => {
      let ai = decOrder.indexOf(a.decision);
      let bi = decOrder.indexOf(b.decision);
      if (ai < 0) ai = decOrder.length;
      if (bi < 0) bi = decOrder.length;
      if (ai !== bi) return ai - bi;
      if (a.version === b.version) return 0;
      return sortValues([a.version, b.version])[0] === a.version ? -1 : 1;
    });
    return { weeks: weeks, pairs: pairs, byPair: byPair };
  }

  function trafficsFor(ctx, decisions) {
    const seen = Object.create(null);
    const useAll = !decisions || !decisions.length;
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!useAll && decisions.indexOf(rec.decision) < 0) continue;
      seen[rec.traffic] = true;
    }
    return sortValues(Object.keys(seen));
  }

  function cross(ctx, spec) {
    const ia = ctx.rejCols.indexOf(spec.rejA);
    const ib = ctx.rejCols.indexOf(spec.rejB);
    const enumsA = ia >= 0 ? (ctx.enums[spec.rejA] || []) : [];
    const enumsB = ib >= 0 ? (ctx.enums[spec.rejB] || []) : [];
    const pairs = [];
    for (let a = 0; a < enumsA.length; a++) {
      for (let b = 0; b < enumsB.length; b++) pairs.push([enumsA[a], enumsB[b]]);
    }
    const panes = {};
    (spec.panes || []).forEach((pane) => {
      const decisions = activeValues(pane.decisions, ctx.decisions);
      const traffics = activeValues(pane.traffics, trafficsFor(ctx, decisions));
      const byWeek = Object.create(null);
      panes[pane.id] = { decisions, traffics, byWeek };
    });
    if (ia < 0 || ib < 0) return { pairs, panes, rejA: spec.rejA, rejB: spec.rejB };
    const paneList = spec.panes || [];
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!inWeek(rec.week, spec.weekFrom, spec.weekTo)) continue;
      if (!segPass(ctx.raw[rec.i], spec.segFilters)) continue;
      const key = rec.rej[ia] + "\0" + rec.rej[ib];
      for (let p = 0; p < paneList.length; p++) {
        const pane = panes[paneList[p].id];
        if (pane.decisions.indexOf(rec.decision) < 0) continue;
        if (pane.traffics.indexOf(rec.traffic) < 0) continue;
        let slot = pane.byWeek[rec.week];
        if (!slot) slot = pane.byWeek[rec.week] = Object.create(null);
        addBag(bagAt(slot, key), rec);
      }
    }
    return { pairs, panes, rejA: spec.rejA, rejB: spec.rejB };
  }

  function matchWhen(raw, when) {
    if (!when || typeof when !== "object") return true;
    const cols = Object.keys(when);
    for (let i = 0; i < cols.length; i++) {
      const allow = when[cols[i]];
      const list = Array.isArray(allow) ? allow.map((v) => String(v)) : [String(allow)];
      if (list.indexOf(strOf(infra().rowVal(raw, cols[i]))) < 0) return false;
    }
    return true;
  }

  function evalExpr(raw, node) {
    if (!node || typeof node !== "object") return false;
    if (node.not) return !evalExpr(raw, node.not);
    if (node.op === "and") return (node.items || []).every((it) => evalExpr(raw, it));
    if (node.op === "or") return (node.items || []).some((it) => evalExpr(raw, it));
    if (node.type === "num") {
      return evalRule(raw, { type: "num", col: node.col, op: node.op, val: node.val });
    }
    if (node.type === "enum") {
      const v = strOf(infra().rowVal(raw, node.col));
      const expect = String(node.val == null ? "" : node.val);
      if (node.op === "neq") return v !== expect;
      return v === expect;
    }
    return false;
  }

  function evalRule(raw, rule) {
    if (!rule) return false;
    const type = rule.type || "binary";
    if (type === "binary") {
      const v = strOf(infra().rowVal(raw, rule.col));
      const n = infra().parseNum(v);
      const expectZero = rule.hitWhen === "zero" || rule.hitWhen === 0 || rule.hitWhen === "0";
      if (expectZero) return v === "0" || v === "0.0" || n === 0;
      return v === "1" || v === "1.0" || n === 1;
    }
    if (type === "num") {
      const n = infra().parseNum(infra().rowVal(raw, rule.col));
      const val = Number(rule.val);
      if (n == null || !Number.isFinite(n) || !Number.isFinite(val)) return false;
      if (rule.op === "gt") return n > val;
      if (rule.op === "gte") return n >= val;
      if (rule.op === "lt") return n < val;
      if (rule.op === "lte") return n <= val;
      return false;
    }
    if (type === "sum") {
      const cols = Array.isArray(rule.cols) ? rule.cols : [];
      if (!cols.length) return false;
      let sum = 0;
      for (let i = 0; i < cols.length; i++) {
        const n = infra().parseNum(infra().rowVal(raw, cols[i]));
        if (n == null || !Number.isFinite(n)) return false;
        sum += n;
      }
      const val = Number(rule.val);
      if (!Number.isFinite(val)) return false;
      if (rule.op === "gt") return sum > val;
      if (rule.op === "gte") return sum >= val;
      if (rule.op === "lt") return sum < val;
      if (rule.op === "lte") return sum <= val;
      return false;
    }
    if (type === "expr") return evalExpr(raw, rule.expr);
    return false;
  }

  function missingCols(rule, headerSet, out) {
    const type = (rule && rule.type) || "binary";
    if ((type === "binary" || type === "num") && rule.col && !headerSet[rule.col]) out.push(rule.col);
    if (type === "sum") {
      (rule.cols || []).forEach((col) => {
        if (col && !headerSet[col]) out.push(col);
      });
    }
    if (type === "expr") walkExpr(rule.expr, headerSet, out);
  }

  function walkExpr(node, headerSet, out) {
    if (!node || typeof node !== "object") return;
    if (node.not) walkExpr(node.not, headerSet, out);
    (node.items || []).forEach((it) => walkExpr(it, headerSet, out));
    if ((node.type === "num" || node.type === "enum") && node.col && !headerSet[node.col]) out.push(node.col);
  }

  function normalizeRule(rule, j) {
    return {
      key: rule.key || String(j),
      name: rule.name || rule.col || ("规则" + (j + 1)),
      kind: rule.kind === "hard" ? "hard" : "soft",
      type: rule.type || "binary",
      col: rule.col,
      cols: Array.isArray(rule.cols) ? rule.cols.slice() : undefined,
      op: rule.op,
      val: rule.val,
      hitWhen: rule.hitWhen,
      expr: rule.expr,
    };
  }

  function normalizeRoutes(pack) {
    const routes = pack && Array.isArray(pack.routes) ? pack.routes : [];
    return routes.map((route, i) => {
      const rules = Array.isArray(route.rules) ? route.rules : [];
      return {
        id: route.id || ("route-" + (i + 1)),
        when: route.when && typeof route.when === "object" ? route.when : {},
        rules: rules.map(normalizeRule),
      };
    });
  }

  function normalizeVersions(pack) {
    if (pack && Array.isArray(pack.versions)) {
      return pack.versions.map((ver, i) => ({
        id: ver.id || ("v" + (i + 1)),
        name: ver.name || ver.id || ("版本" + (i + 1)),
        routes: normalizeRoutes(ver),
      })).filter((ver) => ver.routes.length);
    }
    const routes = normalizeRoutes(pack);
    if (!routes.length) return [];
    return [{ id: "default", name: "上传", routes: routes }];
  }

  function blankPreStep(isHard) {
    return { single: 0, wf: 0, only: isHard ? null : 0, isHard: isHard };
  }

  function blankPostStep(isHard) {
    return {
      single: emptyBag(),
      wf: emptyBag(),
      only: isHard ? null : emptyBag(),
      isHard: isHard,
    };
  }

  function ruleColumns(rules) {
    const out = [];
    const seen = Object.create(null);
    function add(col) {
      const name = col == null ? "" : String(col);
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push(name);
    }
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.not) walk(node.not);
      const items = node.items || [];
      for (let i = 0; i < items.length; i++) walk(items[i]);
      if ((node.type === "num" || node.type === "enum") && node.col) add(node.col);
    }
    (rules || []).forEach((rule) => {
      if (!rule || rule.kind === "hard") return;
      const type = rule.type || "binary";
      if (type === "binary" || type === "num") add(rule.col);
      if (type === "sum") (rule.cols || []).forEach(add);
      else if (type === "expr") walk(rule.expr);
    });
    return out;
  }

  function enumLabel(n) {
    if (Object.is(n, -0)) return "0";
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(n);
  }

  function valueLabel(raw, col) {
    const cell = infra().rowVal(raw, col);
    if (isPassZeroCol(col)) return rejKey(cell);
    const text = strOf(cell);
    if (!text) return "";
    const n = infra().parseNum(text);
    if (n != null && Number.isFinite(n)) return enumLabel(n);
    return text;
  }

  function distinctLabels(rows, col) {
    const seen = Object.create(null);
    const labels = [];
    for (let i = 0; i < rows.length; i++) {
      const label = valueLabel(rows[i], col);
      if (!label || seen[label]) continue;
      seen[label] = true;
      labels.push(label);
    }
    return labels;
  }

  function buildOneVar(col, dueRecs, dueRows, weeks) {
    const found = distinctLabels(dueRows, col);
    const useEnum = found.length < 10;
    let labels = useEnum ? sortValues(found) : [];
    let rule = null;
    if (!useEnum) {
      rule = infra().buildEqualFreqBinRule(dueRows, col, 5);
      labels = (rule.intervals || []).map((it) => it.label).filter(Boolean);
    }
    const cells = {
      a: Object.create(null),
      b: Object.create(null),
    };
    const due = { a: Object.create(null), b: Object.create(null) };
    for (let w = 0; w < weeks.length; w++) {
      cells.a[weeks[w]] = Object.create(null);
      cells.b[weeks[w]] = Object.create(null);
      due.a[weeks[w]] = 0;
      due.b[weeks[w]] = 0;
    }
    for (let i = 0; i < dueRecs.length; i++) {
      const rec = dueRecs[i];
      const raw = dueRows[i];
      const side = rec.side;
      if (!cells[side] || !cells[side][rec.week]) continue;
      due[side][rec.week] += rec.fm;
      const label = useEnum
        ? valueLabel(raw, col)
        : infra().getBinnedLabel(infra().rowVal(raw, col), rule);
      if (!label || labels.indexOf(label) < 0) continue;
      const slot = cells[side][rec.week];
      let cell = slot[label];
      if (!cell) cell = slot[label] = { fz: 0, fm: 0 };
      cell.fz += rec.fz;
      cell.fm += rec.fm;
    }
    return {
      col: col,
      mode: useEnum ? "enum" : "bins",
      labels: labels,
      cells: cells,
      due: due,
    };
  }

  function buildCardVars(ctx, card, weeks) {
    const known = Object.create(null);
    (ctx.headers || []).forEach((h) => { known[h] = true; });
    const cols = ruleColumns(card.route.varRules || card.route.rules).filter((col) => known[col]);
    const dueRecs = card.dueRecs || [];
    const dueRows = dueRecs.map((rec) => ctx.raw[rec.i]);
    return cols.map((col) => buildOneVar(col, dueRecs, dueRows, weeks));
  }

  function dimsPass(dims, segCols, filters) {
    const row = {};
    (segCols || []).forEach((col, i) => { row[col] = dims[i]; });
    return segPass(row, filters);
  }

  function versionScope(versionId, routeId) {
    return versionId + "\0" + routeId;
  }

  function cubeVarsFor(ctx, routeId, weeks, filters) {
    const vars = ctx.vars || {};
    const pack = vars[routeId] || (routeId.indexOf("\0") >= 0 ? vars[routeId.split("\0")[1]] : null) || [];
    const weekSet = Object.create(null);
    weeks.forEach((week) => { weekSet[week] = true; });
    return pack.map((spec) => {
      const cells = { a: Object.create(null), b: Object.create(null) };
      const due = { a: Object.create(null), b: Object.create(null) };
      weeks.forEach((week) => {
        cells.a[week] = Object.create(null);
        cells.b[week] = Object.create(null);
        due.a[week] = 0;
        due.b[week] = 0;
      });
      (spec.due || []).forEach((pt) => {
        if (!weekSet[pt.week] || !due[pt.side]) return;
        if (!dimsPass(pt.dims, ctx.segCols, filters)) return;
        due[pt.side][pt.week] += pt.fm;
      });
      (spec.points || []).forEach((pt) => {
        if (!weekSet[pt.week] || !cells[pt.side] || !cells[pt.side][pt.week]) return;
        if (!dimsPass(pt.dims, ctx.segCols, filters)) return;
        const slot = cells[pt.side][pt.week];
        let cell = slot[pt.label];
        if (!cell) cell = slot[pt.label] = { fz: 0, fm: 0 };
        cell.fz += pt.fz;
        cell.fm += pt.fm;
      });
      return { col: spec.col, mode: spec.mode, labels: spec.labels || [], cells: cells, due: due };
    });
  }

  function freezeVar(col, due, dueRows) {
    const found = distinctLabels(dueRows, col);
    const useEnum = found.length < 10;
    let labels = useEnum ? sortValues(found) : [];
    let rule = null;
    if (!useEnum) {
      rule = infra().buildEqualFreqBinRule(dueRows, col, 5);
      labels = (rule.intervals || []).map((it) => it.label).filter(Boolean);
    }
    const points = [];
    const duePoints = [];
    const pointMap = Object.create(null);
    const dueMap = Object.create(null);
    due.forEach((item) => {
      const rec = item.rec;
      const base = rec.week + "\0" + rec.side + "\0" + item.dims.join("\0");
      let dueCell = dueMap[base];
      if (!dueCell) {
        dueCell = dueMap[base] = { week: rec.week, side: rec.side, dims: item.dims, fm: 0 };
        duePoints.push(dueCell);
      }
      dueCell.fm += rec.fm;
      const label = useEnum
        ? valueLabel(item.raw, col)
        : infra().getBinnedLabel(infra().rowVal(item.raw, col), rule);
      if (!label || labels.indexOf(label) < 0) return;
      const key = base + "\0" + label;
      let pt = pointMap[key];
      if (!pt) {
        pt = pointMap[key] = { week: rec.week, side: rec.side, dims: item.dims, label: label, fz: 0, fm: 0 };
        points.push(pt);
      }
      pt.fz += rec.fz;
      pt.fm += rec.fm;
    });
    return { col: col, mode: useEnum ? "enum" : "bins", labels: labels, points: points, due: duePoints };
  }

  function buildCube(rows, opts, pack) {
    const ctx = prepare(rows, opts || {});
    const versions = normalizeVersions(pack);
    const segCols = (opts && opts.segmentCols) || [];
    const known = Object.create(null);
    (ctx.headers || []).forEach((h) => { known[h] = true; });
    const dueByRoute = Object.create(null);
    const map = Object.create(null);
    const cells = [];
    const routeKeys = Object.create(null);
    versions.forEach((ver) => {
      ver.routes.forEach((route) => {
        routeKeys[versionScope(ver.id, route.id)] = route.rules.map((rule) => rule.key);
      });
    });
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      const raw = ctx.raw[rec.i];
      const dims = segCols.map((col) => strOf(infra().rowVal(raw, col)));
      const verHits = Object.create(null);
      let routeId = "";
      let mask = "";
      versions.forEach((ver) => {
        let route = null;
        for (let r = 0; r < ver.routes.length; r++) {
          if (matchWhen(raw, ver.routes[r].when)) { route = ver.routes[r]; break; }
        }
        if (!route) return;
        let bits = "";
        for (let s = 0; s < route.rules.length; s++) bits += evalRule(raw, route.rules[s]) ? "1" : "0";
        verHits[ver.id] = { routeId: route.id, mask: bits };
        if (!routeId) {
          routeId = route.id;
          mask = bits;
        }
        if (rec.fm > 0 && (rec.side === "a" || rec.side === "b")) {
          const scope = versionScope(ver.id, route.id);
          if (!dueByRoute[scope]) dueByRoute[scope] = [];
          dueByRoute[scope].push({ raw: raw, rec: rec, dims: dims });
        }
      });
      const verPart = versions.map((ver) => {
        const hit = verHits[ver.id];
        return hit ? (hit.routeId + ":" + hit.mask) : "-";
      }).join("|");
      const key = [rec.week, rec.decision, rec.traffic, rec.rej.join("\0"), dims.join("\0"), verPart].join("\u0001");
      let cell = map[key];
      if (!cell) {
        cell = {
          week: rec.week,
          side: rec.side,
          decision: rec.decision,
          traffic: rec.traffic,
          rej: rec.rej.slice(),
          dims: dims,
          routeId: routeId,
          mask: mask,
          verHits: verHits,
          fz: 0,
          fm: 0,
          afz: 0,
          afm: 0,
          apply: 0,
          pass: 0,
          credit: 0,
          loan: 0,
          t1: 0,
          n: 0,
        };
        map[key] = cell;
        cells.push(cell);
      }
      cell.fz += rec.fz;
      cell.fm += rec.fm;
      cell.afz += rec.afz;
      cell.afm += rec.afm;
      cell.apply += rec.apply;
      cell.pass += rec.pass || 0;
      cell.credit += rec.credit || 0;
      cell.loan += rec.loan || 0;
      cell.t1 += rec.t1 || 0;
      cell.n += 1;
    }
    const vars = Object.create(null);
    versions.forEach((ver) => {
      ver.routes.forEach((route) => {
        const scope = versionScope(ver.id, route.id);
        const due = dueByRoute[scope] || [];
        const cols = ruleColumns(route.rules).filter((col) => known[col]);
        vars[scope] = cols.map((col) => freezeVar(col, due, due.map((item) => item.raw)));
      });
    });
    return {
      fromCube: true,
      cells: cells,
      weeks: ctx.weeks,
      sides: ctx.sides,
      rejCols: ctx.rejCols,
      enums: ctx.enums,
      decisions: ctx.decisions,
      traffics: ctx.traffics,
      headers: ctx.headers,
      segCols: segCols,
      decisionCol: (opts && opts.decisionCol) || "",
      routeKeys: routeKeys,
      vars: vars,
    };
  }

  function hydrate(cube) {
    const segCols = cube.segCols || [];
    const rejCols = cube.rejCols || [];
    const raw = [];
    const recs = (cube.cells || []).map((cell, i) => {
      const row = {};
      segCols.forEach((col, k) => { row[col] = cell.dims[k]; });
      const rej = (cell.rej || []).map(rejKey);
      rejCols.forEach((col, k) => { row[col] = rej[k]; });
      if (cube.decisionCol) row[cube.decisionCol] = cell.decision;
      row[TRAFFIC_COL] = cell.traffic;
      raw.push(row);
      return {
        i: i,
        week: cell.week,
        side: cell.side,
        decision: cell.decision,
        traffic: cell.traffic,
        rej: rej,
        fz: cell.fz,
        fm: cell.fm,
        afz: cell.afz,
        afm: cell.afm,
        apply: cell.apply,
        pass: cell.pass || 0,
        credit: cell.credit || 0,
        loan: cell.loan || 0,
        t1: cell.t1 || 0,
        n: cell.n,
        routeId: cell.routeId,
        mask: cell.mask,
        verHits: cell.verHits || null,
      };
    });
    return {
      fromCube: true,
      raw: raw,
      recs: recs,
      weeks: cube.weeks || [],
      sides: cube.sides,
      rejCols: rejCols,
      enums: normalizeEnums(cube.enums),
      decisions: cube.decisions || [],
      traffics: cube.traffics || [],
      headers: cube.headers || [],
      segCols: segCols,
      routeKeys: cube.routeKeys || {},
      vars: cube.vars || {},
    };
  }

  function waterfall(ctx, routes, spec) {
    const versionId = (routes && routes[0] && routes[0].versionId) || "";
    const weeks = (ctx.weeks || []).filter((w) => inWeek(w, spec.weekFrom, spec.weekTo));
    const headerSet = Object.create(null);
    (ctx.headers || []).forEach((h) => { headerSet[h] = true; });
    const cards = (routes || []).map((route) => {
      const missing = [];
      const rules = route.rules || [];
      rules.forEach((rule) => missingCols(rule, headerSet, missing));
      const pre = Object.create(null);
      const post = Object.create(null);
      weeks.forEach((week) => {
        pre[week] = { total: 0, steps: rules.map((rule) => blankPreStep(rule.kind === "hard")) };
        post[week] = {
          steps: rules.map((rule) => blankPostStep(rule.kind === "hard")),
          remain: emptyBag(),
        };
      });
      return { route: route, missing: Array.from(new Set(missing)), pre: pre, post: post, matched: 0 };
    });
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!inWeek(rec.week, spec.weekFrom, spec.weekTo)) continue;
      const raw = ctx.raw[rec.i];
      if (!segPass(raw, spec.segFilters)) continue;
      let hitCard = null;
      let hitMask = rec.mask || "";
      let keyName = rec.routeId || "";
      if (ctx.fromCube) {
        const scoped = versionId && rec.verHits ? rec.verHits[versionId] : null;
        if (rec.verHits) {
          if (!scoped || !scoped.routeId) continue;
          hitMask = scoped.mask || "";
          keyName = versionScope(versionId, scoped.routeId);
          for (let r = 0; r < cards.length; r++) {
            if (cards[r].route.id === scoped.routeId) { hitCard = cards[r]; break; }
          }
        } else {
          if (!rec.routeId) continue;
          for (let r = 0; r < cards.length; r++) {
            if (cards[r].route.id === rec.routeId) { hitCard = cards[r]; break; }
          }
        }
      } else {
        for (let r = 0; r < cards.length; r++) {
          if (matchWhen(raw, cards[r].route.when)) { hitCard = cards[r]; break; }
        }
      }
      if (!hitCard) continue;
      const weekPre = hitCard.pre[rec.week];
      const weekPost = hitCard.post[rec.week];
      if (!weekPre || !weekPost) continue;
      const rules = hitCard.route.rules || [];
      const hits = [];
      let hardHit = false;
      let softCount = 0;
      let onlyAt = -1;
      if (ctx.fromCube) {
        const keys = (ctx.routeKeys && ctx.routeKeys[keyName]) || [];
        for (let s = 0; s < rules.length; s++) {
          const idx = keys.indexOf(rules[s].key);
          hits.push(idx >= 0 && String(hitMask).charAt(idx) === "1");
        }
      } else {
        for (let s = 0; s < rules.length; s++) hits.push(evalRule(raw, rules[s]));
      }
      for (let s = 0; s < hits.length; s++) {
        const hit = hits[s];
        if (!hit) continue;
        if (rules[s].kind === "hard") hardHit = true;
        else {
          softCount += 1;
          onlyAt = s;
        }
      }
      hitCard.matched += 1;
      const due = rec.fm > 0;
      if (!ctx.fromCube && due && (rec.side === "a" || rec.side === "b")) {
        if (!hitCard.dueRecs) hitCard.dueRecs = [];
        hitCard.dueRecs.push(rec);
      }
      weekPre.total += rec.apply;
      let wfAt = -1;
      for (let s = 0; s < hits.length; s++) {
        if (!hits[s]) continue;
        weekPre.steps[s].single += rec.apply;
        if (due) addBag(weekPost.steps[s].single, rec);
        if (wfAt < 0) wfAt = s;
      }
      if (wfAt >= 0) {
        weekPre.steps[wfAt].wf += rec.apply;
        if (due) addBag(weekPost.steps[wfAt].wf, rec);
      } else if (due) {
        addBag(weekPost.remain, rec);
      }
      if (!hardHit && softCount === 1 && onlyAt >= 0 && weekPre.steps[onlyAt].only != null) {
        weekPre.steps[onlyAt].only += rec.apply;
        if (due && weekPost.steps[onlyAt].only) addBag(weekPost.steps[onlyAt].only, rec);
      }
    }
    cards.forEach((card) => {
      weeks.forEach((week) => {
        const pre = card.pre[week];
        const total = pre.total;
        let cum = 0;
        pre.steps.forEach((step) => {
          cum += step.wf;
          step.singleRate = total > 0 ? step.single / total : null;
          step.wfRate = total > 0 ? step.wf / total : null;
          step.onlyRate = step.only == null ? null : (total > 0 ? step.only / total : null);
          step.cum = cum;
          step.cumRate = total > 0 ? cum / total : null;
        });
      });
    });
    const shown = [];
    cards.forEach((card) => {
      if (card.matched > 0) {
        card.uniWeeks = weeks.slice();
        const varKey = card.route.versionId
          ? versionScope(card.route.versionId, card.route.id)
          : card.route.id;
        card.vars = ctx.fromCube
          ? cubeVarsFor(ctx, varKey, weeks, spec.segFilters)
          : buildCardVars(ctx, card, weeks);
        shown.push(card);
      }
      delete card.dueRecs;
    });
    return { weeks: weeks.slice().reverse(), cards: shown };
  }

  RV.domain = RV.domain || {};
  RV.domain.strategyMonitor = {
    METRICS,
    STATUS_METRICS,
    TRAFFIC_COL,
    prepare,
    buildCube,
    hydrate,
    listColumnValues,
    replay,
    versionStatus,
    statusValue,
    sumStatus,
    cross,
    trafficsFor,
    activeValues,
    waterfall,
    normalizeRoutes,
    normalizeVersions,
    metricValue,
    sumBags,
  };
})(window.RV);
