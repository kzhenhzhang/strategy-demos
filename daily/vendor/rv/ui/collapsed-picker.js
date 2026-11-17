(function (RV) {
"use strict";
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const esc = RV.infra.esc;
  var ui = RV.ui = RV.ui || {};
  var target = ui.collapsedPicker = ui.collapsedPicker || {};
  const deferMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (fn) => Promise.resolve().then(fn);

  const registry = {};

  function safeDomId(pickerId) {
    return String(pickerId).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function getChecksEl(spec) {
    if (spec.checksId) return $(spec.checksId);
    if (spec.checksSelector) return document.querySelector(spec.checksSelector);
    return null;
  }

  function registerPicker(pickerId, spec) {
    registry[pickerId] = { pickerId, ...spec };
  }

  function getPickerSpec(pickerId) {
    return registry[pickerId] || null;
  }

  function findPickerIdByChecksEl(el) {
    if (!el) return null;
    if (el.dataset?.pickerId) return el.dataset.pickerId;
    if (el.id) {
      for (const id of Object.keys(registry)) {
        if (registry[id].checksId === el.id) return id;
      }
    }
    return null;
  }

  function pickerIdFromToggleId(toggleId) {
    if (!toggleId) return null;
    if (toggleId.endsWith("PickerToggle")) return toggleId.slice(0, -"PickerToggle".length);
    return null;
  }

  function pickerIdFromEl(el) {
    if (!el) return null;
    if (el.dataset?.pickerId) return el.dataset.pickerId;
    const block = el.closest("[data-picker-id]");
    if (block?.dataset?.pickerId) return block.dataset.pickerId;
    const tid = el.id || el.closest("[id]")?.id;
    return pickerIdFromToggleId(tid);
  }

  function checksArePopulated(spec) {
    const checksEl = getChecksEl(spec);
    return !!(checksEl && checksEl.querySelector("input[type=checkbox]"));
  }

  function readCheckedFromDom(spec) {
    const checksEl = getChecksEl(spec);
    return readCheckedFromChecksEl(checksEl);
  }

  function readCheckedFromChecksEl(checksEl) {
    if (!checksEl) return [];
    return [...checksEl.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
  }

  function resolvePickerIdFromEvent(target) {
    if (!target) return null;
    if (target.dataset?.pickerId) return target.dataset.pickerId;
    const grid = target.closest(".rv-collapsed-picker-grid");
    if (grid?.dataset?.pickerId) return grid.dataset.pickerId;
    const panel = target.closest(".rv-collapsed-picker-panel");
    if (panel?.dataset?.pickerId) return panel.dataset.pickerId;
    const dim = target.closest(".rv-collapsed-picker-dim");
    if (dim?.dataset?.pickerId) return dim.dataset.pickerId;
    return pickerIdFromEl(target);
  }

  function getPickerSelection(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return [];
    return spec.pendingSelection ? [...spec.pendingSelection] : [];
  }

  function syncPendingFromDom(pickerId, checksEl) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const el = checksEl || getChecksEl(spec);
    if (!el?.querySelector("input[type=checkbox]")) return;
    spec.pendingSelection = readCheckedFromChecksEl(el);
  }

  function resetPickerDom(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    spec.checksPopulated = false;
    const checksEl = getChecksEl(spec);
    if (checksEl) {
      checksEl.innerHTML = "";
      checksEl.dataset.pickerId = pickerId;
    }
  }

  function getSelectedOrder(pickerId) {
    return getPickerSelection(pickerId);
  }

  function matchesColumnPrefix(value, spec) {
    if (!spec || spec.showAllColumns) return true;
    const prefixes = spec.defaultColumnPrefixes;
    if (!prefixes?.length) return true;
    const v = String(value || "");
    return prefixes.some((p) => v.startsWith(p));
  }

  function getEffectivePickerValues(spec) {
    const all = spec?.lazyValues || [];
    if (!spec || spec.showAllColumns || !spec.defaultColumnPrefixes?.length) return all;
    return all.filter((v) => matchesColumnPrefix(v, spec));
  }

  function applyLabelMeta(pickerId, checksEl) {
    const spec = getPickerSpec(pickerId);
    const metaMap = spec?.valueMetaByValue || null;
    if (!checksEl || !metaMap) return;
    checksEl.querySelectorAll("label").forEach((lab) => {
      const cb = lab.querySelector("input[type=checkbox]");
      if (!cb) return;
      const meta = metaMap[cb.value];
      if (!meta || !meta.highCardinality) return;
      if (lab.querySelector(".rv-picker-col-badge")) return;
      const badge = document.createElement("span");
      badge.className = "rv-picker-col-badge";
      badge.textContent = "高基数";
      badge.title = "该字段取值很多，分组后可能产生过多分段";
      lab.appendChild(badge);
    });
  }

  function renderTags(pickerId, forcedOrder) {
    const spec = getPickerSpec(pickerId);
    if (!spec?.selectedId) return;
    const selectedEl = $(spec.selectedId);
    if (!selectedEl) return;

    let order = forcedOrder !== undefined
      ? [...forcedOrder]
      : getPickerSelection(pickerId);

    const emptyLabel = spec.emptyLabel || "未选择";
    if (!order.length) {
      selectedEl.innerHTML = `<p class="config-muted rv-collapsed-picker-empty">${esc(emptyLabel)}</p>`;
      return;
    }

    const tagClass = spec.tagClass || "";
    selectedEl.innerHTML = "";
    const maxVisible = spec.maxVisibleTags;
    const expanded = !!spec.tagsExpanded;
    const showAllTags = maxVisible == null || maxVisible <= 0 || order.length <= maxVisible || expanded;
    const visibleOrder = showAllTags ? order : order.slice(0, maxVisible);
    const hiddenCount = showAllTags ? 0 : order.length - maxVisible;

    for (const val of visibleOrder) {
      const tag = document.createElement("span");
      tag.className = `filter-tag rv-collapsed-picker-tag ${tagClass}`.trim();
      tag.dataset.value = val;
      tag.dataset.pickerId = pickerId;
      tag.title = val;
      tag.innerHTML = `<span class="filter-tag-text">${esc(val)}</span><button type="button" class="filter-tag-remove rv-collapsed-picker-tag-remove" aria-label="移除">×</button>`;
      selectedEl.appendChild(tag);
    }
    if (hiddenCount > 0) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "btn btn-secondary btn-sm rv-collapsed-picker-tag-more";
      more.dataset.pickerId = pickerId;
      more.textContent = `+${hiddenCount} 更多`;
      more.title = order.slice(maxVisible).join("\n");
      selectedEl.appendChild(more);
    } else if (maxVisible != null && maxVisible > 0 && expanded && order.length > maxVisible) {
      const less = document.createElement("button");
      less.type = "button";
      less.className = "btn btn-secondary btn-sm rv-collapsed-picker-tag-less";
      less.dataset.pickerId = pickerId;
      less.textContent = "收起";
      selectedEl.appendChild(less);
    }
  }

  function refreshFilterUI(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const checksEl = getChecksEl(spec);
    const metaEl = spec.metaId ? $(spec.metaId) : null;
    const unit = spec.metaUnit || "项";

    if (!checksArePopulated(spec)) {
      const total = spec.lazyValues?.length || 0;
      const selected = spec.pendingSelection?.length || 0;
      const recommended = spec.recommendedSet?.size || 0;
      if (metaEl) {
        metaEl.textContent = total
          ? `共 ${total} ${unit} · 推荐 ${recommended} · 已选 ${selected}`
          : `共 0 ${unit}`;
      }
      return;
    }

    const q = (spec.searchId ? $(spec.searchId)?.value : "") || "";
    const query = String(q).trim().toLowerCase();
    const selectedOnly = spec.selectedOnlyId ? !!$(spec.selectedOnlyId)?.checked : false;
    const recommendedOnly = spec.recommendedOnlyId ? !!$(spec.recommendedOnlyId)?.checked : false;
    const recommendedSet = spec.recommendedSet || null;
    let visible = 0;
    let totalChecked = 0;

    checksEl.querySelectorAll("label").forEach((lab) => {
      const cb = lab.querySelector("input[type=checkbox]");
      if (cb?.checked) totalChecked++;
      const text = (cb?.value || lab.textContent || "").toLowerCase();
      const passRecommended = !recommendedOnly || !recommendedSet || !recommendedSet.size || recommendedSet.has(cb?.value || "");
      const show = (!query || text.includes(query))
        && matchesColumnPrefix(cb?.value || lab.textContent || "", spec)
        && passRecommended
        && (!selectedOnly || !!cb?.checked);
      lab.style.display = show ? "" : "none";
      if (show) visible++;
    });

    const total = checksEl.querySelectorAll("input[type=checkbox]").length || 0;
    const recommended = recommendedSet?.size || 0;
    if (metaEl) {
      metaEl.textContent = total
        ? `共 ${total} ${unit} · 推荐 ${recommended} · 显示 ${visible} · 已选 ${totalChecked}`
        : `共 0 ${unit}`;
    }
  }

  function syncUI(pickerId, forcedOrder) {
    renderTags(pickerId, forcedOrder);
    refreshFilterUI(pickerId);
  }

  function fireChange(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (spec?.merging || spec?.suppressingChange) return;
    if (spec?.onChange) spec.onChange(pickerId);
  }

  function syncAndNotify(pickerId, forcedOrder, checksEl) {
    const spec = getPickerSpec(pickerId);
    if (!spec || spec.suppressingChange || spec.merging) return;
    if (forcedOrder !== undefined) {
      spec.pendingSelection = [...forcedOrder];
    } else {
      syncPendingFromDom(pickerId, checksEl);
    }
    syncUI(pickerId, spec.pendingSelection);
    fireChange(pickerId);
  }

  function ensureChecksPopulated(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec || !spec.lazyValues?.length) return;
    const checksEl = getChecksEl(spec);
    if (!checksEl) return;
    if (spec.checksPopulated && !checksEl.querySelector("input[type=checkbox]")) {
      spec.checksPopulated = false;
    }
    if (spec.checksPopulated) return;
    const opts = {
      ...(spec.populateOptions || {}),
      listLayout: spec.listLayout === true || spec.populateOptions?.listLayout === true,
      pickerId,
    };
    populateChecks(checksEl, spec.lazyValues, opts);
    spec.checksPopulated = true;
    applyLabelMeta(pickerId, checksEl);
    const selectedSet = new Set(spec.pendingSelection || []);
    checksEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = selectedSet.has(cb.value);
    });
  }

  function getDimFilterMap(groupCols, pickerIdFn) {
    const map = {};
    for (const col of groupCols || []) {
      const pickerId = pickerIdFn(col);
      map[col] = getPickerSpec(pickerId)
        ? new Set(getPickerSelection(pickerId))
        : new Set();
    }
    return map;
  }

  function collectDimFilterState(groupCols, pickerIdFn) {
    const out = {};
    let any = false;
    for (const col of groupCols || []) {
      const pickerId = pickerIdFn(col);
      if (!getPickerSpec(pickerId)) continue;
      any = true;
      out[col] = getPickerSelection(pickerId);
    }
    return any ? out : null;
  }

  function clearPickerSilent(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    spec.pendingSelection = [];
    const checksEl = getChecksEl(spec);
    if (checksEl) {
      checksEl.innerHTML = "";
      spec.checksPopulated = false;
    }
    syncUI(pickerId, []);
  }

  function applySelection(pickerId, values, options = {}) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    spec.pendingSelection = values || [];
    const prevSuppress = spec.suppressingChange;
    const deferReset = options.notify === false;
    if (deferReset) spec.suppressingChange = true;
    try {
      if (checksArePopulated(spec)) {
        const selectedSet = new Set(spec.pendingSelection);
        getChecksEl(spec)?.querySelectorAll("input[type=checkbox]").forEach((cb) => {
          cb.checked = selectedSet.has(cb.value);
        });
      }
      syncUI(pickerId, spec.pendingSelection);
    } finally {
      if (deferReset) {
        deferMicrotask(() => { spec.suppressingChange = prevSuppress; });
      } else {
        spec.suppressingChange = prevSuppress;
      }
    }
  }

  function populateChecks(checksEl, values, options = {}) {
    const pickerCols = C.RV_BINARY_RULE_PICKER_COLS || 3;
    if (!checksEl) return;
    const listLayout = options.listLayout === true
      || checksEl.classList.contains("rv-collapsed-picker-grid--list");
    checksEl.innerHTML = "";
    const gridExtra = [options.gridClass || "", listLayout ? "rv-collapsed-picker-grid--list" : ""]
      .filter(Boolean).join(" ");
    checksEl.className = `chk-grid rv-collapsed-picker-grid ${gridExtra}`.trim();
    if (checksEl.dataset?.pickerId == null && options.pickerId) {
      checksEl.dataset.pickerId = options.pickerId;
    }
    if (checksEl.style) {
      checksEl.style.gridTemplateColumns = listLayout
        ? "minmax(0, 1fr)"
        : `repeat(${pickerCols}, minmax(0, 1fr))`;
    }

    const defaultChecked = options.defaultChecked === true;
    const idPrefix = options.idPrefix || "cp";
    for (const val of values || []) {
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = val;
      cb.checked = defaultChecked;
      if (options.pickerId) cb.dataset.pickerId = options.pickerId;
      if (options.inputDataset) {
        for (const [k, v] of Object.entries(options.inputDataset)) cb.dataset[k] = v;
      }
      cb.id = `${idPrefix}_${safeDomId(val)}`;
      lab.title = val;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(val));
      checksEl.appendChild(lab);
    }
  }

  function initPicker(pickerId, values, options = {}) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    spec.lazyValues = values || [];
    spec.populateOptions = {
      ...options,
      pickerId,
      defaultChecked: options.defaultChecked === true,
    };
    spec.recommendedSet = new Set(options.recommendedValues || values || []);
    spec.valueMetaByValue = options.valueMetaByValue || null;
    spec.checksPopulated = false;
    spec.pendingSelection = options.selected !== undefined ? [...options.selected] : [];
    const recommendedOnlyEl = spec.recommendedOnlyId ? $(spec.recommendedOnlyId) : null;
    if (recommendedOnlyEl) recommendedOnlyEl.checked = options.defaultRecommendedOnly === true;

    resetPickerDom(pickerId);

    collapsePanel(pickerId);
    syncUI(pickerId, spec.pendingSelection);
  }

  function collapsePanel(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const picker = spec.pickerId ? $(spec.pickerId) : null;
    const toggle = spec.toggleId ? $(spec.toggleId) : null;
    if (picker) picker.hidden = true;
    if (toggle) {
      toggle.textContent = spec.toggleAdd || "添加 ▾";
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  function togglePanel(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const picker = spec.pickerId ? $(spec.pickerId) : null;
    const toggle = spec.toggleId ? $(spec.toggleId) : null;
    if (!picker || !toggle) return;
    const open = picker.hidden;
    if (open) ensureChecksPopulated(pickerId);
    picker.hidden = !open;
    toggle.textContent = open ? (spec.toggleCollapse || "收起 ▴") : (spec.toggleAdd || "添加 ▾");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      refreshFilterUI(pickerId);
      syncUI(pickerId, spec.pendingSelection);
    } else if (spec.onClose) {
      spec.onClose(pickerId);
    }
  }

  function removeTag(pickerId, value) {
    const spec = getPickerSpec(pickerId);
    if (!spec || value == null) return;
    spec.pendingSelection = (spec.pendingSelection || []).filter((v) => v !== value);
    if (checksArePopulated(spec)) {
      const cb = [...(getChecksEl(spec)?.querySelectorAll("input[type=checkbox]") || [])].find((c) => c.value === value);
      if (cb) cb.checked = false;
    }
    syncAndNotify(pickerId, spec.pendingSelection);
  }

  function syncCheckboxDomFromPending(pickerId) {
    const spec = getPickerSpec(pickerId);
    if (!spec || !checksArePopulated(spec)) return;
    const selectedSet = new Set(spec.pendingSelection || []);
    getChecksEl(spec)?.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = selectedSet.has(cb.value);
    });
  }

  function setAll(pickerId, checked, options = {}) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const scope = options.scope || (spec.defaultColumnPrefixes?.length && !spec.showAllColumns ? "filtered" : "all");
    const pool = scope === "filtered" ? getEffectivePickerValues(spec) : (spec.lazyValues || []);
    const poolSet = new Set(pool);
    if (checked) {
      spec.pendingSelection = [...new Set([...(spec.pendingSelection || []), ...pool])];
    } else if (scope === "filtered") {
      spec.pendingSelection = (spec.pendingSelection || []).filter((v) => !poolSet.has(v));
    } else {
      spec.pendingSelection = [];
    }
    ensureChecksPopulated(pickerId);
    syncCheckboxDomFromPending(pickerId);
    if (options.notify === false) {
      syncUI(pickerId, spec.pendingSelection);
    } else {
      syncAndNotify(pickerId, spec.pendingSelection);
    }
  }

  function setAllDimPickers(cols, pickerIdFn, checked) {
    for (const col of cols || []) {
      setAll(pickerIdFn(col), checked, { notify: false });
    }
  }

  function handleCheckboxChange(pickerId, checksEl) {
    const spec = getPickerSpec(pickerId);
    if (spec?.merging || spec?.suppressingChange) return;
    syncAndNotify(pickerId, undefined, checksEl);
  }

  function renderChromeHtml(pickerId, options = {}) {
    const dom = safeDomId(pickerId);
    const selectedId = options.selectedId || `${dom}Selected`;
    const toggleId = options.toggleId || `${dom}PickerToggle`;
    const pickerPanelId = options.pickerId || `${dom}Picker`;
    const showToolbar = options.showToolbar !== false;
    const hideSelected = options.hideSelected === true;
    const metaInPanel = options.metaInPanel === true;
    const popover = options.popover === true;
    const listLayout = options.listLayout === true;
    const selectAllClass = options.selectAllClass || "";
    const clearAllClass = options.clearAllClass || "";
    const selectedOnlyId = options.selectedOnlyId || "";
    const recommendedOnlyId = options.recommendedOnlyId || "";
    const showAllColumnsId = options.showAllColumnsId || "";
    const showAllColumnsLabel = options.showAllColumnsLabel || "显示全部列";
    const searchId = options.searchId || "";
    const checksId = options.checksId || "";
    const metaId = options.metaId || "";
    const metaHtml = metaId ? `<p id="${metaId}" class="chk-filter-meta"></p>` : "";
    const panelClass = [
      "rv-collapsed-picker-panel",
      popover ? "rv-collapsed-picker-panel--popover" : "",
    ].filter(Boolean).join(" ");
    const gridClass = [
      "chk-grid",
      "rv-collapsed-picker-grid",
      listLayout ? "rv-collapsed-picker-grid--list" : "",
    ].filter(Boolean).join(" ");

    let html = "";
    if (metaId && !metaInPanel) html += metaHtml;
    if (!hideSelected) {
      html += `<div id="${selectedId}" class="rv-collapsed-picker-selected" data-picker-id="${esc(pickerId)}"></div>`;
    } else {
      html += `<div id="${selectedId}" class="rv-collapsed-picker-selected" data-picker-id="${esc(pickerId)}" hidden aria-hidden="true"></div>`;
    }
    html += `<div class="rv-collapsed-picker-toolbar">`;
    html += `<button type="button" class="btn btn-secondary btn-sm rv-collapsed-picker-toggle" id="${toggleId}" data-picker-id="${esc(pickerId)}" aria-expanded="false" aria-haspopup="listbox">${esc(options.toggleAdd || "添加 ▾")}</button>`;
    html += `</div>`;
    html += `<div id="${pickerPanelId}" class="${panelClass}" data-picker-id="${esc(pickerId)}" ${popover ? 'role="listbox"' : ""} hidden>`;
    if (metaId && metaInPanel) html += metaHtml;
    if (showToolbar && searchId) {
      html += `<div class="chk-toolbar"><input type="search" id="${searchId}" class="chk-filter-input" placeholder="${esc(options.searchPlaceholder || "搜索…")}" autocomplete="off" data-picker-id="${esc(pickerId)}" /></div>`;
    }
    if (selectAllClass || clearAllClass || selectedOnlyId || showAllColumnsId || recommendedOnlyId) {
      html += `<div class="rv-collapsed-picker-actions">`;
      if (selectAllClass) html += `<button type="button" class="btn btn-secondary btn-sm ${selectAllClass}" data-picker-id="${esc(pickerId)}">全选</button>`;
      if (clearAllClass) html += `<button type="button" class="btn btn-secondary btn-sm ${clearAllClass}" data-picker-id="${esc(pickerId)}">清空</button>`;
      if (showAllColumnsId) {
        html += `<label class="rv-collapsed-picker-selected-only"><input type="checkbox" id="${showAllColumnsId}" data-picker-id="${esc(pickerId)}" data-show-all-columns="1" /> ${esc(showAllColumnsLabel)}</label>`;
      }
      if (recommendedOnlyId) {
        html += `<label class="rv-collapsed-picker-selected-only"><input type="checkbox" id="${recommendedOnlyId}" data-picker-id="${esc(pickerId)}" /> 仅看推荐</label>`;
      }
      if (selectedOnlyId) {
        html += `<label class="rv-collapsed-picker-selected-only"><input type="checkbox" id="${selectedOnlyId}" data-picker-id="${esc(pickerId)}" /> 仅看已选</label>`;
      }
      html += `</div>`;
    }
    if (checksId) {
      html += `<div id="${checksId}" class="${gridClass}" data-picker-id="${esc(pickerId)}"></div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderDimBlockHtml(pickerId, { dimLabel, valuesContainerClass }) {
    const dom = safeDomId(pickerId);
    const selectedId = `${dom}Selected`;
    const toggleId = `${dom}PickerToggle`;
    const pickerPanelId = `${dom}Picker`;
    const checksId = `${dom}Checks`;
    let html = `<div class="rv-collapsed-picker-dim rv-dim-filter-chip" data-picker-id="${esc(pickerId)}">`;
    html += `<span class="summary-trend-filter-label">${esc(dimLabel)}</span>`;
    html += `<span class="summary-trend-filter-sep" aria-hidden="true">:</span>`;
    html += `<div id="${selectedId}" class="rv-collapsed-picker-selected rv-collapsed-picker-dim-selected" data-picker-id="${esc(pickerId)}"></div>`;
    html += `<button type="button" class="btn btn-secondary btn-sm rv-collapsed-picker-toggle" id="${toggleId}" data-picker-id="${esc(pickerId)}" aria-expanded="false" aria-haspopup="listbox">▾</button>`;
    html += `<div id="${pickerPanelId}" class="rv-collapsed-picker-panel rv-collapsed-picker-panel--popover" data-picker-id="${esc(pickerId)}" role="listbox" hidden>`;
    html += `<div class="rv-collapsed-picker-actions">`;
    html += `<button type="button" class="btn btn-secondary btn-sm rv-collapsed-picker-select-all" data-picker-id="${esc(pickerId)}">全选</button>`;
    html += `<button type="button" class="btn btn-secondary btn-sm rv-collapsed-picker-clear-all" data-picker-id="${esc(pickerId)}">清空</button>`;
    html += `</div>`;
    html += `<div id="${checksId}" class="${valuesContainerClass} chk-grid rv-collapsed-picker-grid rv-collapsed-picker-grid--list" data-picker-id="${esc(pickerId)}"></div>`;
    html += `</div></div>`;
    return html;
  }

  function registerDimPicker(pickerId, spec) {
    const dom = safeDomId(pickerId);
    registerPicker(pickerId, {
      emptyLabel: "未选择取值（将隐藏全部行）",
      metaUnit: "个取值",
      toggleAdd: "▾",
      toggleCollapse: "▴",
      popover: true,
      listLayout: true,
      selectedId: `${dom}Selected`,
      pickerId: `${dom}Picker`,
      toggleId: `${dom}PickerToggle`,
      checksId: `${dom}Checks`,
      ...spec,
    });
  }

  function initDimPicker(pickerId, options = {}) {
    const spec = getPickerSpec(pickerId);
    if (!spec) return;
    const values = options.values || [];
    spec.lazyValues = values;
    spec.populateOptions = { pickerId, defaultChecked: false, listLayout: true };
    spec.listLayout = true;
    spec.popover = true;
    spec.checksPopulated = false;
    spec.pendingSelection = options.selected !== undefined
      ? [...options.selected]
      : [...values];

    resetPickerDom(pickerId);

    collapsePanel(pickerId);
    syncUI(pickerId, spec.pendingSelection);
  }

  function initDimPickersFromRoot(rootEl, prefix) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".rv-collapsed-picker-dim[data-picker-id]").forEach((block) => {
      const pickerId = block.dataset.pickerId;
      if (!pickerId || !pickerId.startsWith(prefix)) return;
      if (!getPickerSpec(pickerId)) return;
      initDimPicker(pickerId);
    });
  }

  function bindPopoverOutsideClose() {
    if (typeof document !== "undefined" && document._rvCollapsedPickerPopoverBound === "1") return;
    if (typeof document !== "undefined") document._rvCollapsedPickerPopoverBound = "1";
    const root = typeof document !== "undefined" && typeof document.addEventListener === "function"
      ? document
      : (typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null);
    if (!root) return;
    root.addEventListener("mousedown", (e) => {
      for (const pickerId of Object.keys(registry)) {
        const spec = registry[pickerId];
        if (!spec?.popover) continue;
        const panel = spec.pickerId ? $(spec.pickerId) : null;
        if (!panel || panel.hidden) continue;
        const toggle = spec.toggleId ? $(spec.toggleId) : null;
        if (panel.contains?.(e.target) || toggle?.contains?.(e.target)) continue;
        collapsePanel(pickerId);
      }
    });
  }

  function bindReportEvents(root) {
    if (!root || root.dataset.rvCollapsedPickerBound === "1") return;
    root.dataset.rvCollapsedPickerBound = "1";
    bindPopoverOutsideClose();

    root.addEventListener("change", (e) => {
      if (!e.target.matches("input[type=checkbox]")) return;
      const pickerId = resolvePickerIdFromEvent(e.target);
      if (!pickerId || !getPickerSpec(pickerId)) return;
      const spec = getPickerSpec(pickerId);

      if (e.target.id && spec.selectedOnlyId === e.target.id) {
        if (!checksArePopulated(spec)) ensureChecksPopulated(pickerId);
        refreshFilterUI(pickerId);
        return;
      }
      if (e.target.id && spec.recommendedOnlyId === e.target.id) {
        if (!checksArePopulated(spec)) ensureChecksPopulated(pickerId);
        refreshFilterUI(pickerId);
        return;
      }
      if (e.target.dataset?.showAllColumns === "1") {
        spec.showAllColumns = !!e.target.checked;
        if (!checksArePopulated(spec)) ensureChecksPopulated(pickerId);
        syncCheckboxDomFromPending(pickerId);
        refreshFilterUI(pickerId);
        syncUI(pickerId, spec.pendingSelection);
        return;
      }

      const grid = e.target.closest(".rv-collapsed-picker-grid");
      if (!grid) return;
      handleCheckboxChange(pickerId, grid);
    });

    root.addEventListener("input", (e) => {
      const pickerId = e.target.dataset?.pickerId;
      if (!pickerId || !getPickerSpec(pickerId)) return;
      if (getPickerSpec(pickerId).searchId === e.target.id) {
        if (!checksArePopulated(getPickerSpec(pickerId))) ensureChecksPopulated(pickerId);
        refreshFilterUI(pickerId);
      }
    });

    root.addEventListener("click", (e) => {
      const toggle = e.target.closest(".rv-collapsed-picker-toggle");
      if (toggle?.dataset?.pickerId) {
        togglePanel(toggle.dataset.pickerId);
        return;
      }
      const tagRemove = e.target.closest(".rv-collapsed-picker-tag-remove");
      if (tagRemove) {
        const tag = tagRemove.closest(".filter-tag[data-picker-id]");
        if (tag?.dataset?.pickerId && tag.dataset.value != null) {
          removeTag(tag.dataset.pickerId, tag.dataset.value);
        }
        return;
      }
      const selAll = e.target.closest(".rv-collapsed-picker-select-all");
      if (selAll?.dataset?.pickerId) {
        setAll(selAll.dataset.pickerId, true);
        return;
      }
      const clearAll = e.target.closest(".rv-collapsed-picker-clear-all");
      if (clearAll?.dataset?.pickerId) {
        setAll(clearAll.dataset.pickerId, false, { scope: "all" });
        return;
      }
      const tagMore = e.target.closest(".rv-collapsed-picker-tag-more");
      if (tagMore?.dataset?.pickerId) {
        const moreSpec = getPickerSpec(tagMore.dataset.pickerId);
        if (moreSpec) {
          moreSpec.tagsExpanded = true;
          syncUI(tagMore.dataset.pickerId);
        }
        return;
      }
      const tagLess = e.target.closest(".rv-collapsed-picker-tag-less");
      if (tagLess?.dataset?.pickerId) {
        const lessSpec = getPickerSpec(tagLess.dataset.pickerId);
        if (lessSpec) {
          lessSpec.tagsExpanded = false;
          syncUI(tagLess.dataset.pickerId);
        }
      }
    });
  }

  Object.assign(target, {
    registerPicker,
    getPickerSpec,
    getPickerSelection,
    findPickerIdByChecksEl,
    getSelectedOrder,
    renderTags,
    refreshFilterUI,
    syncUI,
    syncAndNotify,
    applySelection,
    clearPickerSilent,
    populateChecks,
    ensureChecksPopulated,
    resetPickerDom,
    getDimFilterMap,
    collectDimFilterState,
    syncPendingFromDom,
    readCheckedFromChecksEl,
    resolvePickerIdFromEvent,
    initPicker,
    collapsePanel,
    togglePanel,
    removeTag,
    setAll,
    setAllDimPickers,
    handleCheckboxChange,
    renderChromeHtml,
    renderDimBlockHtml,
    registerDimPicker,
    initDimPicker,
    initDimPickersFromRoot,
    bindReportEvents,
    safeDomId,
    pickerIdFromEl,
  });
})(window.RV);
