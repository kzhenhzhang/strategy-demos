(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const addRatioRow = RV.ui.sidebar.addRatioRow;
  const applyPrimaryFilter = RV.ui.sidebar.applyPrimaryFilter;
  const applyRuleConfig = RV.ui.sidebar.applyRuleConfig;
  const applyCheckboxSelection = RV.ui.report.analysis.applyCheckboxSelection;
  const applySampleGroupDimensions = RV.ui.sidebar.applySampleGroupDimensions;
  const collectSampleConfigExport = RV.sample.collectSampleConfigExport;
  const createFilterRule = RV.ui.sidebar.createFilterRule;
  const filterCheckboxGrid = RV.ui.report.analysis.filterCheckboxGrid;
  const getAnalysisTimeCols = RV.ui.report.analysis.getAnalysisTimeCols;
  const getAnalysisGroupDimensionCandidates = RV.ui.report.analysis.getAnalysisGroupDimensionCandidates;
  const getChecked = RV.infra.getChecked;
  const getNumericColumnStats = RV.data.getNumericColumnStats;
  const parseNum = RV.infra.parseNum;
  const refreshDaBadLabelUI = RV.ui.report.analysis.refreshDaBadLabelUI;
  const renderBinShareInputs = RV.ui.report.analysis.renderBinShareInputs;
  const syncBinModePanel = RV.ui.report.analysis.syncBinModePanel;
  const validateCustomBinShares = RV.ui.report.analysis.validateCustomBinShares;
  const refreshFilterMeta = RV.ui.sidebar.refreshFilterMeta;
  const renderFilterRuleValues = RV.ui.sidebar.renderFilterRuleValues;
  const setFilterRuleEnumValues = RV.ui.sidebar.setFilterRuleEnumValues;
  const restoreValidityUiState = RV.ui.report.validity.restoreValidityUiState;
  const setupDataAnalysisTabShell = RV.ui.report.analysis.setupDataAnalysisTabShell;
  const setupValidityTabShell = RV.ui.report.validity.setupValidityTabShell;
  const snapshotDataAnalysisUiState = RV.ui.report.analysis.snapshotDataAnalysisUiState;
  const snapshotValidityUiState = RV.ui.report.validity.snapshotValidityUiState;
  const updateNumericFilterUI = RV.ui.sidebar.updateNumericFilterUI;
  var app = RV.app = RV.app || {};
  var target = app.config = app.config || {};

function normalizeSidebarConfig(config) {
  if (!config || typeof config !== "object") return config;
  const out = { ...config };
  if (out.postSample && typeof out.postSample === "object") {
    out.postSample = { ...out.postSample };
    if (!out.postSample.groupDimensions) {
      out.postSample.groupDimensions = { columns: [], order: [] };
    }
  }
  if (out.preSample && typeof out.preSample === "object") {
    out.preSample = { ...out.preSample };
    if (!out.preSample.groupDimensions) {
      out.preSample.groupDimensions = { columns: [], order: [] };
    }
  }
  if (out.version >= 4 && out.summary?.groupDimensions) {
    const hasPostDims = out.postSample?.groupDimensions?.columns?.length
      || out.postSample?.groupDimensions?.order?.length;
    if (!hasPostDims) {
      out.postSample = out.postSample || {};
      out.postSample.groupDimensions = out.summary.groupDimensions;
    }
  }
  if (out.summary?.trendValueFilter && !out.postRuleReviewTrendFilter) {
    out.postRuleReviewTrendFilter = out.summary.trendValueFilter;
  }
  return out;
}
function collectValidityConfig() {
  const ui = snapshotValidityUiState();
  if (!ui) return null;
  return { ...ui, completed: !!S.lastValidityAnalysis };
}
function collectDataAnalysisConfig() {
  if (!$("tab-analysis")) return null;
  const ui = snapshotDataAnalysisUiState();
  if (!ui) return null;
  const edaVars = ui.edaVars || [];
  const binVars = ui.binVars || [];
  const groupFilterVars = ui.groupFilterVars?.length ? ui.groupFilterVars : null;
  const edaShowAllColumns = ui.edaShowAllColumns ?? false;
  const binShowAllColumns = ui.binShowAllColumns ?? false;
  return {
    shared: {
      badMode: ui.badMode,
      badCol: ui.badCol,
      badThreshold: ui.badThreshold,
      sampleScope: ui.sampleScope === "residual_new_pass" ? "residual_new_pass" : "full",
    },
    eda: edaVars.length ? {
      vars: edaVars,
      groupCols: ui.groupCols || [],
      ivBins: parseInt(ui.ivBins, 10) || 5,
      showAllColumns: edaShowAllColumns,
      distSelected: ui.distSelected || [],
      groupFilterVars,
      groupValueFilter: ui.groupValueFilter || null,
      completed: !!S.lastDataAnalysis?.eda,
    } : null,
    bin: binVars.length ? {
      vars: binVars,
      showAllColumns: binShowAllColumns,
      nBins: parseInt(ui.binCount, 10) || 5,
      binMode: ui.binMode || "equal_freq",
      shares: ui.binMode === "custom_share" ? (ui.binShares || []) : undefined,
      manualThresholds: ui.binMode === "manual_thresholds" ? (ui.binManualThresholds || null) : undefined,
      manualThresholdText: ui.binMode === "manual_thresholds" ? (ui.binManualThresholdText || "") : undefined,
      showSpecialBins: true,
      stratCols: ui.binStratCols || [],
      cross: (ui.crossXVar && ui.crossYVar) ? {
        xVar: ui.crossXVar,
        yVar: ui.crossYVar,
        xBins: parseInt(ui.crossXBins, 10) || 5,
        yBins: parseInt(ui.crossYBins, 10) || 5,
        groupCols: ui.crossGroupCols || [],
      } : null,
      binVarSelected: ui.binVarSelected?.length ? ui.binVarSelected : null,
      stratValueFilter: ui.stratValueFilter || null,
      crossStratValueFilter: ui.crossStratValueFilter || null,
      binDrilldowns: ui.binDrilldowns || null,
      binDrilldown: ui.binDrilldown || null,
      completed: !!S.lastDataAnalysis?.bin,
    } : null,
  };
}
function collectSidebarConfig() {
  const { hardRules, softRules } = RV.ui.sidebar.collectRulesFromUI();
  const cfg = {
    version: 5,
    exportedAt: new Date().toISOString(),
    postSample: collectSampleConfigExport("post"),
    preSample: collectSampleConfigExport("pre"),
    ratios: [...($("ratioRows")?.querySelectorAll(".ratio-row") || [])].map((row) => ({
      name: row.querySelector(".ratio-name")?.value?.trim() || "",
      num: row.querySelector(".ratio-num")?.value || "",
      den: row.querySelector(".ratio-den")?.value || "",
    })),
    rules: RV.app.rulesIo ? {
      validityBaselineMode: RV.app.rulesIo.getValidityBaselineMode(),
      strategy: RV.app.rulesIo.collectRulesPack("strategy"),
      validityBaseline: RV.app.rulesIo.getValidityBaselineMode() === "override"
        ? RV.app.rulesIo.collectRulesPack("validityBaseline")
        : null,
      validityCandidate: RV.app.rulesIo.collectRulesPack("validityCandidate"),
      filenames: RV.app.rulesIo.FILENAMES,
    } : null,
    hardRules: hardRules.filter((r) => r.type === "binary_col").map((r) => {
      const hitWhen = RV.domain.rules.normalizeHitWhen(r.hitWhen);
      return hitWhen === "zero" ? { col: r.column, hitWhen: "zero" } : r.column;
    }),
    softRules: {
      binary: softRules.filter((r) => r.type === "binary_col").map((r) => {
        const hitWhen = RV.domain.rules.normalizeHitWhen(r.hitWhen);
        return hitWhen === "zero" ? { col: r.column, hitWhen: "zero" } : r.column;
      }),
      numeric: softRules.filter((r) => r.type === "numeric_cmp").map((r) => ({
        column: r.column,
        operator: r.operator,
        threshold: r.threshold,
      })),
      composite: softRules.filter((r) => r.type === "composite").map((r) => ({
        name: r.name,
        root: r.root,
      })),
    },
  };
  const dataAnalysis = collectDataAnalysisConfig();
  if (dataAnalysis) cfg.dataAnalysis = dataAnalysis;
  const validityCfg = collectValidityConfig();
  if (validityCfg) cfg.validity = validityCfg;
  return cfg;
}
function applyRulesConfigSection(rules, warnings) {
  if (!rules || typeof rules !== "object") return;
  if (rules.strategy) {
    RV.app.rulesIo.applyRulesPack("strategy", rules.strategy, warnings);
  }
  if (rules.validityBaselineMode) {
    RV.app.rulesIo.setValidityBaselineMode(rules.validityBaselineMode);
  }
  if (rules.validityBaselineMode === "override" && rules.validityBaseline) {
    RV.app.rulesIo.applyRulesPack("validityBaseline", rules.validityBaseline, warnings);
  } else if (rules.validityBaselineMode === "follow") {
    RV.app.rulesIo.refollowValidityBaselineFromSidebar();
  }
  if (rules.validityCandidate) {
    RV.app.rulesIo.applyRulesPack("validityCandidate", rules.validityCandidate, warnings);
  }
}
function setConfigImportStatus(msg, kind) {
  const el = $("configImportStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
function setCheckboxValues(containerId, values, labelPrefix, warnings) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
  for (const v of values || []) {
    const cb = [...container.querySelectorAll("input[type=checkbox]")].find((x) => x.value === v);
    if (cb) cb.checked = true;
    else warnings.push(`${labelPrefix}「${v}」不存在，已跳过`);
  }
}
async function applyFilterRule(containerId, metaId, scope, filterDef, warnings) {
  const col = filterDef.column;
  if (!col || !S.headers.includes(col)) {
    warnings.push(`筛选列「${col || "(空)"}」不存在，已跳过`);
    return;
  }
  const rule = createFilterRule(containerId, metaId, scope, col, { openEditor: false });
  if (filterDef.mode === "numeric") {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "numeric";
    const enumWrap = rule.querySelector(".filter-rule-enum-wrap");
    const numericWrap = rule.querySelector(".filter-rule-numeric-wrap");
    const timeWrap = rule.querySelector(".filter-rule-time-wrap");
    if (enumWrap) enumWrap.style.display = "none";
    if (numericWrap) numericWrap.style.display = "block";
    if (timeWrap) timeWrap.style.display = "none";
    const opSel = rule.querySelector(".filter-num-op");
    const op = filterDef.op || "gte";
    if (opSel) opSel.value = op;
    updateNumericFilterUI(rule);
    const v1 = rule.querySelector(".filter-num-val");
    const v2 = rule.querySelector(".filter-num-val2");
    if (op === "between") {
      if (filterDef.min != null && v1) v1.value = filterDef.min;
      if (filterDef.max != null && v2) v2.value = filterDef.max;
    } else if (filterDef.value != null && v1) {
      v1.value = filterDef.value;
    }
    const includeMissing = !!filterDef.includeMissing;
    const includeCb = rule.querySelector(".filter-num-include-missing");
    if (includeCb) includeCb.checked = includeMissing;
    RV.ui.sidebar.updateNumericFilterMeta?.(rule, col);
  } else if (filterDef.mode === "time_range") {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "time_range";
    await renderFilterRuleValues(rule, col, "");
    const preferred = {
      min: filterDef.min != null && filterDef.min !== "" ? String(filterDef.min) : "",
      max: filterDef.max != null && filterDef.max !== "" ? String(filterDef.max) : "",
    };
    const minSel = rule.querySelector(".filter-time-min");
    const maxSel = rule.querySelector(".filter-time-max");
    if (minSel && preferred.min && [...minSel.options].some((o) => o.value === preferred.min)) {
      minSel.value = preferred.min;
    }
    if (maxSel && preferred.max && [...maxSel.options].some((o) => o.value === preferred.max)) {
      maxSel.value = preferred.max;
    }
  } else {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "enum";
    const enumWrap = rule.querySelector(".filter-rule-enum-wrap");
    const numericWrap = rule.querySelector(".filter-rule-numeric-wrap");
    const timeWrap = rule.querySelector(".filter-rule-time-wrap");
    if (enumWrap) enumWrap.style.display = "block";
    if (numericWrap) numericWrap.style.display = "none";
    if (timeWrap) timeWrap.style.display = "none";
    await renderFilterRuleValues(rule, col, "");
    const unavailable = setFilterRuleEnumValues(rule, filterDef.values || [], col);
    for (const v of unavailable) {
      warnings.push(`筛选「${col}」取值「${v}」不可用`);
    }
  }
  refreshFilterMeta(containerId, metaId);
}
async function applyFilterRules(containerId, metaId, scope, filters, warnings) {
  const container = $(containerId);
  if (!container) return;
  if (RV.ui.sidebar.usesSampleFilterSchemeB?.(scope)) {
    RV.ui.sidebar.closeSampleFilterEditor(scope);
  }
  container.innerHTML = "";
  S.filterRuleSeq[scope] = S.filterRuleSeq[scope] ?? 0;
  S.filterRuleSeq[scope] = 0;
  for (const f of filters || []) {
    await applyFilterRule(containerId, metaId, scope, f, warnings);
  }
  refreshFilterMeta(containerId, metaId);
}
async function applySampleConfig(prefix, sampleConfig, warnings) {
  if (!sampleConfig) return;
  const dom = RV.sample.getSampleFilterDom(prefix);
  const filterContainerId = dom?.filterRules || (prefix === "pre" ? "preFilterRules" : "postFilterRules");
  const filterMetaId = dom?.filterMeta || (prefix === "pre" ? "preFilterMeta" : "postFilterMeta");
  const filterScope = dom?.filterScope || prefix;

  if (sampleConfig.primaryFilter !== undefined) {
    await applyPrimaryFilter(prefix, sampleConfig.primaryFilter, warnings);
  } else if (sampleConfig.timeCol !== undefined || sampleConfig.timeValues !== undefined) {
    await applyPrimaryFilter(prefix, {
      column: sampleConfig.timeCol || "",
      values: sampleConfig.timeValues || [],
    }, warnings);
  }

  if (sampleConfig.filters !== undefined) {
    await applyFilterRules(filterContainerId, filterMetaId, filterScope, sampleConfig.filters, warnings);
  }

  if (sampleConfig.groupDimensions !== undefined && prefix !== "rvRiskPost" && prefix !== "attr") {
    if (prefix === "post" && !$("tab-post")) {
      RV.ui.report.post.setupPostRiskTabShell(RV.ui.report.analysis.getAnalysisTimeCols());
    }
    if (prefix === "pre" && !$("tab-pre")) {
      RV.ui.report.pre.setupPreStrategyTabShell(RV.ui.report.analysis.getAnalysisTimeCols());
    }
    applySampleGroupDimensions(prefix, sampleConfig.groupDimensions, warnings);
    if (prefix === "post" && S.lastAnalysis?.postRows?.length) {
      void RV.ui.report.post.refreshPostRiskView();
    }
    if (prefix === "pre" && S.lastAnalysis?.preRows?.length) {
      void RV.ui.report.pre.refreshPreStrategyView();
    }
  }
}
function applyRatioRows(ratios, warnings) {
  $("ratioRows").innerHTML = "";
  for (const r of ratios || []) {
    if (!S.headers.includes(r.num)) {
      warnings.push(`比率分子列「${r.num}」不存在，已跳过该比率`);
      continue;
    }
    if (!S.headers.includes(r.den)) {
      warnings.push(`比率分母列「${r.den}」不存在，已跳过该比率`);
      continue;
    }
    addRatioRow({ name: r.name, num: r.num, den: r.den });
  }
}
function applyLegacyGroupDimensions(groupDimensions, warnings) {
  if (!groupDimensions) return;
  if (!$("tab-post")) {
    RV.ui.report.post.setupPostRiskTabShell(getAnalysisTimeCols());
  }
  applySampleGroupDimensions("post", groupDimensions, warnings);
  if (S.lastAnalysis?.postRows?.length) {
    void RV.ui.report.post.refreshPostRiskView();
  }
}
async function applySidebarConfig(config) {
  const warnings = [];

  if (!config || typeof config !== "object") {
    throw new Error("配置格式无效");
  }
  if (config.version !== 1 && config.version !== 2 && config.version !== 3 && config.version !== 4 && config.version !== 5) {
    throw new Error("不支持的配置版本：" + config.version);
  }
  if (!S.rawRows.length) {
    throw new Error("请先加载 CSV 文件");
  }

  const normalized = normalizeSidebarConfig(config);

  if (normalized.ratios !== undefined) applyRatioRows(normalized.ratios, warnings);
  if (normalized.postSample !== undefined) await applySampleConfig("post", normalized.postSample, warnings);
  if (normalized.preSample !== undefined) await applySampleConfig("pre", normalized.preSample, warnings);
  if (normalized.postSample !== undefined || normalized.preSample !== undefined || normalized.ratios !== undefined) {
    if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
      RV.events.invalidateDataAnalysisCache();
    } else {
      RV.ui.report.analysis?.invalidateDataAnalysisCache?.();
    }
  }

  if (normalized.hardRules !== undefined || normalized.softRules !== undefined) {
    applyRuleConfig(normalized.hardRules, normalized.softRules, warnings);
  }

  if (normalized.rules && RV.app.rulesIo) {
    applyRulesConfigSection(normalized.rules, warnings);
  } else if (config.version === 5 && normalized.rules) {
    warnings.push("rules 段已忽略（rules-io 未加载）");
  }

  const legacyGroupDims = normalized.summary?.groupDimensions ?? normalized.groupDimensions;
  if (legacyGroupDims !== undefined) {
    applyLegacyGroupDimensions(legacyGroupDims, warnings);
  }
  const ruleReviewFilter = normalized.postRuleReviewTrendFilter
    ?? normalized.summary?.trendValueFilter;
  if (ruleReviewFilter) {
    S.pendingSummaryImport = { trendValueFilter: ruleReviewFilter };
  }
  refreshDaBadLabelUI();

  if (normalized.dataAnalysis !== undefined && config.version >= 2 && config.version <= 5) {
    applyDataAnalysisConfig(normalized.dataAnalysis, warnings);
  }

  if (normalized.validity !== undefined && config.version >= 4) {
    applyValidityConfig(normalized.validity, warnings);
  }

  return { applied: true, warnings };
}
function applyValidityConfig(v, warnings) {
  if (!v || typeof v !== "object") return;
  if (!$("tab-validity")) {
    setupValidityTabShell(getAnalysisTimeCols(), { syncSidebar: false });
  }
  restoreValidityUiState({
    hardRules: v.hardRules || [],
    softRules: v.softRules || [],
    binaryHitWhen: v.binaryHitWhen || null,
    softNumeric: v.softNumeric || [],
    softComposite: v.softComposite || [],
    validityBaselineMode: v.validityBaselineMode || "follow",
    groupCols: v.groupCols || [],
    groupOrder: v.groupOrder || [],
    customRules: v.customRules || [],
    groupValueFilter: v.groupValueFilter || null,
    waterfallOrder: v.waterfallOrder || null,
  });
  S.pendingValidityImport = v;
}
function applyDataAnalysisConfig(da, warnings) {
  if (!da || typeof da !== "object") return;
  if (!$("tab-analysis")) {
    setupDataAnalysisTabShell(getAnalysisGroupDimensionCandidates(), { showAnalysisTab: false });
  }

  const shared = da.shared || {};
  if ($("daBadMode")) $("daBadMode").value = shared.badMode || "numerator";
  refreshDaBadLabelUI();
  if (shared.badCol && $("daBadCol")) $("daBadCol").value = shared.badCol;
  if ($("daBadThreshold")) $("daBadThreshold").value = shared.badThreshold ?? "0";
  if ($("daSampleScope")) {
    $("daSampleScope").value = shared.sampleScope === "residual_new_pass" ? "residual_new_pass" : "full";
  }

  if (da.eda) {
    applyCheckboxSelection("daEdaVarChecks", da.eda.vars);
    RV.ui.collapsedPicker.applySelection("daEdaVar", da.eda.vars || []);
    const edaSpec = RV.ui.collapsedPicker.getPickerSpec("daEdaVar");
    if (edaSpec && da.eda.showAllColumns != null) {
      edaSpec.showAllColumns = !!da.eda.showAllColumns;
      const showAllCb = $("daEdaVarShowAll");
      if (showAllCb) showAllCb.checked = edaSpec.showAllColumns;
      RV.ui.collapsedPicker.refreshFilterUI("daEdaVar");
    }
    for (const v of da.eda.vars || []) {
      if (!S.headers.includes(v)) warnings.push(`EDA 变量「${v}」不存在，已跳过勾选`);
    }
    const groupCols = da.eda.groupCols ?? (da.eda.groupCol ? [da.eda.groupCol] : []);
    applyCheckboxSelection("daGroupColChecks", groupCols);
    RV.ui.collapsedPicker.applySelection("daEdaGroup", groupCols);
    for (const c of groupCols) {
      if (!S.headers.includes(c)) warnings.push(`EDA 分组标签「${c}」不存在，已跳过勾选`);
    }
    if ($("daIvBins")) $("daIvBins").value = da.eda.ivBins ?? 5;
    S.pendingDaImport = {
      distSelected: da.eda.distSelected,
      groupFilterVars: da.eda.groupFilterVars,
      groupValueFilter: da.eda.groupValueFilter,
    };
  }

  if (da.bin) {
    applyCheckboxSelection("daBinVarChecks", da.bin.vars);
    RV.ui.collapsedPicker.applySelection("daBinVar", da.bin.vars || []);
    for (const v of da.bin.vars || []) {
      if (!S.headers.includes(v)) warnings.push(`分箱变量「${v}」不存在，已跳过勾选`);
    }
    if ($("daBinCount")) $("daBinCount").value = da.bin.nBins ?? 5;
    if ($("daBinMode")) $("daBinMode").value = da.bin.binMode ?? "equal_freq";
    const nBinsClamped = Math.max(2, Math.min(20, parseInt(da.bin.nBins, 10) || 5));
    if (da.bin.binMode === "custom_share" && da.bin.shares?.length) {
      const shareErr = validateCustomBinShares?.(da.bin.shares, nBinsClamped);
      if (shareErr) warnings.push(`分箱自定义占比无效：${shareErr}`);
      else renderBinShareInputs(nBinsClamped, da.bin.shares);
    }
    if (da.bin.binMode === "manual_thresholds" && $("daBinManualThresholds")) {
      const txt = da.bin.manualThresholdText
        || Object.entries(da.bin.manualThresholds || {})
          .map(([k, arr]) => `${k}: ${(arr || []).join(",")}`)
          .join("\n");
      $("daBinManualThresholds").value = txt;
    }
    syncBinModePanel();
    const binSpec = RV.ui.collapsedPicker.getPickerSpec("daBinVar");
    if (binSpec && da.bin.showAllColumns != null) {
      binSpec.showAllColumns = !!da.bin.showAllColumns;
      const showAllCb = $("daBinVarShowAll");
      if (showAllCb) showAllCb.checked = binSpec.showAllColumns;
      RV.ui.collapsedPicker.refreshFilterUI("daBinVar");
    }
    const stratCols = da.bin.stratCols || (da.bin.stratCol ? [da.bin.stratCol] : []);
    applyCheckboxSelection("daBinStratColChecks", stratCols);
    RV.ui.collapsedPicker.applySelection("daBinStrat", stratCols);
    for (const c of stratCols) {
      if (!S.headers.includes(c)) warnings.push(`分箱分层列「${c}」不存在，已跳过勾选`);
    }
    const cross = da.bin.cross || {};
    if ($("daCrossXVar")) $("daCrossXVar").value = cross.xVar || "";
    if ($("daCrossYVar")) $("daCrossYVar").value = cross.yVar || "";
    if ($("daCrossXBinCount")) $("daCrossXBinCount").value = cross.xBins ?? 5;
    if ($("daCrossYBinCount")) $("daCrossYBinCount").value = cross.yBins ?? 5;
    applyCheckboxSelection("daCrossGroupColChecks", cross.groupCols || []);
    RV.ui.collapsedPicker.applySelection("daCrossGroup", cross.groupCols || []);
    for (const c of cross.groupCols || []) {
      if (!S.headers.includes(c)) warnings.push(`二维分组列「${c}」不存在，已跳过勾选`);
    }
    S.pendingDaImport = S.pendingDaImport || {};
    S.pendingDaImport.binVarSelected = da.bin.binVarSelected;
    S.pendingDaImport.stratValueFilter = da.bin.stratValueFilter;
    S.pendingDaImport.crossStratValueFilter = da.bin.crossStratValueFilter;
    S.pendingDaImport.binDrilldowns = da.bin.binDrilldowns || null;
    S.pendingDaImport.binDrilldown = da.bin.binDrilldown || null;
    if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
      RV.events.invalidateDataAnalysisCache();
    } else {
      RV.ui.report.analysis?.invalidateDataAnalysisCache?.();
    }
  } else if (shared.sampleScope) {
    if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
      RV.events.invalidateDataAnalysisCache();
    } else {
      RV.ui.report.analysis?.invalidateDataAnalysisCache?.();
    }
  }
}

  Object.assign(target, { normalizeSidebarConfig, collectValidityConfig, collectDataAnalysisConfig, collectSidebarConfig, setConfigImportStatus, setCheckboxValues, applyFilterRule, applyFilterRules, applySampleConfig, applyRatioRows, applyLegacyGroupDimensions, applySidebarConfig, applyValidityConfig, applyDataAnalysisConfig });
})(window.RV);
