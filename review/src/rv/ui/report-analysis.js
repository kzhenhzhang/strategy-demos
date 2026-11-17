(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const applyFilters = RV.sample.applyFilters;
  const bindColResizer = RV.infra.bindColResizer;
  const buildYVector = RV.domain.eda.buildYVector;
  const buildDenWeightedBinRule = RV.infra.buildDenWeightedBinRule;
  const buildManualThresholdBinRule = RV.infra.buildManualThresholdBinRule;
  const buildManualThresholdPreviewData = RV.domain.binning.buildManualThresholdPreviewData;
  const collectDrillStratSlices = RV.domain.binning.collectDrillStratSlices;
  const collectRatioSpecs = RV.ui.sidebar.collectRatioSpecs;
  const compareGroupKeys = RV.infra.compareGroupKeys;
  const compareDimValue = RV.infra.compareDimValue;
  const computeBinDrilldownMulti = RV.domain.binning.computeBinDrilldownMulti;
  const buildBinRiskSummary = RV.domain.binning.buildBinRiskSummary;
  const corrHeatStyle = RV.infra.corrHeatStyle;
  const esc = RV.infra.esc;
  const fillSelect = RV.ui.sidebar.fillSelect;
  const formatGroupLabels = RV.infra.formatGroupLabels;
  const flattenDrillSliceRows = RV.domain.binning.flattenDrillSliceRows;
  const fmtMetric = RV.infra.fmtMetric;
  const fmtNum = RV.infra.fmtNum;
  const formatBinDrillPath = RV.domain.binning.formatBinDrillPath;
  const getChecked = RV.ui.sidebar.getChecked;
  const getSampleConfig = RV.sample.getSampleConfig;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const isDrillableBinLabel = RV.domain.binning.isDrillableBinLabel;
  const scanSingleFeatureThresholds = (...args) => RV.domain.ruleMining.scanSingleFeatureThresholds(...args);
  const getScanBlockReason = (...args) => RV.domain.ruleMining.getScanBlockReason(...args);
  const recommendMiningVars = (...args) => RV.domain.ruleMining.recommendMiningVars(...args);
  const findIntervalByLabel = (...args) => RV.domain.ruleMining.findIntervalByLabel(...args);
  const findIntervalIndexByLabel = (...args) => RV.domain.ruleMining.findIntervalIndexByLabel(...args);
  const stableRootKey = (...args) => RV.domain.ruleMining.stableRootKey(...args);
  const numericSpecToCandidatePreset = (...args) => RV.domain.ruleMining.numericSpecToCandidatePreset(...args);
  const binIntervalToCandidatePreset = (...args) => RV.domain.ruleMining.binIntervalToCandidatePreset(...args);
  const computeMineCandidateGroupTrend = (...args) => RV.domain.ruleMining.computeMineCandidateGroupTrend(...args);
  function isExportMode() { return !!(RV.export?.isExportMode && RV.export.isExportMode()); }
  const metricColumnScales = RV.infra.metricColumnScales;
  const metricHeatCell = RV.infra.metricHeatCell;
  const pct = RV.infra.pct;
  const rateHeatStyle = RV.infra.rateHeatStyle;
  const renderGroupDistChart = RV.ui.charts.renderGroupDistChart;
  const showTab = RV.ui.report.post.showTab;
  const sliceMatchesStratFilter = RV.domain.binning.sliceMatchesStratFilter;
  const sumRatio = RV.infra.sumRatio;
  const thWithResizer = RV.infra.thWithResizer;
  const thWithRowResizer = RV.infra.thWithRowResizer;
  const withHintHtml = RV.infra.withHintHtml;
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  var target = report.analysis = report.analysis || {};
  const CP = () => RV.ui.collapsedPicker;
  const DA_BIN_MODEL_PREFIXES = ["p3_", "reb_", "xgb_"];
  const BIN_SHARE_DEV_WARN_PCT = 8;
  const BIN_TRACK_UNI = "uni";
  const BIN_TRACK_CROSS = "cross";

function formatBinShareDeviationNote(shareDeviationByVar) {
  if (!shareDeviationByVar || !Object.keys(shareDeviationByVar).length) return "";
  const parts = [];
  for (const [v, s] of Object.entries(shareDeviationByVar)) {
    if ((s?.maxDevPct ?? 0) >= BIN_SHARE_DEV_WARN_PCT) {
      parts.push(`${v}（最大偏差 ${s.maxDevPct.toFixed(1)}%）`);
    }
  }
  if (!parts.length) return "";
  return `注意：${parts.join("；")}，常见于分母高度集中或离散取值，各箱实际占比与目标可能相差较大。`;
}
function formatBinShareDeviationStatus(shareDeviationByVar) {
  if (!shareDeviationByVar || !Object.keys(shareDeviationByVar).length) return "";
  let maxDev = 0;
  for (const s of Object.values(shareDeviationByVar)) {
    maxDev = Math.max(maxDev, s?.maxDevPct ?? 0);
  }
  if (maxDev < BIN_SHARE_DEV_WARN_PCT) return "";
  return `部分变量实际分母占比与目标偏差较大（最大 ${maxDev.toFixed(1)}%），详见表下脚注`;
}

function defaultModelBinCols(cols) {
  return (cols || []).filter((c) =>
    DA_BIN_MODEL_PREFIXES.some((p) => String(c).startsWith(p))
  );
}

function getBinTrackMode() {
  return $("daBinTrackMode")?.value || BIN_TRACK_UNI;
}

function isCrossBinEnabled() {
  // Cross track is always configurable; Tab already gates "advanced optional".
  return true;
}

function setBinRunModeHint() {
  const uniBtn = $("btnRunBinAnalysis");
  const crossBtn = $("btnRunCrossBinAnalysis");
  const uniTip = "仅跑单变量分箱";
  const crossTip = "仅跑二维交叉分箱";
  if (uniBtn) uniBtn.title = uniTip;
  if (crossBtn) crossBtn.title = crossTip;
  const uniHint = $("daBinRunModeHint");
  const crossHint = $("daCrossBinRunModeHint");
  if (uniHint) {
    uniHint.className = "rv-hint rv-tip-anchor";
    uniHint.setAttribute("data-rv-tip", uniTip);
    uniHint.setAttribute("tabindex", "0");
    uniHint.setAttribute("role", "img");
    uniHint.setAttribute("aria-label", `说明：${uniTip}`);
    uniHint.textContent = "ⓘ";
  }
  if (crossHint) {
    crossHint.className = "rv-hint rv-tip-anchor";
    crossHint.setAttribute("data-rv-tip", crossTip);
    crossHint.setAttribute("tabindex", "0");
    crossHint.setAttribute("role", "img");
    crossHint.setAttribute("aria-label", `说明：${crossTip}`);
    crossHint.textContent = "ⓘ";
  }
}

function syncCrossResultSectionVisibility() {
  const sec = $("daCrossBinSection");
  if (!sec) return;
  const hasCross = !!S.lastDataAnalysis?.bin?.cross2d?.tables?.length;
  sec.style.display = hasCross ? "" : "none";
}

function syncBinTrackPanels() {
  const mode = getBinTrackMode();
  const uni = $("daBinUniTrack");
  const cross = $("daBinCrossTrack");
  if (uni) uni.style.display = mode === BIN_TRACK_UNI ? "" : "none";
  if (cross) cross.style.display = mode === BIN_TRACK_CROSS ? "" : "none";
  document.querySelectorAll(".da-track-tab").forEach((btn) => {
    const active = (btn.dataset.track || BIN_TRACK_UNI) === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  setBinRunModeHint();
  syncCrossResultSectionVisibility();
}

function getEdaVarSelection() {
  return CP().getPickerSpec("daEdaVar")
    ? CP().getPickerSelection("daEdaVar")
    : getChecked($("daEdaVarChecks"));
}
function getEdaGroupColSelection() {
  return CP().getPickerSpec("daEdaGroup")
    ? CP().getPickerSelection("daEdaGroup")
    : getChecked($("daGroupColChecks"));
}
function clampIvBins(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 5;
  return Math.max(3, Math.min(20, n));
}
function stepIvBins(delta) {
  const inp = $("daIvBins");
  if (!inp) return;
  inp.value = String(clampIvBins((parseInt(inp.value, 10) || 5) + delta));
  refreshDaConfigPanelSummaries();
  if (S.lastDataAnalysis?.eda) markDaResultsStale();
}
function edaGroupValuePickerId(col) {
  return `edaGroupVal:${col}`;
}
function registerEdaGroupValuePicker(col) {
  CP().registerDimPicker(edaGroupValuePickerId(col), {
    onChange: () => {
      refreshGroupMetricsTable();
      renderEdaDistCharts();
    },
  });
}
function registerEdaDisplayVarPicker() {
  CP().registerDimPicker("edaDisplayVar", {
    emptyLabel: "未选变量（将隐藏分组行与分布）",
    metaUnit: "个变量",
    onChange: () => syncEdaDisplayVarFilters(),
  });
}
function registerDaVariablePickers() {
  CP().registerPicker("daEdaVar", {
    selectedId: "daEdaVarSelected",
    checksId: "daEdaVarChecks",
    metaId: "daEdaVarMeta",
    searchId: "daEdaVarSearch",
    pickerId: "daEdaVarPicker",
    toggleId: "daEdaVarPickerToggle",
    selectedOnlyId: "daEdaVarSelectedOnly",
    showAllColumnsId: "daEdaVarShowAll",
    emptyLabel: "未选择分析变量",
    metaUnit: "个变量",
    toggleAdd: "添加变量 ▾",
    toggleCollapse: "收起 ▴",
    defaultColumnPrefixes: ["p3_", "reb_"],
    showAllColumns: false,
    maxVisibleTags: 4,
    popover: true,
    listLayout: true,
    onChange: () => {
      refreshDaConfigPanelSummaries();
      const vars = CP().getPickerSelection("daEdaVar");
      if (!vars.length) {
        if (S.lastDataAnalysis) delete S.lastDataAnalysis.eda;
        const results = $("daEdaResults");
        if (results) {
          results.innerHTML = `<p class="da-results-placeholder">配置变量后点击「运行 EDA 分析」</p>`;
        }
        setDaEdaStatus("");
        return;
      }
      if (S.lastDataAnalysis?.eda) markDaResultsStale();
    },
  });
  CP().registerPicker("daEdaGroup", {
    selectedId: "daEdaGroupSelected",
    checksId: "daGroupColChecks",
    metaId: "daGroupColMeta",
    searchId: "daGroupColSearch",
    pickerId: "daEdaGroupPicker",
    toggleId: "daEdaGroupPickerToggle",
    selectedOnlyId: "daEdaGroupSelectedOnly",
    emptyLabel: "未选择分组标签",
    metaUnit: "个标签",
    toggleAdd: "添加标签 ▾",
    toggleCollapse: "收起 ▴",
    maxVisibleTags: 3,
    popover: true,
    listLayout: true,
    onChange: () => {
      let cols = CP().getPickerSelection("daEdaGroup");
      const max = C.MAX_DA_GROUP_COLS || 3;
      if (cols.length > max) {
        cols = cols.slice(0, max);
        CP().applySelection("daEdaGroup", cols, { notify: false });
        setDaEdaStatus(`分组标签最多 ${max} 个，已保留前 ${max} 个`, "warn");
      }
      refreshDaConfigPanelSummaries();
      if (S.lastDataAnalysis?.eda) markDaResultsStale();
    },
  });
  CP().registerPicker("daBinVar", {
    selectedId: "daBinVarSelected",
    checksId: "daBinVarChecks",
    metaId: "daBinVarMeta",
    searchId: "daBinVarSearch",
    pickerId: "daBinVarPicker",
    toggleId: "daBinVarPickerToggle",
    selectedOnlyId: "daBinVarSelectedOnly",
    showAllColumnsId: "daBinVarShowAll",
    emptyLabel: "未选择分箱变量",
    metaUnit: "个变量",
    toggleAdd: "添加变量 ▾",
    toggleCollapse: "收起 ▴",
    defaultColumnPrefixes: DA_BIN_MODEL_PREFIXES,
    showAllColumns: false,
    maxVisibleTags: 4,
    popover: true,
    listLayout: true,
    onChange: () => {
      refreshDaConfigPanelSummaries();
      refreshBinRunButtonState();
      invalidateDataAnalysisCache({ track: "binUni" });
    },
  });
  CP().registerPicker("daBinStrat", {
    selectedId: "daBinStratSelected",
    checksId: "daBinStratColChecks",
    metaId: "daBinStratColMeta",
    searchId: "daBinStratColSearch",
    pickerId: "daBinStratPicker",
    toggleId: "daBinStratPickerToggle",
    selectedOnlyId: "daBinStratSelectedOnly",
    emptyLabel: "未选择分层变量",
    metaUnit: "个分层",
    toggleAdd: "添加分层 ▾",
    toggleCollapse: "收起 ▴",
    maxVisibleTags: 3,
    popover: true,
    listLayout: true,
    onChange: () => {
      let cols = CP().getPickerSelection("daBinStrat");
      const max = C.MAX_DA_GROUP_COLS || 3;
      if (cols.length > max) {
        cols = cols.slice(0, max);
        CP().applySelection("daBinStrat", cols, { notify: false });
        setDaBinStatus(`分层变量最多 ${max} 个，已保留前 ${max} 个`, "warn");
      }
      refreshDaConfigPanelSummaries();
      invalidateDataAnalysisCache({ track: "binUni" });
    },
  });
  CP().registerPicker("daMineVar", {
    selectedId: "daMineVarSelected",
    checksId: "daMineVarChecks",
    metaId: "daMineVarMeta",
    searchId: "daMineVarSearch",
    pickerId: "daMineVarPicker",
    toggleId: "daMineVarPickerToggle",
    selectedOnlyId: "daMineVarSelectedOnly",
    showAllColumnsId: "daMineVarShowAll",
    emptyLabel: "未选择扫描变量",
    metaUnit: "个变量",
    toggleAdd: "添加变量 ▾",
    toggleCollapse: "收起 ▴",
    defaultColumnPrefixes: ["p3_", "reb_"],
    showAllColumns: false,
    maxVisibleTags: 4,
    popover: true,
    listLayout: true,
    onChange: () => {
      refreshDaConfigPanelSummaries();
      invalidateDataAnalysisCache({ track: "mine" });
    },
  });
  CP().registerPicker("daMineGroup", {
    selectedId: "daMineGroupSelected",
    checksId: "daMineGroupColChecks",
    metaId: "daMineGroupColMeta",
    searchId: "daMineGroupColSearch",
    pickerId: "daMineGroupPicker",
    toggleId: "daMineGroupPickerToggle",
    selectedOnlyId: "daMineGroupSelectedOnly",
    emptyLabel: "未选择分组变量",
    metaUnit: "个分组",
    toggleAdd: "添加分组 ▾",
    toggleCollapse: "收起 ▴",
    maxVisibleTags: 3,
    popover: true,
    listLayout: true,
    onChange: () => {
      let cols = CP().getPickerSelection("daMineGroup");
      const max = C.MAX_DA_GROUP_COLS || 3;
      if (cols.length > max) {
        cols = cols.slice(0, max);
        CP().applySelection("daMineGroup", cols, { notify: false });
        setDaMineStatus(`挖规分组变量最多 ${max} 个，已保留前 ${max} 个`, "warn");
      }
      refreshDaConfigPanelSummaries();
      refreshMineGroupTrend();
    },
  });
  CP().registerPicker("daCrossGroup", {
    selectedId: "daCrossGroupSelected",
    checksId: "daCrossGroupColChecks",
    metaId: "daCrossGroupColMeta",
    searchId: "daCrossGroupColSearch",
    pickerId: "daCrossGroupPicker",
    toggleId: "daCrossGroupPickerToggle",
    selectedOnlyId: "daCrossGroupSelectedOnly",
    emptyLabel: "未选择分组变量",
    metaUnit: "个分组",
    toggleAdd: "添加分组 ▾",
    toggleCollapse: "收起 ▴",
    maxVisibleTags: 3,
    popover: true,
    listLayout: true,
    onChange: () => {
      let cols = CP().getPickerSelection("daCrossGroup");
      const max = C.MAX_DA_GROUP_COLS || 3;
      if (cols.length > max) {
        cols = cols.slice(0, max);
        CP().applySelection("daCrossGroup", cols, { notify: false });
        setDaBinStatus(`交叉分组变量最多 ${max} 个，已保留前 ${max} 个`, "warn");
      }
      refreshDaConfigPanelSummaries();
      refreshBinRunButtonState();
      invalidateDataAnalysisCache({ track: "binCross" });
    },
  });
}
function getBinVarSelection() {
  return CP().getPickerSpec("daBinVar")
    ? CP().getPickerSelection("daBinVar")
    : getChecked($("daBinVarChecks"));
}
function getBinStratColSelection() {
  return CP().getPickerSpec("daBinStrat")
    ? CP().getPickerSelection("daBinStrat")
    : getChecked($("daBinStratColChecks"));
}
function getCrossGroupColSelection() {
  return CP().getPickerSpec("daCrossGroup")
    ? CP().getPickerSelection("daCrossGroup")
    : getChecked($("daCrossGroupColChecks"));
}
function getMineVarSelection() {
  return CP().getPickerSpec("daMineVar")
    ? CP().getPickerSelection("daMineVar")
    : getChecked($("daMineVarChecks"));
}
function getMineGroupColSelection() {
  return CP().getPickerSpec("daMineGroup")
    ? CP().getPickerSelection("daMineGroup")
    : getChecked($("daMineGroupColChecks"));
}
function stepBinCount(delta) {
  const inp = $("daBinCount");
  if (!inp) return;
  inp.value = String(clampBinCount((parseInt(inp.value, 10) || 5) + delta));
  if (($("daBinMode")?.value || "equal_freq") === "custom_share") {
    renderBinShareInputs(clampBinCount(inp.value));
  }
  refreshBinRunButtonState();
  invalidateDataAnalysisCache({ track: "binUni" });
}
function stepCrossXBins(delta) {
  const inp = $("daCrossXBinCount");
  if (!inp) return;
  inp.value = String(clampBinCount((parseInt(inp.value, 10) || 5) + delta));
  refreshBinRunButtonState();
  invalidateDataAnalysisCache({ track: "binCross" });
}
function stepCrossYBins(delta) {
  const inp = $("daCrossYBinCount");
  if (!inp) return;
  inp.value = String(clampBinCount((parseInt(inp.value, 10) || 5) + delta));
  refreshBinRunButtonState();
  invalidateDataAnalysisCache({ track: "binCross" });
}
function clampMineLift(raw) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = 1.1;
  return Math.max(0, Math.round(n * 100) / 100);
}
function stepMineLift(delta) {
  const inp = $("daMineLiftThreshold");
  if (!inp) return;
  const cur = Number(inp.value);
  const base = Number.isFinite(cur) ? cur : (getMineTarget() === "quality" ? 0.9 : 1.1);
  inp.value = String(clampMineLift(base + delta));
  invalidateDataAnalysisCache({ track: "mine" });
}
function clampMineTopK(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 3;
  return Math.max(1, Math.min(20, n));
}
function stepMineTopK(delta) {
  const inp = $("daMineTopK");
  if (!inp) return;
  inp.value = String(clampMineTopK((parseInt(inp.value, 10) || 3) + delta));
  invalidateDataAnalysisCache({ track: "mine" });
}
function clampMineMinSamples(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 30;
  return Math.max(5, n);
}
function stepMineMinSamples(delta) {
  const inp = $("daMineMinSamples");
  if (!inp) return;
  inp.value = String(clampMineMinSamples((parseInt(inp.value, 10) || 30) + delta));
  invalidateDataAnalysisCache({ track: "mine" });
}
function clampMineMaxCuts(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 20;
  return Math.max(4, Math.min(50, n));
}
function stepMineMaxCuts(delta) {
  const inp = $("daMineMaxCuts");
  if (!inp) return;
  inp.value = String(clampMineMaxCuts((parseInt(inp.value, 10) || 20) + delta));
  invalidateDataAnalysisCache({ track: "mine" });
}
function binStratValuePickerId(col) {
  return `binStratVal:${col}`;
}
function registerBinStratValuePicker(col) {
  CP().registerDimPicker(binStratValuePickerId(col), {
    onChange: () => scheduleRefreshBinTables(),
  });
}
function registerBinDisplayVarPicker() {
  CP().registerDimPicker("binDisplayVar", {
    emptyLabel: "未选变量（将隐藏明细）",
    metaUnit: "个变量",
    onChange: () => refreshBinTables({ recomputeDrills: false }),
  });
}
  var _edaOverviewSort = { key: null, dir: "asc", type: null };
  var _edaGroupSort = { key: null, dir: "asc", type: null };

function compareSortValues(a, b, type) {
  if (type === "number") {
    const an = a == null || a === "" ? null : Number(a);
    const bn = b == null || b === "" ? null : Number(b);
    if (an == null && bn == null) return 0;
    if (an == null || !Number.isFinite(an)) return 1;
    if (bn == null || !Number.isFinite(bn)) return -1;
    return an - bn;
  }
  return compareDimValue(String(a ?? ""), String(b ?? ""));
}
function sortEdaRows(rows, sortState, getVal) {
  if (!sortState?.key || !sortState.dir) return rows;
  const mul = sortState.dir === "desc" ? -1 : 1;
  const type = sortState.type || "string";
  return rows.slice().sort((a, b) => compareSortValues(getVal(a), getVal(b), type) * mul);
}
function cycleEdaSortState(state, key, type) {
  if (state.key !== key) {
    state.key = key;
    state.dir = "asc";
    state.type = type;
  } else if (state.dir === "asc") {
    state.dir = "desc";
  } else {
    state.key = null;
    state.dir = "asc";
    state.type = null;
  }
}
function thSortable(label, key, sortState, type) {
  const active = sortState.key === key;
  const arrow = active ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="th-sortable" data-sort-key="${esc(key)}" data-sort-type="${type}"><div class="th-cell th-sort-cell"><button type="button" class="th-sort-btn">${esc(label)}${arrow}</button><span class="col-resizer" title="拖动调整列宽"></span></div></th>`;
}
function overviewRowSortValue(row, key) {
  if (key === "direction") return row.scoreNegated ? "−原始分" : "原始分";
  return row[key];
}
function groupRowSortValue(row, key) {
  if (key.startsWith("group:")) {
    const i = parseInt(key.slice(6), 10);
    return row.groupParts?.[i] ?? "";
  }
  return row[key];
}
function collectEdaGroupValues(metricsByVar, groupCols) {
  const map = {};
  for (const c of groupCols) map[c] = new Set();
  for (const m of metricsByVar || []) {
    for (const g of m.groups || []) {
      const parts = g.groupParts || [g.group];
      groupCols.forEach((c, i) => {
        if (parts[i] != null) map[c].add(String(parts[i]));
      });
    }
  }
  return map;
}
function edaGroupRowMatches(groupParts, groupCols, filterMap) {
  if (!filterMap) return true;
  for (let i = 0; i < groupCols.length; i++) {
    const col = groupCols[i];
    const sel = filterMap[col];
    if (sel == null) continue;
    const val = String(groupParts[i] ?? "");
    if (sel instanceof Set) {
      if (!sel.size || !sel.has(val)) return false;
    } else if (Array.isArray(sel)) {
      if (!sel.length || !sel.includes(val)) return false;
    }
  }
  return true;
}
function flattenEdaGroupMetrics(metricsByVar, groupCols, groupValueFilter) {
  const flatRows = [];
  for (const m of metricsByVar || []) {
    for (const g of m.groups || []) {
      const groupParts = g.groupParts || [g.group];
      if (!edaGroupRowMatches(groupParts, groupCols, groupValueFilter)) continue;
      flatRows.push({
        groupParts,
        col: m.col,
        auc: g.auc,
        ks: g.ks,
        iv: g.iv,
        psi: g.psi,
      });
    }
  }
  return flatRows;
}
function collectEdaGroupValueFilter() {
  const eda = S.lastDataAnalysis?.eda;
  const groupCols = resolveEdaGroupCols(eda);
  if (!groupCols.length || !$("daEdaResultFilterBar")) return null;
  return CP().collectDimFilterState(groupCols, edaGroupValuePickerId);
}
function buildEdaResultFilterBar(metricsByVar, groupCols, selectedMap, selectedVars) {
  const bar = $("daEdaResultFilterBar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!groupCols?.length) return;

  const valueMap = collectEdaGroupValues(metricsByVar, groupCols);
  let html = "";
  for (const col of groupCols) {
    const vals = [...(valueMap[col] || [])].sort(compareDimValue);
    if (!vals.length) continue;
    const pickerId = edaGroupValuePickerId(col);
    html += `<div class="summary-trend-filter" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "eda-group-value-filter-values",
    });
    html += `</div>`;
  }

  const vars = (metricsByVar || []).map((m) => m.col);
  if (vars.length) {
    html += `<div class="summary-trend-filter" data-dim="__vars__">`;
    html += CP().renderDimBlockHtml("edaDisplayVar", {
      dimLabel: "分析变量",
      valuesContainerClass: "eda-display-var-filter-values",
    });
    html += `</div>`;
  }

  html += `<div class="summary-trend-filter-actions">
    <button type="button" class="btn btn-secondary btn-sm eda-result-select-all">全选</button>
    <button type="button" class="btn btn-secondary btn-sm eda-result-clear-all">清空</button>
  </div>`;
  bar.innerHTML = html;

  for (const col of groupCols) {
    const vals = [...(valueMap[col] || [])].sort(compareDimValue);
    if (!vals.length) continue;
    registerEdaGroupValuePicker(col);
    const saved = selectedMap?.[col];
    CP().initDimPicker(edaGroupValuePickerId(col), {
      values: vals,
      selected: saved !== undefined ? saved : vals,
    });
  }

  if (vars.length) {
    registerEdaDisplayVarPicker();
    const selected = selectedVars?.length ? selectedVars : vars;
    CP().initDimPicker("edaDisplayVar", {
      values: vars,
      selected,
    });
  }
}
function bindEdaTableSortHandlers(root) {
  if (!root || root.dataset.edaSortBound === "1" || isExportMode()) return;
  root.dataset.edaSortBound = "1";
  root.addEventListener("click", (e) => {
    if (e.target.closest(".col-resizer")) return;
    const th = e.target.closest(".th-sortable");
    if (!th) return;
    e.preventDefault();
    const table = th.closest("table");
    const key = th.dataset.sortKey;
    const type = th.dataset.sortType || "string";
    if (table?.id === "daOverviewTable") {
      cycleEdaSortState(_edaOverviewSort, key, type);
      refreshEdaOverviewTable();
      initResizableTables($("daOverviewMount"));
    } else if (table?.id === "daGroupMetricsTable") {
      cycleEdaSortState(_edaGroupSort, key, type);
      refreshGroupMetricsTable();
      initResizableTables($("daGroupMetricsMount"));
    }
  });
}

