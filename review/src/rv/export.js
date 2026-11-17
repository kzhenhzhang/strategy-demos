(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const addCustomRuleCard = RV.ui.report.validity.addCustomRuleCard;
  const findExprRootFromClickTarget = RV.ui.ruleExpr.findExprRootFromClickTarget;
  const applyPreStrategyValueFilter = RV.ui.report.pre.applyPreStrategyValueFilter;
  const applyPostTrendValueFilter = RV.ui.report.post.applyPostTrendValueFilter;
  const buildTimeValueChecks = RV.ui.sidebar.buildTimeValueChecks;
  const applyBinDrilldown = RV.ui.report.analysis.applyBinDrilldown;
  const clearBinDrilldown = RV.ui.report.analysis.clearBinDrilldown;
  const collectGroupValuesFromValidityRows = RV.ui.report.validity.collectGroupValuesFromValidityRows;
  const collectSidebarConfig = RV.app.config.collectSidebarConfig;
  const countExprLeaves = RV.ui.ruleExpr.countExprLeaves;
  const createExprCondEl = RV.ui.ruleExpr.createExprCondEl;
  const createExprGroupEl = RV.ui.ruleExpr.createExprGroupEl;
  const createFilterRule = RV.ui.sidebar.createFilterRule;
  const downloadBlob = RV.infra.downloadBlob;
  const esc = RV.infra.esc;
  const filterCheckboxGrid = RV.ui.report.analysis.filterCheckboxGrid;
  const filterValidityResultRows = RV.ui.report.validity.filterValidityResultRows;
  const getRvGroupValueFilterState = RV.ui.report.validity.getRvGroupValueFilterState;
  const initResizableTables = RV.ui.report.analysis.initResizableTables;
  const isPartialRvGroupValueFilter = RV.ui.report.validity.isPartialRvGroupValueFilter;
  const initRvPreHitDnD = RV.ui.report.validity.initRvPreHitDnD;
  const invalidateDataAnalysisCache = (...args) => {
    if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
      return RV.events.invalidateDataAnalysisCache(...args);
    }
    return RV.ui.report.analysis.invalidateDataAnalysisCache(...args);
  };
  const refreshDaBadLabelUI = RV.ui.report.analysis.refreshDaBadLabelUI;
  const refreshSampleGroupColSearch = RV.ui.sidebar.refreshSampleGroupColSearch;
  const refreshPostTrendTable = RV.ui.report.post.refreshPostTrendTable;
  const refreshPreStrategyView = RV.ui.report.pre.refreshPreStrategyView;
  const resolvePreGroupCols = RV.ui.report.pre.resolvePreGroupCols;
  const schedulePreGroupDimRecompute = RV.ui.report.pre.schedulePreGroupDimRecompute;
  const schedulePostRiskRecompute = RV.ui.report.post.schedulePostRiskRecompute;
  const syncSampleGroupOrderList = RV.ui.sidebar.syncSampleGroupOrderList;
  const refreshRiskEstView = RV.ui.report.validity.refreshRiskEstView;
  const refreshValidityPostWaterfallRiskView = RV.ui.report.validity.refreshValidityPostWaterfallRiskView;
  const refreshRvGroupColSearch = RV.ui.report.validity.refreshRvGroupColSearch;
  const refreshPostRuleReviewTrendTable = RV.ui.report.postRuleReview.refreshPostRuleReviewTrendTable;
  const applyPostRuleReviewTrendValueFilter = RV.ui.report.postRuleReview.applyPostRuleReviewTrendValueFilter;
  const renderValidityPostWaterfallRiskHtml = RV.ui.report.validity.renderValidityPostWaterfallRiskHtml;
  const renderValidityPreHitTableHtml = RV.ui.report.validity.renderValidityPreHitTableHtml;
  const renderValidityResults = RV.ui.report.validity.renderValidityResults;
  const renderValiditySwapTableHtml = RV.ui.report.validity.renderValiditySwapTableHtml;
  const restoreBinDisplayFilters = RV.ui.report.analysis.restoreBinDisplayFilters;
  const restoreDistChartSelection = RV.ui.report.analysis.restoreDistChartSelection;
  const restoreGroupFilterSelection = RV.ui.report.analysis.restoreGroupFilterSelection;
  const updateGroupVarFilterMeta = RV.ui.report.analysis.updateGroupVarFilterMeta;
  const runBinAnalysis = RV.app.orchestrator.runBinAnalysis;
  const runCrossBinAnalysis = (...args) => RV.app.orchestrator.runCrossBinAnalysis?.(...args);
  const runEdaAnalysis = RV.app.orchestrator.runEdaAnalysis;
  const runValidityAnalysis = RV.app.orchestrator.runValidityAnalysis;
  const snapshotDataAnalysisUiState = RV.ui.report.analysis.snapshotDataAnalysisUiState;
  const snapshotPostUiState = RV.ui.report.post.snapshotPostUiState;
  const snapshotPreUiState = RV.ui.report.pre.snapshotPreUiState;
  const snapshotValidityUiState = RV.ui.report.validity.snapshotValidityUiState;
  const syncEdaDisplayVarFilters = RV.ui.report.analysis.syncEdaDisplayVarFilters;
  const syncPreStrategyDimPickers = RV.ui.report.pre.syncPreStrategyDimPickers;
  const syncPostTrendDimPickers = RV.ui.report.post.syncPostTrendDimPickers;
  const syncRuleReviewTrendDimPickers = RV.ui.report.postRuleReview.syncRuleReviewTrendDimPickers;
  const syncRvGroupValueDimPickers = RV.ui.report.validity.syncRvGroupValueDimPickers;
  const exportRulesPackDownload = RV.app.rulesIo.exportRulesPackDownload;
  const refollowValidityBaselineFromSidebar = RV.app.rulesIo.refollowValidityBaselineFromSidebar;
  const CP = () => RV.ui.collapsedPicker;
  const EXPORT_CAPABILITIES = Object.freeze({
    version: "2026-07-16-export-tabs",
    interactiveZoneSelectors: [
      "#postTrendFiltersMount",
      "#postRuleReviewTrendFiltersMount",
      "#daGroupMetricsFilterBar",
      "#daBinResultFilterBar",
      "#rvGroupValueFilter",
      "#drResultsMount",
    ],
    interactiveButtonIds: [
      "rvExportBaselineRules",
      "rvExportCandidateRules",
    ],
    staticReason: "导出报告基于生成时快照；如需调整配置并重算，请回主分析工具后重新导出。",
  });
  const updateBinResults = RV.ui.report.analysis.updateBinResults;
  const updateEdaResults = RV.ui.report.analysis.updateEdaResults;
  var target = RV.export = RV.export || {};

  const EXPORT_TAB_OPTIONS = [
    { id: "post", sectionId: "tab-post", label: "贷后风险", group: "现状分析" },
    { id: "pre", sectionId: "tab-pre", label: "贷前策略", group: "现状分析" },
    { id: "attribution", sectionId: "tab-attribution", label: "异动归因", group: "现状分析" },
    { id: "analysis", sectionId: "tab-analysis", label: "数据分析", group: "策略挖掘" },
    { id: "validity", sectionId: "tab-validity", label: "规则有效性检查", group: "策略评估" },
  ];

  function isExportTabReady(tabId) {
    switch (tabId) {
      case "post": return !!(S.lastAnalysis?.postRisk || S.lastAnalysis?.summary);
      case "pre": return !!S.lastAnalysis?.hitMetrics;
      case "attribution": return !!S.lastAttributionAnalysis;
      case "dailyReview": return !!S.lastDailyReview;
      case "analysis": return !!(S.lastDataAnalysis?.eda || S.lastDataAnalysis?.bin);
      case "validity": return !!S.lastValidityAnalysis;
      default: return false;
    }
  }

  function isExportTabStale(tabId) {
    switch (tabId) {
      case "post":
      case "pre": return !!S.mainReportStale;
      case "attribution": return !!S.attributionResultsStale;
      case "dailyReview": return !!S.dailyReviewResultsStale;
      case "analysis": return !!S.daResultsStale;
      case "validity": return !!S.validityResultsStale;
      default: return false;
    }
  }

  function listExportTabChoices() {
    return EXPORT_TAB_OPTIONS.map((opt) => ({
      ...opt,
      ready: isExportTabReady(opt.id),
      stale: isExportTabReady(opt.id) && isExportTabStale(opt.id),
      mounted: !!document.getElementById(opt.sectionId),
    }));
  }

  function promptExportTabSelection() {
    return new Promise((resolve) => {
      const choices = listExportTabChoices();
      const readyCount = choices.filter((c) => c.ready).length;
      if (!readyCount) {
        RV.events?.notify?.("暂无可导出的 Tab 结果，请先运行对应分析", "warn");
        resolve(null);
        return;
      }

      const existing = document.getElementById("rvExportTabModal");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "rvExportTabModal";
      overlay.className = "rv-export-modal-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "rvExportTabModalTitle");

      let bodyHtml = `<div class="rv-export-modal">
        <h3 id="rvExportTabModalTitle">选择导出内容</h3>
        <p class="rv-export-modal-hint config-muted">勾选要写入 HTML 报告的 Tab。默认只勾<strong>有结果且未过期</strong>的项；无结果不可选。盈利性 / 风险目标测算仍不导出。</p>
        <div class="rv-export-tab-list">`;
      let lastGroup = "";
      for (const c of choices) {
        if (c.group !== lastGroup) {
          bodyHtml += `<div class="rv-export-tab-group">${esc(c.group)}</div>`;
          lastGroup = c.group;
        }
        const checked = c.ready && !c.stale ? " checked" : "";
        const disabled = c.ready ? "" : " disabled";
        let note = "";
        if (!c.ready) note = `<span class="rv-export-tab-note">无结果</span>`;
        else if (c.stale) note = `<span class="rv-export-tab-note is-stale">已过期</span>`;
        bodyHtml += `<label class="rv-export-tab-item${c.ready ? "" : " is-disabled"}${c.stale ? " is-stale" : ""}">
          <input type="checkbox" data-export-tab="${esc(c.id)}"${checked}${disabled} />
          <span>${esc(c.label)}</span>${note}
        </label>`;
      }
      bodyHtml += `</div>
        <div class="rv-export-modal-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-export-modal="cancel">取消</button>
          <button type="button" class="btn btn-secondary btn-sm" data-export-modal="fresh">仅新鲜</button>
          <button type="button" class="btn btn-secondary btn-sm" data-export-modal="ready">全部有结果</button>
          <button type="button" class="btn btn-primary btn-sm" data-export-modal="ok">导出</button>
        </div>
      </div>`;
      overlay.innerHTML = bodyHtml;
      document.body.appendChild(overlay);

      const close = (val) => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(null);
      };
      document.addEventListener("keydown", onKey);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(null);
        const act = e.target.closest?.("[data-export-modal]")?.getAttribute("data-export-modal");
        if (act === "cancel") {
          close(null);
          return;
        }
        if (act === "fresh") {
          overlay.querySelectorAll("[data-export-tab]").forEach((inp) => {
            const id = inp.getAttribute("data-export-tab");
            inp.checked = !inp.disabled && isExportTabReady(id) && !isExportTabStale(id);
          });
          return;
        }
        if (act === "ready") {
          overlay.querySelectorAll("[data-export-tab]").forEach((inp) => {
            const id = inp.getAttribute("data-export-tab");
            inp.checked = !inp.disabled && isExportTabReady(id);
          });
          return;
        }
        if (act === "ok") {
          const selected = [...overlay.querySelectorAll("[data-export-tab]:checked")]
            .map((inp) => inp.getAttribute("data-export-tab"))
            .filter(Boolean);
          if (!selected.length) {
            RV.events?.notify?.("请至少勾选一个有结果的 Tab", "warn");
            return;
          }
          const staleSelected = selected.filter((id) => isExportTabStale(id));
          if (staleSelected.length) {
            const labels = staleSelected
              .map((id) => EXPORT_TAB_OPTIONS.find((o) => o.id === id)?.label || id)
              .join("、");
            const okStale = window.confirm(
              `所选含过期结果：${labels}\n\n过期内容可能与当前样本/规则不一致。仍要导出吗？`
            );
            if (!okStale) return;
          }
          close(selected);
        }
      });
    });
  }

  /** Remove one top-level `<section id="…">…</section>` (nesting-aware). Pure string — no DOM. */
  function removeHtmlSectionById(html, sectionId) {
    const esc = String(sectionId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const openRe = new RegExp(
      `<section\\b(?=[^>]*\\bid=["']${esc}["'])[^>]*>`,
      "i"
    );
    const m = openRe.exec(html);
    if (!m) return html;
    const lower = html.toLowerCase();
    let pos = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && pos < html.length) {
      const nextOpen = lower.indexOf("<section", pos);
      const nextClose = lower.indexOf("</section>", pos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        pos = nextOpen + 8;
      } else {
        depth -= 1;
        pos = nextClose + "</section>".length;
        if (depth === 0) {
          return html.slice(0, m.index) + html.slice(pos);
        }
      }
    }
    return html;
  }

  function ensureSectionVisibleClass(html, sectionId) {
    const esc = String(sectionId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(<section\\b)(?=[^>]*\\bid=["']${esc}["'])([^>]*)(>)`,
      "i"
    );
    return html.replace(re, (full, tag, attrs, close) => {
      if (/\bsection-visible\b/.test(attrs)) return full;
      if (/\bclass\s*=/.test(attrs)) {
        return (
          tag +
          attrs.replace(
            /\bclass\s*=\s*(["'])([^"']*)\1/i,
            (_, q, c) => ` class=${q}${c} section-visible${q}`
          ) +
          close
        );
      }
      return `${tag}${attrs} class="section-visible"${close}`;
    });
  }

  function filterReportBodyByTabs(html, selectedIds) {
    let out = html || "";
    const keep = new Set(
      EXPORT_TAB_OPTIONS
        .filter((o) => selectedIds.includes(o.id))
        .map((o) => o.sectionId)
    );
    const catalogIds = EXPORT_TAB_OPTIONS.map((o) => o.sectionId);
    const alwaysDrop = ["tab-profitability", "tab-risk-target", "tab-el-allocator"];
    for (const id of [...catalogIds, ...alwaysDrop]) {
      if (!keep.has(id)) out = removeHtmlSectionById(out, id);
    }
    // Drop leftover tab-* sections not in the export catalog
    const leftover = out.match(/<section\b[^>]*\bid=["'](tab-[^"']+)["'][^>]*>/gi) || [];
    for (const openTag of leftover) {
      const idM = /\bid=["'](tab-[^"']+)["']/i.exec(openTag);
      if (!idM) continue;
      if (!keep.has(idM[1])) out = removeHtmlSectionById(out, idM[1]);
    }
    for (const id of keep) {
      out = ensureSectionVisibleClass(out, id);
    }
    return out;
  }

  function prepareSelectedTabsForExport(selectedIds) {
    for (const id of selectedIds) {
      try {
        RV.app.orchestrator?.ensureTabMounted?.(id);
      } catch (err) {
        console.warn("ensureTabMounted for export", id, err);
      }
    }
    if (selectedIds.includes("dailyReview") && S.lastDailyReview) {
      const ok = RV.ui.report.dailyReview?.prepareDailyReviewForExport?.();
      if (!ok) console.warn("daily review export prepare: results mount empty");
    }
  }

async function downloadReport() {
  RV.app.orchestrator?.flushPendingTabRemounts?.();
  const doc = $("report-output")?.querySelector(".report-document");
  if (!doc && !S.lastReportHtml) {
    RV.events?.notify?.("请先生成分析报告或打开相关 Tab", "warn");
    return;
  }

  const selectedIds = await promptExportTabSelection();
  if (!selectedIds?.length) return;

  prepareSelectedTabsForExport(selectedIds);

  if (selectedIds.includes("validity") && S.lastValidityAnalysis?.postRows) {
    try {
      await refreshValidityPostWaterfallRiskView({ fullRerender: true });
    } catch (err) {
      console.error("导出前表4 刷新失败", err);
    }
  }

  const liveDoc = $("report-output")?.querySelector(".report-document");
  let reportBody = liveDoc ? liveDoc.innerHTML : S.lastReportHtml;
  reportBody = filterReportBodyByTabs(reportBody, selectedIds);
  if (!reportBody || !reportBody.includes("id=\"tab-")) {
    RV.events?.notify?.("选中的 Tab 在报告区尚无内容，请先打开并运行对应分析", "warn");
    return;
  }

  const selectedLabels = EXPORT_TAB_OPTIONS
    .filter((o) => selectedIds.includes(o.id))
    .map((o) => o.label);
  const titleExtra = selectedLabels.length === 1
    ? ` · ${selectedLabels[0]}`
    : ` · ${selectedLabels.length} 个模块`;

  const datePrefix = new Date().toISOString().slice(0, 10);
  const styles = (document.querySelector("style")?.textContent || "")
    + "\n.report-document section{display:block!important;}"
    + "\n#rvExportStaticNotice{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:.5rem .75rem;margin:0 0 1rem;font-size:.82rem;color:#92400e;}"
    + "\n.rv-config-desc{margin:0;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--surface);font-size:.82rem;color:var(--text-dim);line-height:1.55;}"
    + "\n.rv-config-desc-title{margin:0 0 .25rem;font-weight:600;color:var(--text-strong);font-size:.8rem;}"
    + "\n.rv-config-desc-line{margin:.18rem 0;}"
    + "\n.rv-config-desc-note{color:var(--text-muted);font-size:.78rem;}"
    + "\n.rv-config-desc-list{margin:.28rem 0 .22rem;padding-left:1.05rem;}"
    + "\n.rv-config-desc-actions{display:flex;flex-wrap:wrap;gap:.35rem .45rem;margin-top:.45rem;}"
    + "\n.rv-export-static-action{display:inline-flex;align-items:center;min-height:1.65rem;padding:.18rem .55rem;border-radius:999px;border:1px dashed var(--border);background:var(--surface);font-size:.76rem;color:var(--text-muted);}"
    + "\n.rv-export-banner-note{margin:.3rem 0 0;font-size:.78rem;color:#92400e;}"
    /* Fallback tip styles if linked CSS fails to load (export offline) */
    + "\n.rv-tip-anchor{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:.8rem;cursor:help;}"
    + "\n.rv-hint.rv-tip-anchor{width:1.05rem;height:1.05rem;margin-left:.28rem;border:1px solid var(--border-strong,#444);border-radius:999px;background:var(--surface,#1a1a1a);color:var(--text-muted,#999);font-size:.68rem;font-weight:700;}"
    + "\n.rv-tip-anchor::after{content:attr(data-rv-tip);position:absolute;left:0;bottom:calc(100% + 6px);background:var(--tooltip-bg,#111);color:var(--tooltip-fg,#eee);border-radius:6px;padding:.45rem .6rem;font-size:.72rem;font-weight:400;line-height:1.4;white-space:normal;width:max-content;max-width:min(28rem,calc(100vw - 3rem));opacity:0;pointer-events:none;z-index:120;box-shadow:0 4px 16px rgba(0,0,0,.35);}"
    + "\n.rv-tip-anchor:hover::after,.rv-tip-anchor:focus-visible::after{opacity:1;}"
    + "\n.rv-tip-anchor.rv-tip--end::after{left:auto;right:0;}"
    + "\n#tab-daily-review .dr-brief-grain-bar[data-rv-tip]{position:relative;z-index:5;}"
    + "\n#tab-daily-review .dr-brief-grain-bar[data-rv-tip]::after{content:attr(data-rv-tip);position:absolute;left:0;top:calc(100% + 6px);bottom:auto;background:var(--tooltip-bg,#111);color:var(--tooltip-fg,#eee);border-radius:6px;padding:.5rem .65rem;font-size:.72rem;line-height:1.55;white-space:pre;width:max-content;max-width:none;opacity:0;pointer-events:none;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,.35);}"
    + "\n#tab-daily-review .dr-brief-grain-bar[data-rv-tip]:has(.dr-period-tip-trigger:hover)::after,#tab-daily-review .dr-brief-grain-bar[data-rv-tip]:has(.dr-period-tip-trigger:focus-visible)::after{opacity:1;}"
    + "\n#tab-daily-review .dr-period-tip-trigger::after,#tab-daily-review .dr-period-tip-trigger::before{content:none!important;display:none!important;}";
  const toAbsoluteUrl = (u) => {
    try {
      return new URL(String(u || ""), window.location.href).href;
    } catch (_) {
      return u;
    }
  };
  const linkedCss = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((l) => l.getAttribute("href"))
    .filter(Boolean)
    .map((href) => `<link rel="stylesheet" href="${esc(toAbsoluteUrl(href))}" />`)
    .join("");
  const snapshot = collectExportSnapshot(selectedIds);
  const snapshotJson = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  const exportScriptSkip = /(?:^|\/)report-profitability\.js|(?:^|\/)profitability\.js(?:\?|$)|(?:^|\/)report-risk-target\.js|(?:^|\/)risk-target\.js(?:\?|$)|(?:^|\/)report-el-allocator\.js|(?:^|\/)el-allocator\.js(?:\?|$)/;
  const scriptSrcs = [...document.querySelectorAll("script[src]")]
    .map((s) => s.getAttribute("src"))
    .filter(Boolean)
    .filter((src) => !exportScriptSkip.test(src))
    .map((src) => toAbsoluteUrl(src));
  const scriptTags = scriptSrcs.map((src) => `<script src="${esc(src)}"></script>`).join("\n");
  if (!scriptTags) {
    console.error("无法提取应用脚本，导出中止");
    return;
  }
  const snapScript = "<scr" + "ipt type=\"application/json\" id=\"rv-export-snapshot\">" + snapshotJson + "</scr" + "ipt>";
  const modeScript = "<scr" + "ipt>window.__RV_EXPORT_MODE__=true;</scr" + "ipt>";
  const bootScript = "<scr" + "ipt>if(typeof window.bootExportReport===\"function\")window.bootExportReport();else if(window.RV&&RV.export&&RV.export.bootExportReport)RV.export.bootExportReport();</scr" + "ipt>";
  const bootWatchdogScript = "<scr" + "ipt>(function(){setTimeout(function(){var boot=window.__RV_EXPORT_BOOT__;if(boot&&boot.ok===false){var noteFail=document.getElementById(\"rvExportStaticNotice\");if(noteFail)noteFail.style.display=\"\";var capFail=document.getElementById(\"rvExportCapabilityStatus\");if(capFail)capFail.textContent=\"能力降级：仅静态查看\";return;}if(window.__RV_EXPORT_BOOTED)return;var el=document.getElementById(\"rvExportBootStatus\");if(el){el.textContent=\"资源加载异常，已切换静态查看模式\";el.style.color=\"#b45309\";}var cap=document.getElementById(\"rvExportCapabilityStatus\");if(cap)cap.textContent=\"能力降级：仅静态查看\";var note=document.getElementById(\"rvExportStaticNotice\");if(note)note.style.display=\"\";},2600);})();</scr" + "ipt>";
  const full = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>策略复盘报告${esc(titleExtra)}</title>${linkedCss}<style>${styles}</style></head><body>
    <header class="app-header"><h1>策略复盘报告${esc(titleExtra)}</h1><p>导出时间 ${new Date().toLocaleString("zh-CN")} · 含 ${esc(selectedLabels.join("、"))} · <span id="rvExportBootStatus">资源加载中…</span> · <span id="rvExportCapabilityStatus">能力识别中…</span></p></header>
    <main style="padding:1rem">
    <p id="rvExportStaticNotice" style="display:none">导出页按生成时快照展示：支持结果区局部筛选联动；涉及样本重算、规则重跑、拖拽改序的配置仅展示口径说明。若需修改口径，请回主应用调整后重新导出。</p>
    <div id="report-output"><div class="report-document">${reportBody}</div></div>
    </main>
    ${snapScript}${modeScript}${scriptTags}${bootScript}${bootWatchdogScript}
    </body></html>`;
  const fileSuffix = selectedIds.length === 1 ? `_${selectedIds[0]}` : "";
  downloadBlob(`策略复盘报告${fileSuffix}_${datePrefix}.html`, new Blob([full], { type: "text/html;charset=utf-8" }));
  RV.events?.notify?.(`已导出：${selectedLabels.join("、")}`, "ok");
  setTimeout(() => {
    try {
      const cfg = collectSidebarConfig();
      downloadBlob(
        `策略复盘配置_${datePrefix}.json`,
        new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json;charset=utf-8" })
      );
    } catch (err) {
      console.error("导出配置失败", err);
    }
  }, 350);
}
function isExportMode() {
  return !!window.__RV_EXPORT_MODE__;
}
function getExportCapabilities() {
  return EXPORT_CAPABILITIES;
}
function setExportCapabilitiesContext() {
  if (!isExportMode()) return;
  window.__RV_EXPORT_CAPS__ = getExportCapabilities();
}
function getExportCapabilitySummary() {
  return "支持结果区筛选联动；配置区为只读口径说明";
}
function markExportInteractiveZones(root) {
  if (!root) return;
  const caps = getExportCapabilities();
  for (const selector of caps.interactiveZoneSelectors || []) {
    root.querySelectorAll(selector).forEach((el) => {
      el.dataset.rvExportInteractive = "1";
    });
  }
  for (const id of caps.interactiveButtonIds || []) {
    const btn = root.querySelector("#" + id);
    if (btn) btn.dataset.rvExportInteractive = "1";
  }
}
function isExportInteractiveTarget(target) {
  if (!isExportMode()) return true;
  if (!target) return false;
  if (target.closest?.('[data-rv-export-interactive="1"]')) return true;
  const ctrl = target.closest?.("button[id],input[id],select[id],textarea[id]");
  const id = ctrl?.id;
  if (!id) return false;
  return (getExportCapabilities().interactiveButtonIds || []).includes(id);
}
function collectExportPanelHints(panel) {
  const selectors = [
    ".rv-wb-meta-primary",
    ".sample-filter-meta",
    ".chk-filter-meta",
    ".da-risk-est-sample-hint",
  ];
  const list = [];
  const seen = new Set();
  for (const selector of selectors) {
    panel.querySelectorAll(selector).forEach((el) => {
      const txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt) return;
      if (txt === "生成报告后显示样本摘要") return;
      if (seen.has(txt)) return;
      seen.add(txt);
      list.push(txt);
    });
  }
  return list.slice(0, 3);
}
function buildExportPanelDescHtml(panel) {
  const summary = String(panel.querySelector(".da-panel-summary")?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  const hints = collectExportPanelHints(panel);
  let html = `<div class="rv-config-desc">`;
  html += `<p class="rv-config-desc-line">${esc(summary || "按导出时配置快照")}</p>`;
  if (hints.length === 1) {
    html += `<p class="rv-config-desc-line rv-config-desc-note">${esc(hints[0])}</p>`;
  } else if (hints.length > 1) {
    html += `<ul class="rv-config-desc-list">`;
    for (const hint of hints.slice(0, 2)) html += `<li>${esc(hint)}</li>`;
    html += `</ul>`;
  }
  html += `<p class="rv-config-desc-line rv-config-desc-note">${esc(getExportCapabilities().staticReason)}</p>`;
  html += `</div>`;
  return html;
}
function freezeExportStaleBanners(root) {
  root.querySelectorAll(".rv-stale-banner").forEach((banner) => {
    const actions = [...banner.querySelectorAll("button.btn")];
    if (!actions.length) return;
    const labels = actions.map((b) => String(b.textContent || "").trim()).filter(Boolean);
    actions.forEach((b) => b.remove());
    const note = document.createElement("p");
    note.className = "rv-export-banner-note";
    note.textContent = labels.length
      ? `导出快照只读：${labels.join(" / ")} 请回主应用执行。`
      : getExportCapabilities().staticReason;
    banner.appendChild(note);
  });
}
function freezeConfigPanelsForExport(root) {
  const keepIds = new Set(getExportCapabilities().interactiveButtonIds || []);
  root.querySelectorAll(".da-config-panel").forEach((panel) => {
    panel.classList.add("rv-export-config-frozen", "is-collapsed");
    const header = panel.querySelector(".da-panel-header");
    // Keep collapse toggle so analysts can expand readonly口径; strip attr-only toggles.
    if (header) {
      header.removeAttribute("data-attr-panel-toggle");
      const panelId = panel.id;
      if (panelId && !header.getAttribute("data-config-panel-toggle")) {
        header.setAttribute("data-config-panel-toggle", panelId);
      }
      if (header.getAttribute("data-config-panel-toggle")) {
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        if (!header.querySelector(".da-panel-collapse-hint")) {
          const hint = document.createElement("span");
          hint.className = "da-panel-collapse-hint";
          hint.setAttribute("aria-hidden", "true");
          header.appendChild(hint);
        }
      }
    }
    const keepNodes = [...panel.querySelectorAll("button[id]")]
      .filter((btn) => keepIds.has(btn.id));
    keepNodes.forEach((btn) => btn.remove());
    let body = panel.querySelector(".da-panel-body");
    if (!body) {
      panel.querySelectorAll("button.btn").forEach((btn) => {
        if (!keepIds.has(btn.id)) btn.remove();
      });
      body = document.createElement("div");
      body.className = "da-panel-body";
      panel.appendChild(body);
    }
    body.innerHTML = buildExportPanelDescHtml(panel);
    if (keepNodes.length) {
      const actions = document.createElement("div");
      actions.className = "rv-config-desc-actions";
      actions.dataset.rvExportInteractive = "1";
      keepNodes.forEach((btn) => actions.appendChild(btn));
      body.appendChild(actions);
    }
  });
}
function freezeNonInteractiveButtons(root) {
  const buttons = root.querySelectorAll("button.btn, button.bin-label-drillable");
  buttons.forEach((btn) => {
    if (isExportInteractiveTarget(btn)) return;
    const label = String(btn.textContent || "").replace(/\s+/g, " ").trim() || "操作";
    const note = document.createElement("span");
    note.className = "rv-export-static-action";
    note.textContent = `${label}（导出快照只读）`;
    btn.replaceWith(note);
  });
}
function applyExportReadOnlyModel(root) {
  if (!isExportMode() || !root) return;
  setExportCapabilitiesContext();
  RV.ui.report.dailyReview?.applyDailyReviewExportConfigSummaries?.();
  freezeExportStaleBanners(root);
  freezeConfigPanelsForExport(root);
  markExportInteractiveZones(root);
  freezeNonInteractiveButtons(root);
  // Re-enable accordion expand for readonly口径 descriptions
  if (root.dataset) delete root.dataset.configPanelToggleBound;
  RV.ui.configPanel?.bindPanelToggle?.(root);
}
function showExportStaticNotice() {
  const el = document.getElementById("rvExportStaticNotice");
  if (el) el.style.display = "";
}
function markExportBootOk() {
  if (!isExportMode()) return;
  window.__RV_EXPORT_BOOTED = true;
  const el = document.getElementById("rvExportBootStatus");
  if (el) {
    el.textContent = "资源加载完成";
    el.style.color = "#059669";
  }
  const cap = document.getElementById("rvExportCapabilityStatus");
  if (cap) cap.textContent = getExportCapabilitySummary();
}
function markExportBootFailed(msg) {
  if (!isExportMode()) return;
  const el = document.getElementById("rvExportBootStatus");
  if (el) {
    el.textContent = "资源加载失败：" + msg;
    el.style.color = "#dc2626";
  }
  const cap = document.getElementById("rvExportCapabilityStatus");
  if (cap) cap.textContent = "能力降级：仅静态查看";
}
/** Export-only: last N calendar day buckets (SPA compute window unchanged). */
const EXPORT_DAY_WINDOW = 14;
/** Export-only: last N risk-mature day buckets (order-risk den > 0), unioned with calendar window. */
const EXPORT_DAY_MATURE_WINDOW = 14;

function resolveExportRiskMetricId(dr) {
  const list = (dr && dr.config && (dr.config.detailMetrics || dr.config.metrics)) || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m && (m.id === "risk" || m.name === "订单风险")) return m.id || "risk";
  }
  return "risk";
}

function isExportDayRiskMature(series, period, riskMetricId) {
  const cells = series && series.cells;
  if (!cells || !period || !riskMetricId) return false;
  const prefix = period + "\0";
  const keys = Object.keys(cells);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key.startsWith(prefix) && !(cells[key] && cells[key].period === period)) continue;
    const slot = cells[key] && cells[key].metrics && cells[key].metrics[riskMetricId];
    if (slot && slot.d > 0) return true;
  }
  return false;
}

/** Last EXPORT_DAY_WINDOW calendar days ∪ last EXPORT_DAY_MATURE_WINDOW risk-mature days. */
function collectExportDayKeepPeriods(series, riskMetricId) {
  const periods = (series && Array.isArray(series.periods) ? series.periods.slice() : []).sort();
  const keep = new Set();
  const calendar = periods.slice(-EXPORT_DAY_WINDOW);
  for (let i = 0; i < calendar.length; i++) keep.add(calendar[i]);
  let left = EXPORT_DAY_MATURE_WINDOW;
  for (let i = periods.length - 1; i >= 0 && left > 0; i--) {
    const p = periods[i];
    if (isExportDayRiskMature(series, p, riskMetricId)) {
      keep.add(p);
      left--;
    }
  }
  return Array.from(keep).sort();
}

function dropMonthKey(obj) {
  if (!obj || typeof obj !== "object" || !Object.prototype.hasOwnProperty.call(obj, "month")) return obj;
  const copy = { ...obj };
  delete copy.month;
  return copy;
}

/**
 * Export slim: keep day+week (drop month); day = last 14 calendar ∪ last 14 risk-mature;
 * strip rebuildable `points`; drop derivable seriesLevelByGrain / seriesLevelChangeByGrain.
 * Boot calls hydrateDailyReviewSeries to restore points.
 */
function slimPairwiseHistory(pw) {
  if (!pw || typeof pw !== "object") return pw;
  const out = {};
  for (const g of Object.keys(pw)) {
    const block = pw[g];
    if (!block || typeof block !== "object" || !Array.isArray(block.pairs)) {
      out[g] = block;
      continue;
    }
    out[g] = {
      ...block,
      pairs: block.pairs.map((p) => {
        if (!p || !p.history) return p;
        const copy = { ...p };
        delete copy.history;
        return copy;
      }),
    };
  }
  return out;
}
function slimDailyReviewForExport(dr, uiState) {
  if (!dr) return null;
  const out = { ...dr };
  const riskMetricId = resolveExportRiskMetricId(out);
  const dayKeep = collectExportDayKeepPeriods(out.seriesByGrain && out.seriesByGrain.day, riskMetricId);

  function cellForExport(cell) {
    if (!cell || typeof cell !== "object" || !cell.mom) return cell;
    const copy = { ...cell };
    delete copy.mom;
    return copy;
  }

  function dropMom(series) {
    if (!series || typeof series !== "object" || !series.cells) return series;
    const next = Object.create(null);
    const cells = series.cells;
    let changed = false;
    for (const key of Object.keys(cells)) {
      const cell = cellForExport(cells[key]);
      if (cell !== cells[key]) changed = true;
      next[key] = cell;
    }
    if (!changed) return series;
    return { ...series, cells: next };
  }

  function stripPoints(series) {
    if (!series || typeof series !== "object") return series;
    const base = dropMom(series);
    if (!Object.prototype.hasOwnProperty.call(base, "points")) return base;
    const copy = { ...base };
    delete copy.points;
    return copy;
  }

  function trimDaySeries(series) {
    const base = stripPoints(series);
    if (!base || !Array.isArray(base.periods)) return base;
    const keepList = dayKeep.length ? dayKeep : collectExportDayKeepPeriods(base, riskMetricId);
    if (!keepList.length) return base;
    const keep = new Set(keepList);
    const periods = base.periods.filter((p) => keep.has(p));
    if (periods.length === base.periods.length) return base;
    const copy = { ...base, periods };
    const cells = base.cells;
    if (cells && typeof cells === "object") {
      const next = Object.create(null);
      for (const key of Object.keys(cells)) {
        const period = key.includes("\0") ? key.split("\0", 1)[0] : (cells[key] && cells[key].period);
        if (period && keep.has(period)) next[key] = cellForExport(cells[key]);
      }
      copy.cells = next;
    }
    return copy;
  }

  function keepGrains(src) {
    if (!src || typeof src !== "object") return null;
    const kept = {};
    if (src.day) kept.day = trimDaySeries(src.day);
    if (src.week) kept.week = stripPoints(src.week);
    return (kept.day || kept.week) ? kept : null;
  }

  if (out.seriesByGrain) out.seriesByGrain = keepGrains(out.seriesByGrain);
  if (out.seriesFineByGrain) out.seriesFineByGrain = keepGrains(out.seriesFineByGrain);
  if (out.seriesLevelDecByGrain) out.seriesLevelDecByGrain = keepGrains(out.seriesLevelDecByGrain);
  if (out.seriesLevelDecFineByGrain) out.seriesLevelDecFineByGrain = keepGrains(out.seriesLevelDecFineByGrain);
  if (out.seriesLevelChangeDecByGrain) out.seriesLevelChangeDecByGrain = keepGrains(out.seriesLevelChangeDecByGrain);
  if (out.seriesLevelChangeDecFineByGrain) out.seriesLevelChangeDecFineByGrain = keepGrains(out.seriesLevelChangeDecFineByGrain);
  if (out.briefByGrain) out.briefByGrain = dropMonthKey(out.briefByGrain);
  if (out.anomaliesByGrain) out.anomaliesByGrain = dropMonthKey(out.anomaliesByGrain);
  if (out.contributions) out.contributions = dropMonthKey(out.contributions);
  if (out.pairwise) out.pairwise = slimPairwiseHistory(dropMonthKey(out.pairwise));
  delete out.seriesLevelByGrain;
  delete out.seriesLevelFineByGrain;
  delete out.seriesLevelChangeByGrain;
  delete out.monthPeriods;
  return out;
}
function collectExportSnapshot(selectedTabIds) {
  const omitKeys = (obj, keys) => {
    if (!obj) return null;
    const out = { ...obj };
    for (const k of keys) delete out[k];
    return out;
  };
  const daState = snapshotDataAnalysisUiState();
  const postState = snapshotPostUiState();
  const preState = snapshotPreUiState();
  const summaryState = postState?.ruleReviewTrendValueFilter != null
    ? { trendValueFilter: postState.ruleReviewTrendValueFilter }
    : null;
  const validityState = snapshotValidityUiState();
  const dailyReviewState = RV.ui.report.dailyReview?.snapshotDailyReviewUiState?.() || null;
  const selected = Array.isArray(selectedTabIds) ? selectedTabIds.slice() : null;
  return {
    exportTabs: selected,
    lastAnalysis: omitKeys(S.lastAnalysis, ["preRows", "postRows"]),
    lastDataAnalysis: S.lastDataAnalysis ? {
      eda: S.lastDataAnalysis.eda || null,
      bin: S.lastDataAnalysis.bin || null,
      base: S.lastDataAnalysis.base ? {
        postCount: S.lastDataAnalysis.base.postCount,
        preCount: S.lastDataAnalysis.base.preCount,
        overallRisk: S.lastDataAnalysis.base.overallRisk,
        ratioSpec: S.lastDataAnalysis.base.ratioSpec,
        badSpec: S.lastDataAnalysis.base.badSpec,
      } : null,
    } : null,
    lastValidityAnalysis: omitKeys(S.lastValidityAnalysis, ["preRows", "postRows"]),
    lastAttributionAnalysis: S.lastAttributionAnalysis || null,
    lastDailyReview: slimDailyReviewForExport(S.lastDailyReview, dailyReviewState),
    daState,
    postState,
    preState,
    summaryState,
    validityState,
    dailyReviewState,
  };
}
function exportRefreshValidityFilteredViews(filterMap) {
  const result = S.lastValidityAnalysis;
  if (!result || !isExportMode()) return;
  const { groupCols, ratioSpec, swapRows, preHitRows, postWaterfallRisk, waterfallOrder, hardRules, customRules } = result;
  const map = filterMap ?? (() => {
    const live = getRvGroupValueFilterState();
    if (Object.keys(live).length) return live;
    if (!groupCols?.length) return null;
    const m = {};
    const dimValues = collectGroupValuesFromValidityRows(result.rows, groupCols);
    for (const col of groupCols) m[col] = new Set(dimValues[col] || []);
    return m;
  })();

  const swapMount = $("rvSwapTableMount");
  if (swapMount && swapRows?.length) {
    const filtered = filterValidityResultRows(swapRows, groupCols, map);
    swapMount.innerHTML = renderValiditySwapTableHtml(filtered, groupCols, ratioSpec);
    initResizableTables(swapMount);
  }
  const preHitMount = $("rvPreHitTableMount");
  if (preHitMount && preHitRows?.length) {
    const filtered = filterValidityResultRows(preHitRows, groupCols, map);
    preHitMount.innerHTML = renderValidityPreHitTableHtml(filtered, groupCols, waterfallOrder);
    initResizableTables(preHitMount);
    const tbody = $("rvPreHitTableBody");
    if (tbody) {
      tbody.dataset.rvSortBound = "";
      initRvPreHitDnD();
    }
  }
  const postWfMount = $("rvPostWaterfallRiskMount");
  if (postWfMount && result.postWaterfallRisk) {
    let html = "";
    if (isPartialRvGroupValueFilter(result.rows, groupCols, map)) {
      html += `<p class="config-muted rv-export-post-wf-note" style="font-size:.78rem;margin:0 0 .35rem;color:#92400e">导出报告无法按分组值重算表4（缺少原始贷后行）；以下为导出时快照。请回到主应用调整筛选后重新导出。</p>`;
      showExportStaticNotice();
    }
    html += renderValidityPostWaterfallRiskHtml(
      postWaterfallRisk, waterfallOrder, hardRules, customRules
    );
    postWfMount.innerHTML = html;
    initResizableTables(postWfMount);
  }
}
function bootExportReport() {
  if (!isExportMode()) return;
  setExportCapabilitiesContext();
  const snapEl = document.getElementById("rv-export-snapshot");
  if (!snapEl) {
    markExportBootFailed("缺少导出快照");
    showExportStaticNotice();
    return;
  }
  try {
    const snap = JSON.parse(snapEl.textContent);
    S.lastAnalysis = snap.lastAnalysis || null;
    S.lastDataAnalysis = snap.lastDataAnalysis || null;
    S.lastValidityAnalysis = snap.lastValidityAnalysis || null;
    S.lastAttributionAnalysis = snap.lastAttributionAnalysis || null;
    S.lastDailyReview = snap.lastDailyReview || null;
    if (S.lastDailyReview) {
      RV.domain.dailyReview?.hydrateDailyReviewSeries?.(S.lastDailyReview);
    }

    if (S.lastAnalysis?.postRisk) {
      applyPostTrendValueFilter(snap.postState?.trendValueFilter);
      refreshPostTrendTable();
    }
    if (S.lastAnalysis?.hitMetrics && $("tab-pre")) {
      applyPreStrategyValueFilter(snap.preState?.valueFilter);
      if (snap.preState?.valueFilter) void RV.ui.report.pre.refreshPreStrategyView();
    }
    if (S.lastAnalysis?.summary) {
      applyPostRuleReviewTrendValueFilter(
        snap.postState?.ruleReviewTrendValueFilter ?? snap.summaryState?.trendValueFilter
      );
      refreshPostRuleReviewTrendTable();
    }
    if (S.lastDataAnalysis?.eda) {
      updateEdaResults();
      restoreDistChartSelection(snap.daState?.distSelected);
      restoreGroupFilterSelection(snap.daState?.groupFilterVars);
    }
    if (S.lastDataAnalysis?.bin) {
      updateBinResults();
      restoreBinDisplayFilters(snap.daState);
    }
    if (S.lastValidityAnalysis) {
      renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec, {
        rebuildGroupFilter: false,
        savedGroupValueFilter: snap.validityState?.groupValueFilter,
        refreshPreHit: false,
        refreshSwap: false,
        refreshRiskEst: false,
        refreshPostWaterfallRisk: false,
      });
      exportRefreshValidityFilteredViews();
    }
    if (S.lastDailyReview && $("tab-daily-review") && RV.ui.report.dailyReview) {
      const drState = snap.dailyReviewState || {
        config: S.lastDailyReview.config,
        hasResult: true,
        grain: "week",
      };
      drState.hasResult = true;
      void RV.ui.report.dailyReview.restoreDailyReviewUiState(drState);
      RV.ui.report.dailyReview.ensureDailyReviewEventsBound?.();
    }
    const root = $("report-output");
    if (root) {
      initResizableTables(root);
      applyExportReadOnlyModel(root);
    }
    bindReportInteractionEvents();
    window.__RV_EXPORT_BOOT__ = {
      ok: true,
      ts: Date.now(),
      interactionBound: $("report-output")?.dataset.rvInteractionBound === "1",
      hasEda: !!S.lastDataAnalysis?.eda,
      hasBin: !!S.lastDataAnalysis?.bin,
      hasValidity: !!S.lastValidityAnalysis,
      hasDailyReview: !!S.lastDailyReview,
      exportTabs: snap.exportTabs || null,
    };
    markExportBootOk();
  } catch (err) {
    console.error("导出报告初始化失败", err);
    window.__RV_EXPORT_BOOT__ = { ok: false, error: String(err.message || err), ts: Date.now() };
    markExportBootFailed(err.message || String(err));
  }
}
function bindReportInteractionEvents() {
  const root = $("report-output");
  if (!root || root.dataset.rvInteractionBound === "1") return;
  root.dataset.rvInteractionBound = "1";

  root.addEventListener("change", (e) => {
    if (isExportMode() && !isExportInteractiveTarget(e.target)) return;
    if (e.target.id === "daBadMode") {
      refreshDaBadLabelUI();
      invalidateDataAnalysisCache();
    }
    if (e.target.id === "daBadCol" || e.target.id === "daBadThreshold") {
      refreshDaBadLabelUI();
      invalidateDataAnalysisCache();
    }
    if (e.target.id === "daIvBins") {
      const inp = $("daIvBins");
      if (inp) inp.value = String(Math.max(3, Math.min(20, parseInt(inp.value, 10) || 5)));
      if (S.lastDataAnalysis?.eda) RV.ui.report.analysis.markDaResultsStale?.();
    }
    if (e.target.id === "postGroupSelectedOnly") refreshSampleGroupColSearch("post");
    if (e.target.id === "preGroupSelectedOnly") refreshSampleGroupColSearch("pre");
    if (e.target.id === "rvGroupSelectedOnly") refreshRvGroupColSearch();
    if (e.target.closest("#postGroupOrder")) {
      if (e.target.closest(".group-order-up") || e.target.closest(".group-order-down")) {
        schedulePostRiskRecompute();
      }
    }
    if (e.target.closest("#preGroupOrder")) {
      if (e.target.closest(".group-order-up") || e.target.closest(".group-order-down")) {
        schedulePreGroupDimRecompute();
      }
    }
    if (e.target.id === "rvGroupSearch") {
      refreshRvGroupColSearch();
    }
    if (
      e.target.closest("#rvRiskPostPrimaryFilter")
      || e.target.closest("#rvRiskPostPrimaryFilterEditorBody")
      || e.target.closest("#rvRiskPostFilterRules")
      || e.target.closest("#rvRiskPostFilterEditorBody")
    ) {
      RV.ui.report.validity.markRiskEstSampleIndependent?.();
      RV.ui.report.validity.scheduleRefreshRiskEstView?.();
    }
    if (e.target.id === "rvRiskEstVar" || e.target.id === "rvRiskEstBins" || e.target.id === "rvRiskEstMultiplier") {
      RV.ui.report.validity.refreshValidityConfigPanelSummaries?.();
      RV.ui.report.validity.scheduleRefreshRiskEstView?.();
    }
  });

  root.addEventListener("input", (e) => {
    if (isExportMode() && !isExportInteractiveTarget(e.target)) return;
    if (e.target.id === "rvGroupSearch") {
      refreshRvGroupColSearch();
    }
    if (e.target.id === "postGroupSearch") refreshSampleGroupColSearch("post");
    if (e.target.id === "preGroupSearch") refreshSampleGroupColSearch("pre");
    if (e.target.id === "rvRiskEstBins" || e.target.id === "rvRiskEstMultiplier") {
      RV.ui.report.validity.scheduleRefreshRiskEstView?.();
    }
    if (e.target.id === "daBadThreshold") {
      refreshDaBadLabelUI();
      invalidateDataAnalysisCache();
    }
  });

  root.addEventListener("click", (e) => {
    if (isExportMode() && !isExportInteractiveTarget(e.target)) return;
    if (e.target.id === "btnRunEdaAnalysis") void runEdaAnalysis();
    if (e.target.id === "daDistLoadMore") void RV.ui.report.analysis.loadMoreEdaDistCharts?.();
    if (e.target.id === "btnRunBinAnalysis") void runBinAnalysis();
    if (e.target.id === "btnRunCrossBinAnalysis") void runCrossBinAnalysis();
    if (e.target.id === "btnRunRuleMine") void RV.ui.report.analysis.runRuleMineScan?.();
    if (e.target.id === "btnCancelRuleMine") RV.ui.report.analysis.cancelRuleMineScan?.();
    if (e.target.id === "btnScoreBinEdges") void RV.ui.report.analysis.runBinEdgeScore?.();
    if (e.target.id === "daMineUseSuggested") RV.ui.report.analysis.applySuggestedMineVars?.();
    if (e.target.id === "daMineUseEdaSelected") RV.ui.report.analysis.applyEdaSelectedMineVars?.();
    if (e.target.id === "daMineAddSelected") {
      const idxs = [...document.querySelectorAll("#daMineResultTable .da-mine-row-cb:checked")]
        .map((cb) => parseInt(cb.dataset.mineIdx, 10))
        .filter((i) => Number.isFinite(i));
      const rows = (S._daMineCandidates || []).filter((_, i) => idxs.includes(i));
      const res = RV.ui.report.analysis.addMineRowsToCandidates?.(rows) || { added: 0, duplicates: 0 };
      const n = res.added || 0;
      const dup = res.duplicates || 0;
      const softTip = res.mineTarget === "quality" ? "（拒补集·软规则）" : "";
      let msg = n ? `已加入 ${n} 条候选${softTip}` : "未加入任何候选";
      if (dup) msg += `（跳过 ${dup} 条重复）`;
      if (res.failed) {
        const reason = (res.failReasons || []).filter(Boolean)[0];
        msg += reason ? `（失败 ${res.failed}：${reason}）` : `（失败 ${res.failed}）`;
      }
      RV.events?.notify?.(msg, n ? "ok" : "warn");
    }
    if (e.target.id === "daMineAddTop5") {
      const rows = (S._daMineCandidates || []).slice(0, 5);
      const res = RV.ui.report.analysis.addMineRowsToCandidates?.(rows) || { added: 0, duplicates: 0 };
      const n = res.added || 0;
      const dup = res.duplicates || 0;
      const softTip = res.mineTarget === "quality" ? "（拒补集·软规则）" : "";
      const topLabel = res.mineTarget === "quality" ? "拒补集 Top" : "Lift Top";
      let msg = n ? `已加入 ${topLabel} ${n} 条候选${softTip}` : "未加入任何候选";
      if (dup) msg += `（跳过 ${dup} 条重复）`;
      if (res.failed) {
        const reason = (res.failReasons || []).filter(Boolean)[0];
        msg += reason ? `（失败 ${res.failed}：${reason}）` : `（失败 ${res.failed}）`;
      }
      RV.events?.notify?.(msg, n ? "ok" : "warn");
    }
    const mineOne = e.target.closest?.(".da-mine-add-one");
    if (mineOne) {
      const i = parseInt(mineOne.dataset.mineIdx, 10);
      const row = S._daMineCandidates?.[i];
      const res = row ? RV.ui.report.analysis.addMineRowsToCandidates?.([row]) : { added: 0 };
      const n = res?.added || 0;
      const softTip = res?.mineTarget === "quality" ? "（拒补集·软规则）" : "";
      const label = row?.label || "规则";
      let failMsg = "加入失败";
      if (res?.duplicates) failMsg = "候选已存在";
      else if (res?.failReasons?.length) failMsg = `加入失败：${res.failReasons[0]}`;
      RV.events?.notify?.(n ? `已加入候选${softTip}：${label}` : failMsg, n ? "ok" : "warn");
    }
    const suggestChip = e.target.closest?.(".da-mine-suggest-chip");
    if (suggestChip?.dataset.mineCol) {
      const col = suggestChip.dataset.mineCol;
      const selected = new Set(RV.ui.report.analysis.getMineVarSelection?.() || []);
      selected.add(col);
      RV.ui.report.analysis.refreshDaMineVarChecks?.([...selected]);
      RV.events?.notify?.(`已勾选扫描变量：${col}`, "ok");
    }
    const genRule = e.target.closest?.(".da-bin-gen-rule");
    if (genRule?.dataset.var && genRule.dataset.binLabel) {
      RV.ui.report.analysis.generateRuleFromBinRow?.(
        genRule.dataset.var,
        genRule.dataset.binLabel,
        genRule.dataset.stratKey
      );
    }
    if (e.target.id === "daIvBinsDec") {
      RV.ui.report.analysis.stepIvBins?.(-1);
    }
    if (e.target.id === "daIvBinsInc") {
      RV.ui.report.analysis.stepIvBins?.(1);
    }
    if (e.target.id === "daBinCountDec") {
      RV.ui.report.analysis.stepBinCount?.(-1);
    }
    if (e.target.id === "daBinCountInc") {
      RV.ui.report.analysis.stepBinCount?.(1);
    }
    if (e.target.id === "daCrossXBinsDec") {
      RV.ui.report.analysis.stepCrossXBins?.(-1);
    }
    if (e.target.id === "daCrossXBinsInc") {
      RV.ui.report.analysis.stepCrossXBins?.(1);
    }
    if (e.target.id === "daCrossYBinsDec") {
      RV.ui.report.analysis.stepCrossYBins?.(-1);
    }
    if (e.target.id === "daCrossYBinsInc") {
      RV.ui.report.analysis.stepCrossYBins?.(1);
    }
    if (e.target.id === "daMineLiftDec") {
      RV.ui.report.analysis.stepMineLift?.(-0.05);
    }
    if (e.target.id === "daMineLiftInc") {
      RV.ui.report.analysis.stepMineLift?.(0.05);
    }
    if (e.target.id === "daMineTopKDec") {
      RV.ui.report.analysis.stepMineTopK?.(-1);
    }
    if (e.target.id === "daMineTopKInc") {
      RV.ui.report.analysis.stepMineTopK?.(1);
    }
    if (e.target.id === "daMineMinSamplesDec") {
      RV.ui.report.analysis.stepMineMinSamples?.(-5);
    }
    if (e.target.id === "daMineMinSamplesInc") {
      RV.ui.report.analysis.stepMineMinSamples?.(5);
    }
    if (e.target.id === "daMineMaxCutsDec") {
      RV.ui.report.analysis.stepMineMaxCuts?.(-1);
    }
    if (e.target.id === "daMineMaxCutsInc") {
      RV.ui.report.analysis.stepMineMaxCuts?.(1);
    }
    if (e.target.id === "rvRiskEstBinsDec") {
      RV.ui.report.validity.stepRiskEstBins?.(-1);
    }
    if (e.target.id === "rvRiskEstBinsInc") {
      RV.ui.report.validity.stepRiskEstBins?.(1);
    }
    if (e.target.id === "rvRiskEstMultDec") {
      RV.ui.report.validity.stepRiskEstMultiplier?.(-0.1);
    }
    if (e.target.id === "rvRiskEstMultInc") {
      RV.ui.report.validity.stepRiskEstMultiplier?.(0.1);
    }
    if (e.target.classList.contains("eda-result-select-all")) {
      const cols = S.lastDataAnalysis?.eda?.groupCols
        || (S.lastDataAnalysis?.eda?.groupCol ? [S.lastDataAnalysis.eda.groupCol] : []);
      CP().setAllDimPickers(cols, (col) => `edaGroupVal:${col}`, true);
      if (CP().getPickerSpec("edaDisplayVar")) CP().setAll("edaDisplayVar", true);
      RV.ui.report.analysis.refreshGroupMetricsTable?.();
      RV.ui.report.analysis.renderEdaDistCharts?.();
    }
    if (e.target.classList.contains("eda-result-clear-all")) {
      const cols = S.lastDataAnalysis?.eda?.groupCols
        || (S.lastDataAnalysis?.eda?.groupCol ? [S.lastDataAnalysis.eda.groupCol] : []);
      CP().setAllDimPickers(cols, (col) => `edaGroupVal:${col}`, false);
      if (CP().getPickerSpec("edaDisplayVar")) CP().setAll("edaDisplayVar", false);
      RV.ui.report.analysis.refreshGroupMetricsTable?.();
      RV.ui.report.analysis.renderEdaDistCharts?.();
    }
    if (e.target.classList.contains("bin-result-select-all")) {
      const cols = S.lastDataAnalysis?.bin?.stratCols || [];
      CP().setAllDimPickers(cols, (col) => `binStratVal:${col}`, true);
      if (CP().getPickerSpec("binDisplayVar")) CP().setAll("binDisplayVar", true);
      RV.ui.report.analysis.refreshBinTables?.({ recomputeDrills: false });
    }
    if (e.target.classList.contains("bin-result-clear-all")) {
      const cols = S.lastDataAnalysis?.bin?.stratCols || [];
      CP().setAllDimPickers(cols, (col) => `binStratVal:${col}`, false);
      if (CP().getPickerSpec("binDisplayVar")) CP().setAll("binDisplayVar", false);
      RV.ui.report.analysis.refreshBinTables?.({ recomputeDrills: false });
    }
    if (e.target.closest(".da-group-var-select-all")) {
      const host = $("daGroupVarFilterChecks");
      if (host) {
        host.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = true; });
        updateGroupVarFilterMeta();
        syncEdaDisplayVarFilters();
      }
    }
    if (e.target.closest(".da-group-var-clear-all")) {
      const host = $("daGroupVarFilterChecks");
      if (host) {
        host.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
        updateGroupVarFilterMeta();
        syncEdaDisplayVarFilters();
      }
    }
    if (e.target.closest(".da-group-var-toggle")) {
      const panel = $("daGroupVarFilterPanel");
      const btn = e.target.closest(".da-group-var-toggle");
      if (panel && btn) {
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "选择 ▴" : "选择 ▾";
      }
    }
    if (e.target.classList.contains("post-trend-select-all")) {
      const cols = S.lastAnalysis?.postRisk?.groupCols || S.lastAnalysis?.postGroupCols || [];
      CP().setAllDimPickers(cols, (col) => `postTrend:${col}`, true);
      refreshPostTrendTable();
    }
    if (e.target.classList.contains("post-trend-clear-all")) {
      const cols = S.lastAnalysis?.postRisk?.groupCols || S.lastAnalysis?.postGroupCols || [];
      CP().setAllDimPickers(cols, (col) => `postTrend:${col}`, false);
      refreshPostTrendTable();
    }
    if (e.target.classList.contains("post-rule-review-select-all")) {
      const cols = S.lastAnalysis?.postRisk?.groupCols || S.lastAnalysis?.postGroupCols || [];
      CP().setAllDimPickers(cols, (col) => `postRuleReviewTrend:${col}`, true);
      refreshPostRuleReviewTrendTable();
    }
    if (e.target.classList.contains("post-rule-review-clear-all")) {
      const cols = S.lastAnalysis?.postRisk?.groupCols || S.lastAnalysis?.postGroupCols || [];
      CP().setAllDimPickers(cols, (col) => `postRuleReviewTrend:${col}`, false);
      refreshPostRuleReviewTrendTable();
    }
    if (e.target.classList.contains("pre-strategy-select-all")) {
      const cols = resolvePreGroupCols();
      CP().setAllDimPickers(cols, (col) => `preStrategy:${col}`, true);
      void refreshPreStrategyView();
    }
    if (e.target.classList.contains("pre-strategy-clear-all")) {
      const cols = resolvePreGroupCols();
      CP().setAllDimPickers(cols, (col) => `preStrategy:${col}`, false);
      void refreshPreStrategyView();
    }
    if (e.target.id === "rvBaselineRefollowSidebar") {
      refollowValidityBaselineFromSidebar();
      return;
    }
    if (e.target.id === "rvExportBaselineRules") {
      exportRulesPackDownload("validityBaseline");
      return;
    }
    if (e.target.id === "rvImportBaselineRules") {
      $("validityBaselineRulesFile")?.click();
      return;
    }
    if (e.target.id === "rvExportCandidateRules") {
      exportRulesPackDownload("validityCandidate");
      return;
    }
    if (e.target.id === "rvImportCandidateRules") {
      $("validityCandidateRulesFile")?.click();
      return;
    }
    if (e.target.classList.contains("rv-validity-select-all")) {
      const cols = S.lastValidityAnalysis?.groupCols || [];
      CP().setAllDimPickers(cols, (col) => `rvGroupValue:${col}`, true);
      if (S.lastValidityAnalysis) renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec);
      return;
    }
    if (e.target.classList.contains("rv-validity-clear-all")) {
      const cols = S.lastValidityAnalysis?.groupCols || [];
      CP().setAllDimPickers(cols, (col) => `rvGroupValue:${col}`, false);
      if (S.lastValidityAnalysis) renderValidityResults(S.lastValidityAnalysis, S.lastValidityAnalysis.ratioSpec);
      return;
    }
    const binDrillCell = e.target.closest(".bin-label-drillable");
    if (binDrillCell?.getAttribute("data-var")) {
      const block = binDrillCell.closest(".da-bin-var-block");
      const subN = block?.querySelector(".da-bin-drill-sub-nbins")?.value;
      applyBinDrilldown(
        binDrillCell.getAttribute("data-var") || "",
        binDrillCell.getAttribute("data-bin-label") || "",
        subN
      );
      return;
    }
    if (e.target.classList.contains("da-bin-drill-apply") || e.target.id === "btnBinDrillApply") {
      const block = e.target.closest(".da-bin-var-block");
      const varName = block?.getAttribute("data-var")
        || S.lastDataAnalysis?.bin?.drilldownLastVar
        || S.lastDataAnalysis?.bin?.drilldown?.var;
      const drill = varName ? S.lastDataAnalysis?.bin?.drilldowns?.[varName] : null;
      const subN = block?.querySelector(".da-bin-drill-sub-nbins")?.value
        || $("daBinDrillSubNBins")?.value;
      if (drill?.parentLabel) applyBinDrilldown(varName, drill.parentLabel, subN);
      return;
    }
    if (e.target.classList.contains("da-bin-drill-clear") || e.target.id === "btnBinDrillClear") {
      const block = e.target.closest(".da-bin-var-block");
      const varName = block?.getAttribute("data-var") || "";
      clearBinDrilldown(varName || undefined);
      return;
    }
    if (e.target.id === "btnRunValidityCheck") void runValidityAnalysis();
    if (e.target.id === "rvRiskAddPostFilter") {
      const q = ($("rvRiskPostFilterSearch")?.value || "").trim().toLowerCase();
      const col = S.headers.find((h) => h.toLowerCase().includes(q)) || "";
      createFilterRule("rvRiskPostFilterRules", "rvRiskPostFilterMeta", "rvRiskPost", col);
      if (col) $("rvRiskPostFilterSearch").value = "";
      RV.ui.report.validity.markRiskEstSampleIndependent?.();
      RV.ui.report.validity.scheduleRefreshRiskEstView?.();
    }
    if (e.target.id === "rvAddCustomRule") addCustomRuleCard({ name: `新建规则 ${S.customRuleSeq + 1}`, openEditor: true });
    if (e.target.classList.contains("expr-del-cond")) {
      const cond = e.target.closest(".expr-cond");
      const group = cond?.closest(".expr-group");
      cond?.remove();
      if (group && !group.querySelector(":scope > .expr-children").children.length) {
        group.querySelector(":scope > .expr-children").appendChild(createExprCondEl());
      }
      return;
    }
    if (e.target.classList.contains("expr-add-cond")) {
      const group = e.target.closest(".expr-group");
      const rootExpr = findExprRootFromClickTarget(e.target);
      if (group && rootExpr && countExprLeaves(rootExpr) < C.MAX_EXPR_LEAVES) {
        group.querySelector(":scope > .expr-children")?.appendChild(createExprCondEl());
      }
      return;
    }
    if (e.target.classList.contains("expr-add-group")) {
      const group = e.target.closest(".expr-group");
      const rootExpr = findExprRootFromClickTarget(e.target);
      const depth = parseInt(group?.dataset.depth, 10) || 0;
      if (group && rootExpr && depth < C.MAX_EXPR_DEPTH - 1 && countExprLeaves(rootExpr) < C.MAX_EXPR_LEAVES) {
        group.querySelector(":scope > .expr-children")?.appendChild(createExprGroupEl(depth + 1));
      }
    }
  });

  RV.ui.collapsedPicker.bindReportEvents(root);
}

  Object.assign(target, {
    downloadReport,
    isExportMode,
    getExportCapabilities,
    isExportInteractiveTarget,
    applyExportReadOnlyModel,
    showExportStaticNotice,
    markExportBootOk,
    markExportBootFailed,
    collectExportSnapshot,
    filterReportBodyByTabs,
    listExportTabChoices,
    isExportTabReady,
    isExportTabStale,
    EXPORT_TAB_OPTIONS,
    exportRefreshValidityFilteredViews,
    bootExportReport,
    bindReportInteractionEvents,
  });
})(window.RV);
