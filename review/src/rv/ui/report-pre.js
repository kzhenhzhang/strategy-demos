(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const buildHitMap = RV.domain.preStrategy.buildHitMap;
  const computeHitMetrics = RV.domain.preStrategy.computeHitMetrics;
  const computePreGroupOverview = RV.domain.preStrategy.computePreGroupOverview;
  const computeWaterfall = RV.domain.preStrategy.computeWaterfall;
  const compareDimValue = RV.infra.compareDimValue;
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const esc = RV.infra.esc;
  const fmtNum = RV.infra.fmtNum;
  const formatGroupLabels = RV.infra.formatGroupLabels;
  const getAnalysisGroupDimensionCandidates = (...args) => RV.ui.report.analysis.getAnalysisGroupDimensionCandidates(...args);
  const getChecked = RV.ui.sidebar.getChecked;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const initResizableTables = (...args) => RV.ui.report.analysis.initResizableTables(...args);
  const initSampleGroupPanel = RV.ui.sidebar.initSampleGroupPanel;
  function isExportMode() { return !!(RV.export?.isExportMode && RV.export.isExportMode()); }
  function showExportStaticNotice() { RV.export?.showExportStaticNotice?.(); }
  const pct = RV.infra.pct;
  const renderMetricCards = RV.ui.report.post.renderMetricCards;
  const renderWaterfallChart = RV.ui.charts.renderWaterfallChart;
  const rowVal = RV.infra.rowVal;
  const safeRate = RV.infra.safeRate;
  const setAnalyzeStatus = (...args) => RV.app.orchestrator.setAnalyzeStatus(...args);
  const strVal = RV.infra.strVal;
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  var target = report.pre = report.pre || {};
  const CP = () => RV.ui.collapsedPicker;

function preStrategyPickerId(col) {
  return `preStrategy:${col}`;
}

function registerPreStrategyDimPicker(col) {
  const pickerId = preStrategyPickerId(col);
  CP().registerDimPicker(pickerId, {
    onChange: () => { void refreshPreStrategyView(); },
  });
}

function initPreStrategyDimPickers(groupCols, savedFilter, dimValues) {
  for (const col of groupCols || []) {
    registerPreStrategyDimPicker(col);
    const pickerId = preStrategyPickerId(col);
    const vals = dimValues?.[col] || [];
    const saved = savedFilter?.[col];
    CP().initDimPicker(pickerId, {
      values: vals,
      selected: savedFilter?.[col] !== undefined ? savedFilter[col] : vals,
    });
  }
}

function syncPreStrategyDimPickers(groupCols) {
  for (const col of groupCols || []) {
    const pickerId = preStrategyPickerId(col);
    if (CP().getPickerSpec(pickerId)) CP().syncUI(pickerId);
  }
}
  var preGroupDimRecomputeTimer = null;

function kindTag(kind) {
  return kind === "hard"
    ? '<span class="tag-hard">硬</span>'
    : '<span class="tag-soft">软</span>';
}
function renderPreGroupConfigHtml() {
  return RV.ui.sidebar.renderGroupConfigBlock("pre", {
    omitTitle: true,
    hint: "",
    filterNote: "",
    highCardHint: "",
  });
}
function refreshPreConfigAccordionSummary() {
  const n = S.lastAnalysis?.preRows?.length;
  const samplePart = n != null ? `样本 ${n.toLocaleString()}` : "未生成报告";
  RV.ui.configPanel.setSummaryText("preConfigAccordionSummary", samplePart);
}
function refreshPreGroupAccordionSummary() {
  const cols = RV.ui.sidebar.getSampleGroupCols("pre") || [];
  const groupPart = cols.length
    ? RV.ui.configPanel.formatSummaryList(cols, 3, 14)
    : "未选";
  RV.ui.configPanel.setSummaryText("preGroupAccordionSummary", groupPart);
}
function syncPreConfigAccordionCollapsed() {
  if (!$("preConfigAccordion") || !RV.ui.configPanel) return;
  refreshPreConfigAccordionSummary();
  refreshPreGroupAccordionSummary();
  if (S.lastAnalysis) {
    RV.ui.configPanel.collapsePanels(["preConfigAccordion", "preGroupAccordion"]);
  } else {
    RV.ui.configPanel.expandPanels(["preConfigAccordion", "preGroupAccordion"]);
  }
}
function bindPreConfigAccordion() {
  const tab = $("tab-pre");
  if (!tab || !RV.ui.configPanel) return;
  delete tab.dataset.configPanelToggleBound;
  RV.ui.configPanel.bindPanelToggle(tab, {
    onToggle: (id, collapsed) => {
      if (id === "preConfigAccordion" && collapsed) refreshPreConfigAccordionSummary();
      if (id === "preGroupAccordion" && collapsed) refreshPreGroupAccordionSummary();
    },
  });
  tab.addEventListener("change", (e) => {
    if (e.target.closest("#preGroupConfig, #preGroupAccordion")) {
      refreshPreGroupAccordionSummary();
    }
  });
}
function refreshPreGroupConfigSummary() {
  refreshPreConfigAccordionSummary();
  refreshPreGroupAccordionSummary();
}
function syncPreGroupConfigPinCollapsed() { syncPreConfigAccordionCollapsed(); }
function bindPreGroupConfigPin() { bindPreConfigAccordion(); }
function renderPreTabShell() {
  const groupTip = RV.infra.plainTipText(
    "改分组即时刷新汇总与瀑布，无需重跑"
  );
  return `<section id="tab-pre"><h2>贷前策略分析</h2>
    <div id="preStaleBanner" class="rv-stale-banner" role="status">
      <span>侧栏样本/规则/比率已变，贷前结果可能过期。</span>
      <button type="button" class="btn btn-secondary btn-sm" id="preStaleRerunBtn">重新生成分析报告</button>
    </div>
    <div class="da-config-panel rv-wb-config-accordion" id="preConfigAccordion">
      <div class="da-panel-header" data-config-panel-toggle="preConfigAccordion" role="button" tabindex="0">
        <span class="da-panel-title-text">配置</span>
        <span class="da-panel-summary" id="preConfigAccordionSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div class="rv-wb-meta rv-wb-meta-empty" id="preSampleInfoMount"><span class="config-muted">生成报告后显示样本摘要</span></div>
      </div>
    </div>
    <div class="da-config-panel rv-wb-config-accordion" id="preGroupAccordion">
      <div class="da-panel-header" data-config-panel-toggle="preGroupAccordion" role="button" tabindex="0">
        <span class="da-panel-title-text rv-heading-with-hint">分组变量${hintBadgeHtml(groupTip, { aria: "分组变量" })}</span>
        <span class="da-panel-summary" id="preGroupAccordionSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        ${renderPreGroupConfigHtml()}
      </div>
    </div>
    <div class="rv-wb-zone rv-wb-results">
      <div class="rv-wb-zone-label">结果</div>
      <div class="rv-result-card" id="preMetricCardsMount"></div>
      <div class="rv-result-card">
        <div id="preStrategyGroupFiltersMount"></div>
        <div id="preGroupTableMount"></div>
      </div>
      <div class="rv-result-card" id="preWaterfallSectionMount"></div>
    </div>
  </section>`;
}
function mountPreTabShell() {
  const doc = ensureReportDocument();
  const old = doc.querySelector("#tab-pre");
  if (old) old.remove();
  const post = doc.querySelector("#tab-post");
  if (post) post.insertAdjacentHTML("afterend", renderPreTabShell());
  else doc.insertAdjacentHTML("beforeend", renderPreTabShell());
}
function renderPreSampleInfoHtml(preCfg, preRowsCount, csvCount) {
  const chips = RV.ui.report.post.renderFilterChipsHtml(
    preCfg.timeCol, preCfg.timeVals, preCfg.filterMap, preCfg.filterRanges
  );
  return `<span class="rv-wb-meta-primary">贷前样本 <b>${preRowsCount.toLocaleString()}</b>
      <span class="rv-wb-meta-sub">/ 全量 ${csvCount.toLocaleString()}</span></span>
    ${chips}`;
}
function renderPreOverviewCardsHtml(hitMetrics) {
  const o = hitMetrics?.overview || hitMetrics || {};
  return renderMetricCards([
    ["进件量 Σ", fmtNum(o.totalApply)],
    ["通过量 Σ", fmtNum(o.totalPass)],
    ["通过率", pct(o.passRate)],
  ]);
}
function renderPreGroupTable(preGroup) {
  const groupCols = preGroup?.groupCols || [];
  if (!groupCols.length) {
    return `<p class="config-muted">请勾选分组变量后查看分组汇总</p>`;
  }
  let html = `<h3>分组汇总（${esc(formatGroupLabels(groupCols))}）</h3>`;
  if (!preGroup?.trend?.length) {
    html += `<p class="config-muted">无符合当前筛选的分组数据</p>`;
    return html;
  }
  html += `<table class="data-table"><thead><tr>`;
  for (const c of groupCols) html += `<th>${esc(c)}</th>`;
  html += `<th>进件量 Σ</th><th>通过量 Σ</th><th>通过率</th></tr></thead><tbody>`;
  for (const t of preGroup.trend) {
    html += `<tr>`;
    for (let i = 0; i < groupCols.length; i++) {
      html += `<td>${esc(t.groupParts?.[i] ?? "")}</td>`;
    }
    html += `<td class="num">${fmtNum(t.totalApply)}</td>`;
    html += `<td class="num">${fmtNum(t.totalPass)}</td>`;
    html += `<td class="num">${pct(t.passRate)}</td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}
function renderWaterfallSectionHtml(waterfall, hitMetrics) {
  const hitMap = buildHitMap(hitMetrics);
  let html = `<h3 class="rv-heading-with-hint">规则瀑布${hintBadgeHtml("☰ 拖拽调序；分母=当前筛选进件")}</h3>`;
  html += `<p id="preHardUnionLine" style="font-size:.88rem;margin:.5rem 0">筛选样本进件量：<b>${fmtNum(hitMetrics.totalApply)}</b>；
    硬规则并集命中：<b>${fmtNum(hitMetrics.hardUnionVol)}</b>（${pct(safeRate(hitMetrics.hardUnionVol, hitMetrics.totalApply))}）</p>`;
  html += `<div id="preWaterfallTableMount"><table class="data-table pre-strategy-table"><thead><tr>
    <th style="width:2rem"></th>
    <th>序</th><th>类型</th><th>规则</th>
    <th>命中进件量</th><th>命中率</th><th>仅命中率</th>
    <th>瀑布本步进件量</th><th>瀑布本步命中率</th><th>累计命中进件量</th>
  </tr></thead><tbody id="preStrategyTableBody">`;

  if (!waterfall.steps.length) {
    html += `<tr><td colspan="10" class="config-muted">未配置规则，请在左侧配置规则后重新分析</td></tr>`;
  } else {
    waterfall.steps.forEach((s, i) => {
      const hit = hitMap[s.rule.id] || {};
      html += `<tr class="wf-row ${s.kind}" data-rule-id="${esc(s.rule.id)}">
        <td><span class="drag-handle" title="拖拽排序">☰</span></td>
        <td class="wf-idx num">${i + 1}</td>
        <td>${kindTag(s.kind)}</td>
        <td>${esc(s.name)}</td>
        <td class="num wf-hit-vol">${fmtNum(hit.hitVol)}</td>
        <td class="num wf-hit-rate">${pct(hit.hitRate)}</td>
        <td class="num wf-only-rate">${hit.onlyRate != null ? pct(hit.onlyRate) : "—"}</td>
        <td class="num wf-step-vol">${fmtNum(s.stepVol)}</td>
        <td class="num wf-step-rate">${pct(s.stepRate)}</td>
        <td class="num wf-cum-vol">${fmtNum(s.cumVol)}</td>
      </tr>`;
    });
  }

  html += `</tbody></table></div>`;
  html += `<div id="waterfallChart"></div>`;
  html += `<p id="waterfallFooter" style="font-size:.88rem;margin-top:.5rem">累计拒绝进件量：<b>${fmtNum(waterfall.totalReject)}</b>（${pct(safeRate(waterfall.totalReject, waterfall.totalApply))}）；
    剩余：<b>${fmtNum(waterfall.remainVol)}</b></p>`;
  return html;
}
function collectPreRowsDimValues(preRows, groupCols) {
  const map = {};
  for (const c of groupCols) map[c] = new Set();
  for (const r of preRows || []) {
    for (const c of groupCols) map[c].add(strVal(rowVal(r, c)));
  }
  const out = {};
  for (const c of groupCols) out[c] = [...map[c]].sort(compareDimValue);
  return out;
}
function getPreStrategyFilterMap(groupCols) {
  return CP().getDimFilterMap(groupCols, preStrategyPickerId);
}
function rowMatchesPreGroupFilter(row, groupCols, filterMap) {
  for (const col of groupCols) {
    const allowed = filterMap[col];
    if (!allowed) continue;
    if (!allowed.size) return false;
    if (!allowed.has(strVal(rowVal(row, col)))) return false;
  }
  return true;
}
function resolvePreGroupCols() {
  const domCols = RV.ui.sidebar.getSampleGroupCols("pre");
  const cols = domCols.length ? domCols : (S.lastAnalysis?.preGroupCols || []);
  if (S.lastAnalysis && domCols.length) S.lastAnalysis.preGroupCols = domCols;
  return cols;
}
function preGroupTableEl() {
  const tabPre = document.getElementById("tab-pre");
  if (tabPre) {
    const mount = tabPre.querySelector("#preGroupTableMount");
    if (mount) return mount;
  }
  return null;
}
function writePreGroupTableShell(preGroupCols, trend) {
  const groupMount = preGroupTableEl();
  if (!groupMount) return false;
  groupMount.innerHTML = renderPreGroupTable({
    groupCols: preGroupCols,
    trend: trend || [],
  });
  initResizableTables(groupMount);
  return true;
}
function getFilteredPreRows() {
  const la = S.lastAnalysis;
  if (!la?.preRows) return [];
  const groupCols = resolvePreGroupCols();
  if (!groupCols.length) return la.preRows;
  const filterMap = getPreStrategyFilterMap(groupCols);
  return la.preRows.filter((r) => rowMatchesPreGroupFilter(r, groupCols, filterMap));
}
function buildPreStrategyFiltersHtml(preRows, groupCols) {
  if (!groupCols?.length) return "";
  const dimValues = collectPreRowsDimValues(preRows, groupCols);
  let html = `<div id="preStrategyGroupFilters" class="summary-trend-filters">
    <h4 class="rv-heading-with-hint">分组样本筛选${hintBadgeHtml("勾选取值，联动概览/汇总/瀑布")}</h4>
    <div class="summary-trend-filter-bar">`;
  for (const col of groupCols) {
    const vals = dimValues[col] || [];
    const pickerId = preStrategyPickerId(col);
    html += `<div class="summary-trend-filter pre-strategy-filter" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "pre-strategy-filter-values",
    });
    html += `</div>`;
  }
  html += `<div class="summary-trend-filter-actions">
    <button type="button" class="btn btn-secondary btn-sm pre-strategy-select-all">全选</button>
    <button type="button" class="btn btn-secondary btn-sm pre-strategy-clear-all">清空</button>
  </div></div></div>`;
  return html;
}
function initPreStrategyFilters(savedFilter) {
  const container = $("preStrategyGroupFiltersMount");
  if (!container || !S.lastAnalysis) return;
  const domCols = RV.ui.sidebar.getSampleGroupCols("pre");
  const groupCols = domCols.length ? domCols : (S.lastAnalysis.preGroupCols || []);
  if (domCols.length) S.lastAnalysis.preGroupCols = domCols;
  if (!groupCols.length) {
    container.innerHTML = "";
    return;
  }
  const priorFilter = savedFilter !== undefined ? savedFilter : collectPreStrategyValueFilter();
  container.innerHTML = buildPreStrategyFiltersHtml(S.lastAnalysis.preRows, groupCols);
  const dimValues = collectPreRowsDimValues(S.lastAnalysis.preRows, groupCols);
  initPreStrategyDimPickers(groupCols, priorFilter, dimValues);
}
function updatePreWaterfallSection(waterfall, hitMetrics, { rebindDnD = false } = {}) {
  const mount = $("preWaterfallSectionMount");
  if (!mount) return;
  mount.innerHTML = renderWaterfallSectionHtml(waterfall, hitMetrics);
  initResizableTables(mount);
  renderWaterfallChart($("waterfallChart"), waterfall.steps);
  if (rebindDnD) {
    const tbody = $("preStrategyTableBody");
    if (tbody) tbody.dataset.sortBound = "";
    initWaterfallDnD(S.lastAnalysis?.preRows);
  }
}
function updatePreResults(data) {
  const { preCfg, hitMetrics, waterfall, preGroup, preCount, preRowsCount } = data;
  const sampleMount = $("preSampleInfoMount");
  if (sampleMount) {
    sampleMount.className = "rv-wb-meta";
    sampleMount.innerHTML = renderPreSampleInfoHtml(
      preCfg, preRowsCount ?? S.lastAnalysis?.preRows?.length ?? 0, preCount ?? 0
    );
  }
  refreshPreConfigAccordionSummary();
  refreshPreGroupAccordionSummary();
  const cardsMount = $("preMetricCardsMount");
  if (cardsMount) cardsMount.innerHTML = renderPreOverviewCardsHtml(hitMetrics);

  initPreStrategyFilters();

  const groupMount = preGroupTableEl();
  if (groupMount) {
    groupMount.innerHTML = renderPreGroupTable(preGroup);
    initResizableTables(groupMount);
  }

  updatePreWaterfallSection(waterfall, hitMetrics, { rebindDnD: true });
}
async function refreshPreStrategyView() {
  if (!S.lastAnalysis) return;
  if (S.preStrategyRefreshBusy) {
    S.preStrategyRefreshPending = true;
    return;
  }
  if (isExportMode()) {
    showExportStaticNotice();
    return;
  }
  S.preStrategyRefreshBusy = true;
  const strategyEpoch = S.preGroupDimEpoch || 0;
  try {
    const rows = getFilteredPreRows();
    const { hardRules, softRules, waterfallOrder } = S.lastAnalysis;
    const ordered = waterfallOrder || [...(hardRules || []), ...(softRules || [])];

    setAnalyzeStatus("筛选样本重算中…");
    const hitMetrics = await computeHitMetrics(rows, hardRules || [], softRules || []);
    const waterfall = await computeWaterfall(rows, ordered);
    updatePreStrategyTable(waterfall, hitMetrics);
    if (strategyEpoch === (S.preGroupDimEpoch || 0)) {
      await refreshPreGroupDimView();
    }
    setAnalyzeStatus("筛选已更新", "ok");
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("筛选重算失败：" + (err.message || err), "err");
  } finally {
    S.preStrategyRefreshBusy = false;
    if (S.preStrategyRefreshPending) {
      S.preStrategyRefreshPending = false;
      void refreshPreStrategyView();
    }
  }
}
function syncPreGroupDimUiFromDom() {
  if (!S.lastAnalysis) return;
  S.preGroupDimEpoch = (S.preGroupDimEpoch || 0) + 1;
  const preGroupCols = RV.ui.sidebar.getSampleGroupCols("pre");
  S.lastAnalysis.preGroupCols = preGroupCols;
  const savedFilter = collectPreStrategyValueFilter();
  if (S.lastAnalysis.preRows?.length) {
    initPreStrategyFilters(savedFilter);
  }
  writePreGroupTableShell(preGroupCols, []);
}
function schedulePreGroupDimRecompute() {
  const hasRows = !!S.lastAnalysis?.preRows?.length;
  syncPreGroupDimUiFromDom();
  if (!hasRows) {
    if (isExportMode()) showExportStaticNotice();
    return;
  }
  void refreshPreStrategyView();
}
async function refreshPreGroupDimView() {
  if (!S.lastAnalysis?.preRows?.length) return;
  if (S.preGroupDimRefreshBusy) {
    clearTimeout(preGroupDimRecomputeTimer);
    preGroupDimRecomputeTimer = setTimeout(() => {
      preGroupDimRecomputeTimer = null;
      void refreshPreGroupDimView();
    }, 280);
    return;
  }
  if (isExportMode()) return;

  S.preGroupDimRefreshBusy = true;
  const preGroupCols = resolvePreGroupCols();
  try {
    setAnalyzeStatus("刷新贷前分组…");
    const rows = getFilteredPreRows();
    const preGroup = await computePreGroupOverview(
      rows.length ? rows : S.lastAnalysis.preRows,
      preGroupCols
    );

    S.lastAnalysis.preGroup = preGroup;
    S.lastAnalysis.preGroupCols = preGroupCols;

    writePreGroupTableShell(
      preGroupCols,
      rows.length ? (preGroup.trend || []) : []
    );

    setAnalyzeStatus("分组已更新", "ok");
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("分组刷新失败：" + (err.message || err), "err");
  } finally {
    S.preGroupDimRefreshBusy = false;
  }
}
function bindPreGroupRecomputeEvents() {}
function readWaterfallOrderFromDom(container) {
  if (!container || !S.lastAnalysis) return [];
  const ruleMap = {};
  [...S.lastAnalysis.hardRules, ...S.lastAnalysis.softRules].forEach((r) => { ruleMap[r.id] = r; });
  const ordered = [];
  container.querySelectorAll("tr.wf-row[data-rule-id]").forEach((row) => {
    const id = row.getAttribute("data-rule-id");
    if (id && ruleMap[id]) ordered.push(ruleMap[id]);
  });
  return ordered;
}
function waterfallOrderKey(rules) {
  return rules.map((r) => r.id).join("\u0001");
}
function findWaterfallItemById(root, ruleId) {
  if (!root || !ruleId) return null;
  return [...root.querySelectorAll("tr.wf-row[data-rule-id]")].find(
    (el) => el.getAttribute("data-rule-id") === ruleId
  ) || null;
}
function updatePreStrategyTable(wf, hitMetrics) {
  const tbody = $("preStrategyTableBody");
  if (tbody) {
    const hitMap = buildHitMap(hitMetrics);
    wf.steps.forEach((s, i) => {
      const tr = findWaterfallItemById(tbody, s.rule.id);
      const hit = hitMap[s.rule.id] || {};
      if (!tr) return;
      tbody.appendChild(tr);
      tr.querySelector(".wf-idx").textContent = String(i + 1);
      tr.querySelector(".wf-hit-vol").textContent = fmtNum(hit.hitVol);
      tr.querySelector(".wf-hit-rate").textContent = pct(hit.hitRate);
      tr.querySelector(".wf-only-rate").textContent = hit.onlyRate != null ? pct(hit.onlyRate) : "—";
      tr.querySelector(".wf-step-vol").textContent = fmtNum(s.stepVol);
      tr.querySelector(".wf-step-rate").textContent = pct(s.stepRate);
      tr.querySelector(".wf-cum-vol").textContent = fmtNum(s.cumVol);
    });
  }

  const line = $("preHardUnionLine");
  if (line) {
    line.innerHTML = `筛选样本进件量：<b>${fmtNum(hitMetrics.totalApply)}</b>；
      硬规则并集命中：<b>${fmtNum(hitMetrics.hardUnionVol)}</b>（${pct(safeRate(hitMetrics.hardUnionVol, hitMetrics.totalApply))}）`;
  }
  const footer = $("waterfallFooter");
  if (footer) {
    footer.innerHTML = `累计拒绝进件量：<b>${fmtNum(wf.totalReject)}</b>（${pct(safeRate(wf.totalReject, wf.totalApply))}）；
      剩余：<b>${fmtNum(wf.remainVol)}</b>`;
  }
  renderWaterfallChart($("waterfallChart"), wf.steps);
  const cardsMount = $("preMetricCardsMount");
  if (cardsMount) cardsMount.innerHTML = renderPreOverviewCardsHtml(hitMetrics);
}
function moveWaterfallPlaceholder(container, placeholder, clientY, dragItem, dragKindClass) {
  const dragSoft = dragItem.classList.contains(dragKindClass || "soft");
  const siblings = [...container.querySelectorAll("tr.wf-row")].filter((el) => el !== dragItem);
  let insertBefore = null;

  for (const item of siblings) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBefore = item;
      break;
    }
  }

  if (dragSoft) {
    const hardItems = siblings.filter((el) => el.classList.contains("hard"));
    const firstSoft = siblings.find((el) => el.classList.contains("soft") && el !== dragItem);
    if (insertBefore && insertBefore.classList.contains("hard")) {
      insertBefore = firstSoft || null;
    }
    if (!insertBefore && hardItems.length) {
      const lastHard = hardItems[hardItems.length - 1];
      if (placeholder.previousElementSibling !== lastHard && placeholder !== lastHard.nextSibling) {
        container.insertBefore(placeholder, lastHard.nextSibling);
        return;
      }
      return;
    }
  }

  if (insertBefore) {
    if (placeholder.nextElementSibling !== insertBefore) container.insertBefore(placeholder, insertBefore);
  } else if (placeholder !== container.lastElementChild) {
    container.appendChild(placeholder);
  }
}
function initWaterfallDnD(preRows) {
  const tbody = $("preStrategyTableBody");
  if (!tbody) return;
  const WD = RV.ui.waterfallDnd;
  if (!WD?.bindWaterfallPointerDnD) {
    // fallback kept minimal — script order should include waterfall-dnd.js
    return;
  }
  WD.bindWaterfallPointerDnD(tbody, {
    boundFlag: "sortBound",
    colSpan: 10,
    canStart: () => (getFilteredPreRows()?.length || 0) > 0,
    orderKey: (tb) => waterfallOrderKey(readWaterfallOrderFromDom(tb)),
    movePlaceholder: moveWaterfallPlaceholder,
    onCommit: (tb) => {
      const rows = getFilteredPreRows();
      if (!rows) return;
      const ordered = readWaterfallOrderFromDom(tb);
      if (ordered.length) void reorderAndRecompute(ordered);
    },
  });
}
async function syncPreWaterfallOrder(ordered) {
  const la = S.lastAnalysis;
  if (!la?.preRows?.length || !ordered.length) return;
  const tbody = $("preStrategyTableBody");
  if (!tbody) return;
  const rows = getFilteredPreRows();
  const hitMetrics = await computeHitMetrics(rows, la.hardRules || [], la.softRules || []);
  const waterfall = await computeWaterfall(rows, ordered);
  updatePreStrategyTable(waterfall, hitMetrics);
}
async function reorderAndRecompute(orderedFromDom) {
  if (!S.lastAnalysis) return;

  const tbody = $("preStrategyTableBody");
  const ordered = orderedFromDom && orderedFromDom.length
    ? orderedFromDom
    : readWaterfallOrderFromDom(tbody);
  if (!ordered.length) return;

  setAnalyzeStatus("瀑布顺序已更新，重算中…");
  S.lastAnalysis.waterfallOrder = ordered;
  try {
    await syncPreWaterfallOrder(ordered);
    if (S.lastAnalysis.postRows?.length) {
      await RV.ui.report.postRuleReview.refreshPostRuleReviewAfterWaterfall();
    }
    setAnalyzeStatus("瀑布已更新", "ok");
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("瀑布更新失败：" + (err.message || err), "err");
  }
}
function collectPreStrategyValueFilter() {
  return CP().collectDimFilterState(resolvePreGroupCols(), preStrategyPickerId);
}
function applyPreStrategyValueFilter(savedFilter) {
  if (!savedFilter) return;
  for (const [col, vals] of Object.entries(savedFilter)) {
    CP().applySelection(preStrategyPickerId(col), vals);
  }
  syncPreStrategyDimPickers(Object.keys(savedFilter));
}
function snapshotPreUiState() {
  if (!$("tab-pre")) return null;
  return {
    groupDimensions: {
      columns: getChecked($("preGroupCols")),
      order: RV.ui.sidebar.getSampleGroupCols("pre"),
    },
    valueFilter: collectPreStrategyValueFilter(),
  };
}
function restorePreUiState(state) {
  if (!state?.groupDimensions) return;
  RV.ui.sidebar.applySampleGroupDimensions("pre", state.groupDimensions, []);
}
function setupPreStrategyTabShell(groupCols) {
  mountPreTabShell();
  initSampleGroupPanel("pre", groupCols);
  bindPreGroupRecomputeEvents();
  bindPreGroupConfigPin();
  syncPreGroupConfigPinCollapsed();
  RV.ui.report.post.bindMainReportStaleEvents?.();
}
function remountPreTabAfterReport(priorState, reportData) {
  setupPreStrategyTabShell(getAnalysisGroupDimensionCandidates());
  restorePreUiState(priorState);
  if (reportData) {
    updatePreResults(reportData);
    applyPreStrategyValueFilter(priorState?.valueFilter);
    if (priorState?.valueFilter) void refreshPreStrategyView();
  }
  syncPreGroupConfigPinCollapsed();
}
function initPreStrategyTabShell(groupCols) {
  setupPreStrategyTabShell(groupCols);
}

  Object.assign(target, {
    buildHitMap, renderPreGroupConfigHtml, renderPreTabShell, mountPreTabShell,
    renderPreSampleInfoHtml, renderPreOverviewCardsHtml, renderPreGroupTable,
    renderWaterfallSectionHtml, collectPreRowsDimValues, getPreStrategyFilterMap,
    rowMatchesPreGroupFilter, getFilteredPreRows, resolvePreGroupCols, buildPreStrategyFiltersHtml,
    initPreStrategyFilters, updatePreWaterfallSection, updatePreResults,
    refreshPreStrategyView, schedulePreGroupDimRecompute, syncPreGroupDimUiFromDom, bindPreGroupRecomputeEvents,
    refreshPreGroupDimView, readWaterfallOrderFromDom, waterfallOrderKey,
    findWaterfallItemById, updatePreStrategyTable, moveWaterfallPlaceholder,
    initWaterfallDnD, reorderAndRecompute, syncPreWaterfallOrder, collectPreStrategyValueFilter,
    applyPreStrategyValueFilter, snapshotPreUiState, restorePreUiState,
    setupPreStrategyTabShell, remountPreTabAfterReport, initPreStrategyTabShell,
    syncPreStrategyDimPickers,
    refreshPreConfigAccordionSummary, refreshPreGroupAccordionSummary,
    syncPreConfigAccordionCollapsed, bindPreConfigAccordion,
  });
})(window.RV);
