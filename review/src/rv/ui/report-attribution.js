(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const applyFilters = RV.sample.applyFilters;
  const getSampleConfig = RV.sample.getSampleConfig;
  const collectSampleFilterExport = RV.sample.collectSampleFilterExport;
  const periodMask = RV.sample.periodMask;
  const aggregateRatio = RV.domain.attribution.aggregateRatio;
  const buildOrderedDimContributions = RV.domain.attribution.buildOrderedDimContributions;
  const ATTR_FIXED_METRICS = RV.domain.attribution.ATTR_FIXED_METRICS || [];
  const ATTR_SECOND_DIM_TOP_K = RV.domain.attribution.ATTR_SECOND_DIM_TOP_K || 8;
  const buildDimBinRulesFromSpecs = RV.domain.attribution.buildDimBinRulesFromSpecs;
  const profileStats = RV.domain.attribution.profileStats;
  const computeModelCompare = RV.domain.attribution.computeModelCompare;
  const buildYVector = RV.domain.eda.buildYVector;
  const checkNumericColumn = RV.domain.attribution.checkNumericColumn;
  const estimateSegmentCount = RV.domain.attribution.estimateSegmentCount;
  const formatDimensionDisplay = RV.domain.attribution.formatDimensionDisplay;
  const createFilterRule = RV.ui.sidebar.createFilterRule;
  const fillSelect = RV.ui.sidebar.fillSelect;
  const getChecked = RV.ui.sidebar.getChecked;
  const getColumnUniques = RV.data.getColumnUniques;
  const getColumnUniquesAsync = RV.data.getColumnUniquesAsync;
  const ensureReportDocument = RV.ui.report.analysis.ensureReportDocument;
  const initResizableTables = RV.ui.report.analysis.initResizableTables;
  const esc = RV.infra.esc;
  const fmtAttrCell = RV.infra.fmtAttrCell;
  const fmtAttrSignedCell = RV.infra.fmtAttrSignedCell;
  const fmtAttrNumber = RV.infra.fmtAttrNumber;
  const fmtMetric = RV.infra.fmtMetric;
  const toPercentDisplay = RV.infra.toPercentDisplay;
  const helpTipHtml = RV.infra.helpTipHtml;
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const thWithResizer = RV.infra.thWithResizer;
  const kdeDensity = RV.infra.kdeDensity;
  const smoothCurvePath = RV.infra.smoothCurvePath;
  const svgEl = RV.infra.svgEl;
  const svgText = RV.infra.svgText;
  const formatAxisTick = RV.infra.formatAxisTick;
  const CP = () => RV.ui.collapsedPicker;
  const deferMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (fn) => Promise.resolve().then(fn);
  var ui = RV.ui = RV.ui || {};
  var report = ui.report = ui.report || {};
  var target = report.attribution = report.attribution || {};

  let eventsBound = false;
  let lastDistSpecs = [];
  let attrPeriodRefreshSeq = 0;
  let attrDebugStage = "idle";
  function minMaxNumbers(arr) {
    return RV.infra.minMaxNumbers(arr);
  }

  function buildDaCheckboxGrid(containerId, cols, metaId) {
    return RV.ui.report.analysis.buildDaCheckboxGrid(containerId, cols, metaId);
  }
  function filterCheckboxGrid(container, metaEl, query, selectedOnly) {
    return RV.ui.report.analysis.filterCheckboxGrid(container, metaEl, query, selectedOnly);
  }
  function applyCheckboxSelection(containerId, values) {
    return RV.ui.report.analysis.applyCheckboxSelection(containerId, values);
  }
  function getAttrPeriodColCandidates() {
    if (RV.ui.report.analysis.getAnalysisTimeCols) {
      return RV.ui.report.analysis.getAnalysisTimeCols();
    }
    const timeCandidates = S.headers.filter((h) =>
      /月份|日期|时间|month|date/i.test(h) || S.enumCols.includes(h)
    );
    return timeCandidates.length ? timeCandidates : S.enumCols.slice(0, 20);
  }

  function attrTableWrap(tableMarkup) {
    const t = tableMarkup.includes('class="data-table"')
      ? tableMarkup
      : tableMarkup.replace(/^<table\b/, '<table class="data-table"');
    return `<div class="table-interactive-wrap attr-table-wrap" tabindex="0" title="表格可滚动；拖动表头右侧调整列宽">${t}</div>`;
  }

  function simpleTableHtml(cols, rows) {
    let h = '<table class="data-table"><thead><tr>'
      + cols.map((c) => thWithResizer(esc(c))).join("")
      + "</tr></thead><tbody>";
    for (const row of rows) {
      h += "<tr>" + row.map((c, i) => `<td>${fmtAttrCell(cols[i], c)}</td>`).join("") + "</tr>";
    }
    return attrTableWrap(h + "</tbody></table>");
  }

  function setAttrAnalysisStatus(msg, kind) {
    const el = $("attrAnalysisStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function setAttrDebugStage(stage) {
    attrDebugStage = stage;
  }

  function registerAttrPickers() {
    if (!CP().getPickerSpec("attrProfile")) {
      CP().registerPicker("attrProfile", {
        selectedId: "attrProfileSelected",
        checksId: "attrProfileChecks",
        metaId: "attrProfileChecksMeta",
        searchId: "attrProfileChecksSearch",
        pickerId: "attrProfilePicker",
        toggleId: "attrProfilePickerToggle",
        selectedOnlyId: "attrProfileSelectedOnly",
        emptyLabel: "未选择画像变量",
        metaUnit: "个变量",
        toggleAdd: "添加变量 ▾",
        toggleCollapse: "收起 ▴",
      });
    }
    if (!CP().getPickerSpec("attrModel")) {
      CP().registerPicker("attrModel", {
        selectedId: "attrModelSelected",
        checksId: "attrModelChecks",
        metaId: "attrModelChecksMeta",
        searchId: "attrModelChecksSearch",
        pickerId: "attrModelPicker",
        toggleId: "attrModelPickerToggle",
        selectedOnlyId: "attrModelSelectedOnly",
        emptyLabel: "未选择模型分列",
        metaUnit: "个模型",
        toggleAdd: "添加模型 ▾",
        toggleCollapse: "收起 ▴",
      });
    }
    const periodOnChange = () => {
      refreshAttrDimSegmentHint();
      refreshAttrConfigPanelSummaries();
      markAttributionResultsStale();
    };
    if (!CP().getPickerSpec("attrBasePeriod")) {
      CP().registerPicker("attrBasePeriod", {
        selectedId: "attrBasePeriodSelected",
        checksId: "attrBaseValues",
        metaId: "attrBasePeriodMeta",
        searchId: "attrBasePeriodSearch",
        pickerId: "attrBasePeriodPicker",
        toggleId: "attrBasePeriodPickerToggle",
        selectedOnlyId: "attrBasePeriodSelectedOnly",
        emptyLabel: "未选择基期取值",
        metaUnit: "个取值",
        toggleAdd: "添加取值 ▾",
        toggleCollapse: "收起 ▴",
        maxVisibleTags: 4,
        popover: true,
        listLayout: true,
        onChange: periodOnChange,
      });
    } else {
      CP().getPickerSpec("attrBasePeriod").onChange = periodOnChange;
    }
    if (!CP().getPickerSpec("attrCmpPeriod")) {
      CP().registerPicker("attrCmpPeriod", {
        selectedId: "attrCmpPeriodSelected",
        checksId: "attrCmpValues",
        metaId: "attrCmpPeriodMeta",
        searchId: "attrCmpPeriodSearch",
        pickerId: "attrCmpPeriodPicker",
        toggleId: "attrCmpPeriodPickerToggle",
        selectedOnlyId: "attrCmpPeriodSelectedOnly",
        emptyLabel: "未选择比较期取值",
        metaUnit: "个取值",
        toggleAdd: "添加取值 ▾",
        toggleCollapse: "收起 ▴",
        maxVisibleTags: 4,
        popover: true,
        listLayout: true,
        onChange: periodOnChange,
      });
    } else {
      CP().getPickerSpec("attrCmpPeriod").onChange = periodOnChange;
    }
  }

  function renderAttrPickerChrome(pickerId, opts) {
    return CP().renderChromeHtml(pickerId, {
      showToolbar: true,
      searchPlaceholder: "搜索列名…",
      toggleAdd: opts.toggleAdd,
      ...opts,
    });
  }

  function renderAttributionTabShell() {
    return `<section id="tab-attribution" class="report-tab-section">
<div class="container">
  <header>
    <h1>风险异动归因分析</h1>
    <p>基期 / 比较期比率拆解 · 贡献度 · 画像对比 · 模型指标</p>
  </header>
  <div id="attrStaleBanner" class="rv-stale-banner" role="status">
    <span>归因配置已变，结果可能过期。</span>
    <button type="button" class="btn btn-secondary btn-sm" id="attrStaleRerunBtn">重跑归因分析</button>
  </div>
  <div class="da-panel-stack">
    <div class="rv-wb-zone-label" style="margin-bottom:-.35rem">配置</div>
    <div class="da-config-panel" id="attrPanelFilter">
      <div class="da-panel-header" data-config-panel-toggle="attrPanelFilter" role="button" tabindex="0">
        <span class="da-panel-num">1</span>
        <span class="da-panel-title-text">数据筛选${hintBadgeHtml("默认跟贷后；改后独立；条件为且")}</span>
        <span class="da-panel-summary" id="attrPanelFilterSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <button type="button" class="btn btn-secondary btn-sm" id="attrSyncPostSample" style="margin-bottom:.35rem">从左侧贷后复制</button>
        <div class="sample-sub-block sample-sub-filter" style="margin-bottom:.45rem">
          <h5 style="margin:0 0 .35rem;font-size:.78rem;color:var(--text-muted);font-weight:600">筛选字段</h5>
          <div id="attrPrimaryFilterSelected" class="sample-filter-selected-tags"></div>
          <div id="attrPrimaryFilterEditor" class="sample-filter-editor-panel" hidden>
            <div class="sample-filter-editor-head">
              <span>编辑主筛选</span>
              <button type="button" class="btn btn-secondary btn-sm" data-sample-editor-done="attr" data-sample-primary="1">完成</button>
            </div>
            <label>字段</label>
            <select id="attrPrimaryFilterCol"></select>
            <div id="attrPrimaryFilterEditorBody" class="primary-filter-ui"></div>
          </div>
          <div id="attrPrimaryFilter" class="sample-filter-rules-pool primary-filter-ui" hidden aria-hidden="true"></div>
          <p id="attrPrimaryFilterMeta" class="chk-filter-meta sample-filter-meta">未选择取值（不选=全部）</p>
        </div>
        <div class="sample-sub-block sample-sub-filter">
          <h5 style="margin:0 0 .35rem;font-size:.78rem;color:var(--text-muted);font-weight:600">额外筛选（且）</h5>
          <div id="attrFilterSelected" class="sample-filter-selected-tags"></div>
          <div id="attrFilterEditor" class="sample-filter-editor-panel" hidden>
            <div class="sample-filter-editor-head">
              <span id="attrFilterEditorTitle">编辑筛选</span>
              <button type="button" class="btn btn-secondary btn-sm" data-sample-editor-done="attr">完成</button>
            </div>
            <div id="attrFilterEditorBody"></div>
          </div>
          <div id="attrFilterRules" class="sample-filter-rules-pool" hidden aria-hidden="true"></div>
          <div class="filter-add-row">
            <input type="search" id="attrFilterSearch" class="chk-filter-input" placeholder="搜索列名…" autocomplete="off" />
            <button type="button" class="btn btn-secondary btn-sm" id="attrAddFilter">+ 筛选</button>
          </div>
          <p id="attrFilterMeta" class="chk-filter-meta sample-filter-meta">无额外筛选</p>
        </div>
      </div>
    </div>

    <div class="da-config-panel" id="attrPanelPeriod">
      <div class="da-panel-header" data-config-panel-toggle="attrPanelPeriod" role="button" tabindex="0">
        <span class="da-panel-num">2</span>
        <span class="da-panel-title-text">基期 / 比较期</span>
        <span class="da-panel-summary" id="attrPanelPeriodSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <label for="attrPeriodCol">期别字段</label>
        <select id="attrPeriodCol"></select>
        <label style="margin-top:.65rem">基期取值（多选）</label>
        ${renderAttrPickerChrome("attrBasePeriod", {
          selectedId: "attrBasePeriodSelected",
          toggleId: "attrBasePeriodPickerToggle",
          pickerId: "attrBasePeriodPicker",
          checksId: "attrBaseValues",
          metaId: "attrBasePeriodMeta",
          searchId: "attrBasePeriodSearch",
          selectedOnlyId: "attrBasePeriodSelectedOnly",
          toggleAdd: "添加取值 ▾",
        })}
        <label style="margin-top:.65rem">比较期取值（多选）</label>
        ${renderAttrPickerChrome("attrCmpPeriod", {
          selectedId: "attrCmpPeriodSelected",
          toggleId: "attrCmpPeriodPickerToggle",
          pickerId: "attrCmpPeriodPicker",
          checksId: "attrCmpValues",
          metaId: "attrCmpPeriodMeta",
          searchId: "attrCmpPeriodSearch",
          selectedOnlyId: "attrCmpPeriodSelectedOnly",
          toggleAdd: "添加取值 ▾",
        })}
      </div>
    </div>

    <div class="da-config-panel" id="attrPanelRatio">
      <div class="da-panel-header" data-config-panel-toggle="attrPanelRatio" role="button" tabindex="0">
        <span class="da-panel-num">3</span>
        <span class="da-panel-title-text">比率指标${hintBadgeHtml("固定拆订单风险/金额风险/授信件均")}</span>
        <span class="da-panel-summary" id="attrPanelRatioSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <p class="config-muted" style="margin:0 0 .35rem">只拆这三条；列缺失的指标会跳过。可改分子/分母列。</p>
        <div id="attrRatioRows"></div>
      </div>
    </div>

    <div class="da-config-panel" id="attrPanelDim">
      <div class="da-panel-header" data-config-panel-toggle="attrPanelDim" role="button" tabindex="0">
        <span class="da-panel-num">4</span>
        <span class="da-panel-title-text">贡献度维度${hintBadgeHtml("第一维全样本拆；第二维在各段内再拆")}</span>
        <span class="da-panel-summary" id="attrPanelDimSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div id="attrDimSpecList" class="attr-dim-spec-list"></div>
        <p id="attrDimSpecMeta" class="chk-filter-meta sample-filter-meta">请配置第一维与第二维</p>
        <p id="attrDimSegmentHint" class="status"></p>
        <p id="attrDimBinHint" class="status"></p>
      </div>
    </div>

    <div class="da-config-panel" id="attrPanelProfile">
      <div class="da-panel-header" data-config-panel-toggle="attrPanelProfile" role="button" tabindex="0">
        <span class="da-panel-num">5</span>
        <span class="da-panel-title-text">画像 / 模型${hintBadgeHtml("画像做KDE；模型分比基期/比较期")}</span>
        <span class="da-panel-summary" id="attrPanelProfileSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
      <label>画像变量</label>
      ${renderAttrPickerChrome("attrProfile", {
        selectedId: "attrProfileSelected",
        toggleId: "attrProfilePickerToggle",
        pickerId: "attrProfilePicker",
        checksId: "attrProfileChecks",
        metaId: "attrProfileChecksMeta",
        searchId: "attrProfileChecksSearch",
        selectedOnlyId: "attrProfileSelectedOnly",
        toggleAdd: "添加变量 ▾",
      })}
      <label style="margin-top:.65rem">模型分列</label>
      ${renderAttrPickerChrome("attrModel", {
        selectedId: "attrModelSelected",
        toggleId: "attrModelPickerToggle",
        pickerId: "attrModelPicker",
        checksId: "attrModelChecks",
        metaId: "attrModelChecksMeta",
        searchId: "attrModelChecksSearch",
        selectedOnlyId: "attrModelSelectedOnly",
        toggleAdd: "添加模型 ▾",
      })}
      <label style="margin-top:.65rem">坏样本标签 <span style="font-weight:400;color:var(--text-muted)">（仅 AUC / KS / IV）</span></label>
      <select id="attrBadMode">
        <option value="numerator" selected>第 1 个比率指标的分子列 &gt; 0</option>
        <option value="column">指定列 &gt; 阈值</option>
      </select>
      <p id="attrBadNumeratorHint" class="status ok" style="margin:.35rem 0 .5rem;font-size:.8rem"></p>
      <div id="attrBadColumnPickers" style="display:none">
        <label>标签列</label>
        <select id="attrBadCol"></select>
        <label>阈值（数值 &gt; 阈值为坏）</label>
        <input type="number" id="attrBadThreshold" value="0" step="any" />
      </div>
      <label style="margin-top:.5rem">IV 分箱数（模型分，默认 5 箱并合并稀疏尾箱）</label>
      <input type="number" id="attrIvBins" value="5" min="3" max="20" />
      <label style="margin-top:.5rem;display:flex;align-items:flex-start;gap:.35rem;color:var(--text-dim);font-size:.8rem">
        <input type="checkbox" id="attrHigherScoreIsWorse" checked style="width:auto;margin-top:2px" />
        <span>评分类模型分优先${hintBadgeHtml("自动取 AUC 更高分向；高分=低风险先试−分")}</span>
      </label>
      </div>
    </div>

    <div class="da-config-panel" id="attrPanelRun">
      <div class="da-panel-header"><span class="da-panel-num">6</span>运行</div>
      <button type="button" class="btn btn-primary" id="btnRunAttribution" disabled>运行归因分析</button>
      <p id="attrAnalysisStatus" class="status" style="min-height:1.25rem"></p>
    </div>
  </div>
  <div class="rv-wb-zone rv-wb-results">
    <div class="rv-wb-zone-label">结果</div>
    <div id="attrResultsMount"><p class="da-results-placeholder">配置期别与比率后点击「运行归因分析」</p></div>
  </div>
</div>
</section>`;
  }

  function mountAttributionTabShell() {
    if (S.sampleFilterEditing?.prefix === "attr") {
      RV.ui.sidebar.closeSampleFilterEditor?.("attr");
    }
    const doc = ensureReportDocument();
    const old = doc.querySelector("#tab-attribution");
    if (old) old.remove();
    doc.insertAdjacentHTML("beforeend", renderAttributionTabShell());
  }

  function guessAttrFixedRatios(overrides) {
    const byName = {};
    (overrides || []).forEach((r) => {
      if (r && r.name) byName[r.name] = r;
    });
    const headers = S.headers || [];
    return ATTR_FIXED_METRICS.map((m) => {
      const ov = byName[m.name] || {};
      const num = headers.includes(ov.num) ? ov.num : (headers.includes(m.numCol) ? m.numCol : "");
      const den = headers.includes(ov.den) ? ov.den : (headers.includes(m.denCol) ? m.denCol : "");
      return { id: m.id, name: m.name, num, den, missing: !num || !den };
    });
  }

  function fillAttrColSelect(sel, value) {
    if (!sel) return;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "（缺列，跳过）";
    sel.appendChild(opt0);
    for (const h of S.headers || []) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      sel.appendChild(o);
    }
    if (value && (S.headers || []).includes(value)) sel.value = value;
    else sel.value = "";
  }

  function renderFixedAttrRatioRows(overrides) {
    const host = $("attrRatioRows");
    if (!host) return;
    host.innerHTML = "";
    for (const preset of guessAttrFixedRatios(overrides)) {
      const row = document.createElement("div");
      row.className = "ratio-row attr-fixed-ratio-row" + (preset.missing ? " is-missing" : "");
      row.dataset.metricId = preset.id;
      row.innerHTML = `
        <div><label>名称</label><input type="text" class="ratio-name" value="${esc(preset.name)}" readonly /></div>
        <div><label>分子列</label><select class="ratio-num"></select></div>
        <div><label>分母列</label><select class="ratio-den"></select></div>`;
      fillAttrColSelect(row.querySelector(".ratio-num"), preset.num);
      fillAttrColSelect(row.querySelector(".ratio-den"), preset.den);
      host.appendChild(row);
    }
  }

  function addAttrRatioRow(preset) {
    renderFixedAttrRatioRows(preset ? [preset] : null);
  }

  function getFirstAttrRatioNumeratorCol() {
    const ratios = collectAttrRatios();
    return ratios[0]?.num || "";
  }

  function resolveAttrBadLabelSpec(cfg) {
    const mode = cfg?.badMode ?? $("attrBadMode")?.value ?? "numerator";
    if (mode === "numerator") {
      const col = (cfg?.ratios && cfg.ratios[0]?.num) || getFirstAttrRatioNumeratorCol();
      return { col, threshold: 0, desc: `第 1 个比率指标分子列「${col}」> 0` };
    }
    const col = cfg?.badCol ?? $("attrBadCol")?.value ?? "";
    const threshold = Number(cfg?.badThreshold ?? $("attrBadThreshold")?.value);
    const th = Number.isFinite(threshold) ? threshold : 0;
    return { col, threshold: th, desc: `列「${col}」> ${th}` };
  }

  function refreshAttrBadLabelUI() {
    const mode = $("attrBadMode")?.value || "numerator";
    const hint = $("attrBadNumeratorHint");
    const pickers = $("attrBadColumnPickers");
    if (mode === "numerator") {
      const col = getFirstAttrRatioNumeratorCol() || "（请配置比率指标）";
      if (hint) {
        hint.textContent = `默认：第 1 个比率指标分子列「${col}」> 0 记为坏样本`;
        hint.style.display = "";
      }
      if (pickers) pickers.style.display = "none";
    } else {
      if (hint) hint.style.display = "none";
      if (pickers) pickers.style.display = "";
    }
  }

  function fmtModelMetricDelta(v) {
    return fmtAttrSignedCell("AUC差", v);
  }

  function collectAttrRatios() {
    const ratios = [];
    $("attrRatioRows")?.querySelectorAll(".ratio-row").forEach((row) => {
      const num = row.querySelector(".ratio-num")?.value || "";
      const den = row.querySelector(".ratio-den")?.value || "";
      if (!num || !den) return;
      ratios.push({
        name: row.querySelector(".ratio-name")?.value?.trim() || "比率",
        num,
        den,
      });
    });
    return ratios;
  }

  function normalizeAttributionConfigForCompare(cfg) {
    if (!cfg) return null;
    const filterMap = cfg.filterMap || {};
    const filterRanges = cfg.filterRanges || {};
    const sortedFilterMap = {};
    Object.keys(filterMap).sort().forEach((k) => {
      sortedFilterMap[k] = [...(filterMap[k] || [])].sort();
    });
    const sortedFilterRanges = {};
    Object.keys(filterRanges).sort().forEach((k) => {
      sortedFilterRanges[k] = filterRanges[k];
    });
    return {
      periodCol: cfg.periodCol || "",
      baseVals: [...(cfg.baseVals || [])].sort(),
      cmpVals: [...(cfg.cmpVals || [])].sort(),
      primaryFilter: cfg.primaryFilter || { column: "", values: [] },
      filterMap: sortedFilterMap,
      filterRanges: sortedFilterRanges,
      ratios: (cfg.ratios || []).map((r) => ({
        name: r.name || "",
        num: r.num || "",
        den: r.den || "",
      })),
      dimensionSpecs: (cfg.dimensionSpecs || legacyStateToDimensionSpecs(cfg))
        .map(normalizeDimensionSpec)
        .filter(Boolean)
        .sort((a, b) => a.col.localeCompare(b.col)),
      profileVars: [...(cfg.profileVars || [])].sort(),
      modelVars: [...(cfg.modelVars || [])].sort(),
      badMode: cfg.badMode || "numerator",
      badCol: cfg.badCol || "",
      badThreshold: cfg.badThreshold != null ? cfg.badThreshold : 0,
      ivBins: cfg.ivBins != null ? cfg.ivBins : 5,
      higherScoreIsWorse: cfg.higherScoreIsWorse !== false,
    };
  }

  function attributionConfigsMatch(a, b) {
    return JSON.stringify(normalizeAttributionConfigForCompare(a))
      === JSON.stringify(normalizeAttributionConfigForCompare(b));
  }

  function clearAttributionAnalysisCache() {
    S.lastAttributionAnalysis = null;
    clearAttributionResultsStale();
    const mount = $("attrResultsMount");
    if (mount) {
      mount.innerHTML = '<p class="da-results-placeholder">配置期别与比率后点击「运行归因分析」</p>';
    }
  }

  function markAttributionResultsStale() {
    if (!S.lastAttributionAnalysis) return;
    S.attributionResultsStale = true;
    $("attrStaleBanner")?.classList.add("is-visible");
  }

  function clearAttributionResultsStale() {
    S.attributionResultsStale = false;
    $("attrStaleBanner")?.classList.remove("is-visible");
    RV.events?.refreshProvenanceBar?.();
  }

  const ATTR_COLLAPSE_PANEL_IDS = [
    "attrPanelFilter", "attrPanelPeriod", "attrPanelRatio", "attrPanelDim", "attrPanelProfile",
  ];
  const ConfigPanel = () => RV.ui.configPanel;

  function truncateAttrSummaryList(vals, maxItems = 3, maxLen = 28) {
    return ConfigPanel().formatSummaryList(vals, maxItems, maxLen);
  }

  function getAttrPeriodSelection(which) {
    const pickerId = which === "base" ? "attrBasePeriod" : "attrCmpPeriod";
    const checksId = which === "base" ? "attrBaseValues" : "attrCmpValues";
    return CP().getPickerSpec(pickerId)
      ? CP().getPickerSelection(pickerId)
      : getChecked($(checksId));
  }

  function refreshAttrConfigPanelSummaries() {
    const pfText = $("attrPrimaryFilterSelected")?.querySelector(".sample-filter-tag-text")?.textContent
      || "主筛选·全部";
    const extraN = $("attrFilterRules")?.querySelectorAll(".filter-rule").length || 0;
    const filterEl = $("attrPanelFilterSummary");
    if (filterEl) {
      filterEl.textContent = extraN ? `${pfText} · 额外 ${extraN} 条` : pfText;
    }

    const periodCol = $("attrPeriodCol")?.value || "";
    const baseVals = getAttrPeriodSelection("base");
    const cmpVals = getAttrPeriodSelection("cmp");
    const periodEl = $("attrPanelPeriodSummary");
    if (periodEl) {
      const baseTxt = truncateAttrSummaryList(baseVals, 2, 12) || "未选";
      const cmpTxt = truncateAttrSummaryList(cmpVals, 2, 12) || "未选";
      periodEl.textContent = periodCol
        ? `${truncateAttrColLabel(periodCol, 14)} · 基期 ${baseTxt} · 比较期 ${cmpTxt}`
        : "未选期别";
    }

    const ratios = collectAttrRatios();
    const ratioEl = $("attrPanelRatioSummary");
    if (ratioEl) {
      ratioEl.textContent = ratios.length
        ? truncateAttrSummaryList(ratios.map((r) => r.name || r.num), 3, 16)
        : "未配置比率";
    }

    const dims = collectDimensionSpecsWithPendingAdd().map((s) => s.col);
    const dimEl = $("attrPanelDimSummary");
    if (dimEl) {
      dimEl.textContent = dims.length ? truncateAttrSummaryList(dims, 4, 14) : "未配置维度";
    }

    const profileVars = CP().getPickerSpec("attrProfile")
      ? CP().getPickerSelection("attrProfile")
      : getChecked($("attrProfileChecks"));
    const modelVars = CP().getPickerSpec("attrModel")
      ? CP().getPickerSelection("attrModel")
      : getChecked($("attrModelChecks"));
    const profileEl = $("attrPanelProfileSummary");
    if (profileEl) {
      profileEl.textContent = `画像 ${profileVars.length} · 模型 ${modelVars.length}`;
    }
  }

  function setAttrConfigPanelsCollapsed(collapsed) {
    ConfigPanel().setPanelsCollapsed(ATTR_COLLAPSE_PANEL_IDS, collapsed);
    if (collapsed) refreshAttrConfigPanelSummaries();
  }

  function expandAttrConfigPanels() {
    setAttrConfigPanelsCollapsed(false);
  }

  function toggleAttrConfigPanel(panelId) {
    const collapsed = ConfigPanel().togglePanel(panelId);
    if (collapsed) refreshAttrConfigPanelSummaries();
  }

  async function ensureAttrPrimaryFilterReady() {
    if ($("attrPrimaryFilterCol") && $("attrPrimaryFilter")?.querySelector(".primary-filter-rule")) return;
    if (!$("attrPrimaryFilterCol")) return;
    const timeCols = getAttrPeriodColCandidates();
    const postLeft = $("postPrimaryFilterCol")?.value;
    const defaultCol = (postLeft && S.headers.includes(postLeft))
      ? postLeft
      : (S.headers.includes("放款月份") ? "放款月份" : (timeCols[0] || S.headers[0] || ""));
    RV.ui.sidebar.initPrimaryFilterPanel(
      "attr",
      timeCols.length ? timeCols : S.headers.slice(0, 40),
      defaultCol
    );
    RV.ui.sidebar.renderSamplePrimaryFilterTags("attr");
    RV.ui.sidebar.renderSampleExtraFilterTags("attr");
  }

  async function syncAttrSampleFromPost() {
    await ensureAttrPrimaryFilterReady();
    const filterCfg = collectSampleFilterExport("post");
    const warnings = [];
    await RV.app.config.applySampleConfig("attr", filterCfg, warnings);
    RV.ui.sidebar.renderSamplePrimaryFilterTags("attr");
    RV.ui.sidebar.renderSampleExtraFilterTags("attr");
    refreshAttrConfigPanelSummaries();
    return warnings;
  }

  function applyDefaultAttrRatioFromSidebar() {
    renderFixedAttrRatioRows();
  }

  function truncateAttrColLabel(col, max = 36) {
    const s = String(col || "");
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function normalizeDimensionSpec(spec) {
    if (!spec?.col) return null;
    const mode = spec.mode === "bin" ? "bin" : "enum";
    const nBins = Math.max(2, Math.min(20, parseInt(spec.nBins, 10) || 5));
    return { col: spec.col, mode, nBins: mode === "bin" ? nBins : undefined };
  }

  function legacyStateToDimensionSpecs(state) {
    if (state?.dimensionSpecs?.length) {
      return state.dimensionSpecs.map(normalizeDimensionSpec).filter(Boolean);
    }
    const dims = state?.dimensions || [];
    const binSet = new Set(state?.dimBinCols || []);
    const defaultNBins = Math.max(2, Math.min(20, parseInt(state?.dimBinCount, 10) || 5));
    return dims.map((col) => normalizeDimensionSpec({
      col,
      mode: binSet.has(col) ? "bin" : "enum",
      nBins: binSet.has(col) ? defaultNBins : undefined,
    })).filter(Boolean);
  }

  function collectDimensionSpecs() {
    const specs = [];
    $("attrDimSpecList")?.querySelectorAll(".attr-dim-spec-row").forEach((row) => {
      const col = row.dataset.col || row.querySelector(".attr-dim-spec-col")?.value || "";
      const spec = normalizeDimensionSpec({
        col,
        mode: row.querySelector(".attr-dim-spec-mode")?.value,
        nBins: row.querySelector(".attr-dim-spec-nbins")?.value,
      });
      if (spec) specs.push(spec);
    });
    return specs;
  }

  function fillAttrDimColSelect(sel, selected) {
    fillAttrColSelect(sel, selected);
  }

  function renderAttrDimSpecList(specs) {
    const host = $("attrDimSpecList");
    if (!host) return;
    const list = (specs || []).map(normalizeDimensionSpec).filter(Boolean);
    const slots = [
      { label: "第一维", spec: list[0] || null },
      { label: "第二维", spec: list[1] || null },
    ];
    host.innerHTML = "";
    if (host.children && host.children.length) host.children.length = 0;
    for (let i = 0; i < slots.length; i++) {
      const spec = slots[i].spec;
      const col = spec?.col || "";
      const isBin = spec?.mode === "bin";
      const row = document.createElement("div");
      row.className = "attr-dim-spec-row";
      row.dataset.slot = String(i);
      row.dataset.col = col;

      const lab = document.createElement("span");
      lab.className = "attr-dim-spec-slot";
      lab.textContent = slots[i].label;
      row.appendChild(lab);

      const colSel = document.createElement("select");
      colSel.className = "attr-dim-spec-col";
      fillAttrDimColSelect(colSel, col);
      row.appendChild(colSel);

      const modeSel = document.createElement("select");
      modeSel.className = "attr-dim-spec-mode";
      const optEnum = document.createElement("option");
      optEnum.value = "enum";
      optEnum.textContent = "枚举";
      const optBin = document.createElement("option");
      optBin.value = "bin";
      optBin.textContent = "等频分箱";
      modeSel.appendChild(optEnum);
      modeSel.appendChild(optBin);
      modeSel.value = isBin ? "bin" : "enum";
      row.appendChild(modeSel);

      const nbWrap = document.createElement("label");
      nbWrap.className = "attr-dim-spec-nbins-wrap";
      const nbLab = document.createElement("span");
      nbLab.className = "attr-dim-spec-nbins-label";
      nbLab.textContent = "箱数";
      const nbIn = document.createElement("input");
      nbIn.type = "number";
      nbIn.className = "attr-dim-spec-nbins";
      nbIn.min = "2";
      nbIn.max = "20";
      nbIn.step = "1";
      nbIn.value = String(spec?.nBins || 5);
      nbIn.disabled = !isBin;
      nbWrap.appendChild(nbLab);
      nbWrap.appendChild(nbIn);
      row.appendChild(nbWrap);

      host.appendChild(row);
    }
    refreshAttrDimSpecMeta();
  }

  function refreshAttrDimSpecMeta() {
    const meta = $("attrDimSpecMeta");
    if (!meta) return;
    const specs = collectDimensionSpecs();
    if (specs.length < 2) {
      meta.textContent = "请选择第一维与第二维（须不同列）";
      meta.className = "chk-filter-meta sample-filter-meta warn";
      return;
    }
    const nBin = specs.filter((s) => s.mode === "bin").length;
    meta.textContent = `第一维 ${specs[0].col} → 第二维 ${specs[1].col} 段内再拆${nBin ? ` · ${nBin} 个等频分箱` : ""}`;
    meta.className = "chk-filter-meta sample-filter-meta";
  }

  function collectDimensionSpecsWithPendingAdd() {
    return collectDimensionSpecs();
  }

  function syncDimSpecUiAfterRun(cfg) {
    const { dimensionSpecs } = resolveAttributionDimensionCfg(cfg);
    renderAttrDimSpecList(dimensionSpecs);
    refreshAttrDimHints();
  }

  function resolveAttributionDimensionCfg(cfg) {
    const dimensionSpecs = (cfg.dimensionSpecs?.length
      ? cfg.dimensionSpecs
      : legacyStateToDimensionSpecs(cfg))
      .map(normalizeDimensionSpec)
      .filter(Boolean);
    const dimensions = dimensionSpecs.map((s) => s.col);
    const dimBinCols = dimensionSpecs.filter((s) => s.mode === "bin").map((s) => s.col);
    return { dimensionSpecs, dimensions, dimBinCols };
  }

  function getAttributionConfig() {
    const sampleCfg = getSampleConfig("attr");
    const periodCol = $("attrPeriodCol")?.value || "";
    const baseVals = getAttrPeriodSelection("base");
    const cmpVals = getAttrPeriodSelection("cmp");
    const ratios = collectAttrRatios();
    const dimensionSpecs = collectDimensionSpecsWithPendingAdd();
    const { dimensions, dimBinCols } = resolveAttributionDimensionCfg({ dimensionSpecs });
    const profileVars = CP().getPickerSpec("attrProfile")
      ? CP().getPickerSelection("attrProfile")
      : getChecked($("attrProfileChecks"));
    const modelVars = CP().getPickerSpec("attrModel")
      ? CP().getPickerSelection("attrModel")
      : getChecked($("attrModelChecks"));
    const ivBinsRaw = parseInt($("attrIvBins")?.value, 10);
    return {
      periodCol,
      baseVals,
      cmpVals,
      primaryFilter: sampleCfg.primaryFilter,
      filterMap: sampleCfg.filterMap,
      filterRanges: sampleCfg.filterRanges,
      ratios,
      dimensionSpecs,
      dimensions,
      profileVars,
      modelVars,
      badMode: $("attrBadMode")?.value || "numerator",
      badCol: $("attrBadCol")?.value || "",
      badThreshold: Number($("attrBadThreshold")?.value) || 0,
      ivBins: Number.isFinite(ivBinsRaw) ? ivBinsRaw : 5,
      higherScoreIsWorse: $("attrHigherScoreIsWorse")?.checked !== false,
      dimBinCols,
    };
  }

  function validateAttributionConfig(cfg) {
    if (!S.rawRows.length) return "请先上传 CSV 数据";
    if (!cfg.baseVals.length || !cfg.cmpVals.length) return "请选择基期和比较期取值";
    const overlap = cfg.baseVals.filter((v) => cfg.cmpVals.includes(v));
    if (overlap.length) return "基期与比较期取值不能重叠";
    if (!cfg.ratios.length) return "订单风险 / 金额风险 / 授信件均至少一条分子分母列齐全";
    if (!cfg.ratios[0].num) return "第 1 个可用比率需选择分子列";
    const { dimensionSpecs, dimensions } = resolveAttributionDimensionCfg(cfg);
    if (dimensions.length < 2) return "请选择第一维与第二维";
    if (dimensions[0] === dimensions[1]) return "第一维与第二维不能是同一列";

    let rows = applyFilters(S.rawRows, { filterMap: cfg.filterMap, filterRanges: cfg.filterRanges });
    const { isBase, isCmp } = periodMask(rows, cfg.periodCol, cfg.baseVals, cfg.cmpVals);
    let nBase = 0;
    let nCmp = 0;
    for (let i = 0; i < rows.length; i++) {
      if (isBase[i]) nBase++;
      if (isCmp[i]) nCmp++;
    }
    if (!nBase) return "基期在筛选后无样本，请检查期别或筛选条件";
    if (!nCmp) return "比较期在筛选后无样本，请检查期别或筛选条件";
    const periodRows = rows.filter((r, i) => isBase[i] || isCmp[i]);
    for (const spec of dimensionSpecs) {
      if (spec.mode !== "bin") continue;
      const chk = checkNumericColumn(periodRows, spec.col);
      if (!chk.ok) return `维度「${spec.col}」设为等频分箱但不是数值列：${chk.reason}`;
      if (spec.nBins < 2 || spec.nBins > 20) return `维度「${spec.col}」分箱数须在 2～20 之间`;
    }
    const modelVars = cfg.modelVars || [];
    if (modelVars.length) {
      const badSpec = resolveAttrBadLabelSpec(cfg);
      if (!badSpec.col) return "无法确定 Y 标签列（坏样本定义）";
      if (!S.headers.includes(badSpec.col)) return `Y 标签列「${badSpec.col}」不存在`;
      for (const m of modelVars) {
        if (!S.headers.includes(m)) return `模型分列「${m}」不存在`;
        const chk = checkNumericColumn(periodRows, m);
        if (!chk.ok) return `模型分列「${m}」不是有效数值列：${chk.reason}`;
      }
      const ivBins = cfg.ivBins != null ? cfg.ivBins : 5;
      if (ivBins < 3 || ivBins > 20) return "IV 分箱数须在 3～20 之间";
    }
    return null;
  }

  function computeAttributionAnalysis(cfg) {
    cfg = cfg || getAttributionConfig();
    try {
      setAttrDebugStage("compute:validate");
      const validationErr = validateAttributionConfig(cfg);
      if (validationErr) throw new Error(validationErr);

      setAttrDebugStage("compute:filter");
      const { rows, isBase, isCmp } = getAttributionPeriodRows(cfg);
      const baseRows = [];
      const cmpRows = [];
      const allPeriodRows = [];
      for (let i = 0; i < rows.length; i++) {
        if (isBase[i]) baseRows.push(rows[i]);
        if (isCmp[i]) cmpRows.push(rows[i]);
        if (isBase[i] || isCmp[i]) allPeriodRows.push(rows[i]);
      }

      setAttrDebugStage("compute:contrib");
      const { dimensionSpecs, dimensions } = resolveAttributionDimensionCfg(cfg);
      const ratioSummaries = [];
      const contribGroups = [];
      for (const ratio of cfg.ratios) {
        const s = aggregateRatio(baseRows, ratio.num, ratio.den);
        const c = aggregateRatio(cmpRows, ratio.num, ratio.den);
        ratioSummaries.push({
          name: ratio.name,
          num: ratio.num,
          den: ratio.den,
          rate_base: s.rate,
          rate_cmp: c.rate,
          delta: s.rate != null && c.rate != null ? c.rate - s.rate : null,
          den_base: s.den,
          den_cmp: c.den,
        });
        if (dimensions.length >= 2) {
          const binRules = buildDimBinRulesFromSpecs(rows, dimensionSpecs, isBase, isCmp);
          const group = buildOrderedDimContributions(
            rows, isBase, isCmp, ratio, dimensions[0], dimensions[1], binRules,
            { topK: ATTR_SECOND_DIM_TOP_K }
          );
          group.dim_cols = [dimensions[0], dimensions[1]];
          contribGroups.push(group);
        }
      }

      setAttrDebugStage("compute:profile");
      const profileRows = [];
      const distSpecs = [];
      for (const v of cfg.profileVars) {
        const pb = profileStats(baseRows, v, true);
        const pc = profileStats(cmpRows, v, true);
        const pa = profileStats(allPeriodRows, v, false);
        for (const [label, p] of [["base", pb], ["cmp", pc], ["all", pa]]) {
          profileRows.push({
            variable: v,
            period: label,
            count: p.count,
            missing_pct: p.missing_pct,
            mean: p.mean,
            median: p.median,
            std: p.std,
          });
        }
        distSpecs.push({ var: v, base: pb.vals || [], cmp: pc.vals || [] });
      }

      setAttrDebugStage("compute:model");
      let modelCompare = [];
      let badSpec = null;
      if (cfg.modelVars?.length) {
        badSpec = resolveAttrBadLabelSpec(cfg);
        const yAll = buildYVector(rows, badSpec);
        modelCompare = computeModelCompare(rows, isBase, isCmp, yAll, cfg.modelVars, {
          ivBins: cfg.ivBins,
          preferCreditStyle: cfg.higherScoreIsWorse,
        });
      }

      setAttrDebugStage("compute:done");

      return {
        genAt: new Date().toLocaleString("zh-CN"),
        cfg,
        rowCount: rows.length,
        baseCount: baseRows.length,
        cmpCount: cmpRows.length,
        ratioSummaries,
        contribGroups,
        profileRows,
        distSpecs,
        modelCompare,
        badSpec,
      };
    } catch (e) {
      throw new Error(`${attrDebugStage}: ${e.message || e}`);
    }
  }

  function getAttributionPeriodRows(cfg) {
    const rows = applyFilters(S.rawRows, {
      primaryFilter: cfg.primaryFilter,
      filterMap: cfg.filterMap,
      filterRanges: cfg.filterRanges,
    });
    const { isBase, isCmp } = periodMask(rows, cfg.periodCol, cfg.baseVals, cfg.cmpVals);
    return { rows, isBase, isCmp };
  }

  function renderFurtherDimSection(group) {
    const further = group.further || [];
    const dim2 = group.dim2 || "";
    let html = `<div class="attr-contrib-further-block">`;
    html += `<h4 class="attr-contrib-section-title">第二维进一步拆解</h4>`;
    if (!dim2 || !further.length) {
      html += `<p class="status warn">未生成第二维拆解（检查第二维配置与第一维分段）</p></div>`;
      return html;
    }
    const shown = further.length;
    const total = group.furtherTotalSegments != null ? group.furtherTotalSegments : shown;
    html += `<p class="config-muted">在第一维各段内按「${esc(dim2)}」再拆；勾稽该段 ΔR。`;
    if (group.furtherTruncated) {
      html += `仅展示 |合计贡献| 最大的 ${shown} / ${total} 段。`;
    }
    html += `</p>`;
    for (const block of further) {
      html += `<div class="attr-further-seg">`;
      html += `<h5 class="attr-further-seg-title">第一维「${esc(block.parent_segment || "")}」内</h5>`;
      html += contribBlockMetaHtml(block);
      html += binningSpecHtml(block.binning_specs);
      html += contribTableHtml(block.table);
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  function binningSpecHtml(specs) {
    if (!specs || !specs.length) return "";
    return specs.map((spec) => {
      const rows = [
        ["空值", spec.missingLabel, spec.nMissing != null ? spec.nMissing.toLocaleString() : "—"],
        ["负数", spec.negativeLabel, spec.nNegative != null ? spec.nNegative.toLocaleString() : "—"],
      ];
      spec.intervals.forEach((it, i) => {
        const cnt = it.count != null ? it.count.toLocaleString() : "—";
        rows.push([`箱${i + 1}`, it.label, cnt]);
      });
      const basis = spec.basisCount != null ? spec.basisCount.toLocaleString() : "—";
      const note = spec.basisNote || "筛选后基期/比较期";
      return `<h4>等频分箱 · ${esc(spec.col)}（${spec.nBins} 箱 · 分箱基准 ${basis} 条${esc(note)}）</h4>${simpleTableHtml(
        ["箱", "区间", "样本数"],
        rows
      )}`;
    }).join("");
  }

  function contribBlockMetaHtml(c) {
    const err = c.reconciliation_error;
    const errCls = err != null && Math.abs(err) < 1e-6 ? "ok" : "warn";
    return `<p>分段数：${c.n_segments} · ΔR=${toPercentDisplay(c.delta_rate, false)} · 勾稽误差=<span class="${errCls}">${fmtAttrNumber(err)}</span></p>`;
  }

  function contribTableHtml(rows, tableClass) {
    const cls = tableClass ? `data-table ${tableClass}` : "data-table";
    let h = `<table class="${cls}"><thead><tr>`;
    for (const [label, tip] of C.CONTRIB_TABLE_COLS) {
      h += thWithResizer(helpTipHtml(label, tip));
    }
    h += "</tr></thead><tbody>";
    for (const t of rows) {
      h += "<tr>" + [
        t.segment,
        t.rate_base, t.rate_cmp, t.weight_base, t.weight_cmp,
        t.contrib_total, t.contrib_migration, t.contrib_structure, t.contrib_interaction, t.contrib_pct,
      ].map((cell, i) => {
        const col = C.CONTRIB_TABLE_COLS[i][0];
        if (col === "分段") return `<td class="bin-interval">${esc(String(cell ?? ""))}</td>`;
        if (C.CONTRIB_SIGNED_COLS.has(col)) return `<td>${fmtAttrSignedCell(col, cell)}</td>`;
        return `<td>${fmtAttrCell(col, cell)}</td>`;
      }).join("") + "</tr>";
    }
    return attrTableWrap(h + "</tbody></table>");
  }

  function renderContributionsSection(contribGroups) {
    if (!contribGroups.length) {
      return "<p>未配置第一维 / 第二维</p>";
    }
    let html = "";
    for (const group of contribGroups) {
      const ratioKey = String(group.rate_name).replace(/\W/g, "_");
      const first = group.first || (group.singles && group.singles[0]) || null;
      html += `<div class="contrib-ratio-group" data-ratio-key="${esc(ratioKey)}">`;
      html += `<h3 class="rv-heading-with-hint">${esc(group.rate_name)}${hintBadgeHtml("第一维全样本；第二维在段内再拆，勾该段ΔR")}</h3>`;

      if (first) {
        html += `<div class="attr-contrib-detail-block">`;
        html += `<h4 class="attr-contrib-section-title">第一维拆解 · ${esc(group.dim1 || first.dimension || "")}</h4>`;
        html += binningSpecHtml(first.binning_specs);
        html += contribBlockMetaHtml(first);
        html += contribTableHtml(first.table);
        html += `</div>`;
      }
      html += renderFurtherDimSection(group);
      html += `</div>`;
    }
    return html;
  }

  function initAttrContribUi() {
    const mount = $("attrResultsMount");
    if (!mount) return;
    initResizableTables(mount);
  }

  function renderProfileSectionHtml(profileRows) {
    const periodLabel = { base: "基期", cmp: "比较期", all: "全期" };
    return `<div class="attr-profile-block rv-result-card"><h2>画像对比</h2>
      ${profileRows.length ? simpleTableHtml(
        ["变量", "期别", "N", "缺失%", "均值", "中位数", "标准差"],
        profileRows.map((p) => [
          p.variable,
          periodLabel[p.period] || p.period,
          p.count,
          p.missing_pct,
          p.mean,
          p.median,
          p.std,
        ])
      ) : "<p>未选择画像变量</p>"}
      <div id="attrDistChartFilter" class="dist-filter-bar"></div>
      <div id="attrProfileChartsMount" class="dist-charts-grid"></div>
    </div>`;
  }

  function renderModelCompareSectionHtml(modelCompare, badSpec, cfg) {
    const cols = [
      "模型", "风险分方向(基)", "风险分方向(比)",
      "AUC基", "AUC比", "AUC差",
      "KS基", "KS比", "KS差",
      "IV基", "IV比", "IV差",
    ];
    const rows = (modelCompare || []).map((m) => [
      m.model,
      m.score_dir_base,
      m.score_dir_cmp,
      m.auc_base, m.auc_cmp, m.auc_delta,
      m.ks_base, m.ks_cmp, m.ks_delta,
      m.iv_base, m.iv_cmp, m.iv_delta,
    ]);
    let tableHtml = "";
    if (rows.length) {
      let h = '<table class="data-table attr-model-table"><thead><tr>'
        + cols.map((c) => thWithResizer(esc(c))).join("")
        + "</tr></thead><tbody>";
      for (const row of rows) {
        h += "<tr>";
        for (let i = 0; i < row.length; i++) {
          const v = row[i];
          if (i >= 5 && (i - 2) % 3 === 0) {
            h += `<td class="num">${fmtModelMetricDelta(v)}</td>`;
          } else if (i >= 3 && i <= 11 && typeof v === "number") {
            h += `<td class="num">${fmtMetric(v)}</td>`;
          } else {
            h += `<td>${fmtAttrCell(cols[i], v)}</td>`;
          }
        }
        h += "</tr>";
      }
      tableHtml = attrTableWrap(h + "</tbody></table>");
    } else {
      tableHtml = "<p class=\"config-muted\">未选择模型分列</p>";
    }
    const footnote = badSpec
      ? `<p class="config-muted attr-model-footnote">坏样本：${esc(badSpec.desc)} · IV 分箱 ${cfg?.ivBins ?? 5}${cfg?.higherScoreIsWorse ? " · 评分分优先" : ""}</p>`
      : "";
    return `<div class="attr-model-block rv-result-card"><h2>模型效果 AUC / KS / IV</h2>${tableHtml}${footnote}</div>`;
  }

  function renderDistChart(container, title, baseData, cmpData) {
    container.innerHTML = "";
    const titleEl = document.createElement("div");
    titleEl.className = "chart-title";
    titleEl.textContent = title + " — 分布对比（核密度平滑曲线）";
    container.appendChild(titleEl);

    const all = baseData.concat(cmpData);
    setAttrDebugStage("renderDistChart:minmax");
    if (!all.length) {
      container.appendChild(document.createTextNode("无有效数值"));
      return;
    }
    const mm = minMaxNumbers(all);
    let min = mm.min;
    let max = mm.max;
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const padX = (max - min) * 0.05;
    min -= padX;
    max += padX;
    const gridN = C.KDE_GRID_POINTS;
    const xs = Array.from({ length: gridN }, (_, i) => min + (i / (gridN - 1)) * (max - min));
    const yBase = baseData.length >= 2 ? kdeDensity(baseData, xs) : xs.map(() => 0);
    const yCmp = cmpData.length >= 2 ? kdeDensity(cmpData, xs) : xs.map(() => 0);
    let maxY = 1e-12;
    for (let i = 0; i < yBase.length; i++) if (yBase[i] > maxY) maxY = yBase[i];
    for (let i = 0; i < yCmp.length; i++) if (yCmp[i] > maxY) maxY = yCmp[i];

    const W = 400;
    const H = 268;
    const pad = { l: 52, r: 16, t: 22, b: 52 };
    const svg = svgEl("svg", {
      width: "100%",
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
    });
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const baseline = pad.t + innerH;
    const left = pad.l;

    const pal = RV.infra.chartPalette();
    svg.appendChild(svgEl("line", {
      x1: left, y1: pad.t, x2: left, y2: baseline,
      stroke: pal.axis, "stroke-width": 1,
    }));
    svg.appendChild(svgEl("line", {
      x1: left, y1: baseline, x2: W - pad.r, y2: baseline,
      stroke: pal.axis, "stroke-width": 1,
    }));

    const xTicks = [min, (min + max) / 2, max];
    for (const xv of xTicks) {
      const px = left + ((xv - min) / (max - min)) * innerW;
      svg.appendChild(svgEl("line", {
        x1: px, y1: baseline, x2: px, y2: baseline + 4,
        stroke: pal.tick, "stroke-width": 1,
      }));
      svg.appendChild(svgText(px, baseline + 16, formatAxisTick(xv), { "text-anchor": "middle" }));
    }
    const yTicks = [0, maxY / 2, maxY];
    for (const yv of yTicks) {
      const py = baseline - (yv / maxY) * innerH;
      svg.appendChild(svgEl("line", {
        x1: left - 4, y1: py, x2: left, y2: py,
        stroke: pal.tick, "stroke-width": 1,
      }));
      svg.appendChild(svgText(left - 8, py + 3, formatAxisTick(yv), { "text-anchor": "end" }));
    }
    svg.appendChild(svgText(left + innerW / 2, H - 6, title, {
      "text-anchor": "middle", "font-size": "11", fill: pal.text,
    }));
    svg.appendChild(svgText(12, pad.t + innerH / 2, "密度", {
      "text-anchor": "middle",
      transform: `rotate(-90, 12, ${pad.t + innerH / 2})`,
      "font-size": "11", fill: pal.text,
    }));

    const close = ` L ${W - pad.r},${baseline} L ${left},${baseline} Z`;
    const baseStroke = "#9fbbe0";
    const cmpStroke = "#dfa88f";

    if (baseData.length >= 2) {
      const curveB = smoothCurvePath(xs, yBase, min, max, maxY, pad, innerW, innerH);
      svg.appendChild(svgEl("path", {
        d: curveB + close, fill: baseStroke, opacity: 0.16, stroke: "none",
      }));
      svg.appendChild(svgEl("path", {
        d: curveB, fill: "none", stroke: baseStroke, "stroke-width": 2.5,
      }));
    }
    if (cmpData.length >= 2) {
      const curveC = smoothCurvePath(xs, yCmp, min, max, maxY, pad, innerW, innerH);
      svg.appendChild(svgEl("path", {
        d: curveC + close, fill: cmpStroke, opacity: 0.14, stroke: "none",
      }));
      svg.appendChild(svgEl("path", {
        d: curveC, fill: "none", stroke: cmpStroke, "stroke-width": 2.5,
      }));
    }

    const leg = document.createElement("div");
    leg.className = "chart-legend";
    leg.innerHTML = '<span class="leg-base">基期（KDE）</span><span class="leg-cmp">比较期（KDE）</span>';
    container.appendChild(svg);
    container.appendChild(leg);
  }

  function buildAttrDistChartFilter(distSpecs, savedSelected) {
    const bar = $("attrDistChartFilter");
    if (!bar) return;
    const saved = new Set(savedSelected || []);
    bar.innerHTML = `<span class="filter-label">分布图展示变量（可多选，默认展示前 ${C.DEFAULT_DIST_CHARTS} 个）：</span>`;
    const chks = document.createElement("div");
    chks.className = "dist-filter-chks";
    distSpecs.forEach((d, idx) => {
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = d.var;
      cb.checked = saved.size ? saved.has(d.var) : idx < C.DEFAULT_DIST_CHARTS;
      cb.addEventListener("change", () => renderAttrProfileCharts(lastDistSpecs));
      lab.appendChild(cb);
      const label = d.var.length > 28 ? d.var.slice(0, 26) + "…" : d.var;
      lab.appendChild(document.createTextNode(label));
      lab.title = d.var;
      chks.appendChild(lab);
    });
    bar.appendChild(chks);
  }

  function renderAttrProfileCharts(distSpecs) {
    lastDistSpecs = distSpecs || lastDistSpecs || [];
    const mount = $("attrProfileChartsMount");
    if (!mount) return;
    mount.innerHTML = "";
    const selected = new Set(
      [...document.querySelectorAll("#attrDistChartFilter input:checked")].map((c) => c.value)
    );
    const toShow = lastDistSpecs.filter((d) => selected.has(d.var));
    if (!toShow.length) {
      mount.innerHTML = '<p class="status">请至少勾选一个变量以展示分布图</p>';
      return;
    }
    toShow.forEach((d) => {
      const item = document.createElement("div");
      item.className = "dist-chart-item";
      mount.appendChild(item);
      renderDistChart(item, d.var, d.base, d.cmp);
    });
  }

  function renderAttributionResults(result) {
    const mount = $("attrResultsMount");
    if (!mount || !result) return;
    try {
      setAttrDebugStage("render:html");
      let html = `<div class="attr-results-document">`;
      html += `<div class="attr-summary-block rv-result-card"><h2>执行摘要</h2>`;
      html += `<p class="config-muted">生成时间：${esc(result.genAt)} · 筛选后 ${result.rowCount.toLocaleString()} 行 · 基期 ${result.baseCount.toLocaleString()} · 比较期 ${result.cmpCount.toLocaleString()}</p>`;
      html += simpleTableHtml(
        ["比率", "分子", "分母", "基期比率", "比较期比率", "ΔR", "基期分母合计", "比较期分母合计"],
        result.ratioSummaries.map((r) => [
          r.name, r.num, r.den, r.rate_base, r.rate_cmp, r.delta, r.den_base, r.den_cmp,
        ])
      );
      html += `</div>`;
      html += `<div class="attr-contrib-block rv-result-card"><h2>贡献度分析</h2>`;
      html += renderContributionsSection(result.contribGroups);
      html += `</div>`;
      html += renderProfileSectionHtml(result.profileRows);
      html += renderModelCompareSectionHtml(result.modelCompare, result.badSpec, result.cfg);
      html += `</div>`;
      setAttrDebugStage("render:mount");
      mount.innerHTML = html;
      setAttrDebugStage("render:contrib-ui");
      initAttrContribUi();
      initResizableTables(mount);
      setAttrDebugStage("render:charts");
      buildAttrDistChartFilter(result.distSpecs);
      renderAttrProfileCharts(result.distSpecs);
      setAttrDebugStage("render:done");
    } catch (e) {
      throw new Error(`${attrDebugStage}: ${e.message || e}`);
    }
  }

  function defaultAttrPeriodSelections(vals) {
    const n = vals.length;
    if (n === 0) return { base: [], cmp: [] };
    if (n === 1) return { base: [vals[0]], cmp: [] };
    if (n === 2) return { base: [vals[0]], cmp: [vals[1]] };
    return { base: vals.slice(0, n - 1), cmp: [vals[n - 1]] };
  }

  async function refreshAttrPeriodChecksAsync({ applyDefaults = true } = {}) {
    const col = $("attrPeriodCol")?.value;
    if (!col || !S.rawRows.length) return;
    const seq = ++attrPeriodRefreshSeq;
    setAttrAnalysisStatus(`统计期别「${col}」取值…`, "");
    await getColumnUniquesAsync(col, (done, total) => {
      if (seq !== attrPeriodRefreshSeq) return;
      setAttrAnalysisStatus(`统计期别取值… ${done.toLocaleString()} / ${total.toLocaleString()} 行`, "");
    });
    if (seq !== attrPeriodRefreshSeq) return;
    registerAttrPickers();
    const vals = getColumnUniques(col);
    let baseSel = [];
    let cmpSel = [];
    if (applyDefaults) {
      ({ base: baseSel, cmp: cmpSel } = defaultAttrPeriodSelections(vals));
    } else {
      const valSet = new Set(vals);
      baseSel = getAttrPeriodSelection("base").filter((v) => valSet.has(v));
      cmpSel = getAttrPeriodSelection("cmp").filter((v) => valSet.has(v));
    }
    CP().initPicker("attrBasePeriod", vals, { defaultChecked: false, selected: baseSel });
    CP().initPicker("attrCmpPeriod", vals, { defaultChecked: false, selected: cmpSel });
    refreshAttrDimHints();
    setAttrAnalysisStatus("", "");
  }

  function refreshAttrDimHints() {
    refreshAttrDimBinHint();
    refreshAttrDimSegmentHint();
  }

  function getAttrFilterRows() {
    const sampleCfg = getSampleConfig("attr");
    return applyFilters(S.rawRows, { filterMap: sampleCfg.filterMap, filterRanges: sampleCfg.filterRanges });
  }

  function refreshAttrDimBinHint() {
    const el = $("attrDimBinHint");
    if (!el || !S.rawRows.length) return;
    const specs = collectDimensionSpecs();
    const binSpecs = specs.filter((s) => s.mode === "bin");
    if (!binSpecs.length) {
      el.textContent = "";
      el.className = "status";
      return;
    }
    let rows = getAttrFilterRows();
    const periodCol = $("attrPeriodCol")?.value;
    const baseVals = getAttrPeriodSelection("base");
    const cmpVals = getAttrPeriodSelection("cmp");
    let periodRows = rows;
    if (periodCol && baseVals.length && cmpVals.length) {
      const { isBase, isCmp } = periodMask(rows, periodCol, baseVals, cmpVals);
      periodRows = rows.filter((r, i) => isBase[i] || isCmp[i]);
    }
    const bad = [];
    for (const spec of binSpecs) {
      const chk = checkNumericColumn(periodRows, spec.col);
      if (!chk.ok) bad.push(`「${spec.col}」${chk.reason}`);
    }
    let msg = `${binSpecs.length} 个维度使用等频分箱；空值/负数各 1 箱`;
    if (bad.length) msg += ` · ${bad.join("；")}`;
    el.textContent = msg;
    el.className = bad.length ? "status warn" : "status ok";
  }

  function refreshAttrDimSegmentHint() {
    const specs = collectDimensionSpecs();
    const dims = specs.map((s) => s.col);
    const hint = $("attrDimSegmentHint");
    if (!hint) return;
    if (!dims.length || !S.rawRows.length) {
      hint.textContent = "";
      return;
    }
    const periodCol = $("attrPeriodCol")?.value;
    const baseVals = getAttrPeriodSelection("base");
    const cmpVals = getAttrPeriodSelection("cmp");
    if (!baseVals.length || !cmpVals.length) {
      hint.textContent = "请先配置基期/比较期以预估第一维分段";
      return;
    }
    let rows = getAttrFilterRows();
    const { isBase, isCmp } = periodMask(rows, periodCol, baseVals, cmpVals);
    const binRules = buildDimBinRulesFromSpecs(rows, specs, isBase, isCmp);
    const n1 = estimateSegmentCount(rows, isBase, isCmp, [dims[0]], binRules);
    const dimDisp = formatDimensionDisplay([dims[0]], binRules);
    const dim2 = dims[1] ? `；各段内再按「${dims[1]}」拆，最多展示 |合计贡献| 最大 ${ATTR_SECOND_DIM_TOP_K} 段` : "";
    hint.textContent = `第一维约 ${n1} 段（${dimDisp}）${dim2}`;
    hint.className = n1 > 80 ? "status warn" : "status ok";
  }

  function applyAttrDimensionDefaults() {
    const pool = ["决策组", "客群", "渠道"].filter((h) => S.headers.includes(h));
    const defaults = pool.slice(0, 2)
      .map((col) => normalizeDimensionSpec({ col, mode: "enum" }));
    renderAttrDimSpecList(defaults);
    const profileDefaults = ["amount", "level"].filter((h) => S.headers.includes(h));
    CP().applySelection("attrProfile", profileDefaults);
    const modelDefaults = S.headers.filter((h) =>
      h === "p3_reb_xgb_bcard_fpd7_20250929_v2" || h.startsWith("p3_")
    ).slice(0, 3);
    if (modelDefaults.length) CP().applySelection("attrModel", modelDefaults);
  }

  async function populateAttributionTabAfterCsv({ skipPeriodRefresh = false, skipDefaults = false } = {}) {
    if (!S.rawRows.length || !$("tab-attribution")) return;
    registerAttrPickers();
    const periodOpts = getAttrPeriodColCandidates();
    fillSelect($("attrPeriodCol"), periodOpts.length ? periodOpts : S.headers.slice(0, 1));
    const periodCol = periodOpts.includes("申请月份") ? "申请月份" : periodOpts[0];
    if (periodCol) $("attrPeriodCol").value = periodCol;
    if (!skipPeriodRefresh) void refreshAttrPeriodChecksAsync();

    await ensureAttrPrimaryFilterReady();
    if (!skipDefaults) {
      try {
        await syncAttrSampleFromPost();
      } catch (e) {
        setAttrAnalysisStatus("同步贷后样本失败：" + (e.message || e), "err");
      }
    } else {
      RV.ui.sidebar.renderSamplePrimaryFilterTags?.("attr");
      RV.ui.sidebar.renderSampleExtraFilterTags?.("attr");
    }

    const ratioHost = $("attrRatioRows");
    if (ratioHost && !skipDefaults) {
      applyDefaultAttrRatioFromSidebar();
    } else if (ratioHost && skipDefaults && !ratioHost.querySelector(".ratio-row")) {
      applyDefaultAttrRatioFromSidebar();
    }
    if (!skipDefaults) applyAttrDimensionDefaults();

    CP().initPicker("attrProfile", S.headers, { defaultChecked: false, selected: [] });
    CP().initPicker("attrModel", S.headers, { defaultChecked: false, selected: [] });
    fillSelect($("attrBadCol"), S.headers);
    refreshAttrBadLabelUI();
    refreshAttrDimHints();
    refreshAttrConfigPanelSummaries();

    const btn = $("btnRunAttribution");
    if (btn) btn.disabled = false;
  }

  function runAttributionAnalysisFromUi() {
    if (S.attributionAnalysisBusy) {
      setAttrAnalysisStatus("分析进行中，请稍候完成后再试", "err");
      return;
    }
    const btn = $("btnRunAttribution");
    const mount = $("attrResultsMount");
    if (!btn || !mount) return;

    const prevHtml = mount.innerHTML;
    const prevLabel = btn.textContent;
    S.attributionAnalysisBusy = true;
    btn.disabled = true;
    btn.textContent = "分析中…";
    setAttrAnalysisStatus("正在计算，请稍候…", "");
    mount.innerHTML = '<p class="status">分析中，请稍候…</p>';

    try {
      setAttrDebugStage("run:register");
      registerAttrPickers();
      setAttrDebugStage("run:config");
      const cfg = getAttributionConfig();
      setAttrDebugStage("run:validate");
      const validationErr = validateAttributionConfig(cfg);
      if (validationErr) {
        setAttrAnalysisStatus(validationErr, "err");
        mount.innerHTML = prevHtml && prevHtml.includes("attr-results-document")
          ? prevHtml
          : '<p class="da-results-placeholder">配置期别与比率后点击「运行归因分析」</p>';
        return;
      }
      setAttrDebugStage("compute:call");
      const result = computeAttributionAnalysis(cfg);
      setAttrDebugStage("render:call");
      S.lastAttributionAnalysis = result;
      renderAttributionResults(result);
      syncDimSpecUiAfterRun(cfg);
      clearAttributionResultsStale();
      setAttrConfigPanelsCollapsed(true);
      setAttrDebugStage("done");
      setAttrAnalysisStatus("分析完成", "ok");
    } catch (err) {
      const errMsg = `${attrDebugStage}: ${String(err?.message || err)}`;
      if (prevHtml && prevHtml.includes("attr-results-document")) {
        mount.innerHTML = prevHtml;
        initAttrContribUi();
        initResizableTables(mount);
        if (S.lastAttributionAnalysis?.distSpecs?.length) {
          buildAttrDistChartFilter(S.lastAttributionAnalysis.distSpecs);
          renderAttrProfileCharts(S.lastAttributionAnalysis.distSpecs);
        }
      } else {
        mount.innerHTML = `<p class="status err">分析失败：${esc(errMsg)}</p>`;
      }
      setAttrAnalysisStatus(errMsg, "err");
    } finally {
      S.attributionAnalysisBusy = false;
      btn.disabled = false;
      btn.textContent = prevLabel || "运行归因分析";
    }
  }

  function bindAttributionEvents() {
    if (eventsBound) return;
    const tab = $("tab-attribution");
    if (!tab) return;
    eventsBound = true;

    if (!window.__attrOnErrorBound && typeof window.addEventListener === "function") {
      window.__attrOnErrorBound = true;
      window.addEventListener("error", (ev) => {
        if (!S.attributionAnalysisBusy) return;
        const msg = `${attrDebugStage}: ${ev.message || "error"}`;
        setAttrAnalysisStatus(msg, "err");
      });
    }

    $("attrSyncPostSample")?.addEventListener("click", () => {
      void (async () => {
        try {
          const warnings = await syncAttrSampleFromPost();
          expandAttrConfigPanels();
          markAttributionResultsStale();
          const extra = warnings?.length ? `（${warnings.length} 条警告）` : "";
          setAttrAnalysisStatus(`已从左侧贷后复制样本${extra}`, warnings?.length ? "warn" : "ok");
        } catch (e) {
          setAttrAnalysisStatus("复制贷后样本失败：" + (e.message || e), "err");
        }
      })();
    });
    $("attrAddFilter")?.addEventListener("click", () => {
      const q = ($("attrFilterSearch")?.value || "").trim().toLowerCase();
      const col = q ? S.headers.find((h) => h.toLowerCase().includes(q)) : null;
      createFilterRule("attrFilterRules", "attrFilterMeta", "attr", col);
      if (col) $("attrFilterSearch").value = "";
      refreshAttrConfigPanelSummaries();
      expandAttrConfigPanels();
      markAttributionResultsStale();
    });
    $("attrRatioRows")?.addEventListener("change", () => {
      refreshAttrBadLabelUI();
      refreshAttrConfigPanelSummaries();
      markAttributionResultsStale();
    });
    $("attrBadMode")?.addEventListener("change", () => {
      refreshAttrBadLabelUI();
      markAttributionResultsStale();
    });
    $("attrPeriodCol")?.addEventListener("change", () => {
      void refreshAttrPeriodChecksAsync();
      markAttributionResultsStale();
    });
    $("btnRunAttribution")?.addEventListener("click", runAttributionAnalysisFromUi);
    const staleBtn = $("attrStaleRerunBtn");
    if (staleBtn && staleBtn.dataset.rvBound !== "1") {
      staleBtn.dataset.rvBound = "1";
      staleBtn.addEventListener("click", runAttributionAnalysisFromUi);
    }
    if (S.attributionResultsStale) markAttributionResultsStale();

    tab.addEventListener("change", (e) => {
      if (e.target.classList.contains("attr-dim-spec-col")) {
        const row = e.target.closest(".attr-dim-spec-row");
        if (row) row.dataset.col = e.target.value || "";
        refreshAttrDimSpecMeta();
        refreshAttrDimHints();
        markAttributionResultsStale();
      }
      if (e.target.classList.contains("attr-dim-spec-mode")) {
        const row = e.target.closest(".attr-dim-spec-row");
        const nbins = row?.querySelector(".attr-dim-spec-nbins");
        if (nbins) nbins.disabled = e.target.value !== "bin";
        refreshAttrDimSpecMeta();
        refreshAttrDimHints();
        markAttributionResultsStale();
      }
      if (e.target.classList.contains("attr-dim-spec-nbins")) {
        refreshAttrDimHints();
        markAttributionResultsStale();
      }
      if (e.target.closest("#attrPanelFilter, #attrPanelPeriod, #attrPanelRatio, #attrPanelDim, #attrPanelProfile, #attrRatioRows")) {
        expandAttrConfigPanels();
        refreshAttrConfigPanelSummaries();
        markAttributionResultsStale();
      }
    });
    ConfigPanel().bindPanelToggle(tab, {
      onToggle: (_panelId, collapsed) => {
        if (collapsed) refreshAttrConfigPanelSummaries();
      },
    });

  }

  function snapshotAttributionUiState() {
    if (!$("tab-attribution")) return null;
    const distSelected = [...document.querySelectorAll("#attrDistChartFilter input:checked")].map((c) => c.value);
    return {
      ...getAttributionConfig(),
      filterExport: collectSampleFilterExport("attr"),
      distChartSelected: distSelected,
      hasLastResult: !!S.lastAttributionAnalysis,
    };
  }

  async function restoreAttrFiltersFromExport(filterExport) {
    if (!filterExport) return;
    await ensureAttrPrimaryFilterReady();
    await RV.app.config.applySampleConfig("attr", filterExport, []);
    RV.ui.sidebar.renderSamplePrimaryFilterTags?.("attr");
    RV.ui.sidebar.renderSampleExtraFilterTags?.("attr");
  }

  async function restoreAttributionUiState(state) {
    if (!state) return;
    if (state.filterExport) await restoreAttrFiltersFromExport(state.filterExport);
    else if (state.primaryFilter) {
      await ensureAttrPrimaryFilterReady();
      await RV.ui.sidebar.applyPrimaryFilter("attr", state.primaryFilter, []);
      RV.ui.sidebar.renderSamplePrimaryFilterTags?.("attr");
    }
    if (state.periodCol && $("attrPeriodCol")) $("attrPeriodCol").value = state.periodCol;
    await refreshAttrPeriodChecksAsync({ applyDefaults: false });
    CP().applySelection("attrBasePeriod", state.baseVals || [], { notify: false });
    CP().applySelection("attrCmpPeriod", state.cmpVals || [], { notify: false });
    const ratioHost = $("attrRatioRows");
    if (ratioHost) {
      if (state.ratios?.length) renderFixedAttrRatioRows(state.ratios);
      else applyDefaultAttrRatioFromSidebar();
    }
    registerAttrPickers();
    fillSelect($("attrBadCol"), S.headers);
    CP().initPicker("attrProfile", S.headers, { defaultChecked: false, selected: state.profileVars || [] });
    CP().initPicker("attrModel", S.headers, { defaultChecked: false, selected: state.modelVars || [] });
    if ($("attrBadMode")) $("attrBadMode").value = state.badMode || "numerator";
    if (state.badCol && $("attrBadCol")) $("attrBadCol").value = state.badCol;
    if ($("attrBadThreshold") && state.badThreshold != null) $("attrBadThreshold").value = state.badThreshold;
    if ($("attrIvBins") && state.ivBins != null) $("attrIvBins").value = state.ivBins;
    if ($("attrHigherScoreIsWorse")) {
      $("attrHigherScoreIsWorse").checked = state.higherScoreIsWorse !== false;
    }
    refreshAttrBadLabelUI();
    renderAttrDimSpecList(legacyStateToDimensionSpecs(state));
    refreshAttrDimHints();
    refreshAttrConfigPanelSummaries();
    const cfgSnap = {
      periodCol: state.periodCol,
      baseVals: state.baseVals,
      cmpVals: state.cmpVals,
      primaryFilter: state.primaryFilter || state.filterExport?.primaryFilter,
      filterMap: state.filterMap,
      filterRanges: state.filterRanges,
      ratios: state.ratios,
      dimensionSpecs: legacyStateToDimensionSpecs(state),
      profileVars: state.profileVars,
      modelVars: state.modelVars,
      badMode: state.badMode,
      badCol: state.badCol,
      badThreshold: state.badThreshold,
      ivBins: state.ivBins,
      higherScoreIsWorse: state.higherScoreIsWorse,
    };
    if (state.hasLastResult && S.lastAttributionAnalysis) {
      if (attributionConfigsMatch(S.lastAttributionAnalysis.cfg, cfgSnap)) {
        renderAttributionResults(S.lastAttributionAnalysis);
        if (state.distChartSelected?.length) {
          document.querySelectorAll("#attrDistChartFilter input[type=checkbox]").forEach((cb) => {
            cb.checked = state.distChartSelected.includes(cb.value);
          });
          renderAttrProfileCharts(S.lastAttributionAnalysis.distSpecs);
        }
        setAttrConfigPanelsCollapsed(true);
      } else {
        clearAttributionAnalysisCache();
        setAttrAnalysisStatus("配置已变更，请重新运行归因分析", "");
      }
    }
  }

  function setupAttributionTabShell({ skipPeriodRefresh = false, skipPopulateDefaults = false } = {}) {
    mountAttributionTabShell();
    registerAttrPickers();
    eventsBound = false;
    bindAttributionEvents();
    if (S.rawRows.length) void populateAttributionTabAfterCsv({ skipPeriodRefresh, skipDefaults: skipPopulateDefaults });
    else {
      const btn = $("btnRunAttribution");
      if (btn) btn.disabled = true;
    }
  }

  function remountAttributionTabAfterReport(priorState) {
    mountAttributionTabShell();
    registerAttrPickers();
    eventsBound = false;
    bindAttributionEvents();
    void (async () => {
      await populateAttributionTabAfterCsv({ skipPeriodRefresh: true, skipDefaults: true });
      await restoreAttributionUiState(priorState);
    })();
  }

  function initAttributionTab({ showTab: showAttrTab = false } = {}) {
    setupAttributionTabShell();
    if (showAttrTab && RV.ui.report.post?.showTab) {
      RV.ui.report.post.showTab("attribution");
    }
  }

  Object.assign(target, {
    renderAttributionTabShell,
    mountAttributionTabShell,
    initAttributionTab,
    setupAttributionTabShell,
    remountAttributionTabAfterReport,
    snapshotAttributionUiState,
    restoreAttributionUiState,
    getAttributionConfig,
    validateAttributionConfig,
    computeAttributionAnalysis,
    renderAttributionResults,
    bindAttributionEvents,
    setAttrAnalysisStatus,
    refreshAttrPeriodChecksAsync,
    refreshAttrDimHints,
    refreshAttrBadLabelUI,
    initAttrContribUi,
    renderAttrProfileCharts,
    addAttrRatioRow,
    collectAttrRatios,
    populateAttributionTabAfterCsv,
    clearAttributionAnalysisCache,
    markAttributionResultsStale,
    clearAttributionResultsStale,
    attributionConfigsMatch,
  });
})(window.RV);
