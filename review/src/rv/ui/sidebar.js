(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const esc = RV.infra.esc;
  const parseNum = RV.infra.parseNum;
  const getColumnUniques = RV.data.getColumnUniques;
  const getColumnUniquesAsync = RV.data.getColumnUniquesAsync;
  const getNumericColumnStats = RV.data.getNumericColumnStats;
  const isNumericFilterColumn = RV.data.isNumericFilterColumn;
  const normalizeColName = RV.infra.normalizeColName;
  var ui = RV.ui = RV.ui || {};
  var target = ui.sidebar = ui.sidebar || {};

const getChecked = RV.infra.getChecked;
const formatBinaryRuleLabel = (...args) => RV.domain.rules.formatBinaryRuleLabel(...args);
const normalizeHitWhen = (v) => RV.domain.rules.normalizeHitWhen(v);
const normalizeBinaryRuleList = (list) => RV.domain.rules.normalizeBinaryRuleList(list);
const filterCheckboxGrid = (...args) => RV.ui.report.analysis.filterCheckboxGrid(...args);
const CP = () => RV.ui.collapsedPicker;

const SAMPLE_SCHEME_B_PREFIXES = new Set(["post", "pre", "rvRiskPost", "attr"]);
const TIME_COL_NAME_RE = /月份|日期|时间|month|date/i;
const TIME_VALUE_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const compareDimValue = RV.infra.compareDimValue;

function looksLikeTimeValue(v) {
  return TIME_VALUE_RE.test(String(v ?? "").trim());
}

function isTimeLikeColumn(col) {
  if (!col) return false;
  if (TIME_COL_NAME_RE.test(col)) return true;
  const uniques = getColumnUniques(col);
  if (!uniques.length) return false;
  const sample = uniques.slice(0, Math.min(50, uniques.length));
  const hit = sample.filter(looksLikeTimeValue).length;
  return hit / sample.length >= 0.8;
}

function getSortedTimeUniques(col) {
  return getColumnUniques(col).slice().sort(compareDimValue);
}

function usesSampleFilterSchemeB(prefix) {
  return SAMPLE_SCHEME_B_PREFIXES.has(prefix);
}

function prefixFromFilterContainerId(containerId) {
  if (containerId === "postFilterRules") return "post";
  if (containerId === "preFilterRules") return "pre";
  if (containerId === "rvRiskPostFilterRules") return "rvRiskPost";
  if (containerId === "attrFilterRules") return "attr";
  return null;
}

function scheduleRiskEstRefreshIfNeeded(prefix) {
  if (prefix !== "rvRiskPost") return;
  RV.ui.report.validity?.markRiskEstSampleIndependent?.();
  if (S.lastValidityAnalysis) {
    RV.ui.report.validity?.scheduleRefreshRiskEstView?.();
  }
}

function truncateSampleLabel(text, max) {
  max = max || 24;
  const s = String(text || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatFilterRuleSummary(ruleEl) {
  const col = ruleEl.querySelector(".filter-rule-col")?.value || "";
  if (!col) return "未选列";
  const mode = ruleEl.dataset.mode || "enum";
  if (mode === "time_range") {
    const min = ruleEl.querySelector(".filter-time-min")?.value || "";
    const max = ruleEl.querySelector(".filter-time-max")?.value || "";
    if (min && max) return `${truncateSampleLabel(col, 12)} ${truncateSampleLabel(min, 10)}~${truncateSampleLabel(max, 10)}`;
    if (min) return `${truncateSampleLabel(col, 14)} ≥ ${truncateSampleLabel(min, 12)}`;
    if (max) return `${truncateSampleLabel(col, 14)} ≤ ${truncateSampleLabel(max, 12)}`;
    return `${truncateSampleLabel(col, 14)} · 未设区间`;
  }
  if (mode === "numeric" || mode === "range") {
    const includeMissing = !!ruleEl.querySelector(".filter-num-include-missing")?.checked;
    const missTxt = includeMissing ? "（含缺失）" : "";
    const op = ruleEl.querySelector(".filter-num-op")?.value || "gte";
    const v1 = ruleEl.querySelector(".filter-num-val")?.value;
    const v2 = ruleEl.querySelector(".filter-num-val2")?.value;
    const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" }[op] || op;
    if (op === "between") {
      if (v1 !== "" && v1 != null && v2 !== "" && v2 != null) return `${truncateSampleLabel(col, 14)} ${v1}~${v2}${missTxt}`;
      if (v1 !== "" && v1 != null) return `${truncateSampleLabel(col, 14)} ≥ ${v1}${missTxt}`;
      if (v2 !== "" && v2 != null) return `${truncateSampleLabel(col, 14)} ≤ ${v2}${missTxt}`;
      return `${truncateSampleLabel(col, 14)} · 未设条件${missTxt}`;
    }
    if (v1 !== "" && v1 != null) return `${truncateSampleLabel(col, 14)} ${sym} ${v1}${missTxt}`;
    return `${truncateSampleLabel(col, 14)} · 未设条件${missTxt}`;
  }
  const vals = getFilterRuleEnumValues(ruleEl);
  if (!vals.length) return `${truncateSampleLabel(col, 14)} · 全部`;
  if (vals.length === 1) return `${truncateSampleLabel(col, 12)} = ${truncateSampleLabel(vals[0], 10)}`;
  return `${truncateSampleLabel(col, 14)} · ${vals.length}项`;
}

function formatFilterRuleSummaryTitle(ruleEl) {
  const col = ruleEl.querySelector(".filter-rule-col")?.value || "";
  const mode = ruleEl.dataset.mode || "enum";
  if (mode === "time_range") {
    const min = ruleEl.querySelector(".filter-time-min")?.value || "";
    const max = ruleEl.querySelector(".filter-time-max")?.value || "";
    if (min || max) return `${col}：${min || "…"} ~ ${max || "…"}`;
    return `${col}（未设区间）`;
  }
  if (mode === "numeric" || mode === "range") return formatFilterRuleSummary(ruleEl);
  const vals = getFilterRuleEnumValues(ruleEl);
  if (!vals.length) return `${col}（不选=全部）`;
  return `${col}：${vals.join("、")}`;
}

function formatPrimaryFilterSummary(prefix) {
  const col = $(`${prefix}PrimaryFilterCol`)?.value || "";
  if (!col) return "未选字段";
  const rule = primaryFilterRuleEl(prefix);
  const mode = rule?.dataset.mode || "enum";
  if (mode === "time_range") {
    const min = rule.querySelector(".filter-time-min")?.value || "";
    const max = rule.querySelector(".filter-time-max")?.value || "";
    if (min && max) return `${truncateSampleLabel(col, 12)} ${truncateSampleLabel(min, 10)}~${truncateSampleLabel(max, 10)}`;
    if (min || max) return `${truncateSampleLabel(col, 14)} ${min || "…"}~${max || "…"}`;
    return `${truncateSampleLabel(col, 16)} · 全部`;
  }
  const vals = rule ? getFilterRuleEnumValues(rule) : [];
  if (!vals.length) return `${truncateSampleLabel(col, 16)} · 全部`;
  if (vals.length === 1) return `${truncateSampleLabel(col, 12)} = ${truncateSampleLabel(vals[0], 10)}`;
  return `${truncateSampleLabel(col, 14)} · ${vals.length}项`;
}

function formatPrimaryFilterSummaryTitle(prefix) {
  const col = $(`${prefix}PrimaryFilterCol`)?.value || "";
  const rule = primaryFilterRuleEl(prefix);
  const mode = rule?.dataset.mode || "enum";
  if (mode === "time_range") {
    const min = rule.querySelector(".filter-time-min")?.value || "";
    const max = rule.querySelector(".filter-time-max")?.value || "";
    if (min || max) return `${col}：${min || "…"} ~ ${max || "…"}`;
    return `${col}（不选=全部）`;
  }
  const vals = rule ? getFilterRuleEnumValues(rule) : [];
  if (!vals.length) return `${col}（不选=全部）`;
  return `${col}：${vals.join("、")}`;
}

function makeSampleFilterTag({ label, title, ruleId, isPrimary, prefix, removable }) {
  const tag = document.createElement("span");
  tag.className = "sample-filter-tag" + (isPrimary ? " sample-filter-tag-primary" : "");
  tag.title = title || label;
  tag.dataset.prefix = prefix;
  if (ruleId) tag.dataset.ruleId = ruleId;
  if (isPrimary) tag.dataset.samplePrimary = "1";
  const text = document.createElement("span");
  text.className = "sample-filter-tag-text";
  text.textContent = label;
  tag.appendChild(text);
  if (removable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sample-filter-tag-remove";
    btn.setAttribute("aria-label", "移除");
    btn.textContent = "×";
    tag.appendChild(btn);
  }
  return tag;
}

function renderSamplePrimaryFilterTags(prefix) {
  if (!usesSampleFilterSchemeB(prefix)) return;
  const el = $(`${prefix}PrimaryFilterSelected`);
  if (!el) return;
  el.innerHTML = "";
  const tag = makeSampleFilterTag({
    label: formatPrimaryFilterSummary(prefix),
    title: formatPrimaryFilterSummaryTitle(prefix),
    isPrimary: true,
    prefix,
    removable: false,
  });
  el.appendChild(tag);
}

function renderSampleExtraFilterTags(prefix) {
  if (!usesSampleFilterSchemeB(prefix)) return;
  const el = $(`${prefix}FilterSelected`);
  const pool = $(`${prefix}FilterRules`);
  if (!el || !pool) return;
  const rules = [...pool.querySelectorAll(".filter-rule")];
  el.innerHTML = "";
  if (!rules.length) {
    el.innerHTML = `<p class="sample-filter-selected-empty">无额外筛选 · 点击「+ 筛选」添加</p>`;
    return;
  }
  for (const rule of rules) {
    el.appendChild(makeSampleFilterTag({
      label: formatFilterRuleSummary(rule),
      title: formatFilterRuleSummaryTitle(rule),
      ruleId: rule.dataset.ruleId,
      prefix,
      removable: true,
    }));
  }
}

function notifyDataAnalysisPostSampleDirty() {
  if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
    RV.events.invalidateDataAnalysisCache();
  } else {
    RV.ui?.report?.analysis?.invalidateDataAnalysisCache?.();
  }
}

function closeSampleFilterEditor(prefix) {
  if (!usesSampleFilterSchemeB(prefix)) return;
  const editing = S.sampleFilterEditing;
  if (editing?.prefix !== prefix) return;

  if (editing.isPrimary) {
    const body = $(`${prefix}PrimaryFilterEditorBody`);
    const pool = $(`${prefix}PrimaryFilter`);
    const rule = body?.querySelector(".primary-filter-rule");
    if (rule && pool) pool.appendChild(rule);
    const panel = $(`${prefix}PrimaryFilterEditor`);
    if (panel) panel.hidden = true;
  } else {
    const body = $(`${prefix}FilterEditorBody`);
    const pool = $(`${prefix}FilterRules`);
    const rule = body?.querySelector(".filter-rule");
    if (rule && pool) pool.appendChild(rule);
    const panel = $(`${prefix}FilterEditor`);
    if (panel) panel.hidden = true;
  }
  S.sampleFilterEditing = null;
  renderSamplePrimaryFilterTags(prefix);
  renderSampleExtraFilterTags(prefix);
  scheduleRiskEstRefreshIfNeeded(prefix);
  if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
  if (prefix === "attr") RV.ui.report.attribution?.markAttributionResultsStale?.();
}

function openSampleFilterEditor(prefix, { ruleId, isPrimary } = {}) {
  if (!usesSampleFilterSchemeB(prefix)) return;
  if (S.sampleFilterEditing) closeSampleFilterEditor(S.sampleFilterEditing.prefix);

  if (isPrimary) {
    const pool = $(`${prefix}PrimaryFilter`);
    const body = $(`${prefix}PrimaryFilterEditorBody`);
    const panel = $(`${prefix}PrimaryFilterEditor`);
    const rule = pool?.querySelector(".primary-filter-rule");
    if (!rule || !body || !panel) return;
    body.appendChild(rule);
    panel.hidden = false;
    S.sampleFilterEditing = { prefix, isPrimary: true };
    return;
  }

  const pool = $(`${prefix}FilterRules`);
  const body = $(`${prefix}FilterEditorBody`);
  const panel = $(`${prefix}FilterEditor`);
  const titleEl = $(`${prefix}FilterEditorTitle`);
  if (!pool || !body || !panel) return;
  let rule = ruleId
    ? pool.querySelector(`.filter-rule[data-rule-id="${ruleId}"]`)
    : pool.querySelector(".filter-rule:last-child");
  if (!rule) return;
  if (titleEl) titleEl.textContent = `编辑筛选 · ${formatFilterRuleSummary(rule)}`;
  body.appendChild(rule);
  panel.hidden = false;
  S.sampleFilterEditing = { prefix, isPrimary: false, ruleId: rule.dataset.ruleId };
}

function removeSampleExtraFilterTag(prefix, ruleId) {
  if (!ruleId) return;
  if (S.sampleFilterEditing?.prefix === prefix && S.sampleFilterEditing?.ruleId === ruleId) {
    closeSampleFilterEditor(prefix);
  }
  const pool = $(`${prefix}FilterRules`);
  pool?.querySelector(`.filter-rule[data-rule-id="${ruleId}"]`)?.remove();
  refreshFilterMeta(`${prefix}FilterRules`, `${prefix}FilterMeta`);
  scheduleRiskEstRefreshIfNeeded(prefix);
  if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
}

function onSampleFilterSchemeBClick(e) {
  const doneBtn = e.target.closest?.("[data-sample-editor-done]") || (e.target.getAttribute?.("data-sample-editor-done") ? e.target : null);
  if (doneBtn) {
    closeSampleFilterEditor(doneBtn.dataset.sampleEditorDone || doneBtn.getAttribute("data-sample-editor-done"));
    return;
  }
  const removeBtn = e.target.closest?.(".sample-filter-tag-remove");
  if (removeBtn) {
    const tag = removeBtn.closest?.(".sample-filter-tag");
    if (tag?.dataset.ruleId && tag?.dataset.prefix) {
      removeSampleExtraFilterTag(tag.dataset.prefix, tag.dataset.ruleId);
    }
    return;
  }
  const tag = e.target.closest?.(".sample-filter-tag");
  if (tag?.dataset.prefix) {
    openSampleFilterEditor(tag.dataset.prefix, {
      isPrimary: tag.dataset.samplePrimary === "1",
      ruleId: tag.dataset.ruleId,
    });
  }
}

function bindSampleFilterSchemeBEvents() {
  if (document._rvSampleFilterBound === "1") return;
  document._rvSampleFilterBound = "1";
  for (const panelId of ["panelPostSample", "panelPreSample", "report-output"]) {
    $(panelId)?.addEventListener("click", onSampleFilterSchemeBClick);
  }
}

function groupPickerId(prefix) {
  return `${prefix}Group`;
}

function registerSampleGroupPicker(prefix) {
  const pickerId = groupPickerId(prefix);
  if (CP().getPickerSpec(pickerId)) return;
  CP().registerPicker(pickerId, {
    selectedId: `${prefix}GroupSelected`,
    checksId: `${prefix}GroupCols`,
    metaId: `${prefix}GroupMeta`,
    searchId: `${prefix}GroupSearch`,
    pickerId: `${prefix}GroupPicker`,
    toggleId: `${prefix}GroupPickerToggle`,
    selectedOnlyId: `${prefix}GroupSelectedOnly`,
    recommendedOnlyId: `${prefix}GroupRecommendedOnly`,
    emptyLabel: "未选择分组维度",
    metaUnit: "个维度",
    toggleAdd: "添加维度 ▾",
    toggleCollapse: "收起 ▴",
    popover: true,
    listLayout: true,
    onChange: () => {
      syncSampleGroupOrderList(prefix);
      notifyGroupPrefixChange(prefix);
    },
  });
}

function renderGroupPickerChrome(prefix) {
  registerSampleGroupPicker(prefix);
  const pickerId = groupPickerId(prefix);
  return CP().renderChromeHtml(pickerId, {
    selectedId: `${prefix}GroupSelected`,
    toggleId: `${prefix}GroupPickerToggle`,
    pickerId: `${prefix}GroupPicker`,
    checksId: `${prefix}GroupCols`,
    metaId: `${prefix}GroupMeta`,
    searchId: `${prefix}GroupSearch`,
    selectedOnlyId: `${prefix}GroupSelectedOnly`,
    recommendedOnlyId: `${prefix}GroupRecommendedOnly`,
    showToolbar: true,
    hideSelected: true,
    metaInPanel: true,
    popover: true,
    listLayout: true,
    searchPlaceholder: "搜索分组列名…",
    toggleAdd: "添加维度 ▾",
  });
}

/** @deprecated filters live inside renderGroupPickerChrome panel */
function renderGroupColSearchToolbar() {
  return "";
}

/**
 * Standard group-dimension block (see docs/UI_DESIGN_PRINCIPLES.md §3).
 * Stable: order list (placeholder when empty) + toolbar + popover picker.
 */
function renderGroupConfigBlock(prefix, {
  title = "分组变量",
  omitTitle = false,
  hint = "",
  filterNote = "选维度顺序；表内筛取值",
  highCardHint = "高基数字段趋势表会变宽变慢",
  extraActionsHtml = "",
} = {}) {
  registerSampleGroupPicker(prefix);
  const tipParts = [hint, filterNote, highCardHint].map((s) => RV.infra.plainTipText(s)).filter(Boolean);
  const tip = tipParts.join(" ");
  const titleHtml = omitTitle
    ? ""
    : `<span class="group-config-title rv-heading-with-hint">${esc(title)}${RV.infra.hintBadgeHtml(tip, { aria: title })}</span>`;
  return `<div id="${prefix}GroupConfig" class="group-config-block is-empty" data-group-prefix="${esc(prefix)}">
    ${titleHtml}
    <div class="group-selected-main">
      <ul id="${prefix}GroupOrder" class="group-order-list group-order-list--primary" hidden></ul>
      <p id="${prefix}GroupOrderHint" class="config-muted group-order-empty-hint">未选则看整体 · 点下方添加维度</p>
    </div>
    <div class="group-config-toolbar">
      ${extraActionsHtml || ""}
      <div class="group-config-picker">${renderGroupPickerChrome(prefix)}</div>
    </div>
    <p id="${prefix}GroupHighCardWarn" class="group-highcard-warn" hidden></p>
  </div>`;
}

function buildSampleGroupOrderItemEl(col) {
  const li = document.createElement("li");
  li.dataset.col = col;
  li.draggable = true;
  li.className = "group-order-item";
  li.innerHTML = `
    <span class="group-order-idx" aria-hidden="true"></span>
    <span class="group-order-name" title="${esc(col)}">${esc(col.length > 36 ? col.slice(0, 34) + "…" : col)}</span>
    <span class="group-order-drag" title="拖拽调整顺序" aria-hidden="true">⠿</span>
    <button type="button" class="group-order-remove" title="移除" aria-label="移除 ${esc(col)}">×</button>`;
  return li;
}
function groupColChecksEl(prefix) {
  if (prefix === "global") return $("globalGroupCols");
  return sampleGroupEl(prefix, "Cols");
}
function refreshGroupColSearch(prefix) {
  const pickerId = groupPickerId(prefix);
  if (prefix === "post" || prefix === "pre" || prefix === "rv") {
    if (CP().getPickerSpec(pickerId)) {
      CP().refreshFilterUI(pickerId);
      return;
    }
  }
  const container = groupColChecksEl(prefix);
  const meta = $(`${prefix}GroupMeta`);
  const search = $(`${prefix}GroupSearch`);
  const selectedOnly = $(`${prefix}GroupSelectedOnly`)?.checked;
  filterCheckboxGrid(container, meta, search?.value || "", selectedOnly);
}
function refreshSampleGroupColSearch(prefix) {
  refreshGroupColSearch(prefix);
}
function refreshGlobalGroupColSearch() {
  refreshGroupColSearch("global");
}
function getGlobalGroupCols() {
  const orderEl = $("globalGroupOrder");
  if (!orderEl) return [];
  return [...orderEl.querySelectorAll("li[data-col]")].map((el) => el.dataset.col);
}
function refreshGroupOrderIndexes() {
  const orderEl = $("globalGroupOrder");
  if (!orderEl) return;
  const items = [...orderEl.querySelectorAll("li[data-col]")];
  items.forEach((li, i) => {
    const idxEl = li.querySelector(".group-order-idx");
    if (idxEl) idxEl.textContent = String(i + 1);
    const up = li.querySelector(".group-order-up");
    const down = li.querySelector(".group-order-down");
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === items.length - 1;
  });
  const hint = $("globalGroupOrderHint");
  if (hint) hint.style.display = items.length ? "none" : "";
  orderEl.style.display = items.length ? "" : "none";
}
function syncGlobalGroupOrderList() {
  const checks = $("globalGroupCols");
  const orderEl = $("globalGroupOrder");
  if (!checks || !orderEl) return;

  const checked = new Set(getChecked(checks));
  const current = [...orderEl.querySelectorAll("li[data-col]")].map((el) => el.dataset.col);
  const next = current.filter((c) => checked.has(c));
  for (const c of checked) {
    if (!next.includes(c)) next.push(c);
  }

  orderEl.innerHTML = "";
  for (const col of next) {
    const li = document.createElement("li");
    li.dataset.col = col;
    li.innerHTML = `
      <span class="group-order-idx"></span>
      <span class="group-order-name" title="${esc(col)}">${esc(col.length > 28 ? col.slice(0, 26) + "…" : col)}</span>
      <span class="group-order-btns">
        <button type="button" class="group-order-up" title="上移">↑</button>
        <button type="button" class="group-order-down" title="下移">↓</button>
      </span>`;
    orderEl.appendChild(li);
  }
  refreshGroupOrderIndexes();
}
function moveGroupOrderItem(col, dir) {
  const orderEl = $("globalGroupOrder");
  if (!orderEl) return;
  const items = [...orderEl.querySelectorAll("li[data-col]")];
  const idx = items.findIndex((el) => el.dataset.col === col);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= items.length) return;
  if (dir < 0) orderEl.insertBefore(items[idx], items[idx - 1]);
  else orderEl.insertBefore(items[idx], items[newIdx].nextSibling);
  refreshGroupOrderIndexes();
}
function buildGlobalGroupChecks(cols) {
  const container = $("globalGroupCols");
  if (!container) return;
  container.innerHTML = "";
  for (const col of cols) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = col;
    if (col === "申请月份") cb.checked = true;
    lab.appendChild(cb);
    lab.title = col;
    lab.appendChild(document.createTextNode(col.length > 36 ? col.slice(0, 34) + "…" : col));
    container.appendChild(lab);
  }
  refreshGlobalGroupColSearch();
}
function initGlobalGroupPanel(cols) {
  buildGlobalGroupChecks(cols);
  syncGlobalGroupOrderList();

  const checks = $("globalGroupCols");
  const orderEl = $("globalGroupOrder");
  if (checks && !checks.dataset.bound) {
    checks.dataset.bound = "1";
    checks.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        syncGlobalGroupOrderList();
        refreshGlobalGroupColSearch();
      }
    });
  }
  if (orderEl && !orderEl.dataset.bound) {
    orderEl.dataset.bound = "1";
    orderEl.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-col]");
      if (!li) return;
      if (e.target.closest(".group-order-up")) moveGroupOrderItem(li.dataset.col, -1);
      if (e.target.closest(".group-order-down")) moveGroupOrderItem(li.dataset.col, 1);
    });
  }
}
function sampleGroupEl(prefix, part) {
  return $(`${prefix}Group${part}`);
}
function getSampleGroupCols(prefix) {
  const orderEl = sampleGroupEl(prefix, "Order");
  if (!orderEl) return [];
  return [...orderEl.querySelectorAll("li[data-col]")].map((el) => el.dataset.col);
}
function refreshSampleGroupOrderIndexes(prefix) {
  const orderEl = sampleGroupEl(prefix, "Order");
  if (!orderEl) return;
  const items = [...orderEl.querySelectorAll("li[data-col]")];
  items.forEach((li, i) => {
    const idxEl = li.querySelector(".group-order-idx");
    if (idxEl) idxEl.textContent = String(i + 1);
  });
  const has = items.length > 0;
  orderEl.hidden = !has;
  orderEl.style.display = has ? "" : "none";
  const hint = sampleGroupEl(prefix, "OrderHint");
  if (hint) {
    hint.hidden = has;
    hint.style.display = has ? "none" : "";
  }
  const block = $(`${prefix}GroupConfig`);
  if (block) {
    block.classList.toggle("is-empty", !has);
    block.classList.toggle("has-selection", has);
  }
}
function syncSampleGroupOrderList(prefix) {
  const checks = sampleGroupEl(prefix, "Cols");
  const orderEl = sampleGroupEl(prefix, "Order");
  if (!checks || !orderEl) return;

  const checked = new Set(getChecked(checks));
  const current = [...orderEl.querySelectorAll("li[data-col]")].map((el) => el.dataset.col);
  const next = current.filter((c) => checked.has(c));
  for (const c of checked) {
    if (!next.includes(c)) next.push(c);
  }

  orderEl.innerHTML = "";
  for (const col of next) {
    orderEl.appendChild(buildSampleGroupOrderItemEl(col));
  }
  refreshSampleGroupOrderIndexes(prefix);
  updateGroupHighCardWarn(prefix);
}

