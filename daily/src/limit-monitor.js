/**
 * 额度策略监控的计算。界面在 src/limit-monitor-ui.js。
 * 章首 Level 分箱、客群取值、决策组、额度策略版本、时间作用在整章。
 * 客群「不拆」只取消横向分列，不取消取值筛选。
 * 特殊策略只取 b 组，再按 system1 × 是否拒量 拆开；额度版本、时间、Level 和客群筛选仍跟章首。
 * 标签回打（flag_level_button_tag_、flag_level_dec_tag_）同时看命中和未命中，再分 a、b。
 * 额度维度用 level 或 last_level_num，档位与 Level 贷后相同。章首筛选仍作用在这块。
 * 交叉表另有左右决策组和额度策略版本，客群、Level 和时间仍跟章首。
 * 标签命中 = 取值 1，其余都算未命中。
 */
(function (RV) {
  "use strict";

  const VERSION_COL = "额度策略版本";

  function colsWithPrefix(headers, prefix) {
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < headers.length; i++) {
      const name = String(headers[i] || "");
      if (name.indexOf(prefix) !== 0 || seen[name]) continue;
      seen[name] = true;
      out.push(name);
    }
    return out;
  }
  const METRICS = [
    { id: "risk", name: "订单风险" },
    { id: "due_cnt", name: "到期单量" },
    { id: "amt_risk", name: "金额风险" },
    { id: "gold_rate", name: "金笔率" },
    { id: "due_amt", name: "到期金额(万)" },
    { id: "ticket", name: "授信件均" },
  ];
  const FLOW_METRICS = [
    { id: "apply", name: "进件量" },
    { id: "pass_rate", name: "通过率" },
    { id: "ticket", name: "授信件均" },
    { id: "prev_ticket", name: "上次授信件均" },
    { id: "risk", name: "订单风险" },
    { id: "amt_risk", name: "金额风险" },
    { id: "gold_rate", name: "金笔率" },
    { id: "due_cnt", name: "到期单量" },
    { id: "use_rate", name: "用信率" },
    { id: "t1_use_rate", name: "T1用信率" },
  ];

  function infra() {
    return RV.infra;
  }

  function dr() {
    return RV.domain.dailyReview;
  }

  function strOf(v) {
    return String(v == null ? "" : v).trim();
  }

  function numOf(v) {
    const n = infra().parseNum(v);
    return n == null || !Number.isFinite(n) ? 0 : n;
  }

  function isHit(v) {
    return infra().parseNum(v) === 1;
  }

  function emptyBag() {
    return { fz: 0, fm: 0, afz: 0, afm: 0, tn: 0, td: 0, n: 0 };
  }

  function addInto(bag, rec) {
    bag.fz += rec.fz;
    bag.fm += rec.fm;
    bag.afz += rec.afz;
    bag.afm += rec.afm;
    bag.tn += rec.tn;
    bag.td += rec.td;
    bag.n += 1;
  }

  function mergeInto(bag, src) {
    if (!src) return;
    bag.fz += src.fz;
    bag.fm += src.fm;
    bag.afz += src.afz;
    bag.afm += src.afm;
    bag.tn += src.tn;
    bag.td += src.td;
    bag.n += src.n;
  }

  function sumBags(list) {
    const bag = emptyBag();
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (!src) continue;
      bag.fz += src.fz;
      bag.fm += src.fm;
      bag.afz += src.afz;
      bag.afm += src.afm;
      bag.tn += src.tn;
      bag.td += src.td;
      bag.n += src.n;
    }
    return bag;
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
    if (id === "ticket") return bag.td > 0 ? bag.tn / bag.td : null;
    return null;
  }

  function binLabel(kind, raw) {
    const api = dr();
    if (!api) return "其他";
    if (kind === "change") return api.changeNumBinLabel(raw);
    return api.levelBinLabel(raw);
  }

  function sortBins(kind, bins) {
    const api = dr();
    const list = (bins || []).slice();
    if (kind === "change" && api && api.sortChangeNumBins) return api.sortChangeNumBins(list);
    if (api && api.sortLevelBins) return api.sortLevelBins(list);
    return list;
  }

  function findNamed(list, names) {
    const want = Object.create(null);
    names.forEach((name) => { want[name] = true; });
    for (let i = 0; i < list.length; i++) {
      if (want[strOf(list[i]).toLowerCase()]) return list[i];
    }
    return "";
  }

  function inWeek(week, from, to) {
    if (!week) return false;
    if (from && week < from) return false;
    if (to && week > to) return false;
    return true;
  }

  function picked(list, value) {
    if (!list || !list.length) return true;
    return list.indexOf(value) >= 0;
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

  function segKeyOf(raw, splits) {
    return splits.map((f) => strOf(infra().rowVal(raw, f.col))).join("\0");
  }

  function sortValues(list) {
    return list.slice().sort((a, b) => {
      if (a === "") return -1;
      if (b === "") return 1;
      const an = infra().parseNum(a);
      const bn = infra().parseNum(b);
      if (an != null && bn != null && an !== bn) return an - bn;
      return String(a).localeCompare(String(b), "zh");
    });
  }

  function bagAt(root, keys) {
    let cur = root;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!cur[key]) cur[key] = Object.create(null);
      cur = cur[key];
    }
    const last = keys[keys.length - 1];
    if (!cur[last]) cur[last] = emptyBag();
    return cur[last];
  }

  function prepare(rows, opts) {
    const headers = opts.headers || [];
    const has = Object.create(null);
    headers.forEach((h) => { has[h] = true; });
    const levelFields = (has.level ? ["level"] : []).concat(colsWithPrefix(headers, "level_new_"));
    const changeFields = (has.level_change_num ? ["level_change_num"] : []).concat(colsWithPrefix(headers, "level_change_end_"));
    const fields = levelFields.map((col) => ({ col: col, kind: "level" }))
      .concat(changeFields.map((col) => ({ col: col, kind: "change" })));
    const tagCols = colsWithPrefix(headers, "flag_level_button_tag_").concat(colsWithPrefix(headers, "flag_level_dec_tag_"));
    const hasLastLevel = !!has.last_level_num;
    const timeCol = opts.timeCol;
    const decisionCol = opts.decisionCol;
    const bucket = dr() && dr().bucketTime;
    const weekSet = Object.create(null);
    (opts.weekPeriods || []).forEach((w) => { weekSet[w] = true; });
    const decisions = [];
    const decisionSeen = Object.create(null);
    (opts.decisionGroups || []).forEach((g) => {
      const name = String(g);
      if (!name || decisionSeen[name]) return;
      decisionSeen[name] = true;
      decisions.push(name);
    });
    const versionSeen = Object.create(null);
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
      const version = has[VERSION_COL] ? strOf(infra().rowVal(row, VERSION_COL)) : "";
      versionSeen[version] = true;
      const bins = Object.create(null);
      for (let f = 0; f < fields.length; f++) {
        bins[fields[f].col] = binLabel(fields[f].kind, infra().rowVal(row, fields[f].col));
      }
      if (hasLastLevel) bins.last_level_num = binLabel("level", infra().rowVal(row, "last_level_num"));
      const tagHits = [];
      for (let t = 0; t < tagCols.length; t++) tagHits.push(isHit(infra().rowVal(row, tagCols[t])));
      recs.push({
        i: i,
        week: week,
        decision: decision,
        version: version,
        bins: bins,
        tagHits: tagHits,
        hitDec: has.flag_level_dec_tag && isHit(infra().rowVal(row, "flag_level_dec_tag")),
        hitFloor: has.flag_level_floor_tag && isHit(infra().rowVal(row, "flag_level_floor_tag")),
        fz: numOf(infra().rowVal(row, "fpd1_cnt_fz")),
        fm: numOf(infra().rowVal(row, "fpd1_cnt_fm")),
        afz: numOf(infra().rowVal(row, "fpd1_amt_fz")),
        afm: numOf(infra().rowVal(row, "fpd1_amt_fm")),
        tn: numOf(infra().rowVal(row, "本次额度")),
        pn: numOf(infra().rowVal(row, "上次额度")),
        td: numOf(infra().rowVal(row, "通过量")),
        apply: infra().getApplyVol ? infra().getApplyVol(row) : numOf(infra().rowVal(row, "进件量")),
        loan: numOf(infra().rowVal(row, "放款订单数")),
        t1: numOf(infra().rowVal(row, "T1_放款订单数")),
      });
    }
    const bValue = findNamed(decisions, ["b组", "b", "实验组"]);
    const aValue = findNamed(decisions, ["a组", "a", "对照组"]) || decisions.find((d) => d !== bValue) || "";
    return {
      raw: list,
      recs: recs,
      weeks: (opts.weekPeriods || []).filter((w) => weekSet[w]),
      decisions: decisions,
      versions: sortValues(Object.keys(versionSeen)),
      levelFields: levelFields,
      changeFields: changeFields,
      hasLevel: !!has.level,
      hasChange: !!has.level_change_num,
      hasDecTag: !!has.flag_level_dec_tag,
      hasFloorTag: !!has.flag_level_floor_tag,
      hasLastLevel: hasLastLevel,
      tagCols: tagCols,
      aValue: aValue,
      bValue: bValue,
      headers: headers.slice(),
    };
  }

  function levelFilterCol(ctx) {
    if (ctx && ctx.hasLevel) return "level";
    return "";
  }

  function listLevelBins(ctx, from, to) {
    const col = levelFilterCol(ctx);
    if (!col) return [];
    const seen = Object.create(null);
    const out = [];
    const recs = (ctx && ctx.recs) || [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (!inWeek(rec.week, from, to)) continue;
      const bin = (rec.bins && rec.bins[col]) || "";
      if (!bin || seen[bin]) continue;
      seen[bin] = true;
      out.push(bin);
    }
    return sortBins("level", out);
  }

  function listDimBins(ctx, dim, from, to) {
    const seen = Object.create(null);
    const out = [];
    const recs = (ctx && ctx.recs) || [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (!inWeek(rec.week, from, to)) continue;
      const bin = (rec.bins && rec.bins[dim]) || "";
      if (!bin || seen[bin]) continue;
      seen[bin] = true;
      out.push(bin);
    }
    return sortBins("level", out);
  }

  function buildCube(rows, opts) {
    const ctx = prepare(rows, opts || {});
    const segCols = (opts && opts.segmentCols) || [];
    const fields = ctx.levelFields.concat(ctx.changeFields);
    const map = Object.create(null);
    const cells = [];
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      const raw = ctx.raw[rec.i];
      const dims = segCols.map((col) => strOf(infra().rowVal(raw, col)));
      const system = strOf(infra().rowVal(raw, "system1"));
      const rej = strOf(infra().rowVal(raw, "是否拒量"));
      const binKey = fields.map((col) => rec.bins[col] || "").join("\0");
      const tagKey = (rec.tagHits || []).map((hit) => (hit ? 1 : 0)).join("");
      const lastBin = (rec.bins && rec.bins.last_level_num) || "";
      const key = [rec.week, rec.decision, rec.version, binKey, rec.hitDec ? 1 : 0, rec.hitFloor ? 1 : 0, tagKey, lastBin, system, rej, dims.join("\0")].join("\u0001");
      let cell = map[key];
      if (!cell) {
        cell = {
          week: rec.week,
          decision: rec.decision,
          version: rec.version,
          bins: rec.bins,
          tagHits: (rec.tagHits || []).slice(),
          hitDec: rec.hitDec,
          hitFloor: rec.hitFloor,
          system: system,
          rej: rej,
          dims: dims,
          fz: 0,
          fm: 0,
          afz: 0,
          afm: 0,
          tn: 0,
          pn: 0,
          td: 0,
          apply: 0,
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
      cell.tn += rec.tn;
      cell.pn += rec.pn || 0;
      cell.td += rec.td;
      cell.apply += rec.apply || 0;
      cell.loan += rec.loan || 0;
      cell.t1 += rec.t1 || 0;
      cell.n += 1;
    }
    return {
      fromCube: true,
      cells: cells,
      weeks: ctx.weeks,
      decisions: ctx.decisions,
      versions: ctx.versions,
      levelFields: ctx.levelFields,
      changeFields: ctx.changeFields,
      hasLevel: ctx.hasLevel,
      hasChange: ctx.hasChange,
      hasDecTag: ctx.hasDecTag,
      hasFloorTag: ctx.hasFloorTag,
      hasLastLevel: !!ctx.hasLastLevel,
      tagCols: (ctx.tagCols || []).slice(),
      aValue: ctx.aValue,
      bValue: ctx.bValue,
      segCols: segCols,
      headers: (ctx.headers || []).slice(),
      decisionCol: (opts && opts.decisionCol) || "",
    };
  }

  function hydrate(cube) {
    const segCols = cube.segCols || [];
    const raw = [];
    const recs = (cube.cells || []).map((cell, i) => {
      const row = { system1: cell.system, 是否拒量: cell.rej };
      segCols.forEach((col, k) => { row[col] = cell.dims[k]; });
      if (cube.decisionCol) row[cube.decisionCol] = cell.decision;
      raw.push(row);
      return {
        i: i,
        week: cell.week,
        decision: cell.decision,
        version: cell.version,
        bins: cell.bins,
        tagHits: (cell.tagHits || []).slice(),
        hitDec: !!cell.hitDec,
        hitFloor: !!cell.hitFloor,
        fz: cell.fz,
        fm: cell.fm,
        afz: cell.afz,
        afm: cell.afm,
        tn: cell.tn,
        pn: cell.pn || 0,
        td: cell.td,
        apply: cell.apply || 0,
        loan: cell.loan || 0,
        t1: cell.t1 || 0,
        n: cell.n,
      };
    });
    return {
      fromCube: true,
      raw: raw,
      recs: recs,
      weeks: cube.weeks || [],
      decisions: cube.decisions || [],
      versions: cube.versions || [],
      levelFields: cube.levelFields || [],
      changeFields: cube.changeFields || [],
      hasLevel: !!cube.hasLevel,
      hasChange: !!cube.hasChange,
      hasDecTag: !!cube.hasDecTag,
      hasFloorTag: !!cube.hasFloorTag,
      hasLastLevel: !!cube.hasLastLevel,
      tagCols: (cube.tagCols || []).slice(),
      aValue: cube.aValue || "",
      bValue: cube.bValue || "",
      headers: (cube.headers || []).slice(),
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

  function activeDecisions(chosen, all) {
    if (!chosen || !chosen.length) return all.slice();
    const hit = chosen.filter((v) => all.indexOf(v) >= 0);
    return hit.length ? hit : all.slice();
  }

  function segLabel(id) {
    return String(id || "").split("\0").map((part) => (part === "" ? "（空）" : part)).join(" · ") || "（空）";
  }

  function shapePanel(root, weekFm, decisions, kind, segments) {
    const sides = [];
    decisions.forEach((dec) => {
      const weekBag = weekFm[dec] || {};
      const weeks = Object.keys(weekBag).filter((w) => weekBag[w] > 0).sort();
      const binMap = root[dec] || {};
      const present = [];
      Object.keys(binMap).forEach((bin) => {
        const byWeek = binMap[bin];
        const alive = weeks.some((week) => {
          const bySeg = byWeek[week] || {};
          return Object.keys(bySeg).some((seg) => bySeg[seg].fm > 0);
        });
        if (alive) present.push(bin);
      });
      const bins = sortBins(kind, present);
      const grandSeg = Object.create(null);
      const grandTotal = emptyBag();
      const rows = bins.map((bin) => {
        const subSeg = Object.create(null);
        const subParts = [];
        const weeksOut = Object.create(null);
        weeks.forEach((week) => {
          const bySeg = (binMap[bin] && binMap[bin][week]) || Object.create(null);
          const parts = [];
          Object.keys(bySeg).forEach((seg) => { parts.push(bySeg[seg]); });
          const total = sumBags(parts);
          weeksOut[week] = { bySeg: bySeg, total: total };
          Object.keys(bySeg).forEach((seg) => {
            if (!subSeg[seg]) subSeg[seg] = emptyBag();
            mergeInto(subSeg[seg], bySeg[seg]);
          });
          subParts.push(total);
        });
        const subtotal = { bySeg: subSeg, total: sumBags(subParts) };
        Object.keys(subSeg).forEach((seg) => {
          if (!grandSeg[seg]) grandSeg[seg] = emptyBag();
          mergeInto(grandSeg[seg], subSeg[seg]);
        });
        mergeInto(grandTotal, subtotal.total);
        return { bin: bin, weeks: weeksOut, subtotal: subtotal };
      });
      sides.push({
        decision: dec,
        weeks: weeks,
        rows: rows,
        total: { bySeg: grandSeg, total: grandTotal },
      });
    });
    return { segments: segments, sides: sides };
  }

  function emptyFlow() {
    return { fz: 0, fm: 0, afz: 0, afm: 0, tn: 0, pn: 0, td: 0, apply: 0, loan: 0, t1: 0, n: 0 };
  }

  function addFlow(bag, rec) {
    bag.fz += rec.fz || 0;
    bag.fm += rec.fm || 0;
    bag.afz += rec.afz || 0;
    bag.afm += rec.afm || 0;
    bag.tn += rec.tn || 0;
    bag.pn += rec.pn || 0;
    bag.td += rec.td || 0;
    bag.apply += rec.apply || 0;
    bag.loan += rec.loan || 0;
    bag.t1 += rec.t1 || 0;
    bag.n += rec.n > 0 ? rec.n : 1;
  }

  function sumFlow(bags) {
    const out = emptyFlow();
    let any = false;
    (bags || []).forEach((bag) => {
      if (!bag || !bag.n) return;
      addFlow(out, bag);
      any = true;
    });
    return any ? out : null;
  }

  function flowValue(bag, id) {
    if (!bag || !bag.n) return null;
    if (id === "apply") return bag.apply;
    if (id === "pass_rate") return bag.apply > 0 ? bag.td / bag.apply : null;
    if (id === "ticket") return bag.td > 0 ? bag.tn / bag.td : null;
    if (id === "prev_ticket") return bag.td > 0 ? bag.pn / bag.td : null;
    if (id === "risk") return bag.fm > 0 ? bag.fz / bag.fm : null;
    if (id === "amt_risk") return bag.afm > 0 ? bag.afz / bag.afm : null;
    if (id === "gold_rate") {
      const risk = bag.fm > 0 ? bag.fz / bag.fm : null;
      const amt = bag.afm > 0 ? bag.afz / bag.afm : null;
      if (risk == null || amt == null || !(risk > 0)) return null;
      return amt / risk;
    }
    if (id === "due_cnt") return bag.fm;
    if (id === "use_rate") return bag.td > 0 ? bag.loan / bag.td : null;
    if (id === "t1_use_rate") return bag.td > 0 ? bag.t1 / bag.td : null;
    return null;
  }

  function flowAt(root, decision, version, week) {
    if (!root[decision]) root[decision] = Object.create(null);
    if (!root[decision][version]) root[decision][version] = Object.create(null);
    if (!root[decision][version][week]) root[decision][version][week] = emptyFlow();
    return root[decision][version][week];
  }

  function shapeVersion(root, decisions, weeks) {
    const groups = [];
    decisions.forEach((dec) => {
      const byVer = root[dec];
      if (!byVer) return;
      const cols = sortValues(Object.keys(byVer)).map((ver) => ({ version: ver, byWeek: byVer[ver] }));
      if (cols.length) groups.push({ decision: dec, cols: cols });
    });
    return { weeks: weeks, groups: groups };
  }

  function flowLevelAt(root, version, decision, bin) {
    if (!root[version]) root[version] = Object.create(null);
    if (!root[version][decision]) root[version][decision] = Object.create(null);
    if (!root[version][decision][bin]) root[version][decision][bin] = emptyFlow();
    return root[version][decision][bin];
  }

  function shapeVersionLevel(root, decisions) {
    const groups = [];
    const binSeen = Object.create(null);
    sortValues(Object.keys(root)).forEach((ver) => {
      const byDec = root[ver];
      const cols = [];
      decisions.forEach((dec) => {
        if (!byDec[dec]) return;
        cols.push({ decision: dec, byBin: byDec[dec] });
        Object.keys(byDec[dec]).forEach((bin) => { binSeen[bin] = true; });
      });
      if (cols.length) groups.push({ version: ver, cols: cols });
    });
    return { bins: sortBins("level", Object.keys(binSeen)), groups: groups };
  }

  function emptyCross() {
    return { cells: Object.create(null), rowSeen: Object.create(null), colSeen: Object.create(null) };
  }

  function takeCross(store, rec, colA, colB) {
    const rowBin = rec.bins[colA];
    const colBin = rec.bins[colB];
    if (!rowBin || !colBin) return;
    if (!store.cells[rowBin]) store.cells[rowBin] = Object.create(null);
    if (!store.cells[rowBin][colBin]) store.cells[rowBin][colBin] = emptyBag();
    addInto(store.cells[rowBin][colBin], rec);
    store.rowSeen[rowBin] = true;
    store.colSeen[colBin] = true;
  }

  function shapeCross(kind, left, right) {
    const rowSeen = Object.assign(Object.create(null), left.rowSeen, right.rowSeen);
    const colSeen = Object.assign(Object.create(null), left.colSeen, right.colSeen);
    return {
      rowBins: sortBins(kind, Object.keys(rowSeen)),
      colBins: sortBins(kind, Object.keys(colSeen)),
      left: left.cells,
      right: right.cells,
    };
  }

  function emptyTag() {
    return { hit: emptyBag(), miss: emptyBag(), by: Object.create(null) };
  }

  function takeTag(block, rec, hit, levelBin) {
    addInto(hit ? block.hit : block.miss, rec);
    if (!levelBin) return;
    if (!block.by[levelBin]) block.by[levelBin] = { hit: emptyBag(), miss: emptyBag() };
    addInto(hit ? block.by[levelBin].hit : block.by[levelBin].miss, rec);
  }

  function shapeTag(block) {
    if (!block) return null;
    const present = [];
    Object.keys(block.by).forEach((bin) => {
      const pair = block.by[bin];
      if ((pair.hit && pair.hit.fm > 0) || (pair.miss && pair.miss.fm > 0)) present.push(bin);
    });
    return {
      hit: block.hit,
      miss: block.miss,
      rows: sortBins("level", present).map((bin) => ({
        bin: bin,
        hit: block.by[bin].hit,
        miss: block.by[bin].miss,
      })),
    };
  }

  function showPart(value) {
    return value === "" ? "（空）" : value;
  }

  function rejRank(value) {
    if (value === "非拒量") return 0;
    if (value === "拒量") return 1;
    return 2;
  }

  function shapeSlices(slices, decision) {
    const who = decision || "b组";
    return Object.keys(slices).map((key) => slices[key]).sort((a, b) => {
      const aFirst = a.system === "android" && a.rej === "非拒量" ? 0 : 1;
      const bFirst = b.system === "android" && b.rej === "非拒量" ? 0 : 1;
      if (aFirst !== bFirst) return aFirst - bFirst;
      const sys = String(a.system).localeCompare(String(b.system), "zh");
      if (sys) return sys;
      const rej = rejRank(a.rej) - rejRank(b.rej);
      if (rej) return rej;
      return String(a.rej).localeCompare(String(b.rej), "zh");
    }).map((slice) => ({
      label: "决策组 " + who + " · " + showPart(slice.system) + " · " + showPart(slice.rej),
      dec: shapeTag(slice.dec),
      floor: shapeTag(slice.floor),
    }));
  }

  function freshAb(sides) {
    const cell = { hit: Object.create(null), miss: Object.create(null) };
    for (let i = 0; i < sides.length; i++) {
      cell.hit[sides[i]] = emptyBag();
      cell.miss[sides[i]] = emptyBag();
    }
    return cell;
  }

  function prefixSides(ctx, decisions) {
    const sides = [];
    if (ctx.aValue && decisions.indexOf(ctx.aValue) >= 0) sides.push(ctx.aValue);
    if (ctx.bValue && decisions.indexOf(ctx.bValue) >= 0 && sides.indexOf(ctx.bValue) < 0) sides.push(ctx.bValue);
    return sides;
  }

  function prefixCols(ctx, chosen) {
    const all = ctx.tagCols || [];
    if (!chosen || !chosen.length) return all.slice();
    const hit = chosen.filter((name) => all.indexOf(name) >= 0);
    return hit.length ? hit : all.slice();
  }

  function shapePrefix(store, cols, sides) {
    return cols.map((col, ti) => {
      const by = store[ti] || Object.create(null);
      const present = [];
      Object.keys(by).forEach((bin) => {
        const cell = by[bin];
        const alive = sides.some((dec) => (cell.hit[dec] && cell.hit[dec].fm > 0) || (cell.miss[dec] && cell.miss[dec].fm > 0));
        if (alive) present.push(bin);
      });
      const bins = sortBins("level", present);
      const total = freshAb(sides);
      const rows = bins.map((bin) => {
        const cell = by[bin];
        sides.forEach((dec) => {
          mergeInto(total.hit[dec], cell.hit[dec]);
          mergeInto(total.miss[dec], cell.miss[dec]);
        });
        return { bin: bin, hit: cell.hit, miss: cell.miss };
      });
      return { col: col, rows: rows, total: total };
    });
  }

  function compute(ctx, spec) {
    const filters = spec.segFilters || [];
    const splits = filters.filter((f) => f && !f.skip);
    const decisions = activeDecisions(spec.decisions, ctx.decisions);
    const segSeen = Object.create(null);
    const levelRoot = Object.create(null);
    const changeRoot = Object.create(null);
    const levelWeek = Object.create(null);
    const changeWeek = Object.create(null);
    const crossLevel = { left: emptyCross(), right: emptyCross() };
    const crossChange = { left: emptyCross(), right: emptyCross() };
    const slices = Object.create(null);
    const lv = spec.crossLevel || {};
    const ch = spec.crossChange || {};
    const levelCol = spec.levelCol;
    const changeCol = spec.changeCol;

    function putPanel(root, weekRoot, rec, bin, seg) {
      addInto(bagAt(root, [rec.decision, bin, rec.week, seg]), rec);
      if (!weekRoot[rec.decision]) weekRoot[rec.decision] = Object.create(null);
      weekRoot[rec.decision][rec.week] = (weekRoot[rec.decision][rec.week] || 0) + rec.fm;
    }

    function takeSide(store, rec, side) {
      if (!side || !side.colA || !side.colB) return;
      if (!picked(side.decisions, rec.decision)) return;
      if (!picked(side.versions, rec.version)) return;
      takeCross(store, rec, side.colA, side.colB);
    }

    const flowRoot = Object.create(null);
    const flowLevelRoot = Object.create(null);
    const levelPick = spec.levelBins || [];
    const levelFilter = levelFilterCol(ctx);
    const prefixDim = spec.prefixDim === "last_level_num" && ctx.hasLastLevel ? "last_level_num" : "level";
    const tags = prefixCols(ctx, spec.prefixTags);
    const sides = prefixSides(ctx, decisions);
    const tagIndex = tags.map((name) => (ctx.tagCols || []).indexOf(name));
    const prefixPick = spec.prefixBins || [];
    const prefixStore = tags.map(() => Object.create(null));
    for (let i = 0; i < ctx.recs.length; i++) {
      const rec = ctx.recs[i];
      if (!inWeek(rec.week, spec.weekFrom, spec.weekTo)) continue;
      if (levelPick.length && levelFilter && levelPick.indexOf((rec.bins && rec.bins[levelFilter]) || "") < 0) continue;
      const raw = ctx.raw[rec.i];
      if (!segPass(raw, filters)) continue;
      const seg = splits.length ? segKeyOf(raw, splits) : "";
      if (splits.length) segSeen[seg] = true;
      const onChapter = picked(spec.decisions, rec.decision) && picked(spec.versions, rec.version);
      if (onChapter && decisions.indexOf(rec.decision) >= 0) {
        addFlow(flowAt(flowRoot, rec.decision, rec.version, rec.week), rec);
        const levelBin = (rec.bins && rec.bins.level) || "";
        if (levelBin) addFlow(flowLevelAt(flowLevelRoot, rec.version, rec.decision, levelBin), rec);
        if (levelCol && rec.bins[levelCol]) putPanel(levelRoot, levelWeek, rec, rec.bins[levelCol], seg);
        if (changeCol && rec.bins[changeCol]) putPanel(changeRoot, changeWeek, rec, rec.bins[changeCol], seg);
      }
      if (rec.decision && rec.decision === ctx.bValue && picked(spec.versions, rec.version)) {
        const system = strOf(infra().rowVal(raw, "system1"));
        const rej = strOf(infra().rowVal(raw, "是否拒量"));
        const key = system + "\0" + rej;
        let slice = slices[key];
        if (!slice) {
          slice = slices[key] = {
            system: system,
            rej: rej,
            dec: ctx.hasDecTag ? emptyTag() : null,
            floor: ctx.hasFloorTag ? emptyTag() : null,
          };
        }
        const levelBin = rec.bins.level || "";
        if (slice.dec) takeTag(slice.dec, rec, rec.hitDec, levelBin);
        if (slice.floor) takeTag(slice.floor, rec, rec.hitFloor, levelBin);
      }
      if (tags.length && sides.length && picked(spec.versions, rec.version) && sides.indexOf(rec.decision) >= 0) {
        const bin = (rec.bins && rec.bins[prefixDim]) || "";
        if (bin && (!prefixPick.length || prefixPick.indexOf(bin) >= 0)) {
          const hits = rec.tagHits || [];
          for (let t = 0; t < tags.length; t++) {
            const by = prefixStore[t];
            if (!by[bin]) by[bin] = freshAb(sides);
            addInto(by[bin][hits[tagIndex[t]] ? "hit" : "miss"][rec.decision], rec);
          }
        }
      }
      takeSide(crossLevel.left, rec, { colA: lv.colA, colB: lv.colB, decisions: lv.leftDec, versions: lv.leftVer });
      takeSide(crossLevel.right, rec, { colA: lv.colA, colB: lv.colB, decisions: lv.rightDec, versions: lv.rightVer });
      takeSide(crossChange.left, rec, { colA: ch.colA, colB: ch.colB, decisions: ch.leftDec, versions: ch.leftVer });
      takeSide(crossChange.right, rec, { colA: ch.colA, colB: ch.colB, decisions: ch.rightDec, versions: ch.rightVer });
    }

    const segments = splits.length
      ? Object.keys(segSeen).sort((a, b) => segLabel(a).localeCompare(segLabel(b), "zh")).map((id) => ({ id: id, label: segLabel(id) }))
      : null;
    const weeks = (ctx.weeks || []).filter((w) => inWeek(w, spec.weekFrom, spec.weekTo));
    return {
      segments: segments,
      version: shapeVersion(flowRoot, decisions, weeks),
      versionLevel: ctx.hasLevel ? shapeVersionLevel(flowLevelRoot, decisions) : null,
      level: shapePanel(levelRoot, levelWeek, decisions, "level", segments),
      change: shapePanel(changeRoot, changeWeek, decisions, "change", segments),
      crossLevel: shapeCross("level", crossLevel.left, crossLevel.right),
      crossChange: shapeCross("change", crossChange.left, crossChange.right),
      special: { slices: shapeSlices(slices, ctx.bValue) },
      prefix: {
        dim: prefixDim,
        sides: sides,
        tags: shapePrefix(prefixStore, tags, sides),
      },
    };
  }

  RV.domain = RV.domain || {};
  RV.domain.limitMonitor = {
    VERSION_COL: VERSION_COL,
    METRICS: METRICS,
    FLOW_METRICS: FLOW_METRICS,
    flowValue: flowValue,
    sumFlow: sumFlow,
    prepare: prepare,
    buildCube: buildCube,
    hydrate: hydrate,
    listColumnValues: listColumnValues,
    listLevelBins: listLevelBins,
    listDimBins: listDimBins,
    compute: compute,
    metricValue: metricValue,
  };
})(window.RV);
