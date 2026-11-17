(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const esc = RV.infra.esc;
  const formatAxisTick = RV.infra.formatAxisTick;
  const formatIntervalLabel = RV.infra.formatIntervalLabel;
  const groupShareHistograms = RV.infra.groupShareHistograms;
  const pct = RV.infra.pct;
  const svgEl = RV.infra.svgEl;
  const svgText = RV.infra.svgText;
  const chartPalette = RV.infra.chartPalette;
  const catmullRomPath = RV.infra.catmullRomPath;
  var ui = RV.ui = RV.ui || {};
  var target = ui.charts = ui.charts || {};

function renderWaterfallChart(container, steps) {
  container.innerHTML = "";
  if (!steps.length) {
    container.textContent = "无规则步骤";
    return;
  }

  const pal = chartPalette();
  const wrap = document.createElement("div");
  wrap.className = "wf-chart-wrap";
  const inner = document.createElement("div");
  inner.className = "wf-chart-inner";

  const chartBox = document.createElement("div");
  chartBox.className = "chart-box";

  const title = document.createElement("div");
  title.className = "chart-title";
  title.textContent = "瀑布命中率（柱高 = 本步命中率，纵轴为实际比例）";
  chartBox.appendChild(title);

  const n = steps.length;
  const barSlot = 64;
  const W = Math.max(420, n * barSlot + 88);
  const H = 280;
  const pad = { l: 52, r: 20, t: 28, b: 88 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxStep = Math.max(...steps.map((s) => s.stepRate || 0), 0.001);
  const yMax = Math.min(1, Math.ceil(maxStep * 20) / 20 + 0.05);
  const yTicks = [0, yMax * 0.5, yMax].map((v) => Math.round(v * 1000) / 1000);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMinYMid meet",
    role: "img",
    "aria-label": "瀑布命中率柱状图",
  });
  inner.style.minWidth = `${W}px`;

  const baseline = pad.t + innerH;
  svg.appendChild(svgEl("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: baseline, stroke: pal.axis, "stroke-width": 1 }));
  svg.appendChild(svgEl("line", { x1: pad.l, y1: baseline, x2: W - pad.r, y2: baseline, stroke: pal.axis, "stroke-width": 1 }));

  for (const yv of yTicks) {
    const py = baseline - (yv / yMax) * innerH;
    svg.appendChild(svgEl("line", { x1: pad.l - 4, y1: py, x2: pad.l, y2: py, stroke: pal.tick, "stroke-width": 1 }));
    svg.appendChild(svgEl("line", { x1: pad.l, y1: py, x2: W - pad.r, y2: py, stroke: pal.grid, "stroke-width": 1 }));
    const t = document.createElementNS(C.SVG_NS, "text");
    t.setAttribute("x", pad.l - 8);
    t.setAttribute("y", py + 3);
    t.setAttribute("text-anchor", "end");
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", pal.label);
    t.textContent = (yv * 100).toFixed(yMax <= 0.1 ? 1 : 0) + "%";
    svg.appendChild(t);
  }

  const slotW = innerW / n;
  const barW = Math.min(40, slotW * 0.62);

  steps.forEach((s, i) => {
    const rate = s.stepRate || 0;
    const h = Math.max((rate / yMax) * innerH, rate > 0 ? 2 : 0);
    const x = pad.l + i * slotW + (slotW - barW) / 2;
    const y = baseline - h;
    const color = s.kind === "hard" ? pal.hard : pal.soft;
    svg.appendChild(svgEl("rect", {
      x, y, width: barW, height: h,
      fill: color, opacity: 0.88, rx: 6,
    }));
    const pctTxt = document.createElementNS(C.SVG_NS, "text");
    pctTxt.setAttribute("x", x + barW / 2);
    pctTxt.setAttribute("y", Math.max(pad.t + 10, y - 5));
    pctTxt.setAttribute("text-anchor", "middle");
    pctTxt.setAttribute("font-size", "10");
    pctTxt.setAttribute("fill", pal.text);
    pctTxt.setAttribute("font-weight", "600");
    pctTxt.textContent = pct(rate, 1);
    svg.appendChild(pctTxt);

    const label = s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name;
    const txt = document.createElementNS(C.SVG_NS, "text");
    txt.setAttribute("x", x + barW / 2);
    txt.setAttribute("y", baseline + 12);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("font-size", "9");
    txt.setAttribute("fill", pal.label);
    txt.setAttribute("transform", `rotate(-40, ${x + barW / 2}, ${baseline + 12})`);
    txt.textContent = label;
    svg.appendChild(txt);
  });

  const yLabel = document.createElementNS(C.SVG_NS, "text");
  yLabel.setAttribute("x", 14);
  yLabel.setAttribute("y", pad.t + innerH / 2);
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.setAttribute("font-size", "10");
  yLabel.setAttribute("fill", pal.label);
  yLabel.setAttribute("transform", `rotate(-90, 14, ${pad.t + innerH / 2})`);
  yLabel.textContent = "命中率";
  svg.appendChild(yLabel);

  chartBox.appendChild(svg);
  const leg = document.createElement("div");
  leg.className = "chart-legend";
  leg.innerHTML = '<span class="leg-hard">硬规则</span><span class="leg-soft">软规则</span>';
  chartBox.appendChild(leg);

  inner.appendChild(chartBox);
  wrap.appendChild(inner);
  container.appendChild(wrap);
}
const GROUP_DIST_COLORS = [
  "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6",
  "#22d3ee", "#a3e635", "#fb923c", "#818cf8", "#2dd4bf",
  "#facc15", "#c084fc",
];
function histBinLabel(hist, i) {
  if (!hist || i == null || i < 0) return "—";
  if (hist.mode === "enum") return formatAxisTick(hist.centers[i]);
  const lo = hist.edges[i];
  const hi = hist.edges[i + 1];
  const last = i === hist.nBins - 1;
  return formatIntervalLabel(lo, hi, true, last);
}

function renderGroupDistChart(container, spec) {
  container.innerHTML = "";
  const pal = chartPalette();
  const groupCols = spec.groupCols || [];
  const groupLabel = groupCols.join(" × ");
  const titleEl = document.createElement("div");
  titleEl.className = "chart-title";
  const dirHint = spec.scoreNegated ? "（−原始分）" : "";
  titleEl.textContent = `${spec.var}${dirHint} — 分组分布（组内占比 · 重叠折线 · ${groupLabel}）`;
  container.appendChild(titleEl);

  const groups = (spec.groups || []).filter((g) => g.values?.length >= 1);
  if (!groups.length) {
    container.appendChild(document.createTextNode("无足够有效样本绘制分布（每组至少 1 个有效分数）"));
    return;
  }

  const hist = groupShareHistograms(
    groups.map((g) => g.values),
    C.HIST_BINS || 20
  );
  if (!hist || hist.mode === "empty" || !hist.nBins) {
    container.appendChild(document.createTextNode("无有效分数可绘制"));
    return;
  }

  let yMax = 1e-12;
  for (const row of hist.shares) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] > yMax) yMax = row[i];
    }
  }
  yMax = Math.min(1, Math.ceil(yMax * 20) / 20 || 0.05);
  if (yMax <= 0) yMax = 1;

  const nBins = hist.nBins;
  const W = 420;
  const H = 268;
  const pad = { l: 48, r: 14, t: 16, b: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const baseline = pad.t + innerH;
  const span = hist.max - hist.min;
  const xAt = (i) => {
    if (nBins <= 1) return pad.l + innerW / 2;
    const c = hist.centers[i];
    if (!Number.isFinite(c) || !(span > 0)) return pad.l + (i / Math.max(nBins - 1, 1)) * innerW;
    return pad.l + ((c - hist.min) / span) * innerW;
  };
  const yAt = (sh) => baseline - (sh / yMax) * innerH;

  const chartRoot = document.createElement("div");
  chartRoot.className = "dist-chart-root";

  const svg = svgEl("svg", {
    width: "100%",
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": `${spec.var} 分组分布折线（组内占比）`,
  });

  svg.appendChild(svgEl("line", {
    x1: pad.l, y1: pad.t, x2: pad.l, y2: baseline,
    stroke: pal.axis, "stroke-width": 1,
  }));
  svg.appendChild(svgEl("line", {
    x1: pad.l, y1: baseline, x2: W - pad.r, y2: baseline,
    stroke: pal.axis, "stroke-width": 1,
  }));
  for (const yv of [0, yMax / 2, yMax]) {
    const py = yAt(yv);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: py, x2: W - pad.r, y2: py,
      stroke: pal.grid, "stroke-width": 1,
    }));
    svg.appendChild(svgText(pad.l - 6, py + 3, pct(yv, yMax <= 0.1 ? 1 : 0), {
      "text-anchor": "end",
      fill: pal.label,
      "font-size": "9",
    }));
  }
  const xTicks = nBins <= 6
    ? hist.centers.map((v, i) => ({ v, i }))
    : [
        { v: hist.min, i: 0 },
        { v: (hist.min + hist.max) / 2, i: (nBins - 1) / 2 },
        { v: hist.max, i: nBins - 1 },
      ];
  for (const tk of xTicks) {
    const px = xAt(tk.i);
    svg.appendChild(svgEl("line", {
      x1: px, y1: baseline, x2: px, y2: baseline + 4,
      stroke: pal.tick, "stroke-width": 1,
    }));
    svg.appendChild(svgText(px, baseline + 16, formatAxisTick(tk.v), {
      "text-anchor": "middle",
      fill: pal.label,
      "font-size": "9",
    }));
  }
  const modeNote = hist.mode === "enum" ? "枚举（取值≤箱数）" : `等宽 ${nBins} 箱`;
  svg.appendChild(svgText(W - pad.r, H - 8, `纵轴=组内占比 · ${modeNote} · 悬停看箱明细`, {
    "text-anchor": "end",
    fill: pal.label,
    "font-size": "9",
  }));

  groups.forEach((g, gi) => {
    const color = GROUP_DIST_COLORS[gi % GROUP_DIST_COLORS.length];
    const shares = hist.shares[gi] || [];
    const segs = [];
    let cur = [];
    for (let i = 0; i < nBins; i++) {
      const sh = shares[i];
      if (sh == null || !Number.isFinite(sh)) {
        if (cur.length) { segs.push(cur); cur = []; }
        continue;
      }
      cur.push({ x: xAt(i), y: yAt(sh) });
    }
    if (cur.length) segs.push(cur);
    const d = segs.map((s) => catmullRomPath(s)).filter(Boolean).join(" ");
    if (d) {
      svg.appendChild(svgEl("path", {
        d, fill: "none", stroke: color, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
    }
    for (let i = 0; i < nBins; i++) {
      const sh = shares[i];
      if (sh == null || !Number.isFinite(sh)) continue;
      svg.appendChild(svgEl("circle", {
        cx: xAt(i), cy: yAt(sh), r: 2.4, fill: color,
      }));
    }
  });

  const guide = svgEl("line", {
    x1: pad.l, y1: pad.t, x2: pad.l, y2: baseline,
    stroke: pal.tick || pal.label, "stroke-width": 1, "stroke-dasharray": "3 3",
    opacity: 0, class: "dist-chart-guide",
  });
  svg.appendChild(guide);
  const hit = svgEl("rect", {
    x: pad.l, y: pad.t, width: Math.max(innerW, 1), height: innerH,
    fill: "transparent", class: "dist-chart-hit",
  });
  svg.appendChild(hit);

  chartRoot.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "dist-chart-tooltip";
  tip.hidden = true;
  chartRoot.appendChild(tip);
  container.appendChild(chartRoot);

  const leg = document.createElement("div");
  leg.className = "chart-legend da-group-dist-legend";
  leg.innerHTML = groups.map((g, gi) => {
    const color = GROUP_DIST_COLORS[gi % GROUP_DIST_COLORS.length];
    const n = g.n != null ? g.n : g.values.length;
    const short = g.label.length > 28 ? g.label.slice(0, 26) + "…" : g.label;
    return `<span class="da-group-dist-leg-item" title="${esc(g.label)}">`
      + `<span class="da-group-dist-swatch" style="background:${color}"></span>`
      + `${esc(short)} ${n.toLocaleString()}`
      + `</span>`;
  }).join("");
  container.appendChild(leg);

  function nearestIndex(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const xSvg = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nBins; i++) {
      const d = Math.abs(xAt(i) - xSvg);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function showTip(idx, clientX, clientY) {
    const rootRect = chartRoot.getBoundingClientRect();
    const gx = xAt(idx);
    guide.setAttribute("x1", gx);
    guide.setAttribute("x2", gx);
    guide.setAttribute("opacity", "0.85");
    let html = `<div class="dist-chart-tip-period">${esc(histBinLabel(hist, idx))}</div>`;
    groups.forEach((g, gi) => {
      const sh = hist.shares[gi]?.[idx];
      const cnt = hist.counts[gi]?.[idx];
      const n = hist.ns[gi] || 0;
      const color = GROUP_DIST_COLORS[gi % GROUP_DIST_COLORS.length];
      const name = g.label.length > 22 ? g.label.slice(0, 20) + "…" : g.label;
      const val = (sh == null || !Number.isFinite(sh))
        ? "—"
        : `${pct(sh, 2)} · ${Number(cnt || 0).toLocaleString()}/${n.toLocaleString()}`;
      html += `<div class="dist-chart-tip-row">`
        + `<span class="da-group-dist-swatch" style="background:${color}"></span>`
        + `<span class="dist-chart-tip-name">${esc(name)}</span>`
        + `<span class="dist-chart-tip-val">${esc(val)}</span>`
        + `</div>`;
    });
    tip.innerHTML = html;
    tip.hidden = false;
    const tipW = tip.offsetWidth || 160;
    const tipH = tip.offsetHeight || 60;
    let left = clientX - rootRect.left + 12;
    let top = clientY - rootRect.top - tipH - 8;
    if (left + tipW > rootRect.width - 4) left = clientX - rootRect.left - tipW - 12;
    if (top < 4) top = clientY - rootRect.top + 16;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }

  function hideTip() {
    tip.hidden = true;
    guide.setAttribute("opacity", "0");
  }

  hit.addEventListener("mousemove", (e) => {
    showTip(nearestIndex(e.clientX), e.clientX, e.clientY);
  });
  hit.addEventListener("mouseleave", hideTip);
}

/**
 * Multi-series line chart with hover tooltip.
 * @param {HTMLElement} container
 * @param {{
 *   title?: string,
 *   asPercent?: boolean,
 *   categories: string[],
 *   series: { name: string, values: (number|null)[], color?: string }[],
 *   formatValue?: (v: number|null, seriesName?: string) => string
 * }} spec
 */
function renderLineSeriesChart(container, spec) {
  container.innerHTML = "";
  const pal = chartPalette();
  const categories = spec.categories || [];
  const series = (spec.series || []).filter((s) => s && Array.isArray(s.values));
  if (!categories.length || !series.length) {
    container.appendChild(document.createTextNode("暂无趋势数据"));
    return;
  }

  const formatValue = typeof spec.formatValue === "function"
    ? spec.formatValue
    : (v) => {
      if (v == null || isNaN(v)) return "—";
      if (spec.asPercent) return (v * 100).toFixed(2) + "%";
      return formatAxisTick(v);
    };

  const titleEl = document.createElement("div");
  titleEl.className = "chart-title";
  titleEl.textContent = spec.title || "趋势";
  container.appendChild(titleEl);

  const colors = [
    pal.accent || "#60a5fa", pal.warn || "#fbbf24", "#4ade80", "#a78bfa",
    "#f472b6", "#22d3ee", "#fb923c", "#818cf8",
  ];

  const allVals = [];
  for (const s of series) {
    for (const v of s.values) {
      if (v != null && !isNaN(v)) allVals.push(v);
    }
  }
  if (!allVals.length) {
    container.appendChild(document.createTextNode("暂无有效数值"));
    return;
  }

  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  if (yMin === yMax) {
    yMin = yMin - Math.abs(yMin || 1) * 0.05;
    yMax = yMax + Math.abs(yMax || 1) * 0.05;
  }
  const padY = (yMax - yMin) * 0.08;
  yMin -= padY;
  yMax += padY;

  const n = categories.length;
  const W = Math.max(420, n * 36 + 88);
  const H = 260;
  const pad = { l: 56, r: 16, t: 20, b: 72 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const chartRoot = document.createElement("div");
  chartRoot.className = "dr-chart-root";
  chartRoot.style.position = "relative";

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMinYMid meet",
    role: "img",
    "aria-label": spec.title || "折线图",
  });
  const wrap = document.createElement("div");
  wrap.className = "chart-box dr-chart-box";
  wrap.style.overflowX = "auto";

  svg.appendChild(svgEl("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + innerH, stroke: pal.axis, "stroke-width": 1 }));
  svg.appendChild(svgEl("line", { x1: pad.l, y1: pad.t + innerH, x2: W - pad.r, y2: pad.t + innerH, stroke: pal.axis, "stroke-width": 1 }));

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  for (const yv of yTicks) {
    const py = pad.t + innerH - ((yv - yMin) / (yMax - yMin)) * innerH;
    svg.appendChild(svgEl("line", { x1: pad.l, y1: py, x2: W - pad.r, y2: py, stroke: pal.grid, "stroke-width": 1 }));
    const t = document.createElementNS(C.SVG_NS, "text");
    t.setAttribute("x", pad.l - 8);
    t.setAttribute("y", py + 3);
    t.setAttribute("text-anchor", "end");
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", pal.label);
    t.textContent = spec.asPercent ? ((yv * 100).toFixed(1) + "%") : formatAxisTick(yv);
    svg.appendChild(t);
  }

  const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const seriesColors = series.map((s, si) => s.color || colors[si % colors.length]);

  series.forEach((s, si) => {
    const color = seriesColors[si];
    let d = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v == null || isNaN(v)) {
        started = false;
        continue;
      }
      const x = xAt(i);
      const y = yAt(v);
      d += (started ? " L " : "M ") + x + " " + y;
      started = true;
      svg.appendChild(svgEl("circle", {
        cx: x, cy: y, r: 2.5, fill: color,
        class: "dr-chart-pt",
        "data-idx": String(i),
        "data-si": String(si),
      }));
    }
    if (d) {
      svg.appendChild(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": 2.2 }));
    }
  });

  categories.forEach((lab, i) => {
    const x = xAt(i);
    const txt = document.createElementNS(C.SVG_NS, "text");
    const short = lab.length > 10 ? lab.slice(0, 9) + "…" : lab;
    txt.setAttribute("x", x);
    txt.setAttribute("y", pad.t + innerH + 14);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("font-size", "9");
    txt.setAttribute("fill", pal.label);
    txt.setAttribute("transform", `rotate(-40, ${x}, ${pad.t + innerH + 14})`);
    txt.textContent = short;
    svg.appendChild(txt);
  });

  const guide = svgEl("line", {
    x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + innerH,
    stroke: pal.tick || pal.label, "stroke-width": 1, "stroke-dasharray": "3 3",
    opacity: 0, class: "dr-chart-guide",
  });
  svg.appendChild(guide);

  const hit = svgEl("rect", {
    x: pad.l, y: pad.t, width: Math.max(innerW, 1), height: innerH,
    fill: "transparent", class: "dr-chart-hit",
  });
  svg.appendChild(hit);

  wrap.appendChild(svg);
  chartRoot.appendChild(wrap);

  const tip = document.createElement("div");
  tip.className = "dr-chart-tooltip";
  tip.hidden = true;
  chartRoot.appendChild(tip);

  container.appendChild(chartRoot);

  const leg = document.createElement("div");
  leg.className = "chart-legend";
  leg.innerHTML = series.map((s, si) => {
    const color = seriesColors[si];
    return `<span class="dr-leg-item"><span class="dr-leg-swatch" style="background:${color}"></span>${esc(s.name)}</span>`;
  }).join("");
  container.appendChild(leg);

  function nearestIndex(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const xSvg = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - xSvg);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function showTip(idx, clientX, clientY) {
    const rootRect = chartRoot.getBoundingClientRect();
    guide.setAttribute("x1", xAt(idx));
    guide.setAttribute("x2", xAt(idx));
    guide.setAttribute("opacity", "0.85");

    let html = `<div class="dr-chart-tip-period">${esc(categories[idx])}</div>`;
    series.forEach((s, si) => {
      const v = s.values[idx];
      html += `<div class="dr-chart-tip-row">`
        + `<span class="dr-leg-swatch" style="background:${seriesColors[si]}"></span>`
        + `<span class="dr-chart-tip-name">${esc(s.name)}</span>`
        + `<span class="dr-chart-tip-val">${esc(formatValue(v, s.name))}</span>`
        + `</div>`;
    });
    tip.innerHTML = html;
    tip.hidden = false;

    const tipW = tip.offsetWidth || 140;
    const tipH = tip.offsetHeight || 60;
    let left = clientX - rootRect.left + 12;
    let top = clientY - rootRect.top - tipH - 8;
    if (left + tipW > rootRect.width - 4) left = clientX - rootRect.left - tipW - 12;
    if (top < 4) top = clientY - rootRect.top + 16;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }

  function hideTip() {
    tip.hidden = true;
    guide.setAttribute("opacity", "0");
  }

  hit.addEventListener("mousemove", (e) => {
    showTip(nearestIndex(e.clientX), e.clientX, e.clientY);
  });
  hit.addEventListener("mouseleave", hideTip);
}

  Object.assign(target, { renderWaterfallChart, renderGroupDistChart, renderLineSeriesChart });
})(window.RV);
