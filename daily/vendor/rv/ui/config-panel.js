(function (RV) {
"use strict";
  var $ = (id) => document.getElementById(id);
  var ui = RV.ui = RV.ui || {};
  var target = ui.configPanel = ui.configPanel || {};

  /**
   * Shared config-panel collapse protocol (see docs/UI_DESIGN_PRINCIPLES.md §H).
   * Markup:
   *   .da-config-panel#id > .da-panel-header[data-config-panel-toggle=id] + .da-panel-body + (optional results)
   * Summary lives in .da-panel-summary inside the header.
   */

  function setPanelsCollapsed(ids, collapsed) {
    const list = Array.isArray(ids) ? ids : [ids];
    const els = [];
    for (const id of list) {
      const el = typeof id === "string" ? $(id) : id;
      if (!el) continue;
      el.classList.add("is-collapse-snap");
      if (collapsed) el.classList.add("is-collapsed");
      else el.classList.remove("is-collapsed");
      els.push(el);
    }
    if (!els.length) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.forEach((el) => el.classList.remove("is-collapse-snap"));
      });
    });
  }

  function expandPanels(ids) {
    setPanelsCollapsed(ids, false);
  }

  function collapsePanels(ids) {
    setPanelsCollapsed(ids, true);
  }

  function togglePanel(panelId) {
    const panel = $(panelId);
    if (!panel) return;
    const next = !panel.classList.contains("is-collapsed");
    if (next) panel.classList.add("is-collapsed");
    else panel.classList.remove("is-collapsed");
    return next;
  }

  function isCollapsed(panelId) {
    return !!$(panelId)?.classList.contains("is-collapsed");
  }

  /**
   * Bind click/keyboard on [data-config-panel-toggle].
   * @param {ParentNode} root
   * @param {{ onToggle?: (panelId: string, collapsed: boolean) => void }} [opts]
   */
  function bindPanelToggle(root, opts) {
    opts = opts || {};
    if (!root || root.dataset.configPanelToggleBound === "1") return;
    root.dataset.configPanelToggleBound = "1";

    root.addEventListener("click", (e) => {
      const toggle = e.target.closest?.("[data-config-panel-toggle]");
      if (!toggle) return;
      if (e.target.closest("button, a, input, select, textarea, label, .rv-hint")) return;
      const panelId = toggle.getAttribute("data-config-panel-toggle");
      if (!panelId) return;
      const collapsed = togglePanel(panelId);
      if (typeof opts.onToggle === "function") opts.onToggle(panelId, collapsed);
    });

    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const toggle = e.target.closest?.("[data-config-panel-toggle]");
      if (!toggle) return;
      e.preventDefault();
      const panelId = toggle.getAttribute("data-config-panel-toggle");
      if (!panelId) return;
      const collapsed = togglePanel(panelId);
      if (typeof opts.onToggle === "function") opts.onToggle(panelId, collapsed);
    });
  }

  /** Truncate list for one-line summaries. */
  function formatSummaryList(vals, maxItems, maxLen) {
    maxItems = maxItems == null ? 3 : maxItems;
    maxLen = maxLen == null ? 28 : maxLen;
    const list = (vals || []).filter(Boolean).map((v) => {
      const s = String(v);
      return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
    });
    if (!list.length) return "";
    if (list.length <= maxItems) return list.join("、");
    return `${list.slice(0, maxItems).join("、")} 等${list.length}项`;
  }

  function setSummaryText(summaryElOrId, text) {
    const el = typeof summaryElOrId === "string" ? $(summaryElOrId) : summaryElOrId;
    if (el) el.textContent = text || "";
  }

  /**
   * Collapsible pin wrapper for group-config blocks (post/pre).
   * @param {string} panelId
   * @param {string} title
   * @param {string} summaryId
   * @param {string} bodyHtml
   */
  function renderCollapsiblePinHtml(panelId, title, summaryId, bodyHtml) {
    return `<div class="da-config-panel da-config-pin" id="${panelId}">
      <div class="da-panel-header" data-config-panel-toggle="${panelId}" role="button" tabindex="0">
        <span class="da-panel-title-text">${title}</span>
        <span class="da-panel-summary" id="${summaryId}"></span>
        <span class="da-panel-collapse-hint" aria-hidden="true"></span>
      </div>
      <div class="da-panel-body">${bodyHtml}</div>
    </div>`;
  }

  Object.assign(target, {
    setPanelsCollapsed,
    expandPanels,
    collapsePanels,
    togglePanel,
    isCollapsed,
    bindPanelToggle,
    formatSummaryList,
    setSummaryText,
    renderCollapsiblePinHtml,
  });
})(window.RV);
