(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const applyFilters = RV.sample.applyFilters;
  const buildDaContext = RV.ui.report.analysis.buildDaContext;
  const buildFullReport = RV.ui.report.post.buildFullReport;
  const buildGroupDistSpecs = RV.domain.eda.buildGroupDistSpecs;
  const initDefaultRuleConfig = RV.ui.sidebar.initDefaultRuleConfig;
  const initPrimaryFilterPanel = RV.ui.sidebar.initPrimaryFilterPanel;
  const setImportConfigEnabled = RV.ui.sidebar.setImportConfigEnabled;
  const clearColumnUniquesCache = RV.data.clearColumnUniquesCache;
  const buildGroupDimensionCandidates = RV.data.buildGroupDimensionCandidates;
  const getLastCsvEncoding = RV.infra.getLastCsvEncoding;
  const collectCustomRulesFromUI = RV.ui.report.validity.collectCustomRulesFromUI;
  const collectRatioSpecs = RV.ui.sidebar.collectRatioSpecs;
  const collectRulesFromUI = RV.ui.sidebar.collectRulesFromUI;
  const collectValidityHardRules = RV.ui.report.validity.collectValidityHardRules;
  const collectValiditySoftRules = RV.ui.report.validity.collectValiditySoftRules;
  const computeBinRiskTables = RV.domain.binning.computeBinRiskTables;
  const computeCrossBinRiskTables = RV.domain.binning.computeCrossBinRiskTables;
  const computeCorrelationMatrix = RV.domain.eda.computeCorrelationMatrix;
  const computeHitMetrics = RV.domain.preStrategy.computeHitMetrics;
  const computePostRisk = RV.domain.postRisk.computePostRisk;
  const computePreGroupOverview = RV.domain.preStrategy.computePreGroupOverview;
  const computeSummary = RV.domain.summary.computeSummary;
  const computeValidityCrossTable = RV.domain.validity.computeValidityCrossTable;
  const computeValidityPreHitTable = RV.domain.validity.computeValidityPreHitTable;
  const computeValidityPostWaterfallRisk = RV.domain.validity.computeValidityPostWaterfallRisk;
  const computeValiditySwapTable = RV.domain.validity.computeValiditySwapTable;
  const computeVarMetrics = RV.domain.eda.computeVarMetrics;
  const computeVarMissingStats = RV.domain.eda.computeVarMissingStats;
  const computeWaterfall = RV.domain.preStrategy.computeWaterfall;
  const customRulesAsSoftRules = RV.domain.validity.customRulesAsSoftRules;
  const dedupeWaterfallRules = RV.domain.validity.dedupeWaterfallRules;
  const defaultRatioRows = RV.ui.sidebar.defaultRatioRows;
  const fillSelect = RV.ui.sidebar.fillSelect;
  const getBinConfigFromDom = RV.ui.report.analysis.getBinConfigFromDom;
  const getChecked = RV.ui.sidebar.getChecked;
  const getSampleConfig = RV.sample.getSampleConfig;
  const getSampleGroupCols = RV.ui.sidebar.getSampleGroupCols;
  const getValidityGroupCols = RV.ui.report.validity.getValidityGroupCols;
  const inferColumns = RV.data.inferColumns;
  const initDataAnalysisTab = RV.ui.report.analysis.initDataAnalysisTab;
  const initPostRiskTabShell = RV.ui.report.post.initPostRiskTabShell;
  const initPreStrategyTabShell = RV.ui.report.pre.initPreStrategyTabShell;
  const initValidityTab = RV.ui.report.validity.initValidityTab;
  const initProfitabilityTab = RV.ui.report.profitability.initProfitabilityTab;
  const initRiskTargetTab = RV.ui.report.riskTarget.initRiskTargetTab;
  const initElAllocatorTab = RV.ui.report.elAllocator.initElAllocatorTab;
  const initAttributionTab = RV.ui.report.attribution.initAttributionTab;
  const initDailyReviewTab = RV.ui.report.dailyReview.initDailyReviewTab;
  const remountProfitabilityTabAfterReport = RV.ui.report.profitability.remountProfitabilityTabAfterReport;
  const remountRiskTargetTabAfterReport = RV.ui.report.riskTarget.remountRiskTargetTabAfterReport;
  const remountElAllocatorTabAfterReport = RV.ui.report.elAllocator.remountElAllocatorTabAfterReport;
  const remountAttributionTabAfterReport = RV.ui.report.attribution.remountAttributionTabAfterReport;
  const remountDailyReviewTabAfterReport = RV.ui.report.dailyReview.remountDailyReviewTabAfterReport;
  const snapshotProfitabilityUiState = RV.ui.report.profitability.snapshotProfitabilityUiState;
  const snapshotRiskTargetUiState = RV.ui.report.riskTarget.snapshotRiskTargetUiState;
  const snapshotElAllocatorUiState = RV.ui.report.elAllocator.snapshotElAllocatorUiState;
  const snapshotAttributionUiState = RV.ui.report.attribution.snapshotAttributionUiState;
  const snapshotDailyReviewUiState = RV.ui.report.dailyReview.snapshotDailyReviewUiState;
  const refreshRiskEstView = RV.ui.report.validity.refreshRiskEstView;
  const refreshPostRuleReviewTrendTable = RV.ui.report.postRuleReview.refreshPostRuleReviewTrendTable;
  const remountDataAnalysisTabAfterReport = RV.ui.report.analysis.remountDataAnalysisTabAfterReport;
  const remountPostTabAfterReport = RV.ui.report.post.remountPostTabAfterReport;
  const remountPreTabAfterReport = RV.ui.report.pre.remountPreTabAfterReport;
  const remountValidityTabAfterReport = RV.ui.report.validity.remountValidityTabAfterReport;
  const renderValidityResults = RV.ui.report.validity.renderValidityResults;
  const setConfigImportStatus = RV.app.config.setConfigImportStatus;
  const setDaBinStatus = RV.ui.report.analysis.setDaBinStatus;
  const formatBinShareDeviationStatus = RV.ui.report.analysis.formatBinShareDeviationStatus;
  const setDaEdaStatus = RV.ui.report.analysis.setDaEdaStatus;
  const clearValidityResultsStale = RV.ui.report.validity.clearValidityResultsStale;
  const setRvValidityStatus = RV.ui.report.validity.setRvValidityStatus;
  const showTab = RV.ui.report.post.showTab;
  const snapshotDataAnalysisUiState = RV.ui.report.analysis.snapshotDataAnalysisUiState;
  const snapshotPostUiState = RV.ui.report.post.snapshotPostUiState;
  const snapshotPreUiState = RV.ui.report.pre.snapshotPreUiState;
  const snapshotValidityUiState = RV.ui.report.validity.snapshotValidityUiState;
  const syncHeadersFromRows = RV.data.syncHeadersFromRows;
  const updateBinResults = RV.ui.report.analysis.updateBinResults;
  const updateEdaResults = RV.ui.report.analysis.updateEdaResults;
  const validateBinConfig = RV.ui.report.analysis.validateBinConfig;
  const validateUniBinConfig = (...args) => (RV.ui.report.analysis.validateUniBinConfig || validateBinConfig)(...args);
  const validateCrossBinConfig = (...args) => (RV.ui.report.analysis.validateCrossBinConfig || (() => "缺少交叉分箱校验"))(...args);
  const validateEdaConfig = RV.ui.report.analysis.validateEdaConfig;
  const validateValidityConfig = RV.ui.report.validity.validateValidityConfig;
  var app = RV.app = RV.app || {};
  var target = app.orchestrator = app.orchestrator || {};

function setLoadStatus(msg, kind) {
  const el = $("loadStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
function setAnalyzeStatus(msg, kind) {
  const el = $("analyzeStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

async function runAnalysis() {
  if (S.analysisBusy || !S.rawRows.length) return;
  S.analysisBusy = true;
  $("btnAnalyze").disabled = true;
  setAnalyzeStatus("分析中…");

  try {
    const preCfg = getSampleConfig("pre");
    const postCfg = getSampleConfig("post");
    const { hardRules, softRules } = collectRulesFromUI();
    const ratioSpecs = collectRatioSpecs();
    const postGroupCols = getSampleGroupCols("post");
    const preGroupCols = getSampleGroupCols("pre");

    setAnalyzeStatus("切片贷前样本…");
    let preRows = applyFilters(S.rawRows, preCfg);
    setAnalyzeStatus(`贷前 ${preRows.length.toLocaleString()} 行，计算命中率…`);
    const hitMetrics = await computeHitMetrics(preRows, hardRules, softRules, (d, t) => {
      setAnalyzeStatus(`命中率 ${d.toLocaleString()} / ${t.toLocaleString()}`);
    });

    setAnalyzeStatus("贷前分组汇总…");
    const preGroup = await computePreGroupOverview(preRows, preGroupCols, (d, t) => {
      setAnalyzeStatus(`贷前分组 ${d.toLocaleString()} / ${t.toLocaleString()}`);
    });

    setAnalyzeStatus("切片贷后样本…");
    let postRows = applyFilters(S.rawRows, postCfg);
    setAnalyzeStatus(`贷后 ${postRows.length.toLocaleString()} 行，风险分析…`);
    const postRisk = await computePostRisk(postRows, ratioSpecs, postGroupCols, (d, t) => {
      setAnalyzeStatus(`风险 ${d.toLocaleString()} / ${t.toLocaleString()}`);
    });

    const waterfallOrder = [...hardRules, ...softRules];
    setAnalyzeStatus("瀑布分析…");
    const waterfall = await computeWaterfall(preRows, waterfallOrder);

    setAnalyzeStatus("贷后规则复盘…");
    const summary = await computeSummary(postRows, hardRules, softRules, postGroupCols, waterfallOrder, ratioSpecs);

    S.lastAnalysis = {
      preCfg, postCfg, hardRules, softRules, hitMetrics, postRisk, preGroup, waterfall, summary,
      waterfallOrder, preRows, postRows, preGroupCols, postGroupCols, ratioSpecs,
    };

    const reportData = {
      preCfg, postCfg, hitMetrics, postRisk, preGroup, summary, waterfall, ratioSpecs,
      preCount: S.rawRows.length, preRowsCount: preRows.length, postCount: postRows.length,
    };
    S.lastReportHtml = buildFullReport(reportData);
    const priorDaState = snapshotDataAnalysisUiState();
    const priorPostState = snapshotPostUiState();
    const priorPreState = snapshotPreUiState();
    const priorValidityState = snapshotValidityUiState();
    const priorProfitabilityState = snapshotProfitabilityUiState();
    const priorRiskTargetState = snapshotRiskTargetUiState();
    const priorElAllocatorState = snapshotElAllocatorUiState();
    const priorAttributionState = snapshotAttributionUiState();
    const priorDailyReviewState = snapshotDailyReviewUiState();
    $("report-output").innerHTML = S.lastReportHtml;
    // Eager: tabs shown immediately after analyze
    remountPostTabAfterReport(priorPostState, reportData);
    remountPreTabAfterReport(priorPreState, reportData);
    S.tabsMounted = { post: true, pre: true, analysis: false, validity: false, profitability: false, riskTarget: false, elAllocator: false, attribution: false, dailyReview: false };
    // Deferred: remount on first visit (see ensureTabMounted)
    S.pendingTabRemounts = {
      analysis: () => remountDataAnalysisTabAfterReport(priorDaState),
      validity: () => remountValidityTabAfterReport(priorValidityState),
      profitability: () => remountProfitabilityTabAfterReport(priorProfitabilityState),
      riskTarget: () => remountRiskTargetTabAfterReport(priorRiskTargetState),
      elAllocator: () => remountElAllocatorTabAfterReport(priorElAllocatorState),
      attribution: () => remountAttributionTabAfterReport(priorAttributionState),
      dailyReview: () => remountDailyReviewTabAfterReport(priorDailyReviewState),
    };
    $("reportTabs").style.display = "flex";
    showTab("post");
    refreshPostRuleReviewTrendTable();

    $("btnDownload").disabled = false;
    setAnalyzeStatus("分析完成", "ok");
    RV.domain.rules.clearHitMaskCache?.();
    RV.ui.report.post.clearMainReportStale?.();
  } catch (err) {
    console.error(err);
    setAnalyzeStatus("分析失败：" + (err.message || err), "err");
  } finally {
    S.analysisBusy = false;
    $("btnAnalyze").disabled = !S.rawRows.length;
  }
}
async function runEdaAnalysis() {
  if (S.daAnalysisBusy || !S.rawRows.length) return;
  const err = validateEdaConfig();
  if (err) { setDaEdaStatus(err, "err"); return; }

  S.daAnalysisBusy = true;
  $("btnRunEdaAnalysis").disabled = true;
  setDaEdaStatus("EDA 分析中…");

  try {
    const edaVars = RV.ui.report.analysis.getEdaVarSelection
      ? RV.ui.report.analysis.getEdaVarSelection()
      : getChecked($("daEdaVarChecks"));
    const groupCols = RV.ui.report.analysis.getEdaGroupColSelection
      ? RV.ui.report.analysis.getEdaGroupColSelection()
      : getChecked($("daGroupColChecks"));
    let ivBins = parseInt($("daIvBins")?.value, 10) || 5;
    ivBins = Math.max(3, Math.min(20, ivBins));

    setDaEdaStatus("切片贷后样本…");
    const base = buildDaContext({ needPreRows: false });
    const { postRows, y } = base;

    setDaEdaStatus("物化变量列…");
    const colCache = RV.domain.eda.materializeScoreColumns(postRows, edaVars);
    await new Promise((r) => setTimeout(r, 0));

    setDaEdaStatus("计算缺失率…");
    const missingStats = edaVars.map((v) => computeVarMissingStats(postRows, v, colCache));

    setDaEdaStatus("计算相关性…");
    const correlation = await computeCorrelationMatrix(postRows, edaVars, (d, t) => {
      setDaEdaStatus(`相关性 ${d}/${t}`);
    }, colCache);

    setDaEdaStatus("建立分组索引…");
    const groupIndex = RV.domain.eda.buildGroupIndex(postRows, groupCols);
    const withDist = !!(groupIndex.cols && groupIndex.cols.length);

    setDaEdaStatus("计算 AUC/KS/IV…");
    const metricsByVar = [];
    for (let i = 0; i < edaVars.length; i++) {
      metricsByVar.push(computeVarMetrics(postRows, y, edaVars[i], groupCols, ivBins, {
        colCache,
        groupIndex,
        withDist,
      }));
      if (i % 2 === 0) {
        setDaEdaStatus(`指标 ${i + 1}/${edaVars.length}`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const distSpecs = withDist
      ? buildGroupDistSpecs(postRows, y, edaVars, groupCols, { metricsByVar })
      : [];

    if (!S.lastDataAnalysis) S.lastDataAnalysis = {};
    S.lastDataAnalysis.eda = {
      vars: edaVars, groupCols, ivBins, missingStats, correlation, metricsByVar, distSpecs,
      distChartsShown: Math.min(C.DEFAULT_DIST_CHARTS || 3, edaVars.length),
    };

    updateEdaResults({ initial: true });
    RV.ui.report.analysis.clearDaResultsStale?.();
    RV.ui.report.analysis.collapseDaConfigAfterRun?.("eda");
    setDaEdaStatus("EDA 分析完成", "ok");
  } catch (e) {
    console.error(e);
    setDaEdaStatus("失败：" + (e.message || e), "err");
  } finally {
    S.daAnalysisBusy = false;
    $("btnRunEdaAnalysis").disabled = !S.rawRows.length;
  }
}
async function runBinAnalysis() {
  if (S.daBinUniBusy || S.daAnalysisBusy || !S.rawRows.length) return;
  const err = validateUniBinConfig();
  if (err) { setDaBinStatus(err, "err"); return; }

  S.daBinUniBusy = true;
  const uniBtn = $("btnRunBinAnalysis");
  if (uniBtn) uniBtn.disabled = true;
  RV.ui.report.analysis.refreshBinRunButtonState?.();
  setDaBinStatus("单变量分箱分析中…");

  try {
    const binCfg = getBinConfigFromDom();
    setDaBinStatus("切片贷后/贷前样本…");
    const base = buildDaContext();
    const { postRows, preRows, ratioSpec, overallRisk } = base;
    const { hardRules, softRules } = collectRulesFromUI();
    base.hardRules = hardRules;
    base.softRules = softRules;
    if (!S.lastDataAnalysis) S.lastDataAnalysis = {};
    S.lastDataAnalysis.base = base;

    setDaBinStatus("计算单变量分箱 Lift…");
    const { tables: binTables, excludedByVar, shareDeviationByVar } = computeBinRiskTables(
      postRows, preRows, hardRules, softRules,
      binCfg.vars, binCfg.nBins, binCfg.stratCols, ratioSpec, overallRisk.rate,
      binCfg.binMode, binCfg.shares, binCfg.showSpecialBins, binCfg.manualThresholds
    );

    const prev = S.lastDataAnalysis.bin || {};
    S.lastDataAnalysis.bin = {
      ...prev,
      vars: binCfg.vars, nBins: binCfg.nBins, stratCols: binCfg.stratCols, binTables,
      binMode: binCfg.binMode, shares: binCfg.shares, manualThresholds: binCfg.manualThresholds, showSpecialBins: binCfg.showSpecialBins,
      binTrackMode: binCfg.binTrackMode || "uni",
      crossEnabled: prev.crossEnabled != null ? prev.crossEnabled : !!binCfg.crossEnabled,
      // Preserve independently-run cross results
      cross2d: prev.cross2d || null,
      excludedByVar, shareDeviationByVar,
      drilldowns: {},
      drilldownLastVar: null,
      drilldown: null,
    };

    updateBinResults();
    RV.ui.report.analysis.clearDaResultsStale?.();
    RV.ui.report.analysis.collapseDaConfigAfterRun?.("bin");
    const shareWarn = formatBinShareDeviationStatus(shareDeviationByVar);
    setDaBinStatus(shareWarn ? `单变量分箱完成 · ${shareWarn}` : "单变量分箱完成", shareWarn ? "warn" : "ok");
  } catch (e) {
    console.error(e);
    setDaBinStatus("失败：" + (e.message || e), "err");
  } finally {
    S.daBinUniBusy = false;
    RV.ui.report.analysis.refreshBinRunButtonState?.();
  }
}

async function runCrossBinAnalysis() {
  if (S.daBinCrossBusy || S.daAnalysisBusy || !S.rawRows.length) return;
  const err = validateCrossBinConfig();
  if (err) { setDaBinStatus(err, "err"); return; }

  S.daBinCrossBusy = true;
  const crossBtn = $("btnRunCrossBinAnalysis");
  if (crossBtn) crossBtn.disabled = true;
  RV.ui.report.analysis.refreshBinRunButtonState?.();
  setDaBinStatus("二维交叉分箱分析中…");

  try {
    const binCfg = getBinConfigFromDom();
    setDaBinStatus("切片贷后样本…");
    // Do not clobber uni drill context (preRows / hard+soft rules) on the shared base.
    const work = buildDaContext({ needPreRows: false, persist: false });
    const { postRows, ratioSpec } = work;
    if (!S.lastDataAnalysis) S.lastDataAnalysis = {};
    const commitBase = RV.ui.report.analysis.commitDaBaseAfterCrossRun;
    if (typeof commitBase === "function") commitBase(work);
    else {
      S.lastDataAnalysis.base = work;
      RV.ui.report.analysis.updateDaSharedSummary?.(work);
    }

    const cross = binCfg.cross;
    setDaBinStatus("计算二维交叉风险矩阵…");
    const cross2d = computeCrossBinRiskTables(
      postRows,
      cross.xVar,
      cross.yVar,
      cross.xBins,
      cross.yBins,
      cross.groupCols,
      ratioSpec,
      binCfg.manualThresholdsForCross || binCfg.manualThresholds
    );

    const prev = S.lastDataAnalysis.bin || {};
    S.lastDataAnalysis.bin = {
      ...prev,
      binTrackMode: "cross",
      crossEnabled: true,
      cross2d,
      // Preserve independently-run uni results
      binTables: prev.binTables || null,
      vars: prev.vars || [],
      stratCols: prev.stratCols || [],
    };

    if ($("daBinResults") && !prev.binTables) {
      updateBinResults();
    } else {
      // Ensure result shell exists, then refresh cross section only if possible
      if (!$("daCrossBinTablesMount")) updateBinResults();
      else {
        const title = $("daCrossBinSection")?.querySelector("h3");
        if (title) title.textContent = `二维交叉分箱结果（${cross.xVar} × ${cross.yVar}）`;
        RV.ui.report.analysis.buildCrossStratValueFilter?.(
          cross2d?.tables || [],
          cross2d?.stratCols || [],
          null
        );
        RV.ui.report.analysis.refreshCrossBinTables?.();
        const sec = $("daCrossBinSection");
        if (sec) sec.style.display = "";
      }
    }
    RV.ui.report.analysis.clearDaResultsStale?.();
    RV.ui.report.analysis.collapseDaConfigAfterRun?.("bin");
    setDaBinStatus("二维交叉分箱完成", "ok");
  } catch (e) {
    console.error(e);
    setDaBinStatus("失败：" + (e.message || e), "err");
  } finally {
    S.daBinCrossBusy = false;
    RV.ui.report.analysis.refreshBinRunButtonState?.();
  }
}
async function runValidityAnalysis() {
  if (S.validityAnalysisBusy || !S.rawRows.length) return;
  const err = validateValidityConfig();
  if (err) { setRvValidityStatus(err, "err"); return; }

  S.validityAnalysisBusy = true;
  const btn = $("btnRunValidityCheck");
  if (btn) btn.disabled = true;
  setRvValidityStatus("有效性检查中…");

  try {
    const baseline = RV.app.rulesIo?.collectEffectiveValidityBaseline
      ? RV.app.rulesIo.collectEffectiveValidityBaseline()
      : { hardRules: collectValidityHardRules(), softRules: collectValiditySoftRules() };
    const hardRules = baseline.hardRules;
    const softRules = baseline.softRules;
    const customRules = collectCustomRulesFromUI();
    const groupCols = getValidityGroupCols();
    const ratioSpec = collectRatioSpecs()[0];
    const postRows = applyFilters(S.rawRows, getSampleConfig("post"));

    setRvValidityStatus("计算四象限交叉…");
    const result = await computeValidityCrossTable(
      postRows, hardRules, softRules, customRules, groupCols, ratioSpec,
      (d, t) => setRvValidityStatus(`四象限 ${d}/${t}…`)
    );

    setRvValidityStatus("计算 Swap 分析…");
    const preRows = applyFilters(S.rawRows, getSampleConfig("pre"));
    const swapRows = await computeValiditySwapTable(
      preRows, postRows, hardRules, softRules, customRules, groupCols, ratioSpec,
      (d, t) => setRvValidityStatus(`Swap 分析 ${d}/${t}…`)
    );

    setRvValidityStatus("计算贷前命中…");
    const waterfallOrder = dedupeWaterfallRules([...hardRules, ...customRulesAsSoftRules(customRules)]);
    const preHitRows = await computeValidityPreHitTable(
      preRows, hardRules, customRules, groupCols, waterfallOrder,
    );

    setRvValidityStatus("计算贷后瀑布风险…");
    const postWaterfallRisk = await computeValidityPostWaterfallRisk(
      postRows, hardRules, customRules, waterfallOrder,
    );

    S.lastValidityAnalysis = {
      ...result, ratioSpec, hardRules, softRules, customRules,
      preRows, postRows, swapRows, preHitRows, postWaterfallRisk, waterfallOrder,
    };
    renderValidityResults(S.lastValidityAnalysis, ratioSpec, {
      rebuildGroupFilter: true,
      refreshPreHit: false, refreshSwap: false, refreshRiskEst: false, refreshPostWaterfallRisk: false,
    });
    void refreshRiskEstView({ fullRerender: true });
    clearValidityResultsStale();
    RV.ui.report.validity.collapseValidityConfigAfterRun?.();
    setRvValidityStatus("有效性检查完成", "ok");
  } catch (e) {
    console.error(e);
    setRvValidityStatus("失败：" + (e.message || e), "err");
  } finally {
    S.validityAnalysisBusy = false;
    if (btn) btn.disabled = !S.rawRows.length;
  }
}
async function onCsvLoaded(result) {
  S.rawRows = result.data;
  syncHeadersFromRows();
  clearColumnUniquesCache();
  inferColumns();
  RV.domain.rules.clearHitMaskCache?.();
  RV.ui.report.attribution?.clearAttributionAnalysisCache?.();
  RV.ui.sidebar.closeSampleFilterEditor?.("attr");
  if ($("attrFilterRules")) $("attrFilterRules").innerHTML = "";
  if ($("attrPrimaryFilter")) $("attrPrimaryFilter").innerHTML = "";
  RV.ui.sidebar.refreshFilterMeta?.("attrFilterRules", "attrFilterMeta");

  $("panelPostSample").hidden = false;
  $("panelPreSample").hidden = false;
  $("panelRules").hidden = false;
  $("btnAnalyze").disabled = false;
  setImportConfigEnabled(true);
  RV.events?.updateWorkflowStatus?.();
  RV.events?.refreshTabAvailability?.();

  const timeCandidates = S.headers.filter((h) =>
    /月份|日期|时间|month|date/i.test(h) || S.enumCols.includes(h)
  );
  const timeCols = timeCandidates.length ? timeCandidates : S.enumCols.slice(0, 20);
  const groupCandidates = buildGroupDimensionCandidates();
  S.groupDimCandidates = groupCandidates;

  const defaultPostCol = S.headers.includes("放款月份") ? "放款月份" : "申请月份";
  const defaultPreCol = S.headers.includes("申请月份") ? "申请月份" : defaultPostCol;
  initPrimaryFilterPanel("post", timeCols, defaultPostCol);
  initPrimaryFilterPanel("pre", timeCols, defaultPreCol);

  $("postFilterRules").innerHTML = "";
  $("preFilterRules").innerHTML = "";
  S.filterRuleSeq = { post: 0, pre: 0, rvRiskPost: 0, attr: 0 };
  S.sampleFilterEditing = null;
  RV.ui.sidebar.closeSampleFilterEditor("post");
  RV.ui.sidebar.closeSampleFilterEditor("pre");
  RV.ui.sidebar.renderSampleExtraFilterTags("post");
  RV.ui.sidebar.renderSampleExtraFilterTags("pre");

  initDefaultRuleConfig();

  defaultRatioRows();
  initPostRiskTabShell(groupCandidates);
  initPreStrategyTabShell(groupCandidates);
  initDataAnalysisTab(groupCandidates);
  initValidityTab(groupCandidates);
  initProfitabilityTab();
  initRiskTargetTab();
  initElAllocatorTab();
  initAttributionTab();
  initDailyReviewTab();

  const enc = getLastCsvEncoding();
  const encHint = enc ? ` · 编码 ${enc}` : "";
  setLoadStatus(`已加载 ${S.rawRows.length.toLocaleString()} 行，${S.headers.length} 列；0-1列 ${S.binaryCols.length}，数值列 ${S.numCols.length}${encHint}`, "ok");
  setConfigImportStatus("");
}

function ensureTabMounted(tabId) {
  if (!S.pendingTabRemounts) return;
  const fn = S.pendingTabRemounts[tabId];
  if (typeof fn !== "function") return;
  try {
    fn();
    S.tabsMounted = S.tabsMounted || {};
    S.tabsMounted[tabId] = true;
  } catch (err) {
    console.error("ensureTabMounted failed", tabId, err);
  }
  delete S.pendingTabRemounts[tabId];
}

function flushPendingTabRemounts() {
  if (!S.pendingTabRemounts) return;
  for (const tabId of Object.keys(S.pendingTabRemounts)) {
    ensureTabMounted(tabId);
  }
}

  Object.assign(target, { setLoadStatus, setAnalyzeStatus, runAnalysis, runEdaAnalysis, runBinAnalysis, runCrossBinAnalysis, runValidityAnalysis, onCsvLoaded, ensureTabMounted, flushPendingTabRemounts });
})(window.RV);