function updateGroupHighCardWarn(prefix) {
  const warn = $(`${prefix}GroupHighCardWarn`);
  if (!warn) return;
  const pickerId = groupPickerId(prefix);
  const spec = CP().getPickerSpec(pickerId);
  const meta = spec?.valueMetaByValue || {};
  const cols = getSampleGroupCols(prefix);
  const hot = cols.filter((c) => meta[c]?.highCardinality);
  if (!hot.length) {
    warn.hidden = true;
    warn.textContent = "";
    return;
  }
  warn.hidden = false;
  warn.textContent = `已选高基数字段：${hot.join("、")}。分段可能很多，趋势表会变宽/变慢。`;
}

function removeSampleGroupDimension(prefix, col) {
  const pickerId = groupPickerId(prefix);
  if (CP().getPickerSpec(pickerId)) {
    CP().removeTag(pickerId, col);
    return;
  }
  const checks = sampleGroupEl(prefix, "Cols");
  checks?.querySelectorAll(`input[type=checkbox][value="${CSS.escape(col)}"]`).forEach((cb) => {
    cb.checked = false;
  });
  syncSampleGroupOrderList(prefix);
  notifyGroupPrefixChange(prefix);
}

function notifyGroupPrefixChange(prefix) {
  if (prefix === "pre") RV.ui?.report?.pre?.schedulePreGroupDimRecompute?.();
  else if (prefix === "post") RV.ui?.report?.post?.schedulePostRiskRecompute?.();
}

