(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const applyFilters = RV.sample.applyFilters;
  const collectSampleFilterExport = RV.sample.collectSampleFilterExport;
  const collectRatioSpecs = RV.ui.sidebar.collectRatioSpecs;
  const getSampleConfig = RV.sample.getSampleConfig;
  const parseNum = RV.infra.parseNum;
  const aggregateQuadrantRows = RV.domain.validity.aggregateQuadrantRows;
  const applyCheckboxSelection = RV.ui.report.analysis.applyCheckboxSelection;
  const applySampleConfig = (...args) => RV.app.config.applySampleConfig(...args);
  const getPrimaryFilterConfig = RV.ui.sidebar.getPrimaryFilterConfig;
  const initPrimaryFilterPanel = RV.ui.sidebar.initPrimaryFilterPanel;
  const compareDimValue = RV.infra.compareDimValue;
  const computeRiskEstTable = RV.domain.validity.computeRiskEstTable;
  const computeValidityPreHitTable = RV.domain.validity.computeValidityPreHitTable;
  const computeValidityPostWaterfallRisk = RV.domain.validity.computeValidityPostWaterfallRisk;
  const computeValiditySwapTable = RV.domain.validity.computeValiditySwapTable;
  const customRulesAsSoftRules = RV.domain.validity.customRulesAsSoftRules;
  const dedupeWaterfallRules = RV.domain.validity.dedupeWaterfallRules;
  const emptySwapSegmentAgg = RV.domain.validity.emptySwapSegmentAgg;
  const ensureReportDocument = RV.ui.report.analysis.ensureReportDocument;
  const esc = RV.infra.esc;
  const exportRefreshValidityFilteredViews = (...args) => RV.export.exportRefreshValidityFilteredViews(...args);
  const fillSelect = RV.ui.sidebar.fillSelect;
  const filterCheckboxGrid = RV.ui.report.analysis.filterCheckboxGrid;
  const filterPreRowsByRvGroupFilter = RV.domain.validity.filterPreRowsByRvGroupFilter;
  const fmtNum = RV.infra.fmtNum;
  const getAnalysisGroupDimensionCandidates = RV.ui.report.analysis.getAnalysisGroupDimensionCandidates;
  const getAnalysisTimeCols = RV.ui.report.analysis.getAnalysisTimeCols;
  const getChecked = RV.ui.sidebar.getChecked;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const withHintHtml = RV.infra.withHintHtml;
  const getRvPreHitFirstGroupKey = RV.domain.validity.getRvPreHitFirstGroupKey;
  const getSampleGroupCols = RV.ui.sidebar.getSampleGroupCols;
  const initResizableTables = RV.ui.report.analysis.initResizableTables;
  const initSampleGroupPanel = RV.ui.sidebar.initSampleGroupPanel;
  function isExportMode() { return !!(RV.export?.isExportMode && RV.export.isExportMode()); }
  const metricHeatCell = RV.infra.metricHeatCell;
  const moveWaterfallPlaceholder = RV.ui.report.pre.moveWaterfallPlaceholder;
  const pct = RV.infra.pct;
  const pivotQuadrantAggregates = RV.domain.validity.pivotQuadrantAggregates;
  const refreshSampleGroupOrderIndexes = RV.ui.sidebar.refreshSampleGroupOrderIndexes;
  const riskEstHeatScale = RV.infra.riskEstHeatScale;
  const showExportStaticNotice = (...args) => RV.export.showExportStaticNotice(...args);
  const sortGroupKeys = RV.infra.sortGroupKeys;
  const sortPivotQuadrantRows = RV.domain.validity.sortPivotQuadrantRows;
  const swapRiskHeatScale = RV.infra.swapRiskHeatScale;
  const syncSampleGroupOrderList = RV.ui.sidebar.syncSampleGroupOrderList;
  const validityPivotHeatScales = RV.infra.validityPivotHeatScales;
  const waterfallOrderKey = RV.ui.report.pre.waterfallOrderKey;
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  var target = report.validity = report.validity || {};
  const CP = () => RV.ui.collapsedPicker;

function rvGroupValuePickerId(col) {
  return `rvGroupValue:${col}`;
}

function registerRvGroupValueDimPicker(col) {
  const pickerId = rvGroupValuePickerId(col);
  CP().registerDimPicker(pickerId, {
    onChange: () => {
      if (S.lastValidityAnalysis) {
        renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec);
      }
    },
  });
}

function initRvGroupValueDimPickers(groupCols, savedFilter, dimValues) {
  for (const col of groupCols || []) {
    registerRvGroupValueDimPicker(col);
    const pickerId = rvGroupValuePickerId(col);
    const vals = dimValues?.[col] || [];
    const saved = savedFilter?.[col];
    CP().initDimPicker(pickerId, {
      values: vals,
      selected: savedFilter?.[col] !== undefined ? savedFilter[col] : vals,
    });
  }
}

function syncRvGroupValueDimPickers(groupCols) {
  for (const col of groupCols || []) {
    const pickerId = rvGroupValuePickerId(col);
    if (CP().getPickerSpec(pickerId)) CP().syncUI(pickerId);
  }
}

