(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const collectRatioSpecs = RV.ui.sidebar.collectRatioSpecs;
  const compareDimValue = RV.infra.compareDimValue;
  const computePostRisk = RV.domain.postRisk.computePostRisk;
  const computeSummary = RV.domain.summary.computeSummary;
  function updatePostRuleReviewSection(...args) {
    return RV.ui.report.postRuleReview.updatePostRuleReviewSection(...args);
  }
  function applyPostRuleReviewTrendValueFilter(...args) {
    return RV.ui.report.postRuleReview.applyPostRuleReviewTrendValueFilter(...args);
  }
  function collectPostRuleReviewTrendValueFilter(...args) {
    return RV.ui.report.postRuleReview.collectPostRuleReviewTrendValueFilter(...args);
  }
  function refreshPostRuleReviewTrendTable(...args) {
    return RV.ui.report.postRuleReview.refreshPostRuleReviewTrendTable(...args);
  }
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const esc = RV.infra.esc;
  const fmtNum = RV.infra.fmtNum;
  const formatGroupLabels = RV.infra.formatGroupLabels;
  const getAnalysisGroupDimensionCandidates = (...args) => RV.ui.report.analysis.getAnalysisGroupDimensionCandidates(...args);
  const getChecked = RV.ui.sidebar.getChecked;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const initResizableTables = (...args) => RV.ui.report.analysis.initResizableTables(...args);
  const initSampleGroupPanel = RV.ui.sidebar.initSampleGroupPanel;
  const pct = RV.infra.pct;
  const rateHeatStyle = RV.infra.rateHeatStyle;
  const setAnalyzeStatus = (...args) => RV.app.orchestrator.setAnalyzeStatus(...args);
  const syncSampleGroupOrderList = RV.ui.sidebar.syncSampleGroupOrderList;
  const trendRateScales = RV.infra.trendRateScales;
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  var target = report.post = report.post || {};
  var postRiskRecomputeTimer = null;
  const CP = () => RV.ui.collapsedPicker;

function postTrendPickerId(col) {
  return `postTrend:${col}`;
}

function registerPostTrendDimPicker(col) {
  const pickerId = postTrendPickerId(col);
  CP().registerDimPicker(pickerId, {
    onChange: () => refreshPostTrendTable(),
  });
}

function initPostTrendDimPickers(groupCols, savedFilter, dimValues) {
  for (const col of groupCols || []) {
    registerPostTrendDimPicker(col);
    const pickerId = postTrendPickerId(col);
    const vals = dimValues?.[col] || [];
    const saved = savedFilter?.[col];
    CP().initDimPicker(pickerId, {
      values: vals,
      selected: savedFilter?.[col] !== undefined ? savedFilter[col] : vals,
    });
  }
}

function syncPostTrendDimPickers(groupCols) {
  for (const col of groupCols || []) {
    const pickerId = postTrendPickerId(col);
    if (CP().getPickerSpec(pickerId)) CP().syncUI(pickerId);
  }
}

function renderPostGroupConfigHtml() {
  return RV.ui.sidebar.renderGroupConfigBlock("post", {
    omitTitle: true,
    hint: "",
    filterNote: "",
    highCardHint: "",
  });
}
function refreshPostConfigAccordionSummary() {
  const n = S.lastAnalysis?.postRows?.length;
  const samplePart = n != null ? `样本 ${n.toLocaleString()}` : "未生成报告";
  RV.ui.configPanel.setSummaryText("postConfigAccordionSummary", samplePart);
}
function refreshPostGroupAccordionSummary() {
  const cols = RV.ui.sidebar.getSampleGroupCols("post") || [];
  const groupPart = cols.length
    ? RV.ui.configPanel.formatSummaryList(cols, 3, 14)
    : "未选";
  RV.ui.configPanel.setSummaryText("postGroupAccordionSummary", groupPart);
}
function syncPostConfigAccordionCollapsed() {
  if (!$("postConfigAccordion") || !RV.ui.configPanel) return;
  refreshPostConfigAccordionSummary();
  refreshPostGroupAccordionSummary();
  if (S.lastAnalysis) {
    RV.ui.configPanel.collapsePanels(["postConfigAccordion", "postGroupAccordion"]);
  } else {
    RV.ui.configPanel.expandPanels(["postConfigAccordion", "postGroupAccordion"]);
  }
}
function bindPostConfigAccordion() {
  const tab = $("tab-post");
  if (!tab || !RV.ui.configPanel) return;
  delete tab.dataset.configPanelToggleBound;
  RV.ui.configPanel.bindPanelToggle(tab, {
    onToggle: (id, collapsed) => {
      if (id === "postConfigAccordion" && collapsed) refreshPostConfigAccordionSummary();
      if (id === "postGroupAccordion" && collapsed) refreshPostGroupAccordionSummary();
    },
  });
  tab.addEventListener("change", (e) => {
    if (e.target.closest("#postGroupConfig, #postGroupAccordion")) {
      refreshPostGroupAccordionSummary();
    }
  });
}
/** @deprecated alias — group pin replaced by config accordion */
function refreshPostGroupConfigSummary() {
  refreshPostConfigAccordionSummary();
  refreshPostGroupAccordionSummary();
}
function syncPostGroupConfigPinCollapsed() { syncPostConfigAccordionCollapsed(); }
function bindPostGroupConfigPin() { bindPostConfigAccordion(); }
function markMainReportStale() {
  if (!S.lastAnalysis) return;
  S.mainReportStale = true;
  $("postStaleBanner")?.classList.add("is-visible");
  $("preStaleBanner")?.classList.add("is-visible");
}
function clearMainReportStale() {
  S.mainReportStale = false;
  $("postStaleBanner")?.classList.remove("is-visible");
  $("preStaleBanner")?.classList.remove("is-visible");
  RV.events?.refreshProvenanceBar?.();
}
function bindMainReportStaleEvents() {
  const bind = (id) => {
    const btn = $(id);
    if (!btn || btn.dataset.rvBound === "1") return;
    btn.dataset.rvBound = "1";
    btn.addEventListener("click", () => void RV.app.orchestrator.runAnalysis());
  };
  bind("postStaleRerunBtn");
  bind("preStaleRerunBtn");
  if (S.mainReportStale) markMainReportStale();
}
function renderPostTabShell() {
  const groupTip = RV.infra.plainTipText(
    "改分组即时刷新趋势与复盘，无需重跑报告"
  );
  return `<section id="tab-post"><h2>贷后风险</h2>
    <div id="postStaleBanner" class="rv-stale-banner" role="status">
      <span>侧栏样本/规则/比率已变，贷后结果可能过期。</span>
      <button type="button" class="btn btn-secondary btn-sm" id="postStaleRerunBtn">重新生成分析报告</button>
    </div>
    <div class="da-config-panel rv-wb-config-accordion" id="postConfigAccordion">
      <div class="da-panel-header" data-config-panel-toggle="postConfigAccordion" role="button" tabindex="0">
        <span class="da-panel-title-text">配置</span>
        <span class="da-panel-summary" id="postConfigAccordionSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div class="rv-wb-meta rv-wb-meta-empty" id="postSampleInfoMount"><span class="config-muted">生成报告后显示样本摘要</span></div>
      </div>
    </div>
    <div class="da-config-panel rv-wb-config-accordion" id="postGroupAccordion">
      <div class="da-panel-header" data-config-panel-toggle="postGroupAccordion" role="button" tabindex="0">
        <span class="da-panel-title-text rv-heading-with-hint">分组变量${hintBadgeHtml(groupTip, { aria: "分组变量" })}</span>
        <span class="da-panel-summary" id="postGroupAccordionSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        ${renderPostGroupConfigHtml()}
      </div>
    </div>
    <div class="rv-wb-zone rv-wb-results">
      <div class="rv-wb-zone-label">结果</div>
      <div class="rv-result-card" id="postOverallRiskMount"></div>
      <div class="rv-result-card">
        <div id="postTrendFiltersMount"></div>
        <div id="postTrendTableMount"></div>
      </div>
      <div class="rv-result-card post-module post-rule-review-module">
        <h3 class="rv-heading-with-hint">贷后规则复盘${hintBadgeHtml("按规则统计命中/未命中及风险")}</h3>
        <div id="postRuleReviewOverallMount"><p class="config-muted da-results-placeholder">配置左侧样本与规则后点击「生成分析报告」</p></div>
        <div id="postRuleReviewTrendFiltersMount"></div>
        <div id="postRuleReviewTrendTableMount"></div>
      </div>
    </div>
  </section>`;
}
function mountPostTabShell() {
  const doc = ensureReportDocument();
  const old = doc.querySelector("#tab-post");
  if (old) old.remove();
  doc.insertAdjacentHTML("afterbegin", renderPostTabShell());
}
function renderFilterChipsHtml(timeCol, timeVals, filterMap, filterRanges) {
  const chips = [];
  if (timeCol) {
    const tv = timeVals?.length ? timeVals.join("、") : "全部";
    const tip = `${timeCol}：${tv}`;
    chips.push(`<span class="rv-chip" title="${esc(tip)}">${esc(timeCol)}：${esc(tv)}</span>`);
  }
  for (const [col, vals] of Object.entries(filterMap || {})) {
    if (!vals?.length) continue;
    const show = vals.length <= 4 ? vals.join("、") : vals.slice(0, 3).join("、") + `…(${vals.length})`;
    const tip = `${col} ∈ { ${vals.join("、")} }`;
    chips.push(`<span class="rv-chip" title="${esc(tip)}">${esc(col)}：${esc(show)}</span>`);
  }
  for (const fr of filterRanges || []) {
    const op = fr.op || "between";
    let txt = "";
    if (op === "between") txt = `${fr.min ?? "—"}～${fr.max ?? "—"}`;
    else txt = `${op} ${fr.value}`;
    const tip = `${fr.col}：${txt}`;
    chips.push(`<span class="rv-chip" title="${esc(tip)}">${esc(fr.col)}：${esc(txt)}</span>`);
  }
  if (!chips.length) {
    chips.push(`<span class="rv-chip rv-chip-muted">无额外筛选</span>`);
  }
  return chips.join("");
}
function renderPostSampleInfoHtml(postCfg, preCount, postCount) {
  return `<span class="rv-wb-meta-primary">贷后样本 <b>${postCount.toLocaleString()}</b>
      <span class="rv-wb-meta-sub">/ 全量 ${preCount.toLocaleString()}</span></span>
    ${renderFilterChipsHtml(postCfg.timeCol, postCfg.timeVals, postCfg.filterMap, postCfg.filterRanges)}`;
}
function renderPostOverallRiskHtml(postRisk) {
  const items = (postRisk.overall || []).map((r) => [
    r.name || "比率",
    pct(r.rate),
    `${fmtNum(r.num)} / ${fmtNum(r.den)}`,
  ]);
  if (!items.length) {
    return `<h3>整体风险比率</h3><p class="config-muted">无风险比率</p>`;
  }
  return `<h3>整体风险比率</h3>${renderMetricCards(items)}`;
}
function collectPostTrendDimValues(trend, groupCols) {
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
function getPostTrendFilterMap(groupCols) {
  return CP().getDimFilterMap(groupCols, postTrendPickerId);
}
function postTrendRowMatches(t, groupCols, filterMap) {
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
function renderPostTrendRowsHtml(rows, groupCols, ratioSpecs, scales) {
  let html = "";
  for (const t of rows) {
    const parts = t.groupParts || [t.group];
    html += `<tr>`;
    if (groupCols.length) {
      for (const p of parts) html += `<td>${esc(p)}</td>`;
    } else {
      html += `<td>${esc(t.group)}</td>`;
    }
    ratioSpecs.forEach((spec, i) => {
      const rate = t[spec.name];
      const num = t[`${spec.name}_num`];
      const den = t[`${spec.name}_den`];
      const heat = rateHeatStyle(rate, scales[i].min, scales[i].max);
      html += `<td class="num">${fmtNum(num)}</td>`;
      html += `<td class="num">${fmtNum(den)}</td>`;
      html += `<td class="num rate-heat"${heat ? ` style="${heat}"` : ""}>${pct(rate)}</td>`;
    });
    html += `</tr>`;
  }
  return html;
}
function renderPostTrendFilters(postRisk) {
  const groupCols = postRisk.groupCols || [];
  const trend = postRisk.trend || [];
  if (!groupCols.length || !trend.length) return "";

  const dimValues = collectPostTrendDimValues(trend, groupCols);
  let html = `<div class="summary-trend-filters post-trend-filters">
    <h4 class="rv-heading-with-hint">趋势表维度筛选${hintBadgeHtml("勾选取值，即时筛行")}</h4>
    <div class="summary-trend-filter-bar">`;

  for (const col of groupCols) {
    const vals = dimValues[col] || [];
    const pickerId = postTrendPickerId(col);
    html += `<div class="summary-trend-filter post-trend-filter" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "post-trend-filter-values",
    });
    html += `</div>`;
  }

  html += `<div class="summary-trend-filter-actions">
    <button type="button" class="btn btn-secondary btn-sm post-trend-select-all">全选</button>
    <button type="button" class="btn btn-secondary btn-sm post-trend-clear-all">清空</button>
  </div></div></div>`;
  return html;
}
function renderPostTrendTableShell(postRisk, ratioSpecs) {
  const groupCols = postRisk.groupCols || [];
  const trend = postRisk.trend || [];
  if (!trend.length || !ratioSpecs.length) {
    return `<p class="config-muted">无趋势数据${groupCols.length ? "" : "；请勾选分组变量"}</p>`;
  }
  const groupLabel = esc(formatGroupLabels(groupCols));
  const groupThs = groupCols.length
    ? groupCols.map((c) => `<th rowspan="2">${esc(c)}</th>`).join("")
    : `<th rowspan="2">分组</th>`;

  let html = `<h3 class="rv-heading-with-hint">趋势表（${groupLabel}）${hintBadgeHtml("同列青低黄高；行按维度升序")}</h3>`;
  html += `<p id="postTrendFilterMeta" class="config-muted" style="font-size:.78rem;margin:0 0 .35rem"></p>`;
  html += `<table id="postTrendTable" class="data-table trend-table"><thead>`;
  html += `<tr>${groupThs}`;
  for (const spec of ratioSpecs) {
    html += `<th colspan="3">${esc(spec.name)}</th>`;
  }
  html += `</tr><tr>`;
  for (let i = 0; i < ratioSpecs.length; i++) {
    html += `<th>分子Σ</th><th>分母Σ</th><th>比率</th>`;
  }
  html += `</tr></thead><tbody id="postTrendTableBody"></tbody></table>`;
  return html;
}
function refreshPostTrendTable() {
  const postRisk = S.lastAnalysis?.postRisk;
  const tbody = $("postTrendTableBody");
  if (!postRisk || !tbody) return;

  const ratioSpecs = S.lastAnalysis?.ratioSpecs || collectRatioSpecs();
  const groupCols = postRisk.groupCols || [];
  const trend = postRisk.trend || [];
  const filterMap = getPostTrendFilterMap(groupCols);
  const filtered = groupCols.length
    ? trend.filter((t) => postTrendRowMatches(t, groupCols, filterMap))
    : trend;
  const scales = trendRateScales(filtered, ratioSpecs);
  const colSpan = (groupCols.length || 1) + ratioSpecs.length * 3;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="config-muted">无符合筛选条件的行，请调整维度取值</td></tr>`;
  } else {
    tbody.innerHTML = renderPostTrendRowsHtml(filtered, groupCols, ratioSpecs, scales);
  }

  const meta = $("postTrendFilterMeta");
  if (meta) meta.textContent = `显示 ${filtered.length.toLocaleString()} / ${trend.length.toLocaleString()} 行`;
}
function updatePostTrendSection(postRisk, ratioSpecs) {
  const filtersMount = $("postTrendFiltersMount");
  const tableMount = $("postTrendTableMount");
  if (!filtersMount || !tableMount) return;

  const groupCols = postRisk.groupCols || [];
  const dimValues = collectPostTrendDimValues(postRisk.trend || [], groupCols);
  const priorFilter = collectPostTrendValueFilter();
  filtersMount.innerHTML = renderPostTrendFilters(postRisk);
  initPostTrendDimPickers(groupCols, priorFilter, dimValues);
  tableMount.innerHTML = renderPostTrendTableShell(postRisk, ratioSpecs);
  initResizableTables(tableMount);
  refreshPostTrendTable();
}
function updatePostResults(data) {
  const { preCfg, postCfg, postRisk, preCount, postCount, ratioSpecs, summary } = data;
  const ratios = ratioSpecs && ratioSpecs.length ? ratioSpecs : collectRatioSpecs();

  const sampleMount = $("postSampleInfoMount");
  if (sampleMount) {
    sampleMount.className = "rv-wb-meta";
    sampleMount.innerHTML = renderPostSampleInfoHtml(postCfg, preCount, postCount);
  }
  refreshPostConfigAccordionSummary();
  refreshPostGroupAccordionSummary();

  const overallMount = $("postOverallRiskMount");
  if (overallMount) {
    overallMount.innerHTML = renderPostOverallRiskHtml(postRisk);
    initResizableTables(overallMount);
  }

  updatePostTrendSection(postRisk, ratios);
  updatePostRuleReviewSection(summary || S.lastAnalysis?.summary);
}
function schedulePostRiskRecompute() {
  if (!S.lastAnalysis?.postRows?.length) return;
  clearTimeout(postRiskRecomputeTimer);
  postRiskRecomputeTimer = setTimeout(() => void refreshPostRiskView(), 280);
}
function bindPostGroupRecomputeEvents() {
  // Checkbox/order handlers live on initSampleGroupPanel (sidebar.js).
}
async function refreshPostRiskView() {
  if (!S.lastAnalysis?.postRows?.length) return;
  if (S.postRiskRefreshBusy) {
    schedulePostRiskRecompute();
    return;
  }
  if (window.__RV_EXPORT_MODE__) return;

  S.postRiskRefreshBusy = true;
  try {
    const postGroupCols = RV.ui.sidebar.getSampleGroupCols("post");
    const ratioSpecs = collectRatioSpecs();
    if (!ratioSpecs.length) {
      setAnalyzeStatus("请先配置贷后风险比率", "err");
      return;
    }

    const { hardRules, softRules } = S.lastAnalysis;
    setAnalyzeStatus("刷新贷后分组趋势…");
    const [postRisk, summary] = await Promise.all([
      computePostRisk(
        S.lastAnalysis.postRows, ratioSpecs, postGroupCols,
        (d, t) => setAnalyzeStatus(`风险趋势 ${d.toLocaleString()} / ${t.toLocaleString()}`)
      ),
      computeSummary(
        S.lastAnalysis.postRows, hardRules, softRules, postGroupCols,
        S.lastAnalysis.waterfallOrder,
        ratioSpecs,
        (d, t) => setAnalyzeStatus(`规则复盘 ${d.toLocaleString()} / ${t.toLocaleString()}`)
      ),
    ]);

    S.lastAnalysis.postRisk = postRisk;
    S.lastAnalysis.summary = summary;
    S.lastAnalysis.postGroupCols = postGroupCols;
    S.lastAnalysis.ratioSpecs = ratioSpecs;

    updatePostTrendSection(postRisk, ratioSpecs);
    updatePostRuleReviewSection(summary);
    setAnalyzeStatus("分组趋势已更新", "ok");
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("分组趋势刷新失败：" + (err.message || err), "err");
  } finally {
    S.postRiskRefreshBusy = false;
  }
}
function collectPostTrendValueFilter() {
  const groupCols = S.lastAnalysis?.postRisk?.groupCols || [];
  return CP().collectDimFilterState(groupCols, postTrendPickerId);
}
function applyPostTrendValueFilter(savedFilter) {
  if (!savedFilter) return;
  for (const [col, vals] of Object.entries(savedFilter)) {
    CP().applySelection(postTrendPickerId(col), vals);
  }
  syncPostTrendDimPickers(Object.keys(savedFilter));
}
function snapshotPostUiState() {
  if (!$("tab-post")) return null;
  return {
    groupDimensions: {
      columns: getChecked($("postGroupCols")),
      order: RV.ui.sidebar.getSampleGroupCols("post"),
    },
    trendValueFilter: collectPostTrendValueFilter(),
    ruleReviewTrendValueFilter: collectPostRuleReviewTrendValueFilter(),
  };
}
function restorePostUiState(state) {
  if (!state?.groupDimensions) return;
  RV.ui.sidebar.applySampleGroupDimensions("post", state.groupDimensions, []);
}
function setupPostRiskTabShell(groupCols) {
  mountPostTabShell();
  initSampleGroupPanel("post", groupCols);
  bindPostGroupRecomputeEvents();
  bindPostGroupConfigPin();
  syncPostGroupConfigPinCollapsed();
  bindMainReportStaleEvents();
}
function remountPostTabAfterReport(priorState, reportData) {
  setupPostRiskTabShell(getAnalysisGroupDimensionCandidates());
  restorePostUiState(priorState);
  if (reportData) {
    updatePostResults(reportData);
    applyPostTrendValueFilter(priorState?.trendValueFilter);
    applyPostRuleReviewTrendValueFilter(
      priorState?.ruleReviewTrendValueFilter || S.pendingSummaryImport?.trendValueFilter
    );
    S.pendingSummaryImport = null;
    refreshPostTrendTable();
    refreshPostRuleReviewTrendTable();
  }
  syncPostGroupConfigPinCollapsed();
}
function initPostRiskTabShell(groupCols) {
  setupPostRiskTabShell(groupCols);
}
function buildFullReport() {
  return `<div class="report-document"></div>`;
}
function showTab(tabId) {
  if (tabId !== "profitability" && tabId !== "riskTarget" && tabId !== "elAllocator" && !S.rawRows.length) {
    const status = $("analyzeStatus");
    if (status) {
      status.textContent = "请先上传 CSV 后再进入该模块";
      status.className = "status warn";
    }
    RV.events?.notify?.("该模块需要先上传 CSV", "warn");
    return;
  }
  RV.app.orchestrator?.ensureTabMounted?.(tabId);
  document.querySelectorAll("#reportTabs .tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  const doc = $("report-output").querySelector(".report-document");
  if (!doc) return;
  const sections = {
    post: "tab-post",
    pre: "tab-pre",
    analysis: "tab-analysis",
    validity: "tab-validity",
    profitability: "tab-profitability",
    riskTarget: "tab-risk-target",
    elAllocator: "tab-el-allocator",
    attribution: "tab-attribution",
    dailyReview: "tab-daily-review",
  };
  doc.querySelectorAll("section").forEach((s) => s.classList.remove("section-visible"));
  const id = sections[tabId];
  const el = id ? doc.querySelector(`#${id}`) : null;
  if (el) el.classList.add("section-visible");
  if (tabId === "profitability") {
    RV.ui.report.profitability?.recalculate?.();
  }
  if (tabId === "riskTarget") {
    RV.ui.report.riskTarget?.recalculate?.();
  }
  if (tabId === "elAllocator") {
    RV.ui.report.elAllocator?.recalculate?.();
  }
}
function renderMetricCards(items) {
  return `<div class="metric-cards">${(items || []).map((it) => {
    const lbl = it[0];
    const val = it[1];
    const sub = it[2];
    const subHtml = sub != null && String(sub) !== ""
      ? `<div class="sub">${esc(sub)}</div>`
      : "";
    return `<div class="metric-card"><div class="val">${esc(val)}</div>${subHtml}<div class="lbl">${esc(lbl)}</div></div>`;
  }).join("")}</div>`;
}
function formatFilterHtml(timeCol, timeVals, filterMap, filterRanges) {
  const lines = [];
  if (timeCol) {
    const tv = timeVals.length ? timeVals.join("、") : "全部";
    lines.push(`<li><b>${esc(timeCol)}</b>：${esc(tv)}</li>`);
  }
  for (const [col, vals] of Object.entries(filterMap || {})) {
    if (!vals.length) continue;
    const show = vals.length <= 8 ? vals.map(esc).join("、") : vals.slice(0, 6).map(esc).join("、") + `…（${vals.length}项）`;
    lines.push(`<li><b>${esc(col)}</b> ∈ { ${show} }</li>`);
  }
  for (const fr of filterRanges || []) {
    const op = fr.op || "between";
    let txt = "";
    if (op === "between") txt = `${fr.min ?? "—"} ≤ 值 ≤ ${fr.max ?? "—"}`;
    else txt = `${op} ${fr.value}`;
    lines.push(`<li><b>${esc(fr.col)}</b>：${esc(txt)}</li>`);
  }
  return lines.length ? `<ul class="config-filter-list">${lines.join("")}</ul>` : '<p class="config-muted">无筛选（全量）</p>';
}

  Object.assign(target, {
    renderPostGroupConfigHtml, renderPostTabShell, mountPostTabShell, renderPostSampleInfoHtml,
    renderPostOverallRiskHtml, collectPostTrendDimValues, getPostTrendFilterMap, postTrendRowMatches,
    renderPostTrendRowsHtml, renderPostTrendFilters, renderPostTrendTableShell, refreshPostTrendTable,
    updatePostTrendSection, updatePostResults, schedulePostRiskRecompute, bindPostGroupRecomputeEvents,
    refreshPostRiskView, collectPostTrendValueFilter, applyPostTrendValueFilter, snapshotPostUiState,
    restorePostUiState, setupPostRiskTabShell, remountPostTabAfterReport, initPostRiskTabShell,
    buildFullReport, showTab, renderMetricCards, formatFilterHtml, renderFilterChipsHtml,
    syncPostTrendDimPickers,
    markMainReportStale, clearMainReportStale, bindMainReportStaleEvents,
    refreshPostConfigAccordionSummary, refreshPostGroupAccordionSummary,
    syncPostConfigAccordionCollapsed, bindPostConfigAccordion,
  });
})(window.RV);
