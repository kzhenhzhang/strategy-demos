/**
 * Form / table / result rendering for the admission iteration wizard.
 */
(function (global) {
  "use strict";

  const STEPS = [
    { id: "data", title: "数据" },
    { id: "goals", title: "目标与窗" },
    { id: "baseline", title: "Baseline" },
    { id: "run", title: "计算" },
    { id: "result", title: "报告" },
  ];

  function $(id) { return document.getElementById(id); }

  function optionList(headers, selected) {
    const opts = ['<option value="">—</option>'].concat(
      (headers || []).map((h) =>
        `<option value="${escAttr(h)}"${h === selected ? " selected" : ""}>${esc(h)}</option>`
      )
    );
    return opts.join("");
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, "&quot;");
  }

  function guess(headers, names) {
    for (const n of names) {
      if (headers.includes(n)) return n;
    }
    return "";
  }

  /** Distinct trimmed values for a column (capped). */
  function uniqueColValues(rows, col, cap) {
    if (!col || !rows || !rows.length) return [];
    const set = new Set();
    for (const r of rows) {
      const v = String(r[col] ?? "").trim();
      if (v) set.add(v);
      if (set.size >= (cap || 500)) break;
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  }

  function renderSegFilterRows(state) {
    const h = state.headers || [];
    const filters = state.segmentFilters || [];
    if (!filters.length) {
      return `<p class="ai-hint" id="segFilterEmpty">尚未添加筛选条件（不筛=全量客群，仍受时间窗与 B 组约束）</p>`;
    }
    return filters
      .map((f, idx) => {
        const vals = uniqueColValues(state.rows, f.col);
        const selected = new Set((f.values || []).map((v) => String(v)));
        const valueOpts = vals.length
          ? vals
              .map(
                (v) =>
                  `<option value="${escAttr(v)}"${selected.has(v) ? " selected" : ""}>${esc(v)}</option>`
              )
              .join("")
          : `<option value="" disabled>${f.col ? "（该列无枚举值）" : "（请先选变量）"}</option>`;
        return `
        <div class="ai-seg-row" data-seg-row data-idx="${idx}">
          <div class="ai-field">
            <label>变量</label>
            <select class="seg-col" data-idx="${idx}">${optionList(h, f.col || "")}</select>
          </div>
          <div class="ai-field ai-seg-values">
            <label>取值（多选 · ⌘/Ctrl）</label>
            <select class="seg-values" data-idx="${idx}" multiple size="5">${valueOpts}</select>
          </div>
          <div class="ai-seg-row-actions">
            <button type="button" class="ai-btn seg-remove" data-idx="${idx}">删除</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderStepNav(activeId, doneIds) {
    const nav = $("stepNav");
    if (!nav) return;
    nav.innerHTML = STEPS.map((s) => {
      const cls = [
        "ai-step-pill",
        s.id === activeId ? "active" : "",
        doneIds.has(s.id) ? "done" : "",
      ].filter(Boolean).join(" ");
      return `<span class="${cls}">${esc(s.title)}</span>`;
    }).join("");
  }

  function renderDecision(kind, text) {
    const el = $("decisionBar");
    if (!el) return;
    el.className = `ai-decision ${kind || ""}`;
    const badge = kind === "good" ? "就绪" : kind === "bad" ? "阻塞" : kind === "warn" ? "注意" : "状态";
    el.innerHTML = `<span class="ai-badge">${badge}</span><div class="ai-decision-text">${esc(text)}</div>`;
  }

  function renderKpis(items) {
    const el = $("kpiBar");
    if (!el) return;
    if (!items || !items.length) {
      el.classList.add("ai-hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("ai-hidden");
    el.innerHTML = items.map((it) =>
      `<article><div class="k">${esc(it.k)}</div><div class="v">${esc(it.v)}</div></article>`
    ).join("");
  }

  function renderDataStep(state) {
    const h = state.headers || [];
    return `
    <div class="ai-card" data-step="data">
      <h2>1. 上传 CSV 与字段映射</h2>
      <div class="ai-field">
        <label>CSV 文件</label>
        <input type="file" id="csvFile" accept=".csv,text/csv" />
        <button type="button" class="ai-btn ai-btn-primary" id="btnLoadSample">载入示例</button>
      </div>
      <p class="ai-hint" id="csvMeta">${state.rows ? `已载入 ${state.rows.length} 行 · ${h.length} 列` : "尚未上传"}</p>
      <p class="ai-hint">挖规与方案停止条件只在 <strong>B 组</strong>（决策组=b组）；A 组仅作现状对照。客群筛选不等于决策组。</p>
      <h3>字段映射</h3>
      <div class="ai-grid-2">
        <div class="ai-field"><label>决策组列（A/B）</label>
          <select id="f_decisionCol">${optionList(h, state.fields.decisionCol || guess(h, ["决策组"]))}</select></div>
        <div class="ai-field"><label>其它分组列（可选）</label>
          <select id="f_groupCol">${optionList(h, state.fields.groupCol || "")}</select></div>
        <div class="ai-field"><label>进件量</label>
          <select id="f_applyCol">${optionList(h, state.fields.applyCol || guess(h, ["进件量"]))}</select></div>
        <div class="ai-field"><label>通过量</label>
          <select id="f_passCol">${optionList(h, state.fields.passCol || guess(h, ["通过量"]))}</select></div>
        <div class="ai-field"><label>风险分子</label>
          <select id="f_riskNumCol">${optionList(h, state.fields.riskNumCol || guess(h, ["fpd1_cnt_fz", "fpd7_cnt_fz"]))}</select></div>
        <div class="ai-field"><label>风险分母</label>
          <select id="f_riskDenCol">${optionList(h, state.fields.riskDenCol || guess(h, ["fpd1_cnt_fm", "fpd7_cnt_fm"]))}</select></div>
        <div class="ai-field"><label>贷前日期</label>
          <select id="f_preDateCol">${optionList(h, state.fields.preDateCol || guess(h, ["submit_date", "申请日期"]))}</select></div>
        <div class="ai-field"><label>贷后月份</label>
          <select id="f_postMonthCol">${optionList(h, state.fields.postMonthCol || guess(h, ["submit_month", "申请月份"]))}</select></div>
      </div>
      <h3>客群筛选（可选）</h3>
      <p class="ai-hint">可添加多个变量；列之间为 AND，同一变量多选枚举值为 OR。空取值=该行不生效。</p>
      <div id="segFilterList" class="ai-seg-list">${renderSegFilterRows(state)}</div>
      <div class="ai-actions" style="margin-top:.5rem">
        <button type="button" class="ai-btn" id="btnAddSegFilter">添加筛选条件</button>
      </div>
      <div class="ai-actions">
        <button type="button" class="ai-btn ai-btn-primary" id="btnToGoals">下一步：目标与窗</button>
      </div>
    </div>`;
  }

  function renderGoalsStep(state) {
    const t = state.targets;
    const w = state.trainWindow;
    const b = state.backtestWindow;
    return `
    <div class="ai-card" data-step="goals">
      <h2>2. 目标与时间窗</h2>
      <div class="ai-grid-2">
        <div class="ai-field"><label>风险目标（小数，如 0.28）</label>
          <input id="t_risk" type="number" step="0.001" min="0" max="1" value="${escAttr(t.risk)}" /></div>
        <div class="ai-field"><label>策略放行率目标（小数，如 0.80）</label>
          <input id="t_pass" type="number" step="0.001" min="0" max="1" value="${escAttr(t.pass)}" /></div>
        <div class="ai-field"><label>Swap 倍数 k</label>
          <input id="t_k" type="number" step="0.05" min="0.5" max="3" value="${escAttr(t.k)}" /></div>
      </div>
      <h3>训练窗</h3>
      <div class="ai-grid-2">
        <div class="ai-field"><label>贷后月份起（含）</label>
          <input id="w_postFrom" value="${escAttr(w.postFrom)}" placeholder="2026-02" /></div>
        <div class="ai-field"><label>贷后月份止（含，可选）</label>
          <input id="w_postTo" value="${escAttr(w.postTo)}" placeholder="" /></div>
        <div class="ai-field"><label>贷前日期起（含）</label>
          <input id="w_preFrom" value="${escAttr(w.preFrom)}" placeholder="2026-07-10" /></div>
        <div class="ai-field"><label>贷前日期止（含，可选）</label>
          <input id="w_preTo" value="${escAttr(w.preTo)}" placeholder="" /></div>
      </div>
      <h3>回测窗（可选）</h3>
      <div class="ai-grid-2">
        <div class="ai-field"><label>回测贷后月份起</label>
          <input id="bt_postFrom" value="${escAttr(b.postFrom)}" placeholder="留空则不做回测" /></div>
        <div class="ai-field"><label>回测贷后月份止</label>
          <input id="bt_postTo" value="${escAttr(b.postTo)}" /></div>
        <div class="ai-field"><label>回测贷前日期起</label>
          <input id="bt_preFrom" value="${escAttr(b.preFrom)}" /></div>
        <div class="ai-field"><label>回测贷前日期止</label>
          <input id="bt_preTo" value="${escAttr(b.preTo)}" /></div>
      </div>
      <div class="ai-checks">
        <label><input type="checkbox" id="bt_samePre" ${b.preSameAsTrain ? "checked" : ""} /> 回测贷前窗与训练窗相同</label>
      </div>
      <div class="ai-actions">
        <button type="button" class="ai-btn" id="btnBackData">上一步</button>
        <button type="button" class="ai-btn ai-btn-primary" id="btnToBaseline">下一步：Baseline</button>
      </div>
    </div>`;
  }

  function renderBaselineStep(state) {
    return `
    <div class="ai-card" data-step="baseline">
      <h2>3. Baseline 规则</h2>
      <p class="ai-hint">每行一条。支持 <code>列&gt;阈值</code>、<code>列 gte 阈值</code>、<code>列=1</code>、<code>binary:列名</code>。</p>
      <div class="ai-field">
        <label>硬规则</label>
        <textarea id="hardRules">${esc(state.hardRulesText)}</textarea>
      </div>
      <div class="ai-field">
        <label>线上软规则</label>
        <textarea id="softRules">${esc(state.softRulesText)}</textarea>
      </div>
      <div class="ai-checks">
        <label><input type="checkbox" id="keepSoft" ${state.keepOnlineSoft ? "checked" : ""} /> 老软规则保留进新策略</label>
      </div>
      <details class="ai-advanced">
        <summary>挖规参数（高级）</summary>
        <div class="ai-grid-2" style="margin-top:0.65rem">
          <div class="ai-field"><label>最低命中进件量</label>
            <input id="m_minHit" type="number" step="1" value="${escAttr(state.mineOpts.minHit)}" /></div>
          <div class="ai-field"><label>命中绝对风险下限</label>
            <input id="m_minAbs" type="number" step="0.01" value="${escAttr(state.mineOpts.minAbsRisk)}" /></div>
          <div class="ai-field"><label>最低 Lift（0=取消）</label>
            <input id="m_minLift" type="number" step="0.05" value="${escAttr(state.mineOpts.minLift)}" /></div>
          <div class="ai-field"><label>最大候选数</label>
            <input id="m_maxCand" type="number" step="1" value="${escAttr(state.mineOpts.maxCandidates)}" /></div>
          <div class="ai-field"><label>最大挖规轮数</label>
            <input id="m_rounds" type="number" step="1" value="${escAttr(state.mineOpts.residualRounds)}" /></div>
        </div>
        <p class="ai-hint">潜在模型：列名前缀 p3_/reb_/p4_ 按 B 组整体 KS Top10；切点默认仅 ≥（gte）。风险门禁用 fpd1_cnt% Lift，并看近 3 个月跨月稳定性。</p>
      </details>
      <div class="ai-actions">
        <button type="button" class="ai-btn" id="btnBackGoals">上一步</button>
        <button type="button" class="ai-btn ai-btn-primary" id="btnToRun">下一步：开始计算</button>
      </div>
    </div>`;
  }

  function renderRunStep() {
    return `
    <div class="ai-card" data-step="run">
      <h2>4. 开始计算</h2>
      <p class="ai-hint">阶段：现状 → 挖规 → 组装双方案 → Swap → 瀑布 →（可选回测）。大 CSV 会分批让出主线程。</p>
      <div class="ai-actions">
        <button type="button" class="ai-btn" id="btnBackBaseline">上一步</button>
        <button type="button" class="ai-btn ai-btn-primary" id="btnRun">开始计算</button>
      </div>
    </div>`;
  }

  function renderResultStep(report) {
    if (!report) {
      return `<div class="ai-card"><h2>5. 报告</h2><p class="ai-hint">尚未产出结果。</p></div>`;
    }
    const pct = global.AdmissionReport.pct;
    const rp = report.riskPlan || {};
    const pp = report.passPlan || {};
    const sq = report.statusQuo || {};
    return `
    <div class="ai-card" data-step="result">
      <h2>5. 预览与下载</h2>
      <div class="ai-table-wrap" style="margin-bottom:0.75rem">
        <table class="ai-table">
          <thead><tr><th>现状（训练窗）</th><th>B 组</th><th>A 组</th></tr></thead>
          <tbody>
            <tr><td>贷后风险 fpd1_cnt%</td><td>${esc(pct(sq.riskB?.rate))}</td><td>${esc(pct(sq.riskA?.rate))}</td></tr>
            <tr><td>贷前历史通过率</td><td>${esc(pct(sq.passB?.rate))}</td><td>${esc(pct(sq.passA?.rate))}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="ai-table-wrap">
        <table class="ai-table">
          <thead><tr><th>方案（B 组）</th><th>策略风险</th><th>策略放行率</th><th>R̂</th><th>说明</th></tr></thead>
          <tbody>
            <tr>
              <td>风险向</td>
              <td>${esc(pct(rp.risk?.rate))}</td>
              <td>${esc(pct(rp.pass?.rate))}</td>
              <td>${esc(pct(report.planDetails?.risk?.swap?.Rhat?.R))}</td>
              <td>${esc(rp.gap || "双达标")}</td>
            </tr>
            <tr>
              <td>放行率向</td>
              <td>${esc(pct(pp.risk?.rate))}</td>
              <td>${esc(pct(pp.pass?.rate))}</td>
              <td>${esc(pct(report.planDetails?.pass?.swap?.Rhat?.R))}</td>
              <td>${esc(pp.gap || "双达标")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>风险向规则</h3>
      <ul>${(rp.rules || []).map((r) => `<li><code>${esc(r)}</code></li>`).join("") || "<li class='ai-hint'>（无）</li>"}</ul>
      <h3>放行率向规则</h3>
      <ul>${(pp.rules || []).map((r) => `<li><code>${esc(r)}</code></li>`).join("") || "<li class='ai-hint'>（无）</li>"}</ul>
      <div class="ai-actions">
        <button type="button" class="ai-btn ai-btn-primary" id="btnDownload">下载报告 HTML</button>
        <button type="button" class="ai-btn" id="btnRerun">重新计算</button>
      </div>
    </div>`;
  }

  function setProgress(pct, msg, logLine) {
    const box = $("progressBox");
    const fill = $("progressFill");
    const label = $("progressLabel");
    const log = $("progressLog");
    if (!box) return;
    box.classList.remove("ai-hidden");
    if (pct != null && fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (msg && label) label.textContent = msg;
    if (logLine && log) {
      log.textContent += (log.textContent ? "\n" : "") + logLine;
      log.scrollTop = log.scrollHeight;
    }
  }

  function clearProgress() {
    const log = $("progressLog");
    if (log) log.textContent = "";
    const fill = $("progressFill");
    if (fill) fill.style.width = "0%";
  }

  function showError(msg) {
    const el = $("errorBox");
    if (!el) return;
    if (!msg) { el.classList.add("ai-hidden"); el.textContent = ""; return; }
    el.classList.remove("ai-hidden");
    el.textContent = msg;
  }

  global.AdmissionUI = {
    STEPS,
    renderStepNav,
    renderDecision,
    renderKpis,
    renderDataStep,
    renderGoalsStep,
    renderBaselineStep,
    renderRunStep,
    renderResultStep,
    renderSegFilterRows,
    uniqueColValues,
    setProgress,
    clearProgress,
    showError,
    guess,
  };
})(typeof window !== "undefined" ? window : global);
