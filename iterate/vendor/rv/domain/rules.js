(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const getApplyVol = RV.infra.getApplyVol;
  const getPassVol = RV.infra.getPassVol;
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  const safeRate = RV.infra.safeRate;
  var domain = RV.domain = RV.domain || {};
  var target = domain.rules = domain.rules || {};

const HIT_WHEN_ONE = "one";
const HIT_WHEN_ZERO = "zero";

function normalizeHitWhen(hitWhen) {
  return hitWhen === HIT_WHEN_ZERO ? HIT_WHEN_ZERO : HIT_WHEN_ONE;
}

function normalizeBinaryRuleRef(ref) {
  if (ref == null || ref === "") return null;
  if (typeof ref === "string") return { col: ref, hitWhen: HIT_WHEN_ONE };
  if (typeof ref === "object" && ref.col) {
    return { col: String(ref.col), hitWhen: normalizeHitWhen(ref.hitWhen) };
  }
  return null;
}

function normalizeBinaryRuleList(list) {
  return (list || []).map(normalizeBinaryRuleRef).filter(Boolean);
}

function formatBinaryRuleLabel(col, hitWhen, { short = false } = {}) {
  if (!col) return "";
  if (normalizeHitWhen(hitWhen) === HIT_WHEN_ZERO) {
    return short ? `${col} (=0)` : `${col} (=0命中)`;
  }
  return col;
}

function evalBinaryCol(row, col, hitWhen) {
  const v = rowVal(row, col);
  if (v === null || v === undefined || String(v).trim() === "") return false;
  const sv = String(v).trim().toLowerCase();
  const isOne = v === 1 || v === true || sv === "1" || sv === "true";
  const isZero = v === 0 || v === false || sv === "0" || sv === "false";
  return normalizeHitWhen(hitWhen) === HIT_WHEN_ZERO ? isZero : isOne;
}
function evalNumericRule(row, col, op, threshold, includeMissing) {
  const v = parseNum(rowVal(row, col));
  if (v == null) return includeMissing;
  const t = Number(threshold);
  if (!Number.isFinite(t)) return false;
  if (op === "gt") return v > t;
  if (op === "gte") return v >= t;
  if (op === "lt") return v < t;
  if (op === "lte") return v <= t;
  return false;
}
function evalEnumCmp(row, col, op, value, values) {
  const raw = rowVal(row, col);
  const sv = (raw === null || raw === undefined || String(raw).trim() === "")
    ? C.BIN_MISSING_LABEL
    : String(raw).trim();
  if (op === "eq") return sv === String(value ?? "").trim();
  if (op === "neq") return sv !== String(value ?? "").trim();
  if (op === "in") {
    const set = new Set((values || [value]).map((v) => String(v).trim()));
    return set.has(sv);
  }
  return false;
}
function evalRule(row, rule) {
  if (rule.type === "binary_col") return evalBinaryCol(row, rule.column, rule.hitWhen);
  if (rule.type === "numeric_cmp") return evalNumericRule(row, rule.column, rule.operator, rule.threshold, rule.includeMissing);
  if (rule.root) return evalCompositeRule(row, rule.root);
  if (rule.type === "composite" || rule.type === "not") return evalCompositeRule(row, rule);
  return false;
}
/** True if row hits any rule in the list (sidebar hard∪soft online-pass complement). */
function rowHitsAnyRule(row, rules) {
  for (const r of rules || []) {
    if (evalRule(row, r)) return true;
  }
  return false;
}
function evalCompositeRule(row, node) {
  if (!node) return false;
  if (node.type === "numeric_cmp") {
    return evalNumericRule(row, node.column, node.operator, node.threshold, node.includeMissing);
  }
  if (node.type === "enum_cmp") {
    return evalEnumCmp(row, node.column, node.operator, node.value, node.values);
  }
  if (node.type === "binary_cmp") {
    return evalBinaryCol(row, node.column, node.hitWhen);
  }
  if (node.type === "not") {
    return !evalCompositeRule(row, node.child);
  }
  if (node.type === "composite") {
    const children = node.children || [];
    if (!children.length) return false;
    if (node.op === "or") {
      return children.some((c) => evalCompositeRule(row, c));
    }
    return children.every((c) => evalCompositeRule(row, c));
  }
  return false;
}
function formatCompositeExpr(node) {
  if (!node) return "";
  if (node.type === "numeric_cmp") {
    const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[node.operator] || node.operator;
    return `${node.column} ${sym} ${node.threshold}${node.includeMissing ? "（含缺失）" : ""}`;
  }
  if (node.type === "enum_cmp") {
    const sym = { eq: "=", neq: "≠", in: "∈" }[node.operator] || node.operator;
    const val = node.values?.length ? `[${node.values.join(", ")}]` : `'${node.value ?? ""}'`;
    return `${node.column} ${sym} ${val}`;
  }
  if (node.type === "binary_cmp") {
    return formatBinaryRuleLabel(node.column, node.hitWhen);
  }
  if (node.type === "not") {
    return `非(${formatCompositeExpr(node.child)})`;
  }
  if (node.type === "composite") {
    const join = node.op === "or" ? " 或 " : " 且 ";
    return (node.children || []).map(formatCompositeExpr).filter(Boolean).join(join);
  }
  return "";
}
function ruleDisplayName(rule) {
  if (rule.name) return rule.name;
  if (rule.type === "binary_col") return formatBinaryRuleLabel(rule.column, rule.hitWhen);
  if (rule.type === "composite" || rule.root) {
    return formatCompositeExpr(rule.root || rule) || rule.name || "复合规则";
  }
  if (rule.type === "enum_cmp") {
    return formatCompositeExpr(rule);
  }
  const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[rule.operator] || rule.operator;
  return `${rule.column} ${sym} ${rule.threshold}`;
}

/** Cache: reuse hit masks across summary / validity when same rows+rules. */
let _hitMaskCache = { rows: null, fingerprint: "", byRuleId: null };

function ruleFingerprint(rule) {
  if (!rule) return "";
  return [
    rule.id || "",
    rule.type || "",
    rule.column || "",
    rule.operator || "",
    rule.threshold ?? "",
    rule.hitWhen || "",
    rule.includeMissing ? "1" : "0",
    rule.name || "",
    JSON.stringify(rule.root || null),
  ].join("\u0001");
}

function rulesFingerprint(rules) {
  return (rules || []).map(ruleFingerprint).join("\u0002");
}

function clearHitMaskCache() {
  _hitMaskCache = { rows: null, fingerprint: "", byRuleId: null };
}

function buildHitMasksForRules(rows, rules) {
  const list = rules || [];
  const fp = rulesFingerprint(list);
  if (_hitMaskCache.rows === rows && _hitMaskCache.fingerprint === fp && _hitMaskCache.byRuleId) {
    return list.map((r) => _hitMaskCache.byRuleId.get(r.id) || null);
  }
  const byRuleId = new Map();
  const masks = list.map((rule) => {
    const m = new Uint8Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      if (evalRule(rows[i], rule)) m[i] = 1;
    }
    if (rule?.id) byRuleId.set(rule.id, m);
    return m;
  });
  _hitMaskCache = { rows, fingerprint: fp, byRuleId };
  return masks;
}

