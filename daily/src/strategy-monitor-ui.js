/**
 * 准入策略监控。计算在 src/strategy-monitor.js。
 */
(function (RV) {
  "use strict";

  const SM = () => RV.domain.strategyMonitor;

  function esc(s) {
    return RV.infra.esc ? RV.infra.esc(s) : String(s == null ? "" : s);
  }

  function weekLabel(period) {
    const fmt = RV.domain.dailyReview && RV.domain.dailyReview.formatPeriodLabel;
    return fmt ? fmt(period, "week") : String(period);
  }

  function showValue(v) {
    return v == null || v === "" ? "（空）" : String(v);
  }

  function segLabel(key) {
    return String(key || "").split("\0").map(showValue).join(" · ");
  }

  function fmtMetric(id, v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (id === "risk" || id === "amt_risk") return (v * 100).toFixed(2) + "%";
    if (id === "gold_rate") return Math.round(v * 100) + "%";
    if (id === "due_amt") return v.toFixed(2);
    return Math.round(v).toLocaleString();
  }

  function fmtInt(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return Math.round(v).toLocaleString();
  }

  function fmtPct(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return (v * 100).toFixed(2) + "%";
  }

  function heatAttr(rate, scale) {
    if (!scale || rate == null || !Number.isFinite(rate) || !RV.infra.rateHeatStyle) return "";
    const css = RV.infra.rateHeatStyle(rate, scale.min, scale.max);
    return css ? ` style="${css}"` : "";
  }

  function heatDueOk(n) {
    return n != null && Number.isFinite(n) && n >= 10;
  }

  function scaleOf(values) {
    const nums = values.filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  function syncSticky(root) {
    const wrap = root && root.querySelector ? root.querySelector(".dr-detail-table-wrap") : null;
    if (!wrap) return;
    const table = wrap.querySelector(".dr-detail-table");
    const row1 = table && table.tHead && table.tHead.rows[0];
    if (!row1) return;
    const first = row1.querySelector("th.dr-detail-sticky");
    if (first) wrap.style.setProperty("--dr-detail-col1-w", first.offsetWidth + "px");
    const row1H = row1.querySelector(".dr-detail-group-h") || row1.querySelector("th:not([rowspan])");
    if (row1H) wrap.style.setProperty("--dr-detail-thead-row1", row1H.offsetHeight + "px");
  }

  let ctx = null;
  let view = null;
  let lastResult = null;
  let routesOverride = null;
  let routeNote = "";

  function chipMetrics() {
    const seen = Object.create(null);
    const out = [];
    SM().STATUS_METRICS.concat(SM().METRICS).forEach((m) => {
      if (seen[m.id]) return;
      seen[m.id] = true;
      out.push(m);
    });
    return out;
  }

  function selectedIds() {
    const all = chipMetrics().map((m) => m.id);
    if (!view.metrics || !view.metrics.length) return all;
    const keep = view.metrics.filter((id) => all.indexOf(id) >= 0);
    return keep.length ? keep : all;
  }

  function metricsOn() {
    const ids = selectedIds();
    return SM().METRICS.map((m) => m.id).filter((id) => ids.indexOf(id) >= 0);
  }

  function metricDefs() {
    const on = metricsOn();
    return SM().METRICS.filter((m) => on.indexOf(m.id) >= 0);
  }

  function statusDefs() {
    const ids = selectedIds();
    return SM().STATUS_METRICS.filter((m) => ids.indexOf(m.id) >= 0);
  }

  function metricLabel(m) {
    return m.id === "due_amt" ? "到期金额" : m.name;
  }

  function weeksOn() {
    return (ctx.weeks || []).filter((w) => (!view.weekFrom || w >= view.weekFrom) && (!view.weekTo || w <= view.weekTo));
  }

  const CUST_COLS = ["system1", "是否拒量", "final_cust_type_0807"];

  function sharedCols() {
    const result = lastResult || (RV.app.state && RV.app.state.lastDailyReview);
    const configured = (result && result.config && result.config.segmentCols) || [];
    if (configured.length) return configured.slice();
    const headers = (ctx && ctx.headers) || [];
    return CUST_COLS.filter((col) => !headers.length || headers.indexOf(col) >= 0);
  }

  function pullSharedCols() {
    if (!view) return;
    const next = sharedCols();
    if (next.join("\0") === (view.segCols || []).join("\0")) return;
    const keep = Object.create(null);
    next.forEach((col) => { if (view.colState[col]) keep[col] = view.colState[col]; });
    view.colState = keep;
    view.segCols = next;
  }

  function colState(col) {
    if (!view.colState[col]) view.colState[col] = { skip: false, values: [], open: false };
    return view.colState[col];
  }

  function columnValues(col) {
    return SM().listColumnValues(ctx, col, view.weekFrom, view.weekTo);
  }

  function segSpec() {
    pullSharedCols();
    return {
      weekFrom: view.weekFrom,
      weekTo: view.weekTo,
      segFilters: (view.segCols || []).map((col) => {
        const st = colState(col);
        return { col: col, skip: !!st.skip, values: st.values || [] };
      }),
    };
  }

  function versionPack() {
    return routesOverride || (typeof window !== "undefined" ? window.DR_STRATEGY_ROUTES : null);
  }

  function versions() {
    return SM().normalizeVersions(versionPack());
  }

  function activeVersion() {
    const list = versions();
    if (!list.length) return null;
    if (!list.some((ver) => ver.id === view.fallVersion)) view.fallVersion = list[0].id;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === view.fallVersion) return list[i];
    }
    return list[0];
  }

  function orderedRules(ver, route) {
    const rules = route.rules || [];
    const hard = [];
    const soft = [];
    rules.forEach((rule) => {
      if (rule.kind === "hard") hard.push(rule);
      else soft.push(rule);
    });
    const saved = view.fallOrder && view.fallOrder[ver.id] && view.fallOrder[ver.id][route.id];
    if (!saved || !saved.length) return hard.concat(soft);
    const map = Object.create(null);
    soft.forEach((rule) => { map[rule.key] = rule; });
    const next = [];
    saved.forEach((key) => {
      if (map[key]) {
        next.push(map[key]);
        delete map[key];
      }
    });
    soft.forEach((rule) => { if (map[rule.key]) next.push(rule); });
    return hard.concat(next);
  }

  function routesForWaterfall(ver) {
    if (!ver) return [];
    return ver.routes.map((route) => ({
      id: route.id,
      versionId: ver.id,
      when: route.when,
      rules: orderedRules(ver, route),
      varRules: route.rules,
    }));
  }

  function columnRow(col) {
    const st = colState(col);
    const values = columnValues(col);
    const allOn = !st.values.length;
    let html = `<div class="dr-filter-row"><span class="dr-filter-label dr-seg-col-label">${esc(col)}</span>`;
    if (!values.length) return html + `<span class="config-muted">没有取值</span></div>`;
    html += `<div class="dr-chip-row dr-seg-picks">`;
    html += chip(allOn, "data-admit-seg-vals", col, "全选");
    values.forEach((value) => {
      const on = allOn || st.values.indexOf(value) >= 0;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-admit-seg-val="1" data-admit-seg-col="${esc(col)}" data-admit-seg-value="${esc(value)}">${esc(showValue(value))}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function segSummary() {
    const cols = view.segCols || [];
    if (!cols.length) return "全量";
    return cols.map((col) => {
      const picked = colState(col).values || [];
      const values = columnValues(col);
      if (!picked.length || picked.length >= values.length) return col + " 全部";
      const shown = picked.slice(0, 2).map(showValue).join("/");
      return col + " " + shown + (picked.length > 2 ? " 等" : "");
    }).join(" · ");
  }

  function toggleList(current, all, value, allowEmpty) {
    const base = current && current.length ? current.slice() : all.slice();
    const at = base.indexOf(value);
    if (at >= 0) {
      if (!allowEmpty && base.length === 1) return current && current.length ? current.slice() : [];
      base.splice(at, 1);
    } else {
      base.push(value);
    }
    if (!base.length) return allowEmpty ? [] : (current && current.length ? current.slice() : []);
    if (base.length === all.length) return [];
    return base;
  }

  function toggleKeep(current, all, value) {
    const base = current.slice();
    const at = base.indexOf(value);
    if (at >= 0) {
      if (base.length === 1) return base;
      base.splice(at, 1);
    } else {
      base.push(value);
    }
    return base;
  }

  function chip(on, attr, value, label) {
    return `<button type="button" class="dr-chip${on ? " active" : ""}" ${attr}="${esc(value)}">${esc(label)}</button>`;
  }

  function sidePane(title, inner) {
    return `<div class="dr-level-side"><div class="dr-level-side-head"><span class="config-muted">${esc(title)}</span></div>${inner}</div>`;
  }

  function metricCells(bag, scales, edge) {
    const defs = metricDefs();
    const dueOk = heatDueOk(SM().metricValue(bag, "due_cnt"));
    let html = "";
    defs.forEach((m, i) => {
      const value = SM().metricValue(bag, m.id);
      const cls = "num" + (i === 0 && edge ? " dr-level-seg-start" : "");
      const style = m.kind === "rate" && dueOk ? heatAttr(value, scales[m.id]) : "";
      html += `<td class="${cls}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
    });
    return html;
  }

  function collectScales(bags) {
    const scales = { risk: [], amt_risk: [] };
    bags.forEach((bag) => {
      if (!heatDueOk(SM().metricValue(bag, "due_cnt"))) return;
      scales.risk.push(SM().metricValue(bag, "risk"));
      scales.amt_risk.push(SM().metricValue(bag, "amt_risk"));
    });
    return { risk: scaleOf(scales.risk), amt_risk: scaleOf(scales.amt_risk) };
  }

  function wrapTable(html) {
    return `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table">${html}</table></div>`;
  }

  function fmtStatus(id, v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (id === "apply") return fmtInt(v);
    if (id === "ticket") return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return fmtPct(v);
  }

  function pairHead(group) {
    if (group.total) return "合计";
    return `<span class="dr-admit-cross-head"><span>${esc(group.decision)}</span><span>${esc(group.version)}</span></span>`;
  }

  function statusHtml() {
    const data = SM().versionStatus(ctx, segSpec());
    const defs = statusDefs();
    if (!data.pairs.length) return `<p class="da-results-placeholder">当前筛选下没有决策组或策略版本。</p>`;
    if (!defs.length) return `<p class="da-results-placeholder">指标里没有策略版本现状用的项。</p>`;
    const groups = data.pairs.map((pair) => {
      const key = pair.decision + "\0" + pair.version;
      return {
        decision: showValue(pair.decision),
        version: showValue(pair.version),
        total: false,
        at: (week) => (data.byPair[key] && data.byPair[key][week]) || null,
      };
    });
    groups.push({
      decision: "合计",
      version: "",
      total: true,
      at: (week) => SM().sumStatus(data.pairs.map((pair) => {
        const key = pair.decision + "\0" + pair.version;
        return (data.byPair[key] && data.byPair[key][week]) || null;
      })),
    });
    const scales = { risk: [], amt_risk: [] };
    data.weeks.forEach((week) => {
      groups.forEach((group) => {
        const bag = group.at(week);
        if (!bag || !(bag.fm >= 10)) return;
        scales.risk.push(SM().statusValue(bag, "risk"));
        scales.amt_risk.push(SM().statusValue(bag, "amt_risk"));
      });
    });
    const scale = { risk: scaleOf(scales.risk), amt_risk: scaleOf(scales.amt_risk) };
    function cells(bag, edge, total) {
      let out = "";
      defs.forEach((m, mi) => {
        const value = SM().statusValue(bag, m.id);
        const cls = "num" + (mi === 0 && edge ? " dr-level-seg-start" : "") + (total ? " dr-status-total" : "");
        const dueOk = bag && bag.fm >= 10;
        const style = (m.id === "risk" || m.id === "amt_risk") && dueOk ? heatAttr(value, scale[m.id]) : "";
        out += `<td class="${cls}"${style}>${esc(fmtStatus(m.id, value))}</td>`;
      });
      return out;
    }
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">周</th>`;
    groups.forEach((group, i) => {
      const total = group.total ? " dr-status-total" : "";
      html += `<th class="dr-detail-group-h dr-level-seg-h${i ? " dr-level-seg-start" : ""}${total}" colspan="${defs.length}">${pairHead(group)}</th>`;
    });
    html += `</tr><tr>`;
    groups.forEach((group, i) => {
      const total = group.total ? " dr-status-total" : "";
      defs.forEach((m, mi) => {
        html += `<th class="dr-detail-metric-h${mi === 0 && i ? " dr-level-seg-start" : ""}${total}">${esc(m.name)}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    data.weeks.forEach((week) => {
      html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
      groups.forEach((group, i) => { html += cells(group.at(week), i, group.total); });
      html += `</tr>`;
    });
    html += `</tbody>`;
    return `<p class="config-muted dr-track-note">行是周，列是决策组 × 策略版本。通过率 = 通过量 / 进件量，授信件均 = 本次额度 / 通过量，用信率 = 放款订单数 / 通过量，T1用信率 = T1_放款订单数 / 通过量。时间和客群跟章首，指标跟章首勾选。</p>${wrapTable(html)}`;
  }

  function replayHtml() {
    const spec = Object.assign({ rejCols: view.replayRej.length ? view.replayRej : ctx.rejCols }, segSpec());
    const data = SM().replay(ctx, spec);
    const defs = metricDefs();
    const weeks = weeksOn();
    if (!defs.length) return `<p class="da-results-placeholder">指标里没有回放和交叉用的项。</p>`;
    if (!data.cols.length) return `<p class="da-results-placeholder">没有 rej_ 列。</p>`;
    const scales = { a: null, b: null };
    ["a", "b"].forEach((side) => {
      const bags = [];
      weeks.forEach((week) => {
        const byWeek = data.sides[side][week] || {};
        data.cols.forEach((col) => {
          (data.enums[col] || []).forEach((value) => {
            bags.push((byWeek[col] && byWeek[col][value]) || null);
          });
        });
      });
      scales[side] = collectScales(bags);
    });
    function one(side) {
      let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">周</th>`;
      data.cols.forEach((col, ci) => {
        (data.enums[col] || []).forEach((value, ei) => {
          const edge = ci || ei ? " dr-level-seg-start" : "";
          html += `<th class="dr-detail-group-h dr-level-seg-h${edge}" colspan="${defs.length}">${esc(col + " · " + showValue(value))}</th>`;
        });
      });
      html += `</tr><tr>`;
      data.cols.forEach((col, ci) => {
        (data.enums[col] || []).forEach((value, ei) => {
          defs.forEach((m, mi) => {
            const edge = mi === 0 && (ci || ei) ? " dr-level-seg-start" : "";
            const name = m.id === "due_amt" ? "到期金额(万)" : m.name;
            html += `<th class="dr-detail-metric-h${edge}">${esc(name)}</th>`;
          });
        });
      });
      html += `</tr></thead><tbody>`;
      weeks.forEach((week) => {
        const byWeek = data.sides[side][week] || {};
        html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
        data.cols.forEach((col, ci) => {
          (data.enums[col] || []).forEach((value, ei) => {
            const bag = byWeek[col] && byWeek[col][value];
            html += metricCells(bag, scales[side], ci || ei);
          });
        });
        html += `</tr>`;
      });
      html += `<tr class="dr-latest-total"><td class="dr-detail-sticky">合计</td>`;
      data.cols.forEach((col, ci) => {
        (data.enums[col] || []).forEach((value, ei) => {
          const bags = weeks.map((week) => {
            const byWeek = data.sides[side][week] || {};
            return (byWeek[col] && byWeek[col][value]) || null;
          });
          html += metricCells(SM().sumBags(bags), scales[side], ci || ei);
        });
      });
      html += `</tr></tbody>`;
      return wrapTable(html);
    }
    const a = ctx.sides.a;
    const b = ctx.sides.b;
    let chips = `<div class="dr-filter-row"><span class="dr-filter-label">rej_</span><div class="dr-chip-row">`;
    ctx.rejCols.forEach((col) => {
      const on = !view.replayRej.length || view.replayRej.indexOf(col) >= 0;
      chips += chip(on, "data-admit-rej", col, col);
    });
    chips += `</div></div>`;
    return `<p class="config-muted dr-track-note">按当前筛选后的样本，看各拒绝策略的命中表现。</p>`
      + chips + `<div class="dr-level-ab-grid">` + sidePane("左 · " + a.label, one("a")) + sidePane("右 · " + b.label, one("b")) + `</div>`;
  }

  function paneFilters(id, decisions, traffics, decSelected, trafficSelected) {
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">决策组</span><div class="dr-chip-row">`;
    const decOn = SM().activeValues(decSelected, decisions);
    decisions.forEach((name) => {
      html += `<button type="button" class="dr-chip${decOn.indexOf(name) >= 0 ? " active" : ""}" data-admit-dec="1" data-admit-pane="${esc(id)}" data-admit-name="${esc(name)}">${esc(name || "（空）")}</button>`;
    });
    html += `</div></div><div class="dr-filter-row"><span class="dr-filter-label">流量</span><div class="dr-chip-row">`;
    const trOn = SM().activeValues(trafficSelected, traffics);
    traffics.forEach((name) => {
      html += `<button type="button" class="dr-chip${trOn.indexOf(name) >= 0 ? " active" : ""}" data-admit-traffic="1" data-admit-pane="${esc(id)}" data-admit-name="${esc(name)}">${esc(showValue(name))}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function crossHtml() {
    if (ctx.rejCols.length < 1) return `<p class="da-results-placeholder">没有 rej_ 列。</p>`;
    const leftDec = view.leftDec.length ? view.leftDec : [ctx.sides.a.value].filter(Boolean);
    const rightDec = view.rightDec.length ? view.rightDec : [ctx.sides.b.value].filter(Boolean);
    const leftTrafficAll = SM().trafficsFor(ctx, SM().activeValues(leftDec, ctx.decisions));
    const rightTrafficAll = SM().trafficsFor(ctx, SM().activeValues(rightDec, ctx.decisions));
    const data = SM().cross(ctx, Object.assign({
      rejA: view.crossA,
      rejB: view.crossB,
      panes: [
        { id: "left", decisions: leftDec, traffics: view.leftTraffic },
        { id: "right", decisions: rightDec, traffics: view.rightTraffic },
      ],
    }, segSpec()));
    const defs = metricDefs();
    const weeks = weeksOn();
    if (!defs.length) return `<p class="da-results-placeholder">指标里没有回放和交叉用的项。</p>`;
    function one(paneId) {
      const pane = data.panes[paneId];
      const bags = [];
      weeks.forEach((week) => {
        const slot = pane.byWeek[week] || {};
        data.pairs.forEach((pair) => bags.push(slot[pair[0] + "\0" + pair[1]] || null));
      });
      const scales = collectScales(bags);
      let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">周</th>`;
      data.pairs.forEach((pair, i) => {
        const top = esc(view.crossA + " · " + showValue(pair[0]));
        const bottom = esc("× " + view.crossB + " · " + showValue(pair[1]));
        html += `<th class="dr-detail-group-h dr-level-seg-h${i ? " dr-level-seg-start" : ""}" colspan="${defs.length}"><span class="dr-admit-cross-head"><span>${top}</span><span>${bottom}</span></span></th>`;
      });
      html += `</tr><tr>`;
      data.pairs.forEach((pair, i) => {
        defs.forEach((m, mi) => {
          const name = m.id === "due_amt" ? "到期金额(万)" : m.name;
          html += `<th class="dr-detail-metric-h${mi === 0 && i ? " dr-level-seg-start" : ""}">${esc(name)}</th>`;
        });
      });
      html += `</tr></thead><tbody>`;
      weeks.forEach((week) => {
        const slot = pane.byWeek[week] || {};
        html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
        data.pairs.forEach((pair, i) => {
          html += metricCells(slot[pair[0] + "\0" + pair[1]], scales, i);
        });
        html += `</tr>`;
      });
      html += `<tr class="dr-latest-total"><td class="dr-detail-sticky">合计</td>`;
      data.pairs.forEach((pair, i) => {
        const bags = weeks.map((week) => {
          const slot = pane.byWeek[week] || {};
          return slot[pair[0] + "\0" + pair[1]] || null;
        });
        html += metricCells(SM().sumBags(bags), scales, i);
      });
      html += `</tr></tbody>`;
      return wrapTable(html);
    }
    let picks = `<div class="dr-filter-row"><span class="dr-filter-label">交叉</span>`;
    picks += `<select data-admit-cross="A">${ctx.rejCols.map((c) => `<option value="${esc(c)}"${c === view.crossA ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
    picks += `<span class="config-muted">×</span>`;
    picks += `<select data-admit-cross="B">${ctx.rejCols.map((c) => `<option value="${esc(c)}"${c === view.crossB ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
    picks += `</div>`;
    const left = paneFilters("left", ctx.decisions, leftTrafficAll, leftDec, view.leftTraffic) + one("left");
    const right = paneFilters("right", ctx.decisions, rightTrafficAll, rightDec, view.rightTraffic) + one("right");
    return picks + `<div class="dr-level-ab-grid">` + sidePane("左", left) + sidePane("右", right) + `</div>`;
  }

  const NUM_OP = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

  function numLogic(col, op, val) {
    const sym = NUM_OP[op] || op || "?";
    return (col || "列") + " " + sym + " " + (val == null ? "" : String(val));
  }

  function wrapCompound(text) {
    if (text.indexOf(" 且 ") >= 0 || text.indexOf(" 或 ") >= 0) return "（" + text + "）";
    return text;
  }

  function exprLogic(node) {
    if (!node || typeof node !== "object") return "";
    if (node.not) {
      const inner = exprLogic(node.not);
      return inner ? "非（" + inner + "）" : "";
    }
    if (node.op === "and" || node.op === "or") {
      const joiner = node.op === "and" ? " 且 " : " 或 ";
      const parts = (node.items || []).map(exprLogic).filter(Boolean);
      if (!parts.length) return "";
      return parts.map(wrapCompound).join(joiner);
    }
    if (node.type === "num") return numLogic(node.col, node.op, node.val);
    if (node.type === "enum") {
      const sym = node.op === "neq" ? "≠" : "=";
      return (node.col || "列") + " " + sym + " " + (node.val == null ? "" : String(node.val));
    }
    return "";
  }

  function ruleLogicText(rule) {
    if (!rule) return "";
    const type = rule.type || "binary";
    if (type === "binary") {
      const zero = rule.hitWhen === "zero" || rule.hitWhen === 0 || rule.hitWhen === "0";
      return (rule.col || "列") + " = " + (zero ? "0" : "1");
    }
    if (type === "num") return numLogic(rule.col, rule.op, rule.val);
    if (type === "sum") {
      const cols = Array.isArray(rule.cols) ? rule.cols : [];
      const sym = NUM_OP[rule.op] || rule.op || "?";
      return cols.join(" + ") + " " + sym + " " + (rule.val == null ? "" : String(rule.val));
    }
    if (type === "expr") return exprLogic(rule.expr);
    return "";
  }

  function ruleLabel(rule) {
    const name = esc(rule.name || rule.col || "规则");
    if (rule.kind === "hard") return name;
    return `<span class="dr-admit-drag" data-admit-fall-drag="1">⋮⋮</span>${name}`;
  }

  function ruleCell(rule) {
    const logic = ruleLogicText(rule);
    const attr = logic ? ` data-admit-logic="${esc(logic)}"` : "";
    return `<td class="dr-detail-sticky dr-admit-rule-cell"${attr}>${ruleLabel(rule)}</td>`;
  }

  function sampleHead(groupLabel, whenText) {
    return "决策组 " + groupLabel + "的 " + (whenText || "全部进件") + " 样本";
  }

  function uniTable(spec, weeks, side) {
    const labels = spec.labels || [];
    if (!labels.length) return `<p class="da-results-placeholder">没有可展示的取值。</p>`;
    const sideCells = (spec.cells && spec.cells[side]) || {};
    const sideDue = (spec.due && spec.due[side]) || {};
    const rates = [];
    weeks.forEach((week) => {
      const row = sideCells[week] || {};
      labels.forEach((label) => {
        const cell = row[label];
        if (cell && cell.fm >= 10) rates.push(cell.fz / cell.fm);
      });
    });
    const scale = rates.length ? { min: Math.min.apply(null, rates), max: Math.max.apply(null, rates) } : null;
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">周</th>`;
    labels.forEach((label) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="2">${esc(label)}</th>`;
    });
    html += `</tr><tr>`;
    labels.forEach((label, i) => {
      html += `<th class="dr-detail-metric-h${i ? " dr-level-seg-start" : ""}">订单风险</th>`;
      html += `<th class="dr-detail-metric-h">到期占比</th>`;
    });
    html += `</tr></thead><tbody>`;
    weeks.forEach((week) => {
      const row = sideCells[week] || {};
      const den = sideDue[week] || 0;
      html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
      labels.forEach((label, i) => {
        const cell = row[label];
        const risk = cell && cell.fm > 0 ? cell.fz / cell.fm : null;
        const share = den > 0 ? ((cell && cell.fm) || 0) / den : null;
        const edge = i ? " dr-level-seg-start" : "";
        const style = cell && cell.fm >= 10 ? heatAttr(risk, scale) : "";
        html += `<td class="num${edge}"${style}>${esc(fmtPct(risk))}</td>`;
        html += `<td class="num">${esc(fmtPct(share))}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody>`;
    return wrapTable(html);
  }

  function uniHtml(card, whenText) {
    const vars = card.vars || [];
    const weeks = card.uniWeeks || [];
    if (!vars.length) return `<p class="config-muted dr-track-note">这张卡没有要展示的规则变量。</p>`;
    const a = ctx.sides.a;
    const b = ctx.sides.b;
    let html = `<p class="config-muted dr-track-note">到期样本。取值少于 10 个按枚举升序，否则等频 5 箱，切点在两侧合并的到期样本上冻结。</p>`;
    vars.forEach((spec) => {
      html += `<div class="dr-admit-uni" data-admit-uni="${esc(spec.col)}">`;
      html += `<div class="dr-admit-uni-name">${esc(spec.col)}</div>`;
      html += `<div class="dr-level-ab-grid">`;
      html += sidePane(sampleHead(a.label, whenText), uniTable(spec, weeks, "a"));
      html += sidePane(sampleHead(b.label, whenText), uniTable(spec, weeks, "b"));
      html += `</div></div>`;
    });
    return html;
  }

  function fallLatestSummary(card) {
    const weeks = card.weeks || [];
    for (let i = weeks.length - 1; i >= 0; i--) {
      const week = weeks[i];
      const pre = card.pre && card.pre[week];
      if (!pre || !pre.total) continue;
      let wf = 0;
      (pre.steps || []).forEach((step) => { wf += step.wf || 0; });
      return weekLabel(week) + " 瀑布命中 " + fmtPct(wf / pre.total);
    }
    return "";
  }

  function fallCardHtml(card) {
    const when = card.route.when || {};
    const whenText = Object.keys(when).map((k) => k + "=" + (Array.isArray(when[k]) ? when[k].map(showValue).join("/") : showValue(when[k]))).join(" · ");
    const open = !!(view.fallOpen && view.fallOpen[card.route.id]);
    const latest = fallLatestSummary(card);
    let html = `<article class="dr-track-model-card${open ? "" : " is-collapsed"}" data-admit-fall-card="${esc(card.route.id)}">`;
    html += `<div class="dr-track-model-head" style="cursor:default"><span class="dr-track-model-tag">${esc(card.route.id)}</span><span class="dr-track-model-name">${esc(whenText || "全部进件")}</span>`;
    if (latest) html += `<span class="dr-fall-latest">${esc(latest)}</span>`;
    html += `<button type="button" class="dr-track-model-collapse" data-admit-fall-toggle="${esc(card.route.id)}"><span class="dr-collapse-shut">展开</span><span class="dr-collapse-open">收起</span></button></div>`;
    html += `<div class="dr-track-model-body">`;
    if (card.missing.length) html += `<p class="config-muted dr-track-note">这些列不在 CSV 里，对应规则不会命中：${esc(card.missing.join("、"))}</p>`;
    html += `<h3 class="dr-admit-sub">贷前</h3>`;
    html += wrapTable(preTable(card, card.weeks || []));
    html += `<h3 class="dr-admit-sub">贷后</h3>`;
    html += wrapTable(postTable(card, card.weeks || []));
    html += `<h3 class="dr-admit-sub">单变量</h3>`;
    html += uniHtml(card, whenText);
    html += `</div></article>`;
    return html;
  }

  function fallsHtml() {
    const ver = activeVersion();
    if (!ver) return `<p class="da-results-placeholder">未配置。把路由写进 strategy-routes.js，或在上面上传 JSON。</p>`;
    const list = versions();
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">版本</span><div class="dr-chip-row">`;
    list.forEach((item) => {
      html += chip(item.id === ver.id, "data-admit-version", item.id, item.name || item.id);
    });
    html += `</div></div>`;
    html += `<p class="config-muted dr-track-note">拖软规则改顺序后，瀑布命中率、累计命中率和瀑布命中风险会重算。单规则和仅命中不随顺序变。硬规则停在第一行。</p>`;
    const data = SM().waterfall(ctx, routesForWaterfall(ver), segSpec());
    if (!data.cards.length) return html + `<p class="da-results-placeholder">当前筛选下没有匹配的策略。</p>`;
    data.cards.forEach((card) => { card.weeks = data.weeks; });
    html += `<div class="dr-track-models">`;
    data.cards.forEach((card) => { html += fallCardHtml(card); });
    html += `</div>`;
    return html;
  }

  function preTable(card, weeks) {
    const names = ["单规则命中率", "瀑布命中率", "仅命中率", "累计命中率"];
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">规则</th>`;
    weeks.forEach((week, i) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h${i ? " dr-level-seg-start" : ""}" colspan="${names.length}">${esc(weekLabel(week))}</th>`;
    });
    html += `</tr><tr>`;
    weeks.forEach((week, i) => {
      names.forEach((name, mi) => {
        html += `<th class="dr-detail-metric-h${mi === 0 && i ? " dr-level-seg-start" : ""}">${name}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    (card.route.rules || []).forEach((rule, s) => {
      html += `<tr data-admit-fall-key="${esc(rule.key)}" data-admit-fall-kind="${rule.kind === "hard" ? "hard" : "soft"}">${ruleCell(rule)}`;
      weeks.forEach((week, i) => {
        const pre = card.pre[week];
        const step = pre && pre.steps[s];
        const edge = i ? " dr-level-seg-start" : "";
        html += `<td class="num${edge}">${esc(step ? fmtPct(step.singleRate) : "—")}</td>`;
        html += `<td class="num">${esc(step ? fmtPct(step.wfRate) : "—")}</td>`;
        html += `<td class="num">${esc(step && step.onlyRate != null ? fmtPct(step.onlyRate) : "—")}</td>`;
        html += `<td class="num">${esc(step ? fmtPct(step.cumRate) : "—")}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody>`;
    return html;
  }

  function postRiskCells(bag, edge, show) {
    if (!show) return `<td class="num${edge}">—</td><td class="num">—</td>`;
    const risk = SM().metricValue(bag, "risk");
    const n = SM().metricValue(bag, "due_cnt");
    return `<td class="num${edge}">${esc(fmtPct(risk))}</td><td class="num">${esc(fmtInt(n))}</td>`;
  }

  function postTable(card, weeks) {
    const names = ["单规则命中风险", "样本量", "瀑布命中风险", "样本量", "仅命中风险", "样本量"];
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="2">规则</th>`;
    weeks.forEach((week, i) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h${i ? " dr-level-seg-start" : ""}" colspan="${names.length}">${esc(weekLabel(week))}</th>`;
    });
    html += `</tr><tr>`;
    weeks.forEach((week, i) => {
      names.forEach((name, mi) => {
        html += `<th class="dr-detail-metric-h${mi === 0 && i ? " dr-level-seg-start" : ""}">${name}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    (card.route.rules || []).forEach((rule, s) => {
      const hard = rule.kind === "hard";
      html += `<tr data-admit-fall-key="${esc(rule.key)}" data-admit-fall-kind="${hard ? "hard" : "soft"}">${ruleCell(rule)}`;
      weeks.forEach((week, i) => {
        const post = card.post[week];
        const step = post && post.steps[s];
        const edge = i ? " dr-level-seg-start" : "";
        html += postRiskCells(step && step.single, edge, true);
        html += postRiskCells(step && step.wf, "", true);
        html += postRiskCells(step && step.only, "", !hard);
      });
      html += `</tr>`;
    });
    html += `<tr><td class="dr-detail-sticky">剩余通过</td>`;
    weeks.forEach((week, i) => {
      const post = card.post[week];
      const risk = SM().metricValue(post && post.remain, "risk");
      const n = SM().metricValue(post && post.remain, "due_cnt");
      const text = risk == null && n == null ? "—" : (fmtPct(risk) + " · 到期 " + fmtInt(n));
      html += `<td class="num${i ? " dr-level-seg-start" : ""}" colspan="6">${esc(text)}</td>`;
    });
    html += `</tr></tbody>`;
    return html;
  }

  function headHtml() {
    const weeks = ctx.weeks || [];
    const open = !!view.filtersOpen;
    const metricNames = chipMetrics().filter((m) => selectedIds().indexOf(m.id) >= 0).map(metricLabel);
    const summary = "时间 " + weekLabel(view.weekFrom) + " 至 " + weekLabel(view.weekTo) + " · 客群 " + segSummary() + " · 指标 " + metricNames.join("、");
    let html = `<div class="dr-chapter-stick"><div class="dr-chapter-head" id="drAdmitHead">`;
    html += `<div class="dr-head-bar"><h2 class="dr-chapter-title">准入策略监控</h2>`;
    html += `<button type="button" class="dr-chip dr-head-toggle" data-admit-head-toggle="1">${open ? "收起" : "筛选"}</button></div>`;
    html += `<p class="dr-head-summary">${esc(summary)}</p></div>`;
    html += `<div class="dr-filter-band${open ? "" : " is-filters-collapsed"}" id="drAdmitFilters">`;
    html += `<span class="dr-filter-band-label">筛选</span><div class="dr-filter-band-body">`;
    html += `<p class="config-muted dr-track-note">rej_ 列 1 = 拒绝。空值和 0 合并成一列，展示为 0。时间和客群作用在策略版本现状、回放、交叉和瀑布。指标作用在策略版本现状、回放和交叉。</p>`;
    html += `<div class="dr-filter-row"><span class="dr-filter-label">时间</span>`;
    html += `<select data-admit-week="from">${weeks.map((w) => `<option value="${esc(w)}"${w === view.weekFrom ? " selected" : ""}>${esc(weekLabel(w))}</option>`).join("")}</select>`;
    html += `<span class="config-muted">至</span>`;
    html += `<select data-admit-week="to">${weeks.map((w) => `<option value="${esc(w)}"${w === view.weekTo ? " selected" : ""}>${esc(weekLabel(w))}</option>`).join("")}</select>`;
    html += `</div>`;
    if (view.segCols.length) {
      html += `<div class="dr-filter-row"><span class="dr-filter-label">客群</span><span class="config-muted">按取值筛选。全选等于不过滤。</span></div>`;
      view.segCols.forEach((col) => { html += columnRow(col); });
    } else html += `<div class="dr-filter-row"><span class="dr-filter-label">客群</span><span>没有可筛的客群列，按全量</span></div>`;
    html += `<div class="dr-filter-row"><span class="dr-filter-label">指标</span><div class="dr-chip-row">`;
    const picked = selectedIds();
    chipMetrics().forEach((m) => {
      html += chip(picked.indexOf(m.id) >= 0, "data-admit-metric", m.id, metricLabel(m));
    });
    html += `</div></div>`;
    const ver = activeVersion();
    const nRoute = ver ? ver.routes.length : 0;
    html += `<div class="dr-filter-row"><span class="dr-filter-label">策略</span>`;
    html += `<label class="btn btn-sm">上传 JSON<input id="drAdmitRoutesFile" type="file" accept="application/json,.json" hidden /></label>`;
    html += `<span class="config-muted">${esc(routeNote || (ver ? ((ver.name || ver.id) + " · " + nRoute + " 条") : "当前路由 0 条"))}</span></div>`;
    html += `</div></div></div>`;
    return html;
  }

  function render() {
    const host = document.getElementById("drChapterAdmit");
    if (!host || !ctx || !view) return;
    pullSharedCols();
    host.innerHTML = headHtml()
      + `<div class="dr-block" id="drAdmitStatus"><div class="dr-block-head"><h2>1. 策略版本现状</h2></div><div class="dr-block-body">${statusHtml()}</div></div>`
      + `<div class="dr-block" id="drAdmitReplay"><div class="dr-block-head"><h2>2. 版本回放</h2></div><div class="dr-block-body">${replayHtml()}</div></div>`
      + `<div class="dr-block" id="drAdmitCross"><div class="dr-block-head"><h2>3. 版本交叉</h2></div><div class="dr-block-body"><p class="config-muted dr-track-note">左右各是一群人。交叉是这群人身上两个 rej_ 的取值。</p>${crossHtml()}</div></div>`
      + `<div class="dr-block" id="drAdmitFalls"><div class="dr-block-head"><h2>4. 策略瀑布</h2></div><div class="dr-block-body">${fallsHtml()}</div></div>`;
    host.querySelectorAll(".dr-detail-table-wrap").forEach((wrap) => syncSticky(wrap.parentElement || wrap));
  }

  function onClick(ev) {
    const headBtn = ev.target.closest("[data-admit-head-toggle]");
    if (headBtn && view) {
      view.filtersOpen = !view.filtersOpen;
      const band = document.getElementById("drAdmitFilters");
      if (band) band.classList.toggle("is-filters-collapsed", !view.filtersOpen);
      headBtn.textContent = view.filtersOpen ? "收起" : "筛选";
      return;
    }
    const t = ev.target.closest("[data-admit-metric],[data-admit-seg-vals],[data-admit-seg-val],[data-admit-seg-expand],[data-admit-rej],[data-admit-dec],[data-admit-traffic],[data-admit-version],[data-admit-fall-toggle]");
    if (!t || !view) return;
    if (t.hasAttribute("data-admit-fall-toggle")) {
      const id = t.getAttribute("data-admit-fall-toggle");
      if (!view.fallOpen) view.fallOpen = {};
      view.fallOpen[id] = !view.fallOpen[id];
      const article = t.closest("[data-admit-fall-card]");
      if (article) article.classList.toggle("is-collapsed", !view.fallOpen[id]);
      return;
    }
    if (t.hasAttribute("data-admit-version")) {
      view.fallVersion = t.getAttribute("data-admit-version");
      render();
      return;
    }
    if (t.hasAttribute("data-admit-metric")) {
      const id = t.getAttribute("data-admit-metric");
      view.metrics = toggleList(selectedIds(), chipMetrics().map((m) => m.id), id, false);
      render();
      return;
    }
    if (t.hasAttribute("data-admit-seg-expand")) {
      colState(t.getAttribute("data-admit-seg-expand")).open = !colState(t.getAttribute("data-admit-seg-expand")).open;
      render();
      return;
    }
    if (t.hasAttribute("data-admit-seg-vals")) {
      colState(t.getAttribute("data-admit-seg-vals")).values = [];
      render();
      return;
    }
    if (t.hasAttribute("data-admit-seg-val")) {
      const col = t.getAttribute("data-admit-seg-col");
      const value = t.getAttribute("data-admit-seg-value") || "";
      const st = colState(col);
      st.values = toggleList(st.values, columnValues(col), value, false);
      render();
      return;
    }
    if (t.hasAttribute("data-admit-rej")) {
      const col = t.getAttribute("data-admit-rej");
      const base = view.replayRej.length ? view.replayRej : ctx.rejCols.slice();
      view.replayRej = toggleList(base, ctx.rejCols, col, false);
      render();
      return;
    }
    if (t.hasAttribute("data-admit-dec")) {
      const pane = t.getAttribute("data-admit-pane");
      const name = t.getAttribute("data-admit-name") || "";
      const field = pane === "right" ? "rightDec" : "leftDec";
      const fallback = pane === "right" ? [ctx.sides.b.value] : [ctx.sides.a.value];
      const current = view[field].length ? view[field] : fallback.filter(Boolean);
      view[field] = toggleKeep(current, ctx.decisions, name);
      if (pane === "right") view.rightTraffic = [];
      else view.leftTraffic = [];
      render();
      return;
    }
    if (t.hasAttribute("data-admit-traffic")) {
      const pane = t.getAttribute("data-admit-pane");
      const name = t.getAttribute("data-admit-name") || "";
      const field = pane === "right" ? "rightTraffic" : "leftTraffic";
      const decField = pane === "right" ? view.rightDec : view.leftDec;
      const all = SM().trafficsFor(ctx, SM().activeValues(decField.length ? decField : (pane === "right" ? [ctx.sides.b.value] : [ctx.sides.a.value]).filter(Boolean), ctx.decisions));
      view[field] = toggleList(view[field], all, name, false);
      render();
    }
  }

  function onChange(ev) {
    const t = ev.target;
    if (!t || !view) return;
    if (t.hasAttribute("data-admit-week")) {
      const which = t.getAttribute("data-admit-week");
      if (which === "from") view.weekFrom = t.value;
      else view.weekTo = t.value;
      if (view.weekFrom && view.weekTo && view.weekFrom > view.weekTo) {
        const swap = view.weekFrom;
        view.weekFrom = view.weekTo;
        view.weekTo = swap;
      }
      render();
      return;
    }
    if (t.hasAttribute("data-admit-cross")) {
      if (t.getAttribute("data-admit-cross") === "A") view.crossA = t.value;
      else view.crossB = t.value;
      render();
      return;
    }
    if (t.id === "drAdmitRoutesFile" && t.files && t.files[0]) {
      const file = t.files[0];
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const pack = JSON.parse(String(reader.result || ""));
          const vers = pack && Array.isArray(pack.versions) ? pack.versions : null;
          const routes = pack && Array.isArray(pack.routes) ? pack.routes : null;
          if (!vers && !routes) throw new Error("需要 versions 或 routes");
          routesOverride = pack;
          view.fallVersion = "";
          view.fallOrder = {};
          routeNote = vers
            ? ("已上传 " + vers.length + " 个版本，只在当次生效")
            : ("已上传 " + routes.length + " 条，只在当次生效");
        } catch (err) {
          routeNote = "JSON 没有读入：" + (err && err.message ? err.message : err);
        }
        render();
      };
      reader.readAsText(file);
    }
  }

  function moveSoft(routeId, from, to) {
    const ver = activeVersion();
    if (!ver) return;
    const route = ver.routes.find((item) => item.id === routeId);
    if (!route) return;
    const keys = orderedRules(ver, route).filter((rule) => rule.kind !== "hard").map((rule) => rule.key);
    const at = keys.indexOf(from);
    const toAt = keys.indexOf(to);
    if (at < 0 || toAt < 0 || at === toAt) return;
    keys.splice(at, 1);
    keys.splice(toAt, 0, from);
    if (!view.fallOrder[ver.id]) view.fallOrder[ver.id] = {};
    view.fallOrder[ver.id][routeId] = keys;
  }

  function refreshFallCard(routeId) {
    const ver = activeVersion();
    if (!ver) return;
    const route = ver.routes.find((item) => item.id === routeId);
    if (!route) return;
    const ordered = { id: route.id, versionId: ver.id, when: route.when, rules: orderedRules(ver, route), varRules: route.rules };
    const data = SM().waterfall(ctx, [ordered], segSpec());
    const card = data.cards[0];
    const prev = document.querySelector('#drAdmitFalls [data-admit-fall-card="' + routeId + '"]');
    if (!card || !prev) return;
    card.weeks = data.weeks;
    prev.outerHTML = fallCardHtml(card);
    const next = document.querySelector('#drAdmitFalls [data-admit-fall-card="' + routeId + '"]');
    if (!next) return;
    next.querySelectorAll(".dr-detail-table-wrap").forEach((wrap) => syncSticky(wrap.parentElement || wrap));
  }

  function bindRuleTip(chapter) {
    let tip = document.getElementById("drAdmitRuleTip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "drAdmitRuleTip";
      tip.className = "dr-admit-rule-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    function hide() {
      tip.hidden = true;
      tip.textContent = "";
    }
    function place(text, ev) {
      tip.textContent = text;
      tip.hidden = false;
      const pad = 14;
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      const rect = tip.getBoundingClientRect();
      if (x + rect.width > window.innerWidth - 8) x = Math.max(8, ev.clientX - rect.width - pad);
      if (y + rect.height > window.innerHeight - 8) y = Math.max(8, ev.clientY - rect.height - pad);
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    }
    function textAt(target) {
      if (!target || !target.closest) return "";
      const drag = target.closest(".dr-admit-drag");
      if (drag && chapter.contains(drag)) return "拖动调整顺序";
      const el = target.closest("[data-admit-logic]");
      if (!el || !chapter.contains(el)) return "";
      return el.getAttribute("data-admit-logic") || "";
    }
    chapter.addEventListener("mouseover", (ev) => {
      const text = textAt(ev.target);
      if (!text) { hide(); return; }
      place(text, ev);
    });
    chapter.addEventListener("mousemove", (ev) => {
      const text = textAt(ev.target);
      if (!text) { hide(); return; }
      place(text, ev);
    });
    chapter.addEventListener("mouseout", (ev) => {
      const next = ev.relatedTarget;
      if (next && chapter.contains(next) && textAt(next)) return;
      hide();
    });
    chapter.addEventListener("scroll", hide, true);
  }

  function fallDropIndex(origin, pointerY, mids) {
    let target = origin;
    if (!mids.length || origin < 0 || origin >= mids.length) return origin;
    if (pointerY > mids[origin]) {
      for (let i = origin + 1; i < mids.length; i += 1) {
        if (pointerY > mids[i]) target = i;
      }
    } else {
      for (let i = origin - 1; i >= 0; i -= 1) {
        if (pointerY < mids[i]) target = i;
      }
    }
    return target;
  }

  function bindFallDrag(chapter) {
    let drag = null;
    let ticket = 0;

    function paintRow(row, y, transition) {
      const moving = y || transition;
      const value = moving ? "translateY(" + (y || 0) + "px)" : "";
      for (let i = 0; i < row.cells.length; i += 1) {
        row.cells[i].style.transition = transition || "";
        row.cells[i].style.transform = value;
      }
    }

    function clearDrag(state) {
      if (!state) return;
      state.rows.forEach((row) => {
        paintRow(row, 0, "");
        row.classList.remove("is-fall-dragging", "is-fall-over");
      });
      chapter.querySelectorAll("tr.is-fall-over, tr.is-fall-dragging").forEach((row) => {
        row.classList.remove("is-fall-over", "is-fall-dragging");
      });
    }

    function finish(commit) {
      const state = drag;
      const token = ++ticket;
      drag = null;
      window.removeEventListener("keydown", onKey);
      if (!state) return;
      const targetRow = state.rows[state.target];
      const to = targetRow && targetRow.getAttribute("data-admit-fall-key");
      const apply = commit && state.moved && to && to !== state.key;
      if (apply) {
        clearDrag(state);
        moveSoft(state.routeId, state.key, to);
        refreshFallCard(state.routeId);
        return;
      }
      if (!state.moved || state.reduce) {
        clearDrag(state);
        return;
      }
      state.rows.forEach((row) => {
        paintRow(row, 0, "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)");
        row.classList.remove("is-fall-dragging", "is-fall-over");
      });
      window.setTimeout(() => {
        if (token !== ticket) return;
        clearDrag(state);
      }, 180);
    }

    function onKey(ev) {
      if (ev.key !== "Escape" || !drag) return;
      ev.preventDefault();
      finish(false);
    }

    chapter.addEventListener("pointerdown", (ev) => {
      if (drag || ev.button !== 0) return;
      const handle = ev.target.closest && ev.target.closest("[data-admit-fall-drag]");
      if (!handle) return;
      const tr = handle.closest("tr");
      const card = handle.closest("[data-admit-fall-card]");
      const table = handle.closest("table");
      if (!tr || !card || !table || tr.getAttribute("data-admit-fall-kind") === "hard") return;
      ticket += 1;
      const rows = Array.prototype.filter.call(
        table.querySelectorAll("tbody tr[data-admit-fall-key]"),
        (row) => row.getAttribute("data-admit-fall-kind") !== "hard"
      );
      const origin = rows.indexOf(tr);
      if (origin < 0) return;
      drag = {
        pointerId: ev.pointerId,
        routeId: card.getAttribute("data-admit-fall-card"),
        key: tr.getAttribute("data-admit-fall-key"),
        tr,
        rows,
        origin,
        target: origin,
        height: tr.getBoundingClientRect().height,
        startY: ev.clientY,
        mids: rows.map((row) => {
          const box = row.getBoundingClientRect();
          return box.top + box.height / 2;
        }),
        moved: false,
        reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      try { handle.setPointerCapture(ev.pointerId); } catch (err) { /* 指针已结束 */ }
      window.addEventListener("keydown", onKey);
    });

    chapter.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const delta = ev.clientY - drag.startY;
      if (!drag.moved && Math.abs(delta) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.tr.classList.add("is-fall-dragging");
      }
      const target = fallDropIndex(drag.origin, ev.clientY, drag.mids);
      paintRow(drag.tr, delta, "none");
      if (target === drag.target) return;
      drag.target = target;
      if (drag.reduce) {
        drag.rows.forEach((row, i) => row.classList.toggle("is-fall-over", i === target && i !== drag.origin));
        return;
      }
      const shift = "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      drag.rows.forEach((row, i) => {
        if (i === drag.origin) return;
        let y = 0;
        if (target > drag.origin && i > drag.origin && i <= target) y = -drag.height;
        if (target < drag.origin && i < drag.origin && i >= target) y = drag.height;
        paintRow(row, y, shift);
      });
    });

    chapter.addEventListener("pointerup", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      finish(true);
    });
    chapter.addEventListener("pointercancel", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      finish(false);
    });
  }

  function mount(result, host) {
    if (!host || !result) return;
    const rows = RV.app.state.rawRows || [];
    const headers = RV.app.state.headers || [];
    const old = document.getElementById("drChapterAdmit");
    if (old) old.remove();
    let error = "";
    try {
      const cube = RV.app.state && RV.app.state.drStrategyCube;
      ctx = cube ? SM().hydrate(cube) : SM().prepare(rows, {
        timeCol: result.config && result.config.timeCol,
        decisionCol: result.config && result.config.decisionCol,
        weekPeriods: result.weekPeriods || [],
        decisionGroups: result.decisionGroups || [],
        headers,
      });
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      ctx = null;
    }
    host.insertAdjacentHTML("beforeend", `<div class="dr-chapter" id="drChapterAdmit"></div>`);
    const chapter = document.getElementById("drChapterAdmit");
    if (error || !ctx) {
      chapter.innerHTML = `<div class="dr-chapter-head" id="drAdmitHead"><h2 class="dr-chapter-title">准入策略监控</h2><p class="da-results-placeholder">${esc(error || "没有可计算的样本。")}</p></div>`;
      return;
    }
    lastResult = result;
    view = {
      metrics: [],
      weekFrom: ctx.weeks[0] || "",
      weekTo: ctx.weeks[ctx.weeks.length - 1] || "",
      segCols: [],
      colState: {},
      replayRej: [],
      crossA: ctx.rejCols[0] || "",
      crossB: ctx.rejCols[1] || ctx.rejCols[0] || "",
      leftDec: ctx.sides.a.value ? [ctx.sides.a.value] : [],
      rightDec: ctx.sides.b.value ? [ctx.sides.b.value] : [],
      leftTraffic: [],
      rightTraffic: [],
      fallVersion: "",
      fallOrder: {},
      fallOpen: {},
      filtersOpen: false,
    };
    chapter.addEventListener("click", onClick);
    chapter.addEventListener("change", onChange);
    bindFallDrag(chapter);
    bindRuleTip(chapter);
    render();
  }

  function syncSegmentCols() {
    if (!ctx || !view || !document.getElementById("drChapterAdmit")) return;
    const prev = (view.segCols || []).join("\0");
    pullSharedCols();
    if ((view.segCols || []).join("\0") !== prev) render();
  }

  RV.ui = RV.ui || {};
  RV.ui.strategyMonitor = { mount, syncSegmentCols };
})(window.RV);