function bindSampleGroupOrderDnD(prefix, orderEl) {
  if (!orderEl || orderEl.dataset.dndBound === "1") return;
  orderEl.dataset.dndBound = "1";
  let dragCol = null;
  orderEl.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-col]");
    if (!li || e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    dragCol = li.dataset.col;
    li.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragCol);
  });
  orderEl.addEventListener("dragend", (e) => {
    e.target.closest("li")?.classList.remove("is-dragging");
    dragCol = null;
  });
  orderEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest("li[data-col]");
    if (!over || !dragCol || over.dataset.col === dragCol) return;
    const items = [...orderEl.querySelectorAll("li[data-col]")];
    const from = items.find((el) => el.dataset.col === dragCol);
    if (!from) return;
    const rect = over.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    orderEl.insertBefore(from, before ? over : over.nextSibling);
    refreshSampleGroupOrderIndexes(prefix);
  });
  orderEl.addEventListener("drop", (e) => {
    e.preventDefault();
    notifyGroupPrefixChange(prefix);
  });
}
function moveSampleGroupOrderItem(prefix, col, dir) {
  const orderEl = sampleGroupEl(prefix, "Order");
  if (!orderEl) return;
  const items = [...orderEl.querySelectorAll("li[data-col]")];
  const idx = items.findIndex((el) => el.dataset.col === col);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= items.length) return;
  if (dir < 0) orderEl.insertBefore(items[idx], items[idx - 1]);
  else orderEl.insertBefore(items[idx], items[newIdx].nextSibling);
  refreshSampleGroupOrderIndexes(prefix);
}
function normalizeGroupCandidates(colsOrCandidates) {
  if (Array.isArray(colsOrCandidates)) {
    return { all: colsOrCandidates, recommended: colsOrCandidates, metaByCol: {} };
  }
  const all = colsOrCandidates?.all || [];
  const recommended = colsOrCandidates?.recommended?.length ? colsOrCandidates.recommended : all;
  return { all, recommended, metaByCol: colsOrCandidates?.metaByCol || {} };
}
function buildSampleGroupChecks(prefix, colsOrCandidates) {
  registerSampleGroupPicker(prefix);
  const pickerId = groupPickerId(prefix);
  if (!sampleGroupEl(prefix, "Cols")) return;
  const candidates = normalizeGroupCandidates(colsOrCandidates);
  CP().initPicker(pickerId, candidates.all, {
    idPrefix: `${prefix}grp`,
    defaultChecked: false,
    selected: [],
    recommendedValues: candidates.recommended,
    valueMetaByValue: candidates.metaByCol,
    defaultRecommendedOnly: true,
    listLayout: true,
  });
  refreshSampleGroupColSearch(prefix);
}
function initSampleGroupPanel(prefix, colsOrCandidates) {
  buildSampleGroupChecks(prefix, colsOrCandidates);
  syncSampleGroupOrderList(prefix);

  const checks = sampleGroupEl(prefix, "Cols");
  const orderEl = sampleGroupEl(prefix, "Order");
  const boundKey = `bound_${prefix}`;
  if (checks && !checks.dataset[boundKey]) {
    checks.dataset[boundKey] = "1";
    if (!CP().getPickerSpec(groupPickerId(prefix))) {
      checks.addEventListener("change", (e) => {
        if (e.target.type !== "checkbox") return;
        refreshSampleGroupColSearch(prefix);
        syncSampleGroupOrderList(prefix);
        notifyGroupPrefixChange(prefix);
      });
    }
  }
  if (orderEl && !orderEl.dataset[boundKey]) {
    orderEl.dataset[boundKey] = "1";
    orderEl.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-col]");
      if (!li) return;
      if (e.target.closest(".group-order-remove")) {
        removeSampleGroupDimension(prefix, li.dataset.col);
      }
    });
    bindSampleGroupOrderDnD(prefix, orderEl);
  }
}
function applySampleGroupDimensions(prefix, groupDimensions, warnings) {
  if (!groupDimensions) return;
  const label = prefix === "post" ? "贷后" : prefix === "pre" ? "贷前" : "有效性";
  const pickerId = groupPickerId(prefix);
  const spec = CP().getPickerSpec(pickerId);
  if (!spec) return;

  const colsToCheck = groupDimensions.columns?.length
    ? groupDimensions.columns
    : (groupDimensions.order || []);

  const available = new Set(spec.lazyValues || []);
  const validChecked = [];
  for (const col of colsToCheck) {
    if (available.has(col)) validChecked.push(col);
    else warnings.push(`${label}分组维度「${col}」不存在，已跳过`);
  }

  CP().applySelection(pickerId, validChecked);
  syncSampleGroupOrderList(prefix);

  const targetOrder = (groupDimensions.order?.length ? groupDimensions.order : validChecked)
    .filter((c) => validChecked.includes(c));
  for (const c of validChecked) {
    if (!targetOrder.includes(c)) targetOrder.push(c);
  }

  for (let t = 0; t < targetOrder.length; t++) {
    const want = targetOrder[t];
    for (let attempt = 0; attempt < 50; attempt++) {
      const items = [...sampleGroupEl(prefix, "Order").querySelectorAll("li[data-col]")];
      const idx = items.findIndex((el) => el.dataset.col === want);
      if (idx < 0 || idx === t) break;
      moveSampleGroupOrderItem(prefix, want, idx > t ? -1 : 1);
    }
  }
  refreshSampleGroupColSearch(prefix);
}
function updateNumericFilterUI(ruleEl) {
  const op = ruleEl.querySelector(".filter-num-op")?.value || "gte";
  const isBetween = op === "between";
  const sep = ruleEl.querySelector(".filter-num-between-sep");
  const v2 = ruleEl.querySelector(".filter-num-val2");
  const v1 = ruleEl.querySelector(".filter-num-val");
  if (sep) sep.style.display = isBetween ? "inline" : "none";
  if (v2) v2.style.display = isBetween ? "" : "none";
  if (v1) v1.placeholder = isBetween ? "下限" : "数值";
}
function updateNumericFilterMeta(ruleEl, col) {
  const nmeta = ruleEl.querySelector(".filter-rule-numeric-meta");
  if (!nmeta) return;
  const st = getNumericColumnStats(col);
  const includeMissing = !!ruleEl.querySelector(".filter-num-include-missing")?.checked;
  const scope = includeMissing ? "缺失值：包含" : "缺失值：排除";
  nmeta.textContent = `${st ? `抽样范围约 ${st.min} ~ ${st.max}` : "暂无有效数值"}；${scope}`;
}