function getHitMask(rows, rule) {
  if (!rule) return null;
  const masks = buildHitMasksForRules(rows, [rule]);
  return masks[0] || null;
}
async function computeRuleVolumes(rows, rules, excludeHardMask, onProgress) {
  const n = rows.length;
  const volumes = new Array(rules.length).fill(0);
  const onlyVolumes = new Array(rules.length).fill(0);
  const hitMasks = rules.map(() => false);

  for (let i = 0; i < n; i++) {
    const row = rows[i];
    const vol = getApplyVol(row);
    const hardExcluded = excludeHardMask ? excludeHardMask[i] : false;

    const hits = rules.map((r) => evalRule(row, r));
    for (let j = 0; j < rules.length; j++) {
      if (hits[j] && !hardExcluded) volumes[j] += vol;
    }
    for (let j = 0; j < rules.length; j++) {
      if (hits[j] && !hardExcluded) {
        let only = true;
        for (let k = 0; k < rules.length; k++) {
          if (k !== j && hits[k]) { only = false; break; }
        }
        if (only) onlyVolumes[j] += vol;
      }
    }
    if (onProgress && i > 0 && i % 50000 === 0) {
      onProgress(i, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return { volumes, onlyVolumes };
}
async function buildHardUnionMask(rows, hardRules, onProgress) {
  const mask = new Array(rows.length).fill(false);
  if (!hardRules.length) return mask;
  const n = rows.length;
  for (let i = 0; i < n; i++) {
    for (const r of hardRules) {
      if (evalRule(rows[i], r)) { mask[i] = true; break; }
    }
    if (onProgress && i > 0 && i % 50000 === 0) {
      onProgress(i, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return mask;
}
async function aggregateRows(rows, onProgress) {
  let totalApply = 0, totalPass = 0;
  const n = rows.length;
  for (let i = 0; i < n; i++) {
    totalApply += getApplyVol(rows[i]);
    totalPass += getPassVol(rows[i]);
    if (i > 0 && i % 50000 === 0) {
      if (onProgress) onProgress(i, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return { totalApply, totalPass, passRate: safeRate(totalPass, totalApply) };
}

  Object.assign(target, {
    HIT_WHEN_ONE,
    HIT_WHEN_ZERO,
    normalizeHitWhen,
    normalizeBinaryRuleRef,
    normalizeBinaryRuleList,
    formatBinaryRuleLabel,
    evalBinaryCol,
    evalNumericRule,
    evalEnumCmp,
    evalRule,
    rowHitsAnyRule,
    evalCompositeRule,
    formatCompositeExpr,
    ruleDisplayName,
    clearHitMaskCache,
    buildHitMasksForRules,
    getHitMask,
    rulesFingerprint,
    computeRuleVolumes,
    buildHardUnionMask,
    aggregateRows,
  });
})(window.RV);
