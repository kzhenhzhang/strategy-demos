(function (RV) {
  "use strict";
  var S = RV.app.state;
  var $ = (id) => document.getElementById(id);
  const downloadBlob = RV.infra.downloadBlob;
  const applyRuleConfig = RV.ui.sidebar.applyRuleConfig;
  const collectRulesFromUI = RV.ui.sidebar.collectRulesFromUI;
  const parseRulesPack = RV.domain.rulesPack.parseRulesPack;
  const filterPackForContext = RV.domain.rulesPack.filterPackForContext;
  const serializeRulesPack = RV.domain.rulesPack.serializeRulesPack;
  const packToLegacySidebar = RV.domain.rulesPack.packToLegacySidebar;
  const packToCustomRules = RV.domain.rulesPack.packToCustomRules;
  const runtimeRulesToPack = RV.domain.rulesPack.runtimeRulesToPack;
  const FILENAMES = RV.domain.rulesPack.FILENAMES;

  var app = RV.app = RV.app || {};
  var target = app.rulesIo = app.rulesIo || {};

  function getValidityBaselineMode() {
    return S.validityBaselineMode === "override" ? "override" : "follow";
  }

  function setValidityBaselineMode(mode) {
    S.validityBaselineMode = mode === "override" ? "override" : "follow";
    refreshValidityBaselineModeUI();
    RV.events?.refreshProvenanceBar?.();
  }

  function refreshValidityBaselineModeUI() {
    const el = $("rvBaselineModeHint");
    if (!el) return;
    const mode = getValidityBaselineMode();
    if (mode === "follow") {
      el.textContent = "跟随侧栏 Baseline（本 Panel 只读镜像；导入/编辑后脱离为已独立）";
      el.className = "config-muted rv-baseline-mode-hint follow";
    } else {
      el.textContent = "已独立：使用本 Panel 覆盖 Baseline（可编辑；可点「重新跟随左侧」）";
      el.className = "config-muted rv-baseline-mode-hint override";
    }
    const refollow = $("rvBaselineRefollowSidebar");
    if (refollow) refollow.style.display = mode === "override" ? "" : "none";
    RV.ui.report.validity?.updateBaselineHostReadonly?.();
  }

  function markValidityBaselineOverride() {
    if (getValidityBaselineMode() !== "override") {
      setValidityBaselineMode("override");
    }
  }

  function collectRulesPack(context) {
    if (context === "strategy") {
      const { hardRules, softRules } = collectRulesFromUI();
      return serializeRulesPack(runtimeRulesToPack(hardRules, softRules, []));
    }
    if (context === "validityBaseline") {
      if (getValidityBaselineMode() === "follow") {
        return collectRulesPack("strategy");
      }
      const hardRules = RV.ui.report.validity.collectValidityHardRules();
      const softRules = RV.ui.report.validity.collectValiditySoftRules();
      return serializeRulesPack(runtimeRulesToPack(hardRules, softRules, []));
    }
    if (context === "validityCandidate") {
      const customRules = RV.ui.report.validity.collectCustomRulesFromUI();
      return serializeRulesPack(runtimeRulesToPack([], [], customRules));
    }
    throw new Error("未知 context：" + context);
  }

  function applyRulesPack(context, pack, warnings) {
    warnings = warnings || [];
    const filtered = filterPackForContext(pack, context, warnings);
    if (context === "strategy") {
      const { hardCols, softRules } = packToLegacySidebar(filtered);
      applyRuleConfig(hardCols, softRules, warnings);
      if (getValidityBaselineMode() === "follow") {
        RV.ui.report.validity.syncValidityRulesFromSidebar();
      }
      return { applied: filtered.rules.length, context };
    }
    if (context === "validityBaseline") {
      setValidityBaselineMode("override");
      const { hardCols, softRules } = packToLegacySidebar(filtered);
      RV.ui.report.validity.applyValidityBaselineFromLegacy(hardCols, softRules, warnings);
      return { applied: filtered.rules.length, context };
    }
    if (context === "validityCandidate") {
      const customRules = packToCustomRules(filtered);
      RV.ui.report.validity.applyCustomRulesFromPack(customRules);
      return { applied: customRules.length, context };
    }
    throw new Error("未知 context：" + context);
  }

  function importRulesPackText(context, text) {
    const warnings = [];
    const pack = parseRulesPack(text, warnings);
    const result = applyRulesPack(context, pack, warnings);
    return { ...result, warnings };
  }

  function exportRulesPackDownload(context) {
    const pack = collectRulesPack(context);
    const json = JSON.stringify(pack, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    downloadBlob(FILENAMES[context], blob);
  }

  function refollowValidityBaselineFromSidebar() {
    setValidityBaselineMode("follow");
    RV.ui.report.validity.syncValidityRulesFromSidebar();
  }

  function collectEffectiveValidityBaseline() {
    if (getValidityBaselineMode() === "follow") {
      const { hardRules, softRules } = collectRulesFromUI();
      return { hardRules, softRules, mode: "follow" };
    }
    return {
      hardRules: RV.ui.report.validity.collectValidityHardRules(),
      softRules: RV.ui.report.validity.collectValiditySoftRules(),
      mode: "override",
    };
  }

  function bindRulesPackFileInput(inputId, context, statusId) {
    const input = $(inputId);
    if (!input || input.dataset.rvRulesBound === "1") return;
    input.dataset.rvRulesBound = "1";
    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const statusEl = statusId ? $(statusId) : null;
      if (!file) return;
      if (!S.rawRows.length) {
        if (statusEl) {
          statusEl.textContent = "请先加载 CSV";
          statusEl.className = "status err";
        }
        return;
      }
      try {
        const text = await RV.infra.readFileAsText(file);
        const { applied, warnings } = importRulesPackText(context, text);
        const msg = `已导入 ${applied} 条规则` + (warnings.length ? `（${warnings.length} 条提示）` : "");
        if (statusEl) {
          statusEl.textContent = msg;
          statusEl.className = "status ok";
        }
        if (warnings.length) console.warn("rules-pack import:", warnings);
        if (context === "validityCandidate") {
          RV.ui.report.validity?.syncCandidateRuleCount?.();
        }
        if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
          RV.events.invalidateDataAnalysisCache();
        } else {
          RV.events?.refreshProvenanceBar?.();
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = "导入失败：" + (err.message || err);
          statusEl.className = "status err";
        }
      }
    });
  }

  function initRulesPackIO() {
    bindRulesPackFileInput("strategyRulesFile", "strategy", "strategyRulesImportStatus");
    bindRulesPackFileInput("validityBaselineRulesFile", "validityBaseline", "validityBaselineRulesImportStatus");
    bindRulesPackFileInput("validityCandidateRulesFile", "validityCandidate", "validityCandidateRulesImportStatus");
    refreshValidityBaselineModeUI();
  }

  Object.assign(target, {
    getValidityBaselineMode,
    setValidityBaselineMode,
    refreshValidityBaselineModeUI,
    markValidityBaselineOverride,
    collectRulesPack,
    applyRulesPack,
    importRulesPackText,
    exportRulesPackDownload,
    refollowValidityBaselineFromSidebar,
    collectEffectiveValidityBaseline,
    initRulesPackIO,
    FILENAMES,
  });
})(window.RV);