function setFilterRuleModeUI(ruleEl, mode) {
  ruleEl.dataset.mode = mode;
  const enumWrap = ruleEl.querySelector(".filter-rule-enum-wrap");
  const numericWrap = ruleEl.querySelector(".filter-rule-numeric-wrap");
  const timeWrap = ruleEl.querySelector(".filter-rule-time-wrap");
  if (enumWrap) enumWrap.style.display = mode === "enum" ? "block" : "none";
  if (numericWrap) numericWrap.style.display = mode === "numeric" ? "block" : "none";
  if (timeWrap) timeWrap.style.display = mode === "time_range" ? "block" : "none";
}

function fillTimeRangeSelects(ruleEl, col, preferred) {
  const minSel = ruleEl.querySelector(".filter-time-min");
  const maxSel = ruleEl.querySelector(".filter-time-max");
  if (!minSel || !maxSel) return;
  const vals = getSortedTimeUniques(col);
  const prevMin = preferred?.min != null ? String(preferred.min) : minSel.value;
  const prevMax = preferred?.max != null ? String(preferred.max) : maxSel.value;
  const fill = (sel, emptyLabel, keep) => {
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyLabel;
    sel.appendChild(empty);
    for (const v of vals) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    }
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
    else sel.value = "";
  };
  fill(minSel, "（起）", prevMin);
  fill(maxSel, "（止）", prevMax);
}

function getTimeRangeFromRule(ruleEl) {
  const min = ruleEl.querySelector(".filter-time-min")?.value || "";
  const max = ruleEl.querySelector(".filter-time-max")?.value || "";
  if (!min && !max) return null;
  return { min: min || null, max: max || null };
}

function applyRecentTimeRange(ruleEl, col, n) {
  const vals = getSortedTimeUniques(col);
  if (!vals.length) return;
  const take = Math.max(1, Math.min(n, vals.length));
  const max = vals[vals.length - 1];
  const min = vals[vals.length - take];
  fillTimeRangeSelects(ruleEl, col, { min, max });
  ruleEl._refreshMeta?.();
}

