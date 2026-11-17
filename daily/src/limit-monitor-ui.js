/**
 * 额度策略监控。计算在 src/limit-monitor.js。
 */
(function (RV) {
  "use strict";

  const LM = () => RV.domain.limitMonitor;

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

  function fmtPct(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return (v * 100).toFixed(2) + "%";
  }

  function fmtInt(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return Math.round(v).toLocaleString();
  }

  function fmtNum(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMetric(id, v) {
    if (id === "gold_rate") return v == null || !Number.isFinite(v) ? "—" : Math.round(v * 100) + "%";
    if (id === "risk" || id === "amt_risk") return fmtPct(v);
    if (id === "due_cnt") return fmtInt(v);
    return fmtNum(v);
  }

  function isHeatId(id) {
    return id === "risk" || id === "amt_risk";
  }

  const HEAT_IDS = ["risk", "amt_risk"];

  function heatAttr(rate, scale) {
    if (!scale || rate == null || !Number.isFinite(rate) || !RV.infra.rateHeatStyle) return "";
    const css = RV.infra.rateHeatStyle(rate, scale.min, scale.max);
    return css ? ` style="${css}"` : "";
  }

  function heatDueOk(bag) {
    const n = LM().metricValue(bag, "due_cnt");
    return n != null && Number.isFinite(n) && n >= 10;
  }

  function heatStyle(bag, id, value, scale) {
    if (!isHeatId(id) || !heatDueOk(bag)) return "";
    return heatAttr(value, scale);
  }

  function scaleOf(values) {
    const nums = values.filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  function syncSticky(root) {
    const wraps = root ? root.querySelectorAll(".dr-detail-table-wrap") : [];
    wraps.forEach((wrap) => {
      const table = wrap.querySelector(".dr-detail-table");
      const row1 = table && table.tHead && table.tHead.rows[0];
      if (!row1) return;
      const first = row1.querySelector("th.dr-detail-sticky");
      if (first) wrap.style.setProperty("--dr-detail-col1-w", first.offsetWidth + "px");
      const row1H = row1.querySelector(".dr-detail-group-h") || row1.querySelector("th:not([rowspan])");
      if (row1H) wrap.style.setProperty("--dr-detail-thead-row1", row1H.offsetHeight + "px");
      const row2 = table.tHead.rows[1];
      if (table.tHead.rows[2] && row2) {
        const mid = row2.querySelector("th");
        if (mid) wrap.style.setProperty("--dr-detail-thead-row2", mid.offsetHeight + "px");
      }
    });
  }

  let ctx = null;
  let view = null;
  let lastResult = null;
  let cache = null;

  function chip(on, attr, value, label) {
    return `<button type="button" class="dr-chip${on ? " active" : ""}" ${attr}="${esc(value)}">${esc(label)}</button>`;
  }

  function toggleList(current, all, value) {
    const base = current && current.length ? current.slice() : all.slice();
    const at = base.indexOf(value);
    if (at >= 0) {
      if (base.length === 1) return current && current.length ? current.slice() : [];
      base.splice(at, 1);
    } else {
      base.push(value);
    }
    if (!base.length || base.length === all.length) return [];
    return base;
  }

  function toggleKeep(current, all, value) {
    const base = (current && current.length ? current : all).slice();
    const at = base.indexOf(value);
    if (at >= 0) {
      if (base.length === 1) return base;
      base.splice(at, 1);
    } else if (all.indexOf(value) >= 0) {
      base.push(value);
    }
    return base;
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
    return LM().listColumnValues(ctx, col, view.weekFrom, view.weekTo);
  }

  function segFilters() {
    pullSharedCols();
    return (view.segCols || []).map((col) => {
      const st = colState(col);
      return { col: col, skip: !!st.skip, values: (st.values || []).slice() };
    });
  }

  function pairOf(kind) {
    return kind === "change" ? view.changePair : view.levelPair;
  }

  function fieldList(kind) {
    return kind === "change" ? (ctx.changeFields || []) : (ctx.levelFields || []);
  }

  function pickedBinCol(kind) {
    const fields = fieldList(kind);
    const saved = kind === "change" ? view.changeCol : view.levelCol;
    const fallback = kind === "change" ? "level_change_num" : "level";
    if (saved && fields.indexOf(saved) >= 0) return saved;
    if (fields.indexOf(fallback) >= 0) return fallback;
    return fields[0] || "";
  }

  function binColRow(kind) {
    const fields = fieldList(kind);
    const cur = pickedBinCol(kind);
    if (!fields.length) return "";
    return `<div class="dr-filter-row"><span class="dr-filter-label">分箱列</span><select data-limit-bin-col="${esc(kind)}">${
      fields.map((col) => `<option value="${esc(col)}"${col === cur ? " selected" : ""}>${esc(col)}</option>`).join("")
    }</select></div>`;
  }

  function ensurePair(kind) {
    const fields = fieldList(kind);
    const pair = pairOf(kind);
    if (!fields.length) return;
    if (fields.indexOf(pair.colA) < 0) pair.colA = fields[0];
    if (fields.indexOf(pair.colB) < 0) pair.colB = fields[1] || fields[0];
    const decs = ctx.decisions || [];
    if (!pair.leftDec.length || !pair.leftDec.some((d) => decs.indexOf(d) >= 0)) {
      pair.leftDec = ctx.aValue ? [ctx.aValue] : (decs[0] ? [decs[0]] : []);
    }
    if (!pair.rightDec.length || !pair.rightDec.some((d) => decs.indexOf(d) >= 0)) {
      pair.rightDec = ctx.bValue ? [ctx.bValue] : (decs[1] ? [decs[1]] : (decs[0] ? [decs[0]] : []));
    }
  }

  function currentSpec() {
    ensurePair("level");
    ensurePair("change");
    return {
      weekFrom: view.weekFrom,
      weekTo: view.weekTo,
      segFilters: segFilters(),
      decisions: view.decisions,
      versions: view.versions,
      levelBins: activeLevelBins(),
      levelCol: pickedBinCol("level"),
      changeCol: pickedBinCol("change"),
      crossLevel: {
        colA: view.levelPair.colA,
        colB: view.levelPair.colB,
        leftDec: view.levelPair.leftDec,
        rightDec: view.levelPair.rightDec,
        leftVer: view.levelPair.leftVer,
        rightVer: view.levelPair.rightVer,
      },
      crossChange: {
        colA: view.changePair.colA,
        colB: view.changePair.colB,
        leftDec: view.changePair.leftDec,
        rightDec: view.changePair.rightDec,
        leftVer: view.changePair.leftVer,
        rightVer: view.changePair.rightVer,
      },
      prefixDim: view.prefixDim === "last_level_num" ? "last_level_num" : "level",
      prefixTags: (view.prefixTags || []).slice(),
      prefixBins: activePrefixBins(),
    };
  }

  function snapshot() {
    const spec = currentSpec();
    const key = JSON.stringify(spec);
    if (!cache || cache.key !== key) cache = { key: key, data: LM().compute(ctx, spec) };
    return cache.data;
  }

  function levelBinsNow() {
    return LM().listLevelBins(ctx, view.weekFrom, view.weekTo);
  }

  function activeLevelBins() {
    const all = levelBinsNow();
    const picked = view.levelBins || [];
    if (!picked.length) return [];
    const hit = picked.filter((bin) => all.indexOf(bin) >= 0);
    return hit.length ? hit : [];
  }

  function columnRow(col) {
    const st = colState(col);
    const values = columnValues(col);
    const allOn = !st.values.length;
    let html = `<div class="dr-filter-row"><span class="dr-filter-label dr-seg-col-label">${esc(col)}</span>`;
    html += chip(!!st.skip, "data-limit-seg-skip", col, "不拆");
    if (values.length) {
      html += `<div class="dr-chip-row dr-seg-picks">`;
      html += chip(allOn, "data-limit-seg-vals", col, "全选");
      values.forEach((value) => {
        const on = allOn || st.values.indexOf(value) >= 0;
        html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-limit-seg-val="1" data-limit-seg-col="${esc(col)}" data-limit-seg-value="${esc(value)}">${esc(showValue(value))}</button>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  function choiceRow(label, name, chosen, all, extra) {
    const onList = chosen && chosen.length ? chosen : all;
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">${esc(label)}</span><div class="dr-chip-row">`;
    all.forEach((value) => {
      const on = onList.indexOf(value) >= 0;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" ${name}="${esc(value)}"${extra || ""}>${esc(showValue(value))}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function choiceLabels(chosen, all) {
    const list = chosen && chosen.length ? chosen : all;
    if (!all.length || list.length === all.length) return "全部";
    const labels = list.slice(0, 3).map(showValue);
    return labels.join("、") + (list.length > 3 ? " 等 " + list.length + " 个" : "");
  }

  function headHtml() {
    const weeks = ctx.weeks || [];
    const open = !!view.filtersOpen;
    const bins = levelBinsNow();
    const seg = view.segCols && view.segCols.length ? view.segCols.map((col) => {
      const picked = (colState(col).values || []);
      const values = columnValues(col);
      if (!picked.length || picked.length >= values.length) return col + " 全部";
      return col + " " + picked.slice(0, 2).map(showValue).join("/") + (picked.length > 2 ? " 等" : "");
    }).join(" · ") : "全量";
    const summary = "时间 " + weekLabel(view.weekFrom) + " 至 " + weekLabel(view.weekTo)
      + " · 决策组 " + choiceLabels(view.decisions, ctx.decisions || [])
      + " · 额度版本 " + choiceLabels(view.versions, ctx.versions || [])
      + (bins.length ? (" · Level " + choiceLabels(activeLevelBins(), bins)) : "")
      + " · 客群 " + seg;
    let html = `<div class="dr-chapter-stick"><div class="dr-chapter-head" id="drLimitHead">`;
    html += `<div class="dr-head-bar"><h2 class="dr-chapter-title">额度策略监控</h2>`;
    html += `<button type="button" class="dr-chip dr-head-toggle" data-limit-head-toggle="1">${open ? "收起" : "筛选"}</button></div>`;
    html += `<p class="dr-head-summary">${esc(summary)}</p></div>`;
    html += `<div class="dr-filter-band${open ? "" : " is-filters-collapsed"}" id="drLimitFilters">`;
    html += `<span class="dr-filter-band-label">筛选</span><div class="dr-filter-band-body">`;
    html += `<p class="config-muted dr-track-note">Level 分箱、客群取值、决策组、额度策略版本和时间作用在整章。客群点「不拆」只取消横向分列，不取消取值筛选。交叉表左右另选决策组和额度策略版本。标签取值 1 为命中，其余为未命中。</p>`;
    html += `<div class="dr-filter-row"><span class="dr-filter-label">时间</span>`;
    html += `<select data-limit-week="from">${weeks.map((w) => `<option value="${esc(w)}"${w === view.weekFrom ? " selected" : ""}>${esc(weekLabel(w))}</option>`).join("")}</select>`;
    html += `<span class="config-muted">至</span>`;
    html += `<select data-limit-week="to">${weeks.map((w) => `<option value="${esc(w)}"${w === view.weekTo ? " selected" : ""}>${esc(weekLabel(w))}</option>`).join("")}</select>`;
    html += `</div>`;
    html += choiceRow("决策组", "data-limit-dec", view.decisions, ctx.decisions || []);
    html += choiceRow("额度策略版本", "data-limit-ver", view.versions, ctx.versions || []);
    if (bins.length) html += choiceRow("Level", "data-limit-level", view.levelBins, bins);
    if ((view.segCols || []).length) {
      html += `<div class="dr-filter-row"><span class="dr-filter-label">客群</span><span class="config-muted">按取值筛选。不拆只取消横向分列。</span></div>`;
      view.segCols.forEach((col) => { html += columnRow(col); });
    } else html += `<div class="dr-filter-row"><span class="dr-filter-label">客群</span><span>没有可筛的客群列，按全量</span></div>`;
    html += `</div></div></div>`;
    return html;
  }

  function isOpen(kind, decision, bin) {
    return !!(view.open && view.open[kind + "\0" + decision + "\0" + bin]);
  }

  function groupsOf(panel) {
    if (!panel || !panel.segments || !panel.segments.length) return null;
    return [{ id: "__total__", label: "合计" }].concat(panel.segments);
  }

  function bagOf(cell, groupId, grouped) {
    if (!cell) return null;
    if (!grouped) return cell.total;
    if (groupId === "__total__") return cell.total;
    return cell.bySeg ? cell.bySeg[groupId] : null;
  }

  function metricsOn(key) {
    const all = LM().METRICS;
    const picked = (view.metrics && view.metrics[key]) || [];
    if (!picked.length) return all.slice();
    const on = all.filter((m) => picked.indexOf(m.id) >= 0);
    return on.length ? on : all.slice();
  }

  function flowMetricsOn() {
    const all = LM().FLOW_METRICS || [];
    const picked = (view.metrics && view.metrics.version) || [];
    if (!picked.length) return all.slice();
    const on = all.filter((m) => picked.indexOf(m.id) >= 0);
    return on.length ? on : all.slice();
  }

  function flowMetricRow() {
    const on = flowMetricsOn().map((m) => m.id);
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">指标</span><div class="dr-chip-row">`;
    (LM().FLOW_METRICS || []).forEach((m) => {
      html += `<button type="button" class="dr-chip${on.indexOf(m.id) >= 0 ? " active" : ""}" data-limit-flow="${esc(m.id)}">${esc(m.name)}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function fmtFlow(id, v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (id === "apply" || id === "due_cnt") return fmtInt(v);
    if (id === "ticket" || id === "prev_ticket") return fmtNum(v);
    if (id === "gold_rate") return (v * 100).toFixed(1) + "%";
    return fmtPct(v);
  }

  function versionHtml(block) {
    const defs = flowMetricsOn();
    const groups = (block && block.groups) || [];
    const weeks = (block && block.weeks) || [];
    if (!defs.length) return `<p class="da-results-placeholder">请至少留下一个指标。</p>`;
    if (!groups.length) return `<p class="da-results-placeholder">当前筛选下没有额度策略版本。</p>`;
    const scales = { risk: [], amt_risk: [] };
    function colBag(col, week) {
      return (col.byWeek && col.byWeek[week]) || null;
    }
    weeks.forEach((week) => {
      groups.forEach((group) => {
        group.cols.forEach((col) => {
          const bag = colBag(col, week);
          if (!bag || !(bag.fm >= 10)) return;
          scales.risk.push(LM().flowValue(bag, "risk"));
          scales.amt_risk.push(LM().flowValue(bag, "amt_risk"));
        });
      });
    });
    const scale = { risk: scaleOf(scales.risk), amt_risk: scaleOf(scales.amt_risk) };
    function cells(bag, edge, total, heat) {
      let out = "";
      defs.forEach((m, mi) => {
        const value = LM().flowValue(bag, m.id);
        const cls = "num" + (mi === 0 && edge ? " dr-level-seg-start" : "") + (total ? " dr-status-total" : "");
        const dueOk = bag && bag.fm >= 10;
        const style = heat !== false && (m.id === "risk" || m.id === "amt_risk") && dueOk ? heatAttr(value, scale[m.id]) : "";
        out += `<td class="${cls}"${style}>${esc(fmtFlow(m.id, value))}</td>`;
      });
      return out;
    }
    function weekTotal(week) {
      const bags = [];
      groups.forEach((group) => group.cols.forEach((col) => bags.push(colBag(col, week))));
      return LM().sumFlow(bags);
    }
    function columnTotal(col) {
      return LM().sumFlow(weeks.map((week) => colBag(col, week)));
    }
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="3">周</th>`;
    groups.forEach((group, gi) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h${gi ? " dr-level-seg-start" : ""}" colspan="${group.cols.length * defs.length}">${esc(showValue(group.decision))}</th>`;
    });
    html += `<th class="dr-detail-group-h dr-level-seg-h dr-level-seg-start dr-status-total" rowspan="2" colspan="${defs.length}">合计</th></tr><tr>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => {
        html += `<th class="dr-detail-group-h${gi || ci ? " dr-level-seg-start" : ""}" colspan="${defs.length}">${esc(showValue(col.version))}</th>`;
      });
    });
    html += `</tr><tr>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => {
        defs.forEach((m, mi) => {
          html += `<th class="dr-detail-metric-h${mi === 0 && (gi || ci) ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
        });
      });
    });
    defs.forEach((m, mi) => {
      html += `<th class="dr-detail-metric-h dr-status-total${mi === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
    });
    html += `</tr></thead><tbody>`;
    weeks.forEach((week) => {
      html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
      groups.forEach((group, gi) => {
        group.cols.forEach((col, ci) => { html += cells(colBag(col, week), gi || ci, false); });
      });
      html += cells(weekTotal(week), true, true);
      html += `</tr>`;
    });
    html += `<tr class="dr-status-total-row"><td class="dr-detail-sticky dr-status-total">合计</td>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => { html += cells(columnTotal(col), gi || ci, false, false); });
    });
    html += cells(LM().sumFlow(weeks.map((week) => weekTotal(week))), true, true, false);
    html += `</tr></tbody>`;
    return `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table">${html}</table></div>`;
  }

  function versionLevelHtml(block) {
    const defs = flowMetricsOn();
    if (!block) return `<p class="da-results-placeholder">没有 level 列。</p>`;
    const groups = block.groups || [];
    const bins = block.bins || [];
    if (!defs.length) return "";
    if (!groups.length) return `<p class="da-results-placeholder">当前筛选下没有额度策略版本。</p>`;
    if (!bins.length) return `<p class="da-results-placeholder">当前筛选下没有 level 分箱。</p>`;
    const scales = { risk: [], amt_risk: [] };
    function colBag(col, bin) {
      return (col.byBin && col.byBin[bin]) || null;
    }
    bins.forEach((bin) => {
      groups.forEach((group) => {
        group.cols.forEach((col) => {
          const bag = colBag(col, bin);
          if (!bag || !(bag.fm >= 10)) return;
          scales.risk.push(LM().flowValue(bag, "risk"));
          scales.amt_risk.push(LM().flowValue(bag, "amt_risk"));
        });
      });
    });
    const scale = { risk: scaleOf(scales.risk), amt_risk: scaleOf(scales.amt_risk) };
    function cells(bag, edge, total, heat) {
      let out = "";
      defs.forEach((m, mi) => {
        const value = LM().flowValue(bag, m.id);
        const cls = "num" + (mi === 0 && edge ? " dr-level-seg-start" : "") + (total ? " dr-status-total" : "");
        const dueOk = bag && bag.fm >= 10;
        const style = heat !== false && (m.id === "risk" || m.id === "amt_risk") && dueOk ? heatAttr(value, scale[m.id]) : "";
        out += `<td class="${cls}"${style}>${esc(fmtFlow(m.id, value))}</td>`;
      });
      return out;
    }
    function binTotal(bin) {
      const bags = [];
      groups.forEach((group) => group.cols.forEach((col) => bags.push(colBag(col, bin))));
      return LM().sumFlow(bags);
    }
    function columnTotal(col) {
      return LM().sumFlow(bins.map((bin) => colBag(col, bin)));
    }
    let html = `<thead><tr><th class="dr-detail-sticky" rowspan="3">level</th>`;
    groups.forEach((group, gi) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h${gi ? " dr-level-seg-start" : ""}" colspan="${group.cols.length * defs.length}">${esc(showValue(group.version))}</th>`;
    });
    html += `<th class="dr-detail-group-h dr-level-seg-h dr-level-seg-start dr-status-total" rowspan="2" colspan="${defs.length}">合计</th></tr><tr>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => {
        html += `<th class="dr-detail-group-h${gi || ci ? " dr-level-seg-start" : ""}" colspan="${defs.length}">${esc(showValue(col.decision))}</th>`;
      });
    });
    html += `</tr><tr>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => {
        defs.forEach((m, mi) => {
          html += `<th class="dr-detail-metric-h${mi === 0 && (gi || ci) ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
        });
      });
    });
    defs.forEach((m, mi) => {
      html += `<th class="dr-detail-metric-h dr-status-total${mi === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
    });
    html += `</tr></thead><tbody>`;
    bins.forEach((bin) => {
      html += `<tr><td class="dr-detail-sticky">${esc(bin)}</td>`;
      groups.forEach((group, gi) => {
        group.cols.forEach((col, ci) => { html += cells(colBag(col, bin), gi || ci, false); });
      });
      html += cells(binTotal(bin), true, true);
      html += `</tr>`;
    });
    html += `<tr class="dr-status-total-row"><td class="dr-detail-sticky dr-status-total">合计</td>`;
    groups.forEach((group, gi) => {
      group.cols.forEach((col, ci) => { html += cells(columnTotal(col), gi || ci, false, false); });
    });
    html += cells(LM().sumFlow(bins.map((bin) => binTotal(bin))), true, true, false);
    html += `</tr></tbody>`;
    return `<p class="config-muted dr-track-note">行是 level 分箱，列是额度策略版本 × 决策组。档位与 Level 贷后相同。合计列是该档全部版本和决策组，合计行是各档加总。</p><div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap dr-limit-bin-table"><table class="data-table dr-detail-table dr-level-table">${html}</table></div>`;
  }

  function metricRow(key) {
    const on = metricsOn(key).map((m) => m.id);
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">指标</span><div class="dr-chip-row">`;
    LM().METRICS.forEach((m) => {
      html += `<button type="button" class="dr-chip${on.indexOf(m.id) >= 0 ? " active" : ""}" data-limit-metric="${esc(m.id)}" data-limit-metric-key="${esc(key)}">${esc(m.name)}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function panelTable(panel, kind) {
    const groups = groupsOf(panel);
    const metrics = metricsOn(kind);
    if (!panel || !panel.sides.length) return `<p class="da-results-placeholder">没有决策组。</p>`;
    let html = `<div class="dr-level-ab-grid">`;
    panel.sides.forEach((side) => {
      html += `<div class="dr-level-side"><div class="dr-level-side-head"><span class="config-muted">${esc(side.decision || "—")}</span></div>`;
      if (!side.rows.length) {
        html += `<p class="da-results-placeholder">当前筛选下没有到期样本。</p></div>`;
        return;
      }
      const painted = [];
      side.rows.forEach((row) => {
        const open = isOpen(kind, side.decision, row.bin);
        if (open) {
          side.weeks.forEach((week) => {
            painted.push({ kind: "detail", bin: row.bin, week: week, cell: row.weeks[week] });
          });
        }
        painted.push({ kind: "subtotal", bin: row.bin, cell: row.subtotal });
      });
      painted.push({ kind: "total", cell: side.total });
      const scales = Object.create(null);
      const scaleGroups = groups || [{ id: "__total__" }];
      scaleGroups.forEach((grp) => {
        HEAT_IDS.forEach((id) => {
          const values = [];
          painted.forEach((row) => {
            if (row.kind === "total") return;
            const bag = bagOf(row.cell, grp.id, !!groups);
            if (!heatDueOk(bag)) return;
            values.push(LM().metricValue(bag, id));
          });
          scales[grp.id + "\0" + id] = scaleOf(values);
        });
      });
      html += `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
      html += `<th class="dr-detail-sticky" rowspan="${groups ? 2 : 1}">${esc(pickedBinCol(kind) || (kind === "change" ? "level_change_num" : "level"))}</th>`;
      html += `<th class="dr-detail-sticky dr-detail-period-col" rowspan="${groups ? 2 : 1}">期次</th>`;
      if (groups) {
        groups.forEach((grp) => {
          html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">${esc(grp.label)}</th>`;
        });
        html += `</tr><tr>`;
        groups.forEach((grp) => {
          metrics.forEach((m, i) => {
            html += `<th class="dr-detail-metric-h${i === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
          });
        });
      } else {
        metrics.forEach((m) => { html += `<th>${esc(m.name)}</th>`; });
      }
      html += `</tr></thead><tbody>`;
      let lastBin = null;
      painted.forEach((row) => {
        const trCls = row.kind === "subtotal" ? "dr-latest-subtotal" : (row.kind === "total" ? "dr-latest-total" : "");
        html += `<tr class="${trCls}">`;
        if (row.kind === "total") {
          html += `<td class="dr-detail-sticky" colspan="2"><span class="dr-row-kind-chip is-total">合计</span></td>`;
        } else if (row.kind === "subtotal") {
          const open = isOpen(kind, side.decision, row.bin);
          html += `<td class="dr-detail-sticky"><button type="button" class="dr-latest-collapse-btn" data-limit-open-kind="${esc(kind)}" data-limit-open-dec="${esc(side.decision)}" data-limit-open-bin="${esc(row.bin)}" aria-expanded="${open ? "true" : "false"}">${open ? "▾" : "▸"}</button> ${esc(row.bin)}</td>`;
          html += `<td class="dr-detail-sticky dr-detail-period-col"><span class="dr-row-kind-chip is-subtotal">小计</span></td>`;
          lastBin = null;
        } else {
          const showBin = row.bin !== lastBin;
          lastBin = row.bin;
          html += `<td class="dr-detail-sticky${showBin ? "" : " dr-detail-seg-repeat"}">${showBin ? esc(row.bin) : ""}</td>`;
          html += `<td class="dr-detail-sticky dr-detail-period-col">${esc(weekLabel(row.week))}</td>`;
        }
        scaleGroups.forEach((grp) => {
          const bag = bagOf(row.cell, grp.id, !!groups);
          metrics.forEach((m, i) => {
            const value = LM().metricValue(bag, m.id);
            const scale = row.kind === "total" ? null : scales[grp.id + "\0" + m.id];
            const style = heatStyle(bag, m.id, value, scale);
            const edge = i === 0 ? " dr-level-seg-start" : "";
            html += `<td class="num${edge}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
          });
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div></div>`;
    });
    html += `</div>`;
    return html;
  }

  function sideFilters(kind, edge) {
    const pair = pairOf(kind);
    const decs = edge === "left" ? pair.leftDec : pair.rightDec;
    const vers = edge === "left" ? pair.leftVer : pair.rightVer;
    const decAttr = edge === "left" ? "data-limit-xdec-left" : "data-limit-xdec-right";
    const verAttr = edge === "left" ? "data-limit-xver-left" : "data-limit-xver-right";
    const extra = ` data-limit-xkind="${kind}"`;
    let html = choiceRow("决策组", decAttr, decs, ctx.decisions || [], extra);
    html += choiceRow("额度策略版本", verAttr, vers, ctx.versions || [], extra);
    return html;
  }

  function crossTable(matrix, kind) {
    const metrics = metricsOn(kind === "change" ? "crossChange" : "crossLevel");
    if (!matrix.rowBins.length || !matrix.colBins.length) {
      return `<p class="da-results-placeholder">当前筛选下没有可交叉的样本。</p>`;
    }
    const scales = Object.create(null);
    HEAT_IDS.forEach((id) => {
      scales[id] = scaleOf(matrix.rowBins.reduce((acc, row) => {
        matrix.colBins.forEach((col) => {
          const bag = matrix.cells[row] && matrix.cells[row][col];
          if (!heatDueOk(bag)) return;
          acc.push(LM().metricValue(bag, id));
        });
        return acc;
      }, []));
    });
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky" rowspan="2">${esc(kind === "change" ? "level_change 分箱" : "Level 分箱")}</th>`;
    matrix.colBins.forEach((col) => {
      html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">${esc(col)}</th>`;
    });
    html += `</tr><tr>`;
    matrix.colBins.forEach(() => {
      metrics.forEach((m, i) => {
        html += `<th class="dr-detail-metric-h${i === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    matrix.rowBins.forEach((row) => {
      html += `<tr><td class="dr-detail-sticky">${esc(row)}</td>`;
      matrix.colBins.forEach((col) => {
        const bag = matrix.cells[row] && matrix.cells[row][col];
        metrics.forEach((m, i) => {
          const value = LM().metricValue(bag, m.id);
          const style = heatStyle(bag, m.id, value, scales[m.id]);
          html += `<td class="num${i === 0 ? " dr-level-seg-start" : ""}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
        });
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function crossBlock(title, id, kind, matrix) {
    const fields = fieldList(kind);
    const pair = pairOf(kind);
    let html = `<div class="dr-block" id="${id}"><div class="dr-block-head"><h2>${esc(title)}</h2></div><div class="dr-block-body">`;
    if (fields.length < 1) {
      html += `<p class="da-results-placeholder">没有可交叉的列。</p></div></div>`;
      return html;
    }
    html += `<div class="dr-filter-row"><span class="dr-filter-label">交叉</span>`;
    html += `<select data-limit-field="${kind}-a">${fields.map((col) => `<option value="${esc(col)}"${col === pair.colA ? " selected" : ""}>${esc(col)}</option>`).join("")}</select>`;
    html += `<span class="config-muted">×</span>`;
    html += `<select data-limit-field="${kind}-b">${fields.map((col) => `<option value="${esc(col)}"${col === pair.colB ? " selected" : ""}>${esc(col)}</option>`).join("")}</select>`;
    html += `</div>`;
    html += `<p class="config-muted dr-track-note">行是 ${esc(pair.colA)}，列是 ${esc(pair.colB)}。左右各自圈定决策组和额度策略版本。</p>`;
    html += metricRow(kind === "change" ? "crossChange" : "crossLevel");
    html += `<div class="dr-level-ab-grid">`;
    [{ edge: "left", title: "左", cells: matrix.left }, { edge: "right", title: "右", cells: matrix.right }].forEach((side) => {
      html += `<div class="dr-level-side"><div class="dr-level-side-head"><span class="config-muted">${side.title}</span></div>`;
      html += sideFilters(kind, side.edge);
      html += crossTable({ rowBins: matrix.rowBins, colBins: matrix.colBins, cells: side.cells }, kind);
      html += `</div>`;
    });
    html += `</div></div></div>`;
    return html;
  }

  function specialKey(kind, label) {
    return kind + "\n" + label;
  }

  function tagCompare(slices, field) {
    const metrics = metricsOn(field === "dec" ? "specialDec" : "specialFloor");
    const scales = Object.create(null);
    HEAT_IDS.forEach((id) => {
      const values = [];
      slices.forEach((slice) => {
        const block = slice[field];
        if (!block) return;
        ["hit", "miss"].forEach((side) => {
          const bag = block[side];
          if (!heatDueOk(bag)) return;
          values.push(LM().metricValue(bag, id));
        });
      });
      scales[id] = scaleOf(values);
    });
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr><th class="dr-detail-sticky" rowspan="2">组合</th>`;
    html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">命中</th>`;
    html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">未命中</th></tr><tr>`;
    ["hit", "miss"].forEach(() => {
      metrics.forEach((m, i) => {
        html += `<th class="dr-detail-metric-h${i === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    slices.forEach((slice) => {
      const block = slice[field];
      html += `<tr><td class="dr-detail-sticky">${esc(slice.label)}</td>`;
      ["hit", "miss"].forEach((side) => {
        const bag = block && block[side];
        metrics.forEach((m, i) => {
          const value = LM().metricValue(bag, m.id);
          const style = heatStyle(bag, m.id, value, scales[m.id]);
          html += `<td class="num${i === 0 ? " dr-level-seg-start" : ""}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
        });
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function tagLevels(block, metricKey) {
    const metrics = metricsOn(metricKey);
    if (!ctx.hasLevel) return `<p class="da-results-placeholder">没有 level 列，不能按档位拆开。</p>`;
    if (!block.rows.length) return `<p class="da-results-placeholder">当前筛选下没有到期样本。</p>`;
    const scales = { hit: Object.create(null), miss: Object.create(null) };
    ["hit", "miss"].forEach((side) => {
      HEAT_IDS.forEach((id) => {
        scales[side][id] = scaleOf(block.rows.map((row) => {
          const bag = row[side];
          if (!heatDueOk(bag)) return null;
          return LM().metricValue(bag, id);
        }));
      });
    });
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky" rowspan="2">Level 分箱</th>`;
    html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">命中</th>`;
    html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">未命中</th>`;
    html += `</tr><tr>`;
    ["hit", "miss"].forEach(() => {
      metrics.forEach((m, i) => {
        html += `<th class="dr-detail-metric-h${i === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;
    block.rows.forEach((row) => {
      html += `<tr><td class="dr-detail-sticky">${esc(row.bin)}</td>`;
      [["hit", row.hit], ["miss", row.miss]].forEach((pair) => {
        metrics.forEach((m, i) => {
          const value = LM().metricValue(pair[1], m.id);
          const style = heatStyle(pair[1], m.id, value, scales[pair[0]][m.id]);
          html += `<td class="num${i === 0 ? " dr-level-seg-start" : ""}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
        });
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function specialPart(title, name, field, slices) {
    const missing = field === "dec" ? !ctx.hasDecTag : !ctx.hasFloorTag;
    let html = `<div class="dr-limit-part"><div class="dr-limit-part-head"><h3>${esc(title)}</h3>`;
    html += `<p class="config-muted dr-track-note">${esc(name)}。命中为 1，其余为未命中。授信件均 = 本次额度 / 通过量。点开组合看 level 分箱。</p></div>`;
    html += `<div class="dr-limit-part-body">`;
    if (missing) return html + `<p class="da-results-placeholder">没有 ${esc(name)} 列。</p></div></div>`;
    html += metricRow(field === "dec" ? "specialDec" : "specialFloor");
    html += tagCompare(slices, field);
    html += `<div class="dr-track-models">`;
    slices.forEach((slice) => {
      const key = specialKey(field, slice.label);
      const open = !!(view.specialOpen && view.specialOpen[key]);
      html += `<article class="dr-track-model-card${open ? "" : " is-collapsed"}" data-limit-special-card="1">`;
      html += `<div class="dr-track-model-head" style="cursor:default"><span class="dr-track-model-name">${esc(slice.label)}</span>`;
      html += `<button type="button" class="dr-track-model-collapse" data-limit-special-toggle="1" data-limit-special-kind="${esc(field)}" data-limit-special-label="${esc(slice.label)}"></button></div>`;
      html += `<div class="dr-track-model-body">${tagLevels(slice[field], field === "dec" ? "specialDec" : "specialFloor")}</div></article>`;
    });
    html += `</div></div></div>`;
    return html;
  }

  const PREFIX_METRICS = [
    { id: "risk", name: "订单风险" },
    { id: "due_cnt", name: "到期样本量" },
    { id: "ticket", name: "授信件均" },
  ];

  function prefixMetricsOn() {
    const picked = (view.metrics && view.metrics.prefix) || [];
    if (!picked.length) return PREFIX_METRICS.slice();
    const on = PREFIX_METRICS.filter((m) => picked.indexOf(m.id) >= 0);
    return on.length ? on : PREFIX_METRICS.slice();
  }

  function prefixDimNow() {
    if (view.prefixDim === "last_level_num" && ctx.hasLastLevel) return "last_level_num";
    if (ctx.hasLevel) return "level";
    return ctx.hasLastLevel ? "last_level_num" : "level";
  }

  function prefixBinsNow() {
    return LM().listDimBins(ctx, prefixDimNow(), view.weekFrom, view.weekTo);
  }

  function activePrefixBins() {
    const all = prefixBinsNow();
    const picked = view.prefixBins || [];
    if (!picked.length) return [];
    const hit = picked.filter((bin) => all.indexOf(bin) >= 0);
    return hit.length ? hit : [];
  }

  function prefixFilterHtml() {
    const tags = ctx.tagCols || [];
    const dims = [];
    if (ctx.hasLevel) dims.push("level");
    if (ctx.hasLastLevel) dims.push("last_level_num");
    const dim = prefixDimNow();
    const bins = prefixBinsNow();
    const binOn = view.prefixBins || [];
    const allBins = !binOn.length;
    const tagOn = view.prefixTags || [];
    const allTags = !tagOn.length;
    const metrics = prefixMetricsOn().map((m) => m.id);
    let html = `<div class="dr-filter-row"><span class="dr-filter-label">特殊策略标签</span><div class="dr-chip-row">`;
    if (!tags.length) html += `<span class="config-muted">没有 flag_level_button_tag_ 或 flag_level_dec_tag_ 列</span>`;
    else {
      html += chip(allTags, "data-limit-prefix-tags", "all", "全选");
      tags.forEach((col) => {
        const on = allTags || tagOn.indexOf(col) >= 0;
        html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-limit-prefix-tag="${esc(col)}">${esc(col)}</button>`;
      });
    }
    html += `</div></div>`;
    html += `<div class="dr-filter-row"><span class="dr-filter-label">额度标签</span><div class="dr-chip-row">`;
    if (!dims.length) html += `<span class="config-muted">没有 level 或 last_level_num 列</span>`;
    else dims.forEach((name) => {
      html += `<button type="button" class="dr-chip${name === dim ? " active" : ""}" data-limit-prefix-dim="${esc(name)}">${esc(name)}</button>`;
    });
    html += `</div></div>`;
    if (bins.length) {
      html += `<div class="dr-filter-row"><span class="dr-filter-label">${esc(dim)} 分箱</span><div class="dr-chip-row">`;
      html += chip(allBins, "data-limit-prefix-bins", "all", "全选");
      bins.forEach((bin) => {
        const on = allBins || binOn.indexOf(bin) >= 0;
        html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-limit-prefix-bin="${esc(bin)}">${esc(bin)}</button>`;
      });
      html += `</div></div>`;
    }
    html += `<div class="dr-filter-row"><span class="dr-filter-label">指标</span><div class="dr-chip-row">`;
    PREFIX_METRICS.forEach((m) => {
      html += `<button type="button" class="dr-chip${metrics.indexOf(m.id) >= 0 ? " active" : ""}" data-limit-prefix-metric="${esc(m.id)}">${esc(m.name)}</button>`;
    });
    html += `</div></div>`;
    return html;
  }

  function prefixTable(tag, dim, sides) {
    const metrics = prefixMetricsOn();
    const rows = (tag && tag.rows) || [];
    if (!sides.length) return `<p class="da-results-placeholder">没有 a 组或 b 组。</p>`;
    if (!rows.length) return `<p class="da-results-placeholder">当前筛选下没有到期样本。</p>`;
    const groups = ["hit", "miss"];
    const values = [];
    rows.concat([tag.total]).forEach((row) => {
      if (!row) return;
      groups.forEach((g) => {
        sides.forEach((dec) => {
          const bag = row[g] && row[g][dec];
          if (!heatDueOk(bag)) return;
          values.push(LM().metricValue(bag, "risk"));
        });
      });
    });
    const scale = scaleOf(values);
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky" rowspan="2">${esc(dim === "last_level_num" ? "last_level_num" : "level")}</th>`;
    groups.forEach((g) => {
      const gName = g === "hit" ? "命中" : "未命中";
      sides.forEach((dec) => {
        html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="${metrics.length}">${esc(gName + " · " + dec)}</th>`;
      });
    });
    html += `</tr><tr>`;
    groups.forEach(() => {
      sides.forEach(() => {
        metrics.forEach((m, i) => {
          html += `<th class="dr-detail-metric-h${i === 0 ? " dr-level-seg-start" : ""}">${esc(m.name)}</th>`;
        });
      });
    });
    html += `</tr></thead><tbody>`;
    rows.concat([{ bin: "合计", hit: tag.total.hit, miss: tag.total.miss }]).forEach((row) => {
      html += `<tr><td class="dr-detail-sticky">${esc(row.bin)}</td>`;
      groups.forEach((g) => {
        sides.forEach((dec) => {
          const bag = row[g][dec];
          metrics.forEach((m, i) => {
            const value = LM().metricValue(bag, m.id);
            const style = m.id === "risk" ? heatStyle(bag, m.id, value, scale) : "";
            html += `<td class="num${i === 0 ? " dr-level-seg-start" : ""}"${style}>${esc(fmtMetric(m.id, value))}</td>`;
          });
        });
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function prefixHtml(prefix) {
    const dim = (prefix && prefix.dim) || prefixDimNow();
    const sides = (prefix && prefix.sides) || [];
    const tags = (prefix && prefix.tags) || [];
    let html = `<div class="dr-limit-part" id="drLimitPrefix"><div class="dr-limit-part-head"><h3>标签回打</h3>`;
    html += `<p class="config-muted dr-track-note">识别 flag_level_button_tag_、flag_level_dec_tag_。取值 1 为命中，其余为未命中，再分 a、b。维度用 level 或 last_level_num，档位与 Level 贷后相同。章首时间、决策组、额度版本、Level 和客群筛选仍生效。订单风险 = fpd1 分子 / 分母，到期样本量是这个分母，授信件均 = 本次额度 / 通过量。</p></div>`;
    html += `<div class="dr-limit-part-body">${prefixFilterHtml()}`;
    if (!(ctx.tagCols || []).length) return html + `<p class="da-results-placeholder">没有标签回打列。</p></div></div>`;
    if (dim === "level" && !ctx.hasLevel) return html + `<p class="da-results-placeholder">没有 level 列。</p></div></div>`;
    if (dim === "last_level_num" && !ctx.hasLastLevel) return html + `<p class="da-results-placeholder">没有 last_level_num 列。</p></div></div>`;
    tags.forEach((tag) => {
      html += `<h3 class="dr-limit-prefix-title">${esc(tag.col)}</h3>`;
      html += prefixTable(tag, dim, sides);
    });
    html += `</div></div>`;
    return html;
  }

  function specialHtml(data, prefix) {
    const slices = (data && data.slices) || [];
    let html = `<div class="dr-block" id="drLimitSpecial"><div class="dr-block-head"><h2>6. 特殊策略监控</h2></div><div class="dr-block-body">`;
    html += `<p class="config-muted dr-track-note">直降和盖帽只取决策组 ${esc(ctx.bValue || "b组")}，按 system1 和是否拒量拆开。标签回打同时看命中和未命中，再分 a、b。</p>`;
    html += `<div class="dr-limit-parts">`;
    if (!ctx.bValue) html += `<p class="da-results-placeholder">没有 b 组。</p>`;
    else if (!slices.length) html += `<p class="da-results-placeholder">当前筛选下没有 b 组样本。</p>`;
    else {
      html += specialPart("直降", "flag_level_dec_tag", "dec", slices);
      html += specialPart("盖帽", "flag_level_floor_tag", "floor", slices);
    }
    html += prefixHtml(prefix);
    html += `</div></div></div>`;
    return html;
  }

  function versionBlock(data) {
    const note = `<p class="config-muted dr-track-note">第一张表行是周，列是决策组 × 额度策略版本。通过率 = 通过量 / 进件量，授信件均 = 本次额度 / 通过量，上次授信件均 = 上次额度 / 通过量，用信率 = 放款订单数 / 通过量，T1用信率 = T1_放款订单数 / 通过量，金笔率 = 金额风险 / 订单风险，到期单量是 fpd1 分母。底部合计行是各行加总。时间、决策组、额度策略版本、Level 和客群跟章首，指标两张表共用。</p>`;
    return note + flowMetricRow() + versionHtml(data && data.version) + versionLevelHtml(data && data.versionLevel);
  }

  function render() {
    const host = document.getElementById("drChapterLimit");
    if (!host || !ctx || !view) return;
    const data = snapshot();
    let html = headHtml();
    html += `<div class="dr-block" id="drLimitVersion"><div class="dr-block-head"><h2>1. 额度策略版本监控</h2></div><div class="dr-block-body">${versionBlock(data)}</div></div>`;
    html += `<div class="dr-block" id="drLimitLevel"><div class="dr-block-head"><h2>2. Level 贷后</h2></div><div class="dr-block-body">`;
    html += fieldList("level").length
      ? `<p class="config-muted dr-track-note">按分箱列分档，档位与 level 相同（-1、1–3 … 21、其他）。点分箱展开各周，周从旧到新。横向客群来自章首未点「不拆」的列，合计是这些列的加总。章首 Level 和客群先筛人。授信件均 = 本次额度 / 通过量。</p>${binColRow("level")}${metricRow("level")}${panelTable(data.level, "level")}`
      : `<p class="da-results-placeholder">没有 level 或 level_new_ 列。</p>`;
    html += `</div></div>`;
    html += `<div class="dr-block" id="drLimitChange"><div class="dr-block-head"><h2>3. level_change_num 贷后</h2></div><div class="dr-block-body">`;
    html += fieldList("change").length
      ? `<p class="config-muted dr-track-note">按分箱列分档，档位为 ≤-4 到 ≥5。筛选和 Level 贷后相同。授信件均 = 本次额度 / 通过量。</p>${binColRow("change")}${metricRow("change")}${panelTable(data.change, "change")}`
      : `<p class="da-results-placeholder">没有 level_change_num 或 level_change_end_ 列。</p>`;
    html += `</div></div>`;
    html += crossBlock("4. Level 交叉", "drLimitLevelCross", "level", data.crossLevel);
    html += crossBlock("5. level_change 交叉", "drLimitChangeCross", "change", data.crossChange);
    html += specialHtml(data.special, data.prefix);
    host.innerHTML = html;
    syncSticky(host);
  }

  function onClick(ev) {
    const prefixTag = ev.target.closest("[data-limit-prefix-tag],[data-limit-prefix-tags]");
    if (prefixTag && view) {
      if (prefixTag.hasAttribute("data-limit-prefix-tags")) view.prefixTags = [];
      else view.prefixTags = toggleList(view.prefixTags, ctx.tagCols || [], prefixTag.getAttribute("data-limit-prefix-tag"));
      render();
      return;
    }
    const prefixDimBtn = ev.target.closest("[data-limit-prefix-dim]");
    if (prefixDimBtn && view) {
      const next = prefixDimBtn.getAttribute("data-limit-prefix-dim");
      if (next && next !== view.prefixDim) {
        view.prefixDim = next;
        view.prefixBins = [];
      }
      render();
      return;
    }
    const prefixBin = ev.target.closest("[data-limit-prefix-bin],[data-limit-prefix-bins]");
    if (prefixBin && view) {
      if (prefixBin.hasAttribute("data-limit-prefix-bins")) view.prefixBins = [];
      else view.prefixBins = toggleList(view.prefixBins, prefixBinsNow(), prefixBin.getAttribute("data-limit-prefix-bin"));
      render();
      return;
    }
    const prefixMetric = ev.target.closest("[data-limit-prefix-metric]");
    if (prefixMetric && view) {
      if (!view.metrics) view.metrics = {};
      view.metrics.prefix = toggleList(view.metrics.prefix, PREFIX_METRICS.map((m) => m.id), prefixMetric.getAttribute("data-limit-prefix-metric"));
      render();
      return;
    }
    const specialBtn = ev.target.closest("[data-limit-special-toggle]");
    if (specialBtn && view) {
      const key = specialKey(specialBtn.getAttribute("data-limit-special-kind"), specialBtn.getAttribute("data-limit-special-label"));
      if (!view.specialOpen) view.specialOpen = {};
      view.specialOpen[key] = !view.specialOpen[key];
      const card = specialBtn.closest("[data-limit-special-card]");
      if (card) card.classList.toggle("is-collapsed", !view.specialOpen[key]);
      return;
    }
    const flowBtn = ev.target.closest("[data-limit-flow]");
    if (flowBtn && view) {
      if (!view.metrics) view.metrics = {};
      view.metrics.version = toggleList(view.metrics.version, (LM().FLOW_METRICS || []).map((m) => m.id), flowBtn.getAttribute("data-limit-flow"));
      render();
      return;
    }
    const metricBtn = ev.target.closest("[data-limit-metric]");
    if (metricBtn && view) {
      const key = metricBtn.getAttribute("data-limit-metric-key");
      const all = LM().METRICS.map((m) => m.id);
      if (!view.metrics) view.metrics = {};
      view.metrics[key] = toggleList(view.metrics[key], all, metricBtn.getAttribute("data-limit-metric"));
      render();
      return;
    }
    const headBtn = ev.target.closest("[data-limit-head-toggle]");
    if (headBtn && view) {
      view.filtersOpen = !view.filtersOpen;
      const band = document.getElementById("drLimitFilters");
      if (band) band.classList.toggle("is-filters-collapsed", !view.filtersOpen);
      headBtn.textContent = view.filtersOpen ? "收起" : "筛选";
      return;
    }
    const t = ev.target.closest("[data-limit-dec],[data-limit-ver],[data-limit-level],[data-limit-seg-skip],[data-limit-seg-vals],[data-limit-seg-val],[data-limit-seg-expand],[data-limit-open-bin],[data-limit-xdec-left],[data-limit-xdec-right],[data-limit-xver-left],[data-limit-xver-right]");
    if (!t || !view) return;
    if (t.hasAttribute("data-limit-open-bin")) {
      const key = t.getAttribute("data-limit-open-kind") + "\0" + t.getAttribute("data-limit-open-dec") + "\0" + t.getAttribute("data-limit-open-bin");
      view.open[key] = !view.open[key];
      render();
      return;
    }
    if (t.hasAttribute("data-limit-dec")) {
      view.decisions = toggleList(view.decisions, ctx.decisions, t.getAttribute("data-limit-dec"));
    } else if (t.hasAttribute("data-limit-ver")) {
      view.versions = toggleList(view.versions, ctx.versions, t.getAttribute("data-limit-ver"));
    } else if (t.hasAttribute("data-limit-level")) {
      view.levelBins = toggleList(view.levelBins, levelBinsNow(), t.getAttribute("data-limit-level"));
    } else if (t.hasAttribute("data-limit-seg-skip")) {
      const st = colState(t.getAttribute("data-limit-seg-skip"));
      st.skip = !st.skip;
    } else if (t.hasAttribute("data-limit-seg-expand")) {
      const st = colState(t.getAttribute("data-limit-seg-expand"));
      st.open = !st.open;
    } else if (t.hasAttribute("data-limit-seg-vals")) {
      colState(t.getAttribute("data-limit-seg-vals")).values = [];
    } else if (t.hasAttribute("data-limit-seg-val")) {
      const col = t.getAttribute("data-limit-seg-col");
      const st = colState(col);
      st.values = toggleList(st.values, columnValues(col), t.getAttribute("data-limit-seg-value"));
    } else if (t.hasAttribute("data-limit-xdec-left") || t.hasAttribute("data-limit-xdec-right") || t.hasAttribute("data-limit-xver-left") || t.hasAttribute("data-limit-xver-right")) {
      const kind = t.getAttribute("data-limit-xkind");
      const pair = pairOf(kind);
      const names = ["data-limit-xdec-left", "data-limit-xdec-right", "data-limit-xver-left", "data-limit-xver-right"];
      let value = "";
      for (let i = 0; i < names.length; i++) {
        if (t.hasAttribute(names[i])) {
          value = t.getAttribute(names[i]);
          break;
        }
      }
      if (t.hasAttribute("data-limit-xdec-left")) pair.leftDec = toggleKeep(pair.leftDec, ctx.decisions, value);
      else if (t.hasAttribute("data-limit-xdec-right")) pair.rightDec = toggleKeep(pair.rightDec, ctx.decisions, value);
      else if (t.hasAttribute("data-limit-xver-left")) pair.leftVer = toggleList(pair.leftVer, ctx.versions, value);
      else pair.rightVer = toggleList(pair.rightVer, ctx.versions, value);
    }
    render();
  }

  function onChange(ev) {
    const t = ev.target;
    if (!t || !view) return;
    if (t.hasAttribute("data-limit-bin-col")) {
      const kind = t.getAttribute("data-limit-bin-col");
      const fields = fieldList(kind);
      if (fields.indexOf(t.value) < 0) return;
      if (kind === "change") view.changeCol = t.value;
      else view.levelCol = t.value;
      render();
      return;
    }
    if (t.hasAttribute("data-limit-week")) {
      if (t.getAttribute("data-limit-week") === "from") view.weekFrom = t.value;
      else view.weekTo = t.value;
      if (view.weekFrom && view.weekTo && view.weekFrom > view.weekTo) {
        const swap = view.weekFrom;
        view.weekFrom = view.weekTo;
        view.weekTo = swap;
      }
      render();
      return;
    }
    if (t.hasAttribute("data-limit-field")) {
      const which = t.getAttribute("data-limit-field") || "";
      const kind = which.slice(0, which.length - 2);
      const pair = pairOf(kind);
      if (!pair) return;
      if (which.endsWith("-a")) pair.colA = t.value;
      else pair.colB = t.value;
      render();
    }
  }

  function mount(result, host) {
    if (!host || !result) return;
    const rows = RV.app.state.rawRows || [];
    const headers = RV.app.state.headers || [];
    const old = document.getElementById("drChapterLimit");
    if (old) old.remove();
    let error = "";
    try {
      const cube = RV.app.state && RV.app.state.drLimitCube;
      ctx = cube ? LM().hydrate(cube) : LM().prepare(rows, {
        timeCol: result.config && result.config.timeCol,
        decisionCol: result.config && result.config.decisionCol,
        weekPeriods: result.weekPeriods || [],
        decisionGroups: result.decisionGroups || [],
        headers: headers,
      });
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      ctx = null;
    }
    host.insertAdjacentHTML("beforeend", `<div class="dr-chapter" id="drChapterLimit"></div>`);
    const chapter = document.getElementById("drChapterLimit");
    if (error || !ctx) {
      chapter.innerHTML = `<div class="dr-chapter-head" id="drLimitHead"><h2 class="dr-chapter-title">额度策略监控</h2><p class="da-results-placeholder">${esc(error || "没有可计算的样本。")}</p></div>`;
      return;
    }
    lastResult = result;
    cache = null;
    const levelFields = ctx.levelFields || [];
    const changeFields = ctx.changeFields || [];
    view = {
      weekFrom: ctx.weeks[0] || "",
      weekTo: ctx.weeks[ctx.weeks.length - 1] || "",
      filtersOpen: false,
      decisions: [],
      versions: [],
      levelBins: [],
      levelCol: levelFields.indexOf("level") >= 0 ? "level" : (levelFields[0] || ""),
      changeCol: changeFields.indexOf("level_change_num") >= 0 ? "level_change_num" : (changeFields[0] || ""),
      segCols: [],
      colState: {},
      open: {},
      specialOpen: {},
      metrics: {},
      prefixDim: ctx.hasLevel ? "level" : "last_level_num",
      prefixTags: [],
      prefixBins: [],
      levelPair: {
        colA: levelFields[0] || "",
        colB: levelFields[1] || levelFields[0] || "",
        leftDec: ctx.aValue ? [ctx.aValue] : [],
        rightDec: ctx.bValue ? [ctx.bValue] : [],
        leftVer: [],
        rightVer: [],
      },
      changePair: {
        colA: changeFields[0] || "",
        colB: changeFields[1] || changeFields[0] || "",
        leftDec: ctx.aValue ? [ctx.aValue] : [],
        rightDec: ctx.bValue ? [ctx.bValue] : [],
        leftVer: [],
        rightVer: [],
      },
    };
    chapter.addEventListener("click", onClick);
    chapter.addEventListener("change", onChange);
    render();
  }

  function syncSegmentCols() {
    if (!ctx || !view || !document.getElementById("drChapterLimit")) return;
    const prev = (view.segCols || []).join("\0");
    pullSharedCols();
    if ((view.segCols || []).join("\0") !== prev) render();
  }

  RV.ui = RV.ui || {};
  RV.ui.limitMonitor = { mount: mount, syncSegmentCols: syncSegmentCols };
})(window.RV);
