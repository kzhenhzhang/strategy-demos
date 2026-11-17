(function (RV) {
"use strict";
  var ui = RV.ui = RV.ui || {};
  var target = ui.waterfallDnd = ui.waterfallDnd || {};

/**
 * Shared pointer-based waterfall row DnD.
 * @param {HTMLElement} tbody
 * @param {object} opts
 * @param {string} [opts.boundFlag="sortBound"] dataset flag to avoid double-bind
 * @param {string} [opts.rowSelector="tr.wf-row"]
 * @param {number} [opts.colSpan=10]
 * @param {() => boolean} [opts.canStart]
 * @param {(orderedFromDom: HTMLElement) => void} opts.onCommit — called when order changed
 * @param {(tbody: HTMLElement) => string} [opts.orderKey] — serialize current order
 * @param {(tbody: HTMLElement, placeholder, clientY, dragItem) => void} opts.movePlaceholder
 */
function bindWaterfallPointerDnD(tbody, opts) {
  if (!tbody) return;
  const flag = opts.boundFlag || "sortBound";
  if (tbody.dataset[flag] === "1") return;
  tbody.dataset[flag] = "1";

  const rowSelector = opts.rowSelector || "tr.wf-row";
  const colSpan = opts.colSpan || 10;
  let dragItem = null;
  let placeholder = null;
  let orderBeforeDrag = "";
  let activePointer = null;
  let rafPending = false;
  let lastClientY = 0;

  function finishDrag(commit) {
    if (!dragItem || !placeholder) return;
    tbody.insertBefore(dragItem, placeholder);
    placeholder.remove();
    dragItem.classList.remove("wf-dragging", "wf-sort-hidden");
    if (activePointer != null) {
      try { dragItem.releasePointerCapture(activePointer); } catch (_) { /* ignore */ }
    }
    if (commit && opts.onCommit) {
      const after = opts.orderKey ? opts.orderKey(tbody) : "";
      if (!opts.orderKey || after !== orderBeforeDrag) {
        opts.onCommit(tbody);
      }
    }
    dragItem = null;
    placeholder = null;
    activePointer = null;
    rafPending = false;
  }

  tbody.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".drag-handle")) return;
    if (opts.canStart && !opts.canStart()) return;
    const item = e.target.closest(rowSelector);
    if (!item) return;
    e.preventDefault();
    dragItem = item;
    activePointer = e.pointerId;
    orderBeforeDrag = opts.orderKey ? opts.orderKey(tbody) : "";
    placeholder = document.createElement("tr");
    placeholder.className = "waterfall-placeholder-row";
    placeholder.innerHTML = `<td colspan="${colSpan}"><div class="waterfall-placeholder"></div></td>`;
    tbody.insertBefore(placeholder, item);
    item.classList.add("wf-sort-hidden");
    item.setPointerCapture(activePointer);
    lastClientY = e.clientY;
  });

  tbody.addEventListener("pointermove", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    e.preventDefault();
    lastClientY = e.clientY;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (dragItem && placeholder && opts.movePlaceholder) {
        opts.movePlaceholder(tbody, placeholder, lastClientY, dragItem);
      }
    });
  });

  tbody.addEventListener("pointerup", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    e.preventDefault();
    finishDrag(true);
  });

  tbody.addEventListener("pointercancel", (e) => {
    if (!dragItem || e.pointerId !== activePointer) return;
    finishDrag(false);
  });
}

  Object.assign(target, { bindWaterfallPointerDnD });
})(window.RV);