function defaultFilterModeForColumn(col) {
  if (isNumericFilterColumn(col) && !isTimeLikeColumn(col)) return "numeric";
  if (isTimeLikeColumn(col)) return "time_range";
  return "enum";
}
function getFilterRuleEnumValues(ruleEl) {
  const grid = ruleEl.querySelector(".filter-rule-values");
  return grid ? getChecked(grid) : [];
}
function ensureFilterRuleEnumCheckbox(grid, value) {
  const existing = [...grid.querySelectorAll("input[type=checkbox]")].find((cb) => cb.value === value);
  if (existing) {
    existing.checked = true;
    return existing;
  }
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.value = value;
  cb.checked = true;
  grid.appendChild(cb);
  return cb;
}
function hideFilterValueDropdown(ruleEl) {
  const dropdown = ruleEl.querySelector(".filter-value-dropdown");
  if (dropdown) dropdown.style.display = "none";
}
function clearFilterRuleEnumValues(ruleEl) {
  const grid = ruleEl.querySelector(".filter-rule-values");
  if (grid) grid.innerHTML = "";
  const tags = ruleEl.querySelector(".filter-rule-tags");
  if (tags) tags.innerHTML = "";
  const search = ruleEl.querySelector(".filter-rule-values-search");
  if (search) search.value = "";
  hideFilterValueDropdown(ruleEl);
}
function renderFilterRuleTags(ruleEl) {
  const tagsEl = ruleEl.querySelector(".filter-rule-tags");
  if (!tagsEl) return;
  const values = getFilterRuleEnumValues(ruleEl);
  tagsEl.innerHTML = "";
  for (const v of values) {
    const tag = document.createElement("span");
    tag.className = "filter-tag";
    tag.title = v;
    const text = document.createElement("span");
    text.className = "filter-tag-text";
    text.textContent = v.length > 32 ? v.slice(0, 30) + "…" : v;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-tag-remove";
    btn.setAttribute("aria-label", "移除");
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFilterRuleEnumValue(ruleEl, v);
    });
    tag.appendChild(text);
    tag.appendChild(btn);
    tagsEl.appendChild(tag);
  }
  const meta = ruleEl.querySelector(".filter-rule-values-meta");
  if (meta) meta.textContent = values.length ? `已选 ${values.length} 项` : "未选择取值";
}
function renderFilterValueDropdown(ruleEl, col, query, show) {
  const dropdown = ruleEl.querySelector(".filter-value-dropdown");
  if (!dropdown) return;
  if (!show) {
    dropdown.style.display = "none";
    return;
  }
  const selected = new Set(getFilterRuleEnumValues(ruleEl));
  const all = getColumnUniques(col);
  const q = String(query || "").trim().toLowerCase();
  let list = all.filter((v) => !selected.has(v));
  if (q) list = list.filter((v) => v.toLowerCase().includes(q));
  dropdown.innerHTML = "";
  dropdown.style.display = "block";
  const meta = ruleEl.querySelector(".filter-rule-values-meta");
  if (all.length > C.MAX_FILTER_VALUE_RENDER && !q) {
    const hint = document.createElement("div");
    hint.className = "filter-value-option filter-value-hint";
    hint.textContent = `共 ${all.length} 项，请搜索`;
    dropdown.appendChild(hint);
    if (meta && !selected.size) meta.textContent = `共 ${all.length} 项，请搜索后添加`;
    return;
  }
  if (!list.length) {
    const hint = document.createElement("div");
    hint.className = "filter-value-option filter-value-hint";
    hint.textContent = q ? "无匹配项" : selected.size && selected.size === all.length ? "已全部选中" : "无可添加项";
    dropdown.appendChild(hint);
    if (meta && q) meta.textContent = `搜索匹配 0 项`;
    return;
  }
  let slice = list;
  if (list.length > C.MAX_FILTER_VALUE_RENDER) {
    slice = list.slice(0, C.MAX_FILTER_VALUE_RENDER);
    if (meta) meta.textContent = q ? `搜索匹配 ${list.length} 项，展示前 ${C.MAX_FILTER_VALUE_RENDER} 项` : `共 ${all.length} 项`;
  } else if (meta && selected.size) {
    meta.textContent = q ? `已选 ${selected.size} 项，搜索匹配 ${list.length} 项` : `已选 ${selected.size} 项`;
  }
  for (const v of slice) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "filter-value-option";
    opt.textContent = v.length > 40 ? v.slice(0, 38) + "…" : v;
    opt.title = v;
    opt.dataset.value = v;
    opt.addEventListener("mousedown", (e) => e.preventDefault());
    opt.addEventListener("click", () => {
      addFilterRuleEnumValue(ruleEl, v);
      const search = ruleEl.querySelector(".filter-rule-values-search");
      if (search) search.value = "";
      renderFilterValueDropdown(ruleEl, col, "", true);
    });
    dropdown.appendChild(opt);
  }
}
function addFilterRuleEnumValue(ruleEl, value) {
  if (!value) return;
  const grid = ruleEl.querySelector(".filter-rule-values");
  if (!grid) return;
  ensureFilterRuleEnumCheckbox(grid, value);
  renderFilterRuleTags(ruleEl);
  const col = ruleEl.querySelector(".filter-rule-col")?.value;
  const search = ruleEl.querySelector(".filter-rule-values-search");
  renderFilterValueDropdown(ruleEl, col, search?.value || "", true);
  ruleEl._refreshMeta?.();
}
function removeFilterRuleEnumValue(ruleEl, value) {
  const grid = ruleEl.querySelector(".filter-rule-values");
  if (!grid) return;
  const cb = [...grid.querySelectorAll("input[type=checkbox]")].find((c) => c.value === value);
  if (cb) cb.remove();
  renderFilterRuleTags(ruleEl);
  const col = ruleEl.querySelector(".filter-rule-col")?.value;
  const search = ruleEl.querySelector(".filter-rule-values-search");
  const dropdown = ruleEl.querySelector(".filter-value-dropdown");
  const show = dropdown && dropdown.style.display !== "none";
  if (col) renderFilterValueDropdown(ruleEl, col, search?.value || "", show);
  ruleEl._refreshMeta?.();
}
function setFilterRuleEnumValues(ruleEl, values, col) {
  const grid = ruleEl.querySelector(".filter-rule-values");
  if (!grid) return [];
  grid.innerHTML = "";
  const unavailable = [];
  const available = col ? new Set(getColumnUniques(col)) : new Set();
  for (const v of values || []) {
    ensureFilterRuleEnumCheckbox(grid, v);
    if (col && available.size && !available.has(v)) unavailable.push(v);
  }
  renderFilterRuleTags(ruleEl);
  hideFilterValueDropdown(ruleEl);
  return unavailable;
}
function bindFilterRuleComboEvents(rule, containerId, metaId, colSel) {
  const refreshMeta = () => refreshFilterMeta(containerId, metaId);
  rule._refreshMeta = refreshMeta;
  const search = rule.querySelector(".filter-rule-values-search");
  if (!search) return;
  search.addEventListener("focus", () => {
    renderFilterValueDropdown(rule, colSel.value, search.value, true);
  });
  search.addEventListener("input", () => {
    renderFilterValueDropdown(rule, colSel.value, search.value, true);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = rule.querySelector(".filter-value-dropdown .filter-value-option:not(.filter-value-hint)");
    const val = first?.dataset?.value;
    if (val) {
      addFilterRuleEnumValue(rule, val);
      search.value = "";
      renderFilterValueDropdown(rule, colSel.value, "", true);
    }
  });
  search.addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && rule.contains(active)) return;
      hideFilterValueDropdown(rule);
    }, 150);
  });
  if (!document._rvFilterDocClick) {
    document._rvFilterDocClick = true;
    document.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-rule").forEach((r) => {
        if (!r.contains(e.target)) hideFilterValueDropdown(r);
      });
    });
  }
}
async function renderFilterRuleValues(ruleEl, col, searchQuery) {
  const meta = ruleEl.querySelector(".filter-rule-values-meta");
  const enumWrap = ruleEl.querySelector(".filter-rule-enum-wrap");
  const numericWrap = ruleEl.querySelector(".filter-rule-numeric-wrap");
  const timeWrap = ruleEl.querySelector(".filter-rule-time-wrap");
  if (!meta && !timeWrap) return;

  if (!getColumnUniques(col).length && S.rawRows.length) {
    if (meta) meta.textContent = "正在统计取值…";
    await getColumnUniquesAsync(col, (done, total) => {
      if (meta) meta.textContent = `统计… ${done.toLocaleString()} / ${total.toLocaleString()}`;
    });
  }
  const all = getColumnUniques(col);
  const isNum = isNumericFilterColumn(col);
  const isTime = isTimeLikeColumn(col);
  const manyUniques = isNum && all.length > C.MAX_ENUM;
  let mode = ruleEl.dataset.mode || "";
  if (!mode || (mode === "enum" && isTime && ruleEl.dataset.userPickedMode !== "1")) {
    mode = defaultFilterModeForColumn(col);
  }
  if (mode === "numeric" && !isNum) mode = isTime ? "time_range" : "enum";
  if (mode === "time_range" && !isTime) mode = isNum ? "numeric" : "enum";
  if (preferNumericForce(isNum, manyUniques, mode)) mode = "numeric";

  if (mode === "numeric" && numericWrap) {
    setFilterRuleModeUI(ruleEl, "numeric");
    updateNumericFilterUI(ruleEl);
    updateNumericFilterMeta(ruleEl, col);
    return;
  }

  if (mode === "time_range" && timeWrap) {
    setFilterRuleModeUI(ruleEl, "time_range");
    fillTimeRangeSelects(ruleEl, col);
    const tmeta = ruleEl.querySelector(".filter-time-hint, .rv-hint[data-rv-tip]");
    if (tmeta) {
      const tip = `时间区间含两端（${all.length}值）；与枚举二选一`;
      if (tmeta.classList.contains("rv-hint")) {
        tmeta.setAttribute("data-rv-tip", tip);
        tmeta.setAttribute("aria-label", `说明：${tip}`);
      } else {
        tmeta.textContent = tip;
      }
    }
    return;
  }

  setFilterRuleModeUI(ruleEl, "enum");
  const numBtn = ruleEl.querySelector(".filter-mode-numeric-btn");
  if (numBtn) numBtn.style.display = isNum ? "" : "none";
  const timeBtn = ruleEl.querySelector(".filter-mode-time-btn");
  if (timeBtn) timeBtn.style.display = isTime ? "" : "none";
  if (!meta) return;
  renderFilterRuleTags(ruleEl);
  const search = ruleEl.querySelector(".filter-rule-values-search");
  const q = searchQuery !== undefined ? searchQuery : (search?.value || "");
  if (search && searchQuery !== undefined) search.value = searchQuery;
  const showDropdown = search === document.activeElement;
  renderFilterValueDropdown(ruleEl, col, q, showDropdown);
  if (!getFilterRuleEnumValues(ruleEl).length && meta && !showDropdown) {
    if (all.length > C.MAX_FILTER_VALUE_RENDER) meta.textContent = `共 ${all.length} 项，请搜索后添加`;
    else if (!meta.textContent || meta.textContent.startsWith("统计")) meta.textContent = "未选择取值";
  }
}
function preferNumericForce(isNum, manyUniques, mode) {
  return isNum && manyUniques && mode !== "enum" && mode !== "time_range";
}
function createFilterRule(containerId, metaId, scope, presetCol, options) {
  options = options || {};
  if (S.filterRuleSeq[scope] == null) S.filterRuleSeq[scope] = 0;
  const id = ++S.filterRuleSeq[scope];
  const rule = document.createElement("div");
  rule.className = "filter-rule";
  rule.dataset.ruleId = String(id);
  rule.innerHTML = `
    <div class="filter-rule-head">
      <select class="filter-rule-col"></select>
      <button type="button" class="filter-rule-remove">删除</button>
    </div>
    <div class="filter-rule-time-wrap" style="display:none">
      <div class="filter-time-row">
        <label class="filter-time-label rv-heading-with-hint">起${RV.infra.hintBadgeHtml("时间区间含两端；与枚举二选一")}<select class="filter-time-min"></select></label>
        <span class="filter-time-sep">至</span>
        <label class="filter-time-label">止<select class="filter-time-max"></select></label>
      </div>
      <div class="filter-time-actions">
        <button type="button" class="btn btn-secondary btn-sm filter-time-recent" data-n="3">最近 3 个</button>
        <button type="button" class="btn btn-secondary btn-sm filter-time-recent" data-n="6">最近 6 个</button>
        <button type="button" class="btn btn-secondary btn-sm filter-mode-enum-from-time-btn">枚举点选</button>
      </div>
    </div>
    <div class="filter-rule-enum-wrap">
      <div class="filter-rule-tags"></div>
      <div class="filter-value-combo">
        <input type="search" class="chk-filter-input filter-rule-values-search" placeholder="搜索并添加取值…" autocomplete="off" />
        <div class="filter-value-dropdown" style="display:none"></div>
      </div>
      <p class="chk-filter-meta filter-rule-values-meta"></p>
      <div class="filter-rule-values filter-rule-values-hidden" aria-hidden="true"></div>
      <div class="filter-enum-mode-actions">
        <button type="button" class="btn btn-secondary btn-sm filter-mode-time-btn" style="display:none">时间区间</button>
        <button type="button" class="btn btn-secondary btn-sm filter-mode-numeric-btn" style="display:none">数值条件</button>
      </div>
    </div>
    <div class="filter-rule-numeric-wrap" style="display:none">
      <div class="filter-numeric-row">
        <select class="filter-num-op">
          <option value="gte">≥</option><option value="gt">&gt;</option>
          <option value="lte">≤</option><option value="lt">&lt;</option>
          <option value="eq">=</option><option value="between">区间</option>
        </select>
        <input type="number" class="filter-num-val" step="any" placeholder="数值" />
        <span class="filter-num-between-sep" style="display:none">至</span>
        <input type="number" class="filter-num-val2" step="any" placeholder="上限" style="display:none" />
      </div>
      <label class="chk-filter-meta" style="display:flex;align-items:center;gap:.35rem;margin:.25rem 0 0">
        <input type="checkbox" class="filter-num-include-missing" />
        <span>包含缺失值</span>
      </label>
      <p class="chk-filter-meta filter-rule-numeric-meta"></p>
      <button type="button" class="btn btn-secondary btn-sm filter-mode-enum-btn">枚举取值</button>
    </div>`;
  const colSel = rule.querySelector(".filter-rule-col");
  for (const h of S.headers) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = h;
    o.title = h;
    colSel.appendChild(o);
  }
  if (presetCol && S.headers.includes(presetCol)) colSel.value = presetCol;
  else { const f = S.headers.find((h) => normalizeColName(h)); if (f) colSel.value = f; }

  const refreshMeta = () => refreshFilterMeta(containerId, metaId);
  bindFilterRuleComboEvents(rule, containerId, metaId, colSel);
  colSel.addEventListener("change", () => {
    delete S.columnUniquesCache[colSel.value];
    clearFilterRuleEnumValues(rule);
    delete rule.dataset.userPickedMode;
    rule.dataset.mode = defaultFilterModeForColumn(colSel.value);
    void renderFilterRuleValues(rule, colSel.value, "");
    refreshMeta();
  });
  rule.querySelector(".filter-num-op")?.addEventListener("change", () => {
    updateNumericFilterUI(rule);
    updateNumericFilterMeta(rule, colSel.value);
    refreshMeta();
  });
  rule.querySelectorAll(".filter-num-val, .filter-num-val2").forEach((inp) => inp.addEventListener("input", refreshMeta));
  rule.querySelector(".filter-num-include-missing")?.addEventListener("change", () => {
    updateNumericFilterMeta(rule, colSel.value);
    refreshMeta();
  });
  rule.querySelectorAll(".filter-time-min, .filter-time-max").forEach((sel) => {
    sel.addEventListener("change", refreshMeta);
  });
  rule.querySelectorAll(".filter-time-recent").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-n"), 10) || 3;
      applyRecentTimeRange(rule, colSel.value, n);
      refreshMeta();
    });
  });
  const switchToEnum = () => {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "enum";
    void renderFilterRuleValues(rule, colSel.value, "");
    refreshMeta();
  };
  rule.querySelector(".filter-mode-enum-btn")?.addEventListener("click", switchToEnum);
  rule.querySelector(".filter-mode-enum-from-time-btn")?.addEventListener("click", switchToEnum);
  rule.querySelector(".filter-mode-numeric-btn")?.addEventListener("click", () => {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "numeric";
    void renderFilterRuleValues(rule, colSel.value, "");
    refreshMeta();
  });
  rule.querySelector(".filter-mode-time-btn")?.addEventListener("click", () => {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "time_range";
    void renderFilterRuleValues(rule, colSel.value, "");
    refreshMeta();
  });
  rule.querySelector(".filter-rule-remove").addEventListener("click", () => {
    if (usesSampleFilterSchemeB(scope) && S.sampleFilterEditing?.prefix === scope && S.sampleFilterEditing?.ruleId === rule.dataset.ruleId) {
      closeSampleFilterEditor(scope);
    }
    rule.remove();
    refreshMeta();
  });

  $(containerId).appendChild(rule);
  if (colSel.value) {
    rule.dataset.mode = defaultFilterModeForColumn(colSel.value);
    void renderFilterRuleValues(rule, colSel.value, "");
  }
  refreshMeta();
  if (usesSampleFilterSchemeB(scope) && options.openEditor !== false) {
    openSampleFilterEditor(scope, { ruleId: rule.dataset.ruleId, isPrimary: false });
  }
  return rule;
}
function refreshFilterMeta(containerId, metaId) {
  const meta = $(metaId);
  if (!meta) return;
  const n = $(containerId)?.querySelectorAll(".filter-rule").length || 0;
  const { filterMap, filterRanges } = collectFilterMap(containerId);
  const nCond = Object.keys(filterMap).length + filterRanges.length;
  const includeMissingCount = filterRanges.filter((fr) => !!fr.includeMissing).length;
  const detailId = `${metaId}MissingDetail`;
  let detailEl = $(detailId);
  if (!detailEl && meta.parentElement) {
    detailEl = document.createElement("p");
    detailEl.id = detailId;
    detailEl.className = "chk-filter-meta";
    detailEl.style.display = "none";
    detailEl.style.marginTop = ".2rem";
    meta.parentElement.insertBefore(detailEl, meta.nextSibling);
  }
  if (!n) {
    meta.textContent = "无额外筛选";
    if (detailEl) {
      detailEl.style.display = "none";
      detailEl.textContent = "";
    }
  } else if (includeMissingCount > 0) {
    const byCol = {};
    for (const fr of filterRanges) {
      if (!fr.includeMissing) continue;
      byCol[fr.col] = (byCol[fr.col] || 0) + 1;
    }
    const detailText = Object.entries(byCol)
      .map(([col, cnt]) => `${col}（${cnt}条）`)
      .join("；");
    meta.innerHTML = `已添加 ${n} 条，生效 ${nCond} 条；含缺失 ${includeMissingCount} 条 <button type="button" class="sample-filter-meta-link sample-filter-missing-detail-btn">查看</button>`;
    const btn = meta.querySelector(".sample-filter-missing-detail-btn");
    if (btn && detailEl) {
      btn.addEventListener("click", () => {
        const opening = detailEl.style.display === "none";
        detailEl.style.display = opening ? "" : "none";
        detailEl.textContent = opening ? `含缺失规则明细：${detailText}` : "";
        btn.textContent = opening ? "收起" : "查看";
      });
    }
  } else {
    meta.textContent = `已添加 ${n} 条，生效 ${nCond} 条；含缺失 0 条`;
    if (detailEl) {
      detailEl.style.display = "none";
      detailEl.textContent = "";
    }
  }
  const prefix = prefixFromFilterContainerId(containerId);
  if (prefix) renderSampleExtraFilterTags(prefix);
}

