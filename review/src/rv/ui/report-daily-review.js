(function (RV) {
"use strict";
  var S = RV.app.state;
  var $ = (id) => document.getElementById(id);
  const esc = RV.infra.esc;
  const fillSelect = RV.ui.sidebar.fillSelect;
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const CP = () => RV.ui.configPanel;
  const CollapsedPicker = () => RV.ui.collapsedPicker;
  const DR = () => RV.domain.dailyReview;
  const renderLineSeriesChart = (...args) => RV.ui.charts.renderLineSeriesChart(...args);
  var ui = RV.ui = RV.ui || {};
  ui.report = ui.report || {};
  var target = ui.report.dailyReview = ui.report.dailyReview || {};

  let eventsBound = false;
  let metricSeq = 0;

  function hintBadgeHtml(tip) {
    return `<span class="rv-hint rv-tip-anchor" data-rv-tip="${esc(tip)}" tabindex="0" role="img" aria-label="说明">ⓘ</span>`;
  }

  function defaultMetricPresets() {
    return DR().defaultMetrics(S.headers);
  }

  function renderDrPickerChrome(pickerId, opts) {
    return CollapsedPicker().renderChromeHtml(pickerId, {
      showToolbar: true,
      searchPlaceholder: "搜索列名…",
      selectAllClass: "rv-collapsed-picker-select-all",
      clearAllClass: "rv-collapsed-picker-clear-all",
      toggleAdd: "添加维度 ▾",
      metaInPanel: true,
      popover: true,
      listLayout: true,
      ...opts,
    });
  }

  function getDrGroupDimensionCandidates() {
    const cached = S.groupDimCandidates;
    if (cached?.all?.length) {
      return {
        all: cached.all,
        recommended: cached.recommended?.length ? cached.recommended : cached.all,
        metaByCol: cached.metaByCol || {},
      };
    }
    if (RV.data?.buildGroupDimensionCandidates) {
      const built = RV.data.buildGroupDimensionCandidates();
      const all = built?.all?.length ? built.all : (S.headers || []);
      return {
        all,
        recommended: built?.recommended?.length ? built.recommended : all,
        metaByCol: built?.metaByCol || {},
      };
    }
    const all = S.headers || [];
    return { all, recommended: all, metaByCol: {} };
  }

  function buildDrValueMeta(metaByCol) {
    const out = {};
    for (const [col, meta] of Object.entries(metaByCol || {})) {
      if (meta?.highCardinality) out[col] = { highCardinality: true };
    }
    return out;
  }

  function registerDrPickers() {
    const spec = {
      selectedId: "drSegmentSelected",
      checksId: "drSegmentChecks",
      metaId: "drSegmentMeta",
      searchId: "drSegmentSearch",
      pickerId: "drSegmentPicker",
      toggleId: "drSegmentPickerToggle",
      selectedOnlyId: "drSegmentSelectedOnly",
      recommendedOnlyId: "drSegmentRecommendedOnly",
      emptyLabel: "未选客群维度时仅输出决策组环比",
      metaUnit: "个维度",
      toggleAdd: "添加维度 ▾",
      toggleCollapse: "收起 ▴",
      popover: true,
      listLayout: true,
      onChange: () => {
        refreshDrSegmentWarn();
        updatePanelSummaries();
        if (S.lastDailyReview) markDailyReviewResultsStale();
      },
    };
    const existing = CollapsedPicker().getPickerSpec("drSegment");
    if (existing) Object.assign(existing, spec);
    else CollapsedPicker().registerPicker("drSegment", spec);
  }

  function initDrSegmentPicker(selected) {
    registerDrPickers();
    const candidates = getDrGroupDimensionCandidates();
    CollapsedPicker().initPicker("drSegment", candidates.all.filter(Boolean), {
      defaultChecked: false,
      selected: selected || [],
      listLayout: true,
      recommendedValues: candidates.recommended,
      valueMetaByValue: buildDrValueMeta(candidates.metaByCol),
      defaultRecommendedOnly: false,
    });
    refreshDrSegmentWarn();
  }

  function renderDailyReviewTabShell() {
    return `<section id="tab-daily-review" class="report-tab-section">
<div class="container">
  <header>
    <h1>日常检视</h1>
    <p>日/周环比 · 决策组趋势 · 指标明细 · 客群贡献 · 组间同客群对比</p>
  </header>
  <div id="drStaleBanner" class="rv-stale-banner" role="status">
    <span>本页配置已变，结果可能过期（样本始终为全表 CSV，不受左侧贷后筛选影响）。</span>
    <button type="button" class="btn btn-secondary btn-sm" id="drStaleRerunBtn">重跑日常检视</button>
  </div>
  <div class="da-panel-stack">
    <div class="rv-wb-zone-label" style="margin-bottom:-.35rem">配置</div>

    <div class="da-config-panel" id="drPanelFields">
      <div class="da-panel-header" data-config-panel-toggle="drPanelFields" role="button" tabindex="0">
        <span class="da-panel-num">1</span>
        <span class="da-panel-title-text">字段与窗口${hintBadgeHtml("复用左侧 CSV；周=周一起始")}</span>
        <span class="da-panel-summary" id="drPanelFieldsSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div class="dr-field-grid">
          <div>
            <label for="drTimeCol">时间列</label>
            <select id="drTimeCol"></select>
          </div>
          <div>
            <label for="drDecisionCol">决策组列</label>
            <select id="drDecisionCol"></select>
          </div>
          <div>
            <label for="drLevelCol">Level 列（可选，Panel5 贷后）</label>
            <select id="drLevelCol"><option value="">— 不启用 —</option></select>
          </div>
          <div>
            <label for="drChangeNumCol">level_change_num 列（可选，Panel6 贷后）</label>
            <select id="drChangeNumCol"><option value="">— 不启用 —</option></select>
          </div>
          <div>
            <label for="drWeekWindow">周窗口（最近 N 周，日/周共用）</label>
            <input type="number" id="drWeekWindow" min="3" max="52" value="16" />
          </div>
          <div>
            <label for="drRelThreshold">异动阈值｜相对差（默认 10%）</label>
            <input type="number" id="drRelThreshold" min="0" step="0.01" value="0.1" />
          </div>
          <div>
            <label for="drNominalRate">名义利率（小数，默认 0.27）</label>
            <input type="number" id="drNominalRate" min="0" step="0.01" value="0.27" />
          </div>
          <div>
            <label for="drFeeRate">费率（小数，默认 0.27）</label>
            <input type="number" id="drFeeRate" min="0" step="0.01" value="0.27" />
          </div>
        </div>
        <p class="config-muted" style="margin-top:.35rem">毛利差 = 名义利率/(1+费率) − 金额风险；扣除风险毛利 = 到期金额 × 毛利差（万）。仅入明细表/贷后最新表现。</p>
      </div>
    </div>

    <div class="da-config-panel" id="drPanelMetrics">
      <div class="da-panel-header" data-config-panel-toggle="drPanelMetrics" role="button" tabindex="0">
        <span class="da-panel-num">2</span>
        <span class="da-panel-title-text">比率指标${hintBadgeHtml("分子/分母/方向；可增删")}</span>
        <span class="da-panel-summary" id="drPanelMetricsSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div class="batch-actions-inline" style="margin-bottom:.35rem">
          <button type="button" class="btn btn-secondary btn-sm" id="drResetMetrics">恢复默认指标</button>
          <button type="button" class="btn btn-secondary btn-sm" id="drAddMetric">+ 添加指标</button>
        </div>
        <p id="drMetricsMergeTip" class="status ok" hidden style="margin:.25rem 0 .35rem"></p>
        <div id="drMetricRows"></div>
        <p class="config-muted dr-metric-detail-hint">明细表另含「进件量」「放款金额(万)」「到期单量」「到期金额(万)」「毛利差」「扣除风险毛利(万)」（按表头自动加入；到期*取风险分母；毛利差/毛利由名义利率·费率派生），不进入上方折线/卡片。产品新增默认指标时，会在已有列表末尾<strong>自动补齐</strong>缺列可用的项（不删你已配的）；也可点「恢复默认指标」全量重置。</p>
      </div>
    </div>

    <div class="da-config-panel" id="drPanelSegments">
      <div class="da-panel-header" data-config-panel-toggle="drPanelSegments" role="button" tabindex="0">
        <span class="da-panel-num">3</span>
        <span class="da-panel-title-text">客群维度${hintBadgeHtml("用于贡献度与组间对比；高基数慎选")}</span>
        <span class="da-panel-summary" id="drPanelSegmentsSummary"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">
        <div class="group-config-picker dr-segment-picker">
        ${renderDrPickerChrome("drSegment", {
          selectedId: "drSegmentSelected",
          toggleId: "drSegmentPickerToggle",
          pickerId: "drSegmentPicker",
          checksId: "drSegmentChecks",
          metaId: "drSegmentMeta",
          searchId: "drSegmentSearch",
          selectedOnlyId: "drSegmentSelectedOnly",
          recommendedOnlyId: "drSegmentRecommendedOnly",
        })}
        </div>
        <p id="drSegmentWarn" class="status warn" hidden style="margin-top:.35rem"></p>
      </div>
    </div>

    <div class="da-config-panel" id="drPanelRun">
      <div class="da-panel-header"><span class="da-panel-num">4</span>运行</div>
      <button type="button" class="btn btn-primary" id="btnRunDailyReview" disabled>运行日常检视</button>
      <p id="drAnalysisStatus" class="status" style="min-height:1.25rem"></p>
    </div>
  </div>

  <div class="rv-wb-zone rv-wb-results">
    <div class="rv-wb-zone-label">结果</div>
    <div id="drResultsMount"><p class="da-results-placeholder">配置字段与指标后点击「运行日常检视」</p></div>
  </div>
</div>
</section>`;
  }

  function mountDailyReviewTabShell() {
    const doc = ensureReportDocument();
    const old = doc.querySelector("#tab-daily-review");
    if (old) old.remove();
    doc.insertAdjacentHTML("beforeend", renderDailyReviewTabShell());
  }

  function setDrAnalysisStatus(msg, kind) {
    const el = $("drAnalysisStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function markDailyReviewResultsStale() {
    if (!S.lastDailyReview) return;
    S.dailyReviewResultsStale = true;
    const banner = $("drStaleBanner");
    if (banner) banner.classList.add("visible");
    RV.events?.refreshProvenanceBar?.();
  }

  function clearDailyReviewResultsStale() {
    S.dailyReviewResultsStale = false;
    const banner = $("drStaleBanner");
    if (banner) banner.classList.remove("visible");
    RV.events?.refreshProvenanceBar?.();
  }

  function clearDailyReviewCache() {
    S.lastDailyReview = null;
    const mount = $("drResultsMount");
    if (mount) mount.innerHTML = `<p class="da-results-placeholder">配置字段与指标后点击「运行日常检视」</p>`;
  }

  function colOptions() {
    return (S.headers || []).slice();
  }

  function addMetricRow(preset) {
    preset = preset || {};
    const host = $("drMetricRows");
    if (!host) return;
    metricSeq += 1;
    const id = preset.id || ("m" + metricSeq);
    const row = document.createElement("div");
    row.className = "dr-metric-row ratio-row";
    row.dataset.metricId = id;
    const cols = colOptions();
    const numOpts = cols.map((c) => `<option value="${esc(c)}"${c === preset.numCol ? " selected" : ""}>${esc(c)}</option>`).join("");
    const denOpts = cols.map((c) => `<option value="${esc(c)}"${c === preset.denCol ? " selected" : ""}>${esc(c)}</option>`).join("");
    const dir = preset.direction === "lower" ? "lower" : "higher";
    row.innerHTML = `
      <div><label>名称</label><input type="text" class="dr-metric-name" value="${esc(preset.name || "")}" /></div>
      <div><label>分子</label><select class="dr-metric-num">${numOpts}</select></div>
      <div><label>分母</label><select class="dr-metric-den">${denOpts}</select></div>
      <div><label>方向</label>
        <select class="dr-metric-dir">
          <option value="higher"${dir === "higher" ? " selected" : ""}>越大越好</option>
          <option value="lower"${dir === "lower" ? " selected" : ""}>越小越好</option>
        </select>
      </div>
      <div class="dr-metric-actions"><button type="button" class="btn btn-secondary btn-sm dr-metric-remove">删除</button></div>
    `;
    host.appendChild(row);
  }

  function resetDefaultMetrics() {
    const host = $("drMetricRows");
    if (!host) return;
    host.innerHTML = "";
    metricSeq = 0;
    defaultMetricPresets().forEach((m) => addMetricRow(m));
    setDrMetricsMergeTip("");
    updatePanelSummaries();
  }

  function collectMetricsFromDom() {
    const rows = [];
    document.querySelectorAll("#drMetricRows .dr-metric-row").forEach((row, i) => {
      rows.push({
        id: row.dataset.metricId || ("m" + i),
        name: row.querySelector(".dr-metric-name")?.value?.trim() || ("指标" + (i + 1)),
        numCol: row.querySelector(".dr-metric-num")?.value || "",
        denCol: row.querySelector(".dr-metric-den")?.value || "",
        direction: row.querySelector(".dr-metric-dir")?.value === "lower" ? "lower" : "higher",
      });
    });
    return rows;
  }

  function getSelectedSegmentCols() {
    return CollapsedPicker().getPickerSpec("drSegment")
      ? CollapsedPicker().getPickerSelection("drSegment")
      : [];
  }

  function refreshDrSegmentWarn() {
    const warn = $("drSegmentWarn");
    if (!warn) return;
    const cols = getSelectedSegmentCols();
    const metaByCol = getDrGroupDimensionCandidates().metaByCol || {};
    const highCard = cols.some((c) => metaByCol[c]?.highCardinality);
    warn.hidden = !highCard;
    warn.textContent = highCard
      ? "所选维度基数较高，贡献/对比可能较慢或过碎，建议收敛或勾选「仅看推荐」。"
      : "";
  }

  function updatePanelSummaries() {
    const timeCol = $("drTimeCol")?.value || "—";
    const decCol = $("drDecisionCol")?.value || "—";
    const levelCol = $("drLevelCol")?.value || "";
    const changeNumCol = $("drChangeNumCol")?.value || "";
    const fs = $("drPanelFieldsSummary");
    if (fs) {
      const extras = [levelCol && `level=${levelCol}`, changeNumCol && `lcn=${changeNumCol}`].filter(Boolean);
      fs.textContent = extras.length
        ? `${timeCol} · ${decCol} · ${extras.join(" · ")}`
        : `${timeCol} · ${decCol}`;
    }
    const ms = $("drPanelMetricsSummary");
    if (ms) ms.textContent = `${collectMetricsFromDom().length} 个指标`;
    const ss = $("drPanelSegmentsSummary");
    if (ss) {
      const n = getSelectedSegmentCols().length;
      ss.textContent = n ? `${n} 维` : "未选";
    }
  }

  function getDailyReviewConfig() {
    const profit = DR().resolveProfitParams({
      nominalRate: $("drNominalRate")?.value,
      feeRate: $("drFeeRate")?.value,
    });
    return {
      timeCol: $("drTimeCol")?.value || "",
      decisionCol: $("drDecisionCol")?.value || "",
      levelCol: $("drLevelCol")?.value || "",
      levelChangeNumCol: $("drChangeNumCol")?.value || "",
      weekWindow: DR().resolveWeekWindow($("drWeekWindow")?.value),
      thresholds: {
        relDelta: +($("drRelThreshold")?.value || DR().DEFAULT_THRESHOLDS.relDelta || 0.1),
      },
      nominalRate: profit.nominalRate,
      feeRate: profit.feeRate,
      metrics: collectMetricsFromDom(),
      segmentCols: getSelectedSegmentCols(),
      headers: (S.headers || []).slice(),
    };
  }

  function validateDailyReviewConfig(cfg) {
    return DR().validateConfig(cfg, S.headers);
  }

  function populateSelects() {
    const headers = colOptions();
    const timeGuess = DR().guessTimeCol(headers);
    const decDefault = headers.includes("决策组") ? "决策组" : (S.enumCols?.[0] || headers[0] || "");
    const levelGuess = DR().guessLevelCol?.(headers) || "";
    const changeNumGuess = DR().guessChangeNumCol?.(headers) || "";
    const keepLevel = $("drLevelCol")?.value || "";
    const keepChangeNum = $("drChangeNumCol")?.value || "";
    fillSelect($("drTimeCol"), headers);
    fillSelect($("drDecisionCol"), headers);
    const levelSel = $("drLevelCol");
    if (levelSel) {
      levelSel.innerHTML = `<option value="">— 不启用 —</option>`
        + headers.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      if (keepLevel && headers.includes(keepLevel)) levelSel.value = keepLevel;
      else if (levelGuess) levelSel.value = levelGuess;
      else levelSel.value = "";
    }
    const changeSel = $("drChangeNumCol");
    if (changeSel) {
      changeSel.innerHTML = `<option value="">— 不启用 —</option>`
        + headers.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      if (keepChangeNum && headers.includes(keepChangeNum)) changeSel.value = keepChangeNum;
      else if (changeNumGuess) changeSel.value = changeNumGuess;
      else changeSel.value = "";
    }
    if ($("drTimeCol") && timeGuess) $("drTimeCol").value = timeGuess;
    if ($("drDecisionCol") && decDefault) $("drDecisionCol").value = decDefault;
  }

  function setDrMetricsMergeTip(msg) {
    const tip = $("drMetricsMergeTip");
    if (!tip) return;
    if (!msg) {
      tip.hidden = true;
      tip.textContent = "";
      return;
    }
    tip.hidden = false;
    tip.textContent = msg;
  }

  function populateDailyReviewTabAfterCsv() {
    if (!$("tab-daily-review")) return;
    populateSelects();
    if (!$("drMetricRows")?.children?.length) {
      resetDefaultMetrics();
      setDrMetricsMergeTip("");
    } else {
      // refresh option lists while keeping selections
      document.querySelectorAll("#drMetricRows .dr-metric-row").forEach((row) => {
        const numSel = row.querySelector(".dr-metric-num");
        const denSel = row.querySelector(".dr-metric-den");
        const keepNum = numSel?.value;
        const keepDen = denSel?.value;
        fillSelect(numSel, colOptions());
        fillSelect(denSel, colOptions());
        if (keepNum) numSel.value = keepNum;
        if (keepDen) denSel.value = keepDen;
      });
      // Append newly introduced DEFAULT_METRICS that the CSV can support
      const merged = DR().mergeMissingDefaultMetrics?.(collectMetricsFromDom(), S.headers);
      if (merged?.added?.length) {
        merged.added.forEach((m) => addMetricRow(m));
        const names = merged.added.map((m) => m.name).join("、");
        setDrMetricsMergeTip(`已自动补齐默认指标：${names}。请重新运行日常检视。`);
        markDailyReviewResultsStale();
      } else {
        setDrMetricsMergeTip("");
      }
    }
    const priorSegments = getSelectedSegmentCols();
    initDrSegmentPicker(priorSegments);
    updatePanelSummaries();
    const btn = $("btnRunDailyReview");
    if (btn) btn.disabled = !S.rawRows.length;
  }

  function deltaClass(delta, direction) {
    if (delta == null || Math.abs(delta) < 1e-12) return "";
    const worse = DR().isWorseDelta(delta, direction);
    return worse ? "dr-delta-bad" : "dr-delta-good";
  }

  function splitPanel1MetricsByLoanSide(metrics) {
    const list = metrics || [];
    const pre = [];
    const post = [];
    for (const m of list) {
      if (DR().isPostLoanMetric?.(m) || m.id === "risk" || m.id === "amt_risk"
        || m.name === "订单风险" || m.name === "金额风险") {
        post.push(m);
      } else {
        pre.push(m);
      }
    }
    return { pre, post };
  }

  function ensureCardPeriodFilterState() {
    if (!S.drCardPeriodFilter) S.drCardPeriodFilter = {};
    for (const g of drGrains()) {
      if (!S.drCardPeriodFilter[g]) S.drCardPeriodFilter[g] = { pre: "", post: "" };
    }
  }

  /** Resolve pre/post cmp periods for Panel1 cards; clamp to series periods or class default. */
  function resolveCardPeriodFilter(series, metrics, groups, grain) {
    ensureCardPeriodFilterState();
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : (grain === "day" || grain === "month" ? grain : "week");
    const saved = S.drCardPeriodFilter[g] || { pre: "", post: "" };
    const periods = series?.periods || [];
    const { pre: preMs, post: postMs } = splitPanel1MetricsByLoanSide(metrics);
    const defPre = DR().defaultCmpPeriodForMetrics
      ? DR().defaultCmpPeriodForMetrics(series, preMs, groups)
      : (periods.length ? periods[periods.length - 1] : null);
    const defPost = DR().defaultCmpPeriodForMetrics
      ? DR().defaultCmpPeriodForMetrics(series, postMs, groups)
      : (periods.length ? periods[periods.length - 1] : null);
    const pre = saved.pre && periods.includes(saved.pre) ? saved.pre : (defPre || "");
    const post = saved.post && periods.includes(saved.post) ? saved.post : (defPost || "");
    S.drCardPeriodFilter[g] = { pre, post };
    return { pre, post, defPre: defPre || "", defPost: defPost || "" };
  }

  function getCardCmpPeriodForMetric(metric, grain) {
    ensureCardPeriodFilterState();
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : (grain === "day" || grain === "month" ? grain : "week");
    const saved = S.drCardPeriodFilter[g] || { pre: "", post: "" };
    const isPost = DR().isPostLoanMetric?.(metric) || metric?.id === "risk" || metric?.id === "amt_risk"
      || metric?.name === "订单风险" || metric?.name === "金额风险";
    return isPost ? (saved.post || null) : (saved.pre || null);
  }

  function renderCardPeriodFilter(series, metrics, groups, grain) {
    if (!series?.periods?.length) return "";
    const periods = series.periods;
    const { pre, post } = resolveCardPeriodFilter(series, metrics, groups, grain);
    const { pre: preMs, post: postMs } = splitPanel1MetricsByLoanSide(metrics);
    const opts = (selected) => periods.map((p) =>
      `<option value="${esc(p)}"${p === selected ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`
    ).join("");
    const preDisabled = !preMs.length ? " disabled" : "";
    const postDisabled = !postMs.length ? " disabled" : "";
    return `<div class="dr-card-period-filter" data-dr-card-period-grain="${esc(grain)}">
      <span class="dr-card-period-label">指标卡比较期</span>
      <label>贷前 <select class="dr-card-period-pre" data-dr-card-period-side="pre" data-dr-card-period-grain="${esc(grain)}" aria-label="贷前指标比较期"${preDisabled}>${opts(pre)}</select></label>
      <label>贷后 <select class="dr-card-period-post" data-dr-card-period-side="post" data-dr-card-period-grain="${esc(grain)}" aria-label="贷后指标比较期"${postDisabled}>${opts(post)}</select></label>
      <span class="config-muted dr-card-period-hint">贷后=订单/金额风险；仅影响指标卡 · 环比=该期 vs 上一有值期</span>
    </div>`;
  }

  function renderMetricCardsForGroup(series, group, grain, metrics) {
    if (!series?.periods?.length) return "";
    const list = metrics || series.metrics || [];
    return `<div class="metric-cards dr-metric-cards">${list.map((m) => {
      const cmpPeriod = getCardCmpPeriodForMetric(m, grain);
      const snap = DR().metricSnapshotAt
        ? DR().metricSnapshotAt(series, group, m.id, cmpPeriod)
        : DR().latestMetricSnapshot(series, group, m.id);
      const displayRate = snap?.displayRate != null ? snap.displayRate : snap?.rate;
      const delta = snap?.delta;
      const cls = deltaClass(delta, m.direction);
      const deltaTxt = DR().formatDelta(delta, m);
      const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
      const cmpLab = DR().formatPeriodLabel(snap?.period, grain);
      const baseLab = DR().formatPeriodLabel(snap?.prevPeriod, grain);
      const dispLab = DR().formatPeriodLabel(snap?.displayPeriod || snap?.period, grain);
      const priorLab = DR().formatPeriodLabel(snap?.priorLevelPeriod, grain);
      let tip = "暂无有效样本";
      if (snap) {
        if (snap.shortWeekSkipped) {
          tip =
            `短周 ${dispLab}：${DR().formatRate(snap.displayRate, m)}（仅${snap.skippedDayCount}天，未入环比）` +
            (snap.priorLevelPeriod != null
              ? `\n上一周 ${priorLab}：${DR().formatRate(snap.priorLevelRate, m)}`
              : "") +
            (snap.prevPeriod != null
              ? `\n环比 ${baseLab}→${cmpLab}：${DR().formatRate(snap.prevRate, m)} → ${DR().formatRate(snap.rate, m)}`
              : "\n环比：需再上一有值周");
        } else {
          tip =
            `比较期 ${cmpLab}：${DR().formatRate(snap.rate, m)}` +
            (snap.prevPeriod != null
              ? `\n基期 ${baseLab}：${DR().formatRate(snap.prevRate, m)}`
              : "\n基期：—");
        }
      }
      const periodHint = snap && !snap.shortWeekSkipped && series.periods[series.periods.length - 1] !== snap.period
        ? ` · ${esc(cmpLab)}`
        : (snap?.shortWeekSkipped ? " · 短周" : "");
      return `<div class="metric-card dr-metric-card" title="${esc(tip)}">
        <div class="val">${esc(DR().formatRate(displayRate, m))}</div>
        <div class="sub ${cls}">${arrow} ${esc(deltaTxt)} 环比</div>
        <div class="lbl">${esc(m.name)} · ${esc(group)}${periodHint}</div>
      </div>`;
    }).join("")}</div>`;
  }

  function renderShortWeekPanelBanner(series, metrics) {
    if (series?.grain !== "week" || !series.weekDayCounts) return "";
    const list = metrics || series.metrics || [];
    const groups = Array.from(new Set((series.points || []).map((p) => p.group)));
    for (const g of groups) {
      for (const m of list) {
        const snap = DR().latestMetricSnapshot(series, g, m.id);
        if (!snap?.shortWeekSkipped) continue;
        const banner = DR().formatShortWeekBanner
          ? DR().formatShortWeekBanner(snap, "week")
          : DR().formatShortWeekNote(snap, "week");
        if (!banner) continue;
        return `<p class="dr-short-week-banner" role="status">${esc(banner)}</p>`;
      }
    }
    return "";
  }

  /** Stable A/B colors across Panel1 trend + pairwise flip charts (by group name, not series index). */
  function lineSeriesPalette() {
    const pal = (RV.infra.chartPalette && RV.infra.chartPalette()) || {};
    return [
      pal.accent || "#60a5fa",
      pal.warn || "#fbbf24",
      "#4ade80",
      "#a78bfa",
      "#f472b6",
      "#22d3ee",
      "#fb923c",
      "#818cf8",
    ];
  }

  function orderDecisionGroupsForChart(groups) {
    const list = (groups || []).map((g) => String(g));
    const ab = DR().resolveDecisionAB?.(list);
    if (!ab) return list.slice().sort();
    const rest = list.filter((g) => g !== ab.a && g !== ab.b).sort();
    return [ab.a, ab.b, ...rest];
  }

  function decisionGroupColorMap(groups) {
    const colors = lineSeriesPalette();
    const ordered = orderDecisionGroupsForChart(groups);
    const map = Object.create(null);
    ordered.forEach((g, i) => {
      map[g] = colors[i % colors.length];
    });
    return map;
  }

  function buildChartSpec(series, metric, asPercent, periodFilter) {
    let periods = series.periods || [];
    if (periodFilter?.from || periodFilter?.to) {
      periods = periods.filter((p) => {
        if (periodFilter.from && p < periodFilter.from) return false;
        if (periodFilter.to && p > periodFilter.to) return false;
        return true;
      });
    }
    const categories = periods.map((p) => DR().formatPeriodLabel(p, series.grain));
    const groups = orderDecisionGroupsForChart(
      Array.from(new Set((series.points || []).map((p) => p.group)))
    );
    const colorMap = decisionGroupColorMap(groups);
    return {
      title: `${metric.name}（${DR().grainLabel ? DR().grainLabel(series.grain) : series.grain}）`,
      asPercent: asPercent != null ? asPercent : Math.abs(series.points[0]?.metrics[metric.id]?.rate || 0) <= 1.5,
      categories,
      formatValue: (v) => DR().formatRate(v, metric),
      series: groups.map((g) => ({
        name: g,
        color: colorMap[g],
        values: periods.map((p) => {
          const pt = series.points.find((x) => x.period === p && x.group === g);
          return pt ? pt.metrics[metric.id].rate : null;
        }),
      })),
    };
  }

  function renderChartTimeFilter(grain, periods, opts) {
    if (!periods?.length) return "";
    const saved = S.drChartPeriodFilter?.[grain] || {};
    let first = saved.from && periods.includes(saved.from) ? saved.from : periods[0];
    let last = saved.to && periods.includes(saved.to) ? saved.to : periods[periods.length - 1];
    if (first > last) {
      const tmp = first;
      first = last;
      last = tmp;
    }
    const hint = opts?.hint
      ? `<span class="dr-chart-time-hint config-muted">${esc(opts.hint)}</span>`
      : "";
    return `<div class="dr-chart-time-filter" data-dr-time-grain="${esc(grain)}">
      <span class="dr-chart-time-label">图表时间</span>
      ${hint}
      <label>起 <select class="dr-chart-time-from" data-dr-time-grain="${esc(grain)}">${
        periods.map((p) => `<option value="${esc(p)}"${p === first ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
      }</select></label>
      <label>止 <select class="dr-chart-time-to" data-dr-time-grain="${esc(grain)}">${
        periods.map((p) => `<option value="${esc(p)}"${p === last ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
      }</select></label>
      <button type="button" class="btn btn-secondary btn-sm dr-chart-time-reset" data-dr-time-grain="${esc(grain)}">重置</button>
      <span class="dr-chart-time-meta config-muted" data-dr-time-meta="${esc(grain)}">${periods.length} 期</span>
    </div>`;
  }

  function chartPeriodsForGrain(grain) {
    const result = S.lastDailyReview;
    if (!result) return [];
    const series = resolvePanel1Series(result, grain) || result.seriesByGrain?.[grain];
    return series?.periods?.length ? series.periods.slice() : [];
  }

  /** Clamp from/to to keys that exist in this grain's periods (drop cross-grain leftovers). */
  function sanitizeChartPeriodFilter(grain, filter, periods) {
    const ps = periods?.length ? periods : chartPeriodsForGrain(grain);
    let from = filter?.from || "";
    let to = filter?.to || "";
    if (!ps.length) return { from: "", to: "" };
    if (from && !ps.includes(from)) from = "";
    if (to && !ps.includes(to)) to = "";
    if (!from) from = ps[0];
    if (!to) to = ps[ps.length - 1];
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    return { from, to };
  }

  function syncChartPeriodFilterFromDom(grain) {
    if (!S.drChartPeriodFilter) S.drChartPeriodFilter = {};
    const fromEl = document.querySelector(`.dr-chart-time-from[data-dr-time-grain="${grain}"]`);
    const toEl = document.querySelector(`.dr-chart-time-to[data-dr-time-grain="${grain}"]`);
    let from = fromEl?.value || "";
    let to = toEl?.value || "";
    const cleaned = sanitizeChartPeriodFilter(grain, { from, to });
    from = cleaned.from;
    to = cleaned.to;
    if (fromEl && fromEl.value !== from) fromEl.value = from;
    if (toEl && toEl.value !== to) toEl.value = to;
    S.drChartPeriodFilter[grain] = { from, to };
    return S.drChartPeriodFilter[grain];
  }

  function getChartPeriodFilter(grain) {
    const fromEl = document.querySelector(`.dr-chart-time-from[data-dr-time-grain="${grain}"]`);
    const toEl = document.querySelector(`.dr-chart-time-to[data-dr-time-grain="${grain}"]`);
    if (!fromEl && !toEl) {
      const saved = S.drChartPeriodFilter?.[grain] || { from: "", to: "" };
      const cleaned = sanitizeChartPeriodFilter(grain, saved);
      if (!S.drChartPeriodFilter) S.drChartPeriodFilter = {};
      S.drChartPeriodFilter[grain] = cleaned;
      return cleaned;
    }
    return syncChartPeriodFilterFromDom(grain);
  }

  function mountGrainCharts(result, grain) {
    const series = resolvePanel1Series(result, grain);
    if (!series) return;
    const filter = getChartPeriodFilter(grain);
    let n = series.periods.length;
    if (filter.from || filter.to) {
      n = series.periods.filter((p) => {
        if (filter.from && p < filter.from) return false;
        if (filter.to && p > filter.to) return false;
        return true;
      }).length;
    }
    const meta = document.querySelector(`[data-dr-time-meta="${grain}"]`);
    if (meta) meta.textContent = `${n} / ${series.periods.length} 期`;

    const mount = $("drResultsMount");
    if (!mount) return;
    for (const m of result.config.metrics) {
      const host = mount.querySelector(`[data-dr-chart="${grain}:${m.id}"]`);
      if (!host) continue;
      const asPct = !/件均|金额|均额/.test(m.name);
      renderLineSeriesChart(host, buildChartSpec(series, m, asPct, filter));
    }
  }

  function getPanel1Segment() {
    const v = S.drPanel1Segment;
    if (v == null || v === "") return "__all__";
    return String(v);
  }

  function sharedSegCols(result) {
    const all = result?.config?.segmentCols || [];
    const want = (S.drSegmentFilter?.segmentCols || []).filter((c) => all.includes(c));
    return want.length ? want : all.slice();
  }

  function sharedSegAvail(result, grain) {
    if (!result || !DR().listProjectedSegmentKeys) return [];
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain || getDrGrain()) : (grain || getDrGrain());
    return DR().listProjectedSegmentKeys(result, g, sharedSegCols(result)) || [];
  }

  function sharedSegKeys(result, grain) {
    const avail = sharedSegAvail(result, grain);
    const want = (S.drSegmentFilter?.segmentKeys || []).filter((k) => avail.includes(k));
    return want.length ? want : avail.slice();
  }

  function sharedSegIsAll(result, grain) {
    const avail = sharedSegAvail(result, grain);
    if (!avail.length) return true;
    return sharedSegKeys(result, grain).length === avail.length;
  }

  function renderSegmentToolbar(result) {
    const el = $("drSegmentToolbar");
    if (!el || !result) return;
    const cols = result.config?.segmentCols || [];
    if (!cols.length) {
      el.innerHTML = "";
      return;
    }
    const pickedCols = sharedSegCols(result);
    const allColsOn = pickedCols.length === cols.length;
    const grain = getDrGrain();
    const avail = sharedSegAvail(result, grain);
    const pickedKeys = sharedSegKeys(result, grain);
    const allKeysOn = !avail.length || pickedKeys.length === avail.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群列</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allColsOn ? " active" : ""}" data-dr-segcols="__all__" data-dr-view="segment">全选</button>`;
    for (const c of cols) {
      const on = pickedCols.includes(c);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-segcol="${esc(c)}" data-dr-view="segment">${esc(c)}</button>`;
    }
    html += `</div></div>`;
    if (avail.length) {
      html += `<div class="dr-filter-row">
        <span class="dr-filter-label">客群</span>
        <div class="dr-chip-row">
          <button type="button" class="dr-chip${allKeysOn ? " active" : ""}" data-dr-segkeys="__all__" data-dr-view="segment">全选</button>`;
      for (const k of avail) {
        const on = pickedKeys.includes(k);
        const label = DR().formatSegmentShort({ segment: k }) || k;
        html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-segkey="${esc(k)}" data-dr-view="segment">${esc(label)}</button>`;
      }
      html += `</div></div>`;
    }
    el.innerHTML = html;
  }

  function refreshViewsForSegment(result, colsChanged) {
    if (!result) return;
    if (colsChanged) {
      const cols = sharedSegCols(result);
      const rows = S.rawRows || [];
      for (const g of drGrains()) {
        if (DR().ensureContributionPanel) DR().ensureContributionPanel(rows, result, g, cols);
        if ((result.decisionGroups || []).length >= 2 && DR().ensureSegmentPairwiseCompare) {
          DR().ensureSegmentPairwiseCompare(rows, result, g, cols);
        }
      }
    }
    renderSegmentToolbar(result);
    refreshPanel1View(result);
    if (S.drDetailFilter) refreshDetailRelated(result);
    if (S.drContribFilter && result.config?.segmentCols?.length) {
      renderContribToolbar(result);
      refreshContribView(result);
    }
    if (S.drPairwiseFilter && result.decisionGroups?.length >= 2) {
      renderPairwiseToolbar(result);
      refreshPairwiseView(result);
    }
    if (hasBinnedPanel(result)) {
      renderLevelToolbar(result);
      refreshLevelView(result);
    }
    refreshBriefView(result);
  }

  function applySharedSegCols(result, cols) {
    if (!S.drSegmentFilter || !result) return;
    const all = result.config?.segmentCols || [];
    const picked = (cols || []).filter((c) => all.includes(c));
    S.drSegmentFilter.segmentCols = picked.length ? picked : all.slice();
    S.drSegmentFilter.segmentKeys = [];
    refreshViewsForSegment(result, true);
  }

  function initSegmentFilterState(result) {
    const all = result?.config?.segmentCols || [];
    const prev = S.drSegmentFilter;
    let cols = (prev?.segmentCols || []).filter((c) => all.includes(c));
    let keys = (prev?.segmentKeys || []).slice();
    if (!prev && S.drDetailFilter?.detailSegCols?.length) {
      cols = S.drDetailFilter.detailSegCols.filter((c) => all.includes(c));
      keys = (S.drDetailFilter.detailSegKeys || []).slice();
    }
    S.drSegmentFilter = {
      segmentCols: cols.length ? cols : all.slice(),
      segmentKeys: keys,
    };
  }

  function resolvePanel1Series(result, grain) {
    if (sharedSegIsAll(result, grain) || !result?.seriesFineByGrain?.[grain]) {
      return result?.seriesByGrain?.[grain] || null;
    }
    if (!DR().projectDecisionSeriesByKeys) return result?.seriesByGrain?.[grain] || null;
    return DR().projectDecisionSeriesByKeys(result.seriesFineByGrain[grain], {
      cfgSegs: result.config?.segmentCols || [],
      segmentCols: sharedSegCols(result),
      segmentKeys: sharedSegKeys(result, grain),
    }) || result?.seriesByGrain?.[grain] || null;
  }

  function resolvePanel1Anomalies(result, grain, series) {
    const panelMetrics = result.config?.metrics || [];
    if (sharedSegIsAll(result, grain)) return result.anomaliesByGrain?.[grain] || [];
    if (!series) return [];
    return DR().detectAnomalies(
      { ...series, metrics: panelMetrics },
      result.config?.thresholds
    );
  }

  function resolvePanel1Narratives(result, grain, series) {
    const panelMetrics = result.config?.metrics || [];
    if (sharedSegIsAll(result, grain)) {
      return (result.narratives || []).filter((n) => n.grain === grain);
    }
    if (!series) return [];
    const groups = Array.from(new Set((series.points || []).map((p) => p.group))).sort();
    return DR().buildDecisionGroupNarratives(
      { [grain]: { ...series, metrics: panelMetrics } },
      groups,
      result.config?.thresholds
    ).filter((n) => n.grain === grain);
  }

  function resolvePanel1DecisionGroups(result, series) {
    if (!series || sharedSegIsAll(result, series.grain)) return result.decisionGroups || [];
    const groups = Array.from(new Set((series.points || []).map((p) => p.group))).sort();
    return groups.length ? groups : (result.decisionGroups || []);
  }

  function renderPanel1SegmentToolbar(result) {
    if (!result?.config?.segmentCols?.length) return "";
    const keys = result.panel1SegmentKeys || ["__all__"];
    if (keys.length <= 1) return "";
    const cur = getPanel1Segment();
    const active = keys.includes(cur) ? cur : "__all__";
    if (active !== cur) S.drPanel1Segment = active;
    let html = `<div class="dr-filter-toolbar" id="drPanel1Toolbar" data-dr-view="panel1">
      <div class="dr-filter-row">
        <span class="dr-filter-label">客群</span>
        <select id="drPanel1SegmentSelect" class="dr-panel1-seg-select" aria-label="Panel1 客群筛选">`;
    for (const k of keys) {
      const label = k === "__all__"
        ? "全部"
        : (DR().formatSegmentShort({ segment: k }) || k);
      html += `<option value="${esc(k)}"${active === k ? " selected" : ""}>${esc(label)}</option>`;
    }
    html += `</select>
        <span class="config-muted dr-filter-hint">筛选后仍按决策组展示</span>
      </div>
    </div>`;
    return html;
  }

  function renderPanel1MetricCardSections(result, grain, series) {
    const groups = resolvePanel1DecisionGroups(result, series);
    let html = "";
    for (const g of groups) {
      html += `<div class="dr-group-section"><h3>决策组 ${esc(g)}</h3>`;
      html += renderMetricCardsForGroup(series, g, grain, result.config.metrics);
      html += `</div>`;
    }
    return html;
  }

  function renderPanel1GrainInner(result, grain) {
    const series = resolvePanel1Series(result, grain);
    if (!series) return `<p class="da-results-placeholder">无序列</p>`;
    const groups = resolvePanel1DecisionGroups(result, series);
    let html = renderShortWeekPanelBanner(series, result.config.metrics);
    html += renderCardPeriodFilter(series, result.config.metrics, groups, grain);
    html += `<div class="dr-panel1-metric-cards" data-dr-panel1-cards="${esc(grain)}">`;
    html += renderPanel1MetricCardSections(result, grain, series);
    html += `</div>`;
    const winHint = `近 ${result.config.weekWindow || 16} 周`;
    html += renderChartTimeFilter(grain, series.periods || [], { hint: winHint });
    html += `<div class="dr-charts-grid">`;
    for (const m of result.config.metrics) {
      html += `<div class="dr-chart-host" data-dr-chart="${grain}:${esc(m.id)}"></div>`;
    }
    html += `</div>`;
    const notes = resolvePanel1Narratives(result, grain, series);
    if (notes.length) {
      html += renderNarrativesBlock(result, grain, notes);
    }
    const anoms = resolvePanel1Anomalies(result, grain, series);
    if (anoms.length) {
      html += `<div class="dr-anoms"><h4>异动标记（最新期 vs 上期）</h4><ul>${anoms.slice(0, 12).map((a) =>
        `<li class="${a.worse ? "dr-delta-bad" : "dr-delta-good"}">${esc(a.group)} · ${esc(a.metricName)}：${esc(DR().formatDelta(a.delta, { name: a.metricName }))}</li>`
      ).join("")}</ul></div>`;
    }
    return html;
  }

  /** Re-render Panel1 metric cards for one grain; keeps period selects (no full remount). */
  function refreshPanel1MetricCards(result, grain) {
    const mount = $("drResultsMount");
    if (!mount || !result) return;
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    const series = resolvePanel1Series(result, g);
    const cardsHost = mount.querySelector(`[data-dr-panel1-cards="${g}"]`);
    if (!cardsHost || !series) return;
    cardsHost.innerHTML = renderPanel1MetricCardSections(result, g, series);
  }

  function refreshPanel1View(result) {
    const mount = $("drResultsMount");
    if (!mount || !result) return;
    for (const grain of drGrains()) {
      const panel = mount.querySelector(`[data-dr-grain-panel="${grain}"]`);
      if (panel) panel.innerHTML = renderPanel1GrainInner(result, grain);
    }
    mountGrainCharts(result, getDrGrain());
  }

  function initNarrativeFilterState() {
    if (!S.drNarrativeFilter) {
      S.drNarrativeFilter = { day: "anomaly", week: "anomaly", month: "anomaly" };
    } else if (S.drNarrativeFilter.month == null) {
      S.drNarrativeFilter.month = "anomaly";
    }
  }

  function pickNarrativeMode(grain) {
    const mode = S.drNarrativeFilter?.[grain] || "anomaly";
    if (mode === "anomaly" || mode === "worse" || mode === "all") return mode;
    return "anomaly";
  }

  function filterNarrativeNotes(notes, mode) {
    if (mode === "worse") return notes.filter((n) => n.worse);
    if (mode === "anomaly") return notes.filter((n) => n.isAnomaly);
    return notes.slice();
  }

  function renderNarrativeRow(n, grain) {
    const metric = { name: n.metricName, direction: n.direction };
    const deltaCls = n.worse ? "dr-delta-bad" : (Math.abs(n.delta) < 1e-12 ? "" : "dr-delta-good");
    const sentCls = n.worse ? "dr-narr-sent-bad" : (n.sentiment === "持平" ? "dr-narr-sent-flat" : "dr-narr-sent-good");
    const curLab = DR().formatPeriodLabel(n.period, grain);
    const prevLab = DR().formatPeriodLabel(n.prevPeriod, grain);
    const anomMark = n.isAnomaly ? `<span class="dr-narr-anom" title="相对异动">异动</span>` : "";
    return `<div class="dr-narr-row" title="${esc(n.text || "")}">
      <span class="dr-narr-metric">${esc(n.metricName)}</span>
      <span class="dr-narr-delta ${deltaCls}">${esc(DR().formatDelta(n.delta, metric))}</span>
      <span class="dr-narr-sent ${sentCls}">${esc(n.sentiment || "")}</span>
      <span class="dr-narr-rates">${esc(DR().formatRate(n.prevRate, metric))} → ${esc(DR().formatRate(n.rate, metric))}</span>
      <span class="dr-narr-period">${esc(curLab)} vs ${esc(prevLab)}</span>
      ${anomMark}
    </div>`;
  }

  function renderNarrativesBlock(result, grain, notesOverride) {
    const notes = notesOverride || (result.narratives || []).filter((n) => n.grain === grain);
    if (!notes.length) return "";
    initNarrativeFilterState();
    const mode = pickNarrativeMode(grain);
    let filtered = filterNarrativeNotes(notes, mode);
    let hint = "";
    if (mode === "anomaly" && !filtered.length && notes.length) {
      filtered = notes.slice();
      hint = `<p class="dr-narr-hint">本期无异动，已显示全部</p>`;
    } else if (mode === "worse" && !filtered.length && notes.length) {
      hint = `<p class="dr-narr-hint">本期无负面变化</p>`;
    }

    const modes = [
      { id: "anomaly", label: "异动" },
      { id: "worse", label: "负面" },
      { id: "all", label: "全部" },
    ];
    let html = `<div class="dr-narratives" data-dr-narr-grain="${esc(grain)}">
      <div class="dr-narr-head">
        <h4>数据点评</h4>
        <div class="dr-chip-row dr-narr-filters" role="tablist">`;
    for (const m of modes) {
      html += `<button type="button" class="dr-chip${mode === m.id ? " active" : ""}" data-dr-narr-mode="${m.id}" data-dr-narr-grain="${esc(grain)}">${m.label}</button>`;
    }
    html += `</div></div>${hint}`;

    if (!filtered.length) {
      html += `<p class="dr-narr-hint">无点评</p></div>`;
      return html;
    }

    const series = resolvePanel1Series(result, grain);
    const order = resolvePanel1DecisionGroups(result, series);
    const byGroup = Object.create(null);
    for (const n of filtered) {
      if (!byGroup[n.group]) byGroup[n.group] = [];
      byGroup[n.group].push(n);
    }
    const groups = order.filter((g) => byGroup[g]?.length);
    for (const g of Object.keys(byGroup)) {
      if (!groups.includes(g)) groups.push(g);
    }

    for (const g of groups) {
      const rows = byGroup[g].slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      html += `<div class="dr-narr-group">
        <div class="dr-narr-group-title">${esc(g)}</div>
        <div class="dr-narr-rows">${rows.map((n) => renderNarrativeRow(n, grain)).join("")}</div>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  function refreshNarrativesBlock(result, grain) {
    const mount = $("drResultsMount");
    if (!mount || !result) return;
    const series = resolvePanel1Series(result, grain);
    const notes = resolvePanel1Narratives(result, grain, series);
    const old = mount.querySelector(`.dr-narratives[data-dr-narr-grain="${grain}"]`);
    const next = renderNarrativesBlock(result, grain, notes);
    if (!next) {
      if (old) old.remove();
      return;
    }
    if (old) {
      old.outerHTML = next;
    } else {
      const panel = mount.querySelector(`[data-dr-grain-panel="${grain}"]`);
      if (panel) {
        const anoms = panel.querySelector(".dr-anoms");
        if (anoms) anoms.insertAdjacentHTML("beforebegin", next);
        else panel.insertAdjacentHTML("beforeend", next);
      }
    }
  }

  function getDrGrain() {
    const norm = DR().normalizeGrain;
    let g = "week";
    if (S.drGrain === "day" || S.drGrain === "week" || S.drGrain === "month") {
      g = norm ? norm(S.drGrain) : S.drGrain;
    } else if (S.drBriefGrain === "day" || S.drBriefGrain === "week" || S.drBriefGrain === "month") {
      g = norm ? norm(S.drBriefGrain) : S.drBriefGrain;
    }
    return coerceDrGrain(g);
  }

  function drGrains() {
    const all = DR().GRAINS || ["day", "week"];
    const series = S.lastDailyReview && S.lastDailyReview.seriesByGrain;
    if (!series) return all;
    return all.filter((g) => !!series[g]);
  }

  function coerceDrGrain(grain) {
    const available = drGrains();
    if (available.includes(grain)) return grain;
    if (available.includes("week")) return "week";
    return available[0] || "week";
  }

  function renderDrGrainButtons(activeGrain, opts) {
    const cls = opts.btnClass;
    const attr = opts.grainAttr;
    const extra = opts.extraAttrs || "";
    const labels = { day: "日", week: "周", month: "月" };
    return drGrains().map((g) => (
      `<button type="button" class="btn btn-secondary btn-sm ${cls}${g === activeGrain ? " active" : ""}" ${attr}="${g}"${extra}>${labels[g] || g}</button>`
    )).join("");
  }

  function renderLinkedGrainToggle(activeGrain, opts) {
    const label = opts && opts.label;
    return `<div class="dr-grain-toggle" role="tablist" aria-label="粒度（全页联动）" data-dr-no-toggle>
      ${label ? `<span class="dr-grain-global-label config-muted">${esc(label)}</span>` : ""}
      ${renderDrGrainButtons(activeGrain, { btnClass: "dr-brief-grain-btn", grainAttr: "data-dr-brief-grain" })}
    </div>`;
  }

  function syncLinkedGrainButtons(grain) {
    const tab = $("tab-daily-review");
    if (!tab) return;
    const g = grain || getDrGrain();
    tab.querySelectorAll(".dr-brief-grain-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dr-brief-grain") === g);
    });
  }

  function syncPanel1GrainUi(grain) {
    const tab = $("tab-daily-review");
    if (!tab) return;
    tab.querySelectorAll("[data-dr-grain-panel]").forEach((p) => {
      p.classList.toggle("active", p.getAttribute("data-dr-grain-panel") === grain);
    });
  }

  function applyContribGrainSideEffects(result, grain) {
    if (!S.drContribFilter) return;
    S.drContribFilter.grain = grain;
    if (!(result.contributions[grain] || []).some((it) => it.metricId === S.drContribFilter.metricId)) {
      S.drContribFilter.metricId = pickDefaultContribMetric(result, grain);
    }
    const groups = Array.from(new Set(
      (result.contributions[grain] || [])
        .filter((it) => it.metricId === S.drContribFilter.metricId)
        .map((it) => it.decisionGroup)
    ));
    if (groups.length === 1) S.drContribFilter.decisionGroup = groups[0];
    else if (S.drContribFilter.decisionGroup !== "__all__" && !groups.includes(S.drContribFilter.decisionGroup)) {
      S.drContribFilter.decisionGroup = groups[0] || "__all__";
    }
    ensureContribGrain(result);
  }

  function applyPairwiseGrainSideEffects(result, grain) {
    if (!S.drPairwiseFilter) return;
    S.drPairwiseFilter.grain = grain;
    const pairs = result.pairwise[grain]?.pairs || [];
    const scope = S.drPairwiseFilter.scope === "all" ? "all" : "flipped";
    const hasMetric = scope === "all"
      ? pairs.some((p) => p.metricId === S.drPairwiseFilter.metricId)
      : pairs.some((p) => p.flipped && p.metricId === S.drPairwiseFilter.metricId);
    if (!hasMetric) {
      const flipped = pairs.filter((p) => p.flipped);
      const allowed = DR().listContribMetrics
        ? DR().listContribMetrics(result.config)
        : [];
      S.drPairwiseFilter.metricId = (scope === "all" ? pairs[0]?.metricId : flipped[0]?.metricId)
        || allowed[0]?.id || "";
    }
    ensurePwGrain(result);
  }

  /** Shared day|week grain. Any block's 日/周 switches every block. */
  function setDailyReviewGrain(grain) {
    let g = DR().normalizeGrain ? DR().normalizeGrain(grain) : (grain === "day" || grain === "month" ? grain : "week");
    g = coerceDrGrain(g);
    S.drGrain = g;
    S.drBriefGrain = g;
    const result = S.lastDailyReview;
    if (!result) return;

    syncPanel1GrainUi(g);
    mountGrainCharts(result, g);
    refreshBriefView(result);

    if (result.config.segmentCols?.length) {
      if (S.drContribFilter) {
        applyContribGrainSideEffects(result, g);
        renderContribToolbar(result);
        refreshContribView(result);
        refreshBriefView(result);
      }
      if (result.decisionGroups.length >= 2 && S.drPairwiseFilter) {
        applyPairwiseGrainSideEffects(result, g);
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
        refreshBriefView(result);
      }
    }
    if (S.drDetailFilter) {
      S.drDetailFilter.grain = g;
      renderDetailToolbar(result);
      refreshDetailView(result);
    }
    if (hasBinnedPanel(result) && S.drLevelFilter) {
      S.drLevelFilter.grain = g;
      if (!binnedFineSeries(result, g)) {
        S.drLevelFilter.segment = "__all__";
      }
      syncLevelSegState(result);
      renderLevelToolbar(result);
      refreshLevelView(result);
    }
    syncLinkedGrainButtons(g);
    renderSegmentToolbar(result);
  }

  function hasLevelPanel(result) {
    return !!result?.config?.levelCol;
  }

  function hasChangeNumPanel(result) {
    return !!result?.config?.levelChangeNumCol;
  }

  function hasBinnedPanel(result) {
    return hasLevelPanel(result) || hasChangeNumPanel(result);
  }

  function binnedFineSeries(result, grain) {
    return result?.seriesLevelDecFineByGrain?.[grain]
      || result?.seriesLevelChangeDecFineByGrain?.[grain]
      || null;
  }

  function resolveLevelAB(result) {
    return DR().resolveDecisionAB?.(result?.decisionGroups || []) || null;
  }

  /** Default left/right decisions: A/B if recognized, else first two groups (or same if only one). */
  function defaultLevelDecisions(result) {
    const groups = (result?.decisionGroups || []).map((g) => String(g));
    const ab = resolveLevelAB(result);
    if (ab?.a && ab?.b) return { a: String(ab.a), b: String(ab.b) };
    if (groups.length >= 2) return { a: groups[0], b: groups[1] };
    if (groups.length === 1) return { a: groups[0], b: groups[0] };
    return { a: "", b: "" };
  }

  function normalizeLevelDecisions(result, prevDecisions) {
    const groups = (result?.decisionGroups || []).map((g) => String(g));
    const defaults = defaultLevelDecisions(result);
    const prev = prevDecisions && typeof prevDecisions === "object" ? prevDecisions : {};
    const pick = (saved, fallback) => {
      const s = saved != null && saved !== "" ? String(saved) : "";
      if (s && groups.includes(s)) return s;
      return fallback;
    };
    return {
      a: pick(prev.a, defaults.a),
      b: pick(prev.b, defaults.b),
    };
  }

  function getLevelSideDecision(side) {
    ensureLevelFilter();
    const sideKey = side === "b" ? "b" : "a";
    return S.drLevelFilter.decisions?.[sideKey] || "";
  }

  function emptySidePeriodFilters() {
    return {
      a: { day: {}, week: {}, month: {} },
      b: { day: {}, week: {}, month: {} },
    };
  }

  function initLevelFilterState(result) {
    const grain = getDrGrain();
    const prev = S.drLevelFilter;
    const allCols = result.config?.segmentCols || [];
    const keepCols = (prev?.segmentCols || []).filter((c) => allCols.includes(c));
    let keepKeys = (prev?.segmentKeys || []).slice();
    if ((!keepKeys.length) && prev?.segment && prev.segment !== "__all__") {
      keepKeys = [prev.segment];
    }
    const decisions = normalizeLevelDecisions(result, prev?.decisions);
    let periodFilter = emptySidePeriodFilters();
    if (prev?.periodFilter?.a || prev?.periodFilter?.b) {
      periodFilter = {
        a: {
          day: { ...(prev.periodFilter.a?.day || {}) },
          week: { ...(prev.periodFilter.a?.week || {}) },
          month: { ...(prev.periodFilter.a?.month || {}) },
        },
        b: {
          day: { ...(prev.periodFilter.b?.day || {}) },
          week: { ...(prev.periodFilter.b?.week || {}) },
          month: { ...(prev.periodFilter.b?.month || {}) },
        },
      };
    } else if (prev?.periodFilter?.day || prev?.periodFilter?.week || prev?.periodFilter?.month) {
      // migrate legacy single filter → both sides
      const legacy = {
        day: { ...(prev.periodFilter.day || {}) },
        week: { ...(prev.periodFilter.week || {}) },
        month: { ...(prev.periodFilter.month || {}) },
      };
      periodFilter = { a: { ...legacy }, b: { day: { ...legacy.day }, week: { ...legacy.week }, month: { ...legacy.month } } };
    }
    S.drLevelFilter = {
      grain,
      segment: prev?.segment && prev.segment !== "__all__" ? prev.segment : "__all__",
      segmentCols: keepCols.length ? keepCols : allCols.slice(),
      segmentKeys: keepKeys,
      metricId: "risk",
      periodFilter,
      decisions,
      collapsedLevels: prev?.collapsedLevels && typeof prev.collapsedLevels === "object"
        ? { ...prev.collapsedLevels }
        : Object.create(null),
      collapsedChangeNums: prev?.collapsedChangeNums && typeof prev.collapsedChangeNums === "object"
        ? { ...prev.collapsedChangeNums }
        : Object.create(null),
    };
    syncLevelSegState(result);
  }

  function ensureLevelFilter() {
    if (!S.drLevelFilter) {
      S.drLevelFilter = {
        grain: getDrGrain(),
        segment: "__all__",
        segmentCols: [],
        segmentKeys: [],
        metricId: "risk",
        periodFilter: emptySidePeriodFilters(),
        decisions: { a: "", b: "" },
        collapsedLevels: Object.create(null),
        collapsedChangeNums: Object.create(null),
      };
    }
    if (!S.drLevelFilter.collapsedChangeNums || typeof S.drLevelFilter.collapsedChangeNums !== "object") {
      S.drLevelFilter.collapsedChangeNums = Object.create(null);
    }
    if (!S.drLevelFilter.periodFilter?.a || !S.drLevelFilter.periodFilter?.b) {
      S.drLevelFilter.periodFilter = emptySidePeriodFilters();
    }
    if (!S.drLevelFilter.decisions || typeof S.drLevelFilter.decisions !== "object") {
      S.drLevelFilter.decisions = { a: "", b: "" };
    }
  }

  function getLevelPeriodFilter(grain, periods, side) {
    ensureLevelFilter();
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    const sideKey = side === "b" ? "b" : "a";
    if (!S.drLevelFilter.periodFilter[sideKey]) S.drLevelFilter.periodFilter[sideKey] = { day: {}, week: {}, month: {} };
    const saved = S.drLevelFilter.periodFilter[sideKey][g] || {};
    const ps = periods || [];
    if (!ps.length) return { from: "", to: "" };
    let from = saved.from && ps.includes(saved.from) ? saved.from : ps[0];
    let to = saved.to && ps.includes(saved.to) ? saved.to : ps[ps.length - 1];
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    S.drLevelFilter.periodFilter[sideKey][g] = { from, to };
    return { from, to };
  }

  function syncLevelPeriodFilterFromDom(grain, side) {
    ensureLevelFilter();
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    const sideKey = side === "b" ? "b" : "a";
    const decision = getLevelSideDecision(sideKey);
    const fromEl = document.querySelector(`.dr-level-time-from[data-dr-level-side="${sideKey}"][data-dr-level-time-grain="${g}"]`);
    const toEl = document.querySelector(`.dr-level-time-to[data-dr-level-side="${sideKey}"][data-dr-level-time-grain="${g}"]`);
    const series = decision
      ? resolveBinnedSeries(S.lastDailyReview, g, S.drLevelFilter.segment, decision)
      : null;
    const periods = series?.periods || [];
    let from = fromEl?.value || "";
    let to = toEl?.value || "";
    if (!S.drLevelFilter.periodFilter[sideKey]) S.drLevelFilter.periodFilter[sideKey] = { day: {}, week: {}, month: {} };
    if (!periods.length) {
      S.drLevelFilter.periodFilter[sideKey][g] = { from: "", to: "" };
      return S.drLevelFilter.periodFilter[sideKey][g];
    }
    if (from && !periods.includes(from)) from = periods[0];
    if (to && !periods.includes(to)) to = periods[periods.length - 1];
    if (!from) from = periods[0];
    if (!to) to = periods[periods.length - 1];
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    if (fromEl && fromEl.value !== from) fromEl.value = from;
    if (toEl && toEl.value !== to) toEl.value = to;
    S.drLevelFilter.periodFilter[sideKey][g] = { from, to };
    return S.drLevelFilter.periodFilter[sideKey][g];
  }

  function renderLevelTimeFilter(grain, periods, side) {
    if (!periods?.length) return "";
    const sideKey = side === "b" ? "b" : "a";
    const filter = getLevelPeriodFilter(grain, periods, sideKey);
    return `<div class="dr-chart-time-filter dr-level-time-filter" data-dr-level-side="${sideKey}" data-dr-level-time-grain="${esc(grain)}">
      <span class="dr-chart-time-label">时间</span>
      <label>起 <select class="dr-level-time-from" data-dr-level-side="${sideKey}" data-dr-level-time-grain="${esc(grain)}">${
        periods.map((p) => `<option value="${esc(p)}"${p === filter.from ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
      }</select></label>
      <label>止 <select class="dr-level-time-to" data-dr-level-side="${sideKey}" data-dr-level-time-grain="${esc(grain)}">${
        periods.map((p) => `<option value="${esc(p)}"${p === filter.to ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
      }</select></label>
      <button type="button" class="btn btn-secondary btn-sm dr-level-time-reset" data-dr-level-side="${sideKey}" data-dr-level-time-grain="${esc(grain)}">重置</button>
      <span class="dr-chart-time-meta config-muted" data-dr-level-time-meta="${sideKey}-${esc(grain)}"></span>
    </div>`;
  }

  function renderLevelSideHeadHtml(side, groups, selected) {
    const sideKey = side === "b" ? "b" : "a";
    const paneLab = sideKey === "a" ? "左" : "右";
    let opts = "";
    for (const g of groups || []) {
      opts += `<option value="${esc(g)}"${g === selected ? " selected" : ""}>${esc(g)}</option>`;
    }
    return `<div class="dr-level-side-head">
      <label class="dr-level-decision-label">${paneLab} · 决策组
        <select class="dr-level-decision-select dr-panel1-seg-select" data-dr-level-side="${sideKey}" aria-label="${paneLab}栏决策组">${opts}</select>
      </label>
    </div>`;
  }

  function resolveLevelSegCols(result) {
    return sharedSegCols(result);
  }

  function listLevelSegValueKeys(result, st) {
    return sharedSegAvail(result, st?.grain || getDrGrain());
  }

  function resolveLevelSegKeys(result, st) {
    return sharedSegKeys(result, st?.grain || getDrGrain());
  }

  function syncLevelSegState(result) {
    if (!S.drLevelFilter || !result) return;
    S.drLevelFilter.segmentCols = resolveLevelSegCols(result, S.drLevelFilter);
    S.drLevelFilter.segmentKeys = resolveLevelSegKeys(result, S.drLevelFilter);
    const keys = S.drLevelFilter.segmentKeys;
    const avail = listLevelSegValueKeys(result, S.drLevelFilter);
    S.drLevelFilter.segment = (!keys.length || keys.length === avail.length)
      ? "__all__"
      : (keys.length === 1 ? keys[0] : "__all__");
  }

  function applyLevelSegmentCols(result, cols) {
    const st = S.drLevelFilter;
    if (!st || !result) return;
    const all = result.config?.segmentCols || [];
    const picked = (cols || []).filter((c) => all.includes(c));
    st.segmentCols = picked.length ? picked : all.slice();
    st.segmentKeys = [];
    syncLevelSegState(result);
  }

  function levelSegResolveOpts(result, st) {
    if (!st || !result) return {};
    return {
      segmentCols: resolveLevelSegCols(result, st),
      segmentKeys: resolveLevelSegKeys(result, st),
    };
  }

  function resolveBinnedSeries(result, grain, segment, decision, kind) {
    const k = kind || (hasLevelPanel(result) ? "level" : "changeNum");
    const st = S.drLevelFilter;
    const opts = levelSegResolveOpts(result, st);
    const key = segment || st?.segment || "__all__";
    return DR().resolveLevelSeries?.(result, grain, key, decision, k, opts);
  }

  function renderLevelSegColChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const picked = resolveLevelSegCols(result, st);
    const allOn = picked.length === cols.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群列</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-level-segcols="__all__" data-dr-view="level">全选</button>`;
    for (const c of cols) {
      const on = picked.includes(c);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-level-segcol="${esc(c)}" data-dr-view="level">${esc(c)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderLevelSegValueChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const avail = listLevelSegValueKeys(result, st);
    if (!avail.length) return "";
    const picked = resolveLevelSegKeys(result, st);
    const allOn = picked.length === avail.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-level-segkeys="__all__" data-dr-view="level">全选</button>`;
    for (const k of avail) {
      const on = picked.includes(k);
      const label = DR().formatSegmentShort({ segment: k }) || k;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-level-segkey="${esc(k)}" data-dr-view="level">${esc(label)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderLevelToolbar(result) {
    const el = $("drLevelToolbar");
    const st = S.drLevelFilter;
    if (!el || !st || !hasBinnedPanel(result)) return;
    const grain = coerceDrGrain(DR().normalizeGrain ? DR().normalizeGrain(st.grain || getDrGrain()) : (st.grain || getDrGrain()));
    st.grain = grain;
    st.metricId = "risk";
    syncLevelSegState(result);
    st.decisions = normalizeLevelDecisions(result, st.decisions);
    const groups = result.decisionGroups || [];

    let html = "";
    if (!groups.length) {
      html += `<p class="status warn" style="margin:.35rem 0 0">无决策组取值，无法展示 Level 贷后。</p>`;
    }
    el.innerHTML = html;
  }

  function levelEmptyReasonText(reason, levelCol) {
    if (reason === "need_level_col") return "未配置 Level 列。请在字段区选择后重跑。";
    if (reason === "need_change_num_col") return "未配置 level_change_num 列。请在字段区选择后重跑。";
    if (reason === "need_decision") return "未指定决策组。";
    if (reason === "no_series") return "当前粒度无该决策组分箱序列（请重跑日常检视）。";
    if (reason === "no_metrics") return "无可用贷后默认指标（需订单/金额风险等列）。";
    if (reason === "no_risk_metric") return "缺少订单风险指标，无法判定贷后成熟期。";
    if (reason === "no_risk_periods") return "所选时间范围内无风险成熟期次。";
    if (reason === "no_levels" || reason === "no_level_rows") {
      return levelCol ? `列「${levelCol}」分箱下无可用数据。` : "无分箱数据。";
    }
    return "暂无数据。";
  }

  function collapseStoreForKind(kind) {
    ensureLevelFilter();
    const rootKey = kind === "changeNum" ? "collapsedChangeNums" : "collapsedLevels";
    if (!S.drLevelFilter[rootKey] || typeof S.drLevelFilter[rootKey] !== "object") {
      S.drLevelFilter[rootKey] = Object.create(null);
    }
    return S.drLevelFilter[rootKey];
  }

  function renderLevelPostTableHtml(table, side, kind) {
    const binKind = kind || table?.binKind || "level";
    if (!table || table.emptyReason) {
      return `<p class="da-results-placeholder">${esc(levelEmptyReasonText(table?.emptyReason, table?.levelCol))}</p>`;
    }
    const metrics = table.metrics || [];
    const showMom = !!table.showMom;
    const sideKey = side === "b" ? "b" : "a";
    const collapsedRoot = collapseStoreForKind(binKind);
    if (!collapsedRoot[sideKey] || typeof collapsedRoot[sideKey] !== "object") {
      collapsedRoot[sideKey] = Object.create(null);
    }
    const collapsed = collapsedRoot[sideKey];
    const binHead = binKind === "changeNum" ? "level_change_num 分箱" : "Level 分箱";
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky" rowspan="1">${esc(binHead)}</th>`;
    html += `<th class="dr-detail-sticky dr-detail-period-col" rowspan="1">期次</th>`;
    for (const m of metrics) {
      html += `<th>${esc(DR().metricHeaderLabel?.(m) || m.name)}</th>`;
      if (showMom) html += `<th>Δ</th>`;
    }
    html += `</tr></thead><tbody>`;
    let lastLevel = null;
    for (const row of table.rows || []) {
      const kindRow = row.rowKind || "detail";
      const lv = row.levelKey;
      const isCol = collapsed[lv] !== false;
      if (kindRow === "detail" && isCol) continue;
      const trCls = kindRow === "subtotal" ? "dr-latest-subtotal" : (kindRow === "total" ? "dr-latest-total" : "");
      html += `<tr class="${trCls}">`;
      if (kindRow === "total") {
        html += `<td class="dr-detail-sticky" colspan="2"><span class="dr-row-kind-chip is-total">合计</span></td>`;
      } else if (kindRow === "subtotal") {
        html += `<td class="dr-detail-sticky">
          <button type="button" class="dr-latest-collapse-btn" data-dr-level-collapse="${esc(lv)}" data-dr-level-side="${sideKey}" data-dr-binned-kind="${esc(binKind)}" aria-expanded="${isCol ? "false" : "true"}">${isCol ? "▸" : "▾"}</button>
          ${esc(row.levelLabel || lv)}
        </td>`;
        html += `<td class="dr-detail-sticky dr-detail-period-col"><span class="dr-row-kind-chip is-subtotal">小计</span></td>`;
        lastLevel = null;
      } else {
        const showLv = (row.levelLabel || lv) !== lastLevel;
        lastLevel = row.levelLabel || lv;
        html += `<td class="dr-detail-sticky${showLv ? "" : " dr-detail-seg-repeat"}">${showLv ? esc(row.levelLabel || lv) : ""}</td>`;
        html += `<td class="dr-detail-sticky dr-detail-period-col">${esc(row.periodLabel || row.period)}</td>`;
      }
      const vals = row.vals || {};
      for (const m of metrics) {
        const cell = vals[m.id] || {};
        html += `<td class="num">${esc(DR().formatRate(cell.rate, m))}</td>`;
        if (showMom) {
          if (kindRow === "detail") {
            const dCls = deltaClass(cell.delta, m.direction);
            html += `<td class="num ${dCls}">${esc(DR().formatDelta(cell.delta, m))}</td>`;
          } else {
            html += `<td class="num config-muted">—</td>`;
          }
        }
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  function updateLevelTimeMeta(result, side, decision) {
    const sideKey = side === "b" ? "b" : "a";
    const st = S.drLevelFilter;
    if (!st || !decision) return;
    const grain = DR().normalizeGrain ? DR().normalizeGrain(st.grain) : st.grain;
    const series = resolveBinnedSeries(result, grain, st.segment, decision);
    const meta = document.querySelector(`[data-dr-level-time-meta="${sideKey}-${grain}"]`);
    if (!meta) return;
    if (!series?.periods?.length) {
      meta.textContent = "";
      return;
    }
    const filter = getLevelPeriodFilter(grain, series.periods, sideKey);
    let n = series.periods.length;
    if (filter.from || filter.to) {
      n = series.periods.filter((p) => {
        if (filter.from && p < filter.from) return false;
        if (filter.to && p > filter.to) return false;
        return true;
      }).length;
    }
    meta.textContent = `${n} / ${series.periods.length} 期`;
  }

  function renderBinnedFollowHead(side, decision) {
    const sideKey = side === "b" ? "b" : "a";
    const paneLab = sideKey === "a" ? "左" : "右";
    return `<div class="dr-level-side-head">
      <span class="config-muted">${paneLab} · 跟随 Level · ${esc(decision || "—")}</span>
    </div>`;
  }

  function refreshBinnedTable(result, side, decision, kind) {
    const sideKey = side === "b" ? "b" : "a";
    const hostSel = kind === "changeNum"
      ? `[data-dr-change-table="${sideKey}"]`
      : `[data-dr-level-table="${sideKey}"]`;
    const tableHost = document.querySelector(hostSel);
    const st = S.drLevelFilter;
    if (!tableHost || !st) return;
    if (!decision) {
      tableHost.innerHTML = `<p class="da-results-placeholder">无决策组</p>`;
      return;
    }
    const grain = coerceDrGrain(DR().normalizeGrain ? DR().normalizeGrain(st.grain || getDrGrain()) : (st.grain || getDrGrain()));
    const series = resolveBinnedSeries(result, grain, st.segment, decision, kind);
    const periods = series?.periods || [];
    const filter = getLevelPeriodFilter(grain, periods, sideKey);
    const table = DR().buildLevelPostTable(result, grain, {
      n: DR().DETAIL_LATEST_N_DEFAULT || 5,
      segmentKey: st.segment,
      segmentCols: resolveLevelSegCols(result, st),
      segmentKeys: resolveLevelSegKeys(result, st),
      decision,
      from: filter.from || "",
      to: filter.to || "",
      showMom: false,
      kind,
    });
    tableHost.innerHTML = renderLevelPostTableHtml(table, sideKey, kind);
    syncDetailTableSticky(tableHost);
  }

  function refreshLevelSide(result, side, decision) {
    const sideKey = side === "b" ? "b" : "a";
    const st = S.drLevelFilter;
    const grain = DR().normalizeGrain ? DR().normalizeGrain(st?.grain || getDrGrain()) : getDrGrain();
    const timeHost = document.querySelector(`[data-dr-level-time-host="${sideKey}"]`);
    if (!decision) {
      if (timeHost) timeHost.innerHTML = "";
      if (hasLevelPanel(result)) refreshBinnedTable(result, sideKey, "", "level");
      if (hasChangeNumPanel(result)) refreshBinnedTable(result, sideKey, "", "changeNum");
      return;
    }
    const series = resolveBinnedSeries(result, grain, st.segment, decision);
    const periods = series?.periods || [];
    if (timeHost) timeHost.innerHTML = renderLevelTimeFilter(grain, periods, sideKey);
    getLevelPeriodFilter(grain, periods, sideKey);
    updateLevelTimeMeta(result, sideKey, decision);
    if (hasLevelPanel(result)) refreshBinnedTable(result, sideKey, decision, "level");
    if (hasChangeNumPanel(result)) refreshBinnedTable(result, sideKey, decision, "changeNum");
  }

  function fillBinnedGrid(grid, result, opts) {
    const st = S.drLevelFilter;
    const groups = (result.decisionGroups || []).map((g) => String(g));
    if (!grid) return;
    if (!groups.length) {
      grid.innerHTML = `<p class="da-results-placeholder">无决策组取值，请确认决策组列后重跑。</p>`;
      return;
    }
    const decA = st.decisions.a;
    const decB = st.decisions.b;
    const showControls = !!opts.showControls;
    const kind = opts.kind;
    const tableAttr = kind === "changeNum" ? "data-dr-change-table" : "data-dr-level-table";
    if (!grid.querySelector("[data-dr-level-side-pane]")) {
      const sideHtml = (side, dec) => {
        const head = showControls
          ? renderLevelSideHeadHtml(side, groups, dec)
          : renderBinnedFollowHead(side, dec);
        const time = showControls ? `<div data-dr-level-time-host="${side}"></div>` : "";
        return `<div class="dr-level-side" data-dr-level-side-pane="${side}">
          ${head}
          ${time}
          <div ${tableAttr}="${side}"></div>
        </div>`;
      };
      grid.innerHTML = `${sideHtml("a", decA)}${sideHtml("b", decB)}`;
    } else {
      const ha = grid.querySelector('[data-dr-level-side-pane="a"] .dr-level-side-head');
      const hb = grid.querySelector('[data-dr-level-side-pane="b"] .dr-level-side-head');
      if (ha) {
        ha.outerHTML = showControls
          ? renderLevelSideHeadHtml("a", groups, decA)
          : renderBinnedFollowHead("a", decA);
      }
      if (hb) {
        hb.outerHTML = showControls
          ? renderLevelSideHeadHtml("b", groups, decB)
          : renderBinnedFollowHead("b", decB);
      }
    }
  }

  function refreshLevelView(result) {
    const st = S.drLevelFilter;
    if (!hasBinnedPanel(result)) return;
    if (!st) initLevelFilterState(result);
    const grain = coerceDrGrain(DR().normalizeGrain ? DR().normalizeGrain(st.grain || getDrGrain()) : (st.grain || getDrGrain()));
    st.grain = grain;
    st.decisions = normalizeLevelDecisions(result, st.decisions);
    const levelGrid = $("drLevelAbGrid");
    const changeGrid = $("drChangeNumAbGrid");
    if (hasLevelPanel(result) && levelGrid) {
      fillBinnedGrid(levelGrid, result, { kind: "level", showControls: true });
    }
    if (hasChangeNumPanel(result) && changeGrid) {
      fillBinnedGrid(changeGrid, result, {
        kind: "changeNum",
        showControls: !hasLevelPanel(result),
      });
    }
    refreshLevelSide(result, "a", st.decisions.a);
    refreshLevelSide(result, "b", st.decisions.b);
  }

  function renderResults(result) {
    const mount = $("drResultsMount");
    if (!mount || !result) return;
    initNarrativeFilterState();
    const activeGrain = getDrGrain();
    S.drGrain = activeGrain;
    S.drBriefGrain = activeGrain;
    const segKeys = result.panel1SegmentKeys || ["__all__"];
    if (!segKeys.includes(getPanel1Segment())) S.drPanel1Segment = "__all__";

    let html = `<div class="dr-results-document">`;

    // Executive brief
    html += `<div class="dr-block dr-brief-block" id="drBriefBlock">
      <div class="dr-block-head" data-dr-block-toggle="drBriefBlock" role="button" tabindex="0">
        <h2>总览点评</h2>
        ${renderLinkedGrainToggle(activeGrain, { label: "全页" })}
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body" id="drBriefMount"></div>
    </div>`;

    if ((result.config.segmentCols || []).length) {
      html += `<div class="dr-filter-toolbar" id="drSegmentToolbar" data-dr-view="segment"></div>`;
    }

    // Panel 1
    html += `<div class="dr-block" id="drPanel1">
      <div class="dr-block-head" data-dr-block-toggle="drPanel1" role="button" tabindex="0">
        <h2>1. 决策组环比</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">`;
    for (const grain of drGrains()) {
      html += `<div class="dr-grain-panel${grain === activeGrain ? " active" : ""}" data-dr-grain-panel="${grain}">`;
      html += renderPanel1GrainInner(result, grain);
      html += `</div>`;
    }
    html += `</div></div>`;

    // Panel 2 — metric detail pivot
    html += `<div class="dr-block" id="drPanel2">
      <div class="dr-block-head" data-dr-block-toggle="drPanel2" role="button" tabindex="0">
        <h2>2. 指标明细表</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">
      <div class="dr-detail-tabs" id="drDetailTabs" role="tablist" aria-label="明细表视图">
        <button type="button" class="dr-detail-tab" data-dr-detail-mode="all" role="tab">全期透视</button>
        <button type="button" class="dr-detail-tab" data-dr-detail-mode="pre" role="tab">贷前最新表现</button>
        <button type="button" class="dr-detail-tab" data-dr-detail-mode="post" role="tab">贷后最新表现</button>
      </div>
      <div class="dr-filter-toolbar" id="drDetailToolbar" data-dr-view="detail"></div>
      <div id="drDetailMount"></div>
      </div>
    </div>`;

    // 可见 3；内部 id 仍为 drPanel3
    html += `<div class="dr-block" id="drPanel3">
      <div class="dr-block-head" data-dr-block-toggle="drPanel3" role="button" tabindex="0">
        <h2>3. 客群贡献度（异动归因）</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">`;
    if (!result.config.segmentCols.length) {
      html += `<p class="da-results-placeholder">未配置客群维度，跳过本步。</p>`;
    } else {
      html += `<div class="dr-filter-toolbar" id="drContribToolbar" data-dr-view="contrib"></div>`;
      html += `<div id="drContribMount"></div>`;
    }
    html += `</div></div>`;

    // Panel 4
    html += `<div class="dr-block" id="drPanel4">
      <div class="dr-block-head" data-dr-block-toggle="drPanel4" role="button" tabindex="0">
        <h2>4. 组间同客群对比</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">`;
    if (!result.config.segmentCols.length || result.decisionGroups.length < 2) {
      html += `<p class="da-results-placeholder">需要 ≥2 个决策组取值且已选客群维度。</p>`;
    } else {
      html += `<div class="dr-filter-toolbar" id="drPairwiseToolbar" data-dr-view="pairwise"></div>`;
      html += `<div id="drPairwiseMount"></div>`;
    }
    html += `</div></div>`;

    // Panel 5 — Level 贷后（分箱 · 左右自选决策组）
    html += `<div class="dr-block" id="drPanel5">
      <div class="dr-block-head" data-dr-block-toggle="drPanel5" role="button" tabindex="0">
        <h2>5. Level 贷后</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="config-muted dr-grain-follow-hint">分箱 · 左右自选决策组</span>
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">`;
    if (!result.config.levelCol) {
      html += `<p class="da-results-placeholder">未配置 Level 列。在字段区选择（默认猜 level / 档位）后重跑。</p>`;
    } else {
      html += `<div class="dr-filter-toolbar" id="drLevelToolbar" data-dr-view="level"></div>`;
      html += `<div class="dr-level-ab-grid" id="drLevelAbGrid"></div>`;
    }
    html += `</div></div>`;

    // Panel 6 — level_change_num 贷后（与 Level 同构，共用筛选）
    html += `<div class="dr-block" id="drPanel6">
      <div class="dr-block-head" data-dr-block-toggle="drPanel6" role="button" tabindex="0">
        <h2>6. level_change_num 贷后</h2>
        ${renderLinkedGrainToggle(activeGrain)}
        <span class="config-muted dr-grain-follow-hint">分箱 · 筛选跟随 Level</span>
        <span class="dr-block-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="dr-block-body">`;
    if (!result.config.levelChangeNumCol) {
      html += `<p class="da-results-placeholder">未配置 level_change_num 列。在字段区选择（默认猜 level_change_num）后重跑。</p>`;
    } else {
      if (!result.config.levelCol) {
        html += `<div class="dr-filter-toolbar" id="drLevelToolbar" data-dr-view="level"></div>`;
      }
      html += `<div class="dr-level-ab-grid" id="drChangeNumAbGrid"></div>`;
    }
    html += `</div></div></div>`;

    mount.innerHTML = html;

    refreshBriefView(result);
    initSegmentFilterState(result);
    renderSegmentToolbar(result);
    initDetailFilterState(result);
    renderDetailToolbar(result);
    refreshDetailView(result);
    if (result.config.segmentCols.length) {
      initContribFilterState(result);
      renderContribToolbar(result);
      refreshContribView(result);
      refreshBriefView(result);
    }
    if (result.config.segmentCols.length && result.decisionGroups.length >= 2) {
      initPairwiseFilterState(result);
      renderPairwiseToolbar(result);
      refreshPairwiseView(result);
    }
    if (hasBinnedPanel(result)) {
      initLevelFilterState(result);
      renderLevelToolbar(result);
      refreshLevelView(result);
    }
    mountGrainCharts(result, activeGrain);
  }

  function getBriefForGrain(result, grain) {
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : (grain === "day" || grain === "month" ? grain : "week");
    if (result.briefByGrain?.[g]) return result.briefByGrain[g];
    return DR().buildExecutiveBrief(result, g);
  }

  function renderBriefSectionShell(title, secId, innerHtml) {
    return `<div class="dr-brief-section" id="${esc(secId)}">
      <h3 class="dr-brief-sec-title" data-dr-brief-sec-toggle="${esc(secId)}" role="button" tabindex="0">
        <span>${esc(title)}</span>
        <span class="dr-brief-sec-collapse-hint" aria-hidden="true"></span>
      </h3>
      <div class="dr-brief-sec-body">${innerHtml}</div>
    </div>`;
  }

  function renderBriefSection(title, section, opts) {
    const items = section?.items || [];
    const secId = opts?.secId || ("drBriefSec_" + String(title).replace(/\W+/g, "_"));
    let inner = "";
    if (!items.length) {
      inner = `<p class="dr-brief-empty">${esc(section?.empty || "暂无")}</p>`;
    } else {
      inner = `<ul class="dr-brief-list">`;
      for (const it of items) {
        const cls = opts?.itemClass?.(it) || "";
        inner += `<li class="${cls}">${esc(it.text)}</li>`;
      }
      inner += `</ul>`;
    }
    return renderBriefSectionShell(title, secId, inner);
  }

  function renderBriefAnomalySection(section) {
    const groups = section?.groups || [];
    const items = section?.items || [];
    let inner = "";
    if (!items.length) {
      inner = `<p class="dr-brief-empty">${esc(section?.empty || "暂无")}</p>`;
    } else if (!groups.length) {
      inner = `<ul class="dr-brief-list">`;
      for (const it of items) {
        inner += `<li class="${it.worse ? "dr-delta-bad" : "dr-delta-good"}">${esc(it.text)}</li>`;
      }
      inner += `</ul>`;
    } else {
      inner = `<div class="dr-brief-anom-groups">`;
      for (const g of groups) {
        inner += `<div class="dr-brief-anom-group">
          <div class="dr-brief-anom-group-head">${esc(g.group)}</div>`;
        if (g.worse?.length) {
          inner += `<div class="dr-brief-anom-side is-worse"><div class="dr-brief-anom-side-label">负面</div><ul class="dr-brief-list">`;
          for (const it of g.worse) {
            inner += `<li class="dr-delta-bad">${esc(it.text)}</li>`;
          }
          inner += `</ul></div>`;
        }
        if (g.better?.length) {
          inner += `<div class="dr-brief-anom-side is-better"><div class="dr-brief-anom-side-label">正面</div><ul class="dr-brief-list">`;
          for (const it of g.better) {
            inner += `<li class="dr-delta-good">${esc(it.text)}</li>`;
          }
          inner += `</ul></div>`;
        }
        inner += `</div>`;
      }
      inner += `</div>`;
    }
    return renderBriefSectionShell("2. 异动与归因", "drBriefSec_anomalies", inner);
  }

  function isBriefMetricFlat(m) {
    if (!m) return true;
    if (m.sentiment === "持平") return true;
    return m.delta == null || Math.abs(m.delta) < 1e-12;
  }

  function renderBriefMetricRow(m) {
    const metric = { name: m.metricName, direction: m.direction };
    const deltaCls = m.worse ? "dr-delta-bad" : (isBriefMetricFlat(m) ? "" : "dr-delta-good");
    const sentCls = m.worse
      ? "dr-brief-sent-bad"
      : (isBriefMetricFlat(m) ? "dr-brief-sent-flat" : "dr-brief-sent-good");
    const relTxt = DR().formatRelDelta(m.delta, m.prevRate);
    return `<div class="dr-brief-metric-row${isBriefMetricFlat(m) ? " is-flat" : ""}">
      <span class="dr-brief-m-name">${esc(m.metricName)}</span>
      <span class="dr-brief-m-delta ${deltaCls}">${esc(DR().formatDelta(m.delta, metric))}</span>
      <span class="dr-brief-m-rel">${relTxt ? esc("相对 " + relTxt) : ""}</span>
      <span class="dr-brief-m-rates">${esc(DR().formatRate(m.prevRate, metric))} → ${esc(DR().formatRate(m.rate, metric))}</span>
      <span class="dr-brief-m-sent ${sentCls}">${esc(m.sentiment || "")}</span>
    </div>`;
  }

  function renderBriefTrendSection(section) {
    const items = section?.items || [];
    let inner = "";
    if (!items.length) {
      inner = `<p class="dr-brief-empty">${esc(section?.empty || "暂无")}</p>`;
    } else {
      inner = `<div class="dr-brief-trend-cards">`;
      for (const it of items) {
        const metrics = it.metrics || [];
        const moved = metrics.filter((m) => !isBriefMetricFlat(m));
        const flat = metrics.filter((m) => isBriefMetricFlat(m));
        const primary = moved.length ? moved : metrics;
        const hideFlat = moved.length > 0 && flat.length > 0;
        const badN = it.worseCount || moved.filter((m) => m.worse).length;
        const headCls = badN > 0 ? "dr-brief-has-bad" : "";
        inner += `<div class="dr-brief-group-card" data-dr-brief-group="${esc(it.group)}">
          <div class="dr-brief-group-head ${headCls}">
            <span class="dr-brief-group-name">${esc(it.group)}</span>
            <span class="dr-brief-group-meta">${badN > 0 ? `负面 ${badN}` : (moved.length ? `变动 ${moved.length}` : "持平")}</span>
          </div>
          <div class="dr-brief-metric-rows">${primary.map(renderBriefMetricRow).join("")}</div>`;
        if (hideFlat) {
          inner += `<div class="dr-brief-flat-rows" hidden>${flat.map(renderBriefMetricRow).join("")}</div>
            <button type="button" class="btn btn-secondary btn-sm dr-brief-toggle-flat" data-dr-brief-flat-toggle>显示持平 ${flat.length}</button>`;
        }
        inner += `</div>`;
      }
      inner += `</div>`;
    }
    return `<div class="dr-brief-section dr-brief-trend" id="drBriefSec_trend">
      <h3 class="dr-brief-sec-title" data-dr-brief-sec-toggle="drBriefSec_trend" role="button" tabindex="0">
        <span>1. 分决策组走势</span>
        <span class="dr-brief-sec-collapse-hint" aria-hidden="true"></span>
      </h3>
      <div class="dr-brief-sec-body">${inner}</div>
    </div>`;
  }

  function refreshBriefView(result) {
    const mount = $("drBriefMount");
    if (!mount || !result) return;
    const grain = getDrGrain();
    const brief = getBriefForGrain(result, grain);
    const periodCtx = brief.periodContext;
    const periodTip = (periodCtx && periodCtx.tip)
      || "各指标：最新有值周 vs 上一有值周；短周时为有值周（短周）+ 上周 vs 上上周";
    const tipAttr = esc(periodTip).replace(/\n/g, "&#10;");
    const shortTips = brief.shortWeekTips || periodCtx?.shortWeekTips || [];
    const shortBanner = shortTips.length
      ? `<p class="dr-short-week-banner" role="status">${esc(shortTips[0])}</p>`
      : "";
    let html = `<div class="dr-brief-grain-bar" data-rv-tip="${tipAttr}">
      <p class="dr-brief-grain-hint config-muted rv-heading-with-hint">
        <span>口径：${esc(brief.grainLabel)}环比 · 绝对Δ + 相对%</span>
        <span class="rv-hint rv-tip-anchor dr-period-tip-trigger" tabindex="0" role="img" aria-label="各指标期次口径">ⓘ</span>
      </p>
      ${shortBanner}
    </div>`;
    html += renderBriefTrendSection(brief.trend);
    html += renderBriefAnomalySection(brief.anomalies);
    html += renderBriefSection("3. 组间翻转", brief.flips, { secId: "drBriefSec_flips" });
    mount.innerHTML = html;

    const block = $("tab-daily-review");
    if (block) syncLinkedGrainButtons(grain);
  }

  function pickDefaultContribMetric(result, grain) {
    const items = result.contributions[grain] || [];
    if (items.length) {
      const best = items.slice().sort((a, b) => Math.abs(b.anomaly?.delta || 0) - Math.abs(a.anomaly?.delta || 0))[0];
      if (best?.metricId) return best.metricId;
    }
    const allowed = DR().listContribMetrics
      ? DR().listContribMetrics(result.config)
      : (result.config.metrics || []).filter((m) => m && (m.id === "risk" || m.id === "amt_risk" || m.id === "curr_ticket"));
    return allowed[0]?.id || "";
  }

  function listDetailAvailableMetrics(result, mode) {
    const detail = result?.config?.detailMetrics || result?.config?.metrics || [];
    if (mode === "post") return DR().buildPostLatestMetrics(detail);
    if (mode === "pre") return DR().buildPreLatestMetrics(detail);
    return detail.slice();
  }

  /** Intersection with current tab metrics; empty → all available (at least one). */
  function resolveVisibleMetricIds(result, st, mode) {
    const available = listDetailAvailableMetrics(result, mode);
    const availIds = available.map((m) => m.id).filter(Boolean);
    const want = st?.visibleMetricIds || [];
    const picked = availIds.filter((id) => want.includes(id));
    return picked.length ? picked : availIds.slice();
  }

  function initDetailFilterState(result) {
    const grain = getDrGrain();
    const groups = (result.decisionGroups || []).slice();
    const prev = S.drDetailFilter;
    const selectedGroups = (prev?.groups || []).filter((g) => groups.includes(g));
    const segKeys = result.panel1SegmentKeys || ["__all__"];
    let segment = prev?.segment || "__all__";
    if (!segKeys.includes(segment)) segment = "__all__";
    const mode = prev?.mode === "pre" || prev?.mode === "post" ? prev.mode : "all";
    const defN = DR().DETAIL_LATEST_N_DEFAULT || 5;
    const allMetricIds = (result.config?.detailMetrics || result.config?.metrics || [])
      .map((m) => m && m.id)
      .filter(Boolean);
    const known = new Set(allMetricIds);
    let visibleMetricIds = (prev?.visibleMetricIds || []).filter((id) => known.has(id));
    if (!visibleMetricIds.length) visibleMetricIds = allMetricIds.slice();
    S.drDetailFilter = {
      grain,
      mode,
      groups: selectedGroups.length ? selectedGroups : groups.slice(),
      segment,
      showMom: prev?.showMom === true,
      preN: DR().clampLatestN(prev?.preN != null ? prev.preN : defN),
      postN: DR().clampLatestN(prev?.postN != null ? prev.postN : defN),
      visibleMetricIds,
      periodFilter: prev?.periodFilter && typeof prev.periodFilter === "object"
        ? {
          day: { ...(prev.periodFilter.day || {}) },
          week: { ...(prev.periodFilter.week || {}) },
          month: { ...(prev.periodFilter.month || {}) },
        }
        : { day: {}, week: {}, month: {} },
      detailSegCols: (() => {
        const all = result.config?.segmentCols || [];
        const keep = (prev?.detailSegCols || []).filter((c) => all.includes(c));
        return keep.length ? keep : all.slice();
      })(),
      detailSegKeys: (prev?.detailSegKeys || []).slice(),
      collapsedSegs: prev?.collapsedSegs && typeof prev.collapsedSegs === "object"
        ? { ...prev.collapsedSegs }
        : Object.create(null),
    };
    syncDetailSegState(result);
  }

  function detailSeriesPeriods(result, grain) {
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    return (result?.seriesByGrain?.[g]?.periods || []).slice();
  }

  function getDetailPeriodFilter(grain, periods) {
    if (!S.drDetailFilter) return { from: "", to: "" };
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    if (!S.drDetailFilter.periodFilter || typeof S.drDetailFilter.periodFilter !== "object") {
      S.drDetailFilter.periodFilter = { day: {}, week: {}, month: {} };
    }
    const saved = S.drDetailFilter.periodFilter[g] || {};
    const ps = periods || [];
    if (!ps.length) return { from: "", to: "" };
    let from = saved.from && ps.includes(saved.from) ? saved.from : ps[0];
    let to = saved.to && ps.includes(saved.to) ? saved.to : ps[ps.length - 1];
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    S.drDetailFilter.periodFilter[g] = { from, to };
    return { from, to };
  }

  function syncDetailPeriodFilterFromDom(grain, sourceEl) {
    if (!S.drDetailFilter) return { from: "", to: "" };
    const g = DR().normalizeGrain ? DR().normalizeGrain(grain) : grain;
    const wrap = sourceEl && sourceEl.closest ? sourceEl.closest(".dr-detail-time-filter") : null;
    const fromEl = (wrap && wrap.querySelector(".dr-detail-time-from"))
      || document.querySelector(`.dr-detail-time-from[data-dr-detail-time-grain="${g}"]`);
    const toEl = (wrap && wrap.querySelector(".dr-detail-time-to"))
      || document.querySelector(`.dr-detail-time-to[data-dr-detail-time-grain="${g}"]`);
    const periods = detailSeriesPeriods(S.lastDailyReview, g);
    if (!S.drDetailFilter.periodFilter) S.drDetailFilter.periodFilter = { day: {}, week: {}, month: {} };
    if (!fromEl && !toEl) return getDetailPeriodFilter(g, periods);
    let from = fromEl?.value || "";
    let to = toEl?.value || "";
    if (from && !periods.includes(from)) from = "";
    if (to && !periods.includes(to)) to = "";
    if (!from && periods.length) from = periods[0];
    if (!to && periods.length) to = periods[periods.length - 1];
    if (from && to && from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    if (fromEl && from) fromEl.value = from;
    if (toEl && to) toEl.value = to;
    S.drDetailFilter.periodFilter[g] = { from, to };
    return { from, to };
  }

  function resolveDetailSegCols(result) {
    return sharedSegCols(result);
  }

  function listDetailSegValueKeys(result, st) {
    return sharedSegAvail(result, st?.grain || getDrGrain());
  }

  function resolveDetailSegKeys(result, st) {
    return sharedSegKeys(result, st?.grain || getDrGrain());
  }

  function syncDetailSegState(result) {
    if (!S.drDetailFilter || !result) return;
    const cols = resolveDetailSegCols(result, S.drDetailFilter);
    S.drDetailFilter.detailSegCols = cols;
    S.drDetailFilter.detailSegKeys = resolveDetailSegKeys(result, S.drDetailFilter);
    const keys = S.drDetailFilter.detailSegKeys;
    const avail = listDetailSegValueKeys(result, S.drDetailFilter);
    S.drDetailFilter.segment = (!keys.length || keys.length === avail.length)
      ? "__all__"
      : (keys.length === 1 ? keys[0] : "__all__");
  }

  function renderDetailSegColChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const picked = resolveDetailSegCols(result, st);
    const allOn = picked.length === cols.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群列</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-detail-segcols="__all__" data-dr-view="detail">全选</button>`;
    for (const c of cols) {
      const on = picked.includes(c);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-detail-segcol="${esc(c)}" data-dr-view="detail">${esc(c)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderDetailSegValueChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const avail = listDetailSegValueKeys(result, st);
    if (!avail.length) return "";
    const picked = resolveDetailSegKeys(result, st);
    const allOn = picked.length === avail.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-detail-segkeys="__all__" data-dr-view="detail">全选</button>`;
    for (const k of avail) {
      const on = picked.includes(k);
      const label = DR().formatSegmentShort({ segment: k }) || k;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-detail-segkey="${esc(k)}" data-dr-view="detail">${esc(label)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderDetailTimeFilter(grain, periods) {
    const ps = periods || [];
    if (!ps.length) return "";
    const saved = getDetailPeriodFilter(grain, ps);
    const from = saved.from || ps[0];
    const to = saved.to || ps[ps.length - 1];
    let n = ps.length;
    if (from || to) {
      n = ps.filter((p) => {
        if (from && p < from) return false;
        if (to && p > to) return false;
        return true;
      }).length;
    }
    return `<div class="dr-filter-row">
      <span class="dr-filter-label">时间</span>
      <div class="dr-chart-time-filter dr-detail-time-filter" data-dr-detail-time-grain="${esc(grain)}">
        <label>起 <select class="dr-detail-time-from" data-dr-detail-time-grain="${esc(grain)}">${
          ps.map((p) => `<option value="${esc(p)}"${p === from ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
        }</select></label>
        <label>止 <select class="dr-detail-time-to" data-dr-detail-time-grain="${esc(grain)}">${
          ps.map((p) => `<option value="${esc(p)}"${p === to ? " selected" : ""}>${esc(DR().formatPeriodLabel(p, grain))}</option>`).join("")
        }</select></label>
        <button type="button" class="btn btn-secondary btn-sm dr-detail-time-reset" data-dr-detail-time-grain="${esc(grain)}">重置</button>
        <span class="config-muted">${n} / ${ps.length} 期</span>
      </div>
    </div>`;
  }

  function syncDetailTabUi() {
    const mode = S.drDetailFilter?.mode || "all";
    document.querySelectorAll("#drDetailTabs .dr-detail-tab").forEach((btn) => {
      const on = btn.getAttribute("data-dr-detail-mode") === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderDetailGroupChips(result, st, view) {
    const viewAttr = view || "detail";
    const groups = result.decisionGroups || [];
    const allOn = groups.length > 0 && groups.every((g) => st.groups.includes(g));
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">决策组</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-detail-groups="__all__" data-dr-view="${viewAttr}">全选</button>`;
    for (const g of groups) {
      const on = st.groups.includes(g);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-detail-group="${esc(g)}" data-dr-view="${viewAttr}">${esc(g)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  /** 指标明细表 — does not change config-area chart/anomaly metrics. */
  function renderDetailMetricChips(result, st, view, metricMode) {
    const viewAttr = view || "detail";
    const mode = metricMode || st.mode || "all";
    const available = listDetailAvailableMetrics(result, mode);
    if (!available.length) return "";
    const visible = new Set(resolveVisibleMetricIds(result, st, mode));
    const allOn = available.every((m) => visible.has(m.id));
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">显示指标</span>
      <div class="dr-chip-row dr-detail-metric-chips">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-detail-metrics="__all__" data-dr-view="${viewAttr}">全选</button>`;
    for (const m of available) {
      const on = visible.has(m.id);
      const label = DR().metricHeaderLabel ? DR().metricHeaderLabel(m) : (m.name || m.id);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-detail-metric="${esc(m.id)}" data-dr-view="${viewAttr}" title="${esc(m.id)}">${esc(label)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderDetailToolbar(result) {
    const el = $("drDetailToolbar");
    const st = S.drDetailFilter;
    if (!el || !st) return;
    syncDetailTabUi();
    const mode = st.mode || "all";

    if (mode === "pre" || mode === "post") {
      const nVal = mode === "pre" ? st.preN : st.postN;
      const nAttr = mode === "pre" ? "data-dr-detail-pren" : "data-dr-detail-postn";
      let html = renderDetailGroupChips(result, st);
      html += `<div class="dr-filter-row">
        <span class="dr-filter-label">近 N 期</span>
        <select id="drDetailLatestN" class="dr-panel1-seg-select" aria-label="近N期" ${nAttr}>`;
      for (const opt of [3, 5, 8, 12]) {
        html += `<option value="${opt}"${+nVal === opt ? " selected" : ""}>${opt}</option>`;
      }
      if (![3, 5, 8, 12].includes(+nVal)) {
        html += `<option value="${esc(String(nVal))}" selected>${esc(String(nVal))}</option>`;
      }
      html += `</select>
        <span class="config-muted dr-filter-hint">${mode === "post"
          ? "风险有值期；合计置顶（分周期+小计可折叠）；行=客群→期次"
          : "合计置顶（分周期+小计可折叠）；行=客群→期次；合计=勾选决策组"}</span>
      </div>`;
      html += `<div class="dr-filter-row">
        <span class="dr-filter-label">显示</span>
        <div class="dr-chip-row">
          <button type="button" class="dr-chip${st.showMom ? "" : " active"}" data-dr-detail-mom="0" data-dr-view="detail">水平</button>
          <button type="button" class="dr-chip${st.showMom ? " active" : ""}" data-dr-detail-mom="1" data-dr-view="detail">水平+环比</button>
        </div>
      </div>`;
      html += renderDetailMetricChips(result, st, "detail");
      el.innerHTML = html;
      return;
    }

    let html = renderDetailGroupChips(result, st, "detail");
    html += renderDetailTimeFilter(st.grain || getDrGrain(), detailSeriesPeriods(result, st.grain || getDrGrain()));

    html += `<div class="dr-filter-row">
      <span class="dr-filter-label">显示</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${st.showMom ? "" : " active"}" data-dr-detail-mom="0" data-dr-view="detail">水平</button>
        <button type="button" class="dr-chip${st.showMom ? " active" : ""}" data-dr-detail-mom="1" data-dr-view="detail">水平+环比</button>
      </div>
    </div>`;
    html += renderDetailMetricChips(result, st, "detail");
    el.innerHTML = html;
  }

  function renderDetailTableHtml(table) {
    const metrics = table.metrics || [];
    const groups = table.groups || [];
    const showMom = !!table.showMom;
    const diffMetrics = table.diffMetrics || [];
    const hasDiff = !!diffMetrics.length;
    const colsPerGroup = metrics.length * (showMom ? 2 : 1);
    if (!groups.length || !metrics.length) {
      return `<p class="config-muted">无决策组或指标可展示。</p>`;
    }
    if (!table.rows?.length) {
      return `<p class="config-muted">当前时间窗下无期次。</p>`;
    }

    let html = "";
    if (hasDiff && table.diffPair) {
      html += `<p class="config-muted dr-detail-diff-hint">diff=B−A（${esc(table.diffPair.b)}−${esc(table.diffPair.a)}）；只筛单侧决策组时仍显示</p>`;
    } else if (table.diffHint) {
      html += `<p class="config-muted dr-detail-diff-hint">${esc(table.diffHint)}</p>`;
    }
    html += `<div class="table-interactive-wrap dr-detail-table-wrap"><table class="data-table dr-detail-table">
      <thead>
        <tr>
          <th class="dr-detail-sticky" rowspan="2">期次</th>`;
    if (table.segmentLabel) {
      html += `<th class="dr-detail-sticky dr-detail-seg" rowspan="2">客群</th>`;
    }
    for (const g of groups) {
      html += `<th class="dr-detail-group-h" colspan="${colsPerGroup}">${esc(g)}</th>`;
    }
    if (hasDiff) {
      html += `<th class="dr-detail-group-h dr-detail-diff-h" colspan="${diffMetrics.length}">diff(B−A)</th>`;
    }
    html += `</tr><tr>`;
    for (const g of groups) {
      for (const m of metrics) {
        html += `<th class="dr-detail-metric-h">${esc(DR().metricHeaderLabel(m))}</th>`;
        if (showMom) html += `<th class="dr-detail-metric-h dr-detail-mom-h">Δ</th>`;
      }
    }
    if (hasDiff) {
      for (const dm of diffMetrics) {
        html += `<th class="dr-detail-metric-h dr-detail-diff-metric-h">${esc(dm.name)}</th>`;
      }
    }
    html += `</tr></thead><tbody>`;

    for (const row of table.rows) {
      const kind = row.rowKind || "detail";
      html += `<tr${kind === "total" ? ' class="dr-latest-total"' : ""}>`;
      if (kind === "total") {
        html += `<td class="dr-detail-sticky"><span class="dr-row-kind-chip is-total">合计</span></td>`;
      } else {
        html += `<td class="dr-detail-sticky">${esc(row.periodLabel || row.period)}</td>`;
      }
      if (table.segmentLabel) {
        html += `<td class="dr-detail-sticky dr-detail-seg">${kind === "total" ? "" : esc(table.segmentLabel)}</td>`;
      }
      for (const g of groups) {
        const vals = row.byGroup?.[g] || {};
        for (const m of metrics) {
          const cell = vals[m.id] || {};
          html += `<td>${esc(DR().formatRate(cell.rate, m))}</td>`;
          if (showMom) {
            if (kind === "total") {
              html += `<td class="config-muted">—</td>`;
            } else {
              const dCls = deltaClass(cell.delta, m.direction);
              html += `<td class="${dCls}">${esc(DR().formatDelta(cell.delta, m))}</td>`;
            }
          }
        }
      }
      if (hasDiff) {
        const dv = row.diffVals || {};
        for (const dm of diffMetrics) {
          const cell = dv[dm.id] || {};
          const base = dm.baseMetric || dm;
          const dCls = deltaClass(cell.rate, dm.direction || base.direction);
          html += `<td class="dr-latest-diff-cell ${dCls}">${esc(DR().formatDelta(cell.rate, base))}</td>`;
        }
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  function latestEmptyMessage(reason, mode) {
    const map = {
      need_segments: "请先配置客群维度并重跑日常检视。",
      need_fine_for_grain: "当前粒度缺少客群细表。请切到「周／日／月」后再看；若仍无数据请重新导出报告。",
      no_metrics: "当前指标集为空，请检查表头与默认指标。",
      no_segment_rows: "无可用客群行（Top 客群为空）。",
      no_groups: "请至少选择一个决策组。",
      no_risk_metric: "未配置风险指标，无法生成贷后最新表现。",
      no_risk_periods: "近窗内无风险有值期次（分母>0）。",
      no_periods: "无可用期次。",
    };
    if (map[reason]) return map[reason];
    return mode === "post" ? "暂无贷后最新表现数据。" : "暂无贷前最新表现数据。";
  }

  function renderSegmentLatestTableHtml(table) {
    const metrics = table.metrics || [];
    const groups = table.groups || [];
    const showMom = !!table.showMom;
    const diffMetrics = table.diffMetrics || [];
    const hasDiff = !!diffMetrics.length;
    const colsPerGroup = metrics.length * (showMom ? 2 : 1);
    const collapsed = S.drDetailFilter?.collapsedSegs || Object.create(null);
    if (table.emptyReason) {
      return `<p class="da-results-placeholder">${esc(latestEmptyMessage(table.emptyReason, table.mode))}</p>`;
    }
    if (!groups.length || !metrics.length) {
      return `<p class="config-muted">无决策组或指标可展示。</p>`;
    }
    if (!table.rows?.length) {
      return `<p class="config-muted">无客群×期次行。</p>`;
    }

    const periodMeta = table.mode === "all"
      ? `${table.periods?.length || 0} 期`
      : `近 ${esc(String(table.n))} 期`;
    let html = `<p class="config-muted dr-detail-latest-meta">${periodMeta} · 合计置顶（分周期+小计） · 行=客群→期次 · 列=勾选决策组 · 小计可折叠`;
    if (hasDiff && table.diffPair) {
      html += ` · diff=B−A（${esc(table.diffPair.b)}−${esc(table.diffPair.a)}）`;
    }
    html += `</p>`;
    if (table.diffHint) {
      html += `<p class="config-muted dr-detail-diff-hint">${esc(table.diffHint)}</p>`;
    }
    html += `<div class="table-interactive-wrap dr-detail-table-wrap dr-detail-latest-wrap"><table class="data-table dr-detail-table dr-detail-latest-table">
      <thead>
        <tr>
          <th class="dr-detail-sticky" rowspan="2">客群</th>
          <th class="dr-detail-sticky dr-detail-period-col" rowspan="2">期次</th>`;
    for (const g of groups) {
      html += `<th class="dr-detail-group-h" colspan="${colsPerGroup}">${esc(g)}</th>`;
    }
    if (hasDiff) {
      html += `<th class="dr-detail-group-h dr-detail-diff-h" colspan="${diffMetrics.length}">diff(B−A)</th>`;
    }
    html += `</tr><tr>`;
    for (const g of groups) {
      for (const m of metrics) {
        html += `<th class="dr-detail-metric-h">${esc(DR().metricHeaderLabel(m))}</th>`;
        if (showMom) html += `<th class="dr-detail-metric-h dr-detail-mom-h">Δ</th>`;
      }
    }
    if (hasDiff) {
      for (const dm of diffMetrics) {
        html += `<th class="dr-detail-metric-h dr-detail-diff-metric-h">${esc(dm.name)}</th>`;
      }
    }
    html += `</tr></thead><tbody>`;

    let lastSeg = null;
    for (const row of table.rows) {
      const kind = row.rowKind || "detail";
      const segKey = row.segmentKey || "";
      const isCollapsed = !!(segKey && collapsed[segKey]);
      if (kind === "detail" && isCollapsed) continue;

      const segLab = row.segmentLabel || segKey;
      let rowClass = "dr-latest-row";
      if (kind === "subtotal") rowClass += " dr-latest-subtotal";
      if (kind === "total") rowClass += " dr-latest-total";
      if (kind === "detail") rowClass += " dr-latest-detail";

      html += `<tr class="${rowClass}" data-dr-latest-kind="${esc(kind)}"${
        segKey && kind !== "total" ? ` data-dr-latest-seg="${esc(segKey)}"` : ""
      }>`;

      if (kind === "total") {
        const chevron = isCollapsed ? "▶" : "▼";
        const tip = isCollapsed ? "展开分周期合计" : "折叠分周期合计";
        html += `<td class="dr-detail-sticky">
          <button type="button" class="dr-latest-collapse-btn" data-dr-latest-collapse="${esc(segKey)}" title="${esc(tip)}" aria-expanded="${isCollapsed ? "false" : "true"}">${chevron}</button>
          ${esc(row.segmentLabel || "合计")}
        </td>`;
        html += `<td class="dr-detail-sticky dr-detail-period-col"><span class="dr-row-kind-chip is-total">小计</span><span class="config-muted dr-latest-total-hint">（当前勾选决策组）</span></td>`;
      } else if (kind === "subtotal") {
        const chevron = isCollapsed ? "▶" : "▼";
        const tip = isCollapsed ? "展开明细" : "折叠明细";
        html += `<td class="dr-detail-sticky">
          <button type="button" class="dr-latest-collapse-btn" data-dr-latest-collapse="${esc(segKey)}" title="${esc(tip)}" aria-expanded="${isCollapsed ? "false" : "true"}">${chevron}</button>
          ${esc(segLab)}
        </td>`;
        html += `<td class="dr-detail-sticky dr-detail-period-col"><span class="dr-row-kind-chip is-subtotal">小计</span></td>`;
      } else {
        const showSeg = segLab !== lastSeg;
        lastSeg = segLab;
        html += `<td class="dr-detail-sticky${showSeg ? "" : " dr-detail-seg-repeat"}">${showSeg ? esc(segLab) : ""}</td>`;
        html += `<td class="dr-detail-sticky dr-detail-period-col">${esc(row.periodLabel || row.period)}</td>`;
      }

      for (const g of groups) {
        const vals = row.byGroup?.[g] || {};
        for (const m of metrics) {
          const cell = vals[m.id] || {};
          html += `<td>${esc(DR().formatRate(cell.rate, m))}</td>`;
          if (showMom) {
            if (kind === "detail") {
              const dCls = deltaClass(cell.delta, m.direction);
              html += `<td class="${dCls}">${esc(DR().formatDelta(cell.delta, m))}</td>`;
            } else {
              html += `<td class="config-muted">—</td>`;
            }
          }
        }
      }
      if (hasDiff) {
        const dv = row.diffVals || {};
        for (const dm of diffMetrics) {
          const cell = dv[dm.id] || {};
          const base = dm.baseMetric || dm;
          const dCls = deltaClass(cell.rate, dm.direction || base.direction);
          html += `<td class="dr-latest-diff-cell ${dCls}">${esc(DR().formatDelta(cell.rate, base))}</td>`;
        }
      }
      html += `</tr>`;
      if (kind === "subtotal" || kind === "total") lastSeg = null;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  /** Align sticky left/top with real cell sizes (avoids 5.5rem / 1.85rem seam). */
  function syncDetailTableSticky(root) {
    const wrap = root && root.querySelector
      ? root.querySelector(".dr-detail-table-wrap")
      : null;
    if (!wrap) return;
    const table = wrap.querySelector(".dr-detail-table");
    const row1 = table && table.tHead && table.tHead.rows[0];
    if (!row1) return;
    const firstSticky = row1.querySelector("th.dr-detail-sticky");
    if (firstSticky) {
      wrap.style.setProperty("--dr-detail-col1-w", `${firstSticky.offsetWidth}px`);
    }
    // rowspan=2 sticky cells are full header height — measure a single-row group th
    const row1H = row1.querySelector(".dr-detail-group-h") || row1.querySelector("th:not([rowspan])");
    if (row1H) {
      wrap.style.setProperty("--dr-detail-thead-row1", `${row1H.offsetHeight}px`);
    }
  }

  function refreshDetailView(result) {
    const mount = $("drDetailMount");
    const st = S.drDetailFilter;
    if (!mount || !st || !result) return;
    const grain = DR().normalizeGrain ? DR().normalizeGrain(st.grain) : (st.grain === "day" || st.grain === "month" ? st.grain : "week");
    const mode = st.mode || "all";
    syncDetailTabUi();
    const metricIds = resolveVisibleMetricIds(result, st, mode);
    if (mode === "pre" || mode === "post") {
      syncDetailSegState(result);
      const table = DR().buildSegmentLatestTable(result, grain, {
        mode,
        n: mode === "pre" ? st.preN : st.postN,
        groups: st.groups,
        showMom: st.showMom,
        metricIds,
        segmentCols: resolveDetailSegCols(result, st),
        segmentKeys: resolveDetailSegKeys(result, st),
      });
      mount.innerHTML = renderSegmentLatestTableHtml(table);
      syncDetailTableSticky(mount);
      return;
    }
    const time = getDetailPeriodFilter(grain, detailSeriesPeriods(result, grain));
    syncDetailSegState(result);
    const table = DR().buildMetricDetailTable(result, grain, {
      groups: st.groups,
      segmentKey: st.segment,
      segmentCols: resolveDetailSegCols(result, st),
      segmentKeys: resolveDetailSegKeys(result, st),
      from: time.from || "",
      to: time.to || "",
      showMom: st.showMom,
      metricIds,
    });
    mount.innerHTML = renderDetailTableHtml(table);
    syncDetailTableSticky(mount);
  }

  function refreshDetailRelated(result) {
    renderDetailToolbar(result);
    refreshDetailView(result);
  }

  function initContribFilterState(result) {
    const grain = getDrGrain();
    const metricId = pickDefaultContribMetric(result, grain);
    const items = (result.contributions[grain] || []).filter((it) => it.metricId === metricId);
    const groups = Array.from(new Set(items.map((it) => it.decisionGroup)));
    const prev = S.drContribFilter;
    const allCols = result.config?.segmentCols || [];
    const keepCols = (prev?.segmentCols || []).filter((c) => allCols.includes(c));
    S.drContribFilter = {
      grain,
      metricId,
      decisionGroup: groups.length === 1 ? groups[0] : (groups[0] || "__all__"),
      segmentCols: keepCols.length ? keepCols : allCols.slice(),
      segmentKeys: (prev?.segmentKeys || []).slice(),
    };
  }

  function initPairwiseFilterState(result) {
    const grain = getDrGrain();
    const flipped = (result.pairwise[grain]?.pairs || []).filter((p) => p.flipped);
    const allowed = DR().listContribMetrics
      ? DR().listContribMetrics(result.config)
      : [];
    const metricId = flipped[0]?.metricId || allowed[0]?.id || "";
    const prev = S.drPairwiseFilter;
    const allCols = result.config?.segmentCols || [];
    const keepCols = (prev?.segmentCols || []).filter((c) => allCols.includes(c));
    S.drPairwiseFilter = {
      grain,
      metricId,
      scope: prev?.scope === "all" ? "all" : "flipped",
      segmentCols: keepCols.length ? keepCols : allCols.slice(),
      segmentKeys: (prev?.segmentKeys || []).slice(),
    };
  }

  function resolvePwSegCols(result) {
    return sharedSegCols(result);
  }

  function listPwSegValueKeys(result, st) {
    return sharedSegAvail(result, st?.grain || getDrGrain());
  }

  function resolvePwSegKeys(result, st) {
    return sharedSegKeys(result, st?.grain || getDrGrain());
  }

  function syncPwSegState(result) {
    if (!S.drPairwiseFilter || !result) return;
    S.drPairwiseFilter.segmentCols = resolvePwSegCols(result, S.drPairwiseFilter);
    S.drPairwiseFilter.segmentKeys = resolvePwSegKeys(result, S.drPairwiseFilter);
  }

  function ensurePwGrain(result) {
    const st = S.drPairwiseFilter;
    if (!st || !result) return;
    const cols = resolvePwSegCols(result, st);
    st.segmentCols = cols;
    if (DR().ensureSegmentPairwiseCompare) {
      DR().ensureSegmentPairwiseCompare(S.rawRows || [], result, st.grain, cols);
    } else if (S.rawRows?.length && DR().rebuildSegmentPairwiseCompare) {
      DR().rebuildSegmentPairwiseCompare(S.rawRows, result, st.grain, cols);
    }
    syncPwSegState(result);
  }

  function applyPwSegmentCols(result, cols) {
    const st = S.drPairwiseFilter;
    if (!st || !result) return;
    const all = result.config?.segmentCols || [];
    const picked = (cols || []).filter((c) => all.includes(c));
    st.segmentCols = picked.length ? picked : all.slice();
    st.segmentKeys = [];
    ensurePwGrain(result);
  }

  function pairMatchesSegKeys(item, result, st) {
    const keys = resolvePwSegKeys(result, st);
    const avail = listPwSegValueKeys(result, st);
    if (!keys.length || keys.length === avail.length) return true;
    const cols = resolvePwSegCols(result, st);
    const dimCols = result.pairwise?.[st.grain]?.segmentCols || result.config?.segmentCols || [];
    const k = DR().contribRowProjectKey
      ? DR().contribRowProjectKey(item, dimCols, cols)
      : (item.segment || "");
    return keys.includes(k);
  }

  function resolveContribSegCols(result) {
    return sharedSegCols(result);
  }

  function listVisibleContribItems(result, st) {
    let items = (result.contributions[st.grain] || []).filter((it) => it.metricId === st.metricId);
    if (st.decisionGroup && st.decisionGroup !== "__all__") {
      items = items.filter((it) => it.decisionGroup === st.decisionGroup);
    }
    return items;
  }

  function listContribSegValueKeys(result, st) {
    return sharedSegAvail(result, st?.grain || getDrGrain());
  }

  function resolveContribSegKeys(result, st) {
    return sharedSegKeys(result, st?.grain || getDrGrain());
  }

  function syncContribSegState(result) {
    if (!S.drContribFilter || !result) return;
    S.drContribFilter.segmentCols = resolveContribSegCols(result, S.drContribFilter);
    S.drContribFilter.segmentKeys = resolveContribSegKeys(result, S.drContribFilter);
  }

  function ensureContribGrain(result) {
    const st = S.drContribFilter;
    if (!st || !result) return;
    const cols = resolveContribSegCols(result, st);
    st.segmentCols = cols;
    if (DR().ensureContributionPanel) {
      DR().ensureContributionPanel(S.rawRows || [], result, st.grain, cols);
    } else if (S.rawRows?.length && DR().rebuildContributionPanel) {
      DR().rebuildContributionPanel(S.rawRows, result, st.grain, cols);
    }
    syncContribSegState(result);
  }

  function applyContribSegmentCols(result, cols) {
    const st = S.drContribFilter;
    if (!st || !result) return;
    const all = result.config?.segmentCols || [];
    const picked = (cols || []).filter((c) => all.includes(c));
    st.segmentCols = picked.length ? picked : all.slice();
    st.segmentKeys = [];
    ensureContribGrain(result);
  }

  function renderGrainMetricToolbar(toolbarId, state, result, opts) {
    const el = $(toolbarId);
    if (!el || !state) return;
    const metrics = opts.metrics || result.config.metrics || [];
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">指标</span>
      <div class="dr-chip-row">`;
    for (const m of metrics) {
      const has = opts.metricHasData?.(m.id, state.grain);
      html += `<button type="button" class="dr-chip${state.metricId === m.id ? " active" : ""}${has === false ? " is-empty" : ""}" data-dr-view-metric="${esc(m.id)}" data-dr-view="${opts.view}"${has === false ? ' title="当前粒度下无异动/翻转"' : ""}>${esc(m.name)}</button>`;
    }
    html += `</div></div>`;
    if (opts.showGroups) {
      const groups = opts.listGroups?.(state.metricId, state.grain) || [];
      if (groups.length > 1) {
        html += `<div class="dr-filter-row">
          <span class="dr-filter-label">决策组</span>
          <div class="dr-chip-row">
            <button type="button" class="dr-chip${state.decisionGroup === "__all__" ? " active" : ""}" data-dr-view-group="__all__" data-dr-view="${opts.view}">全部</button>`;
        for (const g of groups) {
          html += `<button type="button" class="dr-chip${state.decisionGroup === g ? " active" : ""}" data-dr-view-group="${esc(g)}" data-dr-view="${opts.view}">${esc(g)}</button>`;
        }
        html += `</div></div>`;
      }
    }
    el.innerHTML = html;
  }

  function renderContribSegColChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const picked = resolveContribSegCols(result, st);
    const allOn = picked.length === cols.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群列</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-contrib-segcols="__all__" data-dr-view="contrib">全选</button>`;
    for (const c of cols) {
      const on = picked.includes(c);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-contrib-segcol="${esc(c)}" data-dr-view="contrib">${esc(c)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderContribSegValueChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const avail = listContribSegValueKeys(result, st);
    if (!avail.length) return "";
    const picked = resolveContribSegKeys(result, st);
    const allOn = picked.length === avail.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-contrib-segkeys="__all__" data-dr-view="contrib">全选</button>`;
    for (const k of avail) {
      const on = picked.includes(k);
      const label = DR().formatSegmentShort({ segment: k }) || k;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-contrib-segkey="${esc(k)}" data-dr-view="contrib">${esc(label)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderContribToolbar(result) {
    const st = S.drContribFilter;
    if (!st) return;
    syncContribSegState(result);
    const metrics = DR().listContribMetrics
      ? DR().listContribMetrics(result.config)
      : (result.config.metrics || []).filter((m) => m && (m.id === "risk" || m.id === "amt_risk" || m.id === "curr_ticket"));
    renderGrainMetricToolbar("drContribToolbar", st, result, {
      view: "contrib",
      metrics,
      showGroups: true,
      metricHasData: (metricId, grain) =>
        (result.contributions[grain] || []).some((it) => it.metricId === metricId),
      listGroups: (metricId, grain) =>
        Array.from(new Set(
          (result.contributions[grain] || [])
            .filter((it) => it.metricId === metricId)
            .map((it) => it.decisionGroup)
        )),
    });
    const el = $("drContribToolbar");
    if (!el) return;
  }

  function renderPwSegColChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const picked = resolvePwSegCols(result, st);
    const allOn = picked.length === cols.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群列</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-pw-segcols="__all__" data-dr-view="pairwise">全选</button>`;
    for (const c of cols) {
      const on = picked.includes(c);
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-pw-segcol="${esc(c)}" data-dr-view="pairwise">${esc(c)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderPwSegValueChips(result, st) {
    const cols = result?.config?.segmentCols || [];
    if (!cols.length) return "";
    const avail = listPwSegValueKeys(result, st);
    if (!avail.length) return "";
    const picked = resolvePwSegKeys(result, st);
    const allOn = picked.length === avail.length;
    let html = `<div class="dr-filter-row">
      <span class="dr-filter-label">客群</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${allOn ? " active" : ""}" data-dr-pw-segkeys="__all__" data-dr-view="pairwise">全选</button>`;
    for (const k of avail) {
      const on = picked.includes(k);
      const label = DR().formatSegmentShort({ segment: k }) || k;
      html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-dr-pw-segkey="${esc(k)}" data-dr-view="pairwise">${esc(label)}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderPairwiseToolbar(result) {
    const st = S.drPairwiseFilter;
    if (!st) return;
    if (!st.scope) st.scope = "flipped";
    syncPwSegState(result);
    const metrics = DR().listContribMetrics
      ? DR().listContribMetrics(result.config)
      : (result.config.metrics || []).filter((m) => m && (m.id === "risk" || m.id === "amt_risk" || m.id === "curr_ticket"));
    renderGrainMetricToolbar("drPairwiseToolbar", st, result, {
      view: "pairwise",
      metrics,
      showGroups: false,
      metricHasData: (metricId, grain) => {
        const pairs = result.pairwise[grain]?.pairs || [];
        if (st.scope === "all") return pairs.some((p) => p.metricId === metricId);
        return pairs.some((p) => p.flipped && p.metricId === metricId);
      },
    });
    const el = $("drPairwiseToolbar");
    if (!el) return;
    const scope = st.scope === "all" ? "all" : "flipped";
    const scopedPairs = (result.pairwise[st.grain]?.pairs || []).filter((p) =>
      p.metricId === st.metricId && pairMatchesSegKeys(p, result, st)
    );
    const flipN = scopedPairs.filter((p) => p.flipped).length;
    el.innerHTML += `<div class="dr-filter-row">
      <span class="dr-filter-label">范围</span>
      <div class="dr-chip-row">
        <button type="button" class="dr-chip${scope === "flipped" ? " active" : ""}" data-dr-pw-scope="flipped" data-dr-view="pairwise">翻转</button>
        <button type="button" class="dr-chip${scope === "all" ? " active" : ""}" data-dr-pw-scope="all" data-dr-view="pairwise">全部</button>
        <span class="config-muted">翻转 ${flipN} / 共 ${scopedPairs.length}</span>
      </div>
    </div>`;
  }

  function pickPairwisePairs(result, st) {
    const pw = result.pairwise[st.grain] || { pairs: [] };
    let pairs = (pw.pairs || []).filter((p) => p.metricId === st.metricId);
    pairs = pairs.filter((p) => pairMatchesSegKeys(p, result, st));
    if (st.scope === "all") {
      pairs = pairs
        .slice()
        .sort((a, b) => Math.abs(b.latest?.diff || 0) - Math.abs(a.latest?.diff || 0))
        .slice(0, 12);
    } else {
      pairs = pairs.filter((p) => p.flipped).slice(0, 12);
    }
    return pairs;
  }

  function buildPairwiseChartSpec(pair, grain, result) {
    const hist = (DR().pairwiseHistoryForPair && result)
      ? DR().pairwiseHistoryForPair(result, grain, pair)
      : (pair.history || []);
    const metric = { name: pair.metricName };
    const asPct = !/件均|金额|均额/.test(pair.metricName || "");
    const gA = String(pair.groupA);
    const gB = String(pair.groupB);
    const colorMap = decisionGroupColorMap([gA, gB]);
    return {
      title: `${pair.segment} · ${pair.metricName}`,
      asPercent: asPct,
      categories: hist.map((h) => DR().formatPeriodLabel(h.period, grain)),
      formatValue: (v) => DR().formatRate(v, metric),
      series: [
        { name: gA, color: colorMap[gA], values: hist.map((h) => h.rateA) },
        { name: gB, color: colorMap[gB], values: hist.map((h) => h.rateB) },
      ],
    };
  }

  function mountPairwiseCharts(result, pairs) {
    const mount = $("drPairwiseMount");
    const st = S.drPairwiseFilter;
    if (!mount || !st || !pairs?.length) return;
    pairs.forEach((p, i) => {
      const host = mount.querySelector(`[data-dr-pw-chart="${i}"]`);
      if (!host) return;
      const hist = DR().pairwiseHistoryForPair
        ? DR().pairwiseHistoryForPair(result, st.grain, p)
        : (p.history || []);
      if (!hist.length) {
        host.textContent = "暂无趋势数据";
        return;
      }
      renderLineSeriesChart(host, buildPairwiseChartSpec(p, st.grain, result));
    });
  }

  function refreshPairwiseView(result) {
    const mount = $("drPairwiseMount");
    const st = S.drPairwiseFilter;
    if (!mount || !st) return;
    if (!st.scope) st.scope = "flipped";
    ensurePwGrain(result);
    const pw = result.pairwise[st.grain] || { pairs: [], narratives: [] };
    const allowed = DR().listContribMetrics
      ? DR().listContribMetrics(result.config)
      : [];
    if (!allowed.length) {
      mount.innerHTML = `<p class="config-muted">配置指标中无订单风险 / 金额风险 / 授信件均（缺列则跳过）。本步只对比这三项。</p>`;
      return;
    }
    const narratives = (pw.narratives || []).filter((n) =>
      n.metricId === st.metricId && pairMatchesSegKeys(n, result, st)
    );
    const pairs = pickPairwisePairs(result, st);
    let html = "";

    if (st.scope === "flipped") {
      if (narratives.length) {
        html += `<div class="dr-narratives"><h4>优劣翻转点评</h4><ul>${narratives.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul></div>`;
      } else {
        html += `<p class="config-muted">当前筛选下未检测到「历史优势近期翻转」。可切换「全部」查看同客群趋势。本步只对比订单风险 / 金额风险 / 授信件均。</p>`;
      }
    } else {
      html += `<p class="config-muted">展示同指标下 \|组间差\| 最大的至多 12 个客群趋势。</p>`;
    }

    if (!pairs.length) {
      if (st.scope !== "flipped" || narratives.length) {
        html += `<p class="config-muted">无可用客群对比序列。</p>`;
      }
      mount.innerHTML = html;
      return;
    }

    html += `<div class="dr-pw-grid">`;
    pairs.forEach((p, i) => {
      const flipTag = p.flipped ? `<span class="dr-pw-flip-tag">翻转</span>` : "";
      html += `<div class="dr-pw-card">
        <div class="dr-pw-card-head">
          <div class="dr-pw-card-title">${esc(DR().formatSegmentShort(p) || p.segment)}</div>
          ${flipTag}
        </div>
        <div class="dr-pw-card-meta config-muted">
          ${esc(p.groupA)} ${esc(DR().formatRate(p.latest?.rateA, { name: p.metricName }))}
          · ${esc(p.groupB)} ${esc(DR().formatRate(p.latest?.rateB, { name: p.metricName }))}
          · 历史 B 更优 ${(p.histShareBBetter * 100).toFixed(0)}%
        </div>
        <div class="dr-pw-chart-host" data-dr-pw-chart="${i}"></div>
      </div>`;
    });
    html += `</div>`;
    mount.innerHTML = html;
    mountPairwiseCharts(result, pairs);
  }

  function contribCardSortId(it) {
    return `${it.grain || ""}::${it.decisionGroup || ""}::${it.metricId || ""}`;
  }

  function getContribSortState(it) {
    if (!S.drContribSort) S.drContribSort = {};
    const id = contribCardSortId(it);
    return S.drContribSort[id] || { key: "contrib_abs", dir: "desc", type: "number" };
  }

  function cycleContribSortState(it, key, type) {
    if (!S.drContribSort) S.drContribSort = {};
    const id = contribCardSortId(it);
    const cur = S.drContribSort[id] || { key: null, dir: "asc", type: null };
    if (cur.key !== key) {
      S.drContribSort[id] = { key, dir: "desc", type };
    } else if (cur.dir === "desc") {
      S.drContribSort[id] = { key, dir: "asc", type };
    } else {
      S.drContribSort[id] = { key: "contrib_abs", dir: "desc", type: "number" };
    }
  }

  function compareContribSortValues(a, b, type) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (type === "number") {
      const na = +a;
      const nb = +b;
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    }
    return String(a).localeCompare(String(b), "zh");
  }

  function contribRowSortValue(row, key, dimCols) {
    if (key === "contrib_abs") return Math.abs(row.contrib_total || 0);
    if (key === "segment") return row.segment || "";
    if (key.startsWith("dim:")) {
      const i = +key.slice(4);
      let parts = row.segmentParts;
      if ((!parts || !parts.length) && dimCols?.length && RV.domain.attribution?.parseSegmentParts) {
        parts = RV.domain.attribution.parseSegmentParts(row.segment, dimCols);
      }
      return parts?.[i]?.label ?? "";
    }
    return row[key];
  }

  function sortContribRows(rows, sortState, dimCols) {
    const key = sortState?.key || "contrib_abs";
    const dir = sortState?.dir || "desc";
    const type = sortState?.type || "number";
    const mul = dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) =>
      compareContribSortValues(
        contribRowSortValue(a, key, dimCols),
        contribRowSortValue(b, key, dimCols),
        type
      ) * mul
    );
  }

  function thContribSortable(label, key, sortState, type, tip) {
    const active = sortState.key === key;
    const arrow = active ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
    const tipAttr = tip ? ` title="${esc(tip)}"` : "";
    return `<th class="th-sortable dr-contrib-th" data-sort-key="${esc(key)}" data-sort-type="${esc(type)}"${tipAttr}><button type="button" class="th-sort-btn">${esc(label)}${arrow}</button></th>`;
  }

  function fmtContribCount(v) {
    if (v == null || !Number.isFinite(+v)) return "—";
    return Math.round(+v).toLocaleString();
  }

  function renderContribRateCell(rate, num, den, metricName) {
    const main = esc(DR().formatRate(rate, { name: metricName }));
    const nd = `${fmtContribCount(num)} / ${fmtContribCount(den)}`;
    return `<td class="num dr-rate-cell"><div class="dr-rate-main">${main}</div><div class="dr-rate-nd">${esc(nd)}</div></td>`;
  }

  function filterContribRowsBySegKeys(it, st, result) {
    const rows = it.topSegments || [];
    const keys = resolveContribSegKeys(result, st);
    const avail = listContribSegValueKeys(result, st);
    if (!keys.length || keys.length === avail.length) return rows;
    const allow = new Set(keys);
    const cols = resolveContribSegCols(result, st);
    const dimCols = it.segmentCols || it.contrib?.dimCols || cols;
    return rows.filter((row) => {
      const k = DR().contribRowProjectKey
        ? DR().contribRowProjectKey(row, dimCols, cols)
        : (row.segment || "");
      return allow.has(k);
    });
  }

  function renderContribItemHtml(it) {
    const picked = S.drContribFilter
      ? resolveContribSegCols(S.lastDailyReview, S.drContribFilter)
      : [];
    const dimCols = picked.length ? picked : (it.segmentCols || it.contrib?.dimCols || []);
    const sortState = getContribSortState(it);
    const rows = sortContribRows(
      filterContribRowsBySegKeys(it, S.drContribFilter, S.lastDailyReview),
      sortState,
      dimCols
    );
    const cardId = contribCardSortId(it);
    const metric = { name: it.metricName };
    const rateLike = DR().isRateLikeMetric(metric);
    const unitTip = rateLike ? "单位：百分点（pp）" : "单位：与指标同量纲（件均不加 pp）";
    const head = it.narrativeHead || it.narrative || "";
    const sub = it.narrativeSub || "";
    const fullSeg = it.topSegments?.[0]?.segment || "";

    let html = `<div class="dr-contrib-card" data-dr-contrib-card="${esc(cardId)}">
      <div class="dr-contrib-summary" title="${esc(it.narrative || "")}">
        <div class="dr-contrib-sum-head">${esc(head)}</div>
        ${sub ? `<div class="dr-contrib-sum-sub" title="${esc(fullSeg)}">${esc(sub)}</div>` : ""}
      </div>
      <div class="table-interactive-wrap"><table class="data-table dr-contrib-table"><thead><tr>`;
    dimCols.forEach((col, i) => {
      html += thContribSortable(col, `dim:${i}`, sortState, "string");
    });
    if (!dimCols.length) {
      html += thContribSortable("客群", "segment", sortState, "string");
    }
    html += thContribSortable("基期比率", "rate_base", sortState, "number", "主行：比率；副行：分子/分母");
    html += thContribSortable("本期比率", "rate_cmp", sortState, "number", "主行：比率；副行：分子/分母");
    html += thContribSortable("合计贡献", "contrib_total", sortState, "number", `w比·r比 − w基·r基；${unitTip}`);
    html += thContribSortable("风险迁移", "contrib_migration", sortState, "number", `(r比 − r基) × w基；${unitTip}`);
    html += thContribSortable("结构效应", "contrib_structure", sortState, "number", `(w比 − w基) × r基；${unitTip}`);
    html += thContribSortable("交互效应", "contrib_interaction", sortState, "number", `(r比 − r基) × (w比 − w基)；${unitTip}`);
    html += thContribSortable("贡献%", "contrib_pct", sortState, "number", "该段合计贡献÷整体ΔR×100%");
    html += `</tr></thead><tbody>`;

    for (const row of rows) {
      html += "<tr>";
      if (dimCols.length) {
        dimCols.forEach((col, i) => {
          let parts = row.segmentParts;
          if ((!parts || !parts.length) && RV.domain.attribution?.parseSegmentParts) {
            parts = RV.domain.attribution.parseSegmentParts(row.segment, dimCols);
          }
          const label = parts?.[i]?.label ?? "—";
          html += `<td>${esc(label)}</td>`;
        });
      } else {
        html += `<td>${esc(row.segment || "—")}</td>`;
      }
      html += renderContribRateCell(row.rate_base, row.num_base, row.den_base, it.metricName);
      html += renderContribRateCell(row.rate_cmp, row.num_cmp, row.den_cmp, it.metricName);
      const totalCls = row.contrib_total < 0 ? "dr-delta-bad" : (row.contrib_total > 0 ? "dr-delta-good" : "");
      html += `<td class="num ${totalCls}">${esc(DR().formatContribDelta(row.contrib_total, metric))}</td>`;
      html += `<td class="num">${esc(DR().formatContribDelta(row.contrib_migration, metric))}</td>`;
      html += `<td class="num">${esc(DR().formatContribDelta(row.contrib_structure, metric))}</td>`;
      html += `<td class="num">${esc(DR().formatContribDelta(row.contrib_interaction, metric))}</td>`;
      html += `<td class="num">${row.contrib_pct != null ? Number(row.contrib_pct).toFixed(1) + "%" : "—"}</td>`;
      html += "</tr>";
    }
    html += `</tbody></table></div></div>`;
    return html;
  }

  function refreshContribView(result) {
    const mount = $("drContribMount");
    const st = S.drContribFilter;
    if (!mount || !st) return;
    ensureContribGrain(result);
    let items = (result.contributions[st.grain] || []).filter((it) => it.metricId === st.metricId);
    const groups = Array.from(new Set(items.map((it) => it.decisionGroup)));
    if (groups.length === 1) st.decisionGroup = groups[0];
    if (st.decisionGroup && st.decisionGroup !== "__all__") {
      items = items.filter((it) => it.decisionGroup === st.decisionGroup);
    }
    if (!items.length) {
      const allowed = DR().listContribMetrics
        ? DR().listContribMetrics(result.config)
        : [];
      const hint = allowed.length
        ? "当前筛选下无超过相对差阈值的异动，或无法分解。本步只拆订单风险 / 金额风险 / 授信件均。"
        : "配置指标中无订单风险 / 金额风险 / 授信件均（缺列则跳过）。";
      mount.innerHTML = `<p class="config-muted">${hint}</p>`;
      return;
    }
    mount.innerHTML = items.map(renderContribItemHtml).join("");
  }

  function applyViewFilterClick(btn) {
    const view = btn.getAttribute("data-dr-view");
    const result = S.lastDailyReview;
    if (!result || !view) return false;

    if (btn.classList.contains("dr-view-grain-btn")) {
      const grain = btn.getAttribute("data-dr-view-grain");
      setDailyReviewGrain(grain);
      return true;
    }

    if (view === "segment" && S.drSegmentFilter) {
      if (btn.hasAttribute("data-dr-segcols")) {
        applySharedSegCols(result, result.config?.segmentCols || []);
        return true;
      }
      if (btn.hasAttribute("data-dr-segcol")) {
        const col = btn.getAttribute("data-dr-segcol");
        const all = result.config?.segmentCols || [];
        const set = new Set(sharedSegCols(result));
        if (set.has(col)) set.delete(col);
        else set.add(col);
        applySharedSegCols(result, all.filter((c) => set.has(c)));
        return true;
      }
      if (btn.hasAttribute("data-dr-segkeys")) {
        S.drSegmentFilter.segmentKeys = [];
        refreshViewsForSegment(result, false);
        return true;
      }
      if (btn.hasAttribute("data-dr-segkey")) {
        const key = btn.getAttribute("data-dr-segkey");
        const avail = sharedSegAvail(result, getDrGrain());
        const set = new Set(sharedSegKeys(result, getDrGrain()));
        if (set.has(key)) set.delete(key);
        else set.add(key);
        const next = avail.filter((k) => set.has(k));
        S.drSegmentFilter.segmentKeys = next.length && next.length < avail.length ? next : [];
        refreshViewsForSegment(result, false);
        return true;
      }
    }

    if (btn.hasAttribute("data-dr-view-metric")) {
      const metricId = btn.getAttribute("data-dr-view-metric");
      if (view === "level") {
        return true;
      }
      if (view === "contrib") {
        S.drContribFilter.metricId = metricId;
        S.drContribFilter.segmentKeys = [];
        const groups = Array.from(new Set(
          (result.contributions[S.drContribFilter.grain] || [])
            .filter((it) => it.metricId === metricId)
            .map((it) => it.decisionGroup)
        ));
        if (groups.length === 1) S.drContribFilter.decisionGroup = groups[0];
        else if (S.drContribFilter.decisionGroup !== "__all__" && !groups.includes(S.drContribFilter.decisionGroup)) {
          S.drContribFilter.decisionGroup = groups[0] || "__all__";
        }
        renderContribToolbar(result);
        refreshContribView(result);
      } else if (view === "pairwise") {
        S.drPairwiseFilter.metricId = metricId;
        S.drPairwiseFilter.segmentKeys = [];
        syncPwSegState(result);
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
      }
      return true;
    }

    if (btn.hasAttribute("data-dr-view-group") && view === "contrib") {
      S.drContribFilter.decisionGroup = btn.getAttribute("data-dr-view-group");
      syncContribSegState(result);
      renderContribToolbar(result);
      refreshContribView(result);
      return true;
    }

    if (view === "contrib" && S.drContribFilter) {
      if (btn.hasAttribute("data-dr-contrib-segcols")) {
        applyContribSegmentCols(result, result.config?.segmentCols || []);
        renderContribToolbar(result);
        refreshContribView(result);
        refreshBriefView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-contrib-segcol")) {
        const col = btn.getAttribute("data-dr-contrib-segcol");
        const all = result.config?.segmentCols || [];
        const set = new Set(resolveContribSegCols(result, S.drContribFilter));
        if (set.has(col)) {
          if (set.size > 1) set.delete(col);
        } else {
          set.add(col);
        }
        applyContribSegmentCols(result, all.filter((c) => set.has(c)));
        renderContribToolbar(result);
        refreshContribView(result);
        refreshBriefView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-contrib-segkeys")) {
        S.drContribFilter.segmentKeys = listContribSegValueKeys(result, S.drContribFilter);
        syncContribSegState(result);
        renderContribToolbar(result);
        refreshContribView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-contrib-segkey")) {
        const key = btn.getAttribute("data-dr-contrib-segkey");
        const avail = listContribSegValueKeys(result, S.drContribFilter);
        const set = new Set(resolveContribSegKeys(result, S.drContribFilter));
        if (set.has(key)) {
          if (set.size > 1) set.delete(key);
        } else {
          set.add(key);
        }
        S.drContribFilter.segmentKeys = avail.filter((k) => set.has(k));
        if (!S.drContribFilter.segmentKeys.length) S.drContribFilter.segmentKeys = avail.slice();
        syncContribSegState(result);
        renderContribToolbar(result);
        refreshContribView(result);
        return true;
      }
    }

    if (view === "detail" && S.drDetailFilter) {
      if (btn.hasAttribute("data-dr-detail-groups")) {
        S.drDetailFilter.groups = (result.decisionGroups || []).slice();
        refreshDetailRelated(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-detail-group")) {
        const g = btn.getAttribute("data-dr-detail-group");
        const set = new Set(S.drDetailFilter.groups || []);
        if (set.has(g)) {
          if (set.size > 1) set.delete(g);
        } else {
          set.add(g);
        }
        S.drDetailFilter.groups = (result.decisionGroups || []).filter((x) => set.has(x));
        if (!S.drDetailFilter.groups.length) {
          S.drDetailFilter.groups = (result.decisionGroups || []).slice();
        }
        refreshDetailRelated(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-detail-mom")) {
        S.drDetailFilter.showMom = btn.getAttribute("data-dr-detail-mom") === "1";
        refreshDetailRelated(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-detail-metrics")) {
        const mode = S.drDetailFilter.mode || "all";
        const availIds = listDetailAvailableMetrics(result, mode).map((m) => m.id).filter(Boolean);
        const keep = (S.drDetailFilter.visibleMetricIds || []).filter((id) => !availIds.includes(id));
        S.drDetailFilter.visibleMetricIds = keep.concat(availIds);
        refreshDetailRelated(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-detail-metric")) {
        const id = btn.getAttribute("data-dr-detail-metric");
        const mode = S.drDetailFilter.mode || "all";
        const availIds = listDetailAvailableMetrics(result, mode).map((m) => m.id).filter(Boolean);
        const set = new Set(S.drDetailFilter.visibleMetricIds || []);
        // Ensure current-tab defaults are materialized before toggle
        if (!availIds.some((x) => set.has(x))) {
          for (const x of availIds) set.add(x);
        }
        if (set.has(id)) {
          const still = availIds.filter((x) => set.has(x) && x !== id);
          if (still.length) set.delete(id);
        } else {
          set.add(id);
        }
        S.drDetailFilter.visibleMetricIds = Array.from(set);
        refreshDetailRelated(result);
        return true;
      }
      if (view === "detail" && btn.hasAttribute("data-dr-detail-segcols")) {
        S.drDetailFilter.detailSegCols = (result.config?.segmentCols || []).slice();
        S.drDetailFilter.detailSegKeys = [];
        syncDetailSegState(result);
        renderDetailToolbar(result);
        refreshDetailView(result);
        return true;
      }
      if (view === "detail" && btn.hasAttribute("data-dr-detail-segcol")) {
        const col = btn.getAttribute("data-dr-detail-segcol");
        const all = result.config?.segmentCols || [];
        const set = new Set(resolveDetailSegCols(result, S.drDetailFilter));
        if (set.has(col)) {
          if (set.size > 1) set.delete(col);
        } else {
          set.add(col);
        }
        S.drDetailFilter.detailSegCols = all.filter((c) => set.has(c));
        if (!S.drDetailFilter.detailSegCols.length) {
          S.drDetailFilter.detailSegCols = all.slice();
        }
        S.drDetailFilter.detailSegKeys = [];
        syncDetailSegState(result);
        renderDetailToolbar(result);
        refreshDetailView(result);
        return true;
      }
      if (view === "detail" && btn.hasAttribute("data-dr-detail-segkeys")) {
        S.drDetailFilter.detailSegKeys = listDetailSegValueKeys(result, S.drDetailFilter);
        syncDetailSegState(result);
        renderDetailToolbar(result);
        refreshDetailView(result);
        return true;
      }
      if (view === "detail" && btn.hasAttribute("data-dr-detail-segkey")) {
        const key = btn.getAttribute("data-dr-detail-segkey");
        const avail = listDetailSegValueKeys(result, S.drDetailFilter);
        const set = new Set(resolveDetailSegKeys(result, S.drDetailFilter));
        if (set.has(key)) {
          if (set.size > 1) set.delete(key);
        } else {
          set.add(key);
        }
        S.drDetailFilter.detailSegKeys = avail.filter((k) => set.has(k));
        if (!S.drDetailFilter.detailSegKeys.length) {
          S.drDetailFilter.detailSegKeys = avail.slice();
        }
        syncDetailSegState(result);
        renderDetailToolbar(result);
        refreshDetailView(result);
        return true;
      }
    }

    if (view === "pairwise" && S.drPairwiseFilter) {
      if (btn.hasAttribute("data-dr-pw-segcols")) {
        applyPwSegmentCols(result, result.config?.segmentCols || []);
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
        refreshBriefView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-pw-segcol")) {
        const col = btn.getAttribute("data-dr-pw-segcol");
        const all = result.config?.segmentCols || [];
        const set = new Set(resolvePwSegCols(result, S.drPairwiseFilter));
        if (set.has(col)) {
          if (set.size > 1) set.delete(col);
        } else {
          set.add(col);
        }
        applyPwSegmentCols(result, all.filter((c) => set.has(c)));
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
        refreshBriefView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-pw-segkeys")) {
        S.drPairwiseFilter.segmentKeys = listPwSegValueKeys(result, S.drPairwiseFilter);
        syncPwSegState(result);
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-pw-segkey")) {
        const key = btn.getAttribute("data-dr-pw-segkey");
        const avail = listPwSegValueKeys(result, S.drPairwiseFilter);
        const set = new Set(resolvePwSegKeys(result, S.drPairwiseFilter));
        if (set.has(key)) {
          if (set.size > 1) set.delete(key);
        } else {
          set.add(key);
        }
        S.drPairwiseFilter.segmentKeys = avail.filter((k) => set.has(k));
        if (!S.drPairwiseFilter.segmentKeys.length) S.drPairwiseFilter.segmentKeys = avail.slice();
        syncPwSegState(result);
        renderPairwiseToolbar(result);
        refreshPairwiseView(result);
        return true;
      }
    }

    if (view === "level" && S.drLevelFilter) {
      if (btn.hasAttribute("data-dr-level-segcols")) {
        applyLevelSegmentCols(result, result.config?.segmentCols || []);
        renderLevelToolbar(result);
        refreshLevelView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-level-segcol")) {
        const col = btn.getAttribute("data-dr-level-segcol");
        const all = result.config?.segmentCols || [];
        const set = new Set(resolveLevelSegCols(result, S.drLevelFilter));
        if (set.has(col)) {
          if (set.size > 1) set.delete(col);
        } else {
          set.add(col);
        }
        applyLevelSegmentCols(result, all.filter((c) => set.has(c)));
        renderLevelToolbar(result);
        refreshLevelView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-level-segkeys")) {
        S.drLevelFilter.segmentKeys = listLevelSegValueKeys(result, S.drLevelFilter);
        syncLevelSegState(result);
        renderLevelToolbar(result);
        refreshLevelView(result);
        return true;
      }
      if (btn.hasAttribute("data-dr-level-segkey")) {
        const key = btn.getAttribute("data-dr-level-segkey");
        const avail = listLevelSegValueKeys(result, S.drLevelFilter);
        const set = new Set(resolveLevelSegKeys(result, S.drLevelFilter));
        if (set.has(key)) {
          if (set.size > 1) set.delete(key);
        } else {
          set.add(key);
        }
        S.drLevelFilter.segmentKeys = avail.filter((k) => set.has(k));
        if (!S.drLevelFilter.segmentKeys.length) S.drLevelFilter.segmentKeys = avail.slice();
        syncLevelSegState(result);
        renderLevelToolbar(result);
        refreshLevelView(result);
        return true;
      }
    }

    if (btn.hasAttribute("data-dr-pw-scope") && view === "pairwise") {
      const scope = btn.getAttribute("data-dr-pw-scope") === "all" ? "all" : "flipped";
      S.drPairwiseFilter.scope = scope;
      const pairs = result.pairwise[S.drPairwiseFilter.grain]?.pairs || [];
      const hasMetric = scope === "all"
        ? pairs.some((p) => p.metricId === S.drPairwiseFilter.metricId)
        : pairs.some((p) => p.flipped && p.metricId === S.drPairwiseFilter.metricId);
      if (!hasMetric) {
        const flipped = pairs.filter((p) => p.flipped);
        const allowed = DR().listContribMetrics
          ? DR().listContribMetrics(result.config)
          : [];
        S.drPairwiseFilter.metricId = (scope === "all" ? pairs[0]?.metricId : flipped[0]?.metricId)
          || allowed[0]?.id || "";
      }
      renderPairwiseToolbar(result);
      refreshPairwiseView(result);
      return true;
    }
    return false;
  }

  async function runDailyReviewFromUi() {
    if (S.dailyReviewBusy || !S.rawRows.length) return;
    const cfg = getDailyReviewConfig();
    const errs = validateDailyReviewConfig(cfg);
    if (errs.length) {
      setDrAnalysisStatus(errs[0], "err");
      RV.events?.notify?.(errs[0], "err");
      return;
    }
    S.dailyReviewBusy = true;
    const btn = $("btnRunDailyReview");
    if (btn) btn.disabled = true;
    setDrAnalysisStatus("计算中…");
    try {
      await new Promise((r) => setTimeout(r, 0));
      const result = DR().runDailyReview(S.rawRows, cfg);
      S.lastDailyReview = result;
      renderResults(result);
      clearDailyReviewResultsStale();
      setDrAnalysisStatus("完成", "ok");
      CP()?.setPanelsCollapsed?.(
        ["drPanelFields", "drPanelMetrics", "drPanelSegments"],
        true
      );
    } catch (err) {
      console.error(err);
      setDrAnalysisStatus("失败：" + (err.message || err), "err");
    } finally {
      S.dailyReviewBusy = false;
      if (btn) btn.disabled = !S.rawRows.length;
    }
  }

  function snapshotDailyReviewUiState() {
    if (!$("tab-daily-review")) return null;
    return {
      config: getDailyReviewConfig(),
      stale: !!S.dailyReviewResultsStale,
      hasResult: !!S.lastDailyReview,
      grain: getDrGrain(),
      panel1Segment: "__all__",
      segmentFilter: S.drSegmentFilter
        ? {
          segmentCols: (S.drSegmentFilter.segmentCols || []).slice(),
          segmentKeys: (S.drSegmentFilter.segmentKeys || []).slice(),
        }
        : null,
      chartPeriodFilter: S.drChartPeriodFilter
        ? {
          day: { ...(S.drChartPeriodFilter.day || {}) },
          week: { ...(S.drChartPeriodFilter.week || {}) },
          month: { ...(S.drChartPeriodFilter.month || {}) },
        }
        : null,
      cardPeriodFilter: S.drCardPeriodFilter
        ? {
          day: { ...(S.drCardPeriodFilter.day || {}) },
          week: { ...(S.drCardPeriodFilter.week || {}) },
          month: { ...(S.drCardPeriodFilter.month || {}) },
        }
        : null,
      narrativeFilter: S.drNarrativeFilter ? { ...S.drNarrativeFilter } : null,
      contribFilter: S.drContribFilter
        ? {
          ...S.drContribFilter,
          segmentCols: (S.drContribFilter.segmentCols || []).slice(),
          segmentKeys: (S.drContribFilter.segmentKeys || []).slice(),
        }
        : null,
      pairwiseFilter: S.drPairwiseFilter
        ? {
          ...S.drPairwiseFilter,
          segmentCols: (S.drPairwiseFilter.segmentCols || []).slice(),
          segmentKeys: (S.drPairwiseFilter.segmentKeys || []).slice(),
        }
        : null,
      detailFilter: S.drDetailFilter
        ? {
          ...S.drDetailFilter,
          groups: (S.drDetailFilter.groups || []).slice(),
          periodFilter: S.drDetailFilter.periodFilter
            ? {
              day: { ...(S.drDetailFilter.periodFilter.day || {}) },
              week: { ...(S.drDetailFilter.periodFilter.week || {}) },
              month: { ...(S.drDetailFilter.periodFilter.month || {}) },
            }
            : { day: {}, week: {}, month: {} },
          detailSegCols: (S.drDetailFilter.detailSegCols || []).slice(),
          detailSegKeys: (S.drDetailFilter.detailSegKeys || []).slice(),
        }
        : null,
      contribSort: S.drContribSort ? { ...S.drContribSort } : null,
      levelFilter: S.drLevelFilter
        ? {
          ...S.drLevelFilter,
          metricId: "risk",
          segmentCols: (S.drLevelFilter.segmentCols || []).slice(),
          segmentKeys: (S.drLevelFilter.segmentKeys || []).slice(),
          decisions: {
            a: S.drLevelFilter.decisions?.a || "",
            b: S.drLevelFilter.decisions?.b || "",
          },
          periodFilter: S.drLevelFilter.periodFilter
            ? {
              a: {
                day: { ...(S.drLevelFilter.periodFilter.a?.day || {}) },
                week: { ...(S.drLevelFilter.periodFilter.a?.week || {}) },
                month: { ...(S.drLevelFilter.periodFilter.a?.month || {}) },
              },
              b: {
                day: { ...(S.drLevelFilter.periodFilter.b?.day || {}) },
                week: { ...(S.drLevelFilter.periodFilter.b?.week || {}) },
                month: { ...(S.drLevelFilter.periodFilter.b?.month || {}) },
              },
            }
            : emptySidePeriodFilters(),
          collapsedLevels: S.drLevelFilter.collapsedLevels
            ? { ...S.drLevelFilter.collapsedLevels }
            : Object.create(null),
          collapsedChangeNums: S.drLevelFilter.collapsedChangeNums
            ? { ...S.drLevelFilter.collapsedChangeNums }
            : Object.create(null),
        }
        : null,
    };
  }

  async function restoreDailyReviewUiState(prior) {
    if (!prior?.config || !$("tab-daily-review")) return;
    const cfg = prior.config;
    if (cfg.timeCol && $("drTimeCol")) $("drTimeCol").value = cfg.timeCol;
    if (cfg.decisionCol && $("drDecisionCol")) $("drDecisionCol").value = cfg.decisionCol;
    if ($("drLevelCol")) $("drLevelCol").value = cfg.levelCol || "";
    if ($("drChangeNumCol")) $("drChangeNumCol").value = cfg.levelChangeNumCol || "";
    if ($("drWeekWindow") && cfg.weekWindow != null) $("drWeekWindow").value = cfg.weekWindow;
    if ($("drRelThreshold") && cfg.thresholds?.relDelta != null) $("drRelThreshold").value = cfg.thresholds.relDelta;
    if ($("drNominalRate") && cfg.nominalRate != null) $("drNominalRate").value = cfg.nominalRate;
    if ($("drFeeRate") && cfg.feeRate != null) $("drFeeRate").value = cfg.feeRate;
    const host = $("drMetricRows");
    if (host && cfg.metrics?.length) {
      host.innerHTML = "";
      metricSeq = 0;
      cfg.metrics.forEach((m) => addMetricRow(m));
    }
    initDrSegmentPicker(cfg.segmentCols || []);
    updatePanelSummaries();
    if (prior.grain === "day" || prior.grain === "week" || prior.grain === "month") {
      S.drGrain = prior.grain;
      S.drBriefGrain = prior.grain;
    }
    if (prior.segmentFilter && (prior.segmentFilter.segmentCols || prior.segmentFilter.segmentKeys)) {
      S.drSegmentFilter = {
        segmentCols: (prior.segmentFilter.segmentCols || []).slice(),
        segmentKeys: (prior.segmentFilter.segmentKeys || []).slice(),
      };
    } else if (prior.detailFilter?.detailSegCols || prior.detailFilter?.detailSegKeys) {
      S.drSegmentFilter = {
        segmentCols: (prior.detailFilter.detailSegCols || []).slice(),
        segmentKeys: (prior.detailFilter.detailSegKeys || []).slice(),
      };
    } else if (prior.panel1Segment && prior.panel1Segment !== "__all__") {
      S.drSegmentFilter = {
        segmentCols: (prior.config?.segmentCols || []).slice(),
        segmentKeys: [prior.panel1Segment],
      };
    }
    if (prior.chartPeriodFilter) {
      S.drChartPeriodFilter = {
        day: { ...(prior.chartPeriodFilter.day || {}) },
        week: { ...(prior.chartPeriodFilter.week || {}) },
        month: { ...(prior.chartPeriodFilter.month || {}) },
      };
    }
    if (prior.cardPeriodFilter) {
      S.drCardPeriodFilter = {
        day: { ...(prior.cardPeriodFilter.day || {}) },
        week: { ...(prior.cardPeriodFilter.week || {}) },
        month: { ...(prior.cardPeriodFilter.month || {}) },
      };
    }
    if (prior.narrativeFilter) S.drNarrativeFilter = { ...prior.narrativeFilter };
    if (prior.contribFilter) {
      S.drContribFilter = {
        ...prior.contribFilter,
        segmentCols: (prior.contribFilter.segmentCols || []).slice(),
        segmentKeys: (prior.contribFilter.segmentKeys || []).slice(),
      };
    }
    if (prior.pairwiseFilter) {
      S.drPairwiseFilter = {
        ...prior.pairwiseFilter,
        segmentCols: (prior.pairwiseFilter.segmentCols || []).slice(),
        segmentKeys: (prior.pairwiseFilter.segmentKeys || []).slice(),
      };
    }
    if (prior.detailFilter) {
      S.drDetailFilter = {
        ...prior.detailFilter,
        groups: (prior.detailFilter.groups || []).slice(),
        mode: prior.detailFilter.mode === "pre" || prior.detailFilter.mode === "post"
          ? prior.detailFilter.mode
          : "all",
        preN: DR().clampLatestN(prior.detailFilter.preN != null ? prior.detailFilter.preN : 5),
        postN: DR().clampLatestN(prior.detailFilter.postN != null ? prior.detailFilter.postN : 5),
        collapsedSegs: prior.detailFilter.collapsedSegs && typeof prior.detailFilter.collapsedSegs === "object"
          ? { ...prior.detailFilter.collapsedSegs }
          : Object.create(null),
        periodFilter: prior.detailFilter.periodFilter && typeof prior.detailFilter.periodFilter === "object"
          ? {
            day: { ...(prior.detailFilter.periodFilter.day || {}) },
            week: { ...(prior.detailFilter.periodFilter.week || {}) },
            month: { ...(prior.detailFilter.periodFilter.month || {}) },
          }
          : { day: {}, week: {}, month: {} },
        detailSegCols: (prior.detailFilter.detailSegCols || []).slice(),
        detailSegKeys: (prior.detailFilter.detailSegKeys || []).slice(),
      };
    }
    if (prior.contribSort) S.drContribSort = { ...prior.contribSort };
    if (prior.levelFilter) {
      const pf = prior.levelFilter.periodFilter || {};
      const dual = pf.a || pf.b
        ? {
          a: {
            day: { ...(pf.a?.day || {}) },
            week: { ...(pf.a?.week || {}) },
            month: { ...(pf.a?.month || {}) },
          },
          b: {
            day: { ...(pf.b?.day || {}) },
            week: { ...(pf.b?.week || {}) },
            month: { ...(pf.b?.month || {}) },
          },
        }
        : {
          a: {
            day: { ...(pf.day || {}) },
            week: { ...(pf.week || {}) },
            month: { ...(pf.month || {}) },
          },
          b: {
            day: { ...(pf.day || {}) },
            week: { ...(pf.week || {}) },
            month: { ...(pf.month || {}) },
          },
        };
      const priorDec = prior.levelFilter.decisions && typeof prior.levelFilter.decisions === "object"
        ? { a: prior.levelFilter.decisions.a || "", b: prior.levelFilter.decisions.b || "" }
        : (prior.levelFilter.abPair
          ? { a: prior.levelFilter.abPair.a || "", b: prior.levelFilter.abPair.b || "" }
          : { a: "", b: "" });
      S.drLevelFilter = {
        ...prior.levelFilter,
        metricId: "risk",
        segmentCols: (prior.levelFilter.segmentCols || []).slice(),
        segmentKeys: (prior.levelFilter.segmentKeys || []).slice(),
        decisions: priorDec,
        periodFilter: dual,
        collapsedLevels: prior.levelFilter.collapsedLevels && typeof prior.levelFilter.collapsedLevels === "object"
          ? { ...prior.levelFilter.collapsedLevels }
          : Object.create(null),
        collapsedChangeNums: prior.levelFilter.collapsedChangeNums && typeof prior.levelFilter.collapsedChangeNums === "object"
          ? { ...prior.levelFilter.collapsedChangeNums }
          : Object.create(null),
      };
      delete S.drLevelFilter.abPair;
    }
    if (prior.hasResult && S.lastDailyReview) {
      DR().hydrateDailyReviewSeries?.(S.lastDailyReview);
      renderResults(S.lastDailyReview);
    }
    if (prior.stale) markDailyReviewResultsStale();
  }

  /** Concise header summaries for export freeze (visible when panels collapsed). */
  function applyDailyReviewExportConfigSummaries() {
    const cfg = S.lastDailyReview?.config || ($("tab-daily-review") ? getDailyReviewConfig() : null);
    if (!cfg) return;
    const timeCol = cfg.timeCol || "—";
    const decCol = cfg.decisionCol || "—";
    const levelCol = cfg.levelCol || "";
    const changeNumCol = cfg.levelChangeNumCol || "";
    const win = DR().resolveWeekWindow(cfg.weekWindow);
    const nMet = (cfg.metrics || []).length;
    const nSeg = (cfg.segmentCols || []).length;
    const fs = $("drPanelFieldsSummary");
    if (fs) {
      const extras = [levelCol && `level=${levelCol}`, changeNumCol && `lcn=${changeNumCol}`].filter(Boolean);
      fs.textContent = extras.length
        ? `${timeCol} · ${decCol} · ${extras.join(" · ")} · 近${win}周`
        : `${timeCol} · ${decCol} · 近${win}周`;
    }
    const ms = $("drPanelMetricsSummary");
    if (ms) ms.textContent = `${nMet} 指标`;
    const ss = $("drPanelSegmentsSummary");
    if (ss) ss.textContent = nSeg ? `${nSeg} 维` : "无客群维";
    const run = $("drPanelRun");
    if (run) {
      const header = run.querySelector(".da-panel-header");
      if (header && !header.getAttribute("data-config-panel-toggle")) {
        header.setAttribute("data-config-panel-toggle", "drPanelRun");
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        if (!header.querySelector(".da-panel-collapse-hint")) {
          const hint = document.createElement("span");
          hint.className = "da-panel-collapse-hint";
          hint.setAttribute("aria-hidden", "true");
          header.appendChild(hint);
        }
      }
      let sum = run.querySelector(".da-panel-summary");
      if (!sum && header) {
        sum = document.createElement("span");
        sum.className = "da-panel-summary";
        const hint = header.querySelector(".da-panel-collapse-hint");
        if (hint) header.insertBefore(sum, hint);
        else header.appendChild(sum);
      }
      if (sum) sum.textContent = "已生成快照";
    }
  }

  /** Ensure tab shell + results DOM exist (for HTML export). */
  function prepareDailyReviewForExport() {
    if (!S.lastDailyReview) return false;
    DR().hydrateDailyReviewSeries?.(S.lastDailyReview);
    if (!$("tab-daily-review")) {
      initDailyReviewTab({ showTab: false });
    } else {
      mountDailyReviewTabShell();
      eventsBound = false;
      bindDailyReviewEvents();
      populateDailyReviewTabAfterCsv();
    }
    const prior = snapshotDailyReviewUiState() || {
      config: S.lastDailyReview.config,
      hasResult: true,
      grain: getDrGrain(),
    };
    prior.hasResult = true;
    const coerced = coerceDrGrain(prior.grain);
    if (prior.grain !== coerced) {
      prior.grain = coerced;
      S.drGrain = coerced;
      S.drBriefGrain = coerced;
    }
    void restoreDailyReviewUiState(prior);
    applyDailyReviewExportConfigSummaries();
    return !!$("drResultsMount")?.querySelector(".dr-results-document, .dr-brief-block, .dr-block");
  }

  function ensureDailyReviewEventsBound() {
    bindDailyReviewEvents();
  }

  function bindDailyReviewEvents() {
    if (eventsBound) return;
    const tab = () => $("tab-daily-review");
    if (!tab()) return;
    eventsBound = true;

    tab().addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest?.("#drAddMetric")) {
        addMetricRow({ name: "新指标", direction: "higher" });
        updatePanelSummaries();
        markDailyReviewResultsStale();
        return;
      }
      if (t.closest?.("#drResetMetrics")) {
        resetDefaultMetrics();
        markDailyReviewResultsStale();
        return;
      }
      if (t.classList?.contains("dr-metric-remove")) {
        t.closest(".dr-metric-row")?.remove();
        updatePanelSummaries();
        markDailyReviewResultsStale();
        return;
      }
      if (t.closest?.("#btnRunDailyReview") || t.closest?.("#drStaleRerunBtn")) {
        void runDailyReviewFromUi();
        return;
      }
      const viewFilterBtn = t.closest?.(".dr-view-grain-btn, .dr-chip[data-dr-view-metric], .dr-chip[data-dr-view-group], .dr-chip[data-dr-pw-scope], .dr-chip[data-dr-detail-group], .dr-chip[data-dr-detail-groups], .dr-chip[data-dr-detail-mom], .dr-chip[data-dr-detail-metric], .dr-chip[data-dr-detail-metrics], .dr-chip[data-dr-segcol], .dr-chip[data-dr-segcols], .dr-chip[data-dr-segkey], .dr-chip[data-dr-segkeys]");
      if (viewFilterBtn && applyViewFilterClick(viewFilterBtn)) return;
      const detailTab = t.closest?.(".dr-detail-tab[data-dr-detail-mode]");
      if (detailTab && S.lastDailyReview && S.drDetailFilter) {
        const mode = detailTab.getAttribute("data-dr-detail-mode");
        if (mode === "all" || mode === "pre" || mode === "post") {
          S.drDetailFilter.mode = mode;
          refreshDetailRelated(S.lastDailyReview);
        }
        return;
      }
      const collapseBtn = t.closest?.("[data-dr-latest-collapse]");
      if (collapseBtn && S.lastDailyReview && S.drDetailFilter) {
        const seg = collapseBtn.getAttribute("data-dr-latest-collapse");
        if (seg) {
          if (!S.drDetailFilter.collapsedSegs) S.drDetailFilter.collapsedSegs = Object.create(null);
          if (S.drDetailFilter.collapsedSegs[seg]) delete S.drDetailFilter.collapsedSegs[seg];
          else S.drDetailFilter.collapsedSegs[seg] = true;
          refreshDetailView(S.lastDailyReview);
        }
        return;
      }
      const levelCollapseBtn = t.closest?.("[data-dr-level-collapse]");
      if (levelCollapseBtn && S.lastDailyReview && S.drLevelFilter) {
        const lv = levelCollapseBtn.getAttribute("data-dr-level-collapse");
        const side = levelCollapseBtn.getAttribute("data-dr-level-side") === "b" ? "b" : "a";
        const binKind = levelCollapseBtn.getAttribute("data-dr-binned-kind") === "changeNum"
          ? "changeNum"
          : "level";
        if (lv) {
          const store = collapseStoreForKind(binKind);
          if (!store[side]) store[side] = Object.create(null);
          if (store[side][lv] === false) delete store[side][lv];
          else store[side][lv] = false;
          const decision = getLevelSideDecision(side);
          if (decision) refreshBinnedTable(S.lastDailyReview, side, decision, binKind);
        }
        return;
      }
      const levelTimeReset = t.closest?.(".dr-level-time-reset");
      if (levelTimeReset && S.lastDailyReview && S.drLevelFilter) {
        const grain = levelTimeReset.getAttribute("data-dr-level-time-grain");
        const side = levelTimeReset.getAttribute("data-dr-level-side") === "b" ? "b" : "a";
        const decision = getLevelSideDecision(side);
        const series = decision
          ? resolveBinnedSeries(S.lastDailyReview, grain, S.drLevelFilter.segment, decision)
          : null;
        const periods = series?.periods || [];
        if (periods.length && decision) {
          ensureLevelFilter();
          if (!S.drLevelFilter.periodFilter[side]) S.drLevelFilter.periodFilter[side] = { day: {}, week: {}, month: {} };
          S.drLevelFilter.periodFilter[side][grain] = { from: periods[0], to: periods[periods.length - 1] };
          refreshLevelSide(S.lastDailyReview, side, decision);
        }
        return;
      }
      const briefGrainBtn = t.closest?.(".dr-brief-grain-btn");
      if (briefGrainBtn && S.lastDailyReview) {
        setDailyReviewGrain(briefGrainBtn.getAttribute("data-dr-brief-grain"));
        return;
      }
      const briefSecToggle = t.closest?.("[data-dr-brief-sec-toggle]");
      if (briefSecToggle) {
        const secId = briefSecToggle.getAttribute("data-dr-brief-sec-toggle");
        const sec = secId ? document.getElementById(secId) : null;
        if (sec) sec.classList.toggle("is-collapsed");
        return;
      }
      const blockToggle = t.closest?.("[data-dr-block-toggle]");
      if (blockToggle) {
        if (t.closest?.("[data-dr-no-toggle]")) return;
        const blockId = blockToggle.getAttribute("data-dr-block-toggle");
        const block = blockId ? document.getElementById(blockId) : blockToggle.closest(".dr-block");
        if (block) block.classList.toggle("is-collapsed");
        return;
      }
      const flatToggle = t.closest?.("[data-dr-brief-flat-toggle]");
      if (flatToggle) {
        const card = flatToggle.closest?.(".dr-brief-group-card");
        const flatRows = card?.querySelector(".dr-brief-flat-rows");
        if (flatRows) {
          const open = flatRows.hasAttribute("hidden");
          if (open) flatRows.removeAttribute("hidden");
          else flatRows.setAttribute("hidden", "");
          const n = flatRows.querySelectorAll(".dr-brief-metric-row").length;
          flatToggle.textContent = open ? `收起持平 ${n}` : `显示持平 ${n}`;
        }
        return;
      }
      const narrChip = t.closest?.(".dr-chip[data-dr-narr-mode]");
      if (narrChip && S.lastDailyReview) {
        const grain = narrChip.getAttribute("data-dr-narr-grain");
        const mode = narrChip.getAttribute("data-dr-narr-mode");
        if (grain && mode) {
          initNarrativeFilterState();
          S.drNarrativeFilter[grain] = mode;
          refreshNarrativesBlock(S.lastDailyReview, grain);
        }
        return;
      }
      const contribSortTh = t.closest?.(".dr-contrib-table .th-sortable");
      if (contribSortTh && S.lastDailyReview) {
        const card = contribSortTh.closest?.("[data-dr-contrib-card]");
        const cardId = card?.getAttribute("data-dr-contrib-card");
        const key = contribSortTh.getAttribute("data-sort-key");
        const type = contribSortTh.getAttribute("data-sort-type") || "string";
        if (cardId && key) {
          const items = [
            ...(S.lastDailyReview.contributions?.day || []),
            ...(S.lastDailyReview.contributions?.week || []),
            ...(S.lastDailyReview.contributions?.month || []),
          ];
          const it = items.find((x) => contribCardSortId(x) === cardId);
          if (it) {
            cycleContribSortState(it, key, type);
            refreshContribView(S.lastDailyReview);
          }
        }
        return;
      }
      const grainBtn = t.closest?.(".dr-grain-btn");
      if (grainBtn) {
        if (grainBtn.classList.contains("dr-view-grain-btn") || grainBtn.classList.contains("dr-brief-grain-btn")) return;
        if (S.lastDailyReview) setDailyReviewGrain(grainBtn.getAttribute("data-dr-grain"));
        return;
      }
      const resetBtn = t.closest?.(".dr-chart-time-reset");
      if (resetBtn && S.lastDailyReview) {
        const grain = resetBtn.getAttribute("data-dr-time-grain");
        const periods = resolvePanel1Series(S.lastDailyReview, grain)?.periods || [];
        if (periods.length) {
          if (!S.drChartPeriodFilter) S.drChartPeriodFilter = {};
          S.drChartPeriodFilter[grain] = { from: periods[0], to: periods[periods.length - 1] };
          const fromEl = document.querySelector(`.dr-chart-time-from[data-dr-time-grain="${grain}"]`);
          const toEl = document.querySelector(`.dr-chart-time-to[data-dr-time-grain="${grain}"]`);
          if (fromEl) fromEl.value = periods[0];
          if (toEl) toEl.value = periods[periods.length - 1];
          mountGrainCharts(S.lastDailyReview, grain);
        }
        return;
      }
      const detailTimeReset = t.closest?.(".dr-detail-time-reset");
      if (detailTimeReset && S.lastDailyReview && S.drDetailFilter) {
        const grain = detailTimeReset.getAttribute("data-dr-detail-time-grain");
        const periods = detailSeriesPeriods(S.lastDailyReview, grain);
        if (periods.length) {
          if (!S.drDetailFilter.periodFilter) S.drDetailFilter.periodFilter = { day: {}, week: {}, month: {} };
          S.drDetailFilter.periodFilter[grain] = { from: periods[0], to: periods[periods.length - 1] };
          renderDetailToolbar(S.lastDailyReview);
          refreshDetailView(S.lastDailyReview);
        }
        return;
      }
      const header = t.closest?.("[data-config-panel-toggle]");
      if (header) {
        const id = header.getAttribute("data-config-panel-toggle");
        if (id) CP()?.togglePanel?.(id);
      }
    });

    tab().addEventListener("change", (e) => {
      if (e.target.id === "drPanel1SegmentSelect" && S.lastDailyReview) {
        S.drPanel1Segment = e.target.value || "__all__";
        refreshPanel1View(S.lastDailyReview);
        return;
      }
      const levelDecSel = e.target.closest?.(".dr-level-decision-select");
      if (levelDecSel && S.lastDailyReview && S.drLevelFilter) {
        const side = levelDecSel.getAttribute("data-dr-level-side") === "b" ? "b" : "a";
        ensureLevelFilter();
        if (!S.drLevelFilter.decisions) S.drLevelFilter.decisions = { a: "", b: "" };
        S.drLevelFilter.decisions[side] = levelDecSel.value || "";
        refreshLevelSide(S.lastDailyReview, side, S.drLevelFilter.decisions[side]);
        return;
      }
      const levelTimeSel = e.target.closest?.(".dr-level-time-from, .dr-level-time-to");
      if (levelTimeSel && S.lastDailyReview && S.drLevelFilter) {
        const grain = levelTimeSel.getAttribute("data-dr-level-time-grain");
        const side = levelTimeSel.getAttribute("data-dr-level-side") === "b" ? "b" : "a";
        if (grain) {
          syncLevelPeriodFilterFromDom(grain, side);
          const decision = getLevelSideDecision(side);
          if (decision) refreshLevelSide(S.lastDailyReview, side, decision);
        }
        return;
      }
      const cardPeriodSel = e.target.closest?.(".dr-card-period-pre, .dr-card-period-post");
      if (cardPeriodSel && S.lastDailyReview) {
        const grain = cardPeriodSel.getAttribute("data-dr-card-period-grain");
        const side = cardPeriodSel.getAttribute("data-dr-card-period-side");
        if (grain && (side === "pre" || side === "post")) {
          ensureCardPeriodFilterState();
          if (!S.drCardPeriodFilter[grain]) S.drCardPeriodFilter[grain] = { pre: "", post: "" };
          S.drCardPeriodFilter[grain][side] = cardPeriodSel.value || "";
          refreshPanel1MetricCards(S.lastDailyReview, grain);
        }
        return;
      }
      if (e.target.id === "drDetailLatestN" && S.lastDailyReview && S.drDetailFilter) {
        const n = DR().clampLatestN(e.target.value);
        if (S.drDetailFilter.mode === "post") S.drDetailFilter.postN = n;
        else S.drDetailFilter.preN = n;
        refreshDetailView(S.lastDailyReview);
        return;
      }
      const detailTimeSel = e.target.closest?.(".dr-detail-time-from, .dr-detail-time-to");
      if (detailTimeSel && S.lastDailyReview && S.drDetailFilter) {
        const grain = detailTimeSel.getAttribute("data-dr-detail-time-grain");
        if (grain) {
          syncDetailPeriodFilterFromDom(grain, detailTimeSel);
          renderDetailToolbar(S.lastDailyReview);
          refreshDetailView(S.lastDailyReview);
        }
        return;
      }
      const timeSel = e.target.closest?.(".dr-chart-time-from, .dr-chart-time-to");
      if (timeSel && S.lastDailyReview) {
        const grain = timeSel.getAttribute("data-dr-time-grain");
        if (grain) {
          syncChartPeriodFilterFromDom(grain);
          mountGrainCharts(S.lastDailyReview, grain);
        }
        return;
      }
      if (e.target.closest?.("#drPanelFields, #drPanelMetrics, #drMetricRows")) {
        updatePanelSummaries();
        if (S.lastDailyReview) markDailyReviewResultsStale();
      }
      if (e.target.id === "drWeekWindow" && S.lastDailyReview) {
        markDailyReviewResultsStale();
      }
    });
  }

  function setupDailyReviewTabShell() {
    mountDailyReviewTabShell();
    registerDrPickers();
    eventsBound = false;
    bindDailyReviewEvents();
    if (S.rawRows.length) populateDailyReviewTabAfterCsv();
    else {
      const btn = $("btnRunDailyReview");
      if (btn) btn.disabled = true;
    }
  }

  function remountDailyReviewTabAfterReport(priorState) {
    mountDailyReviewTabShell();
    eventsBound = false;
    bindDailyReviewEvents();
    populateDailyReviewTabAfterCsv();
    if (priorState) void restoreDailyReviewUiState(priorState);
  }

  function initDailyReviewTab({ showTab: showDrTab = false } = {}) {
    setupDailyReviewTabShell();
    if (showDrTab && RV.ui.report.post?.showTab) {
      RV.ui.report.post.showTab("dailyReview");
    }
  }

  Object.assign(target, {
    renderDailyReviewTabShell,
    mountDailyReviewTabShell,
    initDailyReviewTab,
    setupDailyReviewTabShell,
    remountDailyReviewTabAfterReport,
    snapshotDailyReviewUiState,
    restoreDailyReviewUiState,
    prepareDailyReviewForExport,
    ensureDailyReviewEventsBound,
    applyDailyReviewExportConfigSummaries,
    getDailyReviewConfig,
    validateDailyReviewConfig,
    populateDailyReviewTabAfterCsv,
    runDailyReviewFromUi,
    clearDailyReviewCache,
    markDailyReviewResultsStale,
    clearDailyReviewResultsStale,
  });
})(window.RV);
