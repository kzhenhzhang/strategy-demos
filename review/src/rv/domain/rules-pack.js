(function (RV) {
  "use strict";
  var domain = RV.domain = RV.domain || {};
  var target = domain.rulesPack = domain.rulesPack || {};

  const PACK_VERSION = 1;
  const FILENAMES = {
    strategy: "strategy-rules.json",
    validityBaseline: "validity-baseline-rules.json",
    validityCandidate: "validity-candidate-rules.json",
  };
  const CONTEXTS = {
    strategy: { allowedKinds: new Set(["hard", "soft"]) },
    validityBaseline: { allowedKinds: new Set(["hard", "soft"]) },
    validityCandidate: { allowedKinds: new Set(["candidate"]) },
  };
  const OP_SYM = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
  const normalizeHitWhen = RV.domain.rules.normalizeHitWhen;
  const normalizeBinaryRuleList = RV.domain.rules.normalizeBinaryRuleList;

  function compactExprToAst(node, warnings, path) {
    path = path || "expr";
    if (!node || typeof node !== "object") {
      warnings.push(`${path} 无效`);
      return null;
    }
    if (node.not != null) {
      const child = compactExprToAst(node.not, warnings, `${path}.not`);
      return child ? { type: "not", child } : null;
    }
    if (node.op && Array.isArray(node.items)) {
      const children = node.items
        .map((c, i) => compactExprToAst(c, warnings, `${path}.items[${i}]`))
        .filter(Boolean);
      if (!children.length) return null;
      return { type: "composite", op: node.op === "or" ? "or" : "and", children };
    }
    if (node.type === "num") {
      if (!node.col || node.val == null || node.val === "") {
        warnings.push(`${path} 数值条件缺少 col/val`);
        return null;
      }
      return {
        type: "numeric_cmp",
        column: node.col,
        operator: node.op || "gte",
        threshold: Number(node.val),
        includeMissing: !!node.includeMissing,
      };
    }
    if (node.type === "enum") {
      if (!node.col || node.val == null || String(node.val).trim() === "") {
        warnings.push(`${path} 枚举条件缺少 col/val`);
        return null;
      }
      return {
        type: "enum_cmp",
        column: node.col,
        operator: node.op || "eq",
        value: String(node.val).trim(),
      };
    }
    if (node.type === "bin" || node.type === "binary") {
      if (!node.col) {
        warnings.push(`${path} 0-1 条件缺少 col`);
        return null;
      }
      return {
        type: "binary_cmp",
        column: String(node.col),
        hitWhen: normalizeHitWhen(node.hitWhen),
      };
    }
    warnings.push(`${path} 未知表达式节点`);
    return null;
  }

  function astToCompactExpr(node) {
    if (!node) return null;
    if (node.type === "not") {
      const inner = astToCompactExpr(node.child);
      return inner ? { not: inner } : null;
    }
    if (node.type === "composite") {
      return {
        op: node.op || "and",
        items: (node.children || []).map(astToCompactExpr).filter(Boolean),
      };
    }
    if (node.type === "numeric_cmp") {
      const out = { type: "num", col: node.column, op: node.operator, val: node.threshold };
      if (node.includeMissing) out.includeMissing = true;
      return out;
    }
    if (node.type === "enum_cmp") {
      return { type: "enum", col: node.column, op: node.operator, val: node.value };
    }
    if (node.type === "binary_cmp") {
      const out = { type: "bin", col: node.column };
      if (normalizeHitWhen(node.hitWhen) === "zero") out.hitWhen = "zero";
      return out;
    }
    return null;
  }

  function normalizePackItem(raw, warnings, index) {
    if (!raw || typeof raw !== "object") {
      warnings.push(`rules[${index}] 无效`);
      return null;
    }
    const kind = raw.kind === "hard" || raw.kind === "soft" || raw.kind === "candidate" ? raw.kind : "soft";
    const type = raw.type;
    if (type === "binary") {
      if (!raw.col) {
        warnings.push(`rules[${index}] binary 缺少 col`);
        return null;
      }
      if (kind === "hard" && type !== "binary") {
        warnings.push(`rules[${index}] hard 仅支持 binary`);
        return null;
      }
      return { kind, type: "binary", col: String(raw.col), hitWhen: normalizeHitWhen(raw.hitWhen) };
    }
    if (type === "num") {
      if (!raw.col || raw.val == null || raw.val === "") {
        warnings.push(`rules[${index}] num 缺少 col/val`);
        return null;
      }
      if (kind === "hard") {
        warnings.push(`rules[${index}] hard 不支持 num，已跳过`);
        return null;
      }
      return {
        kind: "soft",
        type: "num",
        col: String(raw.col),
        op: raw.op || "gte",
        val: Number(raw.val),
        includeMissing: !!raw.includeMissing,
      };
    }
    if (type === "expr") {
      if (kind === "hard") {
        warnings.push(`rules[${index}] hard 不支持 expr，已跳过`);
        return null;
      }
      const expr = compactExprToAst(raw.expr, warnings, `rules[${index}].expr`);
      if (!expr) return null;
      return {
        kind: kind === "candidate" ? "candidate" : "soft",
        type: "expr",
        name: String(raw.name || "复合规则").trim(),
        expr: raw.expr,
        _root: expr,
      };
    }
    warnings.push(`rules[${index}] 未知 type「${type}」`);
    return null;
  }

  function parseRulesPack(input, warnings) {
    warnings = warnings || [];
    let data = input;
    if (typeof input === "string") {
      try {
        data = JSON.parse(input);
      } catch (e) {
        throw new Error("JSON 解析失败：" + (e.message || e));
      }
    }
    if (Array.isArray(data)) {
      data = { v: PACK_VERSION, rules: data };
    }
    if (!data || typeof data !== "object") throw new Error("规则包格式无效");
    const ver = data.v != null ? Number(data.v) : PACK_VERSION;
    if (ver !== PACK_VERSION) {
      warnings.push(`规则包版本 ${ver}，当前仅完全支持 v${PACK_VERSION}`);
    }
    const rules = [];
    (data.rules || []).forEach((raw, i) => {
      const item = normalizePackItem(raw, warnings, i);
      if (item) rules.push(item);
    });
    return { v: PACK_VERSION, rules };
  }

  function filterPackForContext(pack, context, warnings) {
    const spec = CONTEXTS[context];
    if (!spec) throw new Error("未知 context：" + context);
    const kept = [];
    for (const item of pack.rules || []) {
      if (spec.allowedKinds.has(item.kind)) {
        kept.push(item);
      } else {
        warnings.push(`已忽略 kind=${item.kind}（${context} 不接受）`);
      }
    }
    return { v: PACK_VERSION, rules: kept };
  }

  function packItemToLegacyBinary(item) {
    const hitWhen = normalizeHitWhen(item.hitWhen);
    if (hitWhen === "zero") return { col: item.col, hitWhen: "zero" };
    return item.col;
  }

  function packToLegacySidebar(pack) {
    const hardCols = [];
    const softRules = { binary: [], numeric: [], composite: [] };
    for (const item of pack.rules || []) {
      if (item.type === "binary") {
        const legacy = packItemToLegacyBinary(item);
        if (item.kind === "hard") hardCols.push(legacy);
        else softRules.binary.push(legacy);
      } else if (item.type === "num") {
        softRules.numeric.push({
          column: item.col,
          operator: item.op,
          threshold: item.val,
          includeMissing: !!item.includeMissing,
        });
      } else if (item.type === "expr" && item.kind === "soft") {
        softRules.composite.push({ name: item.name, root: item._root || compactExprToAst(item.expr, [], "expr") });
      }
    }
    return { hardCols, softRules };
  }

  function packToCustomRules(pack) {
    return (pack.rules || [])
      .filter((item) => item.type === "expr" && item.kind === "candidate")
      .map((item, i) => ({
        id: item.id || `custom_${i + 1}`,
        name: item.name,
        root: item._root || compactExprToAst(item.expr, [], `rules[${i}].expr`),
      }))
      .filter((r) => r.name && r.root);
  }

  function runtimeBinaryToPackItem(rule) {
    const item = {
      kind: rule.isHard ? "hard" : "soft",
      type: "binary",
      col: rule.column,
      hitWhen: normalizeHitWhen(rule.hitWhen),
    };
    return item;
  }

  function runtimeNumericToPackItem(rule) {
    const out = {
      kind: "soft",
      type: "num",
      col: rule.column,
      op: rule.operator,
      val: rule.threshold,
    };
    if (rule.includeMissing) out.includeMissing = true;
    return out;
  }

  function runtimeCompositeToPackItem(rule, kind) {
    const expr = astToCompactExpr(rule.root);
    if (!expr) return null;
    return {
      kind: kind || "soft",
      type: "expr",
      name: rule.name || ruleDisplayName(rule),
      expr,
    };
  }

  function ruleDisplayName(rule) {
    if (rule.name) return rule.name;
    if (rule.type === "binary_col") return rule.column;
    if (rule.type === "numeric_cmp") {
      const sym = OP_SYM[rule.operator] || rule.operator;
      return `${rule.column} ${sym} ${rule.threshold}`;
    }
    return "复合规则";
  }

  function runtimeRulesToPack(hardRules, softRules, candidateRules) {
    const rules = [];
    for (const r of hardRules || []) {
      if (r.type === "binary_col") rules.push(runtimeBinaryToPackItem(r));
    }
    for (const r of softRules || []) {
      if (r.type === "binary_col") rules.push(runtimeBinaryToPackItem({ ...r, isHard: false }));
      else if (r.type === "numeric_cmp") rules.push(runtimeNumericToPackItem(r));
      else if (r.type === "composite" || r.root) rules.push(runtimeCompositeToPackItem(r, "soft"));
    }
    for (const r of candidateRules || []) {
      const item = runtimeCompositeToPackItem(r, "candidate");
      if (item) rules.push(item);
    }
    return { v: PACK_VERSION, rules };
  }

  function serializeRulesPack(pack) {
    const out = { v: PACK_VERSION, rules: [] };
    for (const item of pack.rules || []) {
      const copy = { kind: item.kind, type: item.type };
      if (item.type === "binary") {
        copy.col = item.col;
        if (normalizeHitWhen(item.hitWhen) === "zero") copy.hitWhen = "zero";
      } else if (item.type === "num") {
        copy.col = item.col;
        copy.op = item.op;
        copy.val = item.val;
        if (item.includeMissing) copy.includeMissing = true;
      } else if (item.type === "expr") {
        copy.name = item.name;
        copy.expr = item.expr || astToCompactExpr(item._root);
      }
      out.rules.push(copy);
    }
    return out;
  }

  Object.assign(target, {
    PACK_VERSION,
    FILENAMES,
    CONTEXTS,
    parseRulesPack,
    filterPackForContext,
    serializeRulesPack,
    packToLegacySidebar,
    packToCustomRules,
    runtimeRulesToPack,
    compactExprToAst,
    astToCompactExpr,
  });
})(window.RV);
