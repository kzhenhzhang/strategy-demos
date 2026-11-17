/**
 * 重点数据跟踪的左右栏。计算在 src/model-track.js。
 */
(function (RV) {
  "use strict";

  function esc(s) {
    return RV.infra.esc ? RV.infra.esc(s) : String(s == null ? "" : s);
  }

  function fmt3(v) {
    return v == null || !Number.isFinite(v) ? "—" : v.toFixed(3);
  }

  function fmtPct(v) {
    return v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(2) + "%";
  }

  function weekLabel(period) {
    const fmt = RV.domain.dailyReview && RV.domain.dailyReview.formatPeriodLabel;
    return fmt ? fmt(period, "week") : String(period);
  }

  function heatAttr(rate, scale) {
    if (!scale || rate == null || !Number.isFinite(rate) || !RV.infra.rateHeatStyle) return "";
    const css = RV.infra.rateHeatStyle(rate, scale.min, scale.max);
    return css ? ` style="${css}"` : "";
  }

  function syncSticky(root) {
    const wrap = root && root.querySelector ? root.querySelector(".dr-detail-table-wrap") : null;
    if (!wrap) return;
    const table = wrap.querySelector(".dr-detail-table");
    const row1 = table && table.tHead && table.tHead.rows[0];
    if (!row1) return;
    const first = row1.querySelector("th.dr-detail-sticky");
    if (first) wrap.style.setProperty("--dr-detail-col1-w", first.offsetWidth + "px");
    const row1H = row1.querySelector(".dr-detail-group-h") || row1.querySelector("th:not([rowspan])");
    if (row1H) wrap.style.setProperty("--dr-detail-thead-row1", row1H.offsetHeight + "px");
  }

  function numAttr(v) {
    return v == null || !Number.isFinite(v) ? "" : String(v);
  }

  function sortTh(label, key, extra) {
    return `<th class="dr-detail-metric-h th-sortable${extra}" data-sort-key="${esc(key)}"><button type="button" class="th-sort-btn" data-label="${esc(label)}">${esc(label)}</button></th>`;
  }

  function metricTd(cls, key, v, scale) {
    const style = scale ? heatAttr(v, scale) : "";
    return `<td class="${cls}" data-sort-key="${esc(key)}" data-sort-value="${numAttr(v)}"${style}>${esc(fmt3(v))}</td>`;
  }

  function scaleOf(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  function weekHasMetrics(pack, week) {
    return pack.models.some((model) => {
      const side = model.sides[pack.sideId];
      const met = side && side.byWeek[week];
      return !!(met && (met.ks != null || met.auc != null || met.iv != null));
    });
  }

  function metricTable(pack, weeks) {
    const weekCols = weeks.filter((week) => weekHasMetrics(pack, week)).slice().reverse();
    const overall = pack.models.map((model) => {
      const side = model.sides[pack.sideId];
      return side && side.all;
    });
    const overallScale = {
      ks: scaleOf(overall.map((met) => met && met.ks)),
      auc: scaleOf(overall.map((met) => met && met.auc)),
      iv: scaleOf(overall.map((met) => met && met.iv)),
    };
    const span = 1 + weekCols.length;
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky th-sortable" rowspan="2" data-sort-key="name"><button type="button" class="th-sort-btn" data-label="模型">模型</button></th>`;
    html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="3">整体</th>`;
    for (const week of weekCols) {
      html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="3">${esc(weekLabel(week))}</th>`;
    }
    html += `</tr><tr>`;
    for (let i = 0; i < span; i++) {
      const base = i * 3;
      html += sortTh("KS", "m" + base, i ? " dr-level-seg-start" : "");
      html += sortTh("AUC", "m" + (base + 1), "");
      html += sortTh("IV", "m" + (base + 2), "");
    }
    html += `</tr></thead><tbody>`;
    pack.models.forEach((model, rowIndex) => {
      const side = model.sides[pack.sideId];
      html += `<tr data-orig="${rowIndex}"><td class="dr-detail-sticky" data-sort-key="name" title="${esc(model.col)}">${esc(model.col)}</td>`;
      const cells = [side.all].concat(weekCols.map((w) => side.byWeek[w]));
      cells.forEach((met, i) => {
        const base = i * 3;
        const edge = i ? " dr-level-seg-start" : "";
        const ksScale = i ? null : overallScale.ks;
        const aucScale = i ? null : overallScale.auc;
        const ivScale = i ? null : overallScale.iv;
        html += metricTd("num" + edge, "m" + base, met && met.ks, ksScale);
        html += metricTd("num", "m" + (base + 1), met && met.auc, aucScale);
        html += metricTd("num", "m" + (base + 2), met && met.iv, ivScale);
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function rowSortValue(row, key) {
    const cell = Array.prototype.find.call(row.cells, (td) => td.getAttribute("data-sort-key") === key);
    if (!cell) return null;
    if (key === "name") return cell.textContent || "";
    const raw = cell.getAttribute("data-sort-value");
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function applyMetricSort(table, key, dir) {
    const tbody = table.tBodies[0];
    const rows = Array.prototype.slice.call(tbody.rows);
    rows.sort((a, b) => {
      if (!key) return (+a.getAttribute("data-orig")) - (+b.getAttribute("data-orig"));
      if (key === "name") {
        const cmp = String(rowSortValue(a, "name")).localeCompare(String(rowSortValue(b, "name")), "zh");
        if (cmp) return dir === "asc" ? cmp : -cmp;
      } else {
        const av = rowSortValue(a, key);
        const bv = rowSortValue(b, key);
        if (av == null && bv != null) return 1;
        if (bv == null && av != null) return -1;
        if (av != null && bv != null && av !== bv) return dir === "asc" ? av - bv : bv - av;
      }
      const nameCmp = String(rowSortValue(a, "name")).localeCompare(String(rowSortValue(b, "name")), "zh");
      if (nameCmp) return nameCmp;
      return (+a.getAttribute("data-orig")) - (+b.getAttribute("data-orig"));
    });
    rows.forEach((row) => tbody.appendChild(row));
    table.querySelectorAll(".th-sort-btn").forEach((btn) => {
      const th = btn.closest("th");
      const on = key && th && th.getAttribute("data-sort-key") === key;
      btn.textContent = btn.getAttribute("data-label") + (on ? (dir === "asc" ? " ▲" : " ▼") : "");
    });
    if (key) {
      table.setAttribute("data-sort-key", key);
      table.setAttribute("data-sort-dir", dir);
    } else {
      table.removeAttribute("data-sort-key");
      table.removeAttribute("data-sort-dir");
    }
  }

  const CUST_COLS = ["system1", "是否拒量", "final_cust_type_0807"];
  let view = null;
  let lastResult = null;
  let lastHost = null;

  function showValue(value) {
    return value == null || value === "" ? "（空）" : String(value);
  }

  function cellText(row, col) {
    const raw = RV.infra && RV.infra.rowVal ? RV.infra.rowVal(row, col) : row[col];
    return String(raw == null ? "" : raw).trim();
  }

  function ensureView(result, headers) {
    const configured = ((result && result.config && result.config.segmentCols) || []).slice();
    const cols = configured.length
      ? configured
      : CUST_COLS.filter((col) => !headers.length || headers.indexOf(col) >= 0);
    const key = cols.join("\0");
    if (!view || view.colKey !== key) {
      const prev = view && view.colState ? view.colState : {};
      const keep = Object.create(null);
      cols.forEach((col) => { if (prev[col]) keep[col] = prev[col]; });
      view = {
        segCols: cols,
        colState: keep,
        filtersOpen: view ? !!view.filtersOpen : true,
        colKey: key,
      };
    }
  }

  function colState(col) {
    if (!view.colState[col]) view.colState[col] = { values: [] };
    return view.colState[col];
  }

  function rowsInWindow(rows, result) {
    const weeks = Object.create(null);
    (result.weekPeriods || []).forEach((week) => { weeks[week] = true; });
    const timeCol = result.config && result.config.timeCol;
    const bucket = RV.domain.dailyReview && RV.domain.dailyReview.bucketTime;
    if (!timeCol || !bucket) return rows || [];
    return (rows || []).filter((row) => {
      const week = bucket(RV.infra.rowVal(row, timeCol), "week");
      return week && weeks[week];
    });
  }

  function columnValues(rows, col) {
    const seen = Object.create(null);
    const out = [];
    (rows || []).forEach((row) => {
      const value = cellText(row, col);
      if (seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    out.sort((a, b) => String(a).localeCompare(String(b), "zh"));
    return out;
  }

  function filteredRows(rows) {
    const filters = (view.segCols || []).map((col) => ({
      col: col,
      values: (colState(col).values || []).slice(),
    })).filter((item) => item.values.length);
    if (!filters.length) return rows || [];
    return (rows || []).filter((row) => filters.every((item) => item.values.indexOf(cellText(row, item.col)) >= 0));
  }

  function segSummary(rows) {
    const cols = view.segCols || [];
    if (!cols.length) return "全量";
    return cols.map((col) => {
      const picked = colState(col).values || [];
      const values = columnValues(rows, col);
      if (!picked.length || picked.length >= values.length) return col + " 全部";
      return col + " " + picked.slice(0, 2).map(showValue).join("/") + (picked.length > 2 ? " 等" : "");
    }).join(" · ");
  }

  function filterHtml(rows) {
    const open = !view || view.filtersOpen;
    const cols = (view && view.segCols) || [];
    let html = `<div class="dr-filter-band${open ? "" : " is-filters-collapsed"}" id="drTrackFilters">`;
    html += `<span class="dr-filter-band-label">筛选</span><div class="dr-filter-band-body">`;
    html += `<p class="config-muted dr-track-note">客群只筛这一章的人。全选等于不过滤。KS、AUC、IV、评级监控和等频分箱都用筛完的样本。</p>`;
    if (!cols.length) {
      html += `<div class="dr-filter-row"><span class="dr-filter-label">客群</span><span>没有可筛的客群列，按全量</span></div>`;
    } else {
      cols.forEach((col) => {
        const values = columnValues(rows, col);
        const picked = colState(col).values || [];
        const allOn = !picked.length;
        html += `<div class="dr-filter-row"><span class="dr-filter-label">${esc(col)}</span><div class="dr-chip-row">`;
        html += `<button type="button" class="dr-chip${allOn ? " active" : ""}" data-track-seg-vals="${esc(col)}">全选</button>`;
        values.forEach((value) => {
          const on = allOn || picked.indexOf(value) >= 0;
          html += `<button type="button" class="dr-chip${on ? " active" : ""}" data-track-seg-val="1" data-track-seg-col="${esc(col)}" data-track-seg-value="${esc(value)}">${esc(showValue(value))}</button>`;
        });
        html += `</div></div>`;
      });
    }
    html += `</div></div>`;
    return html;
  }

  function toggleTrackValue(rows, col, value) {
    const all = columnValues(rows, col);
    const st = colState(col);
    const base = st.values.length ? st.values.slice() : all.slice();
    const at = base.indexOf(value);
    if (at >= 0) {
      if (base.length > 1) base.splice(at, 1);
    } else {
      base.push(value);
    }
    st.values = base.length === all.length ? [] : base;
  }

  function onTrackClick(ev) {
    const headBtn = ev.target.closest("[data-track-head-toggle]");
    if (headBtn && view) {
      view.filtersOpen = !view.filtersOpen;
      const band = document.getElementById("drTrackFilters");
      if (band) band.classList.toggle("is-filters-collapsed", !view.filtersOpen);
      headBtn.textContent = view.filtersOpen ? "收起" : "筛选";
      return;
    }
    const segBtn = ev.target.closest("[data-track-seg-vals],[data-track-seg-val]");
    if (segBtn && view && lastResult && lastHost) {
      const rows = rowsInWindow(RV.app.state.rawRows || [], lastResult);
      if (segBtn.hasAttribute("data-track-seg-vals")) {
        colState(segBtn.getAttribute("data-track-seg-vals")).values = [];
      } else {
        toggleTrackValue(rows, segBtn.getAttribute("data-track-seg-col"), segBtn.getAttribute("data-track-seg-value") || "");
      }
      paintTrack();
      return;
    }
    const toggle = ev.target.closest("[data-dr-track-model-toggle]");
    if (toggle) {
      const card = toggle.closest(".dr-track-model-card");
      if (!card) return;
      const collapsed = card.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      return;
    }
    const th = ev.target.closest("#drTrackMetrics th.th-sortable");
    if (!th) return;
    const table = th.closest("table");
    if (!table) return;
    const key = th.getAttribute("data-sort-key");
    const curKey = table.getAttribute("data-sort-key");
    const curDir = table.getAttribute("data-sort-dir");
    if (curKey !== key) applyMetricSort(table, key, "desc");
    else if (curDir === "desc") applyMetricSort(table, key, "asc");
    else applyMetricSort(table, null, null);
  }

  function binTable(pack, col) {
    const spec = pack.bins[col];
    const labels = spec ? spec.labels : [];
    const weeks = pack.weeks;
    const sideCells = spec ? spec.cells[pack.sideId] : {};
    const rates = [];
    for (const week of weeks) {
      const row = sideCells[week] || {};
      for (const label of labels) {
        const cell = row[label];
        if (cell && cell.due >= 10) rates.push(cell.bad / cell.due);
      }
    }
    const scale = rates.length
      ? { min: Math.min.apply(null, rates), max: Math.max.apply(null, rates) }
      : null;
    let html = `<div class="table-interactive-wrap dr-detail-table-wrap dr-level-table-wrap"><table class="data-table dr-detail-table dr-level-table"><thead><tr>`;
    html += `<th class="dr-detail-sticky" rowspan="2">周</th>`;
    for (const label of labels) {
      html += `<th class="dr-detail-group-h dr-level-seg-h" colspan="2">${esc(label)}</th>`;
    }
    html += `</tr><tr>`;
    labels.forEach((label, i) => {
      html += `<th class="dr-detail-metric-h${i ? " dr-level-seg-start" : ""}">订单风险</th>`;
      html += `<th class="dr-detail-metric-h">到期占比</th>`;
    });
    html += `</tr></thead><tbody>`;
    const shownWeeks = weeks.filter((week) => {
      const row = sideCells[week] || {};
      return labels.some((label) => row[label] && row[label].due > 0);
    });
    if (!shownWeeks.length) return `<p class="da-results-placeholder">这一侧没有到期样本。</p>`;
    for (const week of shownWeeks) {
      const row = sideCells[week] || {};
      let dueSum = 0;
      for (const label of labels) dueSum += (row[label] && row[label].due) || 0;
      html += `<tr><td class="dr-detail-sticky">${esc(weekLabel(week))}</td>`;
      labels.forEach((label, i) => {
        const cell = row[label] || { bad: 0, due: 0 };
        const risk = cell.due > 0 ? cell.bad / cell.due : null;
        const share = dueSum > 0 ? cell.due / dueSum : null;
        const edge = i ? " dr-level-seg-start" : "";
        const style = cell.due >= 10 ? heatAttr(risk, scale) : "";
        html += `<td class="num${edge}"${style}>${esc(fmtPct(risk))}</td>`;
        html += `<td class="num">${esc(fmtPct(share))}</td>`;
      });
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  function sidePane(title, inner) {
    return `<div class="dr-level-side"><div class="dr-level-side-head"><span class="config-muted">${esc(title)}</span></div>${inner}</div>`;
  }

  function renderChapter(track) {
    const a = track.sides.a;
    const b = track.sides.b;
    const inUseN = track.inUse.length;
    const topN = track.unusedTop.length;
    const note = inUseN
      ? `在用 ${inUseN} 个，另展示合并 KS 前 ${topN} 个。`
      : `在用模型未配置，分箱为合并样本 KS 前 ${topN} 个。`;
    const open = !view || view.filtersOpen;
    const windowRows = lastResult ? rowsInWindow(RV.app.state.rawRows || [], lastResult) : [];
    let html = `<div class="dr-chapter" id="drChapterTrack">`;
    html += `<div class="dr-chapter-stick"><div class="dr-chapter-head" id="drTrackHead">`;
    html += `<div class="dr-head-bar"><h2 class="dr-chapter-title">重点数据跟踪</h2>`;
    html += `<button type="button" class="dr-chip dr-head-toggle" data-track-head-toggle="1">${open ? "收起" : "筛选"}</button></div>`;
    html += `<p class="dr-head-summary">客群 ${esc(view ? segSummary(windowRows) : "全量")}</p>`;
    html += `<p class="config-muted dr-track-note">到期样本 · 左 ${esc(a.label)} · 右 ${esc(b.label)} · 等频 ${RV.domain.modelTrack.N_BINS} 箱切点在两侧合并样本上冻结。${esc(note)}</p>`;
    html += `</div>`;
    html += view ? filterHtml(windowRows) : "";
    html += `</div>`;

    html += `<div class="dr-block" id="drTrackMetrics">`;
    html += `<div class="dr-block-head"><h2>1. 分周 KS / AUC / IV</h2></div>`;
    html += `<div class="dr-block-body"><div class="dr-level-ab-grid">`;
    html += sidePane(`左 · ${a.label}`, metricTable({ models: track.models, sideId: "a" }, track.weeks));
    html += sidePane(`右 · ${b.label}`, metricTable({ models: track.models, sideId: "b" }, track.weeks));
    html += `</div></div></div>`;

    html += `<div class="dr-block" id="drTrackGrade">`;
    html += `<div class="dr-block-head"><h2>2. 评级监控</h2></div><div class="dr-block-body">`;
    html += `<p class="config-muted dr-track-note">grade_ 列按枚举值看单变量。到期样本。订单风险 = 坏样本 / 到期样本，到期占比是该取值占当周到期样本的比例。</p>`;
    const gradeCols = track.gradeCols || [];
    if (!gradeCols.length) {
      html += `<p class="da-results-placeholder">没有 grade_ 列。</p>`;
    } else {
      gradeCols.forEach((col) => {
        const spec = track.grades && track.grades[col];
        html += `<div class="dr-admit-uni"><div class="dr-admit-uni-name">${esc(col)}</div><div class="dr-level-ab-grid">`;
        if (!spec || !spec.labels.length) {
          html += `<p class="da-results-placeholder">当前筛选下没有到期样本。</p>`;
        } else {
          html += sidePane(`左 · ${a.label}`, binTable({ bins: track.grades, weeks: track.weeks, sideId: "a" }, col));
          html += sidePane(`右 · ${b.label}`, binTable({ bins: track.grades, weeks: track.weeks, sideId: "b" }, col));
        }
        html += `</div></div>`;
      });
    }
    html += `</div></div>`;

    html += `<div class="dr-block" id="drTrackBins">`;
    html += `<div class="dr-block-head"><h2>3. 等频分箱</h2></div><div class="dr-block-body">`;
    if (!track.binCols.length) {
      html += `<p class="da-results-placeholder">没有可分箱的模型列。</p>`;
    }
    const modelByCol = Object.create(null);
    track.models.forEach((model) => { modelByCol[model.col] = model; });
    html += `<div class="dr-track-models">`;
    track.binCols.forEach((col) => {
      const model = modelByCol[col];
      const inUse = track.inUse.indexOf(col) >= 0;
      const ksAll = model ? model.ks : null;
      const ksA = model && model.sides.a.all ? model.sides.a.all.ks : null;
      const ksB = model && model.sides.b.all ? model.sides.b.all.ks : null;
      html += `<article class="dr-track-model-card is-collapsed">`;
      html += `<button type="button" class="dr-track-model-head" data-dr-track-model-toggle aria-expanded="false">`;
      html += inUse ? `<span class="dr-track-model-tag">在用</span>` : "";
      html += `<span class="dr-track-model-name">${esc(col)}</span>`;
      html += `<span class="dr-track-model-ks">`;
      html += `<span><em>整体</em><strong>${esc(fmt3(ksAll))}</strong></span>`;
      html += `<span><em>${esc(a.label)}</em><strong>${esc(fmt3(ksA))}</strong></span>`;
      html += `<span><em>${esc(b.label)}</em><strong>${esc(fmt3(ksB))}</strong></span>`;
      html += `</span>`;
      html += `<span class="dr-track-model-collapse"></span>`;
      html += `</button>`;
      html += `<div class="dr-track-model-body"><div class="dr-level-ab-grid">`;
      html += sidePane(`左 · ${a.label}`, binTable({ bins: track.bins, weeks: track.weeks, sideId: "a" }, col));
      html += sidePane(`右 · ${b.label}`, binTable({ bins: track.bins, weeks: track.weeks, sideId: "b" }, col));
      html += `</div></div></article>`;
    });
    html += `</div></div></div></div>`;
    return html;
  }

  function trackOpts(result, headers) {
    return {
      timeCol: result.config && result.config.timeCol,
      decisionCol: result.config && result.config.decisionCol,
      weekPeriods: result.weekPeriods || [],
      decisionGroups: result.decisionGroups || [],
      headers: headers,
    };
  }

  function placeTrackHtml(host, html) {
    const old = document.getElementById("drChapterTrack");
    if (old) old.remove();
    const admit = document.getElementById("drChapterAdmit");
    if (admit && host.contains(admit)) {
      admit.insertAdjacentHTML("beforebegin", html);
      return;
    }
    const limit = document.getElementById("drChapterLimit");
    if (limit && host.contains(limit)) {
      limit.insertAdjacentHTML("beforebegin", html);
      return;
    }
    host.insertAdjacentHTML("beforeend", html);
  }

  function paintTrack() {
    const host = lastHost;
    const result = lastResult;
    if (!host || !result || !view) return;
    const headers = RV.app.state.headers || [];
    const rows = filteredRows(RV.app.state.rawRows || []);
    let track = null;
    let error = "";
    try {
      track = RV.domain.modelTrack.buildModelTrack(rows, trackOpts(result, headers));
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    if (error) {
      placeTrackHtml(host, `<div class="dr-chapter" id="drChapterTrack"><div class="dr-chapter-head" id="drTrackHead"><h2 class="dr-chapter-title">重点数据跟踪</h2><p class="da-results-placeholder">${esc(error)}</p></div>${filterHtml(rowsInWindow(RV.app.state.rawRows || [], result))}</div>`);
    } else if (!track || (!track.models.length && !(track.gradeCols || []).length)) {
      placeTrackHtml(host, `<div class="dr-chapter" id="drChapterTrack"><div class="dr-chapter-head" id="drTrackHead"><div class="dr-head-bar"><h2 class="dr-chapter-title">重点数据跟踪</h2></div><p class="da-results-placeholder">没有 p1_ / p3_ / p4_ 模型列，或当前客群在窗口内没有到期样本。</p></div>${filterHtml(rowsInWindow(RV.app.state.rawRows || [], result))}</div>`);
    } else {
      placeTrackHtml(host, renderChapter(track));
    }
    const chapter = document.getElementById("drChapterTrack");
    if (chapter) chapter.addEventListener("click", onTrackClick);
    host.querySelectorAll("#drChapterTrack .dr-detail-table-wrap").forEach((wrap) => {
      syncSticky(wrap.parentElement || wrap);
    });
  }

  function mount(result, host) {
    if (!host || !result) return;
    const rows = RV.app.state.rawRows || [];
    const headers = RV.app.state.headers || [];
    const canFilter = RV.domain.modelTrack.listModelCols(headers).length > 0
      || RV.domain.modelTrack.listGradeCols(headers).length > 0;
    const saved = RV.app.state && RV.app.state.drTrackHtml;
    if (saved && !canFilter) {
      placeTrackHtml(host, saved);
      const chapter = document.getElementById("drChapterTrack");
      if (chapter) chapter.addEventListener("click", onTrackClick);
      return;
    }
    lastResult = result;
    lastHost = host;
    ensureView(result, headers);
    paintTrack();
  }

  RV.ui = RV.ui || {};
  RV.ui.modelTrack = { mount };
})(window.RV);
