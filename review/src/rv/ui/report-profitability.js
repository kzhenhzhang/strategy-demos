
(function (RV) {
  "use strict";
  var target = RV.ui.report.profitability = RV.ui.report.profitability || {};
  const $ = (id) => document.getElementById(id);
  const D = RV.domain.profitability;
  const DEFAULT_PARAMS = D.DEFAULT_PARAMS;
  const COMPARE_METRICS = D.COMPARE_METRICS;
  const validate = D.validate;
  const calculate = D.calculate;
  const grossMarginAtOverdueRate = D.grossMarginAtOverdueRate;
  const buildCurveData = D.buildCurveData;
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const hintBadgeHtml = RV.infra.hintBadgeHtml;

  const SCENARIO_STORAGE_KEY = "rv.profitability.scenarios";
  let scenarios = { A: null, B: null };
  let chartState = null;
  let eventsBound = false;

  const PF_INPUT_IDS = [
    "pfPrincipal", "pfTotalRepayRate", "pfOverdueRate", "pfRecoveryRate",
    "pfFundCostRate", "pfTermMonths", "pfCac", "pfCollectionCostRate",
  ];

  function renderProfitabilityTabShell() {
    return `<section id="tab-profitability" class="report-tab-section">
<div class="container">
  <header class="pf-header">
    <h1 class="rv-heading-with-hint">盈利性测算${hintBadgeHtml("先看结论，再调参数")}</h1>
  </header>

  <div class="pf-decision" id="pfDecisionCard">
    <span class="pf-decision-badge" id="pfDecisionBadge">待测算</span>
    <div class="pf-decision-text" id="pfDecisionText">填写参数后自动给出投放建议</div>
    <ul class="pf-diagnosis-list" id="pfDiagnosisList"></ul>
  </div>

  <div class="pf-kpi-grid">
    <article class="pf-kpi-card">
      <span class="kpi-label">净利润（元/户）</span>
      <strong class="kpi-value" id="pfKpiNetProfit">--</strong>
    </article>
    <article class="pf-kpi-card">
      <span class="kpi-label">净利率</span>
      <strong class="kpi-value" id="pfKpiNetMargin">--</strong>
    </article>
    <article class="pf-kpi-card">
      <span class="kpi-label">本金回报率</span>
      <strong class="kpi-value" id="pfKpiRoi">--</strong>
    </article>
    <article class="pf-kpi-card">
      <span class="kpi-label">盈亏平衡逾期率</span>
      <strong class="kpi-value" id="pfKpiBreakEven">--</strong>
    </article>
  </div>

  <div class="main-grid">
    <div class="card">
      <h2 class="rv-heading-with-hint">参数配置${hintBadgeHtml("分组录入，改参即重算")}</h2>
      <div id="pfErrorBanner" class="error-banner"></div>

      <h3>收入参数</h3>
      <div class="field"><label for="pfPrincipal">平均给额（本金 P）</label><div class="input-wrap"><input type="number" id="pfPrincipal" value="10000" min="0" step="100"><span class="suffix">元</span></div></div>
      <div class="field"><label for="pfTotalRepayRate">平均总应还率</label><div class="input-wrap"><input type="number" id="pfTotalRepayRate" value="148" min="0" step="0.1"><span class="suffix">%</span></div></div>

      <h3>风险参数</h3>
      <div class="field"><label for="pfOverdueRate">客群逾期率</label><div class="input-wrap"><input type="number" id="pfOverdueRate" value="30" min="0" max="100" step="0.1"><span class="suffix">%</span></div></div>
      <div class="field"><label for="pfRecoveryRate">逾期回收率</label><div class="input-wrap"><input type="number" id="pfRecoveryRate" value="20" min="0" max="100" step="0.1"><span class="suffix">%</span></div></div>

      <h3>成本参数</h3>
      <div class="field"><label for="pfFundCostRate">年化资金成本率</label><div class="input-wrap"><input type="number" id="pfFundCostRate" value="12" min="0" max="100" step="0.1"><span class="suffix">%</span></div></div>
      <div class="field"><label for="pfTermMonths">贷款期限</label><div class="input-wrap"><input type="number" id="pfTermMonths" value="3" min="0" step="1"><span class="suffix">月</span></div></div>
      <div class="field"><label for="pfCac">单客获客成本（CAC）</label><div class="input-wrap"><input type="number" id="pfCac" value="200" min="0" step="10"><span class="suffix">元</span></div></div>
      <div class="field"><label for="pfCollectionCostRate">催收成本率</label><div class="input-wrap"><input type="number" id="pfCollectionCostRate" value="10" min="0" max="100" step="0.1"><span class="suffix">%</span></div></div>
    </div>

    <div class="card">
      <h2 class="rv-heading-with-hint">利润拆解${hintBadgeHtml("回款→毛利→净利润")}</h2>

      <div class="result-group">
        <div class="result-row"><span class="label">平均总应还（R）</span><span class="value" id="pfOutTotalRepay">--</span></div>
        <div class="result-row"><span class="label">息费收入（R − P）</span><span class="value" id="pfOutInterestFee">--</span></div>
        <div class="result-row"><span class="label">逾期金额（O）</span><span class="value" id="pfOutOverdueAmount">--</span></div>
        <div class="result-row"><span class="label">逾期部分回收</span><span class="value" id="pfOutOverdueRecovery">--</span></div>
        <div class="result-row"><span class="label">逾期部分损失</span><span class="value" id="pfOutOverdueLoss">--</span></div>
        <div class="result-row highlight"><span class="label">预期回款</span><span class="value" id="pfOutExpectedCollection">--</span></div>
      </div>

      <div class="result-group">
        <div class="result-row"><span class="label">产品毛利</span><span class="value" id="pfOutGrossProfit">--</span></div>
        <div class="result-row"><span class="label">产品毛利率</span><span class="value" id="pfOutGrossMargin">--</span></div>
        <div class="result-row"><span class="label">资金成本</span><span class="value" id="pfOutFundCost">--</span></div>
        <div class="result-row"><span class="label">获客成本</span><span class="value" id="pfOutCac">--</span></div>
        <div class="result-row"><span class="label">催收成本</span><span class="value" id="pfOutCollectionCost">--</span></div>
        <div class="result-row"><span class="label">总成本</span><span class="value" id="pfOutTotalCost">--</span></div>
        <div class="result-row net-profit" id="pfNetProfitRow"><span class="label">产品净利润</span><span class="value" id="pfOutNetProfit">--</span></div>
      </div>

      <div class="result-group compact">
        <div class="result-row"><span class="label">未逾期应还</span><span class="value" id="pfOutNormalRepay">--</span></div>
        <div class="result-row"><span class="label">本金回报率</span><span class="value" id="pfOutRoi">--</span></div>
        <div class="result-row"><span class="label">产品净利率</span><span class="value" id="pfOutNetMargin">--</span></div>
        <div class="result-row"><span class="label">有效损失率</span><span class="value" id="pfOutEffectiveLoss">--</span></div>
        <div class="result-row"><span class="label">盈亏平衡逾期率</span><span class="value" id="pfOutBreakEven">--</span></div>
      </div>
    </div>
  </div>

  <div class="compare-section">
    <div class="card">
      <h2 class="rv-heading-with-hint">方案 A/B 对比${hintBadgeHtml("存 A/B 两套参数，看 Δ 差值")}</h2>
      <div class="snapshot-actions">
        <button type="button" class="btn btn-scenario-a" id="pfSaveScenarioA">保存当前为方案 A</button>
        <button type="button" class="btn btn-scenario-b" id="pfSaveScenarioB">保存当前为方案 B</button>
        <button type="button" class="btn btn-ghost" id="pfClearScenarios">清除全部快照</button>
      </div>
      <div class="snapshot-cards">
        <div class="snapshot-card scenario-a" id="pfSnapshotCardA">
          <h4>方案 A</h4>
          <div class="meta" id="pfSnapshotMetaA">尚未保存</div>
          <div class="params" id="pfSnapshotParamsA">—</div>
          <button type="button" class="btn btn-ghost load-btn hidden" id="pfLoadScenarioA">载入到输入区</button>
        </div>
        <div class="snapshot-card scenario-b" id="pfSnapshotCardB">
          <h4>方案 B</h4>
          <div class="meta" id="pfSnapshotMetaB">尚未保存</div>
          <div class="params" id="pfSnapshotParamsB">—</div>
          <button type="button" class="btn btn-ghost load-btn hidden" id="pfLoadScenarioB">载入到输入区</button>
        </div>
      </div>
      <div class="compare-table-wrap hidden" id="pfCompareTableWrap">
        <table class="compare-table">
          <thead><tr><th>指标</th><th class="col-a">方案 A</th><th class="col-b">方案 B</th><th>Δ (B − A)</th></tr></thead>
          <tbody id="pfCompareTableBody"></tbody>
        </table>
      </div>
      <p class="compare-empty" id="pfCompareEmpty">保存方案 A 与方案 B 后，将在此显示对比结果</p>
    </div>
  </div>

  <div class="chart-section">
    <div class="card">
      <div class="card-header"><h2>敏感性分析（逾期率 × 毛利率）</h2></div>
      <div class="chart-desc" id="pfChartAnchorDesc"></div>
      <div class="chart-body" id="pfChartBody">
        <div class="chart-axis-y-title"><span>产品毛利率 (%)</span></div>
        <div class="chart-wrap" id="pfChartWrap">
          <canvas id="pfSensitivityChart"></canvas>
          <div class="chart-tooltip" id="pfChartTooltip"></div>
        </div>
        <div></div>
        <div class="chart-axis-x-title">客群逾期率 (%)</div>
      </div>
      <p class="chart-empty" id="pfChartEmpty">请先填写有效的输入参数以生成曲线</p>
      <div class="chart-annotations" id="pfChartAnnotations"></div>
      <div class="chart-legend">
        <span class="chart-legend-item"><span class="legend-line primary"></span>产品毛利率曲线</span>
        <span class="chart-legend-item"><span class="legend-line current"></span>当前逾期率</span>
        <span class="chart-legend-item"><span class="legend-line break-even"></span>盈亏平衡逾期率</span>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="pfToast"></div>
</section>`;
  }

  function parseNum(id) {
    const v = parseFloat($(id)?.value);
    return Number.isNaN(v) ? null : v;
  }

  function readParamsFromForm() {
    return {
      principal: parseNum("pfPrincipal"),
      totalRepayRatePct: parseNum("pfTotalRepayRate"),
      overdueRatePct: parseNum("pfOverdueRate"),
      recoveryRatePct: parseNum("pfRecoveryRate"),
      fundCostRatePct: parseNum("pfFundCostRate"),
      termMonths: parseNum("pfTermMonths"),
      cac: parseNum("pfCac"),
      collectionCostRatePct: parseNum("pfCollectionCostRate"),
    };
  }

  function applyParamsToForm(params) {
    if (!params) return;
    $("pfPrincipal").value = params.principal ?? "";
    $("pfTotalRepayRate").value = params.totalRepayRatePct ?? "";
    $("pfOverdueRate").value = params.overdueRatePct ?? "";
    $("pfRecoveryRate").value = params.recoveryRatePct ?? "";
    $("pfFundCostRate").value = params.fundCostRatePct ?? "";
    $("pfTermMonths").value = params.termMonths ?? "";
    $("pfCac").value = params.cac ?? "";
    $("pfCollectionCostRate").value = params.collectionCostRatePct ?? "";
  }

  function formatMoney(n) {
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPct(n) {
    return n.toFixed(2) + "%";
  }

  function formatParamsSummary(params) {
    return `P ${formatMoney(params.principal)} · 总应还率 ${params.totalRepayRatePct}% · 逾期率 ${params.overdueRatePct}% · 回收率 ${params.recoveryRatePct}% · 资金成本 ${params.fundCostRatePct}% · ${params.termMonths}月 · CAC ${formatMoney(params.cac)} · 催收 ${params.collectionCostRatePct}%`;
  }

  function formatMetricValue(_key, value, type) {
    if (value === null || value === undefined) return "--";
    if (type === "money") return formatMoney(value);
    if (type === "pct") return formatPct(value);
    return String(value);
  }

  function formatDelta(value, type) {
    if (value === null || value === undefined || Number.isNaN(value)) return "--";
    if (type === "money") {
      const sign = value >= 0 ? "+" : "−";
      return sign + formatMoney(Math.abs(value));
    }
    if (type === "pct") return (value > 0 ? "+" : "") + value.toFixed(2) + " pp";
    return String(value);
  }

  function loadScenariosFromStorage() {
    try {
      const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (raw) scenarios = JSON.parse(raw);
    } catch (_e) {
      scenarios = { A: null, B: null };
    }
  }

  function persistScenarios() {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
  }

  function showToast(msg) {
    const el = $("pfToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("visible"), 2200);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setMoney(id, n) {
    setText(id, formatMoney(n));
  }

  function setProfitStyle(valueEl, rowEl, value) {
    valueEl.classList.remove("positive", "negative");
    rowEl.classList.remove("positive-bg", "negative-bg");
    if (value > 0) {
      valueEl.classList.add("positive");
      rowEl.classList.add("positive-bg");
    } else if (value < 0) {
      valueEl.classList.add("negative");
      rowEl.classList.add("negative-bg");
    }
  }

  function clearResults() {
    [
      "pfOutTotalRepay", "pfOutInterestFee", "pfOutOverdueAmount", "pfOutNormalRepay",
      "pfOutOverdueRecovery", "pfOutOverdueLoss", "pfOutExpectedCollection",
      "pfOutGrossProfit", "pfOutGrossMargin", "pfOutFundCost", "pfOutCac", "pfOutCollectionCost",
      "pfOutTotalCost", "pfOutNetProfit", "pfOutRoi", "pfOutNetMargin",
      "pfOutEffectiveLoss", "pfOutBreakEven",
      "pfKpiNetProfit", "pfKpiNetMargin", "pfKpiRoi", "pfKpiBreakEven",
    ].forEach((id) => setText(id, "--"));
    const netProfitRow = $("pfNetProfitRow");
    const netProfitEl = $("pfOutNetProfit");
    if (netProfitEl) netProfitEl.classList.remove("positive", "negative");
    if (netProfitRow) netProfitRow.classList.remove("positive-bg", "negative-bg");
    $("pfDecisionCard")?.classList.remove("good", "warn", "bad");
    setText("pfDecisionBadge", "待测算");
    setText("pfDecisionText", "填写参数后自动给出投放建议");
    const diagnosis = $("pfDiagnosisList");
    if (diagnosis) diagnosis.innerHTML = "";
  }

  function clearChart() {
    chartState = null;
    $("pfChartBody")?.classList.add("hidden");
    $("pfChartWrap")?.classList.add("hidden");
    $("pfChartEmpty")?.classList.add("visible");
    const desc = $("pfChartAnchorDesc");
    if (desc) desc.textContent = "请先填写有效的输入参数";
    const ann = $("pfChartAnnotations");
    if (ann) ann.innerHTML = "";
    $("pfChartTooltip")?.classList.remove("visible");
  }

  function renderChartCanvas() {
    const s = chartState;
    if (!s) return;
    const { canvas, params, result, points, pad, plotW, plotH, yMin, yMax, yTicks, W, H, dpr, tickFont } = s;
    const xScale = s.xScale;
    const yScale = s.yScale;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const pal = RV.infra.chartPalette();
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = pal.label;
    ctx.font = tickFont;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = yMin + (yMax - yMin) * (i / yTicks);
      const py = yScale(yVal);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(yVal.toFixed(1) + "%", pad.left - 6, py);
    }
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const xVal = (100 / xTicks) * i;
      const px = xScale(xVal);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.stroke();
      ctx.textAlign = i === 0 ? "left" : i === xTicks ? "right" : "center";
      ctx.textBaseline = "top";
      ctx.fillText(xVal.toFixed(0) + "%", px, pad.top + plotH + 6);
    }
    if (yMin < 0 && yMax > 0) {
      const zy = yScale(0);
      ctx.strokeStyle = pal.tick;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, zy);
      ctx.lineTo(pad.left + plotW, zy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = xScale(p.x);
      const py = yScale(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    const currentOd = params.overdueRatePct;
    const cx = xScale(currentOd);
    const cy = yScale(result.grossMargin);
    ctx.strokeStyle = pal.danger;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, pad.top);
    ctx.lineTo(cx, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    if (result.breakEvenOverdueRate !== null && result.breakEvenOverdueRate >= 0 && result.breakEvenOverdueRate <= 100) {
      const bx = xScale(result.breakEvenOverdueRate);
      ctx.strokeStyle = pal.warn;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, pad.top);
      ctx.lineTo(bx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s.hover) {
      const hx = xScale(s.hover.od);
      const hy = yScale(s.hover.margin);
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + plotH);
      ctx.moveTo(pad.left, hy);
      ctx.lineTo(pad.left + plotW, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.accent;
      ctx.strokeStyle = pal.onAccent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawSensitivityChart(params, result) {
    const canvas = $("pfSensitivityChart");
    const wrap = $("pfChartWrap");
    const body = $("pfChartBody");
    const empty = $("pfChartEmpty");
    const desc = $("pfChartAnchorDesc");
    const annotations = $("pfChartAnnotations");
    const tooltip = $("pfChartTooltip");
    if (!canvas || !wrap) return;
    if (typeof wrap.getBoundingClientRect !== "function") return;
    body?.classList.remove("hidden");
    wrap.classList.remove("hidden");
    empty?.classList.remove("visible");
    tooltip?.classList.remove("visible");
    if (desc) {
      desc.innerHTML = `<div class="chart-desc-grid">
        <span>本金 P：${formatMoney(params.principal)}</span>
        <span>总应还率：${params.totalRepayRatePct.toFixed(1)}%</span>
        <span>逾期回收率：${params.recoveryRatePct.toFixed(1)}%</span>
        <span>资金成本率：${params.fundCostRatePct.toFixed(1)}%</span>
        <span>贷款期限：${params.termMonths} 月</span>
        <span>CAC：${formatMoney(params.cac)}</span>
        <span>催收成本率：${params.collectionCostRatePct.toFixed(1)}%</span>
      </div>`;
    }
    let annHtml = `<span class="chart-tag current"><span class="dot"></span>当前点：逾期率 ${params.overdueRatePct.toFixed(1)}%，毛利率 ${result.grossMargin.toFixed(2)}%</span>`;
    if (result.breakEvenOverdueRate !== null && result.breakEvenOverdueRate >= 0 && result.breakEvenOverdueRate <= 100) {
      annHtml += `<span class="chart-tag break-even"><span class="dot"></span>盈亏平衡：逾期率 ${result.breakEvenOverdueRate.toFixed(2)}%（毛利率 0%）</span>`;
    }
    if (annotations) annotations.innerHTML = annHtml;
    const points = buildCurveData(params);
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      if (!drawSensitivityChart._pending) {
        drawSensitivityChart._pending = true;
        requestAnimationFrame(() => {
          drawSensitivityChart._pending = false;
          drawSensitivityChart(params, result);
        });
      }
      return;
    }
    const W = rect.width;
    const H = rect.height;
    const tickFont = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    const tmpCtx = canvas.getContext("2d");
    tmpCtx.font = tickFont;
    const ys = points.map((p) => p.y);
    let yMin = Math.min(0, ...ys);
    let yMax = Math.max(...ys);
    if (yMax - yMin < 1) { yMin -= 5; yMax += 5; }
    const yPad = (yMax - yMin) * 0.08 || 5;
    yMin -= yPad;
    yMax += yPad;
    const yTickCount = 5;
    let maxYLabelW = 0;
    for (let i = 0; i <= yTickCount; i++) {
      const yVal = yMin + (yMax - yMin) * (i / yTickCount);
      maxYLabelW = Math.max(maxYLabelW, tmpCtx.measureText(yVal.toFixed(1) + "%").width);
    }
    const pad = { top: 16, right: 20, bottom: 28, left: maxYLabelW + 14 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    chartState = {
      canvas, wrap, tooltip, params, result, points, pad, plotW, plotH,
      yMin, yMax, yTicks: yTickCount, W, H, dpr, tickFont,
      xScale: (x) => pad.left + (x / 100) * plotW,
      yScale: (y) => pad.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH,
      hover: null,
    };
    renderChartCanvas();
  }

  function handleChartMouseMove(e) {
    if (!chartState) return;
    const { canvas, wrap, tooltip, pad, plotW, plotH, params } = chartState;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < pad.left || mx > pad.left + plotW || my < pad.top || my > pad.top + plotH) {
      chartState.hover = null;
      tooltip?.classList.remove("visible");
      renderChartCanvas();
      return;
    }
    const od = Math.max(0, Math.min(100, ((mx - pad.left) / plotW) * 100));
    const margin = grossMarginAtOverdueRate(params, od);
    chartState.hover = { od, margin };
    renderChartCanvas();
    if (tooltip) {
      tooltip.innerHTML = `逾期率：${od.toFixed(1)}%<br>毛利率：${margin.toFixed(2)}%`;
      tooltip.classList.add("visible");
      const wrapRect = wrap.getBoundingClientRect();
      const tipW = 130;
      const tipH = 44;
      let left = e.clientX - wrapRect.left + 14;
      let top = e.clientY - wrapRect.top - tipH - 8;
      if (left + tipW > wrapRect.width) left = e.clientX - wrapRect.left - tipW - 14;
      if (top < 0) top = e.clientY - wrapRect.top + 14;
      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    }
  }

  function handleChartMouseLeave() {
    if (!chartState) return;
    chartState.hover = null;
    chartState.tooltip?.classList.remove("visible");
    renderChartCanvas();
  }

  function renderDecisionSummary(result) {
    const card = $("pfDecisionCard");
    const badge = $("pfDecisionBadge");
    const text = $("pfDecisionText");
    const list = $("pfDiagnosisList");
    if (!card || !badge || !text || !list) return;
    card.classList.remove("good", "warn", "bad");
    const reasons = [];
    let level = "warn";
    let label = "谨慎投放";
    if (result.netProfit >= 200 && result.netMargin >= 2) {
      level = "good";
      label = "可投放";
      reasons.push("净利润充足，当前客群有正向空间");
    } else if (result.netProfit < 0 || result.netMargin < -1) {
      level = "bad";
      label = "不建议投放";
      reasons.push("净利润为负，当前口径下整体亏损");
    } else {
      reasons.push("盈利接近临界线，需控制逾期或优化成本");
    }
    if (result.breakEvenOverdueRate != null && result.breakEvenOverdueRate < 100) {
      reasons.push(`盈亏平衡逾期率 ${result.breakEvenOverdueRate.toFixed(1)}%，当前逾期率需留安全边际`);
    }
    reasons.push(`成本合计 ${formatMoney(result.totalCost)} 元/户（资金+获客+催收）`);
    card.classList.add(level);
    badge.textContent = label;
    text.textContent = `当前净利润 ${formatMoney(result.netProfit)} 元/户，净利率 ${formatPct(result.netMargin)}。`;
    list.innerHTML = reasons.map((r) => `<li>${r}</li>`).join("");
  }

  function recalculate() {
    const params = readParamsFromForm();
    const banner = $("pfErrorBanner");
    const errors = validate(params);
    if (errors.length > 0) {
      if (banner) {
        banner.textContent = errors[0];
        banner.classList.add("visible");
      }
      clearResults();
      clearChart();
      return;
    }
    banner?.classList.remove("visible");
    const r = calculate(params);
    setMoney("pfOutTotalRepay", r.totalRepay);
    setMoney("pfOutInterestFee", r.interestFee);
    setMoney("pfOutOverdueAmount", r.overdueAmount);
    setMoney("pfOutNormalRepay", r.normalRepay);
    setMoney("pfOutOverdueRecovery", r.overdueRecovery);
    setMoney("pfOutOverdueLoss", r.overdueLoss);
    setMoney("pfOutExpectedCollection", r.expectedCollection);
    setMoney("pfOutGrossProfit", r.grossProfit);
    setText("pfOutGrossMargin", formatPct(r.grossMargin));
    setMoney("pfOutFundCost", r.fundCost);
    setMoney("pfOutCac", r.cac);
    setMoney("pfOutCollectionCost", r.collectionCost);
    setMoney("pfOutTotalCost", r.totalCost);
    setMoney("pfOutNetProfit", r.netProfit);
    setText("pfOutRoi", formatPct(r.roi));
    setText("pfOutNetMargin", formatPct(r.netMargin));
    setText("pfOutEffectiveLoss", formatPct(r.effectiveLossRate));
    setText("pfOutBreakEven", r.breakEvenOverdueRate !== null ? formatPct(r.breakEvenOverdueRate) : "--");
    setMoney("pfKpiNetProfit", r.netProfit);
    setText("pfKpiNetMargin", formatPct(r.netMargin));
    setText("pfKpiRoi", formatPct(r.roi));
    setText("pfKpiBreakEven", r.breakEvenOverdueRate !== null ? formatPct(r.breakEvenOverdueRate) : "--");
    const netProfitEl = $("pfOutNetProfit");
    const netProfitRow = $("pfNetProfitRow");
    const kpiNetProfitEl = $("pfKpiNetProfit");
    if (netProfitEl && netProfitRow) setProfitStyle(netProfitEl, netProfitRow, r.netProfit);
    if (kpiNetProfitEl) {
      kpiNetProfitEl.classList.remove("positive", "negative");
      if (r.netProfit > 0) kpiNetProfitEl.classList.add("positive");
      if (r.netProfit < 0) kpiNetProfitEl.classList.add("negative");
    }
    renderDecisionSummary(r);
    drawSensitivityChart(params, r);
  }

  function renderSnapshotUI() {
    ["A", "B"].forEach((which) => {
      const snap = scenarios[which];
      const meta = $("pfSnapshotMeta" + which);
      const paramsEl = $("pfSnapshotParams" + which);
      const loadBtn = $("pfLoadScenario" + which);
      if (!snap) {
        if (meta) meta.textContent = "尚未保存";
        if (paramsEl) paramsEl.textContent = "—";
        loadBtn?.classList.add("hidden");
        return;
      }
      const t = new Date(snap.savedAt);
      if (meta) meta.textContent = "保存于 " + t.toLocaleString("zh-CN");
      if (paramsEl) paramsEl.textContent = formatParamsSummary(snap.params);
      loadBtn?.classList.remove("hidden");
    });
    const wrap = $("pfCompareTableWrap");
    const empty = $("pfCompareEmpty");
    const tbody = $("pfCompareTableBody");
    if (!scenarios.A || !scenarios.B) {
      wrap?.classList.add("hidden");
      empty?.classList.remove("hidden");
      if (tbody) tbody.innerHTML = "";
      return;
    }
    wrap?.classList.remove("hidden");
    empty?.classList.add("hidden");
    const rA = scenarios.A.result;
    const rB = scenarios.B.result;
    if (tbody) {
      tbody.innerHTML = COMPARE_METRICS.map((m) => {
        const vA = rA[m.key];
        const vB = rB[m.key];
        let delta = null;
        if (m.nullable && (vA == null || vB == null)) delta = null;
        else if (vA != null && vB != null) delta = vB - vA;
        const deltaClass = delta === null ? "" : delta > 0 ? "delta positive" : delta < 0 ? "delta negative" : "delta";
        return `<tr>
          <td>${m.label}</td>
          <td class="col-a">${formatMetricValue(m.key, vA, m.type)}</td>
          <td class="col-b">${formatMetricValue(m.key, vB, m.type)}</td>
          <td class="${deltaClass}">${formatDelta(delta, m.type)}</td>
        </tr>`;
      }).join("");
    }
  }

  function saveScenario(which) {
    const params = readParamsFromForm();
    const errors = validate(params);
    if (errors.length > 0) {
      showToast("请先修正输入：" + errors[0]);
      return;
    }
    const result = calculate(params);
    scenarios[which] = { params: { ...params }, result: { ...result }, savedAt: new Date().toISOString() };
    persistScenarios();
    renderSnapshotUI();
    showToast(`已保存方案 ${which}`);
  }

  function clearAllScenarios() {
    scenarios = { A: null, B: null };
    persistScenarios();
    renderSnapshotUI();
    showToast("已清除全部快照");
  }

  function applyScenarioToForm(which) {
    const snap = scenarios[which];
    if (!snap) return;
    applyParamsToForm(snap.params);
    recalculate();
    showToast(`已载入方案 ${which} 到输入区`);
  }

  function bindProfitabilityEvents() {
    if (eventsBound) return;
    const tab = $("tab-profitability");
    if (!tab) return;
    eventsBound = true;
    PF_INPUT_IDS.forEach((id) => {
      const el = $(id);
      el?.addEventListener("input", recalculate);
      el?.addEventListener("change", recalculate);
    });
    $("pfSensitivityChart")?.addEventListener("mousemove", handleChartMouseMove);
    $("pfSensitivityChart")?.addEventListener("mouseleave", handleChartMouseLeave);
    $("pfSaveScenarioA")?.addEventListener("click", () => saveScenario("A"));
    $("pfSaveScenarioB")?.addEventListener("click", () => saveScenario("B"));
    $("pfClearScenarios")?.addEventListener("click", clearAllScenarios);
    $("pfLoadScenarioA")?.addEventListener("click", () => applyScenarioToForm("A"));
    $("pfLoadScenarioB")?.addEventListener("click", () => applyScenarioToForm("B"));
    if (!bindProfitabilityEvents._resize) {
      bindProfitabilityEvents._resize = true;
      window.addEventListener("resize", () => {
        if ($("tab-profitability")) recalculate();
      });
    }
  }

  function mountProfitabilityTabShell() {
    const doc = ensureReportDocument();
    const old = doc.querySelector("#tab-profitability");
    if (old) old.remove();
    doc.insertAdjacentHTML("beforeend", renderProfitabilityTabShell());
  }

  function snapshotProfitabilityUiState() {
    if (!$("tab-profitability")) return null;
    return { params: readParamsFromForm() };
  }

  function restoreProfitabilityUiState(state) {
    if (!state) return;
    if (state.params) applyParamsToForm(state.params);
    else applyParamsToForm(DEFAULT_PARAMS);
    loadScenariosFromStorage();
    renderSnapshotUI();
    recalculate();
  }

  function setupProfitabilityTabShell() {
    mountProfitabilityTabShell();
    eventsBound = false;
    bindProfitabilityEvents();
    loadScenariosFromStorage();
    renderSnapshotUI();
    if (!$("pfPrincipal")?.value) applyParamsToForm(DEFAULT_PARAMS);
    recalculate();
  }

  function remountProfitabilityTabAfterReport(priorState) {
    setupProfitabilityTabShell();
    restoreProfitabilityUiState(priorState);
  }

  function initProfitabilityTab({ showTab: showPfTab = false } = {}) {
    setupProfitabilityTabShell();
    if (showPfTab) RV.ui.report.post.showTab("profitability");
  }

  Object.assign(target, {
    renderProfitabilityTabShell,
    mountProfitabilityTabShell,
    bindProfitabilityEvents,
    snapshotProfitabilityUiState,
    restoreProfitabilityUiState,
    setupProfitabilityTabShell,
    remountProfitabilityTabAfterReport,
    initProfitabilityTab,
    recalculate,
    readParamsFromForm,
    SCENARIO_STORAGE_KEY,
  });
})(window.RV);
