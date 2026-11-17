(function (RV) {
  "use strict";
  var target = RV.ui.report.riskTarget = RV.ui.report.riskTarget || {};
  const $ = (id) => document.getElementById(id);
  const D = RV.domain.riskTarget;
  const DEFAULT_PARAMS = D.DEFAULT_PARAMS;
  const SCENARIO_MULTIPLES = D.SCENARIO_MULTIPLES;
  const SCENARIO_KNOWN_SWAPOUT = D.SCENARIO_KNOWN_SWAPOUT;
  const validate = D.validate;
  const calculate = D.calculate;
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const hintBadgeHtml = RV.infra.hintBadgeHtml;

  let eventsBound = false;
  /** Dual-track lock: "risk" keeps risk% when N changes; "overdue" keeps overdue count. */
  let dualTrackLock = "risk";

  function fmtNum(n, digits) {
    if (n == null || Number.isNaN(n)) return "--";
    return Number(n).toLocaleString("zh-CN", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits > 0 ? Math.min(digits, 2) : 0,
    });
  }

  function fmtPct(n, digits) {
    if (n == null || Number.isNaN(n)) return "--";
    return `${fmtNum(n, digits)}%`;
  }

  function renderRiskTargetTabShell() {
    return `<section id="tab-risk-target" class="report-tab-section">
<div class="container">
  <header class="rt-header">
    <h1 class="rv-heading-with-hint">风险目标测算${hintBadgeHtml("swapin 替 swapout，按场景反算")}</h1>
  </header>

  <div class="rt-decision" id="rtDecisionCard">
    <span class="rt-decision-badge" id="rtDecisionBadge">待测算</span>
    <div class="rt-decision-text" id="rtDecisionText">填写参数后自动测算</div>
  </div>

  <div class="rt-main-grid">
    <div class="rt-card">
      <h2 class="rv-heading-with-hint">参数配置${hintBadgeHtml("订单数可与风险%/逾期联动")}</h2>
      <div id="rtErrorBanner" class="rt-error-banner" hidden></div>

      <h3 class="rv-heading-with-hint">测算场景${hintBadgeHtml("设 swap 倍数 m/k，或填 swapout 风险")}</h3>
      <div class="rt-scenario-row" role="radiogroup" aria-label="测算场景">
        <label class="rt-scenario-option">
          <input type="radio" name="rtScenario" id="rtScenarioMultiples" value="${SCENARIO_MULTIPLES}" checked>
          <span>倍数约束</span>
        </label>
        <label class="rt-scenario-option">
          <input type="radio" name="rtScenario" id="rtScenarioKnownSwapout" value="${SCENARIO_KNOWN_SWAPOUT}">
          <span>已知 swapout 风险</span>
        </label>
      </div>

      <h3>现状总量</h3>
      <div class="rt-field">
        <label for="rtOrders">订单数</label>
        <div class="rt-input-wrap"><input type="number" id="rtOrders" min="1" step="1"><span class="rt-suffix">笔</span></div>
      </div>
      <div class="rt-field">
        <label for="rtRiskPct">风险</label>
        <div class="rt-input-wrap"><input type="number" id="rtRiskPct" min="0" max="100" step="0.01"><span class="rt-suffix">%</span></div>
      </div>
      <div class="rt-field">
        <label for="rtOverdue">逾期订单数</label>
        <div class="rt-input-wrap"><input type="number" id="rtOverdue" min="0" step="0.01"><span class="rt-suffix">笔</span></div>
      </div>

      <h3>目标与约束</h3>
      <div class="rt-field">
        <label for="rtTargetRiskPct">目标风险</label>
        <div class="rt-input-wrap"><input type="number" id="rtTargetRiskPct" min="0" max="100" step="0.01"><span class="rt-suffix">%</span></div>
      </div>
      <div class="rt-field" id="rtFieldSwapoutMultiple">
        <label for="rtSwapoutMultiple">swapout / inin 风险倍数 <span class="rt-hint">m</span></label>
        <div class="rt-input-wrap"><input type="number" id="rtSwapoutMultiple" min="0.01" step="0.01"><span class="rt-suffix">×</span></div>
      </div>
      <div class="rt-field" id="rtFieldSwapoutRisk" hidden>
        <label for="rtSwapoutRiskPct">swapout 风险</label>
        <div class="rt-input-wrap"><input type="number" id="rtSwapoutRiskPct" min="0" max="100" step="0.01"><span class="rt-suffix">%</span></div>
      </div>
      <div class="rt-field">
        <label for="rtSwapinMultiple">swapin / inin 风险倍数 <span class="rt-hint">k</span></label>
        <div class="rt-input-wrap"><input type="number" id="rtSwapinMultiple" min="0.01" step="0.01"><span class="rt-suffix">×</span></div>
      </div>

      <p class="rt-constraint-note" id="rtConstraintNote"></p>
    </div>

    <div class="rt-card">
      <h2 class="rv-heading-with-hint">测算结果${hintBadgeHtml("达标后 swapout→swapin 等量替换")}</h2>
      <div class="rt-table-wrap">
        <table class="rt-result-table" id="rtResultTable">
          <thead>
            <tr>
              <th>客群</th>
              <th>订单数</th>
              <th>逾期订单数</th>
              <th>风险</th>
            </tr>
          </thead>
          <tbody id="rtResultBody">
            <tr><td colspan="4" class="rt-empty">填写参数后显示</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
</section>`;
  }

  function parseNum(id) {
    const el = $(id);
    if (!el) return NaN;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : NaN;
  }

  function readScenarioFromForm() {
    const known = $("rtScenarioKnownSwapout");
    if (known && known.checked) return SCENARIO_KNOWN_SWAPOUT;
    return SCENARIO_MULTIPLES;
  }

  function readParamsFromForm() {
    return {
      scenario: readScenarioFromForm(),
      orders: parseNum("rtOrders"),
      riskPct: parseNum("rtRiskPct"),
      overdue: parseNum("rtOverdue"),
      targetRiskPct: parseNum("rtTargetRiskPct"),
      swapoutMultiple: parseNum("rtSwapoutMultiple"),
      swapinMultiple: parseNum("rtSwapinMultiple"),
      swapoutRiskPct: parseNum("rtSwapoutRiskPct"),
    };
  }

  function setInputValue(id, value, digits) {
    const el = $(id);
    if (!el) return;
    if (value == null || Number.isNaN(value)) {
      el.value = "";
      return;
    }
    if (digits != null) el.value = String(Number(value.toFixed(digits)));
    else el.value = String(value);
  }

  function applyScenarioToForm(scenario) {
    const sc = scenario === SCENARIO_KNOWN_SWAPOUT ? SCENARIO_KNOWN_SWAPOUT : SCENARIO_MULTIPLES;
    const multiples = $("rtScenarioMultiples");
    const known = $("rtScenarioKnownSwapout");
    if (multiples) multiples.checked = sc === SCENARIO_MULTIPLES;
    if (known) known.checked = sc === SCENARIO_KNOWN_SWAPOUT;
    const fieldM = $("rtFieldSwapoutMultiple");
    const fieldRo = $("rtFieldSwapoutRisk");
    if (fieldM) fieldM.hidden = sc !== SCENARIO_MULTIPLES;
    if (fieldRo) fieldRo.hidden = sc !== SCENARIO_KNOWN_SWAPOUT;
  }

  function applyParamsToForm(params) {
    const p = { ...DEFAULT_PARAMS, ...(params || {}) };
    applyScenarioToForm(p.scenario);
    setInputValue("rtOrders", p.orders, 0);
    setInputValue("rtRiskPct", p.riskPct, 4);
    setInputValue("rtOverdue", p.overdue != null ? p.overdue : p.orders * (p.riskPct / 100), 4);
    setInputValue("rtTargetRiskPct", p.targetRiskPct, 4);
    setInputValue("rtSwapoutMultiple", p.swapoutMultiple, 4);
    setInputValue("rtSwapinMultiple", p.swapinMultiple, 4);
    setInputValue("rtSwapoutRiskPct", p.swapoutRiskPct, 4);
  }

  function syncDualTrack(sourceId) {
    const orders = parseNum("rtOrders");
    if (!(orders > 0)) return;

    if (sourceId === "rtRiskPct") {
      dualTrackLock = "risk";
      const riskPct = parseNum("rtRiskPct");
      if (!Number.isNaN(riskPct)) setInputValue("rtOverdue", orders * (riskPct / 100), 4);
      return;
    }
    if (sourceId === "rtOverdue") {
      dualTrackLock = "overdue";
      const overdue = parseNum("rtOverdue");
      if (!Number.isNaN(overdue)) setInputValue("rtRiskPct", (overdue / orders) * 100, 4);
      return;
    }
    if (sourceId === "rtOrders") {
      if (dualTrackLock === "overdue") {
        const overdue = parseNum("rtOverdue");
        if (!Number.isNaN(overdue)) setInputValue("rtRiskPct", (overdue / orders) * 100, 4);
      } else {
        const riskPct = parseNum("rtRiskPct");
        if (!Number.isNaN(riskPct)) setInputValue("rtOverdue", orders * (riskPct / 100), 4);
      }
    }
  }

  function clearResultTable(message) {
    const body = $("rtResultBody");
    if (body) body.innerHTML = `<tr><td colspan="4" class="rt-empty">${message || "填写参数后显示"}</td></tr>`;
  }

  function renderResultRow(label, pack, extraClass) {
    const cls = extraClass ? ` class="${extraClass}"` : "";
    return `<tr${cls}>
      <td>${label}</td>
      <td>${fmtNum(pack.orders, 2)}</td>
      <td>${fmtNum(pack.overdue, 2)}</td>
      <td>${fmtPct(pack.riskPct, 4)}</td>
    </tr>`;
  }

  function setDecision(kind, badge, text) {
    const card = $("rtDecisionCard");
    const badgeEl = $("rtDecisionBadge");
    const textEl = $("rtDecisionText");
    if (card) card.className = `rt-decision${kind ? ` ${kind}` : ""}`;
    if (badgeEl) badgeEl.textContent = badge;
    if (textEl) textEl.textContent = text;
  }

  function showError(msg) {
    const banner = $("rtErrorBanner");
    if (!banner) return;
    if (!msg) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    banner.hidden = false;
    banner.textContent = msg;
  }

  function updateConstraintNote(params) {
    const el = $("rtConstraintNote");
    if (!el) return;
    const k = params.swapinMultiple;
    if (params.scenario === SCENARIO_KNOWN_SWAPOUT) {
      const ro = params.swapoutRiskPct;
      if ([k, ro].some((v) => Number.isNaN(v))) {
        el.textContent = "约束：等量替换；已知 swapout 风险；swapin 风险 = k × inin 风险";
        return;
      }
      el.textContent = `约束：等量替换；swapout 风险 = ${ro}%（已知）；swapin 风险 = ${k} × inin 风险`;
      return;
    }
    const m = params.swapoutMultiple;
    if ([m, k].some((v) => Number.isNaN(v))) {
      el.textContent = "约束：等量替换（swapin 订单数 = swapout 订单数）";
      return;
    }
    el.textContent = `约束：等量替换；swapout 风险 = ${m} × inin 风险；swapin 风险 = ${k} × inin 风险`;
  }

  function recalculate() {
    if (!$("tab-risk-target")) return;
    applyScenarioToForm(readScenarioFromForm());
    const params = readParamsFromForm();
    updateConstraintNote(params);
    const errors = validate(params);
    if (errors.length) {
      showError(errors.join("；"));
      setDecision("", "待测算", errors[0]);
      clearResultTable(errors[0]);
      return;
    }
    showError("");
    const result = calculate(params);
    if (!result.ok) {
      const reason = result.failReason || "在当前约束下无法达到目标风险";
      showError(reason);
      setDecision("bad", "无解", reason);
      clearResultTable(reason);
      return;
    }
    showError("");
    setDecision(
      "good",
      "可达标",
      `达标后风险 ${fmtPct(result.after.riskPct, 4)}（目标 ${fmtPct(result.targetRiskPct, 4)}）；需换出/换入 ${fmtNum(result.swapout.orders, 2)} 笔`
    );
    const body = $("rtResultBody");
    if (body) {
      body.innerHTML = [
        renderResultRow("inin（保留）", result.inin),
        renderResultRow("swapout（换出）", result.swapout),
        renderResultRow("swapin（换入）", result.swapin),
        renderResultRow("现状合计", {
          orders: result.currentOrders,
          overdue: result.currentOverdue,
          riskPct: result.currentRiskPct,
        }, "rt-row-muted"),
        renderResultRow("达标后合计", result.after, "rt-row-highlight"),
      ].join("");
    }
  }

  function onParamInput(e) {
    const id = e.target?.id;
    if (id === "rtOrders" || id === "rtRiskPct" || id === "rtOverdue") {
      syncDualTrack(id);
    }
    if (id === "rtScenarioMultiples" || id === "rtScenarioKnownSwapout") {
      applyScenarioToForm(readScenarioFromForm());
    }
    recalculate();
  }

  function bindRiskTargetEvents() {
    if (eventsBound) return;
    const tab = $("tab-risk-target");
    if (!tab) return;
    eventsBound = true;
    [
      "rtOrders", "rtRiskPct", "rtOverdue",
      "rtTargetRiskPct", "rtSwapoutMultiple", "rtSwapinMultiple", "rtSwapoutRiskPct",
      "rtScenarioMultiples", "rtScenarioKnownSwapout",
    ].forEach((id) => {
      const el = $(id);
      el?.addEventListener("input", onParamInput);
      el?.addEventListener("change", onParamInput);
    });
  }

  function mountRiskTargetTabShell() {
    const doc = ensureReportDocument();
    const old = doc.querySelector("#tab-risk-target");
    if (old) old.remove();
    doc.insertAdjacentHTML("beforeend", renderRiskTargetTabShell());
  }

  function snapshotRiskTargetUiState() {
    if (!$("tab-risk-target")) return null;
    return { params: readParamsFromForm(), dualTrackLock };
  }

  function restoreRiskTargetUiState(state) {
    if (!state) return;
    if (state.dualTrackLock) dualTrackLock = state.dualTrackLock;
    if (state.params) applyParamsToForm(state.params);
    else applyParamsToForm(DEFAULT_PARAMS);
    recalculate();
  }

  function setupRiskTargetTabShell() {
    mountRiskTargetTabShell();
    eventsBound = false;
    bindRiskTargetEvents();
    if (!$("rtOrders")?.value) applyParamsToForm(DEFAULT_PARAMS);
    else applyScenarioToForm(readScenarioFromForm());
    recalculate();
  }

  function remountRiskTargetTabAfterReport(priorState) {
    setupRiskTargetTabShell();
    restoreRiskTargetUiState(priorState);
  }

  function initRiskTargetTab({ showTab: showRtTab = false } = {}) {
    setupRiskTargetTabShell();
    if (showRtTab) RV.ui.report.post.showTab("riskTarget");
  }

  Object.assign(target, {
    renderRiskTargetTabShell,
    mountRiskTargetTabShell,
    bindRiskTargetEvents,
    snapshotRiskTargetUiState,
    restoreRiskTargetUiState,
    setupRiskTargetTabShell,
    remountRiskTargetTabAfterReport,
    initRiskTargetTab,
    recalculate,
    readParamsFromForm,
  });
})(window.RV);
