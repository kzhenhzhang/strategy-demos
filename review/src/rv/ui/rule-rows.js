(function (RV) {
"use strict";
  var S = RV.app.state;
  var $ = (id) => document.getElementById(id);
  const esc = RV.infra.esc;
  const parseNum = RV.infra.parseNum;
  const formatBinaryRuleLabel = RV.domain.rules.formatBinaryRuleLabel;
  const normalizeHitWhen = RV.domain.rules.normalizeHitWhen;
  var ui = RV.ui = RV.ui || {};
  var target = ui.ruleRows = ui.ruleRows || {};

  function nextSeq(key) {
    if (S[key] == null) S[key] = 0;
    return ++S[key];
  }

  function syncRuleConfigRowStyle(row) {
    if (!row) return;
    const toggle = (cls, on) => {
      if (row.classList && typeof row.classList.toggle === "function") {
        row.classList.toggle(cls, !!on);
        return;
      }
      const parts = String(row.className || "").split(/\s+/).filter(Boolean);
      const has = parts.includes(cls);
      if (on && !has) parts.push(cls);
      if (!on && has) {
        row.className = parts.filter((c) => c !== cls).join(" ");
        return;
      }
      row.className = parts.join(" ");
    };
    if (row.dataset.kind === "numeric" || row.dataset.kind === "composite" || row.dataset.role === "candidate") {
      toggle("hard", false);
      toggle("soft", true);
      return;
    }
    const isHard = row.querySelector('input.rule-config-hardsoft[value="hard"]')?.checked;
    toggle("hard", !!isHard);
    toggle("soft", !isHard);
  }

  function setHostReadonly(host, readonly) {
    if (!host) return;
    if (host.classList && typeof host.classList.toggle === "function") {
      host.classList.toggle("rule-rows-readonly", !!readonly);
    } else if (host.className != null) {
      const cls = String(host.className || "");
      const has = cls.split(/\s+/).includes("rule-rows-readonly");
      if (readonly && !has) host.className = (cls + " rule-rows-readonly").trim();
      if (!readonly && has) host.className = cls.split(/\s+/).filter((c) => c && c !== "rule-rows-readonly").join(" ");
    }
    host.querySelectorAll("input, select, button, textarea").forEach((el) => {
      if (el.classList && el.classList.contains && el.classList.contains("rule-config-remove")) {
        el.disabled = !!readonly;
        return;
      }
      if (el.closest && el.closest(".rule-rows-toolbar")) {
        el.disabled = !!readonly;
        return;
      }
      if (el.tagName === "BUTTON") el.disabled = !!readonly;
      else el.disabled = !!readonly;
    });
  }

  /**
   * @param {HTMLElement} host
   * @param {object} [preset]
   * @param {{ role?: "strategy"|"baseline"|"candidate", onChange?: function, allowHard?: boolean }} [opts]
   */
  function addBinaryRuleRow(host, preset, opts) {
    opts = opts || {};
    const role = opts.role || host?.dataset?.ruleRole || "strategy";
    const allowHard = opts.allowHard !== false && role !== "candidate";
    const id = nextSeq("ruleConfigSeq");
    const isHard = allowHard && preset?.isHard === true;
    const hitWhen = normalizeHitWhen(preset?.hitWhen);
    const row = document.createElement("div");
    row.className = `rule-config-row ${isHard ? "hard" : "soft"}`;
    row.dataset.kind = "binary";
    row.dataset.role = role;
    row.dataset.ruleId = preset?.id || `bin_${id}`;

    const colSel = document.createElement("select");
    colSel.className = "rule-config-col";
    for (const h of S.binaryCols || []) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      colSel.appendChild(o);
    }
    if (preset?.column && (S.binaryCols || []).includes(preset.column)) colSel.value = preset.column;
    row.appendChild(colSel);

    const hitWrap = document.createElement("div");
    hitWrap.className = "rule-config-hitwhen";
    hitWrap.innerHTML = `<span class="rule-config-hitwhen-label">命中</span>`;
    for (const [val, label] of [["one", "值=1"], ["zero", "值=0"]]) {
      const lab = document.createElement("label");
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.className = "rule-config-hitwhen";
      inp.name = `hitWhen_${role}_${id}`;
      inp.value = val;
      inp.checked = hitWhen === val;
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(label));
      hitWrap.appendChild(lab);
    }
    row.appendChild(hitWrap);

    if (allowHard) {
      const kindWrap = document.createElement("div");
      kindWrap.className = "rule-config-kind";
      for (const [val, label] of [["hard", "硬"], ["soft", "软"]]) {
        const lab = document.createElement("label");
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.className = "rule-config-hardsoft";
        inp.name = `ruleKind_${role}_${id}`;
        inp.value = val;
        inp.checked = (val === "hard") === isHard;
        lab.appendChild(inp);
        lab.appendChild(document.createTextNode(label));
        kindWrap.appendChild(lab);
      }
      row.appendChild(kindWrap);
    } else {
      const tag = document.createElement("span");
      tag.className = "tag-segment";
      tag.textContent = "候选";
      row.appendChild(tag);
    }

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn-secondary btn-sm rule-config-remove";
    rm.textContent = "删";
    row.appendChild(rm);

    const notify = () => {
      syncRuleConfigRowStyle(row);
      opts.onChange?.(row);
    };
    row.querySelectorAll(".rule-config-hardsoft").forEach((r) => r.addEventListener("change", notify));
    row.querySelectorAll(".rule-config-hitwhen, .rule-config-col").forEach((r) => {
      r.addEventListener("change", () => opts.onChange?.(row));
    });
    rm.addEventListener("click", () => {
      row.remove();
      opts.onChange?.(null);
    });
    host?.appendChild(row);
    syncRuleConfigRowStyle(row);
    return row;
  }

  function addNumericRuleRow(host, preset, opts) {
    opts = opts || {};
    const role = opts.role || host?.dataset?.ruleRole || "strategy";
    const id = nextSeq("numericRuleSeq");
    const row = document.createElement("div");
    row.className = "rule-config-row soft";
    row.dataset.kind = "numeric";
    row.dataset.role = role;
    row.dataset.ruleId = preset?.id || `num_${id}`;
    if (role === "candidate") {
      const t1 = document.createElement("span");
      t1.className = "tag-segment";
      t1.textContent = "候选";
      row.appendChild(t1);
    }
    const tSoft = document.createElement("span");
    tSoft.className = "tag-soft";
    tSoft.textContent = "数值";
    row.appendChild(tSoft);

    const colSel = document.createElement("select");
    colSel.className = "num-rule-col";
    for (const h of S.numCols || []) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      colSel.appendChild(o);
    }
    row.appendChild(colSel);

    const opSel = document.createElement("select");
    opSel.className = "num-rule-op";
    for (const [v, lab] of [["gte", "≥"], ["gt", ">"], ["lte", "≤"], ["lt", "<"]]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = lab;
      opSel.appendChild(o);
    }
    row.appendChild(opSel);

    const thInp = document.createElement("input");
    thInp.type = "number";
    thInp.className = "num-rule-threshold";
    thInp.step = "any";
    thInp.placeholder = "阈值";
    row.appendChild(thInp);

    const missLab = document.createElement("label");
    missLab.className = "num-rule-missing";
    const missCb = document.createElement("input");
    missCb.type = "checkbox";
    missCb.className = "num-rule-include-missing";
    missLab.appendChild(missCb);
    missLab.appendChild(document.createTextNode(" 含缺失"));
    row.appendChild(missLab);

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn-secondary btn-sm rule-config-remove";
    rm.textContent = "删";
    row.appendChild(rm);

    if (preset) {
      if (preset.column && (S.numCols || []).includes(preset.column)) colSel.value = preset.column;
      if (preset.operator) opSel.value = preset.operator;
      if (preset.threshold != null) thInp.value = preset.threshold;
      missCb.checked = !!preset.includeMissing;
    }
    rm.addEventListener("click", () => {
      row.remove();
      opts.onChange?.(null);
    });
    [colSel, opSel, thInp, missCb].forEach((el) => {
      el.addEventListener("change", () => opts.onChange?.(row));
      el.addEventListener("input", () => opts.onChange?.(row));
    });
    host?.appendChild(row);
    return row;
  }

  function addCompositeRuleRow(host, preset, opts) {
    opts = opts || {};
    const role = opts.role || host?.dataset?.ruleRole || "strategy";
    const id = nextSeq(role === "candidate" ? "customRuleSeq" : "compositeRuleSeq");
    const RE = RV.ui.ruleExpr;
    const row = document.createElement("div");
    row.className = "rule-config-row soft composite";
    row.dataset.kind = "composite";
    row.dataset.role = role;
    row.dataset.ruleId = preset?.id || (role === "candidate" ? `custom_${id}` : `comp_${id}`);

    const head = document.createElement("div");
    head.className = "rule-composite-head";
    if (role === "candidate") {
      const t1 = document.createElement("span");
      t1.className = "tag-segment";
      t1.textContent = "候选";
      head.appendChild(t1);
    }
    const tSoft = document.createElement("span");
    tSoft.className = "tag-soft";
    tSoft.textContent = "复合";
    head.appendChild(tSoft);
    const nameInp = document.createElement("input");
    nameInp.type = "text";
    nameInp.className = "rule-composite-name";
    nameInp.placeholder = "规则名称";
    nameInp.value = preset?.name || (role === "candidate" ? `候选拒人 ${id}` : `复合规则 ${id}`);
    head.appendChild(nameInp);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn-secondary btn-sm rule-config-remove";
    rm.textContent = "删";
    head.appendChild(rm);
    row.appendChild(head);

    const exprWrap = document.createElement("div");
    exprWrap.className = "rule-composite-expr";
    exprWrap.appendChild(RE.createExprGroupEl(0));
    row.appendChild(exprWrap);
    rm.addEventListener("click", () => {
      row.remove();
      opts.onChange?.(null);
    });
    nameInp.addEventListener("input", () => opts.onChange?.(row));
    if (preset?.root) RE.restoreExprToDom(exprWrap.querySelector(".expr-group"), preset.root);
    if (preset?.root) {
      row._rvRoot = preset.root;
      if (row.dataset) {
        try {
          row.dataset.rootKey = RV.domain.ruleMining?.stableRootKey?.(preset.root) || "";
        } catch (_) { /* ignore */ }
      }
    }
    host?.appendChild(row);
    return row;
  }

  function clearHost(host) {
    if (host) host.innerHTML = "";
  }

  function listRuleRows(host) {
    if (!host) return [];
    const qs = host.querySelectorAll ? host.querySelectorAll(".rule-config-row") : null;
    if (qs && qs.length) return [...qs];
    return [...(host.children || [])].filter((el) =>
      String(el.className || "").split(/\s+/).includes("rule-config-row")
    );
  }

  function walkFind(root, pred, out) {
    out = out || [];
    if (!root) return out;
    if (pred(root)) out.push(root);
    for (const c of root.children || []) walkFind(c, pred, out);
    return out;
  }

  function findByClass(root, cls) {
    return walkFind(root, (n) => String(n.className || "").split(/\s+/).includes(cls))[0] || null;
  }

  function findAllByClass(root, cls) {
    return walkFind(root, (n) => String(n.className || "").split(/\s+/).includes(cls));
  }

  /**
   * Collect runtime rules from a flat rule-rows host.
   * @returns {{ hardRules: object[], softRules: object[], candidateRules: object[] }}
   */
  function collectRulesFromHost(host, opts) {
    opts = opts || {};
    const hardRules = [];
    const softRules = [];
    const candidateRules = [];
    if (!host) return { hardRules, softRules, candidateRules };
    const asCandidate = opts.forceCandidate || host.dataset?.ruleRole === "candidate";

    listRuleRows(host).forEach((row) => {
      const role = row.dataset.role || (asCandidate ? "candidate" : "strategy");
      if (row.dataset.kind === "binary") {
        const colSel = findByClass(row, "rule-config-col");
        const col = colSel?.value;
        if (!col) return;
        const hitRadios = findAllByClass(row, "rule-config-hitwhen").filter((el) => el.tagName === "INPUT" || el.type === "radio");
        const hitWhen = hitRadios.some((r) => r.value === "zero" && r.checked) ? "zero" : "one";
        const label = formatBinaryRuleLabel(col, hitWhen);
        if (role === "candidate" || asCandidate) {
          candidateRules.push({
            id: row.dataset.ruleId || `cand_bin_${col}`,
            type: "composite",
            name: label,
            root: {
              type: "composite",
              op: "and",
              children: [{ type: "binary_cmp", column: col, hitWhen }],
            },
          });
          return;
        }
        const hardRadios = findAllByClass(row, "rule-config-hardsoft");
        const isHard = hardRadios.some((r) => r.value === "hard" && r.checked);
        const rule = {
          id: `${isHard ? "hard" : "soft"}_${col}`,
          type: "binary_col",
          column: col,
          hitWhen,
          isHard,
          name: isHard ? `[硬] ${label}` : label,
        };
        (isHard ? hardRules : softRules).push(rule);
      } else if (row.dataset.kind === "numeric") {
        const col = findByClass(row, "num-rule-col")?.value;
        const op = findByClass(row, "num-rule-op")?.value;
        const th = findByClass(row, "num-rule-threshold")?.value;
        const includeMissing = !!findByClass(row, "num-rule-include-missing")?.checked;
        if (!col || th === "" || th == null) return;
        const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[op] || op;
        const name = `${col} ${sym} ${th}${includeMissing ? "（含缺失）" : ""}`;
        if (role === "candidate" || asCandidate) {
          candidateRules.push({
            id: row.dataset.ruleId || `cand_num_${col}_${th}`,
            type: "composite",
            name,
            root: {
              type: "composite",
              op: "and",
              children: [{
                type: "numeric_cmp",
                column: col,
                operator: op,
                threshold: parseNum(th),
                includeMissing,
              }],
            },
          });
          return;
        }
        softRules.push({
          id: row.dataset.ruleId || `num_${col}_${th}`,
          type: "numeric_cmp",
          column: col,
          operator: op,
          threshold: parseNum(th),
          includeMissing,
          isHard: false,
          name,
        });
      } else if (row.dataset.kind === "composite") {
        const nameEl = findByClass(row, "rule-composite-name");
        const name = nameEl?.value?.trim();
        const exprGroup = findByClass(row, "expr-group");
        let root = exprGroup ? RV.ui.ruleExpr.collectExprFromEl(exprGroup) : null;
        if (!root && row._rvRoot) root = row._rvRoot;
        if (!name || !root) return;
        const rule = {
          id: row.dataset.ruleId || `comp_${softRules.length + candidateRules.length + 1}`,
          type: "composite",
          name,
          root,
          isHard: false,
        };
        if (role === "candidate" || asCandidate) candidateRules.push(rule);
        else softRules.push(rule);
      }
    });
    return { hardRules, softRules, candidateRules };
  }

  function applyLegacyToHost(host, hardCols, softRules, opts) {
    opts = opts || {};
    const warnings = opts.warnings || [];
    const normalizeBinaryRuleList = RV.domain.rules.normalizeBinaryRuleList;
    clearHost(host);
    S.ruleConfigSeq = S.ruleConfigSeq || 0;
    const usedBinary = new Set();
    for (const item of normalizeBinaryRuleList(hardCols || [])) {
      const col = item.col;
      if (!S.headers.includes(col)) { warnings.push(`硬规则「${col}」不存在，已跳过`); continue; }
      if (!(S.binaryCols || []).includes(col)) { warnings.push(`硬规则「${col}」不是 0-1 列，已跳过`); continue; }
      addBinaryRuleRow(host, { column: col, isHard: true, hitWhen: item.hitWhen }, opts);
      usedBinary.add(col);
    }
    for (const item of normalizeBinaryRuleList(softRules?.binary || [])) {
      const col = item.col;
      if (usedBinary.has(col)) continue;
      if (!S.headers.includes(col)) { warnings.push(`软规则「${col}」不存在，已跳过`); continue; }
      if (!(S.binaryCols || []).includes(col)) { warnings.push(`软规则「${col}」不是 0-1 列，已跳过`); continue; }
      addBinaryRuleRow(host, { column: col, isHard: false, hitWhen: item.hitWhen }, opts);
      usedBinary.add(col);
    }
    for (const n of softRules?.numeric || []) {
      if (!S.headers.includes(n.column)) { warnings.push(`数值软规则列「${n.column}」不存在，已跳过`); continue; }
      if (!(S.numCols || []).includes(n.column)) { warnings.push(`数值软规则列「${n.column}」不是数值列，已跳过`); continue; }
      addNumericRuleRow(host, n, opts);
    }
    for (const c of softRules?.composite || []) {
      if (!c?.name || !c?.root) continue;
      addCompositeRuleRow(host, c, opts);
    }
  }

  function renderAddToolbarHtml(prefix) {
    const addLabel = prefix === "rvCandidate" ? "+ 添加候选" : "+ 新建规则";
    return `<div class="rule-rows-toolbar batch-actions-inline" style="margin:.35rem 0">
      <select id="${prefix}TypeSelect">
        <option value="binary">0-1 列</option>
        <option value="numeric">数值</option>
        <option value="composite">复合</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm" id="${prefix}AddBtn">${addLabel}</button>
    </div>`;
  }

  Object.assign(target, {
    syncRuleConfigRowStyle,
    setHostReadonly,
    addBinaryRuleRow,
    addNumericRuleRow,
    addCompositeRuleRow,
    clearHost,
    collectRulesFromHost,
    applyLegacyToHost,
    renderAddToolbarHtml,
  });
})(window.RV);