function clearSampleExtraFilters(prefix) {
  const pool = $(`${prefix}FilterRules`);
  if (!pool) return;
  if (S.sampleFilterEditing?.prefix === prefix && !S.sampleFilterEditing?.isPrimary) {
    closeSampleFilterEditor(prefix);
  }
  pool.innerHTML = "";
  refreshFilterMeta(`${prefix}FilterRules`, `${prefix}FilterMeta`);
  scheduleRiskEstRefreshIfNeeded(prefix);
  if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
}

async function copySampleFilters(fromPrefix, toPrefix) {
  const fromPrimary = getPrimaryFilterConfig(fromPrefix);
  if (fromPrimary?.column) {
    await applyPrimaryFilter(toPrefix, fromPrimary, []);
  }
  clearSampleExtraFilters(toPrefix);
  const fromPool = $(`${fromPrefix}FilterRules`);
  if (fromPool) {
    const rules = [...fromPool.querySelectorAll(".filter-rule")];
    for (const srcRule of rules) {
      const col = srcRule.querySelector(".filter-rule-col")?.value;
      if (!col) continue;
      const mode = srcRule.dataset.mode || "enum";
      const newRule = createFilterRule(`${toPrefix}FilterRules`, `${toPrefix}FilterMeta`, toPrefix, col, { openEditor: false });
      if (!newRule) continue;
      if (mode === "numeric") {
        newRule.dataset.mode = "numeric";
        newRule.dataset.userPickedMode = "1";
        newRule.querySelector(".filter-num-op").value = srcRule.querySelector(".filter-num-op")?.value || "gte";
        newRule.querySelector(".filter-num-val").value = srcRule.querySelector(".filter-num-val")?.value || "";
        newRule.querySelector(".filter-num-val2").value = srcRule.querySelector(".filter-num-val2")?.value || "";
        const includeMissing = !!srcRule.querySelector(".filter-num-include-missing")?.checked;
        const includeMissingCb = newRule.querySelector(".filter-num-include-missing");
        if (includeMissingCb) includeMissingCb.checked = includeMissing;
        updateNumericFilterUI(newRule);
        void renderFilterRuleValues(newRule, col, "");
      } else if (mode === "time_range") {
        newRule.dataset.mode = "time_range";
        newRule.dataset.userPickedMode = "1";
        const range = getTimeRangeFromRule(srcRule);
        void renderFilterRuleValues(newRule, col, "").then(() => {
          if (range) fillTimeRangeSelects(newRule, col, range);
        });
      } else {
        const vals = getFilterRuleEnumValues(srcRule);
        newRule.dataset.mode = "enum";
        newRule.dataset.userPickedMode = "1";
        void renderFilterRuleValues(newRule, col, "");
        setFilterRuleEnumValues(newRule, vals, col);
      }
    }
  }
  refreshFilterMeta(`${toPrefix}FilterRules`, `${toPrefix}FilterMeta`);
  if (toPrefix === "post" || toPrefix === "pre") notifyDataAnalysisPostSampleDirty();
}
function primaryFilterRuleEl(prefix) {
  return $(`${prefix}PrimaryFilter`)?.querySelector(".primary-filter-rule")
    || $(`${prefix}PrimaryFilterEditorBody`)?.querySelector(".primary-filter-rule");
}
function createEnumFilterBodyHtml() {
  return createPrimaryFilterBodyHtml();
}
function createPrimaryFilterBodyHtml() {
  return `
    <div class="filter-rule-time-wrap" style="display:none">
      <div class="filter-time-row">
        <label class="filter-time-label rv-heading-with-hint">起${RV.infra.hintBadgeHtml("时间区间含两端；不选=全部")}<select class="filter-time-min"></select></label>
        <span class="filter-time-sep">至</span>
        <label class="filter-time-label">止<select class="filter-time-max"></select></label>
      </div>
      <div class="filter-time-actions">
        <button type="button" class="btn btn-secondary btn-sm filter-time-recent" data-n="3">最近 3 个</button>
        <button type="button" class="btn btn-secondary btn-sm filter-time-recent" data-n="6">最近 6 个</button>
        <button type="button" class="btn btn-secondary btn-sm filter-mode-enum-from-time-btn">枚举点选</button>
      </div>
    </div>
    <div class="filter-rule-enum-wrap">
      <div class="filter-rule-tags"></div>
      <div class="filter-value-combo">
        <input type="search" class="chk-filter-input filter-rule-values-search" placeholder="搜索并添加取值…" autocomplete="off" />
        <div class="filter-value-dropdown" style="display:none"></div>
      </div>
      <div class="filter-rule-values filter-rule-values-hidden" aria-hidden="true"></div>
      <button type="button" class="btn btn-secondary btn-sm filter-mode-time-btn" style="display:none">时间区间</button>
    </div>`;
}
function refreshPrimaryFilterMeta(prefix) {
  const meta = $(`${prefix}PrimaryFilterMeta`);
  if (!meta) return;
  const rule = primaryFilterRuleEl(prefix);
  const mode = rule?.dataset.mode || "enum";
  if (mode === "time_range") {
    const range = getTimeRangeFromRule(rule);
    meta.textContent = range
      ? `区间 ${range.min || "…"} ~ ${range.max || "…"}`
      : "未选择取值（不选=全部）";
  } else {
    const values = rule ? getFilterRuleEnumValues(rule) : [];
    meta.textContent = values.length ? `已选 ${values.length} 项` : "未选择取值（不选=全部）";
  }
  if (usesSampleFilterSchemeB(prefix)) renderSamplePrimaryFilterTags(prefix);
}
function bindPrimaryFilterComboEvents(rule, prefix, colSel) {
  const refreshMeta = () => {
    refreshPrimaryFilterMeta(prefix);
    if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
  };
  rule._refreshMeta = refreshMeta;
  const search = rule.querySelector(".filter-rule-values-search");
  if (!search) return;
  search.addEventListener("focus", () => {
    renderFilterValueDropdown(rule, colSel.value, search.value, true);
  });
  search.addEventListener("input", () => {
    renderFilterValueDropdown(rule, colSel.value, search.value, true);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = rule.querySelector(".filter-value-dropdown .filter-value-option:not(.filter-value-hint)");
    const val = first?.dataset?.value;
    if (val) {
      addFilterRuleEnumValue(rule, val);
      search.value = "";
      renderFilterValueDropdown(rule, colSel.value, "", true);
    }
  });
  search.addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && rule.contains(active)) return;
      hideFilterValueDropdown(rule);
    }, 150);
  });
  if (!document._rvFilterDocClick) {
    document._rvFilterDocClick = true;
    document.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-rule, .primary-filter-rule").forEach((r) => {
        if (!r.contains(e.target)) hideFilterValueDropdown(r);
      });
    });
  }
}
function bindPrimaryFilterTimeEvents(rule, prefix, colSel) {
  const refreshMeta = () => {
    refreshPrimaryFilterMeta(prefix);
    if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
  };
  rule._refreshMeta = refreshMeta;
  rule.querySelectorAll(".filter-time-min, .filter-time-max").forEach((sel) => {
    sel.addEventListener("change", refreshMeta);
  });
  rule.querySelectorAll(".filter-time-recent").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-n"), 10) || 3;
      applyRecentTimeRange(rule, colSel.value, n);
    });
  });
  rule.querySelector(".filter-mode-enum-from-time-btn")?.addEventListener("click", () => {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "enum";
    void renderPrimaryFilterValues(prefix);
  });
  rule.querySelector(".filter-mode-time-btn")?.addEventListener("click", () => {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "time_range";
    clearFilterRuleEnumValues(rule);
    void renderPrimaryFilterValues(prefix);
  });
}
async function renderPrimaryFilterValues(prefix) {
  const col = $(`${prefix}PrimaryFilterCol`)?.value;
  const rule = primaryFilterRuleEl(prefix);
  const meta = $(`${prefix}PrimaryFilterMeta`);
  if (!rule || !col || !meta) return;
  if (!getColumnUniques(col).length && S.rawRows.length) {
    meta.textContent = "正在统计取值…";
    await getColumnUniquesAsync(col, (done, total) => {
      meta.textContent = `统计… ${done.toLocaleString()} / ${total.toLocaleString()}`;
    });
  }
  const all = getColumnUniques(col);
  const isTime = isTimeLikeColumn(col);
  let mode = rule.dataset.mode || "";
  if (!mode || (mode === "enum" && isTime && rule.dataset.userPickedMode !== "1")) {
    mode = defaultFilterModeForColumn(col);
  }
  if (mode === "time_range" && !isTime) mode = "enum";
  if (mode !== "time_range" && mode !== "enum") mode = isTime ? "time_range" : "enum";

  if (mode === "time_range") {
    setFilterRuleModeUI(rule, "time_range");
    fillTimeRangeSelects(rule, col);
    refreshPrimaryFilterMeta(prefix);
    return;
  }

  setFilterRuleModeUI(rule, "enum");
  const timeBtn = rule.querySelector(".filter-mode-time-btn");
  if (timeBtn) timeBtn.style.display = isTime ? "" : "none";
  renderFilterRuleTags(rule);
  const search = rule.querySelector(".filter-rule-values-search");
  const q = search?.value || "";
  const showDropdown = search === document.activeElement;
  renderFilterValueDropdown(rule, col, q, showDropdown);
  const values = getFilterRuleEnumValues(rule);
  if (!values.length && !showDropdown) {
    meta.textContent = all.length > C.MAX_FILTER_VALUE_RENDER
      ? `共 ${all.length} 项，请搜索后添加`
      : "未选择取值（不选=全部）";
  } else if (values.length) {
    meta.textContent = `已选 ${values.length} 项`;
  }
  if (usesSampleFilterSchemeB(prefix)) renderSamplePrimaryFilterTags(prefix);
}
function initPrimaryFilterPanel(prefix, colCandidates, defaultCol) {
  const colSel = $(`${prefix}PrimaryFilterCol`);
  if (!colSel) return;
  fillSelect(colSel, colCandidates);
  if (defaultCol && S.headers.includes(defaultCol)) colSel.value = defaultCol;
  if (usesSampleFilterSchemeB(prefix)) closeSampleFilterEditor(prefix);
  const container = $(`${prefix}PrimaryFilter`);
  if (!container) return;
  container.innerHTML = "";
  const rule = document.createElement("div");
  rule.className = "filter-rule primary-filter-rule";
  rule.dataset.mode = defaultFilterModeForColumn(colSel.value);
  rule.innerHTML = createEnumFilterBodyHtml();
  container.appendChild(rule);
  bindPrimaryFilterComboEvents(rule, prefix, colSel);
  bindPrimaryFilterTimeEvents(rule, prefix, colSel);
  colSel.addEventListener("change", () => {
    delete S.columnUniquesCache[colSel.value];
    clearFilterRuleEnumValues(rule);
    delete rule.dataset.userPickedMode;
    rule.dataset.mode = defaultFilterModeForColumn(colSel.value);
    void renderPrimaryFilterValues(prefix);
    if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
  });
  void renderPrimaryFilterValues(prefix);
  refreshPrimaryFilterMeta(prefix);
}
function getPrimaryFilterConfig(prefix) {
  const col = $(`${prefix}PrimaryFilterCol`)?.value || "";
  const rule = primaryFilterRuleEl(prefix);
  const mode = rule?.dataset.mode || "enum";
  if (mode === "time_range") {
    const range = getTimeRangeFromRule(rule);
    return range ? { column: col, values: [], range } : { column: col, values: [] };
  }
  const values = rule ? getFilterRuleEnumValues(rule) : [];
  return { column: col, values };
}
async function applyPrimaryFilter(prefix, pf, warnings) {
  const label = prefix === "post" ? "贷后" : prefix === "pre" ? "贷前" : prefix === "rvRiskPost" ? "风险预估贷后" : prefix;
  const colSel = $(`${prefix}PrimaryFilterCol`);
  if (!colSel) return;
  if (pf?.column) {
    if (S.headers.includes(pf.column)) colSel.value = pf.column;
    else warnings.push(`${label}筛选字段「${pf.column}」不存在，保留当前设置`);
  }
  const rule = primaryFilterRuleEl(prefix);
  const hasRange = !!(pf?.range && (pf.range.min != null && pf.range.min !== "" || pf.range.max != null && pf.range.max !== ""));
  if (rule && hasRange) {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "time_range";
    await renderPrimaryFilterValues(prefix);
    fillTimeRangeSelects(rule, colSel.value, pf.range);
    refreshPrimaryFilterMeta(prefix);
  } else if (rule && pf?.values?.length) {
    rule.dataset.userPickedMode = "1";
    rule.dataset.mode = "enum";
    await renderPrimaryFilterValues(prefix);
    const unavailable = setFilterRuleEnumValues(rule, pf.values, colSel.value);
    for (const v of unavailable) warnings.push(`${label}筛选取值「${v}」不可用`);
    refreshPrimaryFilterMeta(prefix);
  } else {
    if (rule) {
      delete rule.dataset.userPickedMode;
      rule.dataset.mode = defaultFilterModeForColumn(colSel.value);
    }
    await renderPrimaryFilterValues(prefix);
    refreshPrimaryFilterMeta(prefix);
  }
  if (prefix === "post" || prefix === "pre") notifyDataAnalysisPostSampleDirty();
}
function syncRuleConfigRowStyle(row) {
  return RV.ui.ruleRows.syncRuleConfigRowStyle(row);
}
function addBinaryRuleRow(preset) {
  return RV.ui.ruleRows.addBinaryRuleRow($("ruleConfigRows"), preset, {
    role: "strategy",
    onChange: () => RV.ui.report.validity?.mirrorSidebarToValidityIfFollow?.(),
  });
}
function addNumericRuleRow(preset) {
  return RV.ui.ruleRows.addNumericRuleRow($("ruleConfigRows"), preset, {
    role: "strategy",
    onChange: () => RV.ui.report.validity?.mirrorSidebarToValidityIfFollow?.(),
  });
}
function addCompositeSoftRuleRow(preset) {
  return RV.ui.ruleRows.addCompositeRuleRow($("ruleConfigRows"), preset, {
    role: "strategy",
    onChange: () => RV.ui.report.validity?.mirrorSidebarToValidityIfFollow?.(),
  });
}
function collectRulesFromUI() {
  const { hardRules, softRules } = RV.ui.ruleRows.collectRulesFromHost($("ruleConfigRows"), { role: "strategy" });
  return { hardRules, softRules };
}
function initDefaultRuleConfig() {
  const container = $("ruleConfigRows");
  if (!container) return;
  container.innerHTML = "";
  S.ruleConfigSeq = 0;
  S.numericRuleSeq = 0;
  S.compositeRuleSeq = 0;
  for (const col of ["黑名单拒绝", "逾期拒绝", "模型拒绝"]) {
    if (S.binaryCols.includes(col)) addBinaryRuleRow({ column: col, isHard: true });
  }
}
function applyRuleConfig(hardCols, softRules, warnings) {
  const container = $("ruleConfigRows");
  if (!container) return;
  RV.ui.ruleRows.applyLegacyToHost(container, hardCols, softRules, {
    role: "strategy",
    warnings,
    onChange: () => RV.ui.report.validity?.mirrorSidebarToValidityIfFollow?.(),
  });
  notifyDataAnalysisPostSampleDirty();
}
async function buildTimeValueChecks(containerId, col) {
  const container = $(containerId);
  if (!container || !col) { if (container) container.innerHTML = ""; return; }
  container.innerHTML = "<p class='chk-filter-meta'>加载取值…</p>";
  const vals = await getColumnUniquesAsync(col);
  container.innerHTML = "";
  for (const v of vals) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = v;
    cb.checked = true;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(v));
    container.appendChild(lab);
  }
}
function fillSelect(sel, items, emptyOption) {
  sel.innerHTML = "";
  if (emptyOption) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = emptyOption;
    sel.appendChild(o);
  }
  for (const it of items) {
    const o = document.createElement("option");
    o.value = it;
    o.textContent = it;
    o.title = it;
    sel.appendChild(o);
  }
}
function setImportConfigEnabled(enabled) {
  const btn = $("btnImportConfig");
  const block = $("importConfigBlock");
  const hint = $("importConfigHint");
  if (btn) btn.disabled = !enabled;
  if (block?.classList) {
    if (block.classList.toggle) block.classList.toggle("is-locked", !enabled);
    else if (!enabled) block.classList.add("is-locked");
    else block.classList.remove("is-locked");
  }
  if (hint?.classList) {
    if (hint.classList.toggle) hint.classList.toggle("hidden", !!enabled);
    else if (enabled) hint.classList.add("hidden");
    else hint.classList.remove("hidden");
  }
}
function buildRuleChecks(containerId, cols, prefix) {
  const container = $(containerId);
  container.innerHTML = "";
  for (const col of cols) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = col;
    cb.dataset.ruleType = "binary_col";
    cb.id = `${prefix}_${col}`;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(col));
    container.appendChild(lab);
  }
}
function defaultRatioRows() {
  const defaults = [
    { name: "fpd1_cnt%", num: "fpd1_cnt_fz", den: "fpd1_cnt_fm" },
    { name: "fpd7_cnt%", num: "fpd7_cnt_fz", den: "fpd7_cnt_fm" },
    { name: "dpd_cnt%", num: "dpd_cnt_fz", den: "dpd_cnt_fm" },
  ];
  $("ratioRows").innerHTML = "";
  for (const d of defaults) addRatioRow(d);
}
function addRatioRow(preset) {
  const row = document.createElement("div");
  row.className = "ratio-row";
  row.innerHTML = `
    <div><label>名称</label><input type="text" class="ratio-name" value="${esc(preset?.name || "")}" /></div>
    <div><label>分子列</label><select class="ratio-num"></select></div>
    <div><label>分母列</label><select class="ratio-den"></select></div>
    <button type="button" class="btn btn-secondary btn-sm ratio-remove">删</button>`;
  for (const sel of [row.querySelector(".ratio-num"), row.querySelector(".ratio-den")]) {
    for (const h of S.headers) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      sel.appendChild(o);
    }
  }
  if (preset) {
    if (S.headers.includes(preset.num)) row.querySelector(".ratio-num").value = preset.num;
    if (S.headers.includes(preset.den)) row.querySelector(".ratio-den").value = preset.den;
  }
  row.querySelector(".ratio-remove").addEventListener("click", () => {
    row.remove();
    if (typeof RV.events?.invalidateDataAnalysisCache === "function") {
      RV.events.invalidateDataAnalysisCache();
    } else {
      RV.ui?.report?.analysis?.invalidateDataAnalysisCache?.();
    }
  });
  $("ratioRows").appendChild(row);
}
function collectRatioSpecs() {
  const specs = [];
  const ratioHost = $("ratioRows");
  const rows = ratioHost ? ratioHost.querySelectorAll(".ratio-row") : [];
  rows.forEach((row) => {
    const name = row.querySelector(".ratio-name")?.value?.trim();
    const num = row.querySelector(".ratio-num")?.value;
    const den = row.querySelector(".ratio-den")?.value;
    if (num && den) specs.push({ name: name || `${num}/${den}`, num, den });
  });
  return specs;
}

