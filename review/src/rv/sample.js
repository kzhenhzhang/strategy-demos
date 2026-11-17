(function (RV) {
"use strict";
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  const strVal = RV.infra.strVal;
  var sample = RV.sample = RV.sample || {};
  var target = sample;

function inStringRange(s, min, max) {
  if (min != null && min !== "" && s < String(min)) return false;
  if (max != null && max !== "" && s > String(max)) return false;
  return true;
}

function matchPrimaryFilter(r, pf, timeCol, timeVals) {
  if (pf?.column) {
    const s = strVal(rowVal(r, pf.column));
    if (pf.range && (pf.range.min != null && pf.range.min !== "" || pf.range.max != null && pf.range.max !== "")) {
      return inStringRange(s, pf.range.min, pf.range.max);
    }
    if (pf.values?.length) {
      return pf.values.includes(s);
    }
    return true;
  }
  if (timeCol && timeVals.length) {
    return timeVals.includes(strVal(rowVal(r, timeCol)));
  }
  return true;
}

/**
 * Pure sample filter — no DOM. `spec` is collected by UI (sidebar.collectSampleConfigFromDom).
 */
function applyFilters(rows, spec) {
  const filterMap = spec.filterMap || {};
  const filterRanges = spec.filterRanges || [];
  const pf = spec.primaryFilter;
  const timeCol = spec.timeCol;
  const timeVals = spec.timeVals || [];
  return rows.filter((r) => {
    if (!matchPrimaryFilter(r, pf, timeCol, timeVals)) return false;
    for (const [col, vals] of Object.entries(filterMap)) {
      if (!vals.length) continue;
      if (!vals.includes(strVal(rowVal(r, col)))) return false;
    }
    for (const fr of filterRanges) {
      const op = fr.op || "between";
      if (fr.valueType === "string") {
        const s = strVal(rowVal(r, fr.col));
        if (s === "") {
          if (fr.includeMissing) continue;
          return false;
        }
        if (op === "between") {
          if (!inStringRange(s, fr.min, fr.max)) return false;
        } else if (op === "gt" && !(s > String(fr.value))) return false;
        else if (op === "gte" && !(s >= String(fr.value))) return false;
        else if (op === "lt" && !(s < String(fr.value))) return false;
        else if (op === "lte" && !(s <= String(fr.value))) return false;
        else if (op === "eq" && s !== String(fr.value)) return false;
        continue;
      }
      const n = parseNum(rowVal(r, fr.col));
      if (n == null) {
        if (fr.includeMissing) continue;
        return false;
      }
      if (op === "between") {
        if (fr.min != null && n < fr.min) return false;
        if (fr.max != null && n > fr.max) return false;
      } else if (op === "gt" && !(n > fr.value)) return false;
      else if (op === "gte" && !(n >= fr.value)) return false;
      else if (op === "lt" && !(n < fr.value)) return false;
      else if (op === "lte" && !(n <= fr.value)) return false;
      else if (op === "eq" && n !== fr.value) return false;
    }
    return true;
  });
}

function periodMask(rows, periodCol, baseVals, cmpVals) {
  const baseSet = new Set(baseVals);
  const cmpSet = new Set(cmpVals);
  const isBase = [];
  const isCmp = [];
  for (const r of rows) {
    const v = strVal(rowVal(r, periodCol));
    isBase.push(baseSet.has(v));
    isCmp.push(cmpSet.has(v));
  }
  return { isBase, isCmp };
}

/** @deprecated Prefer RV.ui.sidebar.collectSampleConfigFromDom — kept for call-site compatibility. */
function getSampleConfig(prefix) {
  return RV.ui.sidebar.collectSampleConfigFromDom(prefix);
}
function getSampleFilterDom(prefix) {
  return RV.ui.sidebar.getSampleFilterDom(prefix);
}
function collectFilterMap(containerId) {
  return RV.ui.sidebar.collectFilterMap(containerId);
}
function collectFilterRulesExport(containerId) {
  return RV.ui.sidebar.collectFilterRulesExport(containerId);
}
function collectSampleFilterExport(prefix) {
  return RV.ui.sidebar.collectSampleFilterExport(prefix);
}
function collectSampleConfigExport(prefix) {
  return RV.ui.sidebar.collectSampleConfigExport(prefix);
}

  Object.assign(target, {
    applyFilters, periodMask, inStringRange,
    getSampleConfig, getSampleFilterDom, collectFilterMap,
    collectFilterRulesExport, collectSampleFilterExport, collectSampleConfigExport,
  });
})(window.RV);
