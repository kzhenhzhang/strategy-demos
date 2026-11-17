/**
 * Wizard state machine for admission-iteration-app.
 */
(function () {
  "use strict";

  const UI = window.AdmissionUI;
  const Pipeline = window.AdmissionPipeline;
  const Report = window.AdmissionReport;

  const state = {
    step: "data",
    done: new Set(),
    rows: null,
    headers: [],
    fields: {
      groupCol: "",
      decisionCol: "决策组",
      applyCol: "进件量",
      passCol: "通过量",
      riskNumCol: "fpd1_cnt_fz",
      riskDenCol: "fpd1_cnt_fm",
      preDateCol: "submit_date",
      postMonthCol: "submit_month",
    },
    /** [{ col, values: string[] }] — AND across rows, OR within values */
    segmentFilters: [],
    targets: { risk: 0.28, pass: 0.7, k: 1.2 },
    trainWindow: { postFrom: "2026-06", postTo: "2026-09", preFrom: "2026-06-01", preTo: "2026-09-30" },
    backtestWindow: { postFrom: "2026-10", postTo: "2026-10", preFrom: "2026-10-01", preTo: "2026-10-31", preSameAsTrain: false },
    hardRulesText: "hard_rule_demo\n",
    softRulesText: "p3_demo_score>800\n",
    keepOnlineSoft: true,
    mineOpts: {
      minHit: 30,
      minAbsRisk: 0.35,
      minLift: 1.5,
      maxCandidates: 6,
      residualRounds: 10,
    },
    report: null,
    busy: false,
  };

  function $(id) { return document.getElementById(id); }

  function showLanding(show) {
    $("landing").classList.toggle("ai-hidden", !show);
    $("app").classList.toggle("ai-hidden", show);
  }

  const DEFAULT_SEG_COLS = ["system1", "是否拒量", "t1_flag_cust_type"];

  function collectSegmentFiltersFromDom() {
    const wrap = $("segFilterList");
    if (!wrap) return state.segmentFilters || [];
    const rows = [...wrap.querySelectorAll("[data-seg-row]")];
    return rows.map((row) => {
      const col = row.querySelector(".seg-col")?.value || "";
      const sel = row.querySelector(".seg-values");
      const values = sel
        ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean)
        : [];
      return { col, values };
    });
  }

  function collectDataFields() {
    const val = (id) => ($(id) ? $(id).value : "");
    state.fields = {
      groupCol: val("f_groupCol"),
      decisionCol: val("f_decisionCol") || "决策组",
      applyCol: val("f_applyCol") || "进件量",
      passCol: val("f_passCol") || "通过量",
      riskNumCol: val("f_riskNumCol") || "fpd1_cnt_fz",
      riskDenCol: val("f_riskDenCol") || "fpd1_cnt_fm",
      preDateCol: val("f_preDateCol") || "submit_date",
      postMonthCol: val("f_postMonthCol") || "submit_month",
    };
    state.segmentFilters = collectSegmentFiltersFromDom();
  }

  /** After CSV load: drop filters whose columns are missing; seed defaults if empty. */
  function reconcileSegmentFilters() {
    const headers = new Set(state.headers || []);
    let filters = (state.segmentFilters || []).filter((f) => f.col && headers.has(f.col));
    if (!filters.length) {
      filters = DEFAULT_SEG_COLS.filter((c) => headers.has(c)).map((col) => ({
        col,
        values: [],
      }));
    }
    // Keep selected values that still exist in data
    state.segmentFilters = filters.map((f) => {
      const allowed = new Set(UI.uniqueColValues(state.rows, f.col));
      return {
        col: f.col,
        values: (f.values || []).filter((v) => allowed.has(String(v))),
      };
    });
  }

  function collectGoals() {
    const num = (id, fallback) => {
      const v = Number($(id).value);
      return Number.isFinite(v) ? v : fallback;
    };
    state.targets = {
      risk: num("t_risk", state.targets.risk),
      pass: num("t_pass", state.targets.pass),
      k: num("t_k", state.targets.k),
    };
    state.trainWindow = {
      postFrom: $("w_postFrom").value.trim(),
      postTo: $("w_postTo").value.trim(),
      preFrom: $("w_preFrom").value.trim(),
      preTo: $("w_preTo").value.trim(),
    };
    state.backtestWindow = {
      postFrom: $("bt_postFrom").value.trim(),
      postTo: $("bt_postTo").value.trim(),
      preFrom: $("bt_preFrom").value.trim(),
      preTo: $("bt_preTo").value.trim(),
      preSameAsTrain: $("bt_samePre").checked,
    };
  }

  function collectBaseline() {
    state.hardRulesText = $("hardRules").value;
    state.softRulesText = $("softRules").value;
    state.keepOnlineSoft = $("keepSoft").checked;
    state.mineOpts = {
      minHit: Number($("m_minHit").value) || 30,
      minAbsRisk: Number($("m_minAbs").value) || 0.35,
      minLift: Number($("m_minLift").value),
      maxCandidates: Number($("m_maxCand").value) || 6,
      residualRounds: Number($("m_rounds").value) || 10,
    };
    if (!Number.isFinite(state.mineOpts.minLift)) state.mineOpts.minLift = 1.5;
  }

  function segmentFilters() {
    return (state.segmentFilters || [])
      .filter((f) => f.col && Array.isArray(f.values) && f.values.length)
      .map((f) => ({ col: f.col, values: f.values.slice() }));
  }

  function render() {
    UI.renderStepNav(state.step, state.done);
    const panels = $("stepPanels");
    UI.showError("");
    if (state.step === "data") {
      UI.renderDecision(state.rows ? "good" : "warn", state.rows ? `已载入 ${state.rows.length.toLocaleString()} 行` : "请先上传 CSV");
      panels.innerHTML = UI.renderDataStep(state);
      bindData();
    } else if (state.step === "goals") {
      UI.renderDecision("good", "设定风险/放行率目标与训练/回测窗");
      panels.innerHTML = UI.renderGoalsStep(state);
      bindGoals();
    } else if (state.step === "baseline") {
      UI.renderDecision("good", "配置硬规则与线上软规则");
      panels.innerHTML = UI.renderBaselineStep(state);
      bindBaseline();
    } else if (state.step === "run") {
      UI.renderDecision(state.busy ? "warn" : "good", state.busy ? "计算进行中…" : "确认参数后开始计算");
      panels.innerHTML = UI.renderRunStep();
      bindRun();
    } else if (state.step === "result") {
      const ok = !!state.report;
      UI.renderDecision(ok ? "good" : "warn", ok ? "可下载独立报告" : "无结果");
      if (ok) {
        const pct = Report.pct;
        UI.renderKpis([
          { k: "B组现状风险", v: pct(state.report.statusQuo?.riskB?.rate) },
          { k: "B组历史通过率", v: pct(state.report.statusQuo?.passB?.rate) },
          { k: "风险向 R̂", v: pct(state.report.planDetails?.risk?.swap?.Rhat?.R) },
          { k: "放行向 R̂", v: pct(state.report.planDetails?.pass?.swap?.Rhat?.R) },
        ]);
      }
      panels.innerHTML = UI.renderResultStep(state.report);
      bindResult();
    }
  }

  function bindSegFilters() {
    $("btnAddSegFilter")?.addEventListener("click", () => {
      collectDataFields();
      state.segmentFilters = (state.segmentFilters || []).concat([{ col: "", values: [] }]);
      render();
    });
    $("segFilterList")?.querySelectorAll(".seg-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        collectDataFields();
        const idx = Number(btn.getAttribute("data-idx"));
        if (!Number.isFinite(idx)) return;
        state.segmentFilters = (state.segmentFilters || []).filter((_, i) => i !== idx);
        render();
      });
    });
    $("segFilterList")?.querySelectorAll(".seg-col").forEach((sel) => {
      sel.addEventListener("change", () => {
        collectDataFields();
        const idx = Number(sel.getAttribute("data-idx"));
        if (!Number.isFinite(idx) || !state.segmentFilters[idx]) return;
        // Column changed → clear values (new enum domain)
        state.segmentFilters[idx].values = [];
        render();
      });
    });
    $("segFilterList")?.querySelectorAll(".seg-values").forEach((sel) => {
      sel.addEventListener("change", () => {
        collectDataFields();
      });
    });
  }

  async function loadDemoCsv() {
    if (!window.StrategyDemo) throw new Error("示例脚本未加载");
    UI.renderDecision("warn", "正在载入示例…");
    await window.StrategyDemo.loadCsvInto("csvFile");
  }

  function bindData() {
    $("btnLoadSample")?.addEventListener("click", () => {
      loadDemoCsv().catch((err) => UI.showError(err.message || String(err)));
    });
    $("csvFile")?.addEventListener("change", async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      UI.renderDecision("warn", "解析 CSV 中…");
      try {
        const text = await file.text();
        const parsed = await RV.data.parseCSVTextAsync(text, (done) => {
          UI.setProgress(null, `解析 CSV ${done} 行`);
        });
        const rows = Array.isArray(parsed) ? parsed : (parsed?.data || []);
        state.rows = rows;
        state.headers = parsed?.fields?.length
          ? parsed.fields.slice()
          : (rows.length ? Object.keys(rows[0]) : []);
        reconcileSegmentFilters();
        $("progressBox")?.classList.add("ai-hidden");
        render();
      } catch (err) {
        UI.showError("CSV 解析失败：" + (err.message || err));
        UI.renderDecision("bad", "CSV 解析失败");
      }
    });
    bindSegFilters();
    $("btnToGoals")?.addEventListener("click", () => {
      collectDataFields();
      if (!state.rows?.length) {
        UI.showError("请先上传 CSV");
        return;
      }
      state.done.add("data");
      state.step = "goals";
      render();
    });
  }

  function bindGoals() {
    $("btnBackData")?.addEventListener("click", () => { collectGoals(); state.step = "data"; render(); });
    $("btnToBaseline")?.addEventListener("click", () => {
      collectGoals();
      state.done.add("goals");
      state.step = "baseline";
      render();
    });
  }

  function bindBaseline() {
    $("btnBackGoals")?.addEventListener("click", () => { collectBaseline(); state.step = "goals"; render(); });
    $("btnToRun")?.addEventListener("click", () => {
      collectBaseline();
      state.done.add("baseline");
      state.step = "run";
      render();
    });
  }

  function bindRun() {
    $("btnBackBaseline")?.addEventListener("click", () => { state.step = "baseline"; render(); });
    $("btnRun")?.addEventListener("click", () => runPipeline());
  }

  function bindResult() {
    $("btnDownload")?.addEventListener("click", () => {
      if (state.report) Report.downloadReport(state.report);
    });
    $("btnRerun")?.addEventListener("click", () => {
      state.step = "run";
      render();
    });
  }

  async function runPipeline() {
    if (state.busy) return;
    state.busy = true;
    UI.clearProgress();
    UI.showError("");
    UI.setProgress(0, "启动…");
    render();
    try {
      const report = await Pipeline.runAdmissionIteration({
        rows: state.rows,
        fields: state.fields,
        segmentFilters: segmentFilters(),
        targets: state.targets,
        trainWindow: state.trainWindow,
        backtestWindow: state.backtestWindow,
        hardRulesText: state.hardRulesText,
        softRulesText: state.softRulesText,
        keepOnlineSoft: state.keepOnlineSoft,
        dropSoftCols: [],
        mineOpts: state.mineOpts,
      }, (pct, msg) => {
        if (pct != null) UI.setProgress(pct, msg, null);
        else UI.setProgress(null, null, msg);
        if (msg && pct != null) UI.setProgress(pct, msg, msg);
      });
      state.report = report;
      state.done.add("run");
      state.done.add("result");
      state.step = "result";
    } catch (err) {
      console.error(err);
      UI.showError(err.message || String(err));
      UI.renderDecision("bad", "计算失败");
    } finally {
      state.busy = false;
      render();
    }
  }

  $("btnEnter")?.addEventListener("click", () => {
    showLanding(false);
    render();
  });
  $("btnBackLanding")?.addEventListener("click", () => showLanding(true));

  showLanding(false);
  render();
  loadDemoCsv().catch((err) => UI.showError(err.message || String(err)));

  // expose for smoke tests
  window.__admissionApp = { state, runPipeline, render };
})();
