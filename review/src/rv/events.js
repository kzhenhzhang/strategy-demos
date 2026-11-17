(function (RV) {
  "use strict";
  var S = RV.app.state;
  const $ = (id) => document.getElementById(id);
  const readFileAsText = RV.infra.readFileAsText;
  const parseCSVTextAsync = RV.data.parseCSVTextAsync;
  const onCsvLoaded = RV.app.orchestrator.onCsvLoaded;
  const setLoadStatus = RV.app.orchestrator.setLoadStatus;
  const runAnalysis = RV.app.orchestrator.runAnalysis;
  const createFilterRule = RV.ui.sidebar.createFilterRule;
  const addBinaryRuleRow = RV.ui.sidebar.addBinaryRuleRow;
  const addNumericRuleRow = RV.ui.sidebar.addNumericRuleRow;
  const addCompositeSoftRuleRow = RV.ui.sidebar.addCompositeSoftRuleRow;
  const addRatioRow = RV.ui.sidebar.addRatioRow;
  const downloadReport = RV.export.downloadReport;
  const bindReportInteractionEvents = RV.export.bindReportInteractionEvents;
  const applySidebarConfig = RV.app.config.applySidebarConfig;
  const setConfigImportStatus = RV.app.config.setConfigImportStatus;
  const initRulesPackIO = RV.app.rulesIo.initRulesPackIO;
  const exportRulesPackDownload = RV.app.rulesIo.exportRulesPackDownload;
  const mirrorSidebarToValidityIfFollow = RV.ui.report.validity.mirrorSidebarToValidityIfFollow;
  const bindSampleFilterSchemeBEvents = RV.ui.sidebar.bindSampleFilterSchemeBEvents;
  const clearSampleExtraFilters = RV.ui.sidebar.clearSampleExtraFilters;
  const copySampleFilters = RV.ui.sidebar.copySampleFilters;
  const setAllBinaryRulesKind = RV.ui.sidebar.setAllBinaryRulesKind;
  const clearAllRuleConfig = RV.ui.sidebar.clearAllRuleConfig;
  const refreshDaBadLabelUI = RV.ui.report.analysis.refreshDaBadLabelUI;
  /** Sidebar/sample/rule/ratio change → mark dependent results stale + refresh strip (no recompute).
   * 日常检视样本固定全表 rawRows、口径在 Tab 内，不随侧栏标脏。 */
  function broadcastSidebarDerivedStale() {
    RV.ui.report.validity.markValidityResultsStale?.();
    RV.ui.report.post.markMainReportStale?.();
    RV.ui.report.attribution?.markAttributionResultsStale?.();
    updateWorkflowStatusLine();
    refreshProvenanceBar();
  }

  /**
   * Canonical invalidate entry for sidebar-derived changes.
   * track!=="all" (DA 分轨) only refreshes strip; does not broadcast attribution/main/validity.
   */
  const invalidateDataAnalysisCache = (...args) => {
    RV.ui.report.analysis.invalidateDataAnalysisCache(...args);
    const track = (args[0] && args[0].track) || "all";
    if (track === "all") broadcastSidebarDerivedStale();
    else {
      updateWorkflowStatusLine();
      refreshProvenanceBar();
    }
  };
  let invalidateSidebarTimer = 0;
  /** Debounced path for ratio input keystrokes — avoids expandValidity thrash. */
  const invalidateDataAnalysisCacheDebounced = (...args) => {
    if (invalidateSidebarTimer) clearTimeout(invalidateSidebarTimer);
    invalidateSidebarTimer = setTimeout(() => {
      invalidateSidebarTimer = 0;
      invalidateDataAnalysisCache(...args);
    }, 200);
  };
  const showTab = RV.ui.report.post.showTab;
  const initProfitabilityTab = RV.ui.report.profitability.initProfitabilityTab;
  const initRiskTargetTab = RV.ui.report.riskTarget.initRiskTargetTab;
  const initElAllocatorTab = RV.ui.report.elAllocator.initElAllocatorTab;
  const PRE_SAMPLE_FOLD_KEY = "rv.sidebar.preSampleCollapsed";
  let currentWorkflowStep = 1;
  let feedbackSeq = 0;

  /** O(DOM) rule/ratio counts — avoid collectRulesFromUI on every status refresh. */
  function countSidebarRules() {
    return $("ruleConfigRows")?.querySelectorAll(".rule-config-row").length || 0;
  }

  function countSidebarRatios() {
    return $("ratioRows")?.querySelectorAll(".ratio-row").length || 0;
  }

  function countCandidateRules() {
    const host = $("rvCandidateRuleRows");
    if (host) {
      const n = host.querySelectorAll(".rule-config-row").length;
      S.candidateRuleCount = n;
      return n;
    }
    return S.candidateRuleCount || 0;
  }

  /**
   * Global sample/rules/freshness strip. Reads only S flags + DOM counts (no recompute).
   */
  function refreshProvenanceBar() {
    const el = $("rvProvenanceBar");
    if (!el) return;
    const nRows = S.rawRows?.length || 0;
    if (!nRows) {
      el.textContent = "样本未加载 · 规则 — · 结果 —";
      return;
    }
    const ruleN = countSidebarRules();
    const candN = countCandidateRules();
    const mode = RV.app.rulesIo?.getValidityBaselineMode?.() || S.validityBaselineMode || "follow";
    const followLabel = mode === "follow" ? "Baseline 跟随侧栏" : "Baseline 已独立";
    const stale = [];
    if (S.mainReportStale && S.lastAnalysis) stale.push("主报告");
    if (S.daResultsStale && S.lastDataAnalysis) stale.push("数据分析");
    if (S.validityResultsStale && S.lastValidityAnalysis) stale.push("有效性");
    if (S.attributionResultsStale && S.lastAttributionAnalysis) stale.push("归因");
    const parts = [
      `样本 ${nRows.toLocaleString()} 行`,
      `规则 ${ruleN}${candN ? ` · 候选 ${candN}` : ""}`,
      followLabel,
    ];
    if (stale.length) {
      parts.push(`过期：${stale.join("、")}`);
    } else if (S.lastAnalysis || S.lastDataAnalysis || S.lastValidityAnalysis || S.lastAttributionAnalysis || S.lastDailyReview) {
      parts.push("结果较新");
    } else {
      parts.push("结果未跑");
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    parts.forEach((text, i) => {
      if (i) el.appendChild(document.createTextNode(" · "));
      const span = document.createElement("span");
      if (text.startsWith("过期：")) span.className = "pv-stale";
      else if (text === "结果较新") span.className = "pv-ok";
      else if (text === "结果未跑" || text.includes("已独立")) span.className = "pv-muted";
      span.textContent = text;
      el.appendChild(span);
    });
  }

  function setPreSampleCollapsed(collapsed) {
    const panel = $("panelPreSample");
    const toggle = $("panelPreSampleToggle");
    if (!panel || !toggle) return;
    panel.classList.toggle("is-collapsed", !!collapsed);
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    try {
      localStorage.setItem(PRE_SAMPLE_FOLD_KEY, collapsed ? "1" : "0");
    } catch (_) { /* ignore quota / private mode */ }
  }

  function initPreSampleFold() {
    const toggle = $("panelPreSampleToggle");
    if (!toggle || toggle.dataset.rvFoldBound) return;
    toggle.dataset.rvFoldBound = "1";
    let collapsed = true;
    try {
      const stored = localStorage.getItem(PRE_SAMPLE_FOLD_KEY);
      if (stored != null) collapsed = stored === "1";
    } catch (_) { /* default collapsed */ }
    setPreSampleCollapsed(collapsed);
    const onToggle = () => {
      const panel = $("panelPreSample");
      if (!panel) return;
      setPreSampleCollapsed(!panel.classList.contains("is-collapsed"));
    };
    toggle.addEventListener("click", onToggle);
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    });
  }

  function notify(message, tone = "info") {
    const host = $("appFeedback");
    if (!host || !message) return;
    const item = document.createElement("div");
    item.className = `global-feedback-item ${tone === "ok" ? "ok" : tone === "warn" ? "warn" : tone === "err" ? "err" : ""}`.trim();
    item.dataset.feedbackId = String(++feedbackSeq);
    item.textContent = message;
    host.appendChild(item);
    if (host.children.length > 4) host.firstElementChild?.remove();
    setTimeout(() => item.remove(), 5200);
  }

  function workflowStepDone(step) {
    if (step === 1) return !!S.rawRows.length;
    if (step === 2) return !!S.rawRows.length && !$("btnAnalyze")?.disabled;
    if (step === 3) return !!S.lastAnalysis;
    return false;
  }

  function syncAnalyzeActionState() {
    const btn = $("btnAnalyze");
    if (!btn) return;
    if (S.analysisBusy) {
      btn.textContent = "分析生成中…";
      btn.disabled = true;
      return;
    }
    btn.textContent = S.lastAnalysis ? "重新生成分析报告" : "生成分析报告";
    if (!S.rawRows.length) btn.disabled = true;
  }

  function updateWorkflowStepDetails() {
    const d1 = $("workflowStepDetail1");
    const d2 = $("workflowStepDetail2");
    const d3 = $("workflowStepDetail3");
    if (d1) d1.textContent = "上传 CSV，完成字段识别与列类型初始化。";
    if (d2) d2.textContent = "配置贷前/贷后样本、风险比率和规则组合。";
    if (d3) {
      if (!S.rawRows.length) d3.textContent = "需先完成前两步。";
      else if (S.analysisBusy) d3.textContent = "正在生成主报告，请稍候…";
      else if (S.lastAnalysis) d3.textContent = "主报告已生成，可下载 HTML 或重新生成。";
      else d3.textContent = "点击「生成分析报告」产出主报告。";
    }
  }

  function updateWorkflowStatusLine() {
    const el = $("workflowStatusLine");
    if (!el) return;
    if (!S.rawRows.length) {
      el.textContent = "样本未配 · 规则 0 · 报告未生成";
      return;
    }
    const ruleCount = countSidebarRules();
    const ratioCount = countSidebarRatios();
    const sampleOk = ratioCount > 0;
    const sampleLabel = sampleOk ? `样本已配（比率 ${ratioCount}）` : "样本待配比率";
    const reportLabel = S.lastAnalysis ? "报告已生成" : (S.analysisBusy ? "报告生成中…" : "报告未生成");
    el.textContent = `${sampleLabel} · 规则 ${ruleCount} · ${reportLabel}`;
  }

  function updateWorkflowStatus() {
    syncAnalyzeActionState();
    for (const step of [1, 2, 3]) {
      const el = $(`workflowStepStatus${step}`);
      if (!el) continue;
      const done = workflowStepDone(step);
      const pending = !done && step > currentWorkflowStep;
      let text = done ? "已完成" : pending ? "待开始" : "进行中";
      let klass = done ? "done" : pending ? "pending" : "";
      if (step === 3 && !done) {
        if (S.analysisBusy) {
          text = "进行中";
          klass = "";
        } else if (S.rawRows.length) {
          text = "待执行";
          klass = "pending";
        }
      }
      el.className = `workflow-step-status ${klass}`.trim();
      el.textContent = text;
    }
    updateWorkflowStepDetails();
    updateWorkflowStatusLine();
    refreshProvenanceBar();
  }

  function setWorkflowStep(step) {
    currentWorkflowStep = Math.max(1, Math.min(3, Number(step) || 1));
    document.querySelectorAll("[data-workflow-step]").forEach((el) => {
      const s = Number(el.dataset.workflowStep || "1");
      el.hidden = s !== currentWorkflowStep;
    });
    document.querySelectorAll(".workflow-step-item").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.stepItem || "0") === currentWorkflowStep);
    });
    document.querySelectorAll(".workflow-step-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.stepTarget || "0") === currentWorkflowStep);
    });
    updateWorkflowStatus();
  }

  function refreshTabAvailability() {
    const hasCsv = !!S.rawRows.length;
    document.querySelectorAll("#reportTabs .tab-btn[data-tab]").forEach((btn) => {
      const requiresCsv = btn.dataset.requiresCsv === "1";
      const disabled = requiresCsv && !hasCsv;
      btn.classList.toggle("tab-disabled", disabled);
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
      btn.disabled = false;
    });
  }

  function init() {
    if (typeof RV.infra.decodeCsvBytes !== "function") {
      setLoadStatus("脚本版本过旧（缺少 CSV 编码探测），请硬刷新：Cmd+Shift+R", "err");
      console.error("RV: infra.js 过旧，请硬刷新页面");
      return;
    }
    bindReportInteractionEvents();
    initRulesPackIO();
    bindSampleFilterSchemeBEvents();
    initPreSampleFold();
    // 不抢默认 Tab：保留 HTML 上的「贷后风险」；盈利性 / 风险目标 / EL 调配 Tab 仍可点进
    initProfitabilityTab({ showTab: false });
    initRiskTargetTab({ showTab: false });
    initElAllocatorTab({ showTab: false });
    setWorkflowStep(1);
    refreshTabAvailability();
    refreshProvenanceBar();

    $("csvFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoadStatus("读取文件…");
      try {
        const text = await readFileAsText(file);
        setLoadStatus("解析 CSV…");
        const result = await parseCSVTextAsync(text, (n) => {
          setLoadStatus(`解析中… ${n.toLocaleString()} 行`);
        });
        await onCsvLoaded(result);
        setWorkflowStep(2);
        refreshTabAvailability();
        const banner = $("csvNextStepBanner");
        if (banner) banner.hidden = false;
        notify("CSV 加载完成：请配置样本与规则，再生成分析报告", "ok");
        updateWorkflowStatus();
      } catch (err) {
        setLoadStatus("加载失败：" + (err.message || err), "err");
        notify("CSV 加载失败，请检查文件格式", "err");
      }
    });

    $("btnExportStrategyRules")?.addEventListener("click", () => exportRulesPackDownload("strategy"));
    $("btnImportStrategyRules")?.addEventListener("click", () => {
      if (!S.rawRows.length) {
        const el = $("strategyRulesImportStatus");
        if (el) {
          el.textContent = "请先加载 CSV";
          el.className = "status err";
        }
        return;
      }
      $("strategyRulesFile")?.click();
    });

    $("addPostFilter")?.addEventListener("click", () => {
      const q = ($("postFilterSearch").value || "").trim().toLowerCase();
      const col = q ? S.headers.find((h) => h.toLowerCase().includes(q)) : null;
      createFilterRule("postFilterRules", "postFilterMeta", "post", col);
      if (col) $("postFilterSearch").value = "";
    });
    $("addPreFilter")?.addEventListener("click", () => {
      const q = ($("preFilterSearch").value || "").trim().toLowerCase();
      const col = q ? S.headers.find((h) => h.toLowerCase().includes(q)) : null;
      createFilterRule("preFilterRules", "preFilterMeta", "pre", col);
      if (col) $("preFilterSearch").value = "";
    });
    $("btnClearPostFilters")?.addEventListener("click", () => {
      clearSampleExtraFilters("post");
      notify("已清空贷后额外筛选", "ok");
    });
    $("btnClearPreFilters")?.addEventListener("click", () => {
      clearSampleExtraFilters("pre");
      notify("已清空贷前额外筛选", "ok");
    });
    $("btnCopyPostToPreFilters")?.addEventListener("click", async () => {
      await copySampleFilters("post", "pre");
      notify("已复制贷后筛选到贷前", "ok");
    });

    $("btnRulesAllSoft")?.addEventListener("click", () => {
      setAllBinaryRulesKind("soft");
      notify("已将全部 0-1 规则设为软规则", "ok");
    });
    $("btnRulesAllHard")?.addEventListener("click", () => {
      setAllBinaryRulesKind("hard");
      notify("已将全部 0-1 规则设为硬规则", "ok");
    });
    $("btnRulesClearAll")?.addEventListener("click", () => {
      const confirmed = window.confirm("确认清空全部规则？该操作不可撤销。");
      if (!confirmed) return;
      clearAllRuleConfig();
      invalidateDataAnalysisCache();
      notify("已清空规则配置", "warn");
    });
    $("btnRuleCreatePrimary")?.addEventListener("click", () => {
      const type = $("ruleCreateType")?.value || "binary";
      if (type === "numeric") addNumericRuleRow();
      else if (type === "composite") addCompositeSoftRuleRow();
      else addBinaryRuleRow({ isHard: false });
      mirrorSidebarToValidityIfFollow();
      invalidateDataAnalysisCache();
      const labels = { binary: "0-1 规则", numeric: "数值规则", composite: "复合软规则" };
      notify(`已新增${labels[type] || "规则"}`, "ok");
    });
    $("btnRuleBulkToggle")?.addEventListener("click", () => {
      const panel = $("ruleBulkPanel");
      const btn = $("btnRuleBulkToggle");
      if (!panel || !btn) return;
      const opening = !!panel.hidden;
      panel.hidden = !opening;
      btn.textContent = opening ? "批量操作 ▴" : "批量操作 ▾";
      btn.setAttribute("aria-expanded", opening ? "true" : "false");
    });
    $("addRatio")?.addEventListener("click", () => {
      addRatioRow();
      setTimeout(refreshDaBadLabelUI, 0);
      invalidateDataAnalysisCache();
    });
    const ratioHost = $("ratioRows");
    if (ratioHost && !ratioHost.dataset.rvDaInvalidateBound) {
      ratioHost.dataset.rvDaInvalidateBound = "1";
      ratioHost.addEventListener("change", () => invalidateDataAnalysisCache());
      ratioHost.addEventListener("input", (e) => {
        if (e.target.closest(".ratio-row")) invalidateDataAnalysisCacheDebounced();
      });
    }
    const bindFilterInvalidate = (containerId) => {
      const el = $(containerId);
      if (!el || el.dataset.rvDaInvalidateBound) return;
      el.dataset.rvDaInvalidateBound = "1";
      el.addEventListener("change", () => invalidateDataAnalysisCache());
      el.addEventListener("input", (e) => {
        if (e.target.closest(".filter-rule")) invalidateDataAnalysisCache();
      });
    };
    bindFilterInvalidate("postFilterRules");
    bindFilterInvalidate("preFilterRules");
    const ruleConfigHost = $("ruleConfigRows");
    if (ruleConfigHost && !ruleConfigHost.dataset.rvDaInvalidateBound) {
      ruleConfigHost.dataset.rvDaInvalidateBound = "1";
      ruleConfigHost.addEventListener("change", () => invalidateDataAnalysisCache());
      ruleConfigHost.addEventListener("click", (e) => {
        if (e.target.closest(".rule-config-remove")) invalidateDataAnalysisCache();
      });
    }
    $("btnAnalyze")?.addEventListener("click", () => {
      notify("开始生成分析报告…");
      const task = Promise.resolve(runAnalysis());
      updateWorkflowStatus();
      void task.then(() => {
        setWorkflowStep(3);
        updateWorkflowStatus();
        const banner = $("csvNextStepBanner");
        if (banner) banner.hidden = true;
        notify("分析完成，可下载报告", "ok");
      }).catch((err) => {
        updateWorkflowStatus();
        notify("分析失败：" + (err?.message || err || "未知错误"), "err");
      });
    });
    $("btnDownload")?.addEventListener("click", () => {
      void downloadReport();
    });
    $("btnImportConfig")?.addEventListener("click", () => {
      if (!S.rawRows.length) {
        setConfigImportStatus("请先加载 CSV 文件", "err");
        return;
      }
      $("configFile")?.click();
    });
    $("configFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!S.rawRows.length) {
        setConfigImportStatus("请先加载 CSV 文件", "err");
        return;
      }
      setConfigImportStatus("正在导入配置…");
      try {
        const text = await readFileAsText(file);
        const config = JSON.parse(text);
        const { warnings } = await applySidebarConfig(config);
        if (warnings.length) {
          setConfigImportStatus(`配置已导入，${warnings.length} 项警告：${warnings.slice(0, 3).join("；")}${warnings.length > 3 ? "…" : ""}`, "warn");
          notify("配置导入完成（含警告）", "warn");
        } else {
          setConfigImportStatus("配置已成功导入", "ok");
          notify("配置导入成功", "ok");
        }
      } catch (err) {
        setConfigImportStatus("导入失败：" + (err.message || err), "err");
        notify("配置导入失败", "err");
      }
    });

    $("workflowStepList")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".workflow-step-btn[data-step-target]");
      if (!btn) return;
      const targetStep = Number(btn.dataset.stepTarget || "1");
      if (targetStep > 1 && !S.rawRows.length) {
        notify("请先完成 CSV 上传", "warn");
        return;
      }
      setWorkflowStep(targetStep);
    });

    document.getElementById("reportTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (btn?.dataset.tab) {
        const requiresCsv = btn.dataset.requiresCsv === "1";
        if (requiresCsv && !S.rawRows.length) {
          notify("该模块需要先上传 CSV", "warn");
          return;
        }
        showTab(btn.dataset.tab);
      }
    });
    $("toggleSummaryMode")?.addEventListener("change", (e) => {
      document.body.classList.toggle("summary-mode", !!e.target.checked);
      notify(e.target.checked ? "已切换为摘要模式" : "已切换为详细模式");
    });
  }

  RV.events.init = init;
  RV.events.notify = notify;
  RV.events.setWorkflowStep = setWorkflowStep;
  RV.events.updateWorkflowStatus = updateWorkflowStatus;
  RV.events.syncAnalyzeActionState = syncAnalyzeActionState;
  RV.events.refreshTabAvailability = refreshTabAvailability;
  RV.events.refreshProvenanceBar = refreshProvenanceBar;
  RV.events.invalidateDataAnalysisCache = invalidateDataAnalysisCache;
  RV.events.broadcastSidebarDerivedStale = broadcastSidebarDerivedStale;
})(window.RV);
