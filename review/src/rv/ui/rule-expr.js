(function (RV) {
  "use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  const parseNum = RV.infra.parseNum;
  var ui = RV.ui = RV.ui || {};
  var target = ui.ruleExpr = ui.ruleExpr || {};

  function getExprEnumCols() {
    if (S.enumCols?.length) return S.enumCols;
    const binSet = new Set(S.binaryCols || []);
    const numSet = new Set(S.numCols || []);
    return (S.headers || []).filter((h) => !binSet.has(h) && !numSet.has(h));
  }

  function fillExprColSelect(sel) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = "";
    for (const h of S.numCols || []) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      sel.appendChild(o);
    }
    if (cur && S.numCols.includes(cur)) sel.value = cur;
    else if (S.numCols.length) sel.value = S.numCols[0];
  }

  function fillExprBinaryColSelect(sel) {
    if (!sel) return;
    const cur = sel.value;
    const cols = S.binaryCols || [];
    sel.innerHTML = "";
    if (!cols.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "（当前 CSV 无 0-1 列）";
      sel.appendChild(o);
      return;
    }
    for (const h of cols) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      sel.appendChild(o);
    }
    if (cur && cols.includes(cur)) sel.value = cur;
    else sel.value = cols[0];
  }

  function fillExprEnumColSelect(sel) {
    if (!sel) return;
    const cur = sel.value;
    const cols = getExprEnumCols();
    sel.innerHTML = "";
    for (const h of cols) {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      o.title = h;
      sel.appendChild(o);
    }
    if (cur && cols.includes(cur)) sel.value = cur;
    else if (cols.length) sel.value = cols[0];
  }

  function syncExprCondKindUI(condEl) {
    if (!condEl) return;
    const kind = condEl.querySelector(".expr-cond-kind")?.value || "numeric";
    const numOp = condEl.querySelector(".expr-op-numeric");
    const enumOp = condEl.querySelector(".expr-op-enum");
    const th = condEl.querySelector(".expr-threshold");
    const val = condEl.querySelector(".expr-enum-value");
    const hitWhen = condEl.querySelector(".expr-binary-hitwhen");
    const numMissLab = condEl.querySelector(".expr-num-missing-lab");
    const enumMissLab = condEl.querySelector(".expr-enum-missing-lab");
    const enumMissCb = condEl.querySelector(".expr-enum-is-missing");
    const col = condEl.querySelector(".expr-col");
    if (kind === "enum") {
      fillExprEnumColSelect(col);
      if (numOp) numOp.style.display = "none";
      if (enumOp) enumOp.style.display = "";
      if (th) th.style.display = "none";
      if (val) val.style.display = enumMissCb?.checked ? "none" : "";
      if (hitWhen) hitWhen.style.display = "none";
      if (numMissLab) numMissLab.style.display = "none";
      if (enumMissLab) enumMissLab.style.display = "";
    } else if (kind === "binary") {
      fillExprBinaryColSelect(col);
      if (numOp) numOp.style.display = "none";
      if (enumOp) enumOp.style.display = "none";
      if (th) th.style.display = "none";
      if (val) val.style.display = "none";
      if (hitWhen) hitWhen.style.display = "";
      if (numMissLab) numMissLab.style.display = "none";
      if (enumMissLab) enumMissLab.style.display = "none";
    } else {
      fillExprColSelect(col);
      if (numOp) numOp.style.display = "";
      if (enumOp) enumOp.style.display = "none";
      if (th) th.style.display = "";
      if (val) val.style.display = "none";
      if (hitWhen) hitWhen.style.display = "none";
      if (numMissLab) numMissLab.style.display = "";
      if (enumMissLab) enumMissLab.style.display = "none";
    }
  }

  function createExprCondEl(preset) {
    const row = document.createElement("div");
    row.className = "expr-cond";
    row.innerHTML = `
    <label class="expr-not-lab"><input type="checkbox" class="expr-not" /> 非</label>
    <select class="expr-cond-kind">
      <option value="numeric">数值</option>
      <option value="enum">字符/枚举</option>
      <option value="binary">0-1 列</option>
    </select>
    <select class="expr-col"></select>
    <select class="expr-binary-hitwhen" style="display:none">
      <option value="one">值=1 命中</option>
      <option value="zero">值=0 命中</option>
    </select>
    <select class="expr-op expr-op-numeric">
      <option value="gte">≥</option><option value="gt">&gt;</option>
      <option value="lte">≤</option><option value="lt">&lt;</option>
    </select>
    <select class="expr-op expr-op-enum" style="display:none">
      <option value="eq">=</option><option value="neq">≠</option>
    </select>
    <input type="number" class="expr-threshold" step="any" placeholder="阈值" />
    <input type="text" class="expr-enum-value" placeholder="取值" style="display:none" />
    <label class="expr-num-missing-lab"><input type="checkbox" class="expr-num-include-missing" /> 含缺失</label>
    <label class="expr-enum-missing-lab" style="display:none"><input type="checkbox" class="expr-enum-is-missing" /> 缺失值</label>
    <button type="button" class="btn btn-secondary btn-sm expr-del-cond">删</button>`;
    const kindSel = row.querySelector(".expr-cond-kind");
    if (kindSel?.addEventListener) {
      kindSel.addEventListener("change", () => syncExprCondKindUI(row));
    }
    row.querySelector(".expr-enum-is-missing")?.addEventListener("change", () => syncExprCondKindUI(row));
    if (preset?.kind === "enum" || preset?.type === "enum_cmp") {
      kindSel.value = "enum";
    } else if (preset?.kind === "binary" || preset?.type === "binary_cmp") {
      kindSel.value = "binary";
    }
    syncExprCondKindUI(row);
    if (preset?.type === "numeric_cmp" || preset?.type === "enum_cmp" || preset?.type === "binary_cmp") {
      if (preset.column) row.querySelector(".expr-col").value = preset.column;
      if (preset.type === "numeric_cmp") {
        if (preset.operator) {
          const nop = row.querySelector(".expr-op-numeric");
          if (nop) nop.value = preset.operator;
        }
        if (preset.threshold != null) {
          const thEl = row.querySelector(".expr-threshold");
          if (thEl) thEl.value = preset.threshold;
        }
        const missCb = row.querySelector(".expr-num-include-missing");
        if (missCb) missCb.checked = !!preset.includeMissing;
      } else if (preset.type === "enum_cmp") {
        if (preset.operator) {
          const eop = row.querySelector(".expr-op-enum");
          if (eop) eop.value = preset.operator;
        }
        const enumMissing = String(preset.value ?? "").trim() === C.BIN_MISSING_LABEL;
        const enumMissCb = row.querySelector(".expr-enum-is-missing");
        if (enumMissCb) enumMissCb.checked = enumMissing;
        if (!enumMissing && preset.value != null) {
          const valEl = row.querySelector(".expr-enum-value");
          if (valEl) valEl.value = preset.value;
        }
      } else if (preset.type === "binary_cmp") {
        const hw = row.querySelector(".expr-binary-hitwhen");
        if (hw) hw.value = RV.domain.rules.normalizeHitWhen(preset.hitWhen);
      }
    }
    syncExprCondKindUI(row);
    return row;
  }

  function createExprGroupEl(depth) {
    depth = depth | 0;
    const group = document.createElement("div");
    group.className = "expr-group";
    group.dataset.depth = String(depth);
    group.innerHTML = `
    <div class="expr-group-bar">
      <select class="expr-group-op">
        <option value="and">且 (AND)</option>
        <option value="or">或 (OR)</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm expr-add-cond">+ 条件</button>
      <button type="button" class="btn btn-secondary btn-sm expr-add-group"${depth >= C.MAX_EXPR_DEPTH - 1 ? " disabled" : ""}>+ 子组</button>
    </div>
    <div class="expr-children"></div>`;
    group.querySelector(".expr-children").appendChild(createExprCondEl());
    return group;
  }

  function countExprLeaves(groupEl) {
    if (!groupEl) return 0;
    let n = 0;
    groupEl.querySelectorAll(".expr-children > .expr-cond").forEach(() => { n++; });
    groupEl.querySelectorAll(".expr-children > .expr-group").forEach((g) => {
      n += countExprLeaves(g);
    });
    return n;
  }

  function collectLeafFromCondEl(el) {
    const kind = el.querySelector(".expr-cond-kind")?.value || "numeric";
    if (kind === "binary") {
      const col = el.querySelector(".expr-col")?.value;
      const hitWhen = el.querySelector(".expr-binary-hitwhen")?.value || "one";
      if (!col || !(S.binaryCols || []).includes(col)) return null;
      return { type: "binary_cmp", column: col, hitWhen: RV.domain.rules.normalizeHitWhen(hitWhen) };
    }
    if (kind === "enum") {
      const col = el.querySelector(".expr-col")?.value;
      const op = el.querySelector(".expr-op-enum")?.value || "eq";
      const isMissing = !!el.querySelector(".expr-enum-is-missing")?.checked;
      const value = isMissing ? C.BIN_MISSING_LABEL : el.querySelector(".expr-enum-value")?.value;
      if (!col || value === "" || value == null) return null;
      return { type: "enum_cmp", column: col, operator: op, value: String(value).trim() };
    }
    const col = el.querySelector(".expr-col")?.value;
    const op = el.querySelector(".expr-op-numeric")?.value;
    const thRaw = el.querySelector(".expr-threshold")?.value;
    if (!col || thRaw === "" || thRaw == null) return null;
    const threshold = parseNum(thRaw);
    if (threshold == null) return null;
    const includeMissing = !!el.querySelector(".expr-num-include-missing")?.checked;
    return { type: "numeric_cmp", column: col, operator: op, threshold, includeMissing };
  }

  function collectExprFromEl(el) {
    if (!el) return null;
    if (el.classList.contains("expr-cond")) {
      let node = collectLeafFromCondEl(el);
      if (!node) return null;
      if (el.querySelector(".expr-not")?.checked) {
        node = { type: "not", child: node };
      }
      return node;
    }
    if (el.classList.contains("expr-group")) {
      const op = el.querySelector(".expr-group-op")?.value || "and";
      const children = [];
      el.querySelector(":scope > .expr-children").querySelectorAll(":scope > .expr-cond, :scope > .expr-group").forEach((child) => {
        const n = collectExprFromEl(child);
        if (n) children.push(n);
      });
      if (!children.length) return null;
      return { type: "composite", op, children };
    }
    return null;
  }

  function appendLeafToGroup(childrenEl, condNode, notFlag) {
    if (condNode?.type === "numeric_cmp" || condNode?.type === "enum_cmp" || condNode?.type === "binary_cmp") {
      const cond = createExprCondEl(condNode);
      if (notFlag) cond.querySelector(".expr-not").checked = true;
      childrenEl.appendChild(cond);
    }
  }

  function appendExprNodeToGroup(parentGroupEl, node) {
    const depth = parseInt(parentGroupEl.dataset.depth, 10) || 0;
    const childrenEl = parentGroupEl.querySelector(":scope > .expr-children");
    if (node.type === "composite") {
      const sub = createExprGroupEl(depth + 1);
      sub.querySelector(".expr-group-op").value = node.op || "and";
      sub.querySelector(".expr-children").innerHTML = "";
      childrenEl.appendChild(sub);
      for (const child of node.children || []) {
        appendExprNodeToGroup(sub, child);
      }
      if (!sub.querySelector(".expr-children").children.length) {
        sub.querySelector(".expr-children").appendChild(createExprCondEl());
      }
      return;
    }
    let condNode = node;
    let notFlag = false;
    if (node.type === "not") {
      notFlag = true;
      condNode = node.child;
    }
    appendLeafToGroup(childrenEl, condNode, notFlag);
  }

  function restoreExprToDom(groupEl, node) {
    if (!groupEl || !node) return;
    if (node.type === "composite") {
      groupEl.querySelector(".expr-group-op").value = node.op || "and";
      const childrenEl = groupEl.querySelector(":scope > .expr-children");
      childrenEl.innerHTML = "";
      for (const child of node.children || []) {
        appendExprNodeToGroup(groupEl, child);
      }
      if (!childrenEl.children.length) childrenEl.appendChild(createExprCondEl());
      return;
    }
    const childrenEl = groupEl.querySelector(":scope > .expr-children");
    childrenEl.innerHTML = "";
    appendExprNodeToGroup(groupEl, node);
  }

  function findExprRootFromClickTarget(target) {
    const card = target.closest(".rv-custom-rule-card");
    if (card) return card.querySelector(".expr-group");
    const row = target.closest(".rule-config-row[data-kind=composite], .rv-composite-soft-row");
    if (row) return row.querySelector(".expr-group");
    return null;
  }

  function refreshExprCondColSelects(root) {
    root?.querySelectorAll(".expr-cond").forEach((cond) => syncExprCondKindUI(cond));
  }

  Object.assign(target, {
    getExprEnumCols,
    fillExprColSelect,
    fillExprBinaryColSelect,
    fillExprEnumColSelect,
    syncExprCondKindUI,
    createExprCondEl,
    createExprGroupEl,
    countExprLeaves,
    collectExprFromEl,
    appendExprNodeToGroup,
    restoreExprToDom,
    findExprRootFromClickTarget,
    refreshExprCondColSelects,
  });
})(window.RV);