function setDaEdaStatus(msg, kind) {
  const el = $("daEdaStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
function setDaBinStatus(msg, kind) {
  const el = $("daBinStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
function updateDaSharedSummary(base) {
  const el = $("daSharedSummary");
  if (!el) return;
  if (!base) {
    el.hidden = true;
    el.textContent = "";
    refreshDaConfigPanelSummaries();
    return;
  }
  el.hidden = false;
  const scopeLabel = base.sampleScope === "residual_new_pass"
    ? "残差（未命中硬规则∪有效性候选）"
    : "全量贷后样本";
  let scopeExtra = "";
  if (base.sampleScope === "residual_new_pass") {
    const fullPost = base.fullPostCount ?? base.postCount;
    const excl = Math.max(0, fullPost - base.postCount);
    const hint = base.residualHint ? ` · ${esc(base.residualHint)}` : "";
    scopeExtra = ` · 筛选后全量 ${fullPost.toLocaleString()} → 残差 <b>${base.postCount.toLocaleString()}</b>（排除 ${excl.toLocaleString()}）${hint}`;
  }
  el.innerHTML = `样本范围：<b>${esc(scopeLabel)}</b>${scopeExtra}<br>贷后样本：<b>${base.postCount.toLocaleString()}</b> 行 · 贷前样本：<b>${(base.preCount ?? 0).toLocaleString()}</b> 行 · 坏样本：<b>${esc(base.badSpec.desc)}</b> · 风险指标：<b>${esc(base.ratioSpec.name)}</b>（整体比率 ${pct(base.overallRisk.rate)}）`;
  refreshDaConfigPanelSummaries();
}
function fmtBinPostNum(v, hasPostStrat) {
  if (hasPostStrat === false) return "—";
  return v != null ? fmtNum(v) : "N/A";
}
function fmtBinPostRate(v, hasPostStrat) {
  if (hasPostStrat === false) return "—";
  return v != null ? pct(v) : "N/A";
}
function fmtBinPreApply(v) {
  return v != null ? fmtNum(v) : "—";
}
function fmtBinSharePct(v) {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return `${Number(v).toFixed(2)}%`;
}
function renderDashWithReason(text, reason) {
  if (text !== "—" || !reason) return text;
  const tip = esc(reason);
  return `<span class="rv-tip-anchor" data-rv-tip="${tip}" tabindex="0" aria-label="${tip}">—</span>`;
}
function preApplyShareReason(row) {
  if (row?.preApplyVol == null) return "无贷前数据";
  if (row.preApplyVol <= 0) return "本箱贷前进件Σ为 0";
  return "当前口径下进件占比分母为 0";
}
function preHitShareReason(row) {
  if (row?.preApplyVol == null) return "无贷前数据";
  if (row?.preRuleHitApplyVol == null && row?.preRuleMissApplyVol == null) return "无可用规则，无法拆分命中/未命中";
  if ((row?.preRuleHitApplyVol ?? 0) <= 0) return "本箱命中进件Σ为 0";
  return "当前口径下命中进件占比分母为 0";
}
function preMissShareReason(row) {
  if (row?.preApplyVol == null) return "无贷前数据";
  if (row?.preRuleHitApplyVol == null && row?.preRuleMissApplyVol == null) return "无可用规则，无法拆分命中/未命中";
  if ((row?.preRuleMissApplyVol ?? 0) <= 0) return "本箱未命中进件Σ为 0";
  return "当前口径下未命中进件占比分母为 0";
}
function denShareReason(row, hasPost) {
  if (!hasPost) return "该分层无贷后样本";
  if (row?.den == null || row.den <= 0) return "本箱分母Σ为 0";
  return "当前口径下分母占比分母为 0";
}
function clearMineResultsUi() {
  if (S.lastDataAnalysis) delete S.lastDataAnalysis.mine;
  S._daMineCandidates = null;
  const mineResults = $("daMineResults");
  if (mineResults) {
    mineResults.innerHTML = `<p class="da-results-placeholder">选择变量后点击「扫描切点」</p>`;
  }
  const trendMount = $("daMineTrendMount");
  if (trendMount) trendMount.innerHTML = "";
  setDaMineStatus("");
}

function clearUniBinResultFields() {
  const bin = S.lastDataAnalysis?.bin;
  if (!bin) return;
  delete bin.binTables;
  delete bin.excludedByVar;
  delete bin.shareDeviationByVar;
  bin.vars = [];
  bin.drilldowns = {};
  bin.drilldownLastVar = null;
  bin.drilldown = null;
  const uniMount = $("daBinTablesMount");
  if (uniMount) uniMount.innerHTML = `<p class="config-muted">配置已变，请重新运行单变量分箱</p>`;
  const summaryMount = $("daBinSummaryMount");
  if (summaryMount) summaryMount.innerHTML = "";
}

function clearCrossBinResultFields() {
  const bin = S.lastDataAnalysis?.bin;
  if (!bin) return;
  delete bin.cross2d;
  const crossMount = $("daCrossBinTablesMount");
  if (crossMount) crossMount.innerHTML = `<p class="config-muted">配置已变，请重新运行二维交叉分箱</p>`;
  const crossSummary = $("daCrossBinSummary");
  if (crossSummary) crossSummary.innerHTML = "";
}

/**
 * @param {{ clearResults?: boolean, track?: "all"|"eda"|"bin"|"binUni"|"binCross"|"mine" }} [opts]
 * track 分轨清除：改交叉配置不清 uni；改 uni 配置不清 cross。样本/规则/比率变更用默认 all。
 */
function invalidateDataAnalysisCache({ clearResults = true, track = "all" } = {}) {
  if (!S.lastDataAnalysis) return;
  const hadResults = !!(S.lastDataAnalysis.eda || S.lastDataAnalysis.bin || S.lastDataAnalysis.mine);
  const clearAll = track === "all";
  const clearEda = clearAll || track === "eda";
  const clearMine = clearAll || track === "mine";
  const clearUni = clearAll || track === "bin" || track === "binUni";
  const clearCross = clearAll || track === "bin" || track === "binCross";

  if (clearAll) delete S.lastDataAnalysis.base;

  if (clearResults) {
    if (clearEda) {
      delete S.lastDataAnalysis.eda;
      const edaResults = $("daEdaResults");
      if (edaResults) {
        edaResults.innerHTML = `<p class="da-results-placeholder">配置变量后点击「运行 EDA 分析」</p>`;
      }
      setDaEdaStatus("");
      expandDaConfigPanels("eda");
    }
    if (clearMine) {
      clearMineResultsUi();
      expandDaConfigPanels("mine");
    }
    if (clearAll && (clearUni || clearCross)) {
      delete S.lastDataAnalysis.bin;
      const binResults = $("daBinResults");
      if (binResults) {
        binResults.innerHTML = `<p class="da-results-placeholder">配置后分别运行「单变量分箱」或「二维交叉分箱」</p>`;
      }
      setDaBinStatus("");
      expandDaConfigPanels("bin");
    } else {
      if (clearUni) clearUniBinResultFields();
      if (clearCross) clearCrossBinResultFields();
      const bin = S.lastDataAnalysis.bin;
      if (bin && !bin.binTables && !bin.cross2d) {
        delete S.lastDataAnalysis.bin;
        const binResults = $("daBinResults");
        if (binResults) {
          binResults.innerHTML = `<p class="da-results-placeholder">配置后分别运行「单变量分箱」或「二维交叉分箱」</p>`;
        }
      }
      if (clearUni || clearCross) {
        setDaBinStatus("");
        expandDaConfigPanels("bin");
      }
    }
  }
  if (clearAll) {
    updateDaSharedSummary(null);
    expandDaConfigPanels();
  }
  if (hadResults || clearResults) markDaResultsStale();
  refreshDaConfigPanelSummaries();
  // Lightweight: DA-internal track clears still refresh provenance (no attribution broadcast).
  RV.events?.refreshProvenanceBar?.();
}
function markDaResultsStale() {
  S.daResultsStale = true;
  const banner = $("daStaleBanner");
  if (banner) banner.classList.add("is-visible");
}
function clearDaResultsStale() {
  S.daResultsStale = false;
  const banner = $("daStaleBanner");
  if (banner) banner.classList.remove("is-visible");
  RV.events?.refreshProvenanceBar?.();
}

const DA_COLLAPSE = {
  shared: ["daSharedPanel"],
  eda: ["daSharedPanel", "daEdaPanel"],
  bin: ["daSharedPanel", "daBinPanel"],
  mine: ["daMinePanel"],
  allConfig: ["daSharedPanel", "daEdaPanel", "daBinPanel", "daMinePanel"],
};
const ConfigPanel = () => RV.ui.configPanel;

function refreshDaConfigPanelSummaries() {
  const CPAPI = ConfigPanel();
  if (!CPAPI) return;
  const scope = $("daSampleScope")?.value === "residual_new_pass" ? "残差" : "全量贷后";
  const badMode = $("daBadMode")?.value || "numerator";
  const badLabel = badMode === "numerator"
    ? "Y=分子>0"
    : `Y=${$("daBadCol")?.value || "?"}＞${$("daBadThreshold")?.value ?? 0}`;
  let sharedSum = `${scope} · ${badLabel}`;
  const baseN = S.lastDataAnalysis?.base?.postCount;
  if (baseN != null) sharedSum += ` · ${Number(baseN).toLocaleString()}行`;
  CPAPI.setSummaryText("daSharedPanelSummary", sharedSum);

  const edaVars = getEdaVarSelection();
  const edaGroups = getEdaGroupColSelection();
  CPAPI.setSummaryText(
    "daEdaPanelSummary",
    edaVars.length
      ? `变量 ${edaVars.length}${edaGroups.length ? ` · 分组 ${edaGroups.length}` : ""}`
      : "未选变量"
  );

  const binVars = getBinVarSelection();
  const binStrat = getBinStratColSelection();
  const binMode = $("daBinMode")?.value || "equal_freq";
  const modeLabel = ({ equal_freq: "等频", custom_share: "自定义占比", manual_thresholds: "手动阈值" })[binMode] || binMode;
  const crossX = $("daCrossXVar")?.value || "";
  const crossY = $("daCrossYVar")?.value || "";
  const crossConfigured = !!(crossX && crossY);
  const hasUni = !!S.lastDataAnalysis?.bin?.binTables?.length;
  const hasCross = !!S.lastDataAnalysis?.bin?.cross2d?.tables?.length;
  let binSum = binVars.length ? `${binVars.length} 变量 · ${modeLabel}` : "未选变量";
  if (binStrat.length) binSum += ` · 分层 ${binStrat.length}`;
  if (hasCross) binSum += " · 交叉已跑";
  else if (crossConfigured) binSum += " · 交叉已配";
  if (hasUni && !binVars.length) binSum = `已跑单变量 · ${modeLabel}`;
  CPAPI.setSummaryText("daBinPanelSummary", binSum);

  const mineVars = getMineVarSelection();
  const mineCand = (S._daMineCandidates || S.lastDataAnalysis?.mine?.candidates || []).length;
  CPAPI.setSummaryText(
    "daMinePanelSummary",
    mineCand
      ? `候选 ${mineCand} · 扫描变量 ${mineVars.length || "—"}`
      : (mineVars.length ? `扫描变量 ${mineVars.length}` : "未扫描")
  );
}

function collapseDaConfigAfterRun(track) {
  const ids = DA_COLLAPSE[track] || DA_COLLAPSE.allConfig;
  refreshDaConfigPanelSummaries();
  ConfigPanel()?.collapsePanels(ids);
  const resultId = track === "eda" ? "daEdaResults"
    : track === "bin" ? "daBinResults"
    : track === "mine" ? "daMineResults"
    : null;
  if (resultId) {
    requestAnimationFrame(() => $(resultId)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
  }
}

function expandDaConfigPanels(track) {
  const ids = track && DA_COLLAPSE[track] ? DA_COLLAPSE[track] : DA_COLLAPSE.allConfig;
  ConfigPanel()?.expandPanels(ids);
}

function bindDaConfigPanelToggle() {
  const tab = $("tab-analysis");
  if (!tab || !ConfigPanel()) return;
  // Remount resets DOM; allow re-bind
  delete tab.dataset.configPanelToggleBound;
  ConfigPanel().bindPanelToggle(tab, {
    onToggle: (_id, collapsed) => {
      if (collapsed) refreshDaConfigPanelSummaries();
    },
  });
}

/** 公共配置：默认收起；头行摘要始终反映当前口径 */
function syncDaSharedPanelCollapsed() {
  refreshDaConfigPanelSummaries();
  ConfigPanel()?.collapsePanels(["daSharedPanel"]);
}
function bindDaStaleBannerEvents() {
  const banner = $("daStaleBanner");
  if (!banner || banner.dataset.rvBound === "1") return;
  banner.dataset.rvBound = "1";
  banner.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-da-rerun]");
    if (!btn) return;
    const kind = btn.getAttribute("data-da-rerun");
    if (kind === "eda") void RV.app.orchestrator.runEdaAnalysis();
    else if (kind === "bin") void RV.app.orchestrator.runBinAnalysis();
    else if (kind === "mine") void runRuleMineScan();
  });
}
function filterCheckboxGrid(container, metaEl, query, selectedOnly) {
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  let visible = 0;
  let totalChecked = 0;
  container.querySelectorAll("label").forEach((lab) => {
    const cb = lab.querySelector("input[type=checkbox]");
    if (cb?.checked) totalChecked++;
    const text = lab.textContent.toLowerCase();
    const matchQuery = !q || text.includes(q);
    const matchSelected = !selectedOnly || !!cb?.checked;
    const show = matchQuery && matchSelected;
    lab.style.display = show ? "" : "none";
    if (show) visible++;
  });
  if (metaEl) metaEl.textContent = `显示 ${visible} 项，已选 ${totalChecked} 项`;
}
function buildDaCheckboxGrid(containerId, cols, metaId) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (const col of cols) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = col;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(col.length > 36 ? col.slice(0, 34) + "…" : col));
    lab.title = col;
    container.appendChild(lab);
  }
  filterCheckboxGrid(container, $(metaId), "");
}
function getFirstRatioNumeratorCol() {
  const specs = collectRatioSpecs();
  return specs[0]?.num || "";
}
function resolveDaBadLabelSpec() {
  const mode = $("daBadMode")?.value || "numerator";
  if (mode === "numerator") {
    const col = getFirstRatioNumeratorCol();
    return { col, threshold: 0, desc: `第 1 个风险比率分子列「${col}」> 0` };
  }
  const col = $("daBadCol")?.value || "";
  const threshold = Number($("daBadThreshold")?.value);
  const th = Number.isFinite(threshold) ? threshold : 0;
  return { col, threshold: th, desc: `列「${col}」> ${th}` };
}
function validateEdaConfig() {
  if (!S.rawRows.length) return "请先上传 CSV";
  const vars = getEdaVarSelection();
  if (!vars.length) return "请至少选择一个 EDA 分析变量";
  if (vars.length > C.MAX_DA_VARS) return `分析变量最多 ${C.MAX_DA_VARS} 个`;
  const ratioSpecs = collectRatioSpecs();
  if (!ratioSpecs.length || !ratioSpecs[0].num) return "请配置至少一个风险比率（分子/分母）";
  const badSpec = resolveDaBadLabelSpec();
  if (!badSpec.col) return "无法确定 Y 标签列";
  if (!S.headers.includes(badSpec.col)) return `Y 标签列「${badSpec.col}」不存在`;
  for (const v of vars) {
    if (!S.headers.includes(v)) return `分析变量「${v}」不存在`;
  }
  const groupCols = getEdaGroupColSelection();
  if (groupCols.length > C.MAX_DA_GROUP_COLS) {
    return `分组标签最多 ${C.MAX_DA_GROUP_COLS} 个`;
  }
  for (const c of groupCols) {
    if (!S.headers.includes(c)) return `分组标签「${c}」不存在`;
  }
  return null;
}
function equalBinShares(nBins) {
  nBins = Math.max(2, Math.min(20, nBins | 0));
  const shares = [];
  let allocated = 0;
  for (let i = 0; i < nBins - 1; i++) {
    const s = Math.floor(10000 / nBins) / 100;
    shares.push(s);
    allocated += s;
  }
  shares.push(Math.round((100 - allocated) * 100) / 100);
  return shares;
}
function validateCustomBinShares(shares, nBins) {
  if (!Array.isArray(shares) || shares.length !== nBins) return "占比数量须与分箱数一致";
  let sum = 0;
  for (const s of shares) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return "每箱占比须大于 0%";
    sum += n;
  }
  if (Math.abs(sum - 100) >= 0.01) return `占比合计须为 100%（当前 ${sum.toFixed(2)}%）`;
  return null;
}
function clampBinCount(raw) {
  let nBins = parseInt(raw, 10);
  if (!Number.isFinite(nBins)) nBins = 5;
  return Math.max(2, Math.min(20, nBins));
}
function collectBinSharesFromDom() {
  const inputs = document.querySelectorAll("#daBinSharesWrap .da-bin-share-input");
  return [...inputs].map((inp) => Number(inp.value));
}
function parseManualThresholdsText(text, selectedVars) {
  const out = {};
  const lines = String(text || "").split(/\r?\n/);
  if (!lines.length) return out;
  const onlyVar = selectedVars?.length === 1 ? selectedVars[0] : "";
  let activeVar = "";
  for (const rawLine of lines) {
    const ln = String(rawLine || "").trim();
    if (!ln || ln.startsWith("#")) continue;
    let varName = "";
    let rawCuts = "";
    const colon = ln.indexOf(":");
    if (colon >= 0) {
      varName = ln.slice(0, colon).trim();
      rawCuts = ln.slice(colon + 1).trim();
      if (!varName && onlyVar) varName = onlyVar;
      if (!varName) {
        activeVar = "";
        continue;
      }
      activeVar = varName;
    } else {
      varName = activeVar || onlyVar;
      rawCuts = ln;
      if (!varName) continue;
    }
    const cuts = rawCuts.split(/[,\s，]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (!cuts.length) continue;
    if (!out[varName]) out[varName] = [];
    out[varName].push(...cuts);
  }
  return out;
}
function normalizeManualThresholdsMap(map) {
  const out = {};
  for (const [k, arr] of Object.entries(map || {})) {
    const cuts = [...new Set((arr || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0))].sort((a, b) => a - b);
    if (cuts.length) out[k] = cuts;
  }
  return out;
}
function collectManualBinThresholdsFromDom(selectedVars) {
  const txt = $("daBinManualThresholds")?.value || "";
  return normalizeManualThresholdsMap(parseManualThresholdsText(txt, selectedVars || []));
}
function formatManualThresholdMapText(map, vars) {
  const orderedVars = (vars || [])
    .filter((v) => map?.[v]?.length)
    .concat(Object.keys(map || {}).filter((v) => !(vars || []).includes(v)));
  return orderedVars.map((v) => {
    const cuts = (map[v] || []).map((x) => formatManualCut(x));
    if (!cuts.length) return "";
    const chunked = [];
    for (let i = 0; i < cuts.length; i += 6) {
      chunked.push(cuts.slice(i, i + 6).join(", "));
    }
    return `${v}:\n  ${chunked.join(",\n  ")}`;
  }).filter(Boolean).join("\n");
}
function renderManualThresholdVarHints(vars, map) {
  const mount = $("daBinManualVarHint");
  if (!mount) return;
  const selected = vars || [];
  if (!selected.length) {
    mount.innerHTML = `<p class="config-muted" style="margin:0">请选择分箱变量后填写切点</p>`;
    return;
  }
  const configured = selected.filter((v) => map?.[v]?.length);
  const missing = selected.filter((v) => !map?.[v]?.length);
  let html = `<p class="config-muted" style="margin:0 0 .35rem">配置进度：${configured.length}/${selected.length}</p>`;
  html += `<div class="da-bin-manual-var-chips">`;
  for (const v of configured) html += `<span class="filter-tag">${esc(v)} ✓</span>`;
  for (const v of missing) html += `<span class="filter-tag" style="opacity:.7">${esc(v)} 待填</span>`;
  html += `</div>`;
  mount.innerHTML = html;
}
function formatManualThresholdEditorText() {
  const vars = getBinVarSelection();
  const map = collectManualBinThresholdsFromDom(vars);
  const ta = $("daBinManualThresholds");
  if (!ta) return;
  ta.value = formatManualThresholdMapText(map, vars);
  updateManualThresholdMeta();
}
function parseManualCutsInput(raw) {
  return String(raw || "")
    .split(/[,\s，]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
}
function applyManualThresholdFromPreview(varName, rawCuts) {
  const ta = $("daBinManualThresholds");
  if (!ta || !varName) return;
  const selectedVars = getBinVarSelection();
  const map = collectManualBinThresholdsFromDom([...selectedVars, varName]);
  const cuts = [...new Set(parseManualCutsInput(rawCuts))].sort((a, b) => a - b);
  if (!cuts.length) {
    setDaBinStatus(`变量「${varName}」至少需要 1 个有效切点`, "warn");
    return;
  }
  for (const c of cuts) {
    if (c < 0) {
      setDaBinStatus(`变量「${varName}」的切点不能小于 0`, "warn");
      return;
    }
  }
  map[varName] = cuts;
  const orderedVars = selectedVars.includes(varName) ? selectedVars : [...selectedVars, varName];
  ta.value = formatManualThresholdMapText(map, orderedVars);
  updateManualThresholdMeta();
  renderManualThresholdPreview(map, orderedVars);
  invalidateDataAnalysisCache({ track: "bin" });
  setDaBinStatus(`已更新变量「${varName}」切点（${cuts.length} 个）`, "ok");
}
function buildManualThresholdTemplateText(vars) {
  return (vars || []).map((v) => `${v}:`).join("\n");
}
function fillManualThresholdTemplateFromSelectedVars() {
  const vars = getBinVarSelection();
  if (!vars.length) {
    setDaBinStatus("请先选择分箱变量后再生成模板", "warn");
    return;
  }
  const ta = $("daBinManualThresholds");
  if (!ta) return;
  ta.value = buildManualThresholdTemplateText(vars);
  updateManualThresholdMeta();
  invalidateDataAnalysisCache({ track: "bin" });
  setDaBinStatus(`已生成 ${vars.length} 个变量的切点模板`, "ok");
}
function markManualPreviewDirty(msg) {
  const mount = $("daBinManualPreviewMount");
  if (!mount) return;
  mount.innerHTML = `<p class="config-muted" style="margin:.25rem 0">${esc(msg || "阈值已更新，点击「刷新切点预览」查看最新样本占比")}</p>`;
}
function clearManualThresholdPreview() {
  const mount = $("daBinManualPreviewMount");
  if (mount) mount.innerHTML = "";
}
function renderManualThresholdPreview(thresholdMap, vars) {
  const mount = $("daBinManualPreviewMount");
  if (!mount) return;
  if (!S.rawRows.length) {
    mount.innerHTML = `<p class="config-muted" style="margin:.25rem 0">请先上传 CSV 后预览</p>`;
    return;
  }
  const postRows = applyFilters(S.rawRows, getSampleConfig("post"));
  const preview = buildManualThresholdPreviewData(postRows, thresholdMap, vars);
  if (!preview.ok) {
    const msg = preview.reason === "empty_sample"
      ? "当前贷后样本为空，无法预览"
      : "暂无可预览的阈值配置";
    mount.innerHTML = `<p class="config-muted" style="margin:.25rem 0">${msg}</p>`;
    return;
  }
  let html = `<p class="config-muted" style="margin:.25rem 0 .45rem">预览基于当前贷后样本（${preview.sampleN.toLocaleString()} 行）</p>`;
  for (const item of preview.items) {
    const cutsText = (item.cuts || []).map((x) => formatManualCut(x)).join(", ");
    html += `<div class="da-bin-manual-preview-item">`;
    html += `<div class="da-bin-manual-preview-head">`;
    html += `<p class="config-muted" style="font-size:.78rem;margin:0"><b>${esc(item.var)}</b>（切点：${esc(cutsText)}）</p>`;
    html += `<div class="da-bin-manual-preview-edit">`;
    html += `<input type="text" class="da-bin-manual-preview-cuts" data-var="${esc(item.var)}" value="${esc(cutsText)}" placeholder="切点1, 切点2, ..."/>`;
    html += `<button type="button" class="btn btn-secondary btn-sm da-bin-manual-preview-apply" data-var="${esc(item.var)}">更新切点</button>`;
    html += `</div></div>`;
    html += `<table class="data-table"><thead><tr><th>分箱</th><th>样本量</th><th>样本占比</th></tr></thead><tbody>`;
    for (let i = 0; i < item.labels.length; i++) {
      html += `<tr><td>${esc(item.labels[i])}</td><td class="num">${fmtNum(item.counts[i] || 0)}</td><td class="num">${fmtMetric(item.shares[i] || 0)}%</td></tr>`;
    }
    html += `</tbody></table>`;
    html += `</div>`;
  }
  mount.innerHTML = html;
}
function formatManualCut(v) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v - Math.round(v)) < 1e-8) return String(Math.round(v));
  return String(Number(v.toFixed(8)));
}
function autofillManualThresholdsFromEqualFreq() {
  if (!S.rawRows.length) {
    setDaBinStatus("请先上传 CSV", "err");
    return;
  }
  const vars = getBinVarSelection();
  if (!vars.length) {
    setDaBinStatus("请先选择分箱变量后再回填阈值", "warn");
    return;
  }
  const nBins = clampBinCount($("daBinCount")?.value);
  const base = buildDaContext();
  const postRows = base?.postRows || [];
  const denCol = base?.ratioSpec?.den;
  const map = {};
  const noDataVars = [];
  for (const v of vars) {
    const rule = buildDenWeightedBinRule(postRows, v, nBins, denCol);
    const cuts = [...new Set((rule.intervals || [])
      .slice(0, -1)
      .map((it) => Number(it.hi))
      .filter((x) => Number.isFinite(x)))]
      .sort((a, b) => a - b);
    if (cuts.length) map[v] = cuts;
    else noDataVars.push(v);
  }
  const txt = formatManualThresholdMapText(map, vars);
  const ta = $("daBinManualThresholds");
  if (ta) ta.value = txt;
  updateManualThresholdMeta();
  renderManualThresholdPreview(map, vars);
  invalidateDataAnalysisCache({ track: "bin" });
  if (Object.keys(map).length && !noDataVars.length) {
    setDaBinStatus(`已按当前样本等频回填 ${Object.keys(map).length} 个变量切点`, "ok");
  } else if (Object.keys(map).length) {
    setDaBinStatus(`已回填部分变量；以下变量无有效切点：${noDataVars.join("、")}`, "warn");
  } else {
    setDaBinStatus("未生成切点，请检查当前样本与变量取值", "warn");
  }
}
function validateManualBinThresholds(thresholdMap, vars) {
  if (!vars?.length) return "请至少选择一个分箱变量";
  for (const v of vars) {
    const cuts = thresholdMap?.[v];
    if (!cuts?.length) return `手动阈值模式下，变量「${v}」需要配置至少 1 个切点`;
    for (let i = 0; i < cuts.length; i++) {
      if (!Number.isFinite(cuts[i])) return `变量「${v}」的切点存在非法值`;
      if (cuts[i] < 0) return `变量「${v}」的切点不能小于 0`;
      if (i > 0 && cuts[i] <= cuts[i - 1]) return `变量「${v}」切点需严格递增`;
    }
  }
  return null;
}
function updateManualThresholdMeta() {
  const meta = $("daBinManualMeta");
  if (!meta) return;
  const mode = $("daBinMode")?.value || "equal_freq";
  if (mode !== "manual_thresholds") {
    meta.textContent = "";
    meta.className = "config-muted";
    clearManualThresholdPreview();
    refreshBinRunButtonState();
    return;
  }
  const vars = getBinVarSelection();
  const map = collectManualBinThresholdsFromDom(vars);
  const err = validateManualBinThresholds(map, vars);
  renderManualThresholdVarHints(vars, map);
  if (err) {
    meta.textContent = err;
    meta.className = "config-muted err";
    markManualPreviewDirty("阈值未通过校验，预览不可用");
  } else {
    const configured = vars.filter((v) => map?.[v]?.length).length;
    meta.textContent = `已配置 ${configured}/${vars.length || configured} 个变量切点，运行后按手动阈值分箱`;
    meta.className = "config-muted ok";
    markManualPreviewDirty("阈值已更新，点击「刷新切点预览」查看最新样本占比");
  }
  refreshBinRunButtonState();
}
function renderBinShareInputs(nBins, presetShares) {
  const wrap = $("daBinSharesWrap");
  if (!wrap) return;
  const shares = presetShares?.length === nBins ? presetShares : equalBinShares(nBins);
  wrap.innerHTML = "";
  const row = document.createElement("div");
  row.className = "da-bin-shares-row";
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "0.35rem 0.5rem";
  row.style.alignItems = "center";
  shares.forEach((s, idx) => {
    const lab = document.createElement("label");
    lab.style.fontSize = ".82rem";
    lab.appendChild(document.createTextNode(`箱${idx + 1} `));
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "da-bin-share-input";
    inp.min = "0.01";
    inp.max = "100";
    inp.step = "0.01";
    inp.value = String(s);
    inp.style.width = "4.2rem";
    inp.addEventListener("input", () => {
      updateBinShareMeta();
      invalidateDataAnalysisCache({ track: "binUni" });
    });
    lab.appendChild(inp);
    lab.appendChild(document.createTextNode(" %"));
    row.appendChild(lab);
  });
  wrap.appendChild(row);
  updateBinShareMeta();
}
function updateBinShareMeta() {
  const meta = $("daBinShareMeta");
  if (!meta) return;
  const mode = $("daBinMode")?.value || "equal_freq";
  if (mode !== "custom_share") {
    meta.textContent = "";
    meta.className = "config-muted";
    refreshBinRunButtonState();
    return;
  }
  const nBins = clampBinCount($("daBinCount")?.value);
  const shares = collectBinSharesFromDom();
  const err = validateCustomBinShares(shares, nBins);
  const sum = shares.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (err) {
    meta.textContent = `${err}`;
    meta.className = "config-muted err";
  } else {
    meta.textContent = `合计 ${sum.toFixed(2)}% ✓`;
    meta.className = "config-muted ok";
  }
  refreshBinRunButtonState();
}
function syncBinModePanel({ reseedShares = false } = {}) {
  const mode = $("daBinMode")?.value || "equal_freq";
  const sharePanel = $("daBinSharePanel");
  const manualPanel = $("daBinManualPanel");
  const countField = $("daBinCountField");
  if (sharePanel) sharePanel.style.display = mode === "custom_share" ? "" : "none";
  if (manualPanel) manualPanel.style.display = mode === "manual_thresholds" ? "" : "none";
  if (countField) countField.style.display = mode === "manual_thresholds" ? "none" : "";
  if (mode === "custom_share") {
    const nBins = clampBinCount($("daBinCount")?.value);
    const existing = reseedShares ? null : collectBinSharesFromDom();
    if (reseedShares || existing.length !== nBins) renderBinShareInputs(nBins, reseedShares ? null : existing);
    else updateBinShareMeta();
  } else {
    updateBinShareMeta();
  }
  updateManualThresholdMeta();
  setBinRunModeHint();
  refreshBinRunButtonState();
}
function refreshBinRunButtonState() {
  const uniBtn = $("btnRunBinAnalysis");
  const crossBtn = $("btnRunCrossBinAnalysis");
  const uniBusy = !!(S.daBinUniBusy || S.daAnalysisBusy);
  const crossBusy = !!(S.daBinCrossBusy || S.daAnalysisBusy);
  if (uniBtn && !uniBusy) {
    if (!S.rawRows.length) {
      uniBtn.disabled = true;
    } else {
      const mode = $("daBinMode")?.value || "equal_freq";
      const vars = getBinVarSelection();
      if (mode === "custom_share") {
        const nBins = clampBinCount($("daBinCount")?.value);
        uniBtn.disabled = !vars.length || !!validateCustomBinShares(collectBinSharesFromDom(), nBins);
      } else if (mode === "manual_thresholds") {
        const map = collectManualBinThresholdsFromDom(vars);
        uniBtn.disabled = !vars.length || !!validateManualBinThresholds(map, vars);
      } else {
        uniBtn.disabled = !vars.length;
      }
    }
  }
  if (crossBtn && !crossBusy) {
    if (!S.rawRows.length) {
      crossBtn.disabled = true;
    } else {
      crossBtn.disabled = !!validateCrossBinConfig();
    }
  }
  if (uniBtn && uniBusy) uniBtn.disabled = true;
  if (crossBtn && crossBusy) crossBtn.disabled = true;
}
function renderBinFootnoteHtml(binMeta) {
  const mode = binMeta?.binMode || "equal_freq";
  const hasStrat = (binMeta?.stratCols?.length ?? 0) > 0;
  let modeTxt = "分母加权等频";
  if (mode === "custom_share" && binMeta?.shares?.length) {
    modeTxt = `自定义占比（${binMeta.shares.map((s) => `${Number(s)}%`).join("/")}）`;
  } else if (mode === "manual_thresholds") {
    modeTxt = "手动阈值";
  }
  const shareDevNote = formatBinShareDeviationNote(binMeta?.shareDeviationByVar);
  const items = [
    `${modeTxt}；切点按全量贷后`,
    hasStrat ? "分层格内占比可能偏离目标" : null,
    "明细含缺失/负数；汇总按区间对齐不含",
    "Lift=组比率/整体；色阶青低橙高",
    "点「分箱」枚举可钻取",
    shareDevNote || null,
  ].filter(Boolean);
  return `<details class="da-bin-footnote-details">
    <summary>口径说明</summary>
    <ul class="da-bin-footnote-list">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </details>`;
}
function renderBinHintTip(binMeta) {
  const mode = binMeta?.binMode || "equal_freq";
  const hasStrat = (binMeta?.stratCols?.length ?? 0) > 0;
  let modeTxt;
  if (mode === "custom_share") modeTxt = "自定义占比";
  else if (mode === "manual_thresholds") modeTxt = "手动阈值";
  else modeTxt = "等频切分";
  const stratTxt = hasStrat ? "·分层" : "";
  return `${modeTxt}${stratTxt}·含缺失/负数·点枚举钻取`;
}
function initBinConfigPanel() {
  const trackModeSel = $("daBinTrackMode");
  const modeSel = $("daBinMode");
  const countInp = $("daBinCount");
  const crossX = $("daCrossXVar");
  const crossY = $("daCrossYVar");
  const crossXBins = $("daCrossXBinCount");
  const crossYBins = $("daCrossYBinCount");
  const manualInp = $("daBinManualThresholds");
  const manualAutofillBtn = $("btnBinManualAutofill");
  const manualTemplateBtn = $("btnBinManualTemplate");
  const manualPreviewBtn = $("btnBinManualPreview");
  const manualFormatBtn = $("btnBinManualFormat");
  const manualPreviewMount = $("daBinManualPreviewMount");
  if (!modeSel || modeSel.dataset.bound === "1") return;
  modeSel.dataset.bound = "1";
  document.querySelectorAll(".da-track-tab").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      if (trackModeSel) trackModeSel.value = btn.dataset.track || BIN_TRACK_UNI;
      syncBinTrackPanels();
    });
  });
  trackModeSel?.addEventListener("change", () => {
    syncBinTrackPanels();
  });
  modeSel.addEventListener("change", () => {
    syncBinModePanel({ reseedShares: modeSel.value === "custom_share" });
    invalidateDataAnalysisCache({ track: "bin" });
  });
  countInp?.addEventListener("change", () => {
    countInp.value = String(clampBinCount(countInp.value));
    if (($("daBinMode")?.value || "equal_freq") === "custom_share") {
      renderBinShareInputs(clampBinCount(countInp.value));
    }
    invalidateDataAnalysisCache({ track: "binUni" });
  });
  countInp?.addEventListener("input", () => refreshBinRunButtonState());
  crossX?.addEventListener("change", () => {
    refreshBinRunButtonState();
    refreshDaConfigPanelSummaries();
    invalidateDataAnalysisCache({ track: "binCross" });
  });
  crossY?.addEventListener("change", () => {
    refreshBinRunButtonState();
    refreshDaConfigPanelSummaries();
    invalidateDataAnalysisCache({ track: "binCross" });
  });
  crossXBins?.addEventListener("change", () => {
    crossXBins.value = String(clampBinCount(crossXBins.value));
    invalidateDataAnalysisCache({ track: "binCross" });
  });
  crossYBins?.addEventListener("change", () => {
    crossYBins.value = String(clampBinCount(crossYBins.value));
    invalidateDataAnalysisCache({ track: "binCross" });
  });
  manualInp?.addEventListener("input", () => {
    updateManualThresholdMeta();
    invalidateDataAnalysisCache({ track: "bin" });
  });
  manualAutofillBtn?.addEventListener("click", () => {
    autofillManualThresholdsFromEqualFreq();
  });
  manualTemplateBtn?.addEventListener("click", () => {
    fillManualThresholdTemplateFromSelectedVars();
  });
  manualFormatBtn?.addEventListener("click", () => {
    formatManualThresholdEditorText();
    setDaBinStatus("已按变量格式化切点输入", "ok");
  });
  manualPreviewBtn?.addEventListener("click", () => {
    const vars = getBinVarSelection();
    const map = collectManualBinThresholdsFromDom(vars);
    const err = validateManualBinThresholds(map, vars);
    if (err) {
      setDaBinStatus(err, "warn");
      return;
    }
    renderManualThresholdPreview(map, vars);
    setDaBinStatus("已刷新手动阈值预览", "ok");
  });
  manualPreviewMount?.addEventListener("click", (e) => {
    const btn = e.target.closest(".da-bin-manual-preview-apply");
    if (!btn) return;
    const varName = btn.dataset.var || "";
    const input = manualPreviewMount.querySelector(`.da-bin-manual-preview-cuts[data-var="${CSS.escape(varName)}"]`);
    const rawCuts = input?.value || "";
    applyManualThresholdFromPreview(varName, rawCuts);
  });
  syncBinModePanel();
  syncBinTrackPanels();
}
function validateUniBinConfig() {
  if (!S.rawRows.length) return "请先上传 CSV";
  const vars = getBinVarSelection();
  if (!vars.length) return "请至少选择一个分箱变量";
  const ratioSpecs = collectRatioSpecs();
  if (!ratioSpecs.length || !ratioSpecs[0].num) return "请配置至少一个风险比率（分子/分母）";
  for (const v of vars) {
    if (!S.headers.includes(v)) return `分箱变量「${v}」不存在`;
  }
  const stratCols = getBinStratColSelection();
  if (stratCols.length > C.MAX_DA_GROUP_COLS) {
    return `分层变量最多 ${C.MAX_DA_GROUP_COLS} 个`;
  }
  for (const c of stratCols) {
    if (!S.headers.includes(c)) return `分层变量「${c}」不存在`;
  }
  const binMode = $("daBinMode")?.value || "equal_freq";
  if (binMode === "custom_share") {
    const nBins = clampBinCount($("daBinCount")?.value);
    const shareErr = validateCustomBinShares(collectBinSharesFromDom(), nBins);
    if (shareErr) return shareErr;
  } else if (binMode === "manual_thresholds") {
    const manualErr = validateManualBinThresholds(
      collectManualBinThresholdsFromDom(vars),
      vars
    );
    if (manualErr) return manualErr;
  }
  return null;
}
function validateCrossBinConfig() {
  if (!S.rawRows.length) return "请先上传 CSV";
  const ratioSpecs = collectRatioSpecs();
  if (!ratioSpecs.length || !ratioSpecs[0].num) return "请配置至少一个风险比率（分子/分母）";
  const crossX = $("daCrossXVar")?.value || "";
  const crossY = $("daCrossYVar")?.value || "";
  if ((crossX && !crossY) || (!crossX && crossY)) return "二维交叉分箱请同时选择 X 与 Y 变量";
  if (!crossX && !crossY) return "请先为二维交叉分箱选择 X 与 Y 变量";
  if (crossX === crossY) return "二维交叉分箱的 X 与 Y 变量不能相同";
  if (!S.headers.includes(crossX)) return `二维交叉分箱变量 X「${crossX}」不存在`;
  if (!S.headers.includes(crossY)) return `二维交叉分箱变量 Y「${crossY}」不存在`;
  const crossGroups = getCrossGroupColSelection();
  if (crossGroups.length > C.MAX_DA_GROUP_COLS) {
    return `交叉分组标签最多 ${C.MAX_DA_GROUP_COLS} 个`;
  }
  const binMode = $("daBinMode")?.value || "equal_freq";
  if (binMode === "manual_thresholds") {
    const map = collectManualBinThresholdsFromDom([crossX, crossY]);
    if (!map[crossX]?.length) return `手动阈值模式下，二维变量 X「${crossX}」需要配置切点`;
    if (!map[crossY]?.length) return `手动阈值模式下，二维变量 Y「${crossY}」需要配置切点`;
  }
  return null;
}
/** @deprecated Prefer validateUniBinConfig / validateCrossBinConfig */
function validateBinConfig() {
  const uniErr = validateUniBinConfig();
  if (uniErr) return uniErr;
  const crossX = $("daCrossXVar")?.value || "";
  const crossY = $("daCrossYVar")?.value || "";
  if (crossX || crossY) return validateCrossBinConfig();
  return null;
}
function refreshDaBadLabelUI() {
  const mode = $("daBadMode")?.value || "numerator";
  const hint = $("daBadNumeratorHint");
  const pickers = $("daBadColumnPickers");
  if (mode === "numerator") {
    const col = getFirstRatioNumeratorCol() || "（请配置风险比率）";
    if (hint) {
      hint.textContent = `默认：第 1 个风险比率分子列「${col}」> 0 记为坏样本`;
      hint.style.display = "";
    }
    if (pickers) pickers.style.display = "none";
  } else {
    if (hint) hint.style.display = "none";
    if (pickers) pickers.style.display = "";
  }
  refreshDaConfigPanelSummaries();
}
function initResizableTables(root) {
  const scope = root || document;
  scope.querySelectorAll(".da-corr-table-wrap .data-table, .da-overview-table-wrap .data-table, .da-group-table-wrap .data-table, .attr-table-wrap .data-table").forEach((table) => {
    if (table.dataset.resizeInit === "1") return;
    table.dataset.resizeInit = "1";
    table.querySelectorAll("thead th").forEach((th, colIdx) => {
      let rz = th.querySelector(".col-resizer");
      if (!rz) {
        const cell = th.querySelector(".th-cell") || th;
        const inner = cell === th ? th.innerHTML : cell.innerHTML;
        th.innerHTML = `<div class="th-cell">${inner}<span class="col-resizer" title="拖动调整列宽"></span></div>`;
        rz = th.querySelector(".col-resizer");
      }
      if (rz) bindColResizer(table, rz, colIdx);
    });
    table.querySelectorAll('tbody th[scope="row"]').forEach((th) => {
      let rz = th.querySelector(".col-resizer");
      if (!rz) {
        const cell = th.querySelector(".th-cell") || th;
        const inner = cell === th ? th.innerHTML : cell.innerHTML;
        th.innerHTML = `<div class="th-cell">${inner}<span class="col-resizer" title="拖动调整列宽"></span></div>`;
        rz = th.querySelector(".col-resizer");
      }
      if (rz) bindColResizer(table, rz, 0);
    });
  });
}
function renderCorrelationTable(cols, matrix) {
  if (!cols.length) return "";
  let html = `<div class="da-section rv-result-card"><h3 class="rv-heading-with-hint">变量相关性（Pearson）${hintBadgeHtml("|r| 青低橙高")}</h3>`;
  html += `<div class="table-interactive-wrap da-corr-table-wrap"><table class="data-table corr-table"><thead><tr>`;
  html += thWithResizer("");
  for (const c of cols) html += thWithResizer(`<span title="${esc(c)}">${esc(c)}</span>`);
  html += `</tr></thead><tbody>`;
  for (const r of cols) {
    html += `<tr>${thWithRowResizer(`<span title="${esc(r)}">${esc(r)}</span>`)}`;
    for (const c of cols) {
      const v = matrix[r]?.[c];
      const heat = corrHeatStyle(v);
      html += `<td class="corr-cell"${heat ? ` style="${heat}"` : ""}>${v == null ? "N/A" : fmtMetric(v)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function resolveEdaGroupCols(eda) {
  if (!eda) return [];
  if (eda.groupCols?.length) return eda.groupCols;
  return eda.groupCol ? [eda.groupCol] : [];
}
function renderMetricsTables(metricsByVar, groupCols) {
  let html = `<div class="da-section rv-result-card"><h3 class="rv-heading-with-hint">模型效果 AUC / KS / IV${hintBadgeHtml("行级算 AUC/KS/IV；分组才显 PSI")}</h3>`;
  html += `<table class="data-table"><thead><tr>
    <th>变量</th><th>方向</th><th>AUC</th><th>KS</th><th>IV</th>
  </tr></thead><tbody>`;
  for (const m of metricsByVar) {
    html += `<tr>
      <td>${esc(m.col)}</td>
      <td>${m.overall.scoreNegated ? "−原始分" : "原始分"}</td>
      <td class="num">${fmtMetric(m.overall.auc)}</td>
      <td class="num">${fmtMetric(m.overall.ks)}</td>
      <td class="num">${fmtMetric(m.overall.iv)}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  if (groupCols?.length && metricsByVar.some((m) => m.groups.length)) {
    html += `<h3 style="margin-top:1rem">分组明细（${esc(formatGroupLabels(groupCols))}）</h3>`;
    const groupThs = groupCols.map((c) => `<th>${esc(c)}</th>`).join("");
    html += `<table class="data-table"><thead><tr>
      ${groupThs}<th>变量</th><th>AUC</th><th>KS</th><th>IV</th><th>PSI</th>
    </tr></thead><tbody>`;
    for (const m of metricsByVar) {
      for (const g of m.groups) {
        const parts = g.groupParts || [g.group];
        const groupTds = groupCols.map((_, i) => `<td>${esc(parts[i] ?? "")}</td>`).join("");
        html += `<tr>
          ${groupTds}<td>${esc(m.col)}</td>
          <td class="num">${fmtMetric(g.auc)}</td>
          <td class="num">${fmtMetric(g.ks)}</td>
          <td class="num">${fmtMetric(g.iv)}</td>
          <td class="num">${fmtMetric(g.psi)}</td>
        </tr>`;
      }
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}
function buildEdaOverviewRows(missingStats, metricsByVar) {
  const metricsMap = Object.fromEntries((metricsByVar || []).map((m) => [m.col, m]));
  return (missingStats || []).map((ms) => {
    const ov = metricsMap[ms.col]?.overall;
    return {
      col: ms.col,
      missingRate: ms.missingRate,
      auc: ov?.auc,
      ks: ov?.ks,
      iv: ov?.iv,
      scoreNegated: ov?.scoreNegated,
    };
  });
}
function renderEdaOverviewTableInner(rows, metricsByVar) {
  const sorted = sortEdaRows(rows, _edaOverviewSort, (row) => overviewRowSortValue(row, _edaOverviewSort.key));
  const scales = metricColumnScales(
    (metricsByVar || []).map((m) => ({
      auc: m.overall?.auc,
      ks: m.overall?.ks,
      iv: m.overall?.iv,
    })),
    ["auc", "ks", "iv"]
  );
  let html = `<div class="table-interactive-wrap da-overview-table-wrap"><table id="daOverviewTable" class="data-table"><thead><tr>`;
  html += thSortable("变量", "col", _edaOverviewSort, "string");
  html += thSortable("缺失率", "missingRate", _edaOverviewSort, "number");
  html += thSortable("AUC", "auc", _edaOverviewSort, "number");
  html += thSortable("KS", "ks", _edaOverviewSort, "number");
  html += thSortable("IV", "iv", _edaOverviewSort, "number");
  html += thSortable("方向", "direction", _edaOverviewSort, "string");
  html += `</tr></thead><tbody>`;
  for (const row of sorted) {
    html += `<tr>
      <td>${esc(row.col)}</td>
      <td class="num">${row.missingRate != null ? fmtMetric(row.missingRate) + "%" : "N/A"}</td>
      <td${metricHeatCell(row.auc, scales.auc)}>${fmtMetric(row.auc)}</td>
      <td${metricHeatCell(row.ks, scales.ks)}>${fmtMetric(row.ks)}</td>
      <td${metricHeatCell(row.iv, scales.iv)}>${fmtMetric(row.iv)}</td>
      <td>${row.scoreNegated ? "−原始分" : "原始分"}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}
function renderEdaOverviewTable(missingStats, metricsByVar) {
  const rows = buildEdaOverviewRows(missingStats, metricsByVar);
  let html = `<div class="da-section rv-result-card"><h3>变量概览</h3>`;
  html += `<div id="daOverviewMount">${renderEdaOverviewTableInner(rows, metricsByVar)}</div>`;
  html += `</div>`;
  return html;
}
function refreshEdaOverviewTable() {
  const eda = S.lastDataAnalysis?.eda;
  const mount = $("daOverviewMount");
  if (!mount || !eda) return;
  const rows = buildEdaOverviewRows(eda.missingStats, eda.metricsByVar);
  mount.innerHTML = renderEdaOverviewTableInner(rows, eda.metricsByVar);
}
function metricScalesByVariable(flatRows, keys) {
  const map = {};
  for (const col of [...new Set(flatRows.map((r) => r.col))]) {
    map[col] = metricColumnScales(flatRows.filter((r) => r.col === col), keys);
  }
  return map;
}
function renderGroupMetricsTableInner(flatRows, groupCols) {
  const scalesMap = metricScalesByVariable(flatRows, ["auc", "ks", "iv", "psi"]);
  const cols = groupCols?.length ? groupCols : ["分组"];
  const groupThs = cols.map((c, i) => thSortable(c, `group:${i}`, _edaGroupSort, "string")).join("");
  let html = `<div class="table-interactive-wrap da-group-table-wrap" title="默认可视约 ${C.DA_GROUP_TABLE_VISIBLE_ROWS} 行，可拖动调整高度">`;
  html += `<table id="daGroupMetricsTable" class="data-table"><thead><tr>`;
  html += groupThs;
  html += thSortable("变量", "col", _edaGroupSort, "string");
  html += thSortable("AUC", "auc", _edaGroupSort, "number");
  html += thSortable("KS", "ks", _edaGroupSort, "number");
  html += thSortable("IV", "iv", _edaGroupSort, "number");
  html += thSortable("PSI", "psi", _edaGroupSort, "number");
  html += `</tr></thead><tbody>`;
  if (!flatRows.length) {
    html += `<tr><td colspan="${cols.length + 5}" class="config-muted">无匹配分组行；请调整筛选条件</td></tr>`;
  }
  for (const row of flatRows) {
    const scales = scalesMap[row.col] || {};
    const groupTds = cols.map((_, i) => `<td>${esc(row.groupParts[i] ?? "")}</td>`).join("");
    html += `<tr>
      ${groupTds}<td>${esc(row.col)}</td>
      <td${metricHeatCell(row.auc, scales.auc)}>${fmtMetric(row.auc)}</td>
      <td${metricHeatCell(row.ks, scales.ks)}>${fmtMetric(row.ks)}</td>
      <td${metricHeatCell(row.iv, scales.iv)}>${fmtMetric(row.iv)}</td>
      <td${metricHeatCell(row.psi, scales.psi)}>${fmtMetric(row.psi)}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}
function getGroupVarFilterChecked() {
  if (CP().getPickerSpec("edaDisplayVar") && $("daEdaResultFilterBar")) {
    return CP().getPickerSelection("edaDisplayVar");
  }
  const host = $("daGroupVarFilterChecks");
  if (!host) return [];
  return getChecked(host);
}

function updateGroupVarFilterMeta() {
  /* meta lives in dim-filter chip tags; kept for export callers */
}

function buildGroupVarFilter(metricsByVar, selectedVars) {
  /* legacy alias — display vars live in buildEdaResultFilterBar */
  void metricsByVar;
  void selectedVars;
}
function syncEdaDisplayVarFilters() {
  refreshGroupMetricsTable();
  renderEdaDistCharts();
}
function clearDaEdaVarChecks() {
  CP().applySelection("daEdaVar", []);
  if (S.lastDataAnalysis) delete S.lastDataAnalysis.eda;
  const results = $("daEdaResults");
  if (results) {
    results.innerHTML = `<p class="da-results-placeholder">配置变量后点击「运行 EDA 分析」</p>`;
  }
  setDaEdaStatus("");
  refreshDaConfigPanelSummaries();
}
function refreshGroupMetricsTable() {
  const eda = S.lastDataAnalysis?.eda;
  const mount = $("daGroupMetricsMount");
  if (!mount || !eda?.metricsByVar) return;
  const groupCols = resolveEdaGroupCols(eda);
  const hasVarFilter = !!($("daEdaResultFilterBar") && CP().getPickerSpec("edaDisplayVar"));
  const filterVars = hasVarFilter ? new Set(getGroupVarFilterChecked()) : null;
  const metrics = filterVars?.size
    ? eda.metricsByVar.filter((m) => filterVars.has(m.col))
    : (filterVars ? [] : eda.metricsByVar);
  const groupValueFilter = collectEdaGroupValueFilter();
  let flatRows = flattenEdaGroupMetrics(metrics, groupCols, groupValueFilter);
  flatRows = sortEdaRows(flatRows, _edaGroupSort, (row) => groupRowSortValue(row, _edaGroupSort.key));
  mount.innerHTML = renderGroupMetricsTableInner(flatRows, groupCols);
}
function restoreEdaGroupValueFilter(selectedMap) {
  if (!selectedMap) return;
  const groupCols = resolveEdaGroupCols(S.lastDataAnalysis?.eda);
  for (const col of groupCols) {
    const pickerId = edaGroupValuePickerId(col);
    if (!CP().getPickerSpec(pickerId)) continue;
    const sel = selectedMap[col];
    if (sel !== undefined) CP().applySelection(pickerId, sel, { notify: false });
  }
  refreshGroupMetricsTable();
  renderEdaDistCharts();
}
function restoreGroupFilterSelection(selected) {
  if (!selected?.length || !CP().getPickerSpec("edaDisplayVar")) return;
  CP().applySelection("edaDisplayVar", selected, { notify: false });
  syncEdaDisplayVarFilters();
}
function renderEdaGroupMetricsTable(metricsByVar, groupCols) {
  if (!groupCols?.length || !metricsByVar.some((m) => m.groups.length)) return "";
  const groupValueFilter = null;
  const flatRows = flattenEdaGroupMetrics(metricsByVar, groupCols, groupValueFilter);
  let html = `<div class="da-section da-group-section rv-result-card"><h3 class="rv-heading-with-hint">分组明细（${esc(formatGroupLabels(groupCols))}）${hintBadgeHtml("分组筛行；变量筛联动分布图")}</h3>`;
  html += `<div class="summary-trend-filters da-eda-result-filters">
    <div id="daEdaResultFilterBar" class="summary-trend-filter-bar"></div>
  </div>`;
  html += `<div id="daGroupMetricsMount">${renderGroupMetricsTableInner(flatRows, groupCols)}</div>`;
  html += `</div>`;
  return html;
}
function filterDistSpecGroups(spec, groupCols, groupValueFilter) {
  if (!spec?.groups?.length) return { ...spec, groups: [] };
  const groups = spec.groups.filter((g) => edaGroupRowMatches(g.groupParts, groupCols, groupValueFilter));
  return { ...spec, groups };
}
function renderEdaDistCharts() {
  const mount = $("daDistChartsMount");
  const eda = S.lastDataAnalysis?.eda;
  if (!mount || !eda?.distSpecs?.length) return;
  mount.innerHTML = "";
  const groupCols = resolveEdaGroupCols(eda);
  if (!groupCols.length) return;
  const hasVarFilter = !!($("daEdaResultFilterBar") && CP().getPickerSpec("edaDisplayVar"));
  const selected = hasVarFilter
    ? new Set(getGroupVarFilterChecked())
    : new Set(eda.distSpecs.map((d) => d.var));
  const groupValueFilter = collectEdaGroupValueFilter();
  const selectedSpecs = eda.distSpecs.filter((d) => selected.has(d.var));
  if (!selectedSpecs.length) {
    mount.innerHTML = '<p class="config-muted">请至少勾选一个分析变量以展示分布图</p>';
    return;
  }
  const defaultN = C.DEFAULT_DIST_CHARTS || 3;
  if (eda.distChartsShown == null) eda.distChartsShown = Math.min(defaultN, selectedSpecs.length);
  const shown = Math.min(eda.distChartsShown, selectedSpecs.length);
  const toShow = selectedSpecs.slice(0, shown);
  for (const d of toShow) {
    const item = document.createElement("div");
    item.className = "dist-chart-item";
    mount.appendChild(item);
    renderGroupDistChart(item, filterDistSpecGroups(d, groupCols, groupValueFilter));
  }
  if (shown < selectedSpecs.length) {
    const more = document.createElement("div");
    more.className = "batch-actions-inline";
    more.style.marginTop = ".5rem";
    more.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" id="daDistLoadMore">加载更多分布图（已显示 ${shown}/${selectedSpecs.length}）</button>`;
    mount.appendChild(more);
  }
}

async function loadMoreEdaDistCharts() {
  const eda = S.lastDataAnalysis?.eda;
  if (!eda?.distSpecs?.length) return;
  const step = C.DEFAULT_DIST_CHARTS || 3;
  eda.distChartsShown = (eda.distChartsShown || step) + step;
  await new Promise((r) => setTimeout(r, 0));
  renderEdaDistCharts();
}

function renderEdaGroupDistSection(eda) {
  if (!resolveEdaGroupCols(eda).length) return "";
  return `<div class="da-section da-group-dist-section rv-result-card"><h3 class="rv-heading-with-hint">分组变量分布（重叠折线）${hintBadgeHtml(`组内占比 · 等宽 ${C.HIST_BINS || 20} 箱中点连线（取值少则枚举）· 悬停看该箱各组明细 · 默认前 ${C.DEFAULT_DIST_CHARTS || 3} 变量`)}</h3>`
    + `<div id="daDistChartsMount" class="dist-charts-grid"></div></div>`;
}
function renderEdaResultsHtml(eda, base) {
  let html = renderMiningSuggestChipsHtml(eda?.metricsByVar);
  html += renderCorrelationTable(eda.vars, eda.correlation);
  html += renderEdaOverviewTable(eda.missingStats, eda.metricsByVar);
  html += renderEdaGroupMetricsTable(eda.metricsByVar, resolveEdaGroupCols(eda));
  html += renderEdaGroupDistSection(eda);
  return html;
}

function renderMiningSuggestChipsHtml(metricsByVar) {
  const suggested = recommendMiningVars(metricsByVar, { ivMin: 0.02, psiMax: 0.25, topN: 10 });
  S._daMineSuggestedCols = suggested.map((r) => r.col);
  if (!suggested.length) {
    return `<div class="da-section da-mine-suggest rv-result-card" id="daMineSuggestBar"><p class="config-muted" style="margin:0;font-size:.78rem">建议挖规变量：暂无（需 IV≥0.02；有分组时另需 PSI≤0.25）。先运行 EDA。</p></div>`;
  }
  let html = `<div class="da-section da-mine-suggest rv-result-card" id="daMineSuggestBar">`;
  html += `<h3 class="rv-heading-with-hint" style="margin:0 0 .35rem;font-size:.9rem">建议挖规变量${hintBadgeHtml("IV 优先；点击加入扫描列表")}</h3>`;
  html += `<div class="da-mine-suggest-chips">`;
  for (const r of suggested) {
    const psiTip = r.psiChecked ? ` · maxPSI ${fmtMetric(r.maxPsi)}` : " · 未检PSI";
    html += `<button type="button" class="btn btn-secondary btn-sm da-mine-suggest-chip" data-mine-col="${esc(r.col)}" title="IV ${fmtMetric(r.iv)}${esc(psiTip)}">`;
    html += `${esc(r.col)} <span class="config-muted">IV ${fmtMetric(r.iv)}${r.psiChecked ? "" : " ·未检PSI"}</span></button>`;
  }
  html += `</div></div>`;
  return html;
}

function setDaMineStatus(msg, kind) {
  const el = $("daMineStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function refreshDaMineVarChecks(preferredCols) {
  if (!CP().getPickerSpec("daMineVar")) return;
  const prev = getMineVarSelection();
  const selected = preferredCols != null
    ? (preferredCols || []).filter((c) => (S.numCols || []).includes(c))
    : prev.filter((c) => (S.numCols || []).includes(c));
  CP().initPicker("daMineVar", S.numCols || [], {
    defaultChecked: false,
    selected,
    listLayout: true,
  });
  refreshDaConfigPanelSummaries();
}

function applySuggestedMineVars() {
  const cols = S._daMineSuggestedCols?.length
    ? S._daMineSuggestedCols
    : recommendMiningVars(S.lastDataAnalysis?.eda?.metricsByVar, { ivMin: 0.02, psiMax: 0.25, topN: 10 }).map((r) => r.col);
  if (!cols.length) {
    setDaMineStatus("暂无建议变量，请先运行 EDA", "warn");
    return;
  }
  refreshDaMineVarChecks(cols);
  setDaMineStatus(`已填入 ${cols.length} 个建议变量`, "ok");
}

function applyEdaSelectedMineVars() {
  const cols = getEdaVarSelection();
  if (!cols.length) {
    setDaMineStatus("EDA 尚未勾选变量", "warn");
    return;
  }
  const numCols = cols.filter((c) => (S.numCols || []).includes(c));
  refreshDaMineVarChecks(numCols);
  setDaMineStatus(`已填入 EDA 已选 ${numCols.length} 列`, "ok");
}

function ensureValidityTabForCandidates() {
  try {
    RV.app.orchestrator.ensureTabMounted?.("validity");
  } catch (_) { /* ignore */ }
  if ($("rvCustomRules")) return true;
  try {
    RV.ui.report.validity.initValidityTab?.(RV.ui.report.analysis.getAnalysisGroupDimensionCandidates?.() || []);
  } catch (_) { /* ignore */ }
  if ($("rvCustomRules")) return true;
  if ($("tab-validity")) {
    try {
      RV.ui.report.validity.mountValidityTabShell?.();
      RV.ui.report.validity.setupValidityTabShell?.(RV.ui.report.analysis.getAnalysisGroupDimensionCandidates?.() || []);
    } catch (_) { /* ignore */ }
  }
  return !!($("rvCandidateRuleRows") || $("rvCustomRules"));
}

function forEachCustomRuleCard(fn) {
  const host = $("rvCandidateRuleRows") || $("rvCustomRules");
  if (!host) return;
  host.querySelectorAll(".rule-config-row, .rv-custom-rule-card").forEach((n) => fn(n));
}

function existingCustomRootKeys() {
  const keys = new Set();
  const collectExpr = RV.ui.ruleExpr?.collectExprFromEl;
  forEachCustomRuleCard((card) => {
    try {
      const root = collectExpr?.(card.querySelector?.(".expr-group"));
      if (root) {
        keys.add(stableRootKey(root));
        return;
      }
    } catch (_) { /* fall through to stamp */ }
    const stamped = card.dataset?.rootKey || card.getAttribute?.("data-root-key");
    if (stamped) keys.add(stamped);
  });
  if (keys.size) return keys;
  try {
    const rules = RV.ui.report.validity.collectCustomRulesFromUI?.() || [];
    for (const r of rules) {
      if (r?.root) keys.add(stableRootKey(r.root));
    }
  } catch (_) { /* ignore */ }
  return keys;
}

/** @returns {{ ok: boolean, reason?: string, duplicate?: boolean }} */
function addValidityCandidateFromPreset(preset) {
  if (!preset?.root) return { ok: false, reason: "empty" };
  if (!ensureValidityTabForCandidates()) {
    RV.events?.notify?.("有效性 Tab 未就绪，请先打开规则有效性", "warn");
    return { ok: false, reason: "no_mount" };
  }
  const add = RV.ui.report.validity.addCustomRuleCard;
  if (!add) return { ok: false, reason: "no_api" };
  const key = stableRootKey(preset.root);
  if (existingCustomRootKeys().has(key)) {
    return { ok: false, reason: "duplicate", duplicate: true };
  }
  const card = add(preset);
  if (!card) {
    RV.events?.notify?.("写入候选失败：有效性候选区未挂载", "warn");
    return { ok: false, reason: "append_failed" };
  }
  if (card.dataset) card.dataset.rootKey = key;
  else if (card.setAttribute) card.setAttribute("data-root-key", key);
  if (S.lastValidityAnalysis) RV.ui.report.validity.markValidityResultsStale?.();
  RV.events?.refreshProvenanceBar?.();
  return { ok: true };
}

const INVERT_FAIL_LABELS = {
  empty: "无规则表达式",
  already_or: "已是 OR 表达式，无法再取反",
  already_complement: "已是拒补集",
  no_numeric: "无数值条件可取反",
  unsupported_child: "含不支持的条件类型",
  unsupported_root: "不支持的规则结构",
  invert_failed: "算子取反失败",
};

function resolveAdoptMineTarget(spec) {
  if (spec?.mineTarget === "quality" || spec?.mineTarget === "risk") return spec.mineTarget;
  return getMineTarget();
}

/**
 * Unified adopt: risk writes slice as-is; quality inverts to reject complement (方案 C).
 * @returns {{ ok: boolean, duplicate?: boolean, reason?: string, preset?: object, mineTarget: string }}
 */
function adoptCandidateSpec(spec) {
  const mineTarget = resolveAdoptMineTarget(spec);
  const toReject = RV.domain.ruleMining.toRejectComplementPreset;
  let preset = null;
  if (mineTarget === "quality" && typeof toReject === "function") {
    const inv = toReject(spec?.root ? { root: spec.root, label: spec.label || spec.name, name: spec.name } : spec);
    if (!inv?.ok) {
      return {
        ok: false,
        reason: INVERT_FAIL_LABELS[inv?.reason] || inv?.reason || "取反失败",
        mineTarget,
      };
    }
    preset = inv.preset;
  } else if (spec?.root) {
    preset = { name: spec.label || spec.name || "候选规则", root: spec.root, openEditor: false, isHard: false };
  } else {
    preset = numericSpecToCandidatePreset(spec);
  }
  if (!preset) return { ok: false, reason: "无法生成规则", mineTarget };
  preset.isHard = false;
  const res = addValidityCandidateFromPreset(preset);
  return {
    ok: !!res.ok,
    duplicate: !!res.duplicate,
    reason: res.duplicate ? "候选已存在" : (res.reason || undefined),
    preset,
    mineTarget,
  };
}

function addMineRowsToCandidates(rows) {
  let n = 0;
  let dup = 0;
  let fail = 0;
  const failReasons = [];
  let mineTarget = getMineTarget();
  for (const spec of rows || []) {
    const res = adoptCandidateSpec(spec);
    mineTarget = res.mineTarget || mineTarget;
    if (res.ok) n++;
    else if (res.duplicate) dup++;
    else {
      fail++;
      if (res.reason) failReasons.push(res.reason);
    }
  }
  return { added: n, duplicates: dup, failed: fail, mineTarget, failReasons };
}

function renderMineResultsTable(candidates) {
  const el = $("daMineResults");
  if (!el) return;
  const mineTarget = getMineTarget();
  if (!candidates?.length) {
    el.innerHTML = mineTarget === "quality"
      ? `<p class="config-muted">无满足条件的切点（可提高最大 Lift / 降低命中率后重试）</p>`
      : `<p class="config-muted">无满足条件的切点（可降低最小 Lift / 命中率后重试）</p>`;
    return;
  }
  S._daMineCandidates = candidates;
  const topLabel = mineTarget === "quality" ? "加入拒补集 Top 5" : "加入 Lift Top 5";
  let html = `<div class="rv-result-card"><div class="batch-actions-inline" style="margin-bottom:.35rem">`;
  html += `<button type="button" class="btn btn-secondary btn-sm" id="daMineAddSelected">加入勾选到有效性候选</button>`;
  html += `<button type="button" class="btn btn-secondary btn-sm" id="daMineAddTop5">${topLabel}</button>`;
  html += `</div>`;
  if (mineTarget === "quality") {
    html += `<h4 class="rv-heading-with-hint" style="margin:0 0 .35rem;font-size:.9rem">找好人结果${hintBadgeHtml("低 Lift 好切片；加入候选自动取反")}</h4>`;
  }
  const recallTh = mineTarget === "quality" ? "好客户占比" : "召回";
  html += `<div class="table-interactive-wrap"><table class="data-table" id="daMineResultTable"><thead><tr>`;
  html += `<th></th><th>来源</th><th>变量</th><th>方向</th><th>阈值</th><th>命中数</th><th>命中率</th><th>坏账率</th><th>Lift</th><th>${recallTh}</th><th>规则</th><th></th>`;
  html += `</tr></thead><tbody>`;
  candidates.forEach((c, i) => {
    const sym = c.operator
      ? ({ gte: "≥", gt: ">", lte: "≤", lt: "<" }[c.operator] || c.operator)
      : "区间";
    const src = c.source === "bin" ? "分箱" : "扫描";
    const recallCell = mineTarget === "quality"
      ? pct(c.badRate != null ? 1 - c.badRate : null)
      : pct(c.recall);
    html += `<tr data-mine-idx="${i}">`;
    html += `<td><input type="checkbox" class="da-mine-row-cb" data-mine-idx="${i}" /></td>`;
    html += `<td>${esc(src)}</td><td>${esc(c.column)}</td><td>${esc(sym)}</td>`;
    html += `<td class="num">${c.threshold != null ? fmtNum(c.threshold) : "—"}</td>`;
    html += `<td class="num">${c.hitCount}</td><td class="num">${pct(c.hitRate)}</td>`;
    html += `<td class="num">${pct(c.badRate)}</td><td class="num">${fmtMetric(c.lift)}</td>`;
    html += `<td class="num">${recallCell}</td><td>${esc(c.label)}</td>`;
    html += `<td><button type="button" class="btn btn-secondary btn-sm da-mine-add-one" data-mine-idx="${i}">${mineTarget === "quality" ? "加入拒补集" : "加入候选"}</button></td>`;
    html += `</tr>`;
  });
  html += `</tbody></table></div></div>`;
  el.innerHTML = html;
  refreshMineGroupTrend();
}

function getMineGroupCols() {
  const cols = getMineGroupColSelection();
  if (CP().getPickerSpec("daMineGroup")) {
    const max = C.MAX_DA_GROUP_COLS || 3;
    if (cols.length <= max) return cols;
    const kept = cols.slice(0, max);
    CP().applySelection("daMineGroup", kept, { notify: false });
    setDaMineStatus(`挖规分组变量最多 ${max} 个，已保留前 ${max} 个`, "warn");
    return kept;
  }
  return enforceGroupColLimit(cols, {
    hostId: "daMineGroupColChecks",
    statusFn: setDaMineStatus,
    label: "挖规分组变量",
  });
}

function enforceGroupColLimit(cols, { hostId, statusFn, label } = {}) {
  const max = C.MAX_DA_GROUP_COLS || 3;
  if (!cols?.length || cols.length <= max) return cols || [];
  const kept = cols.slice(0, max);
  const host = hostId ? $(hostId) : null;
  if (host) {
    host.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      if (cb.checked && !kept.includes(cb.value)) cb.checked = false;
    });
  }
  if (typeof statusFn === "function") {
    statusFn(`${label || "分组变量"}最多 ${max} 个，已保留前 ${max} 个`, "warn");
  }
  return kept;
}

function renderMineTrendTableHtml(trend, groupCols, { truncated = false, total = 0 } = {}) {
  if (!groupCols?.length) {
    return `<p class="config-muted">勾选上方分组变量后，将按规则 × 分组展示命中率 / 坏账率 / Lift（相对该组基线坏账率）</p>`;
  }
  if (!trend?.length) {
    return `<p class="config-muted">暂无分组趋势（请先扫描切点或分箱边界评分）</p>`;
  }
  const groupThs = groupCols.map((c) => `<th>${esc(c)}</th>`).join("");
  const trendTip = `Lift=组内/整体坏账率；${getMineTarget() === "quality" ? "找好人取反写候选" : "找坏人看 Lift>1"}；改分组自动重算`;
  let html = `<h4 class="rv-heading-with-hint" style="margin:0 0 .35rem;font-size:.9rem">候选分组趋势（规则 × ${esc(formatGroupLabels(groupCols))}）${hintBadgeHtml(trendTip)}</h4>`;
  if (truncated) {
    html += `<p class="status warn" style="font-size:.78rem;margin:0 0 .35rem">行数过多已截断展示前 ${trend.length} / ${total} 行（上限 ${C.MAX_MINE_TREND_ROWS}）</p>`;
  }
  html += `<table class="data-table trend-table" id="daMineTrendTable"><thead><tr>`;
  html += `<th>规则</th>${groupThs}<th>组内样本</th><th>命中数</th><th>命中率</th><th>坏账率</th><th>组基线坏账率</th><th>Lift</th>`;
  html += `</tr></thead><tbody>`;
  for (const t of trend) {
    const parts = t.groupParts || [t.group];
    html += `<tr><td>${esc(t.ruleLabel)}</td>`;
    for (let i = 0; i < groupCols.length; i++) html += `<td>${esc(parts[i] ?? "")}</td>`;
    html += `<td class="num">${fmtNum(t.groupN)}</td>`;
    html += `<td class="num">${fmtNum(t.hitCount)}</td>`;
    html += `<td class="num">${pct(t.hitRate)}</td>`;
    html += `<td class="num">${pct(t.badRate)}</td>`;
    html += `<td class="num">${pct(t.groupBadRate)}</td>`;
    html += `<td class="num">${t.lift != null ? fmtMetric(t.lift) : "—"}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function refreshMineGroupTrend() {
  const mount = $("daMineTrendMount");
  if (!mount) return;
  const groupCols = getMineGroupCols();
  const candidates = S._daMineCandidates || S.lastDataAnalysis?.mine?.candidates || [];
  if (!groupCols.length) {
    mount.innerHTML = renderMineTrendTableHtml([], []);
    if (S.lastDataAnalysis?.mine) {
      S.lastDataAnalysis.mine.groupCols = [];
      S.lastDataAnalysis.mine.trend = [];
    }
    return;
  }
  if (!candidates.length) {
    mount.innerHTML = renderMineTrendTableHtml([], groupCols);
    return;
  }
  try {
    const base = S.lastDataAnalysis?.base || buildDaContext({ needPreRows: false, persist: false });
    const y = base.y || buildYVector(base.postRows, base.badSpec || resolveDaBadLabelSpec());
    const maxRows = C.MAX_MINE_TREND_ROWS || 500;
    const trend = computeMineCandidateGroupTrend(base.postRows, y, candidates, groupCols, { maxRows });
    const truncated = !!trend.truncated;
    const total = trend.total || trend.length;
    S.lastDataAnalysis = S.lastDataAnalysis || {};
    S.lastDataAnalysis.mine = {
      ...(S.lastDataAnalysis.mine || {}),
      candidates,
      groupCols,
      trend,
      trendTruncated: truncated,
      trendTotal: total,
    };
    mount.innerHTML = renderMineTrendTableHtml(trend, groupCols, { truncated, total });
  } catch (err) {
    mount.innerHTML = `<p class="status err">${esc(String(err?.message || err))}</p>`;
  }
}

function cancelRuleMineScan() {
  S._daMineScanToken = (S._daMineScanToken || 0) + 1;
  const cancelBtn = $("btnCancelRuleMine");
  if (cancelBtn) cancelBtn.disabled = true;
  setDaMineStatus("已取消扫描", "warn");
  const btn = $("btnRunRuleMine");
  if (btn) { btn.disabled = false; btn.textContent = "扫描切点"; }
}

function getMineTarget() {
  try {
    const q = typeof document !== "undefined" ? document.querySelector : null;
    if (typeof q !== "function") {
      return S.lastDataAnalysis?.mine?.mineTarget === "quality" ? "quality" : "risk";
    }
    const checked = q.call(document, 'input[name="daMineTarget"]:checked');
    return checked?.value === "quality" ? "quality" : "risk";
  } catch (_) {
    return S.lastDataAnalysis?.mine?.mineTarget === "quality" ? "quality" : "risk";
  }
}

function syncMineTargetUi({ applyDefaultThreshold = false } = {}) {
  const mineTarget = getMineTarget();
  const label = $("daMineLiftThresholdLabel");
  const input = $("daMineLiftThreshold");
  const hint = $("daMineTargetHint");
  if (label) {
    label.textContent = mineTarget === "quality"
      ? "最大 Lift（严格小于）"
      : "最小 Lift（严格大于）";
  }
  if (hint) {
    const tip = mineTarget === "quality"
      ? "找好人：低 Lift 切片，加入自动取反"
      : "找坏人：高 Lift 切片作拒人候选";
    hint.className = "rv-hint rv-tip-anchor";
    hint.setAttribute("data-rv-tip", tip);
    hint.setAttribute("tabindex", "0");
    hint.setAttribute("role", "img");
    hint.setAttribute("aria-label", `说明：${tip}`);
    hint.textContent = "ⓘ";
  }
  if (input && applyDefaultThreshold) {
    const v = Number(input.value);
    const atRiskDefault = !Number.isFinite(v) || Math.abs(v - 1.1) < 1e-9;
    const atQualityDefault = !Number.isFinite(v) || Math.abs(v - 0.9) < 1e-9;
    if (mineTarget === "quality" && atRiskDefault) input.value = "0.9";
    else if (mineTarget === "risk" && atQualityDefault) input.value = "1.1";
  }
}

function readMineScanOpts() {
  const mineTarget = getMineTarget();
  const thr = Number($("daMineLiftThreshold")?.value);
  const minHitRate = Number($("daMineMinHitRate")?.value);
  const topK = parseInt($("daMineTopK")?.value, 10);
  const minSamples = parseInt($("daMineMinSamples")?.value, 10);
  const maxCuts = parseInt($("daMineMaxCuts")?.value, 10);
  const opts = {
    mineTarget,
    minHitRate: Number.isFinite(minHitRate) ? minHitRate : 0.01,
    topKPerFeature: Number.isFinite(topK) ? topK : 3,
    minSamples: Number.isFinite(minSamples) ? minSamples : 30,
    maxCuts: Number.isFinite(maxCuts) ? maxCuts : 20,
  };
  if (mineTarget === "quality") {
    opts.maxLift = Number.isFinite(thr) ? thr : 0.9;
    opts.minLift = 1.1;
  } else {
    opts.minLift = Number.isFinite(thr) ? thr : 1.1;
    opts.maxLift = 0.9;
  }
  return opts;
}

function formatMineLiftFilterStatus(opts) {
  if (opts?.mineTarget === "quality") {
    return `Lift<${opts.maxLift}`;
  }
  return `Lift>${opts.minLift}`;
}

async function runRuleMineScan() {
  const btn = $("btnRunRuleMine");
  const cancelBtn = $("btnCancelRuleMine");
  const features = getMineVarSelection();
  if (!features.length) {
    setDaMineStatus("请先选择扫描变量", "warn");
    return;
  }
  const token = (S._daMineScanToken = (S._daMineScanToken || 0) + 1);
  if (btn) { btn.disabled = true; btn.textContent = "扫描中…"; }
  if (cancelBtn) cancelBtn.disabled = false;
  setDaMineStatus("正在准备样本…", "");
  try {
    const base = buildDaContext();
    const y = base.y || buildYVector(base.postRows, base.badSpec);
    const block = getScanBlockReason(base.postRows, y);
    if (block) {
      S.lastDataAnalysis = S.lastDataAnalysis || {};
      S.lastDataAnalysis.mine = { candidates: [], features, at: Date.now(), blocked: block };
      S._daMineCandidates = [];
      renderMineResultsTable([]);
      setDaMineStatus(block, "warn");
      return;
    }
    const opts = readMineScanOpts();
    const nRows = base.postRows.length;
    if (nRows >= 50000) {
      setDaMineStatus(`大样本 ${nRows.toLocaleString()} 行：按特征分批扫描，请稍候…`, "");
    }
    const candidates = [];
    for (let fi = 0; fi < features.length; fi++) {
      if (token !== S._daMineScanToken) {
        setDaMineStatus("已取消扫描", "warn");
        return;
      }
      setDaMineStatus(`已扫描 ${fi}/${features.length} · ${features[fi]}（${nRows.toLocaleString()} 行）· 已出候选 ${candidates.length}`, "");
      await new Promise((r) => setTimeout(r, 0));
      if (token !== S._daMineScanToken) {
        setDaMineStatus("已取消扫描", "warn");
        return;
      }
      const part = scanSingleFeatureThresholds(base.postRows, y, [features[fi]], opts);
      candidates.push(...part);
      setDaMineStatus(`已扫描 ${fi + 1}/${features.length} · 已出候选 ${candidates.length}`, "");
    }
    if (token !== S._daMineScanToken) {
      setDaMineStatus("已取消扫描", "warn");
      return;
    }
    candidates.sort((a, b) => {
      const cmp = RV.domain.ruleMining.compareCandidatesByTarget;
      return cmp ? cmp(a, b, opts.mineTarget) : ((b.lift - a.lift) || (b.recall - a.recall));
    });
    S.lastDataAnalysis = S.lastDataAnalysis || {};
    S.lastDataAnalysis.mine = { candidates, features, at: Date.now(), opts, mode: "scan", mineTarget: opts.mineTarget };
    clearDaResultsStale();
    renderMineResultsTable(candidates);
    collapseDaConfigAfterRun("mine");
    setDaMineStatus(`完成：${candidates.length} 条候选切点（${base.sampleScope === "residual_new_pass" ? "残差" : "全量"} · ${nRows.toLocaleString()} 行 · ${opts.mineTarget === "quality" ? "找好人" : "找坏人"} · ${formatMineLiftFilterStatus(opts)}）`, "ok");
  } catch (err) {
    setDaMineStatus(String(err?.message || err), "err");
    const el = $("daMineResults");
    if (el) el.innerHTML = `<p class="status err">${esc(String(err?.message || err))}</p>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "扫描切点"; }
    if (cancelBtn) cancelBtn.disabled = true;
  }
}

async function runBinEdgeScore() {
  const btn = $("btnScoreBinEdges");
  const binTables = S.lastDataAnalysis?.bin?.binTables;
  if (!binTables?.length) {
    setDaMineStatus("请先运行单变量分箱", "warn");
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "评分中…"; }
  setDaMineStatus("正在按分箱边界评分…", "");
  try {
    const base = buildDaContext();
    const y = base.y || buildYVector(base.postRows, base.badSpec);
    const block = getScanBlockReason(base.postRows, y);
    if (block) {
      setDaMineStatus(block, "warn");
      return;
    }
    const opts = readMineScanOpts();
    await new Promise((r) => setTimeout(r, 0));
    const scoreBinEdgesAsCandidates = RV.domain.ruleMining.scoreBinEdgesAsCandidates;
    const candidates = scoreBinEdgesAsCandidates(base.postRows, y, binTables, {
      mineTarget: opts.mineTarget,
      minLift: opts.minLift,
      maxLift: opts.maxLift,
      minHitRate: opts.minHitRate,
      minSamples: opts.minSamples,
    });
    S.lastDataAnalysis = S.lastDataAnalysis || {};
    S.lastDataAnalysis.mine = { candidates, at: Date.now(), opts, mode: "bin_edges", mineTarget: opts.mineTarget };
    clearDaResultsStale();
    renderMineResultsTable(candidates);
    collapseDaConfigAfterRun("mine");
    setDaMineStatus(`分箱边界评分完成：${candidates.length} 条（与分箱表同一区间 · ${opts.mineTarget === "quality" ? "找好人" : "找坏人"} · ${formatMineLiftFilterStatus(opts)}）`, "ok");
  } catch (err) {
    setDaMineStatus(String(err?.message || err), "err");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "用已跑分箱边界评分"; }
  }
}

function generateRuleFromBinRow(varName, binLabel, stratKey) {
  const bin = S.lastDataAnalysis?.bin;
  const tables = bin?.binTables || [];
  const hasStratKey = stratKey != null && String(stratKey) !== "";
  const slice = hasStratKey
    ? tables.find((t) => t.var === varName && String(t.stratKey) === String(stratKey))
    : tables.find((t) => t.var === varName && !(t.stratCols && t.stratCols.length));
  if (!slice?.rule) {
    setDaBinStatus("未找到分箱切片，请先运行分箱", "warn");
    return;
  }
  if (!isDrillableBinLabel(binLabel, slice.rule)) {
    setDaBinStatus("缺失/负数箱请用有效性枚举条件手配", "warn");
    return;
  }
  const interval = findIntervalByLabel(slice.rule, binLabel);
  if (!interval) {
    setDaBinStatus("未找到该分箱区间", "warn");
    return;
  }
  const idx = findIntervalIndexByLabel(slice.rule, binLabel);
  const isLast = idx >= 0 && idx === (slice.rule.intervals || []).length - 1;
  const stratParts = (slice.stratCols || []).length ? (slice.stratParts || null) : null;
  const preset = binIntervalToCandidatePreset(varName, interval, binLabel, {
    isLastInterval: isLast,
    stratParts,
  });
  if (!preset) {
    setDaBinStatus("无法生成规则表达式", "err");
    return;
  }
  const mineTarget = getMineTarget();
  const res = adoptCandidateSpec({
    root: preset.root,
    label: preset.name,
    name: preset.name,
    mineTarget,
  });
  if (!res.ok) {
    if (res.duplicate) {
      setDaBinStatus(`候选已存在：${res.preset?.name || preset.name}`, "warn");
      RV.events?.notify?.(`候选已存在：${res.preset?.name || preset.name}`, "warn");
    } else {
      const msg = res.reason || "写入候选失败";
      setDaBinStatus(msg, "err");
      RV.events?.notify?.(msg, "warn");
    }
    return;
  }
  const outName = res.preset?.name || preset.name;
  const tip = mineTarget === "quality" ? "（拒补集）" : "";
  setDaBinStatus(`已加入候选${tip}：${outName}`, "ok");
  RV.events?.notify?.(`已加入候选${tip}：${outName}`, "ok");
}
function updateEdaResults(opts) {
  const el = $("daEdaResults");
  if (!el || !S.lastDataAnalysis?.eda) return;
  const initial = !!(opts && opts.initial);
  const pending = S.pendingDaImport || {};
  const pendingGroupFilter = pending.groupFilterVars;
  const pendingGroupValueFilter = pending.groupValueFilter;
  const pendingDist = pending.distSelected;
  if (pendingGroupFilter || pendingGroupValueFilter || pendingDist) S.pendingDaImport = null;
  el.innerHTML = renderEdaResultsHtml(S.lastDataAnalysis.eda, S.lastDataAnalysis.base);
  const groupCols = resolveEdaGroupCols(S.lastDataAnalysis.eda);
  buildEdaResultFilterBar(
    S.lastDataAnalysis.eda.metricsByVar,
    groupCols,
    pendingGroupValueFilter,
    pendingGroupFilter
  );
  // Tables already embedded in renderEdaResultsHtml; only re-refresh on filter-driven updates
  if (!initial) {
    refreshEdaOverviewTable();
  }
  refreshGroupMetricsTable();
  renderEdaDistCharts();
  bindEdaTableSortHandlers(el);
  initResizableTables(el);
}
function updateBinResults() {
  const el = $("daBinResults");
  if (!el || !S.lastDataAnalysis?.bin) return;
  const pendingBinVar = S.pendingDaImport?.binVarSelected;
  const pendingStratFilter = S.pendingDaImport?.stratValueFilter;
  const pendingBinDrill = S.pendingDaImport?.binDrilldowns || S.pendingDaImport?.binDrilldown;
  const pendingCrossStratFilter = S.pendingDaImport?.crossStratValueFilter;
  if (S.pendingDaImport && (pendingBinVar != null || pendingStratFilter != null || pendingBinDrill != null || pendingCrossStratFilter != null)) {
    delete S.pendingDaImport.binVarSelected;
    delete S.pendingDaImport.stratValueFilter;
    delete S.pendingDaImport.binDrilldown;
    delete S.pendingDaImport.binDrilldowns;
    delete S.pendingDaImport.crossStratValueFilter;
    if (!Object.keys(S.pendingDaImport).length) S.pendingDaImport = null;
  }
  const binHint = renderBinHintTip(S.lastDataAnalysis.bin);
  el.innerHTML = `<div class="da-section-card da-track-uni">
      <h3 class="rv-heading-with-hint">单变量分箱结果${hintBadgeHtml(binHint)}</h3>
      <div class="summary-trend-filters da-bin-result-filters">
        <div id="daBinResultFilterBar" class="summary-trend-filter-bar"></div>
      </div>
      <div id="daBinSummaryMount"></div>
      <div id="daBinTablesMount"></div>
      <div id="daBinFootnote" class="da-bin-footnote"></div>
    </div>
    <div id="daCrossBinSection" class="da-section-card da-track-cross">
      <h3>二维交叉分箱结果（${esc(S.lastDataAnalysis.bin.cross2d?.xVar || "X")} × ${esc(S.lastDataAnalysis.bin.cross2d?.yVar || "Y")}）</h3>
      <div id="daCrossBinSummary" class="metric-cards"></div>
      <div id="daCrossStratValueFilter" class="dist-filter-bar"></div>
      <div id="daCrossBinTablesMount"></div>
    </div>`;
  const footnoteEl = $("daBinFootnote");
  if (footnoteEl) footnoteEl.innerHTML = renderBinFootnoteHtml(S.lastDataAnalysis.bin);
  buildBinResultFilterBar(
    S.lastDataAnalysis.bin.vars,
    S.lastDataAnalysis.bin.binTables,
    S.lastDataAnalysis.bin.stratCols || [],
    pendingBinVar,
    pendingStratFilter
  );
  buildCrossStratValueFilter(
    S.lastDataAnalysis.bin.cross2d?.tables || [],
    S.lastDataAnalysis.bin.cross2d?.stratCols || [],
    pendingCrossStratFilter
  );
  refreshBinTables();
  refreshCrossBinTables();
  const crossSection = $("daCrossBinSection");
  const hasCross = !!S.lastDataAnalysis.bin.cross2d?.tables?.length;
  if (crossSection) {
    if (!hasCross) {
      $("daCrossBinSummary").innerHTML = "";
      $("daCrossBinTablesMount").innerHTML = `<p class="config-muted">请配置 X/Y 后单独点击「运行二维交叉分箱」</p>`;
      crossSection.style.display = "none";
    } else {
      crossSection.style.display = "";
    }
  }
  if (!S.lastDataAnalysis.bin.binTables?.length) {
    const uniMount = $("daBinTablesMount");
    if (uniMount) uniMount.innerHTML = `<p class="config-muted">请配置分箱变量后点击「运行单变量分箱」</p>`;
  }
  if (pendingBinDrill) restoreBinDrilldowns(pendingBinDrill);
}
function renderAnalysisTabShell() {
  return `<section id="tab-analysis"><h2 class="rv-heading-with-hint">数据分析${hintBadgeHtml("贷后样本+风险比率；路径 EDA → 分箱 → 挖规，可分轨重跑")}</h2>
    <p class="rv-wb-path-hint config-muted">三区：① EDA（分布/IV）→ ② 分箱（单变量/交叉）→ ③ 挖规（切点扫描）；公共配置共用贷后样本</p>
    <div id="daStaleBanner" class="rv-stale-banner" role="status">
      <span>配置已变，结果可能过期。</span>
      <button type="button" class="btn btn-secondary btn-sm" data-da-rerun="eda">重跑 EDA</button>
      <button type="button" class="btn btn-secondary btn-sm" data-da-rerun="bin">重跑分箱</button>
      <button type="button" class="btn btn-secondary btn-sm" data-da-rerun="mine">重扫切点</button>
    </div>
    <div class="rv-wb-zone rv-wb-config">
      <div class="rv-wb-zone-label">配置与运行</div>
    <div class="da-panel-stack">
      <div class="da-config-panel da-shared-panel is-collapsed" id="daSharedPanel">
        <div class="da-panel-header" data-config-panel-toggle="daSharedPanel" role="button" tabindex="0">
          <span class="da-panel-title-text">公共配置${hintBadgeHtml("共用贷后样本与风险比率口径")}</span>
          <span class="da-panel-summary" id="daSharedPanelSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
          <div class="config-grid">
            <div>
              <label>Y 标签（坏样本）</label>
              <select id="daBadMode">
                <option value="numerator">第 1 个风险比率分子列 &gt; 0</option>
                <option value="manual">手动指定列 + 阈值</option>
              </select>
              <p id="daBadNumeratorHint" class="config-muted" style="font-size:.75rem;margin:.25rem 0"></p>
              <div id="daBadColumnPickers" style="display:none">
                <label>坏样本列</label>
                <select id="daBadCol"></select>
                <label>阈值（坏样本 = 列值 &gt; 阈值）</label>
                <input type="number" id="daBadThreshold" value="0" step="any" />
              </div>
            </div>
            <div>
              <label>${withHintHtml("样本范围", "残差剔硬规则+候选命中；切换需重跑")}</label>
              <select id="daSampleScope">
                <option value="full">全量贷后样本</option>
                <option value="residual_new_pass">残差：未命中硬规则∪有效性候选</option>
              </select>
            </div>
          </div>
          <p id="daSharedSummary" class="da-shared-summary config-muted" hidden></p>
        </div>
      </div>

      <div class="da-config-panel da-eda-panel" id="daEdaPanel">
        <div class="da-panel-header" data-config-panel-toggle="daEdaPanel" role="button" tabindex="0">
          <span class="da-panel-num">1</span>
          <span class="da-panel-title-text">① EDA · 数值变量${hintBadgeHtml("默认 p3_/reb_ 列；改配置后点「运行 EDA 分析」")}</span>
          <span class="da-panel-summary" id="daEdaPanelSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
          <div class="da-eda-config-toolbar">
            <div class="da-eda-config-field da-eda-config-field--vars">
              <span class="da-eda-config-label">${withHintHtml("分析变量", "默认 p3_/reb_；改后点运行")}</span>
              ${CP().renderChromeHtml("daEdaVar", {
                selectedId: "daEdaVarSelected",
                toggleId: "daEdaVarPickerToggle",
                pickerId: "daEdaVarPicker",
                checksId: "daEdaVarChecks",
                metaId: "daEdaVarMeta",
                searchId: "daEdaVarSearch",
                selectedOnlyId: "daEdaVarSelectedOnly",
                showAllColumnsId: "daEdaVarShowAll",
                showAllColumnsLabel: "显示全部列",
                selectAllClass: "rv-collapsed-picker-select-all",
                clearAllClass: "rv-collapsed-picker-clear-all",
                searchPlaceholder: "搜索列名…",
                toggleAdd: "添加变量 ▾",
                showToolbar: true,
                metaInPanel: true,
                popover: true,
                listLayout: true,
              })}
            </div>
            <div class="da-eda-config-field da-eda-config-field--group">
              <span class="da-eda-config-label">${withHintHtml("分组标签", "不选不分组；最多 3 个；改后点运行")}</span>
              ${CP().renderChromeHtml("daEdaGroup", {
                selectedId: "daEdaGroupSelected",
                toggleId: "daEdaGroupPickerToggle",
                pickerId: "daEdaGroupPicker",
                checksId: "daGroupColChecks",
                metaId: "daGroupColMeta",
                searchId: "daGroupColSearch",
                selectedOnlyId: "daEdaGroupSelectedOnly",
                selectAllClass: "rv-collapsed-picker-select-all",
                clearAllClass: "rv-collapsed-picker-clear-all",
                searchPlaceholder: "搜索列名…",
                toggleAdd: "添加标签 ▾",
                showToolbar: true,
                metaInPanel: true,
                popover: true,
                listLayout: true,
              })}
            </div>
            <div class="da-eda-config-field da-eda-config-field--iv">
              <span class="da-eda-config-label">${withHintHtml("IV箱", "3～20；改后点运行")}</span>
              <div class="da-iv-stepper" role="group" aria-label="IV 分箱数">
                <button type="button" class="btn btn-secondary btn-sm" id="daIvBinsDec" aria-label="减少">−</button>
                <input type="number" id="daIvBins" value="5" min="3" max="20" />
                <button type="button" class="btn btn-secondary btn-sm" id="daIvBinsInc" aria-label="增加">+</button>
              </div>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="btnRunEdaAnalysis" disabled>运行 EDA 分析</button>
        <p id="daEdaStatus" class="status" style="min-height:1.25rem"></p>
        <div id="daEdaResults"><p class="da-results-placeholder">配置变量后点击「运行 EDA 分析」</p></div>
      </div>

      <div class="da-config-panel da-bin-panel" id="daBinPanel">
        <div class="da-panel-header" data-config-panel-toggle="daBinPanel" role="button" tabindex="0">
          <span class="da-panel-num">2</span>
          <span class="da-panel-title-text">② 分箱分析${hintBadgeHtml("查单调性与 Lift；可切二维交叉子 Tab")}</span>
          <span class="da-panel-summary" id="daBinPanelSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
          <div class="da-track-tabs">
            <button type="button" class="da-track-tab active" data-track="uni" aria-selected="true">单变量分箱 <span class="da-track-chip da-track-chip-uni">主流程</span></button>
            <button type="button" class="da-track-tab" data-track="cross" aria-selected="false">二维交叉分箱 <span class="da-track-chip da-track-chip-cross">高级可选</span></button>
          </div>
          <input type="hidden" id="daBinTrackMode" value="uni" />

          <div id="daBinUniTrack" class="da-track-panel da-track-uni">
            <div class="da-bin-config-toolbar">
              <div class="da-bin-config-field da-bin-config-field--vars">
                <span class="da-bin-config-label">${withHintHtml("分箱变量", "默认 p3_/reb_/xgb_；独立于 EDA")}</span>
                ${CP().renderChromeHtml("daBinVar", {
                  selectedId: "daBinVarSelected",
                  toggleId: "daBinVarPickerToggle",
                  pickerId: "daBinVarPicker",
                  checksId: "daBinVarChecks",
                  metaId: "daBinVarMeta",
                  searchId: "daBinVarSearch",
                  selectedOnlyId: "daBinVarSelectedOnly",
                  showAllColumnsId: "daBinVarShowAll",
                  showAllColumnsLabel: "显示全部列",
                  selectAllClass: "rv-collapsed-picker-select-all",
                  clearAllClass: "rv-collapsed-picker-clear-all",
                  searchPlaceholder: "搜索列名…",
                  toggleAdd: "添加变量 ▾",
                  showToolbar: true,
                  metaInPanel: true,
                  popover: true,
                  listLayout: true,
                })}
              </div>
              <div class="da-bin-config-field da-bin-config-field--strat">
                <span class="da-bin-config-label">${withHintHtml("分层变量", "可选；最多 3 个；切点仍按全量贷后")}</span>
                ${CP().renderChromeHtml("daBinStrat", {
                  selectedId: "daBinStratSelected",
                  toggleId: "daBinStratPickerToggle",
                  pickerId: "daBinStratPicker",
                  checksId: "daBinStratColChecks",
                  metaId: "daBinStratColMeta",
                  searchId: "daBinStratColSearch",
                  selectedOnlyId: "daBinStratSelectedOnly",
                  selectAllClass: "rv-collapsed-picker-select-all",
                  clearAllClass: "rv-collapsed-picker-clear-all",
                  searchPlaceholder: "搜索列名…",
                  toggleAdd: "添加分层 ▾",
                  showToolbar: true,
                  metaInPanel: true,
                  popover: true,
                  listLayout: true,
                })}
              </div>
              <div class="da-bin-config-field da-bin-config-field--mode">
                <span class="da-bin-config-label">分箱方式</span>
                <select id="daBinMode">
                  <option value="equal_freq">分母加权等频</option>
                  <option value="custom_share">自定义占比</option>
                  <option value="manual_thresholds">手动阈值</option>
                </select>
              </div>
              <div class="da-bin-config-field da-bin-config-field--count" id="daBinCountField">
                <span class="da-bin-config-label">${withHintHtml("分箱数", "2～20")}</span>
                <div class="da-iv-stepper da-bin-stepper" role="group" aria-label="分箱数">
                  <button type="button" class="btn btn-secondary btn-sm" id="daBinCountDec" aria-label="减少">−</button>
                  <input type="number" id="daBinCount" value="5" min="2" max="20" />
                  <button type="button" class="btn btn-secondary btn-sm" id="daBinCountInc" aria-label="增加">+</button>
                </div>
              </div>
            </div>
            <div id="daBinSharePanel" class="config-full da-bin-mode-subpanel" style="margin-top:.75rem;display:none">
              <label>各箱贷后分母占比（%，合计须为 100；每箱 &gt; 0）</label>
              <div id="daBinSharesWrap"></div>
              <p id="daBinShareMeta" class="config-muted" style="font-size:.78rem;margin:.25rem 0 0"></p>
            </div>
            <div id="daBinManualPanel" class="config-full da-bin-mode-subpanel" style="margin-top:.75rem;display:none">
              <label>手动分箱阈值（每行：变量名: 切点1,切点2,...；若仅选 1 个分箱变量，可直接填写切点）</label>
              <div class="da-bin-manual-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="btnBinManualAutofill">从当前等频回填切点</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnBinManualTemplate">按已选变量生成模板</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnBinManualFormat">按变量格式化</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnBinManualPreview">刷新切点预览</button>
              </div>
              <div class="da-bin-manual-editor">
                <textarea id="daBinManualThresholds" class="da-bin-manual-textarea" rows="7" placeholder="例如：\np3_score:\n  0.15, 0.32, 0.57\nreb_score:\n  120, 240, 360"></textarea>
                <div id="daBinManualVarHint" class="da-bin-manual-side"></div>
              </div>
              <p id="daBinManualMeta" class="config-muted" style="font-size:.78rem;margin:.25rem 0 0"></p>
              <div id="daBinManualPreviewMount"></div>
            </div>
            <button type="button" class="btn btn-primary" id="btnRunBinAnalysis" disabled style="margin-top:.65rem">运行单变量分箱</button>
            <span id="daBinRunModeHint" class="rv-hint rv-tip-anchor" data-rv-tip="仅跑单变量分箱" tabindex="0" role="img" aria-label="说明">ⓘ</span>
          </div>

          <div id="daBinCrossTrack" class="da-track-panel da-track-cross" style="display:none">
            <div class="da-cross-config-toolbar">
              <div class="da-cross-config-field da-cross-config-field--xvar">
                <span class="da-cross-config-label">${withHintHtml("X 变量", "数值列；与 Y 不同")}</span>
                <select id="daCrossXVar"></select>
              </div>
              <div class="da-cross-config-field da-cross-config-field--xbins">
                <span class="da-cross-config-label">${withHintHtml("X 分箱数", "2～20")}</span>
                <div class="da-iv-stepper" role="group" aria-label="X 分箱数">
                  <button type="button" class="btn btn-secondary btn-sm" id="daCrossXBinsDec" aria-label="减少">−</button>
                  <input type="number" id="daCrossXBinCount" value="5" min="2" max="20" />
                  <button type="button" class="btn btn-secondary btn-sm" id="daCrossXBinsInc" aria-label="增加">+</button>
                </div>
              </div>
              <div class="da-cross-config-field da-cross-config-field--yvar">
                <span class="da-cross-config-label">${withHintHtml("Y 变量", "数值列；与 X 不同")}</span>
                <select id="daCrossYVar"></select>
              </div>
              <div class="da-cross-config-field da-cross-config-field--ybins">
                <span class="da-cross-config-label">${withHintHtml("Y 分箱数", "2～20")}</span>
                <div class="da-iv-stepper" role="group" aria-label="Y 分箱数">
                  <button type="button" class="btn btn-secondary btn-sm" id="daCrossYBinsDec" aria-label="减少">−</button>
                  <input type="number" id="daCrossYBinCount" value="5" min="2" max="20" />
                  <button type="button" class="btn btn-secondary btn-sm" id="daCrossYBinsInc" aria-label="增加">+</button>
                </div>
              </div>
              <div class="da-cross-config-field da-cross-config-field--group">
                <span class="da-cross-config-label">${withHintHtml("分组变量", "可选；最多 3 个；切片交叉热区")}</span>
                ${CP().renderChromeHtml("daCrossGroup", {
                  selectedId: "daCrossGroupSelected",
                  toggleId: "daCrossGroupPickerToggle",
                  pickerId: "daCrossGroupPicker",
                  checksId: "daCrossGroupColChecks",
                  metaId: "daCrossGroupColMeta",
                  searchId: "daCrossGroupColSearch",
                  selectedOnlyId: "daCrossGroupSelectedOnly",
                  selectAllClass: "rv-collapsed-picker-select-all",
                  clearAllClass: "rv-collapsed-picker-clear-all",
                  searchPlaceholder: "搜索列名…",
                  toggleAdd: "添加分组 ▾",
                  showToolbar: true,
                  metaInPanel: true,
                  popover: true,
                  listLayout: true,
                })}
              </div>
            </div>
            <div class="da-cross-actions">
              <button type="button" class="btn btn-primary" id="btnRunCrossBinAnalysis" disabled>运行二维交叉分箱</button>
              <span id="daCrossBinRunModeHint" class="rv-hint rv-tip-anchor" data-rv-tip="仅跑二维交叉分箱" tabindex="0" role="img" aria-label="说明">ⓘ</span>
            </div>
          </div>
        </div>
        <p id="daBinStatus" class="status" style="min-height:1.25rem"></p>
        <div id="daBinResults"><p class="da-results-placeholder">分别配置并运行单变量 / 二维交叉分箱</p></div>
      </div>

      <div class="da-config-panel da-mine-panel" id="daMinePanel">
        <div class="da-panel-header" data-config-panel-toggle="daMinePanel" role="button" tabindex="0">
          <span class="da-panel-num">3</span>
          <span class="da-panel-title-text">③ 挖规 · 规则候选推荐${hintBadgeHtml("扫切点比 Lift；可复用分箱边界")}</span>
          <span class="da-panel-summary" id="daMinePanelSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
          <div class="da-mine-config-vars">
            <div class="da-mine-config-field da-mine-config-field--vars">
              <span class="da-mine-config-label">${withHintHtml("扫描变量", "默认 p3_/reb_；可用建议或 EDA 已选快速填入")}</span>
              <div class="da-mine-quick-fill">
                <button type="button" class="btn btn-secondary btn-sm" id="daMineUseSuggested">用建议挖规变量</button>
                <button type="button" class="btn btn-secondary btn-sm" id="daMineUseEdaSelected">用 EDA 已选</button>
              </div>
              ${CP().renderChromeHtml("daMineVar", {
                selectedId: "daMineVarSelected",
                toggleId: "daMineVarPickerToggle",
                pickerId: "daMineVarPicker",
                checksId: "daMineVarChecks",
                metaId: "daMineVarMeta",
                searchId: "daMineVarSearch",
                selectedOnlyId: "daMineVarSelectedOnly",
                showAllColumnsId: "daMineVarShowAll",
                showAllColumnsLabel: "显示全部列",
                selectAllClass: "rv-collapsed-picker-select-all",
                clearAllClass: "rv-collapsed-picker-clear-all",
                searchPlaceholder: "搜索列名…",
                toggleAdd: "添加变量 ▾",
                showToolbar: true,
                metaInPanel: true,
                popover: true,
                listLayout: true,
              })}
            </div>
            <div class="da-mine-config-field da-mine-config-field--group">
              <span class="da-mine-config-label">${withHintHtml("分组变量", "可选；最多 3 个；用于候选分组趋势")}</span>
              ${CP().renderChromeHtml("daMineGroup", {
                selectedId: "daMineGroupSelected",
                toggleId: "daMineGroupPickerToggle",
                pickerId: "daMineGroupPicker",
                checksId: "daMineGroupColChecks",
                metaId: "daMineGroupColMeta",
                searchId: "daMineGroupColSearch",
                selectedOnlyId: "daMineGroupSelectedOnly",
                selectAllClass: "rv-collapsed-picker-select-all",
                clearAllClass: "rv-collapsed-picker-clear-all",
                searchPlaceholder: "搜索列名…",
                toggleAdd: "添加分组 ▾",
                showToolbar: true,
                metaInPanel: true,
                popover: true,
                listLayout: true,
              })}
            </div>
          </div>
          <div class="da-mine-config-params">
            <div class="da-mine-config-field da-mine-config-field--target">
              <span class="da-mine-config-label rv-heading-with-hint">目标模式<span id="daMineTargetHint" class="rv-hint rv-tip-anchor" data-rv-tip="找坏人：高 Lift 切片作拒人候选" tabindex="0" role="img" aria-label="说明">ⓘ</span></span>
              <div class="da-mine-target-seg" role="group" aria-label="目标模式">
                <label class="da-mine-target-opt">
                  <input type="radio" name="daMineTarget" id="daMineTargetRisk" value="risk" checked />
                  <span>找坏人（高 Lift）</span>
                </label>
                <label class="da-mine-target-opt">
                  <input type="radio" name="daMineTarget" id="daMineTargetQuality" value="quality" />
                  <span>找好人（低 Lift）</span>
                </label>
              </div>
            </div>
            <div class="da-mine-config-field da-mine-config-field--lift">
              <span class="da-mine-config-label" id="daMineLiftThresholdLabel">最小 Lift（严格大于）</span>
              <div class="da-iv-stepper" role="group" aria-label="Lift 阈值">
                <button type="button" class="btn btn-secondary btn-sm" id="daMineLiftDec" aria-label="减少">−</button>
                <input type="number" id="daMineLiftThreshold" value="1.1" min="0" step="0.05" />
                <button type="button" class="btn btn-secondary btn-sm" id="daMineLiftInc" aria-label="增加">+</button>
              </div>
            </div>
            <div class="da-mine-config-field da-mine-config-field--topk">
              <span class="da-mine-config-label">${withHintHtml("每特征 Top K", "1～20")}</span>
              <div class="da-iv-stepper" role="group" aria-label="每特征 Top K">
                <button type="button" class="btn btn-secondary btn-sm" id="daMineTopKDec" aria-label="减少">−</button>
                <input type="number" id="daMineTopK" value="3" min="1" max="20" step="1" />
                <button type="button" class="btn btn-secondary btn-sm" id="daMineTopKInc" aria-label="增加">+</button>
              </div>
            </div>
            <div class="da-mine-config-field da-mine-config-field--param">
              <span class="da-mine-config-label">${withHintHtml("最小命中率", "0～1")}</span>
              <input type="number" id="daMineMinHitRate" value="0.01" min="0" max="1" step="0.01" />
            </div>
            <div class="da-mine-config-field da-mine-config-field--param">
              <span class="da-mine-config-label">${withHintHtml("最小命中样本数", "≥5")}</span>
              <div class="da-iv-stepper" role="group" aria-label="最小命中样本数">
                <button type="button" class="btn btn-secondary btn-sm" id="daMineMinSamplesDec" aria-label="减少">−</button>
                <input type="number" id="daMineMinSamples" value="30" min="5" step="1" />
                <button type="button" class="btn btn-secondary btn-sm" id="daMineMinSamplesInc" aria-label="增加">+</button>
              </div>
            </div>
            <div class="da-mine-config-field da-mine-config-field--param">
              <span class="da-mine-config-label">${withHintHtml("最大切点数", "4～50")}</span>
              <div class="da-iv-stepper" role="group" aria-label="最大切点数">
                <button type="button" class="btn btn-secondary btn-sm" id="daMineMaxCutsDec" aria-label="减少">−</button>
                <input type="number" id="daMineMaxCuts" value="20" min="4" max="50" step="1" />
                <button type="button" class="btn btn-secondary btn-sm" id="daMineMaxCutsInc" aria-label="增加">+</button>
              </div>
            </div>
          </div>
          <div class="da-mine-actions">
            <button type="button" class="btn btn-primary" id="btnRunRuleMine" disabled>扫描切点</button>
            <button type="button" class="btn btn-secondary" id="btnCancelRuleMine" disabled>取消扫描</button>
            <button type="button" class="btn btn-secondary" id="btnScoreBinEdges" title="需先运行单变量分箱；读取已跑区间边界，在当前工作样本上计 Lift（非重新分箱、非扫描切点）">用已跑分箱边界评分</button>
          </div>
        </div>
        <p id="daMineStatus" class="status" style="min-height:1.25rem"></p>
        <div id="daMineResults"><p class="da-results-placeholder">选择变量后点击「扫描切点」；或先跑单变量分箱再「用已跑分箱边界评分」</p></div>
        <div id="daMineTrendMount" style="margin-top:.75rem"></div>
      </div>
    </div>
    </div>
  </section>`;
}

function ensureBinDrilldowns(bin) {
  if (!bin) return {};
  if (!bin.drilldowns || typeof bin.drilldowns !== "object" || Array.isArray(bin.drilldowns)) {
    bin.drilldowns = {};
  }
  if (bin.drilldown?.var && !bin.drilldowns[bin.drilldown.var]) {
    bin.drilldowns[bin.drilldown.var] = bin.drilldown;
  }
  return bin.drilldowns;
}
function serializeBinDrilldownsForConfig(bin) {
  const map = ensureBinDrilldowns(bin);
  const out = {};
  for (const [varName, d] of Object.entries(map)) {
    if (!d?.parentLabel) continue;
    out[varName] = {
      parentLabel: d.parentLabel,
      subNBins: d.subNBins ?? C.DEFAULT_BIN_DRILL_SUB_NBINS,
    };
  }
  return Object.keys(out).length ? out : null;
}
function pickLegacyBinDrilldown(bin, drilldownsMap) {
  const map = drilldownsMap || ensureBinDrilldowns(bin);
  const last = bin?.drilldownLastVar;
  if (last && map[last]?.parentLabel) {
    return { var: last, parentLabel: map[last].parentLabel, subNBins: map[last].subNBins };
  }
  const firstKey = Object.keys(map)[0];
  if (!firstKey) return null;
  return {
    var: firstKey,
    parentLabel: map[firstKey].parentLabel,
    subNBins: map[firstKey].subNBins,
  };
}
function normalizeSavedDrilldowns(saved) {
  /** @returns {{ var: string, parentLabel: string, subNBins?: number }[]} */
  if (!saved) return [];
  if (saved.var && saved.parentLabel) {
    return [{ var: saved.var, parentLabel: saved.parentLabel, subNBins: saved.subNBins }];
  }
  const out = [];
  for (const [varName, d] of Object.entries(saved)) {
    if (!d || typeof d !== "object") continue;
    const parentLabel = d.parentLabel || d.parent;
    if (!parentLabel) continue;
    out.push({ var: varName, parentLabel, subNBins: d.subNBins });
  }
  return out;
}
function applyBinDrilldown(varName, parentLabel, subNBins, { skipRefresh = false, scroll = true } = {}) {
  if (isExportMode()) {
    setDaBinStatus("导出 HTML 分箱钻取为生成时快照，不支持重新钻取", "warn");
    return;
  }
  const bin = S.lastDataAnalysis?.bin;
  const base = S.lastDataAnalysis?.base;
  const stratFilterMap = getBinStratValueFilterState();
  const candidates = bin?.binTables
    ? collectDrillStratSlices(bin.binTables, varName, parentLabel, stratFilterMap)
    : [];
  if (!bin?.binTables || !base) {
    setDaBinStatus("钻取失败：请先运行分箱分析", "err");
    return;
  }
  if (!candidates.length) {
    setDaBinStatus("钻取失败：当前分层值筛选下未找到匹配的父箱", "err");
    return;
  }
  if (!isDrillableBinLabel(parentLabel, candidates[0].rule)) return;
  let n = parseInt(subNBins, 10);
  if (!Number.isFinite(n)) n = C.DEFAULT_BIN_DRILL_SUB_NBINS;
  const drilldowns = ensureBinDrilldowns(bin);
  const drill = computeBinDrilldownMulti(
    base.postRows,
    base.preRows || [],
    base.hardRules || [],
    base.softRules || [],
    bin.binTables,
    varName,
    parentLabel,
    n,
    base.ratioSpec,
    base.overallRisk.rate,
    stratFilterMap,
    bin.stratCols || []
  );
  drilldowns[varName] = drill;
  bin.drilldownLastVar = varName;
  bin.drilldown = drill;
  if (!skipRefresh) {
    refreshBinTables();
    if (scroll) scrollToBinVarBlock(varName);
  }
}
function clearBinDrilldown(varName) {
  if (isExportMode()) {
    setDaBinStatus("导出 HTML 分箱钻取为生成时快照，不支持清除/重算", "warn");
    return;
  }
  const bin = S.lastDataAnalysis?.bin;
  if (!bin) return;
  const drilldowns = ensureBinDrilldowns(bin);
  if (varName) {
    delete drilldowns[varName];
    if (bin.drilldownLastVar === varName) bin.drilldownLastVar = Object.keys(drilldowns)[0] || null;
  } else {
    bin.drilldowns = {};
    bin.drilldownLastVar = null;
  }
  bin.drilldown = bin.drilldownLastVar ? (ensureBinDrilldowns(bin)[bin.drilldownLastVar] || null) : null;
  refreshBinTables();
}
function scrollToBinVarBlock(varName) {
  if (!varName) return;
  const el = [...document.querySelectorAll(".da-bin-var-block")]
    .find((n) => n.getAttribute("data-var") === varName);
  el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function renderBinDrillPanelHtml(drill, { varName } = {}) {
  if (!drill) return "";
  const v = varName || drill.var || "";
  const exportMode = isExportMode();
  const subNBins = drill.subNBins ?? C.DEFAULT_BIN_DRILL_SUB_NBINS;
  const stratCols = drill.stratCols || [];
  const totalParentRows = drill.parentRowCount
    ?? (drill.slices || []).reduce((s, sl) => s + (sl.parentRowCount || 0), 0);
  const stratHint = stratCols.length
    ? "父箱统一切点，按分组展示"
    : "无分组，全样本切分展示";
  let html = `<div class="da-bin-drill-block" data-var="${esc(v)}">
    <p class="da-bin-drill-title rv-heading-with-hint">钻取分箱（父箱分母加权等频）${hintBadgeHtml(`${stratHint}；父箱 ${totalParentRows.toLocaleString()} 行`)}</p>
    <p class="da-bin-drill-path">路径：${esc(formatBinDrillPath(drill))} · 子分箱</p>
    <div class="da-bin-drill-actions">`;
  if (exportMode) {
    html += `<span class="config-muted">导出快照：子分箱数 ${esc(String(subNBins))}（仅展示，不支持重算）</span>`;
  } else {
    html += `<label>子分箱数 <input type="number" class="da-bin-drill-sub-nbins" value="${subNBins}" min="2" max="20" step="1" /></label>
      <button type="button" class="btn btn-secondary btn-sm da-bin-drill-apply">应用</button>
      <button type="button" class="btn btn-secondary btn-sm da-bin-drill-clear">清除钻取</button>`;
  }
  html += `</div>`;
  if (drill.error) {
    html += `<p class="status err" style="margin:.35rem 0">${esc(drill.error)}</p>`;
  }
  const flatRows = flattenDrillSliceRows(drill);
  if (flatRows.length) {
    const pseudoSlices = (drill.slices || []).map((s) => ({ stratKey: s.stratKey, rows: s.rows }));
    const scales = binScalesByStrat(pseudoSlices);
    html += `<p class="da-bin-drill-subtitle">子分箱明细</p>`;
    html += `<table class="data-table"><thead><tr>`;
    for (const col of stratCols) html += `<th>${esc(col)}</th>`;
    html += `<th>子分箱</th><th>分子Σ</th><th>分母Σ</th><th>分母占比</th><th>比率</th><th>Lift</th><th>进件占比</th><th>贷前进件Σ</th><th>命中占比</th><th>命中进件Σ</th><th>未命中占比</th><th>未命中进件Σ</th>
    </tr></thead><tbody>`;
    for (const r of flatRows) {
      const sc = scales[r.stratKey] || { rate: { min: 0, max: 0 }, lift: { min: 0, max: 0 } };
      const hasPost = r.hasPostStrat !== false;
      const denShareTxt = hasPost ? fmtBinSharePct(r.denSharePct) : "—";
      const preApplyShareTxt = fmtBinSharePct(r.preApplySharePct);
      const preHitShareTxt = fmtBinSharePct(r.preRuleHitSharePct);
      const preMissShareTxt = fmtBinSharePct(r.preRuleMissSharePct);
      html += `<tr>`;
      for (const col of stratCols) html += `<td>${esc(String(r.stratParts?.[col] ?? ""))}</td>`;
      html += `<td>${esc(r.label)}</td>
        <td class="num">${fmtBinPostNum(r.num, hasPost)}</td>
        <td class="num">${fmtBinPostNum(r.den, hasPost)}</td>
        <td${hasPost ? metricHeatCell(r.denSharePct, sc.denShare) : ""}>${renderDashWithReason(denShareTxt, denShareReason(r, hasPost))}</td>
        <td${hasPost ? metricHeatCell(r.rate, sc.rate) : ""}>${fmtBinPostRate(r.rate, hasPost)}</td>
        <td${hasPost ? metricHeatCell(r.lift, sc.lift) : ""}>${hasPost && r.lift != null ? fmtMetric(r.lift) : (hasPost ? "N/A" : "—")}</td>
        <td${metricHeatCell(r.preApplySharePct, sc.preApplyShare)}>${renderDashWithReason(preApplyShareTxt, preApplyShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preApplyVol)}</td>
        <td${metricHeatCell(r.preRuleHitSharePct, sc.preRuleHitShare)}>${renderDashWithReason(preHitShareTxt, preHitShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preRuleHitApplyVol)}</td>
        <td${metricHeatCell(r.preRuleMissSharePct, sc.preRuleMissShare)}>${renderDashWithReason(preMissShareTxt, preMissShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preRuleMissApplyVol)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}
function groupBinTablesByVar(tables) {
  const map = new Map();
  for (const t of tables) {
    if (!map.has(t.var)) map.set(t.var, []);
    map.get(t.var).push(t);
  }
  return map;
}
function binScalesByStrat(sliceTables) {
  const map = {};
  for (const t of sliceTables) {
    const key = t.stratKey ?? "__all__";
    const rates = t.rows.map((r) => r.rate).filter((v) => v != null && Number.isFinite(v));
    const lifts = t.rows.map((r) => r.lift).filter((v) => v != null && Number.isFinite(v));
    const denShares = t.rows.map((r) => r.denSharePct).filter((v) => v != null && Number.isFinite(v) && v > 0);
    const preShares = t.rows.map((r) => r.preApplySharePct).filter((v) => v != null && Number.isFinite(v) && v > 0);
    const preHitShares = t.rows.map((r) => r.preRuleHitSharePct).filter((v) => v != null && Number.isFinite(v) && v > 0);
    const preMissShares = t.rows.map((r) => r.preRuleMissSharePct).filter((v) => v != null && Number.isFinite(v) && v > 0);
    map[key] = {
      rate: rates.length ? { min: Math.min(...rates), max: Math.max(...rates) } : { min: 0, max: 0 },
      lift: lifts.length ? { min: Math.min(...lifts), max: Math.max(...lifts) } : { min: 0, max: 0 },
      denShare: denShares.length ? { min: Math.min(...denShares), max: Math.max(...denShares) } : { min: 0, max: 0 },
      preApplyShare: preShares.length ? { min: Math.min(...preShares), max: Math.max(...preShares) } : { min: 0, max: 0 },
      preRuleHitShare: preHitShares.length ? { min: Math.min(...preHitShares), max: Math.max(...preHitShares) } : { min: 0, max: 0 },
      preRuleMissShare: preMissShares.length ? { min: Math.min(...preMissShares), max: Math.max(...preMissShares) } : { min: 0, max: 0 },
    };
  }
  return map;
}
function flattenBinVarRows(sliceTables) {
  const stratCols = sliceTables[0]?.stratCols || [];
  const sorted = [...sliceTables].sort((a, b) => {
    const ka = a.stratKey === "__all__" ? "全部" : a.stratKey;
    const kb = b.stratKey === "__all__" ? "全部" : b.stratKey;
    return compareGroupKeys(ka, kb, stratCols);
  });
  const flat = [];
  for (const t of sorted) {
    for (const r of t.rows) {
      flat.push({ stratParts: t.stratParts, stratKey: t.stratKey, ...r });
    }
  }
  return flat;
}
function getBinStratValueFilterState() {
  const stratCols = S.lastDataAnalysis?.bin?.stratCols || [];
  if (!stratCols.length || !$("daBinResultFilterBar")) return {};
  return CP().getDimFilterMap(stratCols, binStratValuePickerId);
}
function collectBinStratValueFilter() {
  const stratCols = S.lastDataAnalysis?.bin?.stratCols || [];
  if (!stratCols.length || !$("daBinResultFilterBar")) return null;
  return CP().collectDimFilterState(stratCols, binStratValuePickerId);
}
function getCrossStratValueFilterState() {
  const map = {};
  document.querySelectorAll("#daCrossStratValueFilter input[type=checkbox]").forEach((cb) => {
    const col = cb.dataset.col;
    if (!col) return;
    if (!map[col]) map[col] = new Set();
    if (cb.checked) map[col].add(cb.value);
  });
  return map;
}
function collectCrossStratValueFilter() {
  const bar = $("daCrossStratValueFilter");
  if (!bar) return null;
  const map = {};
  bar.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    const col = cb.dataset.col;
    if (!col || !cb.checked) return;
    if (!map[col]) map[col] = [];
    map[col].push(cb.value);
  });
  return Object.keys(map).length ? map : null;
}
function collectStratValuesFromBinTables(binTables, stratCols) {
  const map = {};
  for (const col of stratCols) map[col] = new Set();
  for (const t of binTables || []) {
    for (const col of stratCols) {
      if (t.stratParts?.[col] != null) map[col].add(String(t.stratParts[col]));
    }
  }
  return map;
}
function collectStratValuesFromCrossTables(crossTables, stratCols) {
  const map = {};
  for (const col of stratCols) map[col] = new Set();
  for (const t of crossTables || []) {
    for (const col of stratCols) {
      if (t.stratParts?.[col] != null) map[col].add(String(t.stratParts[col]));
    }
  }
  return map;
}
const BIN_DISPLAY_VAR_FILTER_ID = "daBinDisplayVar";

function getCollapsibleVarFilterChecked(idBase) {
  const host = $(`${idBase}Checks`);
  return host ? getChecked(host) : [];
}
function updateCollapsibleVarFilterMeta(idBase) {
  const meta = $(`${idBase}Meta`);
  const host = $(`${idBase}Checks`);
  if (!meta || !host) return;
  const total = host.querySelectorAll("input[type=checkbox]").length;
  const selected = getCollapsibleVarFilterChecked(idBase).length;
  const q = ($(`${idBase}Search`)?.value || "").trim();
  const selectedOnly = !!$(`${idBase}SelectedOnly`)?.checked;
  let visible = 0;
  host.querySelectorAll("label").forEach((lab) => {
    if (lab.style.display !== "none") visible++;
  });
  let text = total ? `已选 ${selected} / ${total}` : "无变量";
  if (total && (q || selectedOnly)) text += ` · 显示 ${visible}`;
  meta.textContent = text;
}
function applyCollapsibleVarFilterVisibility(idBase) {
  const host = $(`${idBase}Checks`);
  if (!host) return;
  const q = ($(`${idBase}Search`)?.value || "").trim().toLowerCase();
  const selectedOnly = !!$(`${idBase}SelectedOnly`)?.checked;
  host.querySelectorAll("label").forEach((lab) => {
    const cb = lab.querySelector("input[type=checkbox]");
    const text = (cb?.value || lab.textContent || "").toLowerCase();
    const show = (!q || text.includes(q)) && (!selectedOnly || !!cb?.checked);
    lab.style.display = show ? "" : "none";
  });
  updateCollapsibleVarFilterMeta(idBase);
}
function buildCollapsibleVarFilter(mountEl, {
  idBase,
  label,
  vars,
  selected,
  defaultAll = true,
  onChange,
  checksExtraClass = "",
  autoOpenMaxVars = 8,
}) {
  if (!mountEl) return;
  if (!vars?.length) {
    mountEl.innerHTML = "";
    return;
  }
  const selectedSet = selected?.length
    ? new Set(selected)
    : (defaultAll ? new Set(vars) : new Set(vars.slice(0, C.DEFAULT_BIN_VARS_SHOWN)));
  mountEl.innerHTML = `<div class="da-group-var-filter da-display-var-filter">
    <div class="da-group-var-filter-bar">
      <span class="filter-label">${esc(label)}：</span>
      <span id="${idBase}Meta" class="config-muted da-group-var-filter-meta"></span>
      <button type="button" class="btn btn-secondary btn-sm ${idBase}-select-all">全选</button>
      <button type="button" class="btn btn-secondary btn-sm ${idBase}-clear-all">清空</button>
      <button type="button" class="btn btn-secondary btn-sm ${idBase}-toggle" aria-expanded="false">选择 ▾</button>
    </div>
    <div id="${idBase}Panel" class="da-group-var-filter-panel" hidden>
      <div class="chk-toolbar" style="margin-bottom:.35rem;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem">
        <input type="search" id="${idBase}Search" class="chk-filter-input" placeholder="搜索变量…" autocomplete="off" style="flex:1;min-width:8rem" />
        <label class="rv-collapsed-picker-selected-only" style="font-size:.78rem;font-weight:normal;white-space:nowrap">
          <input type="checkbox" id="${idBase}SelectedOnly" /> 仅看已选
        </label>
      </div>
      <div id="${idBase}Checks" class="chk-grid rv-collapsed-picker-grid da-group-var-filter-checks ${checksExtraClass}"></div>
    </div>
  </div>`;
  const checksHost = $(`${idBase}Checks`);
  if (!checksHost) return;
  CP().populateChecks(checksHost, vars, { idPrefix: idBase });
  checksHost.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = selectedSet.has(cb.value);
    cb.addEventListener("change", () => {
      applyCollapsibleVarFilterVisibility(idBase);
      onChange?.();
    });
  });
  $(`${idBase}Search`)?.addEventListener("input", () => applyCollapsibleVarFilterVisibility(idBase));
  $(`${idBase}SelectedOnly`)?.addEventListener("change", () => applyCollapsibleVarFilterVisibility(idBase));
  applyCollapsibleVarFilterVisibility(idBase);
  if (vars.length <= autoOpenMaxVars) {
    const panel = $(`${idBase}Panel`);
    const toggle = mountEl.querySelector(`.${idBase}-toggle`);
    if (panel) panel.hidden = false;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "选择 ▴";
    }
  }
}
function getBinDisplayVarChecked() {
  if (CP().getPickerSpec("binDisplayVar") && $("daBinResultFilterBar")) {
    return CP().getPickerSelection("binDisplayVar");
  }
  return getCollapsibleVarFilterChecked(BIN_DISPLAY_VAR_FILTER_ID);
}
function bindCollapsibleVarFilterActions(idBase, onChange) {
  const selectAll = document.querySelector(`.${idBase}-select-all`);
  const clearAll = document.querySelector(`.${idBase}-clear-all`);
  const toggle = document.querySelector(`.${idBase}-toggle`);
  selectAll?.addEventListener("click", () => {
    const host = $(`${idBase}Checks`);
    host?.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = true; });
    applyCollapsibleVarFilterVisibility(idBase);
    onChange?.();
  });
  clearAll?.addEventListener("click", () => {
    const host = $(`${idBase}Checks`);
    host?.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    applyCollapsibleVarFilterVisibility(idBase);
    onChange?.();
  });
  toggle?.addEventListener("click", () => {
    const panel = $(`${idBase}Panel`);
    if (!panel || !toggle) return;
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "选择 ▴" : "选择 ▾";
  });
}

function buildBinResultFilterBar(vars, binTables, stratCols, selectedVars, selectedMap) {
  const bar = $("daBinResultFilterBar");
  if (!bar) return;
  bar.innerHTML = "";
  const varList = vars || [];
  let html = "";
  if (varList.length) {
    html += `<div class="summary-trend-filter" data-dim="__vars__">`;
    html += CP().renderDimBlockHtml("binDisplayVar", {
      dimLabel: "展示变量",
      valuesContainerClass: "bin-display-var-filter-values",
    });
    html += `</div>`;
  }
  const valueMap = collectStratValuesFromBinTables(binTables, stratCols || []);
  for (const col of stratCols || []) {
    const vals = [...(valueMap[col] || [])].sort(compareDimValue);
    if (!vals.length) continue;
    const pickerId = binStratValuePickerId(col);
    html += `<div class="summary-trend-filter" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "bin-strat-value-filter-values",
    });
    html += `</div>`;
  }
  if (html) {
    html += `<div class="summary-trend-filter-actions">
      <button type="button" class="btn btn-secondary btn-sm bin-result-select-all">全选</button>
      <button type="button" class="btn btn-secondary btn-sm bin-result-clear-all">清空</button>
    </div>`;
  }
  bar.innerHTML = html;

  if (varList.length) {
    registerBinDisplayVarPicker();
    CP().initDimPicker("binDisplayVar", {
      values: varList,
      selected: selectedVars?.length ? selectedVars : varList,
    });
  }
  for (const col of stratCols || []) {
    const vals = [...(valueMap[col] || [])].sort(compareDimValue);
    if (!vals.length) continue;
    registerBinStratValuePicker(col);
    const saved = selectedMap?.[col];
    CP().initDimPicker(binStratValuePickerId(col), {
      values: vals,
      selected: saved !== undefined ? saved : vals,
    });
  }
}
function buildBinVarFilter(vars, selected) {
  buildBinResultFilterBar(
    vars,
    S.lastDataAnalysis?.bin?.binTables,
    S.lastDataAnalysis?.bin?.stratCols || [],
    selected,
    null
  );
}
function buildBinStratValueFilter(binTables, stratCols, selectedMap) {
  buildBinResultFilterBar(
    S.lastDataAnalysis?.bin?.vars || [],
    binTables,
    stratCols,
    getBinDisplayVarChecked(),
    selectedMap
  );
}
function buildCrossStratValueFilter(crossTables, stratCols, selectedMap) {
  const bar = $("daCrossStratValueFilter");
  if (!bar) return;
  bar.innerHTML = "";
  if (!stratCols?.length) return;
  const valueMap = collectStratValuesFromCrossTables(crossTables, stratCols);
  bar.appendChild(Object.assign(document.createElement("span"), { className: "filter-label", textContent: "二维分组筛选：" }));
  const wrap = document.createElement("div");
  wrap.className = "dist-filter-chks";
  for (const col of stratCols) {
    const vals = [...valueMap[col]].sort(compareDimValue);
    if (!vals.length) continue;
    const group = document.createElement("div");
    group.style.marginRight = "0.75rem";
    group.appendChild(Object.assign(document.createElement("span"), {
      className: "config-muted",
      textContent: col + " ",
      style: "font-weight:600;margin-right:.25rem",
    }));
    for (const val of vals) {
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.col = col;
      cb.value = val;
      const sel = selectedMap?.[col];
      cb.checked = sel?.length ? sel.includes(val) : true;
      cb.addEventListener("change", () => refreshCrossBinTables());
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(val));
      group.appendChild(lab);
    }
    wrap.appendChild(group);
  }
  bar.appendChild(wrap);
}
function restoreBinDrilldown(saved) {
  restoreBinDrilldowns(saved);
}
function restoreBinDrilldowns(saved) {
  const entries = normalizeSavedDrilldowns(saved);
  if (!entries.length || !S.lastDataAnalysis?.bin?.binTables) return;
  let lastVar = null;
  for (const e of entries) {
    applyBinDrilldown(e.var, e.parentLabel, e.subNBins, { skipRefresh: true, scroll: false });
    lastVar = e.var;
  }
  refreshBinTables();
  if (lastVar) scrollToBinVarBlock(lastVar);
}
function restoreBinDisplayFilters(priorState) {
  if (priorState?.binVarSelected?.length && CP().getPickerSpec("binDisplayVar")) {
    CP().applySelection("binDisplayVar", priorState.binVarSelected, { notify: false });
  } else if (priorState?.binVarSelected?.length && $("daBinDisplayVarChecks")) {
    const selected = new Set(priorState.binVarSelected);
    document.querySelectorAll("#daBinDisplayVarChecks input[type=checkbox]").forEach((cb) => {
      cb.checked = selected.has(cb.value);
    });
    applyCollapsibleVarFilterVisibility(BIN_DISPLAY_VAR_FILTER_ID);
  }
  if (priorState?.stratValueFilter) {
    const stratCols = S.lastDataAnalysis?.bin?.stratCols || [];
    for (const col of stratCols) {
      const pickerId = binStratValuePickerId(col);
      if (!CP().getPickerSpec(pickerId)) continue;
      const sel = priorState.stratValueFilter[col];
      if (sel !== undefined) CP().applySelection(pickerId, sel, { notify: false });
    }
  }
  if (priorState?.crossStratValueFilter && $("daCrossStratValueFilter")) {
    document.querySelectorAll("#daCrossStratValueFilter input[type=checkbox]").forEach((cb) => {
      const col = cb.dataset.col;
      const sel = priorState.crossStratValueFilter[col];
      if (sel?.length) cb.checked = sel.includes(cb.value);
    });
  }
  refreshBinTables();
  refreshCrossBinTables();
  if (priorState?.binDrilldowns) restoreBinDrilldowns(priorState.binDrilldowns);
  else if (priorState?.binDrilldown) restoreBinDrilldowns(priorState.binDrilldown);
}
function renderBinTablesHtml(tables, { varsShown, stratFilterMap, drilldowns, requireVarsShown } = {}) {
  if (!tables.length) return `<p class="config-muted">未选择分箱变量</p>`;
  const exportMode = isExportMode();
  const drills = drilldowns && typeof drilldowns === "object" ? drilldowns : {};
  const allowVar = (varName) => {
    if (requireVarsShown) return !!(varsShown && varsShown.has(varName));
    return !(varsShown?.size && !varsShown.has(varName));
  };
  let html = "";
  for (const [varName, sliceTables] of groupBinTablesByVar(tables)) {
    if (!allowVar(varName)) continue;
    const stratCols = sliceTables[0]?.stratCols || [];
    const hasStrat = stratCols.length > 0;
    const filteredSlices = sliceTables.filter((t) => sliceMatchesStratFilter(t, stratFilterMap || {}));
    if (!filteredSlices.length) continue;
    const scales = binScalesByStrat(filteredSlices);
    const rows = flattenBinVarRows(filteredSlices);
    const sliceByKey = new Map(filteredSlices.map((t) => [t.stratKey, t]));
    const varDrill = drills[varName] || null;
    html += `<div class="da-bin-var-block" data-var="${esc(varName)}">`;
    html += `<p class="da-bin-var-title rv-heading-with-hint">${esc(varName)}${hasStrat ? `（分层：${esc(stratCols.join(" × "))}）` : ""}${hintBadgeHtml("点击枚举钻取子分箱")}</p>`;
    html += `<table class="data-table"><thead><tr>`;
    for (const col of stratCols) html += `<th>${esc(col)}</th>`;
    html += `<th>分箱</th><th>分子Σ</th><th>分母Σ</th><th>分母占比</th><th>比率</th><th>Lift</th><th>进件占比</th><th>贷前进件Σ</th><th>命中占比</th><th>命中进件Σ</th><th>未命中占比</th><th>未命中进件Σ</th><th>规则</th>
    </tr></thead><tbody>`;
    for (const r of rows) {
      const sc = scales[r.stratKey] || { rate: { min: 0, max: 0 }, lift: { min: 0, max: 0 } };
      const slice = sliceByKey.get(r.stratKey);
      const hasPost = r.hasPostStrat !== false;
      const denShareTxt = hasPost ? fmtBinSharePct(r.denSharePct) : "—";
      const preApplyShareTxt = fmtBinSharePct(r.preApplySharePct);
      const preHitShareTxt = fmtBinSharePct(r.preRuleHitSharePct);
      const preMissShareTxt = fmtBinSharePct(r.preRuleMissSharePct);
      const drillable = slice && isDrillableBinLabel(r.label, slice.rule);
      const selected = varDrill && varDrill.parentLabel === r.label;
      const rowCls = selected ? "bin-row-selected" : "";
      html += `<tr${rowCls ? ` class="${rowCls}"` : ""}>`;
      for (const col of stratCols) html += `<td>${esc(String(r.stratParts?.[col] ?? ""))}</td>`;
      if (drillable && !exportMode) {
        html += `<td><button type="button" class="bin-label-drillable" data-var="${esc(varName)}" data-bin-label="${esc(r.label)}" title="点击钻取子分箱">${esc(r.label)}</button></td>`;
      } else if (drillable) {
        html += `<td><span class="config-muted" title="导出快照：钻取路径仅展示，不支持重算">${esc(r.label)}</span></td>`;
      } else {
        html += `<td>${esc(r.label)}</td>`;
      }
      html += `<td class="num">${fmtBinPostNum(r.num, hasPost)}</td>
        <td class="num">${fmtBinPostNum(r.den, hasPost)}</td>
        <td${hasPost ? metricHeatCell(r.denSharePct, sc.denShare) : ""}>${renderDashWithReason(denShareTxt, denShareReason(r, hasPost))}</td>
        <td${hasPost ? metricHeatCell(r.rate, sc.rate) : ""}>${fmtBinPostRate(r.rate, hasPost)}</td>
        <td${hasPost ? metricHeatCell(r.lift, sc.lift) : ""}>${hasPost && r.lift != null ? fmtMetric(r.lift) : (hasPost ? "N/A" : "—")}</td>
        <td${metricHeatCell(r.preApplySharePct, sc.preApplyShare)}>${renderDashWithReason(preApplyShareTxt, preApplyShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preApplyVol)}</td>
        <td${metricHeatCell(r.preRuleHitSharePct, sc.preRuleHitShare)}>${renderDashWithReason(preHitShareTxt, preHitShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preRuleHitApplyVol)}</td>
        <td${metricHeatCell(r.preRuleMissSharePct, sc.preRuleMissShare)}>${renderDashWithReason(preMissShareTxt, preMissShareReason(r))}</td>
        <td class="num">${fmtBinPreApply(r.preRuleMissApplyVol)}</td>`;
      if (drillable && !hasStrat && !exportMode) {
        html += `<td><button type="button" class="btn btn-secondary btn-sm da-bin-gen-rule" data-var="${esc(varName)}" data-bin-label="${esc(r.label)}">生成规则</button></td>`;
      } else if (drillable && !exportMode) {
        const sk = r.stratKey != null ? r.stratKey : "";
        html += `<td><button type="button" class="btn btn-secondary btn-sm da-bin-gen-rule" data-var="${esc(varName)}" data-bin-label="${esc(r.label)}" data-strat-key="${esc(String(sk))}" title="生成候选：区间 AND 本行分层条件">生成规则</button></td>`;
      } else if (drillable) {
        html += `<td class="config-muted">导出快照（仅展示）</td>`;
      } else {
        html += `<td class="config-muted">—</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    if (varDrill) html += renderBinDrillPanelHtml(varDrill, { varName });
    html += `</div>`;
  }
  if (!html) html = `<p class="config-muted">请至少勾选一个变量与分层值以展示分箱表</p>`;
  return html;
}
function sliceMatchesCrossStratFilter(t, stratFilterMap) {
  const cols = t.stratCols || [];
  if (!cols.length) return true;
  if (!stratFilterMap || !Object.keys(stratFilterMap).length) return true;
  for (const col of cols) {
    const allowed = stratFilterMap[col];
    if (!allowed || !allowed.size) return false;
    if (!allowed.has(String(t.stratParts?.[col] ?? ""))) return false;
  }
  return true;
}
function crossCellRateStyle(rate, maxRate) {
  const heat = rateHeatStyle(rate, 0, maxRate > 0 ? maxRate : 0);
  return heat ? ` style="${heat}"` : "";
}
function renderCrossBinTablesHtml(cross, stratFilterMap) {
  if (!cross?.tables?.length) return `<p class="config-muted">请先选择二维分箱的 X/Y 变量后运行分箱分析</p>`;
  let html = "";
  const minRows = C.MIN_BIN_DRILL_ROWS || 30;
  for (const t of cross.tables) {
    if (!sliceMatchesCrossStratFilter(t, stratFilterMap)) continue;
    const stratCols = t.stratCols || [];
    const groupLabel = stratCols.length
      ? stratCols.map((c) => `${c}=${t.stratParts?.[c] ?? ""}`).join(" · ")
      : "全部样本";
    html += `<p class="da-bin-var-title rv-heading-with-hint">${esc(t.xVar)} × ${esc(t.yVar)}（${esc(groupLabel)}）${hintBadgeHtml(`低置信=样本<${minRows}且>0`)}</p>`;
    html += `<table class="data-table"><thead><tr><th>${esc(t.xVar)} \\ ${esc(t.yVar)}</th>`;
    for (const yl of t.yLabels) html += `<th>${esc(yl)}</th>`;
    html += `</tr></thead><tbody>`;
    for (let i = 0; i < t.xLabels.length; i++) {
      html += `<tr><td>${esc(t.xLabels[i])}</td>`;
      for (let j = 0; j < t.yLabels.length; j++) {
        const c = t.cells?.[i]?.[j];
        const rateTxt = c?.rate != null ? pct(c.rate) : "—";
        const denTxt = c?.den != null ? fmtNum(c.den) : "—";
        const rowTxt = c?.rowCount != null ? fmtNum(c.rowCount) : "—";
        const lowTag = c?.lowConfidence ? `<div class="config-muted" style="font-size:.72rem;color:var(--text-warn-chip)">低置信</div>` : "";
        html += `<td${crossCellRateStyle(c?.rate, t.maxRate)}>
          <div class="num" style="font-weight:600">${rateTxt}</div>
          <div class="config-muted" style="font-size:.72rem">分母Σ ${denTxt} · 样本 ${rowTxt}</div>
          ${lowTag}
        </td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
  }
  if (!html) return `<p class="config-muted">当前二维分组筛选下无结果</p>`;
  return html;
}
function collectCrossCells(cross, stratFilterMap) {
  const out = [];
  for (const t of cross?.tables || []) {
    if (!sliceMatchesCrossStratFilter(t, stratFilterMap)) continue;
    for (let i = 0; i < (t.xLabels || []).length; i++) {
      for (let j = 0; j < (t.yLabels || []).length; j++) {
        const c = t.cells?.[i]?.[j];
        if (!c || !Number.isFinite(c.rate)) continue;
        out.push({
          xVar: t.xVar,
          yVar: t.yVar,
          xLabel: t.xLabels[i],
          yLabel: t.yLabels[j],
          rate: c.rate,
          den: Number(c.den) || 0,
          rowCount: Number(c.rowCount) || 0,
        });
      }
    }
  }
  return out;
}
function renderCrossBinSummaryCardsHtml(cross, stratFilterMap) {
  const cells = collectCrossCells(cross, stratFilterMap);
  if (!cells.length) return "";
  const sortedByRate = [...cells].sort((a, b) => b.rate - a.rate);
  const top = sortedByRate[0];
  const low = sortedByRate[sortedByRate.length - 1];
  const totalDen = cells.reduce((s, c) => s + (c.den > 0 ? c.den : 0), 0);
  const top3Den = sortedByRate.slice(0, 3).reduce((s, c) => s + (c.den > 0 ? c.den : 0), 0);
  const concentration = totalDen > 0 ? (top3Den / totalDen) * 100 : null;
  const topLabel = `${top.xLabel} × ${top.yLabel}`;
  const lowLabel = `${low.xLabel} × ${low.yLabel}`;
  return `<div class="metric-card">
      <div class="val">${pct(top.rate)}</div>
      <div class="lbl">最高风险格 · ${esc(topLabel)}</div>
    </div>
    <div class="metric-card">
      <div class="val">${pct(low.rate)}</div>
      <div class="lbl">最低风险格 · ${esc(lowLabel)}</div>
    </div>
    <div class="metric-card">
      <div class="val">${concentration == null ? "—" : `${fmtMetric(concentration)}%`}</div>
      <div class="lbl">高风险集中度（Top3 分母占比）</div>
    </div>`;
}
function scheduleRefreshBinTables({ recomputeDrills = true } = {}) {
  if (scheduleRefreshBinTables._timer) clearTimeout(scheduleRefreshBinTables._timer);
  scheduleRefreshBinTables._timer = setTimeout(() => {
    scheduleRefreshBinTables._timer = null;
    refreshBinTables({ recomputeDrills });
  }, 150);
}
function refreshBinTables({ recomputeDrills = true } = {}) {
  const mount = $("daBinTablesMount");
  const summaryMount = $("daBinSummaryMount");
  const bin = S.lastDataAnalysis?.bin;
  if (!mount || !bin?.binTables) return;
  const hasDisplayFilter = !!($("daBinResultFilterBar") && CP().getPickerSpec("binDisplayVar"));
  const selectedVars = getBinDisplayVarChecked();
  const varsShown = hasDisplayFilter
    ? new Set(selectedVars)
    : (selectedVars.length ? new Set(selectedVars) : new Set(bin.vars || []));
  const showVar = (v) => (hasDisplayFilter ? varsShown.has(v) : (!varsShown.size || varsShown.has(v)));
  const stratFilterMap = getBinStratValueFilterState();
  const drilldowns = ensureBinDrilldowns(bin);
  // Keep hidden-var drill state; only recompute drills when strat filter (or explicit) requires it.
  const base = S.lastDataAnalysis?.base;
  if (recomputeDrills && !isExportMode() && base?.postRows) {
    for (const [varName, drill] of Object.entries(drilldowns)) {
      if (!showVar(varName)) continue;
      if (!drill?.parentLabel) continue;
      const n = drill.subNBins ?? C.DEFAULT_BIN_DRILL_SUB_NBINS;
      drilldowns[varName] = computeBinDrilldownMulti(
        base.postRows,
        base.preRows || [],
        base.hardRules || [],
        base.softRules || [],
        bin.binTables,
        varName,
        drill.parentLabel,
        n,
        base.ratioSpec,
        base.overallRisk.rate,
        stratFilterMap,
        bin.stratCols || []
      );
    }
  }
  if (!bin.drilldownLastVar || !drilldowns[bin.drilldownLastVar]) {
    const visibleDrilled = Object.keys(drilldowns).filter((v) => showVar(v));
    bin.drilldownLastVar = visibleDrilled[0] || Object.keys(drilldowns)[0] || null;
  }
  bin.drilldown = bin.drilldownLastVar ? drilldowns[bin.drilldownLastVar] || null : null;
  if (summaryMount) {
    const varsOrder = (bin.vars || []).filter((v) => showVar(v));
    const summary = buildBinRiskSummary(bin.binTables, {
      varsShown: hasDisplayFilter ? varsShown : (varsShown.size ? varsShown : null),
      stratFilterMap,
      varsOrder,
    });
    summaryMount.innerHTML = renderBinRiskSummaryHtml(summary, {
      showSpecialBins: true,
    });
  }
  // Detail tables only render shown vars; hidden drills stay in state.
  const drilldownsShown = {};
  for (const [varName, drill] of Object.entries(drilldowns)) {
    if (showVar(varName)) drilldownsShown[varName] = drill;
  }
  mount.innerHTML = renderBinTablesHtml(bin.binTables, {
    varsShown: hasDisplayFilter ? varsShown : (varsShown.size ? varsShown : null),
    stratFilterMap,
    drilldowns: drilldownsShown,
    requireVarsShown: hasDisplayFilter,
  });
}
function binSummaryEmptyReasonTip(reason) {
  if (reason === "no_bin") return "该变量无此序号箱";
  if (reason === "no_post") return "该分层无贷后样本";
  if (reason === "no_rate") return "分母Σ为 0 或无法计算风险";
  return "";
}
function renderBinRiskSummaryHtml(summary, { showSpecialBins = false } = {}) {
  if (!summary?.vars?.length || summary.emptyReason === "no_vars") {
    return `<p class="config-muted da-bin-risk-summary-empty">暂无风险汇总（请勾选展示变量）</p>`;
  }
  if (summary.emptyReason === "no_strat") {
    return `<p class="config-muted da-bin-risk-summary-empty">暂无风险汇总（当前分层值筛选下无结果，请调整分层值筛选）</p>`;
  }
  if (summary.emptyReason === "no_post_strat" || !summary.rows?.length) {
    return `<p class="config-muted da-bin-risk-summary-empty">暂无风险汇总（当前筛选下无贷后分层可汇总）</p>`;
  }
  const scalesByVar = {};
  for (const v of summary.vars) {
    const rates = [];
    for (const row of summary.rows) {
      const r = row.cells?.[v]?.rate;
      if (r != null && Number.isFinite(r)) rates.push(r);
    }
    scalesByVar[v] = rates.length
      ? { min: Math.min(...rates), max: Math.max(...rates) }
      : { min: 0, max: 0 };
  }
  const stratCols = summary.stratCols || [];
  let hint = "按分箱序号对齐各变量；悬停看区间；汇总不含缺失/负数（明细含）";
  let html = `<div class="da-bin-risk-summary">
    <p class="da-bin-var-title rv-heading-with-hint">风险汇总（按分箱序号对齐）${hintBadgeHtml(hint)}</p>
    <div class="da-bin-risk-summary-wrap"><table class="data-table"><thead><tr>`;
  for (const col of stratCols) html += `<th>${esc(col)}</th>`;
  html += `<th>分箱序号</th>`;
  for (const v of summary.vars) {
    html += `<th title="各自切点下的风险比率">${esc(v)}</th>`;
  }
  html += `</tr></thead><tbody>`;
  for (const row of summary.rows) {
    html += `<tr>`;
    for (const col of stratCols) {
      html += `<td>${esc(String(row.stratParts?.[col] ?? ""))}</td>`;
    }
    html += `<td>分箱${row.binIndex}</td>`;
    for (const v of summary.vars) {
      const c = row.cells?.[v];
      if (!c || c.rate == null || !Number.isFinite(c.rate)) {
        const tipParts = [];
        const reasonTip = binSummaryEmptyReasonTip(c?.emptyReason);
        if (reasonTip) tipParts.push(reasonTip);
        if (c?.label) tipParts.push(String(c.label));
        if (c?.den != null) tipParts.push(`分母Σ ${fmtNum(c.den)}`);
        const tip = tipParts.join(" · ");
        html += `<td${tip ? ` title="${esc(tip)}"` : ""}>—</td>`;
      } else {
        const tipParts = [];
        if (c.label) tipParts.push(String(c.label));
        if (c.den != null) tipParts.push(`分母Σ ${fmtNum(c.den)}`);
        const tip = tipParts.join(" · ");
        const scale = scalesByVar[v] || { min: 0, max: 0 };
        html += `<td class="num"${metricHeatCell(c.rate, scale)}${tip ? ` title="${esc(tip)}"` : ""}>${pct(c.rate)}</td>`;
      }
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function refreshCrossBinTables() {
  const mount = $("daCrossBinTablesMount");
  const summaryMount = $("daCrossBinSummary");
  const section = $("daCrossBinSection");
  const cross = S.lastDataAnalysis?.bin?.cross2d;
  if (!mount || !cross) return;
  const stratFilterMap = getCrossStratValueFilterState();
  if (summaryMount) summaryMount.innerHTML = renderCrossBinSummaryCardsHtml(cross, stratFilterMap);
  mount.innerHTML = renderCrossBinTablesHtml(cross, stratFilterMap);
  if (section) section.style.display = cross?.tables?.length ? "" : "none";
}
function renderBinRiskTables(tables) {
  return renderBinTablesHtml(tables, {});
}
function getDaSampleScope() {
  const v = $("daSampleScope")?.value || "full";
  return v === "residual_new_pass" ? "residual_new_pass" : "full";
}
function collectDaResidualRuleSets() {
  // Lazy: report-analysis.js loads before report-validity.js / rules-io usage at runtime.
  const baseline = RV.app.rulesIo?.collectEffectiveValidityBaseline
    ? RV.app.rulesIo.collectEffectiveValidityBaseline()
    : { hardRules: [], softRules: [] };
  const customRules = RV.ui.report.validity?.collectCustomRulesFromUI
    ? RV.ui.report.validity.collectCustomRulesFromUI()
    : [];
  return {
    hardRules: baseline.hardRules || [],
    customRules: customRules || [],
  };
}
function buildDaContext(opts) {
  opts = opts || {};
  const needPreRows = opts.needPreRows !== false;
  const persist = opts.persist !== false;
  const badSpec = resolveDaBadLabelSpec();
  const ratioSpecs = collectRatioSpecs();
  if (!ratioSpecs.length || !ratioSpecs[0].num) throw new Error("请配置至少一个风险比率（分子/分母）");
  if (!badSpec.col) throw new Error("无法确定 Y 标签列");
  if (!S.headers.includes(badSpec.col)) throw new Error(`Y 标签列「${badSpec.col}」不存在`);
  const sampleScope = getDaSampleScope();
  let postRows = applyFilters(S.rawRows, getSampleConfig("post"));
  if (!postRows.length) throw new Error("贷后样本为空，请检查筛选");
  let preRows = needPreRows ? applyFilters(S.rawRows, getSampleConfig("pre")) : [];
  const fullPostCount = postRows.length;
  const fullPreCount = needPreRows ? preRows.length : 0;
  let residualHint = "";
  if (sampleScope === "residual_new_pass") {
    const { hardRules, customRules } = collectDaResidualRuleSets();
    const filterPass = RV.domain.validity.filterNewStrategyPassRows;
    if (typeof filterPass !== "function") {
      throw new Error("残差过滤不可用：缺少 RV.domain.validity.filterNewStrategyPassRows");
    }
    postRows = filterPass(postRows, hardRules, customRules);
    if (needPreRows) {
      preRows = filterPass(preRows, hardRules, customRules);
    }
    if (!hardRules.length && !customRules.length) {
      residualHint = "未配置排除规则（硬规则/有效性候选均为空）";
    } else if (!customRules.length) {
      residualHint = "仅排除硬规则命中";
    }
    if (!postRows.length) {
      throw new Error("残差样本为空（硬规则/候选已覆盖全部贷后行）");
    }
  }
  const y = buildYVector(postRows, badSpec);
  const ratioSpec = ratioSpecs[0];
  const overallRisk = sumRatio(postRows, ratioSpec.num, ratioSpec.den);
  const base = {
    postRows, preRows, y, badSpec, ratioSpec, overallRisk,
    postCount: postRows.length, preCount: preRows.length,
    sampleScope,
    fullPostCount,
    fullPreCount,
    residualHint,
  };
  if (persist) {
    if (!S.lastDataAnalysis) S.lastDataAnalysis = {};
    S.lastDataAnalysis.base = base;
    updateDaSharedSummary(base);
  }
  return base;
}

/**
 * After cross run: keep uni drill context (preRows + sidebar rules) when sample scope matches.
 */
function commitDaBaseAfterCrossRun(workBase) {
  const collectRulesFromUI = RV.ui.sidebar.collectRulesFromUI;
  const { hardRules, softRules } = collectRulesFromUI ? collectRulesFromUI() : { hardRules: [], softRules: [] };
  const prev = S.lastDataAnalysis?.base;
  let next;
  const canReusePre = prev
    && prev.sampleScope === workBase.sampleScope
    && (
      (prev.preRows && prev.preRows.length)
      || (prev.fullPreCount > 0)
      || (prev.hardRules && prev.hardRules.length)
      || (prev.softRules && prev.softRules.length)
      || prev.preCount > 0
    );
  if (canReusePre) {
    next = {
      ...workBase,
      preRows: prev.preRows || [],
      preCount: prev.preCount ?? (prev.preRows ? prev.preRows.length : 0),
      fullPreCount: prev.fullPreCount ?? 0,
      hardRules: (prev.hardRules && prev.hardRules.length) ? prev.hardRules : hardRules,
      softRules: (prev.softRules && prev.softRules.length) ? prev.softRules : softRules,
    };
  } else {
    next = buildDaContext({ needPreRows: true, persist: false });
    next.hardRules = hardRules;
    next.softRules = softRules;
  }
  if (!S.lastDataAnalysis) S.lastDataAnalysis = {};
  S.lastDataAnalysis.base = next;
  updateDaSharedSummary(next);
  return next;
}
function getBinConfigFromDom() {
  const vars = getBinVarSelection();
  const nBins = clampBinCount($("daBinCount")?.value);
  const stratCols = getBinStratColSelection();
  const binMode = $("daBinMode")?.value || "equal_freq";
  const shares = binMode === "custom_share" ? collectBinSharesFromDom() : null;
  const showSpecialBins = true;
  const crossX = $("daCrossXVar")?.value || "";
  const crossY = $("daCrossYVar")?.value || "";
  const manualThresholds = binMode === "manual_thresholds"
    ? collectManualBinThresholdsFromDom(vars)
    : null;
  const manualThresholdsForCross = binMode === "manual_thresholds" && crossX && crossY
    ? collectManualBinThresholdsFromDom([crossX, crossY])
    : null;
  const cross = {
    xVar: crossX,
    yVar: crossY,
    xBins: clampBinCount($("daCrossXBinCount")?.value),
    yBins: clampBinCount($("daCrossYBinCount")?.value),
    groupCols: getCrossGroupColSelection(),
  };
  return {
    vars,
    nBins,
    stratCols,
    binMode,
    shares,
    manualThresholds,
    manualThresholdsForCross,
    showSpecialBins,
    binTrackMode: getBinTrackMode(),
    crossEnabled: true,
    cross,
  };
}
function mountAnalysisTabShell() {
  const doc = ensureReportDocument();
  const old = doc.querySelector("#tab-analysis");
  if (old) old.remove();
  doc.insertAdjacentHTML("beforeend", renderAnalysisTabShell());
  bindDaConfigPanelToggle();
  syncDaSharedPanelCollapsed();
}
function ensureReportDocument() {
  let doc = $("report-output")?.querySelector(".report-document");
  if (!doc) {
    $("report-output").innerHTML = '<div class="report-document"></div>';
    doc = $("report-output").querySelector(".report-document");
  }
  $("reportTabs").style.display = "flex";
  return doc;
}
function getAnalysisTimeCols() {
  const timeCandidates = S.headers.filter((h) =>
    /月份|日期|时间|month|date/i.test(h) || S.enumCols.includes(h)
  );
  return timeCandidates.length ? timeCandidates : S.enumCols.slice(0, 20);
}
function getAnalysisGroupDimensionCandidates() {
  const fallback = getAnalysisTimeCols();
  const cached = S.groupDimCandidates;
  if (cached?.all?.length) {
    return {
      all: cached.all,
      recommended: cached.recommended?.length ? cached.recommended : cached.all,
      metaByCol: cached.metaByCol || {},
    };
  }
  if (!RV.data?.buildGroupDimensionCandidates) {
    return { all: fallback, recommended: fallback, metaByCol: {} };
  }
  const built = RV.data.buildGroupDimensionCandidates();
  const normalized = {
    all: built?.all || fallback,
    recommended: built?.recommended?.length ? built.recommended : (built?.all || fallback),
    metaByCol: built?.metaByCol || {},
  };
  S.groupDimCandidates = normalized;
  return normalized;
}
function normalizeGroupCandidates(colsOrCandidates) {
  if (Array.isArray(colsOrCandidates)) {
    return { all: colsOrCandidates, recommended: colsOrCandidates, metaByCol: {} };
  }
  const all = colsOrCandidates?.all || [];
  const recommended = colsOrCandidates?.recommended?.length ? colsOrCandidates.recommended : all;
  return { all, recommended, metaByCol: colsOrCandidates?.metaByCol || {} };
}
function applyCheckboxSelection(containerId, values) {
  const container = $(containerId);
  if (!container) return;
  const selected = new Set(values || []);
  container.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });
}
function snapshotDataAnalysisUiState() {
  if (!$("tab-analysis")) return null;
  const groupFilterVars = ($("daEdaResultFilterBar") && CP().getPickerSpec("edaDisplayVar"))
    ? getGroupVarFilterChecked()
    : [];
  const distSelected = groupFilterVars;
  const edaShowAllColumns = !!CP().getPickerSpec("daEdaVar")?.showAllColumns;
  const binShowAllColumns = !!CP().getPickerSpec("daBinVar")?.showAllColumns;
  const groupValueFilter = collectEdaGroupValueFilter();
  return {
    edaVars: getEdaVarSelection(),
    badMode: $("daBadMode")?.value || "numerator",
    badCol: $("daBadCol")?.value || "",
    badThreshold: $("daBadThreshold")?.value ?? "0",
    sampleScope: getDaSampleScope(),
    groupCols: getEdaGroupColSelection(),
    ivBins: $("daIvBins")?.value ?? "5",
    binVars: getBinVarSelection(),
    binCount: $("daBinCount")?.value ?? "5",
    binMode: $("daBinMode")?.value || "equal_freq",
    binTrackMode: getBinTrackMode(),
    crossEnabled: true,
    binShares: ($("daBinMode")?.value === "custom_share") ? collectBinSharesFromDom() : undefined,
    binManualThresholdText: $("daBinManualThresholds")?.value || "",
    binManualThresholds: ($("daBinMode")?.value === "manual_thresholds")
      ? collectManualBinThresholdsFromDom(getBinVarSelection())
      : undefined,
    binShowSpecial: true,
    binStratCols: getBinStratColSelection(),
    crossXVar: $("daCrossXVar")?.value || "",
    crossYVar: $("daCrossYVar")?.value || "",
    crossXBins: $("daCrossXBinCount")?.value ?? "5",
    crossYBins: $("daCrossYBinCount")?.value ?? "5",
    crossGroupCols: getCrossGroupColSelection(),
    binVarSelected: ($("daBinResultFilterBar") && CP().getPickerSpec("binDisplayVar")) ? getBinDisplayVarChecked() : [],
    stratValueFilter: collectBinStratValueFilter(),
    crossStratValueFilter: collectCrossStratValueFilter(),
    binDrilldowns: serializeBinDrilldownsForConfig(S.lastDataAnalysis?.bin),
    binDrilldown: pickLegacyBinDrilldown(S.lastDataAnalysis?.bin),
    distSelected,
    groupFilterVars,
    groupValueFilter,
    edaShowAllColumns,
    binShowAllColumns,
    mineVars: getMineVarSelection(),
    mineGroupCols: getMineGroupCols(),
    mineShowAllColumns: !!CP().getPickerSpec("daMineVar")?.showAllColumns,
    mineTarget: getMineTarget(),
    mineLiftThreshold: $("daMineLiftThreshold")?.value ?? "1.1",
    mineMinHitRate: $("daMineMinHitRate")?.value ?? "0.01",
    mineTopK: $("daMineTopK")?.value ?? "3",
    mineMinSamples: $("daMineMinSamples")?.value ?? "30",
    mineMaxCuts: $("daMineMaxCuts")?.value ?? "20",
  };
}
function restoreDataAnalysisUiState(state) {
  if (!state) return;
  applyCheckboxSelection("daEdaVarChecks", state.edaVars || state.analysisVars);
  CP().applySelection("daEdaVar", state.edaVars || state.analysisVars || []);
  if (state.edaShowAllColumns != null) {
    const spec = CP().getPickerSpec("daEdaVar");
    if (spec) {
      spec.showAllColumns = !!state.edaShowAllColumns;
      const showAllCb = $("daEdaVarShowAll");
      if (showAllCb) showAllCb.checked = spec.showAllColumns;
      CP().refreshFilterUI("daEdaVar");
    }
  }
  if ($("daBadMode")) $("daBadMode").value = state.badMode;
  refreshDaBadLabelUI();
  if (state.badCol && $("daBadCol")) $("daBadCol").value = state.badCol;
  if ($("daBadThreshold")) $("daBadThreshold").value = state.badThreshold;
  if ($("daSampleScope")) {
    $("daSampleScope").value = state.sampleScope === "residual_new_pass" ? "residual_new_pass" : "full";
  }
  applyCheckboxSelection(
    "daGroupColChecks",
    state.groupCols || (state.groupCol ? [state.groupCol] : [])
  );
  CP().applySelection("daEdaGroup", state.groupCols || (state.groupCol ? [state.groupCol] : []));
  if ($("daIvBins")) $("daIvBins").value = state.ivBins;
  if (state.binVars !== undefined) {
    applyCheckboxSelection("daBinVarChecks", state.binVars);
    CP().applySelection("daBinVar", state.binVars);
  }
  if (state.binShowAllColumns != null) {
    const binSpec = CP().getPickerSpec("daBinVar");
    if (binSpec) {
      binSpec.showAllColumns = !!state.binShowAllColumns;
      const showAllCb = $("daBinVarShowAll");
      if (showAllCb) showAllCb.checked = binSpec.showAllColumns;
      CP().refreshFilterUI("daBinVar");
    }
  }
  if ($("daBinCount")) $("daBinCount").value = state.binCount;
  if ($("daBinMode")) $("daBinMode").value = state.binMode || "equal_freq";
  if ($("daBinTrackMode")) $("daBinTrackMode").value = state.binTrackMode || BIN_TRACK_UNI;
  if (state.binMode === "custom_share") {
    renderBinShareInputs(clampBinCount(state.binCount), state.binShares);
  }
  if (state.binMode === "manual_thresholds") {
    if ($("daBinManualThresholds")) {
      const txt = state.binManualThresholdText
        || Object.entries(state.binManualThresholds || {})
          .map(([k, arr]) => `${k}: ${(arr || []).join(",")}`)
          .join("\n");
      $("daBinManualThresholds").value = txt;
    }
  }
  syncBinModePanel();
  applyCheckboxSelection(
    "daBinStratColChecks",
    state.binStratCols || (state.binStratCol ? [state.binStratCol] : [])
  );
  CP().applySelection("daBinStrat", state.binStratCols || (state.binStratCol ? [state.binStratCol] : []));
  if ($("daCrossXVar")) $("daCrossXVar").value = state.crossXVar || "";
  if ($("daCrossYVar")) $("daCrossYVar").value = state.crossYVar || "";
  if ($("daCrossXBinCount")) $("daCrossXBinCount").value = state.crossXBins || "5";
  if ($("daCrossYBinCount")) $("daCrossYBinCount").value = state.crossYBins || "5";
  applyCheckboxSelection("daCrossGroupColChecks", state.crossGroupCols || []);
  CP().applySelection("daCrossGroup", state.crossGroupCols || []);
  if (state.mineVars !== undefined) {
    applyCheckboxSelection("daMineVarChecks", state.mineVars);
    CP().applySelection("daMineVar", state.mineVars);
  }
  if (state.mineShowAllColumns != null) {
    const mineSpec = CP().getPickerSpec("daMineVar");
    if (mineSpec) {
      mineSpec.showAllColumns = !!state.mineShowAllColumns;
      const showAllCb = $("daMineVarShowAll");
      if (showAllCb) showAllCb.checked = mineSpec.showAllColumns;
      CP().refreshFilterUI("daMineVar");
    }
  }
  if (state.mineGroupCols !== undefined) {
    applyCheckboxSelection("daMineGroupColChecks", state.mineGroupCols);
    CP().applySelection("daMineGroup", state.mineGroupCols);
  }
  if (state.mineTarget === "quality") {
    const q = $("daMineTargetQuality");
    if (q) q.checked = true;
  } else if (state.mineTarget === "risk") {
    const r = $("daMineTargetRisk");
    if (r) r.checked = true;
  }
  if ($("daMineLiftThreshold") && state.mineLiftThreshold != null) {
    $("daMineLiftThreshold").value = state.mineLiftThreshold;
  }
  if ($("daMineMinHitRate") && state.mineMinHitRate != null) {
    $("daMineMinHitRate").value = state.mineMinHitRate;
  }
  if ($("daMineTopK") && state.mineTopK != null) $("daMineTopK").value = state.mineTopK;
  if ($("daMineMinSamples") && state.mineMinSamples != null) {
    $("daMineMinSamples").value = state.mineMinSamples;
  }
  if ($("daMineMaxCuts") && state.mineMaxCuts != null) $("daMineMaxCuts").value = state.mineMaxCuts;
  syncMineTargetUi();
  syncBinTrackPanels();
}
function restoreDistChartSelection(selected) {
  restoreGroupFilterSelection(selected);
}
function setupDataAnalysisTabShell(groupCandidates, { showAnalysisTab = false } = {}) {
  const candidates = normalizeGroupCandidates(groupCandidates);
  mountAnalysisTabShell();
  bindDaStaleBannerEvents();
  if (S.daResultsStale) markDaResultsStale();
  registerDaVariablePickers();
  CP().initPicker("daEdaVar", S.numCols || [], { defaultChecked: false, selected: [], listLayout: true });
  CP().initPicker("daEdaGroup", candidates.all.filter(Boolean), {
    defaultChecked: false,
    selected: [],
    listLayout: true,
  });
  CP().initPicker("daBinVar", S.numCols || [], {
    defaultChecked: false,
    selected: defaultModelBinCols(S.numCols || []),
    listLayout: true,
  });
  CP().initPicker("daBinStrat", candidates.all.filter(Boolean), {
    defaultChecked: false,
    selected: [],
    listLayout: true,
  });
  CP().initPicker("daMineVar", S.numCols || [], {
    defaultChecked: false,
    selected: [],
    listLayout: true,
  });
  CP().initPicker("daMineGroup", candidates.all.filter(Boolean), {
    defaultChecked: false,
    selected: [],
    listLayout: true,
  });
  CP().initPicker("daCrossGroup", candidates.all.filter(Boolean), {
    defaultChecked: false,
    selected: [],
    listLayout: true,
  });
  fillSelect($("daCrossXVar"), ["", ...(S.numCols || [])]);
  fillSelect($("daCrossYVar"), ["", ...(S.numCols || [])]);
  if ($("daBinTrackMode")) $("daBinTrackMode").value = BIN_TRACK_UNI;
  const binChecks = $("daBinVarChecks");
  if (binChecks && binChecks.dataset.manualBound !== "1") {
    binChecks.dataset.manualBound = "1";
    binChecks.addEventListener("change", () => {
      updateManualThresholdMeta();
    });
  }
  if ($("daBinManualThresholds")) $("daBinManualThresholds").value = "";
  fillSelect($("daBadCol"), S.headers);
  refreshDaBadLabelUI();
  const scopeSel = $("daSampleScope");
  if (scopeSel && scopeSel.dataset.bound !== "1") {
    scopeSel.dataset.bound = "1";
    scopeSel.addEventListener("change", () => invalidateDataAnalysisCache());
  }
  initBinConfigPanel();
  syncBinTrackPanels();
  syncMineTargetUi();
  const mineTargetRadios = document.querySelectorAll('input[name="daMineTarget"]');
  mineTargetRadios.forEach((radio) => {
    if (radio.dataset.bound === "1") return;
    radio.dataset.bound = "1";
    radio.addEventListener("change", () => {
      syncMineTargetUi({ applyDefaultThreshold: true });
      invalidateDataAnalysisCache({ track: "mine" });
    });
  });
  const liftThr = $("daMineLiftThreshold");
  if (liftThr && liftThr.dataset.bound !== "1") {
    liftThr.dataset.bound = "1";
    liftThr.addEventListener("change", () => {
      liftThr.value = String(clampMineLift(liftThr.value));
      invalidateDataAnalysisCache({ track: "mine" });
    });
  }
  ["daMineMinHitRate", "daMineTopK", "daMineMinSamples", "daMineMaxCuts"].forEach((id) => {
    const el = $(id);
    if (!el || el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    el.addEventListener("change", () => {
      if (id === "daMineTopK") el.value = String(clampMineTopK(el.value));
      if (id === "daMineMinSamples") el.value = String(clampMineMinSamples(el.value));
      if (id === "daMineMaxCuts") el.value = String(clampMineMaxCuts(el.value));
      invalidateDataAnalysisCache({ track: "mine" });
    });
  });
  const edaBtn = $("btnRunEdaAnalysis");
  const binBtn = $("btnRunBinAnalysis");
  const mineBtn = $("btnRunRuleMine");
  if (edaBtn) edaBtn.disabled = false;
  if (binBtn) binBtn.disabled = false;
  if (mineBtn) mineBtn.disabled = false;
  syncDaSharedPanelCollapsed();
  if (showAnalysisTab) showTab("analysis");
}
function remountDataAnalysisTabAfterReport(priorState) {
  setupDataAnalysisTabShell(getAnalysisGroupDimensionCandidates(), { showAnalysisTab: false });
  restoreDataAnalysisUiState(priorState);
  if (S.lastDataAnalysis?.base) updateDaSharedSummary(S.lastDataAnalysis.base);
  if (S.lastDataAnalysis?.eda) {
    updateEdaResults();
    restoreDistChartSelection(priorState?.distSelected);
    restoreGroupFilterSelection(priorState?.groupFilterVars);
    restoreEdaGroupValueFilter(priorState?.groupValueFilter);
  }
  if (S.lastDataAnalysis?.bin) {
    updateBinResults();
    restoreBinDisplayFilters(priorState);
  }
}
function initDataAnalysisTab(groupCandidates) {
  setupDataAnalysisTabShell(groupCandidates, { showAnalysisTab: false });
}

  Object.assign(target, { setDaEdaStatus, setDaBinStatus, setDaMineStatus, clearMineResultsUi, updateDaSharedSummary, invalidateDataAnalysisCache, markDaResultsStale, clearDaResultsStale, filterCheckboxGrid, buildDaCheckboxGrid, getFirstRatioNumeratorCol, refreshDaBadLabelUI, initResizableTables, renderCorrelationTable, renderMetricsTables, renderEdaOverviewTable, metricScalesByVariable, renderGroupMetricsTableInner, buildGroupVarFilter, buildEdaResultFilterBar, getGroupVarFilterChecked, updateGroupVarFilterMeta, syncEdaDisplayVarFilters, clearDaEdaVarChecks, refreshGroupMetricsTable, restoreGroupFilterSelection, restoreEdaGroupValueFilter, renderEdaGroupMetricsTable, renderEdaDistCharts, loadMoreEdaDistCharts, renderEdaResultsHtml, updateEdaResults, updateBinResults, renderAnalysisTabShell, applyBinDrilldown, clearBinDrilldown, renderBinDrillPanelHtml, groupBinTablesByVar, binScalesByStrat, flattenBinVarRows, sliceMatchesStratFilter, getBinStratValueFilterState, collectBinStratValueFilter, collectStratValuesFromBinTables, buildBinVarFilter, buildBinStratValueFilter, buildCrossStratValueFilter, restoreBinDrilldown, restoreBinDrilldowns, ensureBinDrilldowns, serializeBinDrilldownsForConfig, pickLegacyBinDrilldown, normalizeSavedDrilldowns, scrollToBinVarBlock, restoreBinDisplayFilters, renderBinTablesHtml, scheduleRefreshBinTables, refreshBinTables, refreshCrossBinTables, renderBinRiskSummaryHtml, binSummaryEmptyReasonTip, renderBinRiskTables, getDaSampleScope, collectDaResidualRuleSets, buildDaContext, getBinConfigFromDom, mountAnalysisTabShell, ensureReportDocument, getAnalysisTimeCols, getAnalysisGroupDimensionCandidates, applyCheckboxSelection, snapshotDataAnalysisUiState, restoreDataAnalysisUiState, restoreDistChartSelection, setupDataAnalysisTabShell, remountDataAnalysisTabAfterReport, initDataAnalysisTab, validateEdaConfig, validateBinConfig, validateUniBinConfig, validateCrossBinConfig, validateCustomBinShares, equalBinShares, initBinConfigPanel, renderBinShareInputs, syncBinModePanel, refreshBinRunButtonState, resolveDaBadLabelSpec, formatBinShareDeviationStatus, formatBinShareDeviationNote, renderBinFootnoteHtml, runRuleMineScan, cancelRuleMineScan, runBinEdgeScore, applySuggestedMineVars, applyEdaSelectedMineVars, generateRuleFromBinRow, addValidityCandidateFromPreset, adoptCandidateSpec, addMineRowsToCandidates, refreshDaMineVarChecks, refreshMineGroupTrend, getMineGroupCols, getMineVarSelection, getMineGroupColSelection, commitDaBaseAfterCrossRun, getEdaVarSelection, getEdaGroupColSelection, stepIvBins, clampIvBins, resolveEdaGroupCols, getBinVarSelection, getBinStratColSelection, getCrossGroupColSelection, stepBinCount, stepCrossXBins, stepCrossYBins, stepMineLift, stepMineTopK, stepMineMinSamples, stepMineMaxCuts, buildBinResultFilterBar });
})(window.RV);
