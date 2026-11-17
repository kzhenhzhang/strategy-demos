/**
 * 资产包 EL 调配 Tab UI（对齐风险目标测算交互模式）
 */
(function (RV) {
  "use strict";
  var target = RV.ui.report.elAllocator = RV.ui.report.elAllocator || {};
  const $ = (id) => document.getElementById(id);
  const D = RV.domain.elAllocator;
  const DEFAULT_PACKAGES = D.DEFAULT_PACKAGES;
  const DEFAULT_OPTS = D.DEFAULT_OPTS;
  const optimize = D.optimize;
  const ensureReportDocument = (...args) => RV.ui.report.analysis.ensureReportDocument(...args);
  const hintBadgeHtml = RV.infra.hintBadgeHtml;
  const esc = RV.infra.esc || ((s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;"));

  const COL_KEYS = ["name", "risk", "share", "pass", "ticket", "util"];
  const COL_HEADERS = ["资产包", "风险%", "人数占比%", "通过率%", "放款件均", "用信率%"];

  let eventsBound = false;
  let packagesUi = DEFAULT_PACKAGES.map(toUiPackage);
  let lastResult = null;

  function toUiPackage(p, idx) {
    return {
      name: p.name || `资产包${idx + 1}`,
      risk: +(p.risk * 100).toFixed(4),
      share: +(p.share * 100).toFixed(4),
      pass: +(p.pass * 100).toFixed(4),
      ticket: p.ticket,
      util: +(p.util * 100).toFixed(4),
    };
  }

  function toDomainPackages(list) {
    return list.map((p, i) => ({
      name: p.name || `资产包${i + 1}`,
      risk: Number(p.risk) / 100,
      share: Number(p.share) / 100,
      pass: Number(p.pass) / 100,
      ticket: Number(p.ticket),
      util: Number(p.util) / 100,
    }));
  }

  function fmtPct(n, digits) {
    if (n == null || Number.isNaN(n)) return "--";
    return `${(n * 100).toFixed(digits)}%`;
  }

  function fmtDelta(rel) {
    if (rel == null || Number.isNaN(rel) || Math.abs(rel) < 1e-12) {
      return `<span class="ea-delta-flat">0.00%</span>`;
    }
    const cls = rel > 0 ? "ea-delta-up" : "ea-delta-down";
    const sign = rel > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${(rel * 100).toFixed(2)}%</span>`;
  }

  function parseNumberCell(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    s = s.replace(/,/g, "").replace(/，/g, "").replace(/%/g, "");
    return Number(s);
  }

  function renderElAllocatorTabShell() {
    return `<section id="tab-el-allocator" class="report-tab-section">
<div class="container">
  <header class="ea-header">
    <h1 class="rv-heading-with-hint">资产包 EL 调配${hintBadgeHtml("固定人数/用信，调通过率·件均·风险")}</h1>
    <p>组合 EL = 金额占比加权风险；金额占比由 人数占比 × 通过率 × 用信率 × 放款件均 归一化得到。无需 CSV。</p>
  </header>

  <div class="ea-decision" id="eaDecisionCard">
    <span class="ea-decision-badge" id="eaDecisionBadge">待测算</span>
    <div class="ea-decision-text" id="eaDecisionText">填写资产包数据后点击计算，或修改约束后自动重算</div>
  </div>

  <div class="ea-kpi-grid">
    <article class="ea-kpi-card">
      <span class="kpi-label">当前组合 EL</span>
      <strong class="kpi-value" id="eaKpiCurrent">--</strong>
      <div class="kpi-sub" id="eaKpiCurrentSub">由输入表推算</div>
    </article>
    <article class="ea-kpi-card">
      <span class="kpi-label">建议后组合 EL</span>
      <strong class="kpi-value" id="eaKpiBest">--</strong>
      <div class="kpi-sub" id="eaKpiBestSub">相对当前</div>
    </article>
    <article class="ea-kpi-card">
      <span class="kpi-label">相对目标</span>
      <strong class="kpi-value" id="eaKpiGap">--</strong>
      <div class="kpi-sub" id="eaKpiGapSub">目标缺口</div>
    </article>
    <article class="ea-kpi-card">
      <span class="kpi-label">算法 / 耗时</span>
      <strong class="kpi-value" id="eaKpiAlgo" style="font-size:1rem">--</strong>
      <div class="kpi-sub" id="eaKpiAlgoSub">评估次数</div>
    </article>
  </div>

  <div class="ea-main-grid">
    <div class="ea-card">
      <h2 class="rv-heading-with-hint">目标与约束${hintBadgeHtml("相对变动与同向约束")}</h2>
      <div id="eaErrorBanner" class="ea-error-banner" hidden></div>

      <div class="ea-field">
        <label for="eaTargetEl">目标组合 EL</label>
        <div class="ea-input-wrap"><input type="number" id="eaTargetEl" min="0" max="100" step="0.01"><span class="ea-suffix">%</span></div>
      </div>
      <div class="ea-field">
        <label for="eaRelMax">相对变动上限</label>
        <div class="ea-input-wrap"><input type="number" id="eaRelMax" min="0.1" max="50" step="0.1"><span class="ea-suffix">%</span></div>
      </div>
      <div class="ea-field">
        <label for="eaGridN">搜索精度</label>
        <div class="ea-input-wrap">
          <select id="eaGridN">
            <option value="3">3（快）</option>
            <option value="5" selected>5（推荐）</option>
            <option value="7">7（更细）</option>
            <option value="9">9（最细）</option>
          </select>
        </div>
      </div>
      <div class="ea-field">
        <label for="eaObjective">优化目标</label>
        <div class="ea-input-wrap">
          <select id="eaObjective">
            <option value="min" selected>尽量压低组合 EL</option>
            <option value="target">贴近目标 EL</option>
          </select>
        </div>
      </div>
      <div class="ea-field">
        <label for="eaAlgo">求解算法</label>
        <div class="ea-input-wrap">
          <select id="eaAlgo">
            <option value="auto" selected>自动</option>
            <option value="descent">多起点坐标下降</option>
            <option value="grid">网格穷举</option>
          </select>
        </div>
      </div>
      <div class="ea-field">
        <label for="eaRestarts">随机重启次数</label>
        <div class="ea-input-wrap"><input type="number" id="eaRestarts" min="4" max="200" step="1" value="24"></div>
      </div>

      <div class="ea-checks">
        <label><input type="checkbox" id="eaCouplePR" checked> 通过率 ↔ 风险同向</label>
        <label><input type="checkbox" id="eaCoupleAR" checked> 件均 ↔ 风险同向</label>
        <label><input type="checkbox" id="eaRiskOnlyDown"> 风险只许下降</label>
      </div>

      <div class="ea-actions">
        <button type="button" class="ea-btn ea-btn-primary" id="eaBtnRun">计算建议</button>
        <button type="button" class="ea-btn" id="eaBtnReset">恢复示例</button>
        <button type="button" class="ea-btn" id="eaBtnAdd">增加一行</button>
        <button type="button" class="ea-btn" id="eaBtnCopy">复制表格</button>
      </div>
      <p class="ea-hint" id="eaShareHint">人数占比之和建议为 100%</p>
      <div class="ea-formula">
        <div><code>Vᵢ = 人数占比ᵢ × 通过率ᵢ × 用信率ᵢ × 放款件均ᵢ</code></div>
        <div><code>wᵢ = Vᵢ / ΣV　·　EL = Σ wᵢ × 风险ᵢ</code></div>
        <div>同向：上调通过率/件均 ⇒ 该包风险不能下降；要降风险 ⇒ 通过率与件均不能上调。</div>
      </div>
    </div>

    <div class="ea-card">
      <h2 class="rv-heading-with-hint">资产包输入表${hintBadgeHtml("可点格编辑，支持 Excel 粘贴")}</h2>
      <p class="ea-hint" style="margin-top:0.35rem">点中格子后粘贴（⌘/Ctrl+V）可批量填入；含表头则整表替换。</p>
      <div class="ea-table-wrap">
        <table class="ea-sheet" id="eaInputTable">
          <thead>
            <tr>
              ${COL_HEADERS.map((h) => `<th>${h}</th>`).join("")}
              <th></th>
            </tr>
          </thead>
          <tbody id="eaInputBody"></tbody>
        </table>
      </div>

      <h2 class="rv-heading-with-hint" style="margin-top:1.1rem">调配建议${hintBadgeHtml("建议通过率 / 件均 / 风险")}</h2>
      <div class="ea-table-wrap">
        <table class="ea-result-table" id="eaResultTable">
          <thead>
            <tr>
              <th>资产包</th>
              <th>建议通过率</th>
              <th>Δ通过率</th>
              <th>建议件均</th>
              <th>Δ件均</th>
              <th>建议风险</th>
              <th>Δ风险</th>
              <th>当前占比</th>
              <th>建议占比</th>
            </tr>
          </thead>
          <tbody id="eaResultBody">
            <tr><td colspan="9" class="ea-empty">计算后显示建议</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
</section>`;
  }

  function readOptsFromForm() {
    return {
      targetEl: Number($("eaTargetEl")?.value) / 100,
      relMax: Number($("eaRelMax")?.value) / 100,
      gridN: Number($("eaGridN")?.value) || 5,
      objective: $("eaObjective")?.value || "min",
      algo: $("eaAlgo")?.value || "auto",
      restarts: Math.max(4, Number($("eaRestarts")?.value) || 24),
      couplePR: !!$("eaCouplePR")?.checked,
      coupleAR: !!$("eaCoupleAR")?.checked,
      riskOnlyDown: !!$("eaRiskOnlyDown")?.checked,
    };
  }

  function applyOptsToForm(opts) {
    const o = { ...DEFAULT_OPTS, ...(opts || {}) };
    if ($("eaTargetEl")) $("eaTargetEl").value = String(+((o.targetEl * 100).toFixed(4)));
    if ($("eaRelMax")) $("eaRelMax").value = String(+((o.relMax * 100).toFixed(4)));
    if ($("eaGridN")) $("eaGridN").value = String(o.gridN || 5);
    if ($("eaObjective")) $("eaObjective").value = o.objective || "min";
    if ($("eaAlgo")) $("eaAlgo").value = o.algo || "auto";
    if ($("eaRestarts")) $("eaRestarts").value = String(o.restarts || 24);
    if ($("eaCouplePR")) $("eaCouplePR").checked = o.couplePR !== false;
    if ($("eaCoupleAR")) $("eaCoupleAR").checked = o.coupleAR !== false;
    if ($("eaRiskOnlyDown")) $("eaRiskOnlyDown").checked = !!o.riskOnlyDown;
  }

  function showError(msg) {
    const el = $("eaErrorBanner");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function setDecision(kind, badge, text) {
    const card = $("eaDecisionCard");
    const b = $("eaDecisionBadge");
    const t = $("eaDecisionText");
    if (card) card.className = `ea-decision${kind ? ` ${kind}` : ""}`;
    if (b) b.textContent = badge;
    if (t) t.textContent = text;
  }

  function updateShareHint() {
    const sum = packagesUi.reduce((a, r) => a + Number(r.share || 0), 0);
    const el = $("eaShareHint");
    if (!el) return;
    if (Math.abs(sum - 100) > 0.05) {
      el.textContent = `人数占比之和 = ${sum.toFixed(2)}%（建议为 100%）`;
      el.style.color = "var(--text-danger-dark)";
    } else {
      el.textContent = `人数占比之和 = ${sum.toFixed(2)}%`;
      el.style.color = "";
    }
  }

  function syncPackagesFromDom() {
    const body = $("eaInputBody");
    if (!body) return;
    body.querySelectorAll("td.ea-cell").forEach((td) => {
      const i = Number(td.dataset.i);
      const k = td.dataset.k;
      if (!packagesUi[i]) return;
      const text = td.textContent.trim();
      if (k === "name") packagesUi[i].name = text || `资产包${i + 1}`;
      else {
        const n = parseNumberCell(text);
        if (Number.isFinite(n)) packagesUi[i][k] = n;
      }
    });
  }

  function renderInputSheet(focusAt) {
    const body = $("eaInputBody");
    if (!body) return;
    body.innerHTML = "";
    packagesUi.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = COL_KEYS.map((k, c) => {
        const val = k === "name" ? esc(row.name) : row[k];
        return `<td class="ea-cell" contenteditable="true" data-k="${k}" data-i="${i}" data-c="${c}">${val}</td>`;
      }).join("") + `<td><button type="button" class="ea-btn" data-del="${i}" ${packagesUi.length <= 2 ? "disabled" : ""}>删</button></td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll("td.ea-cell").forEach((td) => {
      td.addEventListener("blur", () => {
        const i = Number(td.dataset.i);
        const k = td.dataset.k;
        const text = td.textContent.trim();
        if (k === "name") {
          packagesUi[i].name = text || `资产包${i + 1}`;
          td.textContent = packagesUi[i].name;
        } else {
          const n = parseNumberCell(text);
          if (Number.isFinite(n)) {
            packagesUi[i][k] = n;
            td.textContent = String(n);
          } else {
            td.textContent = String(packagesUi[i][k]);
            showError("请输入有效数字");
          }
        }
        updateShareHint();
      });
      td.addEventListener("keydown", (e) => {
        const i = Number(td.dataset.i);
        const c = Number(td.dataset.c);
        if (e.key === "Enter") {
          e.preventDefault();
          td.blur();
          const next = body.querySelector(`td.ea-cell[data-i="${i + 1}"][data-c="${c}"]`);
          if (next) next.focus();
        } else if (e.key === "ArrowDown") {
          const next = body.querySelector(`td.ea-cell[data-i="${i + 1}"][data-c="${c}"]`);
          if (next) { e.preventDefault(); td.blur(); next.focus(); }
        } else if (e.key === "ArrowUp") {
          const prev = body.querySelector(`td.ea-cell[data-i="${i - 1}"][data-c="${c}"]`);
          if (prev) { e.preventDefault(); td.blur(); prev.focus(); }
        }
      });
    });

    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncPackagesFromDom();
        packagesUi.splice(Number(btn.dataset.del), 1);
        renderInputSheet();
        recalculate();
      });
    });

    updateShareHint();
    if (focusAt) {
      const el = body.querySelector(`td.ea-cell[data-i="${focusAt.i}"][data-c="${focusAt.c}"]`);
      if (el) el.focus();
    }
  }

  function splitLine(line) {
    if (line.includes("\t")) return line.split("\t").map((x) => x.trim());
    if (line.includes(",")) return line.split(",").map((x) => x.trim());
    if (line.includes("，")) return line.split("，").map((x) => x.trim());
    return line.trim().split(/\s{2,}|\s+/).map((x) => x.trim());
  }

  function clipboardToMatrix(text) {
    return String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r\n|\n|\r/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length)
      .map(splitLine);
  }

  function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, "").replace(/%/g, "");
  }

  const HEADER_MAP = {
    "资产包": "name", "名称": "name", "name": "name",
    "风险": "risk", "金额风险": "risk", "risk": "risk",
    "人数占比": "share", "人数": "share", "share": "share",
    "通过率": "pass", "pass": "pass",
    "放款件均": "ticket", "件均": "ticket", "ticket": "ticket",
    "用信率": "util", "util": "util",
  };

  function matrixLooksLikeHeader(row) {
    if (!row || !row.length) return false;
    return row.map((h) => HEADER_MAP[normalizeHeader(h)] || null).filter(Boolean).length >= 3;
  }

  function parseFullTable(text) {
    const matrix = clipboardToMatrix(text);
    if (!matrix.length) throw new Error("粘贴内容为空");
    let start = 0;
    let cols = COL_KEYS.slice();
    if (matrixLooksLikeHeader(matrix[0])) {
      cols = matrix[0].map((h) => HEADER_MAP[normalizeHeader(h)] || null);
      start = 1;
      for (const k of COL_KEYS) {
        if (!cols.includes(k)) throw new Error(`缺少列：${k}`);
      }
    }
    const parsed = [];
    for (let li = start; li < matrix.length; li++) {
      const cells = matrix[li];
      const row = { name: `资产包${parsed.length + 1}`, risk: NaN, share: NaN, pass: NaN, ticket: NaN, util: NaN };
      cols.forEach((key, idx) => {
        if (!key) return;
        const cell = cells[idx] ?? "";
        if (key === "name") row.name = String(cell).trim() || row.name;
        else row[key] = parseNumberCell(cell);
      });
      for (const k of ["risk", "share", "pass", "ticket", "util"]) {
        if (!Number.isFinite(row[k])) throw new Error(`第 ${li + 1} 行「${k}」无效`);
      }
      parsed.push(row);
    }
    if (parsed.length < 2) throw new Error("至少需要 2 个资产包");
    return parsed;
  }

  function applyMatrixAt(matrix, startI, startC) {
    const needRows = startI + matrix.length;
    while (packagesUi.length < needRows) {
      packagesUi.push({
        name: `资产包${packagesUi.length + 1}`,
        risk: 25, share: 0, pass: 50, ticket: 10000, util: 60,
      });
    }
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const col = startC + c;
        if (col < 0 || col >= COL_KEYS.length) continue;
        const key = COL_KEYS[col];
        const ri = startI + r;
        const cell = matrix[r][c];
        if (key === "name") packagesUi[ri].name = String(cell).trim() || `资产包${ri + 1}`;
        else {
          const n = parseNumberCell(cell);
          if (Number.isFinite(n)) packagesUi[ri][key] = n;
        }
      }
    }
  }

  function handleSheetPaste(e) {
    const td = e.target?.closest?.("td.ea-cell");
    if (!td || !$("eaInputTable")?.contains(td)) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n") && !text.includes(","))) return;
    e.preventDefault();
    syncPackagesFromDom();
    try {
      const matrix = clipboardToMatrix(text);
      if (matrixLooksLikeHeader(matrix[0])) {
        packagesUi = parseFullTable(text);
        renderInputSheet({ i: 0, c: 0 });
      } else {
        applyMatrixAt(matrix, Number(td.dataset.i), Number(td.dataset.c));
        renderInputSheet({ i: Number(td.dataset.i), c: Number(td.dataset.c) });
      }
      recalculate();
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  function renderResult(result) {
    const body = $("eaResultBody");
    if (!body) return;
    if (!result?.ok || !result.best) {
      body.innerHTML = `<tr><td colspan="9" class="ea-empty">${esc((result?.errors || []).join("；") || "计算后显示建议")}</td></tr>`;
      return;
    }
    const { best, current, base } = result;
    body.innerHTML = base.map((b, i) => `
      <tr>
        <td>${esc(b.name)}</td>
        <td>${fmtPct(best.p[i], 2)}</td>
        <td>${fmtDelta(best.tp[i])}</td>
        <td>${best.a[i].toFixed(0)}</td>
        <td>${fmtDelta(best.ta[i])}</td>
        <td>${fmtPct(best.r[i], 2)}</td>
        <td>${fmtDelta(best.tr[i])}</td>
        <td>${fmtPct(current.w[i], 2)}</td>
        <td>${fmtPct(best.w[i], 2)}</td>
      </tr>
    `).join("");
  }

  function renderKpis(result, opts) {
    if (!result?.ok) {
      ["eaKpiCurrent", "eaKpiBest", "eaKpiGap", "eaKpiAlgo"].forEach((id) => {
        if ($(id)) $(id).textContent = "--";
      });
      return;
    }
    const { current, best, algoUsed, ms, checked } = result;
    $("eaKpiCurrent").textContent = fmtPct(current.el, 2);
    $("eaKpiBest").textContent = fmtPct(best.el, 2);
    $("eaKpiBestSub").innerHTML = fmtDelta(best.el / current.el - 1) + " 相对当前";
    const gapBp = (best.el - opts.targetEl) * 10000;
    $("eaKpiGap").textContent = `${gapBp >= 0 ? "+" : ""}${gapBp.toFixed(1)} bp`;
    const reachable = opts.objective === "min"
      ? best.el <= opts.targetEl + 1e-10
      : Math.abs(best.el - opts.targetEl) <= 1e-6;
    $("eaKpiGapSub").textContent = reachable ? "已达/优于目标" : "目标不可达（约束内最优）";
    $("eaKpiAlgo").textContent = algoUsed === "grid" ? "网格穷举" : "坐标下降";
    $("eaKpiAlgoSub").textContent = `${ms.toFixed(0)} ms · 评估 ${Number(checked || 0).toLocaleString()} 次`;
  }

  function recalculate() {
    if (!$("tab-el-allocator")) return;
    syncPackagesFromDom();
    const opts = readOptsFromForm();
    if (!(opts.relMax > 0) || !Number.isFinite(opts.targetEl)) {
      showError("请检查目标 EL 与相对变动上限");
      setDecision("", "待测算", "参数不完整");
      return;
    }
    const domainPkgs = toDomainPackages(packagesUi);
    const result = optimize(domainPkgs, opts);
    lastResult = result;
    if (!result.ok) {
      showError((result.errors || []).join("；"));
      setDecision("warn", "无解", result.errors?.[0] || "无可行解");
      renderKpis(null, opts);
      renderResult(result);
      return;
    }
    showError("");
    const gapBp = (result.best.el - opts.targetEl) * 10000;
    const reachable = opts.objective === "min"
      ? result.best.el <= opts.targetEl + 1e-10
      : Math.abs(result.best.el - opts.targetEl) <= 1e-6;
    setDecision(
      reachable ? "good" : "warn",
      reachable ? "可达标" : "近优",
      `建议组合 EL ${fmtPct(result.best.el, 2)}（目标 ${fmtPct(opts.targetEl, 2)}，缺口 ${gapBp >= 0 ? "+" : ""}${gapBp.toFixed(1)} bp）`
    );
    renderKpis(result, opts);
    renderResult(result);
  }

  function rowsToTsv(list) {
    const lines = [COL_HEADERS.join("\t")];
    for (const r of list) {
      lines.push([r.name, r.risk, r.share, r.pass, r.ticket, r.util].join("\t"));
    }
    return lines.join("\n");
  }

  function bindElAllocatorEvents() {
    if (eventsBound) return;
    const tab = $("tab-el-allocator");
    if (!tab) return;
    eventsBound = true;

    ["eaTargetEl", "eaRelMax", "eaRestarts"].forEach((id) => {
      $(id)?.addEventListener("change", recalculate);
    });
    ["eaGridN", "eaObjective", "eaAlgo", "eaCouplePR", "eaCoupleAR", "eaRiskOnlyDown"].forEach((id) => {
      $(id)?.addEventListener("change", recalculate);
    });

    $("eaBtnRun")?.addEventListener("click", recalculate);
    $("eaBtnReset")?.addEventListener("click", () => {
      packagesUi = DEFAULT_PACKAGES.map(toUiPackage);
      applyOptsToForm(DEFAULT_OPTS);
      renderInputSheet();
      recalculate();
    });
    $("eaBtnAdd")?.addEventListener("click", () => {
      syncPackagesFromDom();
      packagesUi.push({
        name: `资产包${packagesUi.length + 1}`,
        risk: 25, share: 0, pass: 50, ticket: 10000, util: 60,
      });
      renderInputSheet({ i: packagesUi.length - 1, c: 0 });
    });
    $("eaBtnCopy")?.addEventListener("click", async () => {
      syncPackagesFromDom();
      try {
        await navigator.clipboard.writeText(rowsToTsv(packagesUi));
        RV.events?.notify?.("已复制资产包表格", "ok");
      } catch {
        showError("复制失败，请手动选择表格");
      }
    });
    $("eaInputTable")?.addEventListener("paste", handleSheetPaste);
  }

  function mountElAllocatorTabShell() {
    const doc = ensureReportDocument();
    const old = doc.querySelector("#tab-el-allocator");
    if (old) old.remove();
    doc.insertAdjacentHTML("beforeend", renderElAllocatorTabShell());
  }

  function snapshotElAllocatorUiState() {
    if (!$("tab-el-allocator")) return null;
    syncPackagesFromDom();
    return {
      packagesUi: packagesUi.map((p) => ({ ...p })),
      opts: readOptsFromForm(),
    };
  }

  function restoreElAllocatorUiState(state) {
    if (!state) return;
    if (Array.isArray(state.packagesUi) && state.packagesUi.length) {
      packagesUi = state.packagesUi.map((p) => ({ ...p }));
    }
    if (state.opts) applyOptsToForm(state.opts);
    else applyOptsToForm(DEFAULT_OPTS);
    renderInputSheet();
    recalculate();
  }

  function setupElAllocatorTabShell() {
    mountElAllocatorTabShell();
    eventsBound = false;
    bindElAllocatorEvents();
    if (!$("eaTargetEl")?.value) applyOptsToForm(DEFAULT_OPTS);
    renderInputSheet();
    recalculate();
  }

  function remountElAllocatorTabAfterReport(priorState) {
    setupElAllocatorTabShell();
    restoreElAllocatorUiState(priorState);
  }

  function initElAllocatorTab({ showTab: showEaTab = false } = {}) {
    setupElAllocatorTabShell();
    if (showEaTab) RV.ui.report.post.showTab("elAllocator");
  }

  Object.assign(target, {
    renderElAllocatorTabShell,
    mountElAllocatorTabShell,
    bindElAllocatorEvents,
    snapshotElAllocatorUiState,
    restoreElAllocatorUiState,
    setupElAllocatorTabShell,
    remountElAllocatorTabAfterReport,
    initElAllocatorTab,
    recalculate,
  });
})(window.RV);