function setAllBinaryRulesKind(kind) {
  const makeHard = kind === "hard";
  $("ruleConfigRows")?.querySelectorAll(".rule-config-row[data-kind='binary']").forEach((row) => {
    const target = row.querySelector(`input.rule-config-hardsoft[value='${makeHard ? "hard" : "soft"}']`);
    if (target && !target.checked) {
      target.checked = true;
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

function clearAllRuleConfig() {
  const host = $("ruleConfigRows");
  if (!host) return;
  host.innerHTML = "";
  S.ruleConfigSeq = 0;
  S.numericRuleSeq = 0;
  S.compositeRuleSeq = 0;
}

const SAMPLE_FILTER_DOM = {
  post: { filterRules: "postFilterRules", filterMeta: "postFilterMeta", filterScope: "post" },
  pre: { filterRules: "preFilterRules", filterMeta: "preFilterMeta", filterScope: "pre" },
  rvRiskPost: { filterRules: "rvRiskPostFilterRules", filterMeta: "rvRiskPostFilterMeta", filterScope: "rvRiskPost" },
  attr: { filterRules: "attrFilterRules", filterMeta: "attrFilterMeta", filterScope: "attr" },
};

function getSampleFilterDom(prefix) {
  return SAMPLE_FILTER_DOM[prefix] || null;
}

function collectFilterMap(containerId) {
  const filterMap = {};
  const filterRanges = [];
  const container = $(containerId);
  if (!container) return { filterMap, filterRanges };
  container.querySelectorAll(".filter-rule").forEach((rule) => {
    const col = rule.querySelector(".filter-rule-col")?.value;
    if (!col) return;
    const mode = rule.dataset.mode || "enum";
    if (mode === "time_range") {
      const range = getTimeRangeFromRule(rule);
      if (range) {
        filterRanges.push({
          col,
          op: "between",
          min: range.min,
          max: range.max,
          valueType: "string",
        });
      }
      return;
    }
    if (mode === "numeric" || mode === "range") {
      const op = rule.querySelector(".filter-num-op")?.value || "between";
      const includeMissing = !!rule.querySelector(".filter-num-include-missing")?.checked;
      const v1Raw = rule.querySelector(".filter-num-val")?.value;
      const v2Raw = rule.querySelector(".filter-num-val2")?.value;
      const hasV1 = v1Raw !== "" && v1Raw != null;
      const hasV2 = v2Raw !== "" && v2Raw != null;
      if (op === "between") {
        if (hasV1 || hasV2) {
          filterRanges.push({
            col,
            op: "between",
            min: hasV1 ? parseNum(v1Raw) : null,
            max: hasV2 ? parseNum(v2Raw) : null,
            includeMissing,
          });
        }
      } else if (hasV1) {
        const v = parseNum(v1Raw);
        if (v != null) filterRanges.push({ col, op, value: v, includeMissing });
      }
      return;
    }
    const vals = getFilterRuleEnumValues(rule);
    if (vals.length) filterMap[col] = vals;
  });
  return { filterMap, filterRanges };
}

function collectSampleConfigFromDom(prefix) {
  const primaryFilter = getPrimaryFilterConfig(prefix);
  const dom = getSampleFilterDom(prefix);
  const containerId = dom?.filterRules || (prefix === "pre" ? "preFilterRules" : "postFilterRules");
  const { filterMap, filterRanges } = collectFilterMap(containerId);
  return {
    primaryFilter,
    timeCol: primaryFilter.column,
    timeVals: primaryFilter.values,
    filterMap,
    filterRanges,
  };
}

function collectFilterRulesExport(containerId) {
  const filters = [];
  const container = $(containerId);
  if (!container) return filters;
  container.querySelectorAll(".filter-rule").forEach((rule) => {
    const col = rule.querySelector(".filter-rule-col")?.value;
    if (!col) return;
    const mode = rule.dataset.mode || "enum";
    if (mode === "time_range") {
      const range = getTimeRangeFromRule(rule);
      filters.push({
        column: col,
        mode: "time_range",
        min: range?.min ?? null,
        max: range?.max ?? null,
      });
      return;
    }
    if (mode === "numeric" || mode === "range") {
      const op = rule.querySelector(".filter-num-op")?.value || "between";
      const includeMissing = !!rule.querySelector(".filter-num-include-missing")?.checked;
      const v1Raw = rule.querySelector(".filter-num-val")?.value;
      const v2Raw = rule.querySelector(".filter-num-val2")?.value;
      const hasV1 = v1Raw !== "" && v1Raw != null;
      const hasV2 = v2Raw !== "" && v2Raw != null;
      if (op === "between") {
        filters.push({
          column: col,
          mode: "numeric",
          op: "between",
          min: hasV1 ? parseNum(v1Raw) : null,
          max: hasV2 ? parseNum(v2Raw) : null,
          includeMissing,
        });
      } else if (hasV1) {
        filters.push({
          column: col,
          mode: "numeric",
          op,
          value: parseNum(v1Raw),
          includeMissing,
        });
      }
      return;
    }
    filters.push({ column: col, mode: "enum", values: getFilterRuleEnumValues(rule) });
  });
  return filters;
}

function primaryFilterExportShape(pf) {
  const out = { column: pf.column, values: pf.values || [] };
  if (pf.range) out.range = pf.range;
  return out;
}

function collectSampleFilterExport(prefix) {
  const cfg = collectSampleConfigFromDom(prefix);
  const dom = getSampleFilterDom(prefix);
  const containerId = dom?.filterRules || (prefix === "pre" ? "preFilterRules" : "postFilterRules");
  return {
    primaryFilter: primaryFilterExportShape(cfg.primaryFilter),
    filters: collectFilterRulesExport(containerId),
  };
}

function collectSampleConfigExport(prefix) {
  const cfg = collectSampleConfigFromDom(prefix);
  const dom = getSampleFilterDom(prefix);
  const containerId = dom?.filterRules || (prefix === "pre" ? "preFilterRules" : "postFilterRules");
  return {
    primaryFilter: primaryFilterExportShape(cfg.primaryFilter),
    timeCol: cfg.primaryFilter.column,
    timeValues: cfg.primaryFilter.values,
    filters: collectFilterRulesExport(containerId),
    groupDimensions: {
      columns: (() => { const el = sampleGroupEl(prefix, "Cols"); return el ? getChecked(el) : []; })(),
      order: getSampleGroupCols(prefix),
    },
  };
}

  Object.assign(target, { getChecked, getGlobalGroupCols, refreshGroupOrderIndexes, syncGlobalGroupOrderList, moveGroupOrderItem, buildGlobalGroupChecks, initGlobalGroupPanel, renderGroupColSearchToolbar, renderGroupPickerChrome, renderGroupConfigBlock, buildSampleGroupOrderItemEl, registerSampleGroupPicker, groupPickerId, refreshGroupColSearch, refreshSampleGroupColSearch, refreshGlobalGroupColSearch, sampleGroupEl, getSampleGroupCols, refreshSampleGroupOrderIndexes, syncSampleGroupOrderList, moveSampleGroupOrderItem, removeSampleGroupDimension, updateGroupHighCardWarn, buildSampleGroupChecks, initSampleGroupPanel, applySampleGroupDimensions, updateNumericFilterUI, updateNumericFilterMeta, getFilterRuleEnumValues, setFilterRuleEnumValues, addFilterRuleEnumValue, removeFilterRuleEnumValue, clearFilterRuleEnumValues, renderFilterRuleValues, createFilterRule, refreshFilterMeta, clearSampleExtraFilters, copySampleFilters, initPrimaryFilterPanel, getPrimaryFilterConfig, applyPrimaryFilter, refreshPrimaryFilterMeta, renderPrimaryFilterValues, addBinaryRuleRow, initDefaultRuleConfig, applyRuleConfig, setAllBinaryRulesKind, clearAllRuleConfig, setImportConfigEnabled, buildTimeValueChecks, fillSelect, buildRuleChecks, addNumericRuleRow, addCompositeSoftRuleRow, defaultRatioRows, addRatioRow, collectRatioSpecs, collectRulesFromUI, renderSamplePrimaryFilterTags, renderSampleExtraFilterTags, openSampleFilterEditor, closeSampleFilterEditor, bindSampleFilterSchemeBEvents, usesSampleFilterSchemeB, getSampleFilterDom, collectFilterMap, collectSampleConfigFromDom, collectFilterRulesExport, collectSampleFilterExport, collectSampleConfigExport, getSampleConfig: collectSampleConfigFromDom });
})(window.RV);
