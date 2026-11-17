(function (RV) {
"use strict";
  var S = RV.app.state;
  var $ = (id) => document.getElementById(id);
  const compareDimValue = RV.infra.compareDimValue;
  const esc = RV.infra.esc;
  const fmtNum = RV.infra.fmtNum;
  const formatGroupLabels = RV.infra.formatGroupLabels;
  const getChecked = RV.infra.getChecked;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const initResizableTables = RV.ui.report.analysis.initResizableTables;
  const pct = RV.infra.pct;
  const rateHeatStyle = RV.infra.rateHeatStyle;
  const summaryTrendRateScales = RV.infra.summaryTrendRateScales;
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  const setAnalyzeStatus = (...args) => RV.app.orchestrator.setAnalyzeStatus(...args);
  const readWaterfallOrderFromDom = (...args) => RV.ui.report.pre.readWaterfallOrderFromDom(...args);
  const waterfallOrderKey = (...args) => RV.ui.report.pre.waterfallOrderKey(...args);
  const moveWaterfallPlaceholder = (...args) => RV.ui.report.pre.moveWaterfallPlaceholder(...args);
  function isExportMode() { return !!(RV.export?.isExportMode && RV.export.isExportMode()); }
  var target = report.postRuleReview = report.postRuleReview || {};
  const CP = () => RV.ui.collapsedPicker;

function ruleReviewTrendPickerId(col) {
  return `postRuleReviewTrend:${col}`;
}

function registerRuleReviewTrendDimPicker(col) {
  const pickerId = ruleReviewTrendPickerId(col);
  CP().registerDimPicker(pickerId, {
    onChange: () => refreshPostRuleReviewTrendTable(),
  });
}

function initRuleReviewTrendDimPickers(groupCols, savedFilter, dimValues) {
  for (const col of groupCols || []) {
    registerRuleReviewTrendDimPicker(col);
    const pickerId = ruleReviewTrendPickerId(col);
    const vals = dimValues?.[col] || [];
    const saved = savedFilter?.[col];
    CP().initDimPicker(pickerId, {
      values: vals,
      selected: savedFilter?.[col] !== undefined ? savedFilter[col] : vals,
    });
  }
}

function syncRuleReviewTrendDimPickers(groupCols) {
  for (const col of groupCols || []) {
    const pickerId = ruleReviewTrendPickerId(col);
    if (CP().getPickerSpec(pickerId)) CP().syncUI(pickerId);
  }
}

function fmtNumOrDash(v) {
  return v != null && v !== "" ? fmtNum(v) : "—";
}
function pctOrDash(v) {
  return v != null && v !== "" ? pct(v) : "—";
}

function collectRuleReviewTrendDimValues(trend, groupCols) {
  const map = {};
  for (const c of groupCols) map[c] = new Set();
  for (const t of trend) {
    const parts = t.groupParts || [];
    groupCols.forEach((c, i) => {
      if (parts[i] != null) map[c].add(String(parts[i]));
    });
  }
  const out = {};
  for (const c of groupCols) {
    out[c] = [...map[c]].sort(compareDimValue);
  }
  return out;
}
function getRuleReviewTrendFilterMap(groupCols) {
  return CP().getDimFilterMap(groupCols, ruleReviewTrendPickerId);
}
function ruleReviewTrendRowMatches(t, groupCols, filterMap) {
  const parts = t.groupParts || [];
  for (let i = 0; i < groupCols.length; i++) {
    const col = groupCols[i];
    const allowed = filterMap[col];
    if (!allowed || !allowed.size) return false;
    const val = String(parts[i] ?? "(缺失)");
    if (!allowed.has(val)) return false;
  }
  return true;
}
function kindTagHtml(kind) {
  if (kind === "hard") return '<span class="tag-hard">硬</span>';
  if (kind === "soft") return '<span class="tag-soft">软</span>';
  if (kind === "segment") return '<span class="tag-segment">分段</span>';
  return esc(kind || "—");
}
function kindLabelText(kind) {
  if (kind === "hard") return "硬";
  if (kind === "soft") return "软";
  if (kind === "segment") return "分段";
  return kind || "—";
}
function isMissAllSegmentRow(r) {
  return r?.kind === "segment" || r?.ruleId === RV.domain.summary.MISS_ALL_RULES_SEGMENT_ID;
}
function renderRuleReviewTrendRowsHtml(rows, groupCols, scales) {
  let html = "";
  for (const t of rows) {
    const heatHit = rateHeatStyle(t.riskHit, scales.riskHit.min, scales.riskHit.max);
    const heatMiss = rateHeatStyle(t.riskMiss, scales.riskMiss.min, scales.riskMiss.max);
    const parts = t.groupParts || [t.group];
    const rowClass = t.kind === "segment" ? ' class="segment-row"' : "";
    html += `<tr${rowClass}><td>${esc(t.ruleName)}</td>`;
    for (const p of parts) html += `<td>${esc(p)}</td>`;
    html += `<td>${kindTagHtml(t.kind)}</td>
      <td class="num">${fmtNum(t.postHitVol)}</td>
      <td class="num">${fmtNum(t.postMissVol)}</td>
      <td class="num rate-heat"${heatHit ? ` style="${heatHit}"` : ""}>${pct(t.riskHit)}</td>
      <td class="num rate-heat"${heatMiss ? ` style="${heatMiss}"` : ""}>${pct(t.riskMiss)}</td>
    </tr>`;
  }
  return html;
}
function refreshPostRuleReviewTrendTable() {
  const summary = S.lastAnalysis?.summary;
  const tbody = $("postRuleReviewTrendTableBody");
  if (!summary || !tbody) return;

  const groupCols = summary.groupCols || [];
  const trend = summary.trend || [];
  const filterMap = getRuleReviewTrendFilterMap(groupCols);
  const filtered = trend.filter((t) => ruleReviewTrendRowMatches(t, groupCols, filterMap));
  const scales = {
    riskHit: summaryTrendRateScales(filtered, "riskHit"),
    riskMiss: summaryTrendRateScales(filtered, "riskMiss"),
  };
  const colSpan = groupCols.length + 6;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="config-muted">无符合筛选条件的行，请调整维度取值</td></tr>`;
  } else {
    tbody.innerHTML = renderRuleReviewTrendRowsHtml(filtered, groupCols, scales);
  }

  const meta = $("postRuleReviewTrendFilterMeta");
  if (meta) meta.textContent = `显示 ${filtered.length.toLocaleString()} / ${trend.length.toLocaleString()} 行`;
}
function renderRuleReviewTrendFilters(summary) {
  const groupCols = summary.groupCols || [];
  const trend = summary.trend || [];
  if (!groupCols.length || !trend.length) return "";

  const dimValues = collectRuleReviewTrendDimValues(trend, groupCols);
  let html = `<div class="summary-trend-filters post-rule-review-filters">
    <h4 class="rv-heading-with-hint">规则复盘趋势表维度筛选${hintBadgeHtml("勾选取值，即时筛行")}</h4>
    <div class="summary-trend-filter-bar">`;

  for (const col of groupCols) {
    const vals = dimValues[col] || [];
    const pickerId = ruleReviewTrendPickerId(col);
    html += `<div class="summary-trend-filter post-rule-review-filter" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "post-rule-review-filter-values",
    });
    html += `</div>`;
  }

  html += `<div class="summary-trend-filter-actions">
    <button type="button" class="btn btn-secondary btn-sm post-rule-review-select-all">全选</button>
    <button type="button" class="btn btn-secondary btn-sm post-rule-review-clear-all">清空</button>
  </div></div></div>`;
  return html;
}
function renderRuleReviewTrendTableShell(summary) {
  const groupCols = summary.groupCols || [];
  if (!groupCols.length) {
    return `<p class="config-muted">请勾选上方分组变量以生成规则×维度趋势表</p>`;
  }
  if (!summary.trend || !summary.trend.length) {
    return `<p class="config-muted">无趋势数据</p>`;
  }
  const groupLabel = esc(formatGroupLabels(groupCols));
  const groupThs = groupCols.map((c) => `<th>${esc(c)}</th>`).join("");

  const trendTip = `样本量=风险分母Σ；同列青低黄高；指标 ${summary.riskMetric || "—"}`;
  let html = `<h4 class="rv-heading-with-hint">趋势表（规则 × ${groupLabel}）${hintBadgeHtml(trendTip)}</h4>`;
  html += `<p id="postRuleReviewTrendFilterMeta" class="config-muted" style="font-size:.78rem;margin:0 0 .35rem"></p>`;
  html += `<table id="postRuleReviewTrendTable" class="data-table trend-table"><thead><tr>
    <th>规则</th>${groupThs}<th>类型</th>
    <th>贷后命中样本</th><th>贷后未命中组样本</th>
    <th>贷后命中组风险</th><th>贷后未命中组风险</th>
  </tr></thead><tbody id="postRuleReviewTrendTableBody"></tbody></table>`;
  return html;
}
function orderSummaryRowsForWaterfall(rows, waterfallOrder, hardRules, softRules) {
  const ruleRows = (rows || []).filter((r) => !isMissAllSegmentRow(r));
  const byId = new Map(ruleRows.map((r) => [r.ruleId, r]));
  const order = waterfallOrder?.length ? waterfallOrder : [...(hardRules || []), ...(softRules || [])];
  return order.map((rule) => byId.get(rule.id)).filter(Boolean);
}
function segmentRowsFromSummary(rows) {
  return (rows || []).filter(isMissAllSegmentRow);
}
function renderRuleReviewOverallRowHtml(r, idx) {
  return `<tr class="wf-row ${r.kind}" data-rule-id="${esc(r.ruleId)}">
      <td><span class="drag-handle" title="拖拽调整瀑布顺序">☰</span></td>
      <td class="wf-idx num">${idx + 1}</td>
      <td>${esc(r.name)}</td>
      <td>${kindLabelText(r.kind)}</td>
      <td class="num wf-post-hit-den">${fmtNumOrDash(r.postHitVol)}</td>
      <td class="num wf-post-miss-den">${fmtNumOrDash(r.postMissVol)}</td>
      <td class="num wf-risk-hit">${pctOrDash(r.riskHit)}</td>
      <td class="num wf-risk-miss">${pctOrDash(r.riskMiss)}</td>
      <td class="num wf-wf-risk">${pctOrDash(r.wfHitRisk)}</td>
      <td class="num wf-wf-den">${fmtNumOrDash(r.wfHitDen)}</td>
      <td class="num wf-only-risk">${pctOrDash(r.onlyHitRisk)}</td>
      <td class="num wf-only-den">${fmtNumOrDash(r.onlyHitDen)}</td>
    </tr>`;
}
function renderRuleReviewSegmentRowHtml(r) {
  return `<tr class="segment-row" data-segment-id="${esc(r.ruleId || "")}">
      <td></td>
      <td class="num">—</td>
      <td>${esc(r.name)}</td>
      <td>${kindLabelText(r.kind)}</td>
      <td class="num">${fmtNumOrDash(r.postHitVol)}</td>
      <td class="num">${fmtNumOrDash(r.postMissVol)}</td>
      <td class="num">${pctOrDash(r.riskHit)}</td>
      <td class="num">${pctOrDash(r.riskMiss)}</td>
      <td class="num">—</td>
      <td class="num">—</td>
      <td class="num">—</td>
      <td class="num">—</td>
    </tr>`;
}
function renderRuleReviewOverallHtml(summary) {
  const riskMetric = summary.riskMetric || "—";
  const la = S.lastAnalysis;
  const orderedRows = orderSummaryRowsForWaterfall(
    summary.rows, la?.waterfallOrder, la?.hardRules, la?.softRules
  );
  const segmentRows = segmentRowsFromSummary(summary.rows);
  const overallTip = `样本量=风险分母Σ；☰ 拖拽调瀑布序，同步贷前（${riskMetric}）`;
  let html = `<h4 class="rv-heading-with-hint">整体汇总${hintBadgeHtml(overallTip)}</h4>
    <table class="data-table pre-strategy-table post-rule-review-overall-table"><thead><tr>
      <th style="width:2rem"></th><th>序</th>
      <th>规则</th><th>类型</th>
      <th>贷后命中样本</th><th>贷后未命中组样本</th>
      <th>贷后命中组风险</th><th>贷后未命中组风险</th>
      <th>瀑布命中风险</th><th>瀑布命中样本</th>
      <th>仅命中风险</th><th>仅命中样本</th>
    </tr></thead><tbody id="postRuleReviewOverallBody">`;
  if (!orderedRows.length && !segmentRows.length) {
    html += `<tr><td colspan="12" class="config-muted">无规则数据</td></tr>`;
  } else {
    orderedRows.forEach((r, i) => { html += renderRuleReviewOverallRowHtml(r, i); });
  }
  html += `</tbody>`;
  if (segmentRows.length) {
    html += `<tfoot id="postRuleReviewOverallFoot">`;
    segmentRows.forEach((r) => { html += renderRuleReviewSegmentRowHtml(r); });
    html += `</tfoot>`;
  }
  html += `</table>`;
  return html;
}
async function refreshPostRuleReviewAfterWaterfall() {
  const la = S.lastAnalysis;
  if (!la?.postRows?.length || !la.summary) return;
  const summary = await RV.domain.summary.computeSummary(
    la.postRows, la.hardRules || [], la.softRules || [],
    la.postGroupCols || [], la.waterfallOrder, la.ratioSpecs || []
  );
  la.summary = { ...la.summary, rows: summary.rows };
  updatePostRuleReviewOverall(la.summary);
}
async function reorderPostRuleReviewWaterfall(ordered) {
  if (!S.lastAnalysis || !ordered.length) return;
  S.lastAnalysis.waterfallOrder = ordered;
  setAnalyzeStatus("瀑布顺序已更新，重算中…");
  try {
    await RV.ui.report.pre.syncPreWaterfallOrder(ordered);
    await refreshPostRuleReviewAfterWaterfall();
    setAnalyzeStatus("瀑布顺序已更新", "ok");
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("瀑布顺序更新失败：" + (err.message || err), "err");
  }
}
function initPostRuleReviewWaterfallDnD() {
  const tbody = $("postRuleReviewOverallBody");
  if (!tbody || isExportMode() || tbody.dataset.sortBound === "1") return;
  tbody.dataset.sortBound = "1";

  let dragItem = null;
  let placeholder = null;
  let orderBeforeDrag = "";
  let activePointer = null;
  let rafPending = false;
  let lastClientY = 0;

  function finishDrag(commit) {
    if (!dragItem || !placeholder) return;
    tbody.insertBefore(dragItem, placeholder);
    placeholder.remove();
    dragItem.classList.remove("wf-dragging", "wf-sort-hidden");
    if (activePointer != null) {
      try { dragItem.releasePointerCapture(activePointer); } catch (_) { /* ignore */ }
    }
    if (commit) {
      const ordered = readWaterfallOrderFromDom(tbody);
      const orderAfter = waterfallOrderKey(ordered);
      if (ordered.length && orderAfter !== orderBeforeDrag) {
        void reorderPostRuleReviewWaterfall(ordered);
      }
    }
    dragItem = null;
    placeholder = null;
    activePointer = null;
    rafPending = false;
  }

  tbody.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".drag-handle")) return;
    const item = e.target.closest("tr.wf-row");
    if (!item) return;
    e.preventDefault();
    dragItem = item;
    activePointer = e.pointerId;
    orderBeforeDrag = waterfallOrderKey(readWaterfallOrderFromDom(tbody));
    placeholder = document.createElement("tr");
    placeholder.className = "waterfall-placeholder-row";
    placeholder.innerHTML = `<td colspan="12"><div class="waterfall-placeholder"></div></td>`;
    tbody.insertBefore(placeholder, item);
    item.classList.add("wf-sort-hidden");
    item.setPointerCapture(activePointer);
    lastClientY = e.clientY;
  });

  tbody.addEventListener("pointermove", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    e.preventDefault();
    lastClientY = e.clientY;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (dragItem && placeholder) moveWaterfallPlaceholder(tbody, placeholder, lastClientY, dragItem);
    });
  });

  tbody.addEventListener("pointerup", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    e.preventDefault();
    finishDrag(true);
  });

  tbody.addEventListener("pointercancel", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    finishDrag(false);
  });
}
function updatePostRuleReviewOverall(summary) {
  const overallMount = $("postRuleReviewOverallMount");
  if (!overallMount || !summary) return;
  overallMount.innerHTML = renderRuleReviewOverallHtml(summary);
  initResizableTables(overallMount);
  initPostRuleReviewWaterfallDnD();
}
function updatePostRuleReviewSection(summary) {
  const overallMount = $("postRuleReviewOverallMount");
  const filtersMount = $("postRuleReviewTrendFiltersMount");
  const tableMount = $("postRuleReviewTrendTableMount");
  if (!overallMount || !filtersMount || !tableMount) return;

  if (!summary) {
    overallMount.innerHTML = `<p class="config-muted da-results-placeholder">配置左侧样本与规则后点击「生成分析报告」</p>`;
    filtersMount.innerHTML = "";
    tableMount.innerHTML = "";
    return;
  }

  updatePostRuleReviewOverall(summary);
  const groupCols = summary.groupCols || [];
  const dimValues = collectRuleReviewTrendDimValues(summary.trend || [], groupCols);
  const priorFilter = collectPostRuleReviewTrendValueFilter();
  filtersMount.innerHTML = renderRuleReviewTrendFilters(summary);
  initRuleReviewTrendDimPickers(groupCols, priorFilter, dimValues);
  tableMount.innerHTML = renderRuleReviewTrendTableShell(summary);
  initResizableTables(tableMount);
  refreshPostRuleReviewTrendTable();
}
function collectPostRuleReviewTrendValueFilter() {
  const groupCols = S.lastAnalysis?.summary?.groupCols || [];
  return CP().collectDimFilterState(groupCols, ruleReviewTrendPickerId);
}
function applyPostRuleReviewTrendValueFilter(savedFilter) {
  if (!savedFilter) return;
  for (const [col, vals] of Object.entries(savedFilter)) {
    CP().applySelection(ruleReviewTrendPickerId(col), vals);
  }
  syncRuleReviewTrendDimPickers(Object.keys(savedFilter));
}

  Object.assign(target, {
    collectRuleReviewTrendDimValues,
    getRuleReviewTrendFilterMap,
    ruleReviewTrendRowMatches,
    renderRuleReviewTrendRowsHtml,
    refreshPostRuleReviewTrendTable,
    renderRuleReviewTrendFilters,
    renderRuleReviewTrendTableShell,
    renderRuleReviewOverallHtml,
    updatePostRuleReviewOverall,
    updatePostRuleReviewSection,
    refreshPostRuleReviewAfterWaterfall,
    reorderPostRuleReviewWaterfall,
    initPostRuleReviewWaterfallDnD,
    collectPostRuleReviewTrendValueFilter,
    applyPostRuleReviewTrendValueFilter,
    syncRuleReviewTrendDimPickers,
  });
})(window.RV);