function setRvValidityStatus(msg, kind) {
  const el = $("rvValidityStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
function refreshRvGroupColSearch() {
  RV.ui.collapsedPicker.refreshFilterUI("rvGroup");
}
function renderValidityTabShell() {
  return `<section id="tab-validity"><h2 class="rv-heading-with-hint">规则有效性检查${hintBadgeHtml("贷后四象限+贷前 Swap；跑完可收拢配置")}</h2>
    <div id="rvStaleBanner" class="rv-stale-banner" role="status">
      <span>侧栏样本/规则/比率已变，有效性结果可能过期。</span>
      <button type="button" class="btn btn-secondary btn-sm" id="rvStaleRerunBtn">重跑有效性检查</button>
    </div>
    <div class="rv-wb-zone rv-wb-config">
      <div class="rv-wb-zone-label">配置</div>
    <div class="da-panel-stack">
      <div class="da-config-panel rv-validity-rules-panel" id="rvPanelBaseline">
        <div class="da-panel-header" data-config-panel-toggle="rvPanelBaseline" role="button" tabindex="0">
          <span class="da-panel-num">1</span>
          <span class="da-panel-title-text">Baseline（线上策略）${hintBadgeHtml("镜像左侧规则；挖规写入 Candidates")}</span>
          <span class="da-panel-summary" id="rvPanelBaselineSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
        <p id="rvBaselineModeHint" class="config-muted rv-baseline-mode-hint follow" style="font-size:.78rem;margin:0 0 .35rem"></p>
        <div class="rule-config-actions rules-pack-toolbar" style="margin-bottom:.5rem">
          <button type="button" class="btn btn-secondary btn-sm" id="rvExportBaselineRules">导出 validity-baseline-rules.json</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rvImportBaselineRules">导入 baseline 规则包</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rvBaselineRefollowSidebar" style="display:none">重新跟随左侧</button>
          <input type="file" id="validityBaselineRulesFile" accept=".json,application/json" hidden />
        </div>
        <p id="validityBaselineRulesImportStatus" class="status" style="min-height:1rem;margin:0 0 .35rem;font-size:.78rem"></p>
        ${RV.ui.ruleRows.renderAddToolbarHtml("rvBaseline")}
        <div id="rvBaselineRuleRows" class="rule-config-rows" data-rule-role="baseline"></div>
        </div>
      </div>
      <div class="da-config-panel" id="rvPanelGroup">
        <div class="da-panel-header" data-config-panel-toggle="rvPanelGroup" role="button" tabindex="0">
          <span class="da-panel-num">2</span>
          <span class="da-panel-title-text rv-heading-with-hint">分组变量${hintBadgeHtml(RV.infra.plainTipText("默认从贷后复制；改后需重跑有效性"), { aria: "分组变量" })}</span>
          <span class="da-panel-summary" id="rvPanelGroupSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
        ${RV.ui.sidebar.renderGroupConfigBlock("rv", {
          omitTitle: true,
          hint: "",
          filterNote: "",
          highCardHint: "",
          extraActionsHtml: `<div class="group-config-actions"><button type="button" class="btn btn-secondary btn-sm" id="rvCopyPostGroupBtn">从贷后复制分组</button></div>`,
        })}
        </div>
      </div>
      <div class="da-config-panel rv-custom-rules-panel" id="rvPanelCandidate">
        <div class="da-panel-header" data-config-panel-toggle="rvPanelCandidate" role="button" tabindex="0">
          <span class="da-panel-num">3</span>
          <span class="da-panel-title-text">Candidates（候选拒人）${hintBadgeHtml("四象限纵轴拒人候选；找好人写入拒补集")}</span>
          <span class="da-panel-summary" id="rvPanelCandidateSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
        <div class="rule-config-actions rules-pack-toolbar" style="margin-bottom:.35rem">
          <button type="button" class="btn btn-secondary btn-sm" id="rvExportCandidateRules">导出 validity-candidate-rules.json</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rvImportCandidateRules">导入 candidate 规则包</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rvSyncCandidatesToSidebar" title="将 Panel3 候选写入左侧规则配置（软/复合）">同步候选到左侧规则</button>
          <input type="file" id="validityCandidateRulesFile" accept=".json,application/json" hidden />
        </div>
        <p id="validityCandidateRulesImportStatus" class="status" style="min-height:1rem;margin:0 0 .35rem;font-size:.78rem"></p>
        ${RV.ui.ruleRows.renderAddToolbarHtml("rvCandidate")}
        <div id="rvCandidateRuleRows" class="rule-config-rows" data-rule-role="candidate"></div>
        <div id="rvCustomRules" hidden aria-hidden="true"></div>
        </div>
      </div>
      <div class="da-config-panel" id="rvPanelRiskEst">
        <div class="da-panel-header" data-config-panel-toggle="rvPanelRiskEst" role="button" tabindex="0">
          <span class="da-panel-num">4</span>
          <span class="da-panel-title-text">风险预估${hintBadgeHtml("仅本区表；不影响 Swap/四象限；可「从左侧复制」")}</span>
          <span class="rv-scope-badge independent" id="rvRiskEstScopeBadge" title="仅影响风险预估表，不影响 Swap/四象限">已独立</span>
          <span class="da-panel-summary" id="rvPanelRiskEstSummary"></span>
          <span class="da-panel-collapse-hint" aria-hidden="true"></span>
        </div>
        <div class="da-panel-body">
        <div class="da-risk-est-sample">
          <div class="da-risk-est-sample-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="rvRiskSyncPostSample">从左侧复制贷后样本</button>
            <p id="rvRiskSyncPostSampleHint" class="config-muted da-risk-est-sample-hint"></p>
          </div>
          <div class="sample-sub-block sample-sub-filter da-risk-est-filter">
            <h5 class="da-risk-est-filter-label">筛选字段</h5>
            <div id="rvRiskPostPrimaryFilterSelected" class="sample-filter-selected-tags"></div>
            <div id="rvRiskPostPrimaryFilterEditor" class="sample-filter-editor-panel" hidden>
              <div class="sample-filter-editor-head">
                <span>编辑主筛选</span>
                <button type="button" class="btn btn-secondary btn-sm" data-sample-editor-done="rvRiskPost" data-sample-primary="1">完成</button>
              </div>
              <label>字段</label>
              <select id="rvRiskPostPrimaryFilterCol"></select>
              <div id="rvRiskPostPrimaryFilterEditorBody" class="primary-filter-ui"></div>
            </div>
            <div id="rvRiskPostPrimaryFilter" class="sample-filter-rules-pool primary-filter-ui" hidden aria-hidden="true"></div>
            <p id="rvRiskPostPrimaryFilterMeta" class="chk-filter-meta sample-filter-meta">未选择取值（不选=全部）</p>
          </div>
          <div class="sample-sub-block sample-sub-filter da-risk-est-filter">
            <h5 class="da-risk-est-filter-label">额外筛选（且）</h5>
            <div id="rvRiskPostFilterSelected" class="sample-filter-selected-tags"></div>
            <div id="rvRiskPostFilterEditor" class="sample-filter-editor-panel" hidden>
              <div class="sample-filter-editor-head">
                <span id="rvRiskPostFilterEditorTitle">编辑筛选</span>
                <button type="button" class="btn btn-secondary btn-sm" data-sample-editor-done="rvRiskPost">完成</button>
              </div>
              <div id="rvRiskPostFilterEditorBody"></div>
            </div>
            <div id="rvRiskPostFilterRules" class="sample-filter-rules-pool" hidden aria-hidden="true"></div>
            <div class="filter-add-row">
              <input type="search" id="rvRiskPostFilterSearch" class="chk-filter-input" placeholder="搜索列名…" autocomplete="off" />
              <button type="button" class="btn btn-secondary btn-sm" id="rvRiskAddPostFilter">+ 筛选</button>
            </div>
            <p id="rvRiskPostFilterMeta" class="chk-filter-meta sample-filter-meta"></p>
          </div>
        </div>
        <div class="da-risk-est-config-toolbar">
          <div class="da-risk-est-config-field da-risk-est-config-field--var">
            <span class="da-risk-est-config-label">${withHintHtml("数值变量", "等频分箱；变更即时重算")}</span>
            <select id="rvRiskEstVar"></select>
          </div>
          <div class="da-risk-est-config-field da-risk-est-config-field--bins">
            <span class="da-risk-est-config-label">${withHintHtml("分箱数", "2～20")}</span>
            <div class="da-iv-stepper" role="group" aria-label="分箱数">
              <button type="button" class="btn btn-secondary btn-sm" id="rvRiskEstBinsDec" aria-label="减少">−</button>
              <input type="number" id="rvRiskEstBins" min="2" max="20" step="1" value="5" />
              <button type="button" class="btn btn-secondary btn-sm" id="rvRiskEstBinsInc" aria-label="增加">+</button>
            </div>
          </div>
          <div class="da-risk-est-config-field da-risk-est-config-field--mult">
            <span class="da-risk-est-config-label">${withHintHtml("推断倍数", "推断风险=通过贷后风险×倍数")}</span>
            <div class="da-iv-stepper" role="group" aria-label="推断倍数">
              <button type="button" class="btn btn-secondary btn-sm" id="rvRiskEstMultDec" aria-label="减少">−</button>
              <input type="number" id="rvRiskEstMultiplier" min="0" step="0.01" value="1" />
              <button type="button" class="btn btn-secondary btn-sm" id="rvRiskEstMultInc" aria-label="增加">+</button>
            </div>
          </div>
          <span class="da-risk-est-live-hint config-muted">变更即时重算</span>
        </div>
        </div>
      </div>
      <div class="da-config-panel" id="rvPanelRun">
        <div class="da-panel-header"><span class="da-panel-num">5</span>运行</div>
        <button type="button" class="btn btn-primary" id="btnRunValidityCheck" disabled>运行有效性检查</button>
        <p id="rvValidityStatus" class="status" style="min-height:1.25rem"></p>
      </div>
    </div>
    </div>
    <div class="rv-wb-zone rv-wb-results">
      <div class="rv-wb-zone-label">结果</div>
      <div id="rvValidityResults"><p class="da-results-placeholder">配置规则后点击「运行有效性检查」</p></div>
    </div>
  </section>`;
}
function mountValidityTabShell() {
  if (S.sampleFilterEditing?.prefix === "rvRiskPost") {
    RV.ui.sidebar.closeSampleFilterEditor("rvRiskPost");
  }
  const doc = ensureReportDocument();
  const old = doc.querySelector("#tab-validity");
  if (old) old.remove();
  doc.insertAdjacentHTML("beforeend", renderValidityTabShell());
  bindValidityConfigPanelToggle();
}

const RV_COLLAPSE_PANEL_IDS = [
  "rvPanelBaseline", "rvPanelGroup", "rvPanelCandidate", "rvPanelRiskEst",
];
const ValidityConfigPanel = () => RV.ui.configPanel;

function refreshValidityConfigPanelSummaries() {
  const CPAPI = ValidityConfigPanel();
  if (!CPAPI) return;
  const mode = RV.app.rulesIo?.getValidityBaselineMode?.() || S.validityBaselineMode || "follow";
  let hardN = 0;
  let softN = 0;
  try {
    const collected = RV.ui.ruleRows.collectRulesFromHost(baselineHost(), { role: "baseline" });
    hardN = collected.hardRules?.length || 0;
    softN = collected.softRules?.length || 0;
  } catch (_) { /* host may be empty */ }
  CPAPI.setSummaryText(
    "rvPanelBaselineSummary",
    `${mode === "follow" ? "跟随左侧" : "已覆盖"} · 硬 ${hardN} · 软 ${softN}`
  );

  const groups = getValidityGroupCols();
  CPAPI.setSummaryText(
    "rvPanelGroupSummary",
    groups.length
      ? `${groups.length} 维：${CPAPI.formatSummaryList(groups, 3, 16)}`
      : "未选分组"
  );

  let candN = 0;
  try {
    candN = collectCustomRulesFromUI()?.length || 0;
  } catch (_) { /* ignore */ }
  CPAPI.setSummaryText("rvPanelCandidateSummary", `候选 ${candN} 条`);

  const riskVar = $("rvRiskEstVar")?.value || "";
  const bins = $("rvRiskEstBins")?.value || "5";
  const multRaw = parseFloat($("rvRiskEstMultiplier")?.value);
  const mult = Number.isFinite(multRaw) ? multRaw : 1;
  const shortVar = riskVar.length > 18 ? `${riskVar.slice(0, 16)}…` : riskVar;
  CPAPI.setSummaryText(
    "rvPanelRiskEstSummary",
    riskVar ? `${shortVar} · ${bins} 箱 · ×${mult}` : "未选分箱变量"
  );
}

function collapseValidityConfigAfterRun() {
  refreshValidityConfigPanelSummaries();
  ValidityConfigPanel()?.collapsePanels(RV_COLLAPSE_PANEL_IDS);
  requestAnimationFrame(() => $("rvValidityResults")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
}

function expandValidityConfigPanels() {
  ValidityConfigPanel()?.expandPanels(RV_COLLAPSE_PANEL_IDS);
}

function bindValidityConfigPanelToggle() {
  const tab = $("tab-validity");
  if (!tab || !ValidityConfigPanel()) return;
  delete tab.dataset.configPanelToggleBound;
  ValidityConfigPanel().bindPanelToggle(tab, {
    onToggle: (_id, collapsed) => {
      if (collapsed) refreshValidityConfigPanelSummaries();
    },
  });
}
function getValidityGroupCols() {
  return getSampleGroupCols("rv");
}
const RE = () => RV.ui.ruleExpr;
function fillExprColSelect(sel) { RE().fillExprColSelect(sel); }
function createExprCondEl(preset) { return RE().createExprCondEl(preset); }
function createExprGroupEl(depth) { return RE().createExprGroupEl(depth); }
function countExprLeaves(groupEl) { return RE().countExprLeaves(groupEl); }
function collectExprFromEl(el) { return RE().collectExprFromEl(el); }
function restoreExprToDom(groupEl, node) { RE().restoreExprToDom(groupEl, node); }
function appendExprNodeToGroup(parentGroupEl, node) { RE().appendExprNodeToGroup(parentGroupEl, node); }
function baselineOnChange() {
  RV.app.rulesIo?.markValidityBaselineOverride?.();
  updateBaselineHostReadonly();
}
function candidateHost() {
  return $("rvCandidateRuleRows") || $("rvCustomRules");
}
function baselineHost() {
  return $("rvBaselineRuleRows");
}
function updateBaselineHostReadonly() {
  const follow = RV.app.rulesIo?.getValidityBaselineMode?.() === "follow";
  RV.ui.ruleRows.setHostReadonly(baselineHost(), follow);
  const addBtn = $("rvBaselineAddBtn");
  const typeSel = $("rvBaselineTypeSelect");
  if (addBtn) addBtn.disabled = !!follow;
  if (typeSel) typeSel.disabled = !!follow;
}
function bindRuleRowToolbars() {
  const bind = (prefix, hostGetter, role) => {
    const btn = $(`${prefix}AddBtn`);
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const host = hostGetter();
      if (!host) return;
      const type = $(`${prefix}TypeSelect`)?.value || "composite";
      const opts = {
        role,
        allowHard: role === "baseline",
        onChange: role === "baseline" ? baselineOnChange : undefined,
      };
      if (type === "binary") RV.ui.ruleRows.addBinaryRuleRow(host, { isHard: false }, opts);
      else if (type === "numeric") RV.ui.ruleRows.addNumericRuleRow(host, {}, opts);
      else RV.ui.ruleRows.addCompositeRuleRow(host, {}, opts);
      if (role === "baseline") baselineOnChange();
      if (role === "candidate") syncCandidateRuleCount();
    });
  };
  bind("rvBaseline", baselineHost, "baseline");
  bind("rvCandidate", candidateHost, "candidate");
}
function addCustomRuleCard(preset) {
  const host = candidateHost();
  if (!host) return null;
  const opts = { role: "candidate" };
  let row = null;
  if (preset?.root || preset?.name) {
    row = RV.ui.ruleRows.addCompositeRuleRow(host, {
      id: preset.id,
      name: preset.name,
      root: preset.root,
    }, opts);
  } else if (preset?.column && preset?.operator != null) {
    row = RV.ui.ruleRows.addNumericRuleRow(host, preset, opts);
  } else {
    row = RV.ui.ruleRows.addCompositeRuleRow(host, preset || {}, opts);
  }
  syncCandidateRuleCount();
  return row;
}
function syncCandidateRuleCount() {
  const host = candidateHost();
  if (host) S.candidateRuleCount = host.querySelectorAll(".rule-config-row").length;
  RV.events?.refreshProvenanceBar?.();
}
function mirrorSidebarToValidityIfFollow() {
  if (RV.app.rulesIo?.getValidityBaselineMode?.() === "follow") {
    syncValidityRulesFromSidebar({ setFollow: false });
  }
}
function syncValidityRulesFromSidebar(options) {
  const setFollow = !options || options.setFollow !== false;
  if (setFollow && RV.app.rulesIo?.setValidityBaselineMode) {
    RV.app.rulesIo.setValidityBaselineMode("follow");
  }
  const { hardRules, softRules } = RV.ui.sidebar.collectRulesFromUI();
  const hardCols = hardRules.filter((r) => r.type === "binary_col").map((r) => ({
    col: r.column, hitWhen: r.hitWhen,
  }));
  const softLegacy = {
    binary: softRules.filter((r) => r.type === "binary_col").map((r) => ({ col: r.column, hitWhen: r.hitWhen })),
    numeric: softRules.filter((r) => r.type === "numeric_cmp").map((r) => ({
      column: r.column, operator: r.operator, threshold: r.threshold, includeMissing: r.includeMissing,
    })),
    composite: softRules.filter((r) => r.type === "composite").map((r) => ({
      id: r.id, name: r.name, root: r.root,
    })),
  };
  const host = baselineHost();
  if (host) {
    RV.ui.ruleRows.applyLegacyToHost(host, hardCols, softLegacy, {
      role: "baseline",
      allowHard: true,
      onChange: baselineOnChange,
    });
  }
  updateBaselineHostReadonly();
}
function applyValidityBaselineFromLegacy(hardCols, softRules, warnings) {
  const host = baselineHost();
  if (!host) return;
  RV.ui.ruleRows.applyLegacyToHost(host, hardCols, softRules, {
    role: "baseline",
    allowHard: true,
    warnings,
    onChange: baselineOnChange,
  });
  updateBaselineHostReadonly();
}
function addRvNumericRuleRow(preset) {
  return RV.ui.ruleRows.addNumericRuleRow(baselineHost(), preset, {
    role: "baseline",
    onChange: baselineOnChange,
  });
}
function addRvCompositeSoftRuleRow(preset) {
  return RV.ui.ruleRows.addCompositeRuleRow(baselineHost(), preset, {
    role: "baseline",
    onChange: baselineOnChange,
  });
}
function applyCustomRulesFromPack(customRules) {
  const host = candidateHost();
  if (host) RV.ui.ruleRows.clearHost(host);
  S.customRuleSeq = 0;
  for (const r of customRules || []) {
    addCustomRuleCard({ id: r.id, name: r.name, root: r.root, openEditor: false });
  }
  syncCandidateRuleCount();
}
function copyPostGroupToValidity() {
  RV.ui.collapsedPicker.applySelection("rvGroup", getChecked($("postGroupCols")));
  syncSampleGroupOrderList("rv");
  const postOrder = getSampleGroupCols("post");
  const rvOrderEl = $("rvGroupOrder");
  if (!rvOrderEl || !postOrder.length) {
    refreshSampleGroupOrderIndexes("rv");
    return;
  }
  const items = [...rvOrderEl.querySelectorAll("li[data-col]")];
  const itemMap = new Map(items.map((li) => [li.dataset.col, li]));
  rvOrderEl.innerHTML = "";
  for (const col of postOrder) {
    if (itemMap.has(col)) rvOrderEl.appendChild(itemMap.get(col));
  }
  for (const li of items) {
    if (!postOrder.includes(li.dataset.col)) rvOrderEl.appendChild(li);
  }
  refreshSampleGroupOrderIndexes("rv");
}
function renderQuadrantPivotCell(segData, scale) {
  if (!segData || segData.rate == null) {
    return `<td class="num">N/A</td>`;
  }
  return `<td${metricHeatCell(segData.rate, scale)}><div>${pct(segData.rate)}</div>
    <div class="rv-quadrant-cell-sub">${fmtNum(segData.num)} / ${fmtNum(segData.den)}</div></td>`;
}
function renderValiditySummaryQuadrantTable(filteredRows, ratioSpec) {
  const riskName = ratioSpec?.name || "风险比率";
  const aggregated = aggregateQuadrantRows(filteredRows, { byGroup: false });
  const pivotRows = sortPivotQuadrantRows(pivotQuadrantAggregates(aggregated), []);
  const scales = validityPivotHeatScales(pivotRows, false);

  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">四象限汇总${hintBadgeHtml(`受分组筛选；指标 ${riskName}`)}</h3>
    <div class="table-interactive-wrap"><table class="data-table"><thead><tr>
      <th>新建规则</th><th>软规则</th>`;
  for (const seg of C.VALIDITY_SEGMENTS) html += `<th>${esc(seg.label)}</th>`;
  html += `</tr></thead><tbody>`;

  if (!pivotRows.length) {
    html += `<tr><td colspan="${2 + C.VALIDITY_SEGMENTS.length}" class="config-muted">无数据</td></tr>`;
  } else {
    for (const row of pivotRows) {
      const sk = `${row.customRuleId}\u0001${row.softRuleId}`;
      const sc = scales[sk] || { min: 0, max: 0 };
      html += `<tr><td>${esc(row.customRuleName)}</td><td>${esc(row.softRuleName)}</td>`;
      for (const seg of C.VALIDITY_SEGMENTS) {
        html += renderQuadrantPivotCell(row.segments[seg.key], sc);
      }
      html += `</tr>`;
    }
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function renderValidityGroupedQuadrantTable(filteredRows, groupCols, ratioSpec) {
  if (!groupCols?.length) {
    return `<div class="rv-validity-table-block"><h3>分组四象限</h3>
      <p class="config-muted" style="font-size:.78rem">请勾选分组变量后重新运行有效性检查</p></div>`;
  }
  const riskName = ratioSpec?.name || "风险比率";
  const aggregated = aggregateQuadrantRows(filteredRows, { byGroup: true });
  const pivotRows = sortPivotQuadrantRows(pivotQuadrantAggregates(aggregated), groupCols);
  const scales = validityPivotHeatScales(pivotRows, true);

  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">分组四象限${hintBadgeHtml(`按组展开；受分组筛选；${riskName}`)}</h3>
    <div class="table-interactive-wrap"><table class="data-table"><thead><tr>`;
  for (const col of groupCols) html += `<th>${esc(col)}</th>`;
  html += `<th>新建规则</th><th>软规则</th>`;
  for (const seg of C.VALIDITY_SEGMENTS) html += `<th>${esc(seg.label)}</th>`;
  html += `</tr></thead><tbody>`;

  if (!pivotRows.length) {
    html += `<tr><td colspan="${groupCols.length + 2 + C.VALIDITY_SEGMENTS.length}" class="config-muted">无数据</td></tr>`;
  } else {
    for (const row of pivotRows) {
      const sk = `${row.groupKey}\u0001${row.customRuleId}\u0001${row.softRuleId}`;
      const sc = scales[sk] || { min: 0, max: 0 };
      html += `<tr>`;
      for (let i = 0; i < groupCols.length; i++) {
        html += `<td>${esc(String(row.groupParts?.[i] ?? ""))}</td>`;
      }
      html += `<td>${esc(row.customRuleName)}</td><td>${esc(row.softRuleName)}</td>`;
      for (const seg of C.VALIDITY_SEGMENTS) {
        html += renderQuadrantPivotCell(row.segments[seg.key], sc);
      }
      html += `</tr>`;
    }
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function renderSwapRiskCell(risk, scale) {
  if (!risk || risk.rate == null) {
    return `<td class="num">N/A</td>`;
  }
  return `<td class="num"${metricHeatCell(risk.rate, scale)}>${pct(risk.rate)}</td>`;
}
function renderSwapPostDenCell(risk) {
  if (!risk || !risk.den) {
    return `<td class="num">—</td>`;
  }
  return `<td class="num">${fmtNum(risk.den)}</td>`;
}
function renderValiditySwapTableHtml(swapRows, groupCols, ratioSpec) {
  const hasGroup = groupCols?.length > 0;
  const groupColCount = hasGroup ? groupCols.length : 0;
  const metricColCount = C.SWAP_SEGMENTS.length * 4 + 6;
  const riskName = ratioSpec?.name || "风险比率";

  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">Swap 分析 · 表1：Swap 分析${hintBadgeHtml(`贷前进件/贷后风险(${riskName})；受分组筛选`)}</h3>
    <div class="table-interactive-wrap"><table class="data-table"><thead>
      <tr>`;
  if (hasGroup) {
    for (const col of groupCols) html += `<th rowspan="2">${esc(col)}</th>`;
  }
  for (const seg of C.SWAP_SEGMENTS) {
    html += `<th colspan="4">${esc(seg.label)}</th>`;
  }
  html += `<th colspan="3">线上策略通过</th><th colspan="3">新策略通过</th></tr>
      <tr>`;
  for (let i = 0; i < C.SWAP_SEGMENTS.length; i++) {
    html += `<th>进件量</th><th>进件占比</th><th>贷后样本量</th><th>${esc(riskName)}</th>`;
  }
  html += `<th>进件占比</th><th>贷后样本量</th><th>${esc(riskName)}</th>`;
  html += `<th>进件占比</th><th>贷后样本量</th><th>${esc(riskName)}</th>`;
  html += `</tr></thead><tbody id="rvSwapTableBody">`;

  if (!swapRows?.length) {
    html += `<tr><td colspan="${groupColCount + metricColCount}" class="config-muted">无贷前样本</td></tr>`;
  } else {
    for (const r of swapRows) {
      const scale = swapRiskHeatScale(r);
      html += `<tr>`;
      if (hasGroup) {
        for (const p of r.groupParts) html += `<td>${esc(p)}</td>`;
      }
      for (const seg of C.SWAP_SEGMENTS) {
        const s = r.segments[seg.key] || emptySwapSegmentAgg();
        html += `<td class="num">${fmtNum(s.applyVol)}</td>
          <td class="num">${s.applyShare != null ? pct(s.applyShare) : "—"}</td>`;
        html += renderSwapPostDenCell(s.risk);
        html += renderSwapRiskCell(s.risk, scale);
      }
      html += `<td class="num">${r.onlinePass.applyShare != null ? pct(r.onlinePass.applyShare) : "—"}</td>`;
      html += renderSwapPostDenCell(r.onlinePass.risk);
      html += renderSwapRiskCell(r.onlinePass.risk, scale);
      html += `<td class="num">${r.newPass.applyShare != null ? pct(r.newPass.applyShare) : "—"}</td>`;
      html += renderSwapPostDenCell(r.newPass.risk);
      html += renderSwapRiskCell(r.newPass.risk, scale);
      html += `</tr>`;
    }
  }
  html += `</tbody></table></div></div>`;
  return html;
}
async function ensureRiskEstPostPanelReady() {
  if ($("rvRiskPostPrimaryFilterCol") && $("rvRiskPostPrimaryFilter")?.querySelector(".primary-filter-rule")) return;
  await initRiskEstPostSamplePanel(getAnalysisTimeCols());
}
async function applyRiskEstPostSampleConfig(sampleConfig, warnings = []) {
  await ensureRiskEstPostPanelReady();
  if (!$("rvRiskPostPrimaryFilterCol")) {
    throw new Error("风险预估 Panel 未就绪，请刷新页面后重试");
  }
  await applySampleConfig("rvRiskPost", sampleConfig, warnings);
  RV.ui.sidebar.renderSamplePrimaryFilterTags("rvRiskPost");
  RV.ui.sidebar.renderSampleExtraFilterTags("rvRiskPost");
}
async function syncRiskEstPostFromSidebar() {
  const filterCfg = collectSampleFilterExport("post");
  await applyRiskEstPostSampleConfig(filterCfg);
}
function bindValidityPanelEvents() {
  const syncBtn = $("rvRiskSyncPostSample");
  if (syncBtn && syncBtn.dataset.rvDirectBound !== "1") {
    syncBtn.dataset.rvDirectBound = "1";
    syncBtn.addEventListener("click", () => void runRiskEstSyncFromSidebar());
  }
  const staleBtn = $("rvStaleRerunBtn");
  if (staleBtn && staleBtn.dataset.rvBound !== "1") {
    staleBtn.dataset.rvBound = "1";
    staleBtn.addEventListener("click", () => void RV.app.orchestrator.runValidityAnalysis());
  }
  const syncCand = $("rvSyncCandidatesToSidebar");
  if (syncCand && syncCand.dataset.rvBound !== "1") {
    syncCand.dataset.rvBound = "1";
    syncCand.addEventListener("click", () => syncCandidatesToSidebarRules());
  }
  const copyGroupBtn = $("rvCopyPostGroupBtn");
  if (copyGroupBtn && copyGroupBtn.dataset.rvBound !== "1") {
    copyGroupBtn.dataset.rvBound = "1";
    copyGroupBtn.addEventListener("click", () => {
      copyPostGroupToValidity();
      setRvValidityStatus("已从贷后复制分组变量；请重跑有效性检查以更新分组表", "ok");
      expandValidityConfigPanels();
      if (S.lastValidityAnalysis) markValidityResultsStale();
    });
  }
  const tab = $("tab-validity");
  if (tab && tab.dataset.rvConfigExpandBound !== "1") {
    tab.dataset.rvConfigExpandBound = "1";
    tab.addEventListener("change", (e) => {
      if (e.target.closest("#rvPanelBaseline, #rvPanelGroup, #rvPanelCandidate")) {
        expandValidityConfigPanels();
        refreshValidityConfigPanelSummaries();
        if (S.lastValidityAnalysis) markValidityResultsStale();
      } else if (e.target.closest("#rvPanelRiskEst")) {
        expandValidityConfigPanels();
        refreshValidityConfigPanelSummaries();
        if (e.target.closest("#rvRiskPostPrimaryFilter, #rvRiskPostPrimaryFilterEditorBody, #rvRiskPostFilterRules, #rvRiskPostFilterEditorBody, #rvRiskPostPrimaryFilterCol")) {
          markRiskEstSampleIndependent();
        }
      }
    });
    tab.addEventListener("click", (e) => {
      if (e.target.closest(".rule-config-remove, #rvBaselineAddBtn, #rvCandidateAddBtn")) {
        expandValidityConfigPanels();
        refreshValidityConfigPanelSummaries();
        if (S.lastValidityAnalysis) markValidityResultsStale();
        if (e.target.closest("#rvPanelCandidate .rule-config-remove, #rvCandidateAddBtn")) {
          setTimeout(syncCandidateRuleCount, 0);
        }
      }
      if (e.target.closest("#rvRiskAddPostFilter")) {
        expandValidityConfigPanels();
        refreshValidityConfigPanelSummaries();
        markRiskEstSampleIndependent();
      }
    });
  }
  syncRiskEstScopeBadge();
  if (S.validityResultsStale) markValidityResultsStale();
}
function syncRiskEstScopeBadge() {
  const badge = $("rvRiskEstScopeBadge");
  if (!badge) return;
  const follow = S.riskEstSampleMode === "follow";
  badge.textContent = follow ? "跟随左侧" : "已独立";
  badge.title = follow
    ? "与侧栏贷后样本筛选一致；手改后变为已独立。不影响 Swap/四象限。"
    : "仅影响风险预估表，不影响 Swap/四象限";
  badge.classList.toggle("follow", follow);
  badge.classList.toggle("independent", !follow);
}
function setRiskEstSampleMode(mode) {
  S.riskEstSampleMode = mode === "follow" ? "follow" : "independent";
  syncRiskEstScopeBadge();
}
function markRiskEstSampleIndependent() {
  if (S.riskEstSampleMode === "independent") {
    syncRiskEstScopeBadge();
    return;
  }
  setRiskEstSampleMode("independent");
}
function markValidityResultsStale() {
  if (!S.lastValidityAnalysis) return;
  S.validityResultsStale = true;
  const banner = $("rvStaleBanner");
  if (banner) banner.classList.add("is-visible");
  expandValidityConfigPanels();
  refreshValidityConfigPanelSummaries();
}
function clearValidityResultsStale() {
  S.validityResultsStale = false;
  const banner = $("rvStaleBanner");
  if (banner) banner.classList.remove("is-visible");
  RV.events?.refreshProvenanceBar?.();
}
function syncCandidatesToSidebarRules() {
  const customs = collectCustomRulesFromUI();
  if (!customs.length) {
    setRvValidityStatus("没有可同步的候选规则", "warn");
    RV.events?.notify?.("没有可同步的候选规则", "warn");
    return;
  }
  const existing = RV.ui.sidebar.collectRulesFromUI?.() || { softRules: [] };
  const existingNames = new Set((existing.softRules || []).map((r) => r.name));
  let added = 0;
  for (const rule of customs) {
    if (!rule.root) continue;
    const name = rule.name || "候选规则";
    const uniqueName = existingNames.has(name) ? `${name}（候选）` : name;
    existingNames.add(uniqueName);
    RV.ui.sidebar.addCompositeSoftRuleRow({
      id: rule.id || undefined,
      name: uniqueName,
      root: rule.root,
    });
    added++;
  }
  mirrorSidebarToValidityIfFollow();
  if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
    RV.events.invalidateDataAnalysisCache();
  } else {
    RV.ui.report.analysis?.invalidateDataAnalysisCache?.();
  }
  RV.events?.updateWorkflowStatus?.();
  const msg = `已同步 ${added} 条候选到左侧（软/复合规则）`;
  setRvValidityStatus(msg, "ok");
  RV.events?.notify?.(msg, "ok");
}
async function runRiskEstSyncFromSidebar() {
  const hint = $("rvRiskSyncPostSampleHint");
  try {
    await syncRiskEstPostFromSidebar();
    setRiskEstSampleMode("follow");
    const pf = getPrimaryFilterConfig("rvRiskPost");
    const filterCount = $("rvRiskPostFilterRules")?.querySelectorAll(".filter-rule").length ?? 0;
    const hasAnalysis = !!S.lastValidityAnalysis;
    const binCol = $("rvRiskEstVar")?.value;
    let msg = `已复制：${pf.column || "—"}${pf.values?.length ? `（${pf.values.length} 个取值）` : "（全部取值）"}；额外筛选 ${filterCount} 条`;
    if (hasAnalysis && binCol) {
      await refreshRiskEstView({ fullRerender: true });
      msg += "；风险预估表已更新";
      setRvValidityStatus("已从左侧复制贷后样本配置，风险预估表已更新", "ok");
    } else if (hasAnalysis) {
      setRvValidityStatus("已从左侧复制贷后样本配置；请选择数值变量以查看风险预估表", "ok");
    } else {
      setRvValidityStatus("已从左侧复制贷后样本配置；运行有效性检查或选择数值变量后可查看风险预估表", "ok");
    }
    if (hint) {
      hint.textContent = msg;
      hint.className = "config-muted status ok";
    }
  } catch (e) {
    console.error(e);
    if (hint) {
      hint.textContent = "复制失败：" + (e.message || e);
      hint.className = "config-muted status err";
    }
    setRvValidityStatus("复制失败：" + (e.message || e), "err");
  }
}
function fillRiskEstVarSelect() {
  const sel = $("rvRiskEstVar");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">— 选择数值变量 —</option>`;
  for (const h of S.numCols) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = h;
    o.title = h;
    sel.appendChild(o);
  }
  if (cur && S.numCols.includes(cur)) sel.value = cur;
}
function clampRiskEstBins(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 5;
  return Math.max(2, Math.min(20, n));
}
function clampRiskEstMultiplier(raw) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = 1;
  return Math.max(0, Math.round(n * 100) / 100);
}
function stepRiskEstBins(delta) {
  const inp = $("rvRiskEstBins");
  if (!inp) return;
  inp.value = String(clampRiskEstBins((parseInt(inp.value, 10) || 5) + delta));
  refreshValidityConfigPanelSummaries();
  scheduleRefreshRiskEstView();
}
function stepRiskEstMultiplier(delta) {
  const inp = $("rvRiskEstMultiplier");
  if (!inp) return;
  const cur = parseFloat(inp.value);
  const base = Number.isFinite(cur) ? cur : 1;
  inp.value = String(clampRiskEstMultiplier(base + delta));
  refreshValidityConfigPanelSummaries();
  scheduleRefreshRiskEstView();
}
var _riskEstRefreshTimer = null;
function scheduleRefreshRiskEstView(opts = {}) {
  if (opts.fullRerender) {
    if (_riskEstRefreshTimer) {
      clearTimeout(_riskEstRefreshTimer);
      _riskEstRefreshTimer = null;
    }
    return void refreshRiskEstView(opts);
  }
  if (_riskEstRefreshTimer) clearTimeout(_riskEstRefreshTimer);
  _riskEstRefreshTimer = setTimeout(() => {
    _riskEstRefreshTimer = null;
    void refreshRiskEstView(opts);
  }, 150);
}
async function initRiskEstPostSamplePanel(timeCols) {
  if (!$("rvRiskPostPrimaryFilterCol")) return;
  const postLeft = $("postPrimaryFilterCol")?.value;
  const defaultCol = (postLeft && S.headers.includes(postLeft))
    ? postLeft
    : (S.headers.includes("放款月份") ? "放款月份" : (timeCols[0] || ""));
  initPrimaryFilterPanel("rvRiskPost", timeCols, defaultCol);
  RV.ui.sidebar.renderSamplePrimaryFilterTags("rvRiskPost");
  RV.ui.sidebar.renderSampleExtraFilterTags("rvRiskPost");
  const bindRiskEstRefresh = (el) => {
    if (!el || el.dataset.rvRiskEstBound === "1") return;
    el.dataset.rvRiskEstBound = "1";
    el.addEventListener("change", () => {
      markRiskEstSampleIndependent();
      scheduleRefreshRiskEstView();
    });
  };
  bindRiskEstRefresh($("rvRiskPostPrimaryFilterCol"));
  bindRiskEstRefresh($("rvRiskPostPrimaryFilter"));
  bindRiskEstRefresh($("rvRiskPostPrimaryFilterEditorBody"));
  bindRiskEstRefresh($("rvRiskPostFilterRules"));
  bindRiskEstRefresh($("rvRiskPostFilterEditorBody"));
  const binsInp = $("rvRiskEstBins");
  if (binsInp && binsInp.dataset.rvRiskEstBound !== "1") {
    binsInp.dataset.rvRiskEstBound = "1";
    binsInp.addEventListener("change", () => {
      binsInp.value = String(clampRiskEstBins(binsInp.value));
      refreshValidityConfigPanelSummaries();
      scheduleRefreshRiskEstView();
    });
  }
  const multInp = $("rvRiskEstMultiplier");
  if (multInp && multInp.dataset.rvRiskEstBound !== "1") {
    multInp.dataset.rvRiskEstBound = "1";
    multInp.addEventListener("change", () => {
      multInp.value = String(clampRiskEstMultiplier(multInp.value));
      refreshValidityConfigPanelSummaries();
      scheduleRefreshRiskEstView();
    });
  }
  const varSel = $("rvRiskEstVar");
  if (varSel && varSel.dataset.rvRiskEstBound !== "1") {
    varSel.dataset.rvRiskEstBound = "1";
    varSel.addEventListener("change", () => {
      refreshValidityConfigPanelSummaries();
      scheduleRefreshRiskEstView();
    });
  }
  fillRiskEstVarSelect();
  syncRiskEstScopeBadge();
}
function renderRiskEstRateCell(rate, scale) {
  if (rate == null) return `<td class="num">N/A</td>`;
  return `<td class="num"${metricHeatCell(rate, scale)}>${pct(rate)}</td>`;
}
function renderRiskEstDenCell(den) {
  if (!den) return `<td class="num">—</td>`;
  return `<td class="num">${fmtNum(den)}</td>`;
}
function renderRiskEstTableHtml(estResult, ratioSpec) {
  const riskName = ratioSpec?.name || "风险比率";
  const { rows, binCol, multiplier } = estResult;
  const scale = riskEstHeatScale(rows);
  const colCount = 1 + C.SWAP_SEGMENTS.length + 5;

  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">风险预估 · 分箱推断表${hintBadgeHtml(`${binCol} 等频分箱；推断=通过贷后风险×${multiplier}；亦受上方分组值筛选影响`)}</h3>
    <div class="table-interactive-wrap"><table class="data-table"><thead><tr>
      <th>分箱</th>`;
  for (const seg of C.SWAP_SEGMENTS) {
    html += `<th>${esc(seg.label)}<br><span class="config-muted" style="font-weight:normal;font-size:.72rem">贷前样本量</span></th>`;
  }
  html += `<th>新策略通过<br>贷后样本量</th>
      <th>新策略通过<br>贷后风险</th>
      <th>推断风险</th>
      <th>新策略拒绝<br>贷后样本量</th>
      <th>新策略拒绝<br>贷后风险</th>
      </tr></thead><tbody id="rvRiskEstTableBody">`;

  if (!rows?.length) {
    html += `<tr><td colspan="${colCount}" class="config-muted">无数据</td></tr>`;
  } else {
    for (const r of rows) {
      html += `<tr><td>${esc(r.binLabel)}</td>`;
      for (const seg of C.SWAP_SEGMENTS) {
        html += `<td class="num">${fmtNum(r.segments[seg.key] || 0)}</td>`;
      }
      html += renderRiskEstDenCell(r.newPassDen);
      html += renderRiskEstRateCell(r.newPassRate, scale);
      html += renderRiskEstRateCell(r.inferredRisk, scale);
      html += renderRiskEstDenCell(r.newRejectDen);
      html += renderRiskEstRateCell(r.newRejectRate, scale);
      html += `</tr>`;
    }
  }
  html += `</tbody></table></div></div>`;
  return html;
}
async function refreshRiskEstView({ fullRerender = false } = {}) {
  if (!S.lastValidityAnalysis || S.rvRiskEstRefreshBusy) return;
  if (isExportMode()) {
    showExportStaticNotice();
    return;
  }
  S.rvRiskEstRefreshBusy = true;
  const mount = $("rvRiskEstMount");
  try {
    const binCol = $("rvRiskEstVar")?.value;
    const nBins = Math.max(2, Math.min(20, parseInt($("rvRiskEstBins")?.value, 10) || 5));
    const multiplier = parseFloat($("rvRiskEstMultiplier")?.value);
    const mult = Number.isFinite(multiplier) ? multiplier : 1;

    if (!mount) return;

    if (!binCol) {
      mount.innerHTML = `<p class="config-muted">请在 Panel 4 选择数值变量以展示风险预估表</p>`;
      return;
    }

    const { preRows, hardRules, softRules, customRules, groupCols, ratioSpec } = S.lastValidityAnalysis;
    const filterMap = (() => {
      const live = getRvGroupValueFilterState();
      if (Object.keys(live).length) return live;
      if (!groupCols?.length) return null;
      const map = {};
      const dimValues = collectGroupValuesFromValidityRows(S.lastValidityAnalysis.rows, groupCols);
      for (const col of groupCols) map[col] = new Set(dimValues[col] || []);
      return map;
    })();

    const filteredPre = filterPreRowsByRvGroupFilter(preRows, groupCols, filterMap);
    const riskPostRows = filterPreRowsByRvGroupFilter(getRiskEstPostRows(), groupCols, filterMap);

    if (fullRerender && !mount.querySelector("#rvRiskEstTableBody")) {
      mount.innerHTML = `<p class="config-muted">风险预估计算中…</p>`;
    }

    const estResult = computeRiskEstTable(
      riskPostRows, filteredPre, binCol, nBins, mult,
      hardRules, softRules, customRules, ratioSpec
    );
    S.lastValidityAnalysis.riskEstRows = estResult.rows;
    S.lastValidityAnalysis.riskEstRule = estResult.rule;

    mount.innerHTML = renderRiskEstTableHtml(estResult, ratioSpec);
    initResizableTables(mount);
  } catch (err) {
    console.error(err);
    if (mount) mount.innerHTML = `<p class="config-muted" style="color:var(--err)">风险预估计算失败</p>`;
  } finally {
    S.rvRiskEstRefreshBusy = false;
  }
}
function renderValidityPreHitTableHtml(preHitRows, groupCols, waterfallOrder) {
  const hasGroup = groupCols?.length > 0;
  const kindTag = (kind) => kind === "hard"
    ? '<span class="tag-hard">硬</span>'
    : '<span class="tag-soft">新建</span>';

  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">贷前命中${hintBadgeHtml("☰ 调瀑布序，与贷后同步；受分组筛选")}</h3>
    <div class="table-interactive-wrap"><table class="data-table"><thead><tr>
      <th style="width:2rem"></th>`;
  if (hasGroup) {
    for (const col of groupCols) html += `<th>${esc(col)}</th>`;
  }
  html += `<th>规则</th><th>类型</th>
    <th>命中进件量</th><th>命中率</th><th>仅命中率</th>
    <th>瀑布本步进件量</th><th>瀑布本步命中率</th><th>累计命中进件量</th>
    </tr></thead><tbody id="rvPreHitTableBody">`;

  if (!preHitRows?.length) {
    const colSpan = (hasGroup ? groupCols.length : 0) + 9;
    html += `<tr><td colspan="${colSpan}" class="config-muted">无贷前样本或无规则</td></tr>`;
  } else {
    const sortedGroups = hasGroup
      ? sortGroupKeys([...new Set(preHitRows.map((r) => r.groupKey))], groupCols)
      : ["__all__"];
    const ruleOrder = waterfallOrder || [];
    const ruleOrderIds = ruleOrder.map((r) => r.id);

    for (const gk of sortedGroups) {
      const groupRows = preHitRows.filter((r) => r.groupKey === gk);
      const byRuleId = Object.fromEntries(groupRows.map((r) => [r.ruleId, r]));
      const seenOrder = new Set();
      const orderedRows = [];
      for (const id of ruleOrderIds) {
        if (seenOrder.has(id)) continue;
        seenOrder.add(id);
        const row = byRuleId[id];
        if (row) orderedRows.push(row);
      }

      for (const r of orderedRows) {
        const wfClass = r.kind === "hard" ? "hard" : "custom";
        const dragDisabled = r.kind === "hard";
        html += `<tr class="wf-row ${wfClass}" data-rule-id="${esc(r.ruleId)}" data-group-key="${esc(r.groupKey)}">
          <td><span class="drag-handle${dragDisabled ? " drag-handle-disabled" : ""}" title="${dragDisabled ? "硬规则固定顺序" : "拖拽排序"}">☰</span></td>`;
        if (hasGroup) {
          for (let i = 0; i < groupCols.length; i++) {
            html += `<td>${esc(String(r.groupParts?.[i] ?? ""))}</td>`;
          }
        }
        html += `<td>${esc(r.ruleName)}</td>
          <td>${kindTag(r.kind)}</td>
          <td class="num rv-pre-hit-vol">${fmtNum(r.hitVol)}</td>
          <td class="num rv-pre-hit-rate">${r.hitRate != null ? pct(r.hitRate) : "—"}</td>
          <td class="num rv-pre-only-rate">${r.onlyRate != null ? pct(r.onlyRate) : "—"}</td>
          <td class="num rv-pre-step-vol">${fmtNum(r.stepVol)}</td>
          <td class="num rv-pre-step-rate">${r.stepRate != null ? pct(r.stepRate) : "—"}</td>
          <td class="num rv-pre-cum-vol">${fmtNum(r.cumVol)}</td>
        </tr>`;
      }
    }
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function fmtNumOrDash(v) {
  return v != null && v !== "" ? fmtNum(v) : "—";
}
function pctOrDash(v) {
  return v != null && v !== "" ? pct(v) : "—";
}
function orderValidityPostWfRows(rows, waterfallOrder, hardRules, customRules) {
  const customSoft = customRulesAsSoftRules(customRules);
  const byId = new Map((rows || []).map((r) => [r.ruleId, r]));
  const order = dedupeWaterfallRules(
    waterfallOrder?.length ? waterfallOrder : [...(hardRules || []), ...customSoft]
  );
  return order.map((rule) => byId.get(rule.id)).filter(Boolean);
}
function renderValidityPostWaterfallRiskRowHtml(r, idx) {
  const kindTag = r.kind === "hard"
    ? '<span class="tag-hard">硬</span>'
    : '<span class="tag-soft">新建</span>';
  const dragDisabled = r.kind === "hard";
  return `<tr class="wf-row ${r.kind === "hard" ? "hard" : "custom"}" data-rule-id="${esc(r.ruleId)}">
      <td><span class="drag-handle${dragDisabled ? " drag-handle-disabled" : ""}" title="${dragDisabled ? "硬规则固定顺序" : "拖拽调整瀑布顺序"}">☰</span></td>
      <td class="wf-idx num">${idx + 1}</td>
      <td>${esc(r.name)}</td>
      <td>${kindTag}</td>
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
function renderValidityPostWaterfallRiskHtml(summary, waterfallOrder, hardRules, customRules) {
  const riskMetric = summary?.riskMetric || "—";
  const denNote = summary?.riskDenCol ? `，分母列 ${summary.riskDenCol}` : "";
  const orderedRows = orderValidityPostWfRows(summary?.rows, waterfallOrder, hardRules, customRules);
  let html = `<div class="rv-validity-table-block">
    <h3 class="rv-heading-with-hint">贷后瀑布风险${hintBadgeHtml(`含硬规则命中；☰ 调序同步贷前；${riskMetric}${denNote}`)}</h3>
    <div class="table-interactive-wrap"><table class="data-table pre-strategy-table post-rule-review-overall-table"><thead><tr>
      <th style="width:2rem"></th><th>序</th>
      <th>规则</th><th>类型</th>
      <th>贷后命中样本</th><th>贷后未命中组样本</th>
      <th>贷后命中组风险</th><th>贷后未命中组风险</th>
      <th>瀑布命中风险</th><th>瀑布命中样本</th>
      <th>仅命中风险</th><th>仅命中样本</th>
    </tr></thead><tbody id="rvPostWaterfallRiskBody">`;
  if (!orderedRows.length) {
    html += `<tr><td colspan="12" class="config-muted">无贷后样本或无规则</td></tr>`;
  } else {
    orderedRows.forEach((r, i) => { html += renderValidityPostWaterfallRiskRowHtml(r, i); });
  }
  html += `</tbody></table></div></div>`;
  return html;
}
function readRvWaterfallOrderFromDom(tbody, activeGroupKey) {
  if (!tbody || !S.lastValidityAnalysis) return [];
  const customSoft = customRulesAsSoftRules(S.lastValidityAnalysis.customRules);
  const allRules = [...(S.lastValidityAnalysis.hardRules || []), ...customSoft];
  const ruleMap = Object.fromEntries(allRules.map((r) => [r.id, r]));
  const firstGk = getRvPreHitFirstGroupKey(S.lastValidityAnalysis.preHitRows || [], S.lastValidityAnalysis.groupCols);
  const anchorGroupKey = activeGroupKey || firstGk;
  const ordered = [];
  const seen = new Set();

  tbody.querySelectorAll("tr.wf-row[data-rule-id]").forEach((row) => {
    if (anchorGroupKey && row.dataset.groupKey !== anchorGroupKey) return;
    const id = row.getAttribute("data-rule-id");
    if (!id || seen.has(id) || !ruleMap[id]) return;
    seen.add(id);
    ordered.push(ruleMap[id]);
  });

  for (const r of allRules) {
    if (!seen.has(r.id)) ordered.push(r);
  }
  return ordered;
}
function readRvPostWfWaterfallOrderFromDom(tbody) {
  if (!tbody || !S.lastValidityAnalysis) return [];
  const customSoft = customRulesAsSoftRules(S.lastValidityAnalysis.customRules);
  const allRules = [...(S.lastValidityAnalysis.hardRules || []), ...customSoft];
  const ruleMap = Object.fromEntries(allRules.map((r) => [r.id, r]));
  const ordered = [];
  const seen = new Set();
  tbody.querySelectorAll("tr.wf-row[data-rule-id]").forEach((row) => {
    const id = row.getAttribute("data-rule-id");
    if (!id || seen.has(id) || !ruleMap[id]) return;
    seen.add(id);
    ordered.push(ruleMap[id]);
  });
  for (const r of allRules) {
    if (!seen.has(r.id)) ordered.push(r);
  }
  return ordered;
}
function applyRvWaterfallOrderChange(ordered) {
  if (!S.lastValidityAnalysis || !ordered.length) return;
  S.lastValidityAnalysis.waterfallOrder = dedupeWaterfallRules(ordered);
  void refreshValidityPreHitView({ fullRerender: false });
  void refreshValidityPostWaterfallRiskView({ fullRerender: false });
}
function updateRvPostWfTableCells(summary, waterfallOrder, hardRules, customRules) {
  const tbody = $("rvPostWaterfallRiskBody");
  if (!tbody || !summary?.rows?.length) return;
  const byId = Object.fromEntries(summary.rows.map((r) => [r.ruleId, r]));
  const orderedRows = orderValidityPostWfRows(summary.rows, waterfallOrder, hardRules, customRules);

  tbody.querySelectorAll("tr.wf-row[data-rule-id]").forEach((tr) => {
    const r = byId[tr.getAttribute("data-rule-id")];
    if (!r) return;
    const wfRisk = tr.querySelector(".wf-wf-risk");
    const wfDen = tr.querySelector(".wf-wf-den");
    if (wfRisk) wfRisk.textContent = pctOrDash(r.wfHitRisk);
    if (wfDen) wfDen.textContent = fmtNumOrDash(r.wfHitDen);
  });

  orderedRows.forEach((r, i) => {
    const tr = tbody.querySelector(`tr.wf-row[data-rule-id="${CSS.escape(r.ruleId)}"]`);
    if (!tr) return;
    tbody.appendChild(tr);
    const idx = tr.querySelector(".wf-idx");
    if (idx) idx.textContent = String(i + 1);
  });
}
function updateRvPreHitTableCells(preHitRows, waterfallOrder) {
  const tbody = $("rvPreHitTableBody");
  if (!tbody || !preHitRows?.length) return;
  const byKey = Object.fromEntries(preHitRows.map((r) => [`${r.groupKey}\u0001${r.ruleId}`, r]));

  tbody.querySelectorAll("tr.wf-row[data-rule-id]").forEach((tr) => {
    const key = `${tr.dataset.groupKey}\u0001${tr.getAttribute("data-rule-id")}`;
    const r = byKey[key];
    if (!r) return;
    const vol = tr.querySelector(".rv-pre-hit-vol");
    const rate = tr.querySelector(".rv-pre-hit-rate");
    const onlyRate = tr.querySelector(".rv-pre-only-rate");
    const stepVol = tr.querySelector(".rv-pre-step-vol");
    const stepRate = tr.querySelector(".rv-pre-step-rate");
    const cumVol = tr.querySelector(".rv-pre-cum-vol");
    if (vol) vol.textContent = fmtNum(r.hitVol);
    if (rate) rate.textContent = r.hitRate != null ? pct(r.hitRate) : "—";
    if (onlyRate) onlyRate.textContent = r.onlyRate != null ? pct(r.onlyRate) : "—";
    if (stepVol) stepVol.textContent = fmtNum(r.stepVol);
    if (stepRate) stepRate.textContent = r.stepRate != null ? pct(r.stepRate) : "—";
    if (cumVol) cumVol.textContent = fmtNum(r.cumVol);
  });

  const groupCols = S.lastValidityAnalysis?.groupCols || [];
  const sortedGroups = groupCols.length
    ? sortGroupKeys([...new Set(preHitRows.map((r) => r.groupKey))], groupCols)
    : ["__all__"];
  const ruleOrderIds = (waterfallOrder || []).map((r) => r.id);

  for (const gk of sortedGroups) {
    const rows = ruleOrderIds
      .map((id) => tbody.querySelector(`tr.wf-row[data-rule-id="${CSS.escape(id)}"][data-group-key="${CSS.escape(gk)}"]`))
      .filter(Boolean);
    for (const tr of rows) tbody.appendChild(tr);
  }
}
function initRvPreHitDnD() {
  const tbody = $("rvPreHitTableBody");
  if (!tbody || isExportMode()) return;
  if (tbody.dataset.rvSortBound === "1") return;
  tbody.dataset.rvSortBound = "1";

  let dragItem = null;
  let placeholder = null;
  let orderBeforeDrag = "";
  let activePointer = null;
  let activeGroupKey = "";
  let rafPending = false;
  let lastClientY = 0;

  function movePreHitPlaceholderWithinGroup(y) {
    if (!placeholder || !dragItem) return;
    const gk = activeGroupKey || dragItem.dataset.groupKey;
    const groupRows = [...tbody.querySelectorAll(`tr.wf-row[data-group-key="${CSS.escape(gk)}"]`)];
    const movableRows = groupRows.filter((row) => row !== dragItem && !row.classList.contains("hard"));
    if (!movableRows.length) return;
    let before = null;
    for (const row of movableRows) {
      const rect = row.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        before = row;
        break;
      }
    }
    if (before) tbody.insertBefore(placeholder, before);
    else tbody.insertBefore(placeholder, movableRows[movableRows.length - 1].nextSibling);
  }

  function finishDrag(commit) {
    if (!dragItem || !placeholder) return;
    tbody.insertBefore(dragItem, placeholder);
    placeholder.remove();
    dragItem.classList.remove("wf-dragging", "wf-sort-hidden");
    if (activePointer != null) {
      try { dragItem.releasePointerCapture(activePointer); } catch (_) { /* ignore */ }
    }

    if (commit && S.lastValidityAnalysis) {
      const ordered = readRvWaterfallOrderFromDom(tbody, activeGroupKey);
      const orderAfter = waterfallOrderKey(ordered);
      if (ordered.length && orderAfter !== orderBeforeDrag) {
        applyRvWaterfallOrderChange(ordered);
      }
    }

    dragItem = null;
    placeholder = null;
    activePointer = null;
    activeGroupKey = "";
    rafPending = false;
  }

  tbody.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".drag-handle:not(.drag-handle-disabled)")) return;
    const item = e.target.closest("tr.wf-row");
    if (!item || item.classList.contains("hard")) return;
    e.preventDefault();
    dragItem = item;
    activePointer = e.pointerId;
    activeGroupKey = item.dataset.groupKey || "";
    orderBeforeDrag = waterfallOrderKey(readRvWaterfallOrderFromDom(tbody, activeGroupKey));

    placeholder = document.createElement("tr");
    placeholder.className = "waterfall-placeholder-row";
    const colCount = item.children.length;
    placeholder.innerHTML = `<td colspan="${colCount}"><div class="waterfall-placeholder"></div></td>`;
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
      if (dragItem && placeholder) {
        movePreHitPlaceholderWithinGroup(lastClientY);
      }
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
function initRvPostWfDnD() {
  const tbody = $("rvPostWaterfallRiskBody");
  if (!tbody || isExportMode()) return;
  if (tbody.dataset.rvPostWfSortBound === "1") return;
  tbody.dataset.rvPostWfSortBound = "1";

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

    if (commit && S.lastValidityAnalysis) {
      const ordered = readRvPostWfWaterfallOrderFromDom(tbody);
      const orderAfter = waterfallOrderKey(ordered);
      if (ordered.length && orderAfter !== orderBeforeDrag) {
        applyRvWaterfallOrderChange(ordered);
      }
    }

    dragItem = null;
    placeholder = null;
    activePointer = null;
    rafPending = false;
  }

  tbody.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".drag-handle:not(.drag-handle-disabled)")) return;
    const item = e.target.closest("tr.wf-row");
    if (!item || item.classList.contains("hard")) return;
    e.preventDefault();
    dragItem = item;
    activePointer = e.pointerId;
    orderBeforeDrag = waterfallOrderKey(readRvPostWfWaterfallOrderFromDom(tbody));

    placeholder = document.createElement("tr");
    placeholder.className = "waterfall-placeholder-row";
    const colCount = item.children.length;
    placeholder.innerHTML = `<td colspan="${colCount}"><div class="waterfall-placeholder"></div></td>`;
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
      if (dragItem && placeholder) {
        moveWaterfallPlaceholder(tbody, placeholder, lastClientY, dragItem, "custom");
      }
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
async function refreshValiditySwapView({ fullRerender = false } = {}) {
  if (!S.lastValidityAnalysis?.preRows || S.rvSwapRefreshBusy) return;
  S.rvSwapRefreshBusy = true;
  const mount = $("rvSwapTableMount");
  try {
    const { preRows, postRows, hardRules, softRules, customRules, groupCols, ratioSpec } = S.lastValidityAnalysis;
    const filterMap = (() => {
      const live = getRvGroupValueFilterState();
      if (Object.keys(live).length) return live;
      if (!groupCols?.length) return null;
      const map = {};
      const dimValues = collectGroupValuesFromValidityRows(S.lastValidityAnalysis.rows, groupCols);
      for (const col of groupCols) map[col] = new Set(dimValues[col] || []);
      return map;
    })();

    const filteredPre = filterPreRowsByRvGroupFilter(preRows, groupCols, filterMap);
    const filteredPost = filterPreRowsByRvGroupFilter(postRows || [], groupCols, filterMap);

    if (mount && fullRerender && !mount.querySelector("#rvSwapTableBody")) {
      mount.innerHTML = `<p class="config-muted">Swap 分析重算中…</p>`;
    }

    const swapRows = await computeValiditySwapTable(
      filteredPre, filteredPost, hardRules, softRules, customRules, groupCols, ratioSpec
    );
    S.lastValidityAnalysis.swapRows = swapRows;

    if (mount) {
      mount.innerHTML = renderValiditySwapTableHtml(swapRows, groupCols, ratioSpec);
      initResizableTables(mount);
    }
  } catch (err) {
    console.error(err);
    if (mount) mount.innerHTML = `<p class="config-muted" style="color:var(--err)">Swap 分析重算失败</p>`;
  } finally {
    S.rvSwapRefreshBusy = false;
  }
}
async function refreshValidityPreHitView({ fullRerender = false } = {}) {
  if (!S.lastValidityAnalysis?.preRows || S.rvPreHitRefreshBusy) return;
  S.rvPreHitRefreshBusy = true;
  const mount = $("rvPreHitTableMount");
  try {
    const { preRows, hardRules, customRules, groupCols, waterfallOrder } = S.lastValidityAnalysis;
    const filterMap = (() => {
      const live = getRvGroupValueFilterState();
      if (Object.keys(live).length) return live;
      if (!groupCols?.length) return null;
      const map = {};
      const dimValues = collectGroupValuesFromValidityRows(S.lastValidityAnalysis.rows, groupCols);
      for (const col of groupCols) map[col] = new Set(dimValues[col] || []);
      return map;
    })();

    const filteredPre = filterPreRowsByRvGroupFilter(preRows, groupCols, filterMap);
    const order = dedupeWaterfallRules(waterfallOrder || [...hardRules, ...customRulesAsSoftRules(customRules)]);

    if (mount && fullRerender && !mount.querySelector("#rvPreHitTableBody")) {
      mount.innerHTML = `<p class="config-muted">贷前命中重算中…</p>`;
    }

    const preHitRows = await computeValidityPreHitTable(
      filteredPre, hardRules, customRules, groupCols, order
    );
    S.lastValidityAnalysis.preHitRows = preHitRows;

    if (mount) {
      if (fullRerender || !mount.querySelector("#rvPreHitTableBody")) {
        mount.innerHTML = renderValidityPreHitTableHtml(preHitRows, groupCols, order);
        const tbody = $("rvPreHitTableBody");
        if (tbody) {
          tbody.dataset.rvSortBound = "";
          initRvPreHitDnD();
        }
        initResizableTables(mount);
      } else {
        updateRvPreHitTableCells(preHitRows, order);
      }
    }
  } catch (err) {
    console.error(err);
    if (mount) mount.innerHTML = `<p class="config-muted" style="color:var(--err)">贷前命中重算失败</p>`;
  } finally {
    S.rvPreHitRefreshBusy = false;
  }
}
async function refreshValidityPostWaterfallRiskView({ fullRerender = false } = {}) {
  if (!S.lastValidityAnalysis?.postRows || S.rvPostWfRiskRefreshBusy) return;
  S.rvPostWfRiskRefreshBusy = true;
  const mount = $("rvPostWaterfallRiskMount");
  try {
    const { postRows, hardRules, customRules, groupCols, waterfallOrder } = S.lastValidityAnalysis;
    const filterMap = (() => {
      const live = getRvGroupValueFilterState();
      if (Object.keys(live).length) return live;
      if (!groupCols?.length) return null;
      const map = {};
      const dimValues = collectGroupValuesFromValidityRows(S.lastValidityAnalysis.rows, groupCols);
      for (const col of groupCols) map[col] = new Set(dimValues[col] || []);
      return map;
    })();

    const filteredPost = filterPreRowsByRvGroupFilter(postRows, groupCols, filterMap);
    const order = dedupeWaterfallRules(waterfallOrder || [...hardRules, ...customRulesAsSoftRules(customRules)]);

    if (mount && fullRerender && !mount.querySelector("#rvPostWaterfallRiskBody")) {
      mount.innerHTML = `<p class="config-muted">贷后瀑布风险重算中…</p>`;
    }

    const summary = await computeValidityPostWaterfallRisk(
      filteredPost, hardRules, customRules, order
    );
    S.lastValidityAnalysis.postWaterfallRisk = summary;

    if (mount) {
      if (fullRerender || !mount.querySelector("#rvPostWaterfallRiskBody")) {
        mount.innerHTML = renderValidityPostWaterfallRiskHtml(summary, order, hardRules, customRules);
        initResizableTables(mount);
        const tbody = $("rvPostWaterfallRiskBody");
        if (tbody) {
          tbody.dataset.rvPostWfSortBound = "";
          initRvPostWfDnD();
        }
      } else {
        updateRvPostWfTableCells(summary, order, hardRules, customRules);
      }
    }
  } catch (err) {
    console.error(err);
    if (mount) mount.innerHTML = `<p class="config-muted" style="color:var(--err)">贷后瀑布风险重算失败</p>`;
  } finally {
    S.rvPostWfRiskRefreshBusy = false;
  }
}
function getValidityFilterMap(allRows, groupCols, { rebuildGroupFilter, savedGroupValueFilter, hasGroup }) {
  const priorFilterMap = (() => {
    if (rebuildGroupFilter) {
      if (!savedGroupValueFilter) return null;
      const map = {};
      for (const [col, vals] of Object.entries(savedGroupValueFilter)) {
        map[col] = new Set(vals);
      }
      return map;
    }
    const live = getRvGroupValueFilterState();
    return Object.keys(live).length ? live : null;
  })();

  return priorFilterMap || (() => {
    if (!hasGroup) return null;
    const map = {};
    const dimValues = collectGroupValuesFromValidityRows(allRows, groupCols);
    for (const col of groupCols) {
      map[col] = new Set(dimValues[col] || []);
    }
    return map;
  })();
}
function collectGroupValuesFromValidityRows(rows, groupCols) {
  const map = {};
  for (const col of groupCols) map[col] = new Set();
  for (const r of rows || []) {
    groupCols.forEach((col, i) => {
      map[col].add(String(r.groupParts?.[i] ?? ""));
    });
  }
  const out = {};
  for (const col of groupCols) {
    out[col] = [...map[col]].sort(compareDimValue);
  }
  return out;
}
function getRvGroupValueFilterState() {
  const bar = $("rvGroupValueFilter");
  if (!bar) return {};
  const groupCols = [...bar.querySelectorAll(".rv-group-value-dim[data-dim]")]
    .map((el) => el.dataset.dim)
    .filter(Boolean);
  if (!groupCols.length) return {};
  return CP().getDimFilterMap(groupCols, rvGroupValuePickerId);
}
function collectRvGroupValueFilter() {
  const bar = $("rvGroupValueFilter");
  if (!bar) return null;
  const groupCols = [...bar.querySelectorAll(".rv-group-value-dim[data-dim]")]
    .map((el) => el.dataset.dim)
    .filter(Boolean);
  return CP().collectDimFilterState(groupCols, rvGroupValuePickerId);
}
function rowMatchesRvGroupFilter(row, groupCols, filterMap) {
  for (let i = 0; i < groupCols.length; i++) {
    const col = groupCols[i];
    const allowed = filterMap[col];
    if (!allowed) continue;
    if (!allowed.size) return false;
    const val = String(row.groupParts?.[i] ?? "");
    if (!allowed.has(val)) return false;
  }
  return true;
}
function filterValidityResultRows(rows, groupCols, filterMap) {
  if (!groupCols?.length || !filterMap) return rows;
  return rows.filter((r) => rowMatchesRvGroupFilter(r, groupCols, filterMap));
}
function isPartialRvGroupValueFilter(allRows, groupCols, filterMap) {
  if (!filterMap || !groupCols?.length || !allRows?.length) return false;
  const dimValues = collectGroupValuesFromValidityRows(allRows, groupCols);
  for (const col of groupCols) {
    const allowed = filterMap[col];
    const all = dimValues[col] || [];
    if (!allowed || allowed.size < all.length) return true;
  }
  return false;
}
function buildRvGroupValueFilterHtml(result, savedFilter) {
  const groupCols = result.groupCols || [];
  if (!groupCols.length || !result.rows?.length) return "";
  const dimValues = collectGroupValuesFromValidityRows(result.rows, groupCols);
  let html = `<div id="rvGroupValueFilter" class="dist-filter-panel summary-trend-filters">
    <h4 class="rv-heading-with-hint filter-label">分组值筛选${hintBadgeHtml("勾选取值，即时筛行")}</h4>
    <div class="summary-trend-filter-bar">`;
  for (const col of groupCols) {
    const vals = dimValues[col] || [];
    const pickerId = rvGroupValuePickerId(col);
    html += `<div class="summary-trend-filter rv-group-value-dim" data-dim="${esc(col)}">`;
    html += CP().renderDimBlockHtml(pickerId, {
      dimLabel: col,
      valuesContainerClass: "rv-group-value-checks",
    });
    html += `</div>`;
  }
  html += `<div class="summary-trend-filter-actions">
    <button type="button" class="btn btn-secondary btn-sm rv-validity-select-all">全选</button>
    <button type="button" class="btn btn-secondary btn-sm rv-validity-clear-all">清空</button>
  </div></div></div>`;
  return html;
}
function renderValidityResults(result, ratioSpec, {
  rebuildGroupFilter = false,
  savedGroupValueFilter = null,
  refreshPreHit = true,
  refreshSwap = true,
  refreshRiskEst = true,
  refreshPostWaterfallRisk = true,
} = {}) {
  const mount = $("rvValidityResults");
  if (!mount) return;
  const { rows: allRows, eligibleCount, hardExcluded, groupCols } = result;
  const hasGroup = groupCols?.length > 0;

  const filterMap = getValidityFilterMap(allRows, groupCols, {
    rebuildGroupFilter, savedGroupValueFilter, hasGroup,
  });

  const rows = filterValidityResultRows(allRows, groupCols, filterMap);

  const savedFilterForHtml = filterMap
    ? Object.fromEntries(Object.entries(filterMap).map(([k, s]) => [k, [...s]]))
    : null;

  let html = `<div class="rv-validity-summary rv-result-card">
    分析基底（贷后样本，已排除硬规则命中）：<b>${eligibleCount.toLocaleString()}</b> 行；
    硬规则排除：<b>${hardExcluded.toLocaleString()}</b> 行；
    新建规则 × 软规则四象限交叉
  </div>`;
  let rvGroupDimValues = null;
  if (hasGroup && allRows.length) {
    rvGroupDimValues = collectGroupValuesFromValidityRows(allRows, groupCols);
    html += `<div class="rv-result-card">${buildRvGroupValueFilterHtml(result, savedFilterForHtml)}</div>`;
  }
  html += `<div class="rv-result-card">${renderValiditySummaryQuadrantTable(rows, ratioSpec)}</div>`;
  html += `<div class="rv-result-card">${renderValidityGroupedQuadrantTable(rows, groupCols, ratioSpec)}</div>`;
  html += `<div class="rv-result-card" id="rvPreHitTableMount">`;
  if (result.preHitRows?.length) {
    html += renderValidityPreHitTableHtml(
      result.preHitRows, groupCols, result.waterfallOrder
    );
  } else if (result.preRows) {
    html += `<p class="config-muted">贷前命中计算中…</p>`;
  } else {
    html += `<p class="config-muted">运行有效性检查后将展示贷前命中表</p>`;
  }
  html += `</div>`;
  html += `<div class="rv-result-card" id="rvPostWaterfallRiskMount">`;
  if (result.postWaterfallRisk) {
    html += renderValidityPostWaterfallRiskHtml(
      result.postWaterfallRisk, result.waterfallOrder, result.hardRules, result.customRules
    );
  } else if (result.postRows) {
    html += `<p class="config-muted">贷后瀑布风险计算中…</p>`;
  } else {
    html += `<p class="config-muted">运行有效性检查后将展示贷后瀑布风险</p>`;
  }
  html += `</div>`;
  html += `<div class="rv-result-card" id="rvSwapTableMount">`;
  if (result.swapRows?.length) {
    html += renderValiditySwapTableHtml(result.swapRows, groupCols, ratioSpec);
  } else if (result.preRows) {
    html += `<p class="config-muted">Swap 分析计算中…</p>`;
  } else {
    html += `<p class="config-muted">运行有效性检查后将展示 Swap 分析</p>`;
  }
  html += `</div>`;
  html += `<div class="rv-result-card" id="rvRiskEstMount">`;
  if (result.riskEstRows?.length) {
    html += renderRiskEstTableHtml(
      { rows: result.riskEstRows, binCol: $("rvRiskEstVar")?.value, multiplier: parseFloat($("rvRiskEstMultiplier")?.value) || 1, rule: result.riskEstRule },
      ratioSpec
    );
  } else if (result.preRows) {
    html += `<p class="config-muted">风险预估计算中…</p>`;
  } else {
    html += `<p class="config-muted">运行有效性检查并配置 Panel 4 后将展示风险预估</p>`;
  }
  html += `</div>`;

  mount.innerHTML = html;
  if (rvGroupDimValues) {
    initRvGroupValueDimPickers(groupCols, savedFilterForHtml, rvGroupDimValues);
  }
  initResizableTables(mount);
  const tbody = $("rvPreHitTableBody");
  if (tbody) {
    tbody.dataset.rvSortBound = "";
    initRvPreHitDnD();
  }
  const postWfTbody = $("rvPostWaterfallRiskBody");
  if (postWfTbody) {
    postWfTbody.dataset.rvPostWfSortBound = "";
    initRvPostWfDnD();
  }
  if (isExportMode()) {
    exportRefreshValidityFilteredViews(filterMap);
  } else {
    if (result.preRows && refreshPreHit) {
      void refreshValidityPreHitView({ fullRerender: true });
    }
    if (result.preRows && refreshSwap) {
      void refreshValiditySwapView({ fullRerender: true });
    }
    if (result.preRows && refreshRiskEst) {
      void refreshRiskEstView({ fullRerender: true });
    }
    if (result.postRows && refreshPostWaterfallRisk) {
      void refreshValidityPostWaterfallRiskView({ fullRerender: true });
    }
  }
}
function snapshotValidityUiState() {
  if (!$("tab-validity")) return null;
  const customRules = collectCustomRulesFromUI();
  const hardRules = collectValidityHardRules();
  const softRules = collectValiditySoftRules();
  const hardCols = hardRules.filter((r) => r.type === "binary_col").map((r) => ({
    col: r.column, hitWhen: r.hitWhen,
  }));
  const softLegacy = {
    binary: softRules.filter((r) => r.type === "binary_col").map((r) => ({ col: r.column, hitWhen: r.hitWhen })),
    numeric: softRules.filter((r) => r.type === "numeric_cmp").map((r) => ({
      column: r.column, operator: r.operator, threshold: r.threshold, includeMissing: r.includeMissing,
    })),
    composite: softRules.filter((r) => r.type === "composite").map((r) => ({
      id: r.id, name: r.name, root: r.root,
    })),
  };
  return {
    hardRules: hardCols.map((h) => h.col),
    softRules: softLegacy.binary.map((b) => b.col),
    binaryHitWhen: {
      hard: Object.fromEntries(hardCols.filter((h) => h.hitWhen === "zero").map((h) => [h.col, "zero"])),
      soft: Object.fromEntries(softLegacy.binary.filter((b) => b.hitWhen === "zero").map((b) => [b.col, "zero"])),
    },
    softNumeric: softLegacy.numeric,
    softComposite: softLegacy.composite,
    baselineLegacy: softLegacy,
    baselineHardCols: hardCols,
    validityBaselineMode: RV.app.rulesIo?.getValidityBaselineMode?.() || S.validityBaselineMode || "follow",
    groupCols: getChecked($("rvGroupCols")),
    groupOrder: getValidityGroupCols(),
    customRules,
    groupValueFilter: collectRvGroupValueFilter(),
    waterfallOrder: S.lastValidityAnalysis?.waterfallOrder?.map((r) => r.id) || null,
  };
}
function restoreValidityUiState(state) {
  if (!state) return;
  if (state.validityBaselineMode && RV.app.rulesIo?.setValidityBaselineMode) {
    RV.app.rulesIo.setValidityBaselineMode(state.validityBaselineMode);
  }
  if (RV.app.rulesIo?.getValidityBaselineMode?.() === "follow") {
    syncValidityRulesFromSidebar({ setFollow: false });
  } else {
    const hardCols = (state.baselineHardCols || []).length
      ? state.baselineHardCols
      : (state.hardRules || []).map((col) => ({
        col,
        hitWhen: state.binaryHitWhen?.hard?.[col] || "one",
      }));
    const softLegacy = state.baselineLegacy || {
      binary: (state.softRules || []).map((col) => ({
        col,
        hitWhen: state.binaryHitWhen?.soft?.[col] || "one",
      })),
      numeric: state.softNumeric || [],
      composite: state.softComposite || [],
    };
    applyValidityBaselineFromLegacy(hardCols, softLegacy, []);
  }
  RV.ui.collapsedPicker.applySelection("rvGroup", state.groupCols || []);
  syncSampleGroupOrderList("rv");
  if (state.groupOrder?.length && $("rvGroupOrder")) {
    const checked = new Set(getChecked($("rvGroupCols")));
    const orderEl = $("rvGroupOrder");
    orderEl.innerHTML = "";
    for (const col of state.groupOrder) {
      if (!checked.has(col)) continue;
      orderEl.appendChild(RV.ui.sidebar.buildSampleGroupOrderItemEl(col));
    }
    refreshSampleGroupOrderIndexes("rv");
  }
  applyCustomRulesFromPack(state.customRules || []);
  if (state.waterfallOrder?.length && S.lastValidityAnalysis) {
    const customSoft = customRulesAsSoftRules(S.lastValidityAnalysis.customRules);
    const allRules = [...(S.lastValidityAnalysis.hardRules || []), ...customSoft];
    const ruleMap = Object.fromEntries(allRules.map((r) => [r.id, r]));
    S.lastValidityAnalysis.waterfallOrder = dedupeWaterfallRules(
      state.waterfallOrder.map((id) => ruleMap[id]).filter(Boolean)
    );
    for (const r of allRules) {
      if (!S.lastValidityAnalysis.waterfallOrder.find((x) => x.id === r.id)) {
        S.lastValidityAnalysis.waterfallOrder.push(r);
      }
    }
    S.lastValidityAnalysis.waterfallOrder = dedupeWaterfallRules(S.lastValidityAnalysis.waterfallOrder);
    if (S.lastValidityAnalysis.preRows) {
      void refreshValidityPreHitView({ fullRerender: true });
    }
    if (S.lastValidityAnalysis.postRows) {
      void refreshValidityPostWaterfallRiskView({ fullRerender: true });
    }
  }
}
function setupValidityTabShell(groupCols, { syncSidebar = true } = {}) {
  mountValidityTabShell();
  bindRuleRowToolbars();
  initSampleGroupPanel("rv", groupCols);
  void initRiskEstPostSamplePanel(getAnalysisTimeCols());
  if (syncSidebar) {
    syncValidityRulesFromSidebar();
    copyPostGroupToValidity();
  }
  updateBaselineHostReadonly();
  RE().refreshExprCondColSelects(baselineHost());
  RE().refreshExprCondColSelects(candidateHost());
  const btn = $("btnRunValidityCheck");
  if (btn) btn.disabled = !S.rawRows.length;
  if (S.lastValidityAnalysis) {
    renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec, { rebuildGroupFilter: true });
  }
  bindValidityPanelEvents();
  RV.app.rulesIo?.initRulesPackIO?.();
  RV.app.rulesIo?.refreshValidityBaselineModeUI?.();
}
function remountValidityTabAfterReport(priorState) {
  setupValidityTabShell(getAnalysisGroupDimensionCandidates(), { syncSidebar: false });
  restoreValidityUiState(priorState);
  syncCandidateRuleCount();
  if (S.lastValidityAnalysis) {
    renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec, {
      rebuildGroupFilter: true,
      savedGroupValueFilter: priorState?.groupValueFilter,
      refreshPreHit: false,
      refreshSwap: false,
      refreshRiskEst: false,
      refreshPostWaterfallRisk: false,
    });
  }
}
function initValidityTab(groupCols) {
  setupValidityTabShell(groupCols, { syncSidebar: true });
  RV.app.rulesIo?.initRulesPackIO?.();
}
function getRiskEstPostSampleConfig() {
  return getSampleConfig("rvRiskPost");
}
function getRiskEstPostRows() {
  if (!S.rawRows.length) return [];
  return applyFilters(S.rawRows, getRiskEstPostSampleConfig());
}
function validateValidityConfig() {
  if (!S.rawRows.length) return "请先上传 CSV";
  const customRules = collectCustomRulesFromUI();
  if (!customRules.length) return "请至少配置 1 条有效的候选拒人规则（名称 + 至少 1 个条件）";
  const baseline = RV.app.rulesIo?.collectEffectiveValidityBaseline
    ? RV.app.rulesIo.collectEffectiveValidityBaseline()
    : { softRules: collectValiditySoftRules() };
  if (!baseline.softRules?.length) return "请至少勾选 1 条软规则（跟随模式下请在左侧配置）";
  const ratioSpecs = collectRatioSpecs();
  if (!ratioSpecs.length) return "请配置至少 1 个风险比率";
  const postRows = applyFilters(S.rawRows, getSampleConfig("post"));
  if (!postRows.length) return "贷后样本为空，请检查左侧贷后样本筛选";
  return null;
}
function collectValidityHardRules() {
  const { hardRules } = RV.ui.ruleRows.collectRulesFromHost(baselineHost(), { role: "baseline" });
  return hardRules;
}
function collectValiditySoftRules() {
  const { softRules } = RV.ui.ruleRows.collectRulesFromHost(baselineHost(), { role: "baseline" });
  return softRules;
}
function collectCustomRulesFromUI() {
  const { candidateRules } = RV.ui.ruleRows.collectRulesFromHost(candidateHost(), { forceCandidate: true });
  return candidateRules;
}

  Object.assign(target, {
    setRvValidityStatus, refreshRvGroupColSearch, updateBaselineHostReadonly, bindRuleRowToolbars, baselineHost, candidateHost, addCustomRuleCard, syncCandidateRuleCount, syncValidityRulesFromSidebar, applyValidityBaselineFromLegacy, applyCustomRulesFromPack,
    renderValidityTabShell, mountValidityTabShell,
    getValidityGroupCols, fillExprColSelect, createExprCondEl, createExprGroupEl, countExprLeaves, collectExprFromEl, restoreExprToDom, appendExprNodeToGroup, addRvNumericRuleRow, addRvCompositeSoftRuleRow, mirrorSidebarToValidityIfFollow, copyPostGroupToValidity, bindValidityPanelEvents, markValidityResultsStale, clearValidityResultsStale, collapseValidityConfigAfterRun, expandValidityConfigPanels, refreshValidityConfigPanelSummaries, syncCandidatesToSidebarRules, renderQuadrantPivotCell, renderValiditySummaryQuadrantTable, renderValidityGroupedQuadrantTable, renderSwapRiskCell, renderSwapPostDenCell, renderValiditySwapTableHtml, applyRiskEstPostSampleConfig, syncRiskEstPostFromSidebar, runRiskEstSyncFromSidebar, fillRiskEstVarSelect, initRiskEstPostSamplePanel, stepRiskEstBins, stepRiskEstMultiplier, scheduleRefreshRiskEstView, syncRiskEstScopeBadge, setRiskEstSampleMode, markRiskEstSampleIndependent, renderRiskEstRateCell, renderRiskEstDenCell, renderRiskEstTableHtml, refreshRiskEstView, renderValidityPreHitTableHtml, readRvWaterfallOrderFromDom, updateRvPreHitTableCells, initRvPreHitDnD, refreshValiditySwapView, refreshValidityPreHitView, renderValidityPostWaterfallRiskHtml, refreshValidityPostWaterfallRiskView, readRvPostWfWaterfallOrderFromDom, updateRvPostWfTableCells, initRvPostWfDnD, applyRvWaterfallOrderChange, isPartialRvGroupValueFilter, getValidityFilterMap, collectGroupValuesFromValidityRows, getRvGroupValueFilterState, collectRvGroupValueFilter, rowMatchesRvGroupFilter, filterValidityResultRows, buildRvGroupValueFilterHtml, initRvGroupValueDimPickers, syncRvGroupValueDimPickers, renderValidityResults, snapshotValidityUiState, restoreValidityUiState, setupValidityTabShell, remountValidityTabAfterReport, initValidityTab, getRiskEstPostSampleConfig, getRiskEstPostRows, validateValidityConfig, collectValidityHardRules, collectValiditySoftRules, collectCustomRulesFromUI });
})(window.RV);
