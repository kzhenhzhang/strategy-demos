const METRICS = ["fpd1","fpd7","fpd30","spd1","spd7","spd30","tpd1","tpd7","tpd30"];
const DASH = [[], [8,4], [3,3], [10,3,3,3], [1,3], [12,4,2,4], [6,2,2,2], [14,4], [2,6]];
const COLORS = ["#2563eb","#0ea5e9","#14b8a6","#16a34a","#ca8a04","#ea580c","#dc2626","#9333ea","#64748b","#db2777"];
const MONTH_W = 64;
const STAGE_MIN = 100;
const GROUP_GAP = 32;
const STAGE_GROUPS = [{name:"首期", from:0, to:2},{name:"二期", from:3, to:5},{name:"三期", from:6, to:8}];
const partners = [...new Set([...PASS.map(r => r.p), ...RISK.map(r => r.p), ...FLOW.map(r => r.p), ...RELOAN.map(r => r.p)])].sort();
const systems = [...new Set([...PASS.map(r => r.s), ...RISK.map(r => r.s), ...FLOW.map(r => r.s), ...RELOAN.map(r => r.s)])].sort();
const reloans = ["首借","复借"].filter(v => PASS.some(r => r.r === v) || RISK.some(r => r.r === v) || RELOAN.some(r => r.r === v));
const applyMonths = [...new Set([...PASS.map(r => r.am), ...RISK.map(r => r.am)])].filter(Boolean).sort();
const loanMonths = [...new Set(RISK.map(r => r.lm))].filter(Boolean).sort();
const firstMonths = [...new Set(FLOW.map(r => r.fm))].filter(Boolean).sort();
const snapMonths = [...new Set(FLOW.map(r => r.sm))].filter(Boolean).sort();
const applyCnt = {};
PASS.forEach(r => { if (!r.am) return; applyCnt[r.am] = (applyCnt[r.am] || 0) + r.a; });
function baseSelection(){
  return {
    partner:new Set(partners),
    system:new Set(systems),
    reloan:new Set(reloans),
    applyMonth:new Set(applyMonths.filter(m => (applyCnt[m] || 0) >= STAGE_MIN)),
    loanMonth:new Set(loanMonths)
  };
}
const selected = baseSelection();
selected.metric = new Set(["fpd1"]);
const stageState = {
  cnt:{selected:baseSelection(), hover:"", solo:""},
  amt:{selected:baseSelection(), hover:"", solo:""}
};
function blankQuick(){ return {applyMonth:0, loanMonth:0, firstMonth:0, snapMonth:0}; }
const quick = {top:blankQuick(), cnt:blankQuick(), amt:blankQuick(), flow:blankQuick()};
const flowSelected = {
  partner:new Set(partners),
  system:new Set(systems),
  firstMonth:new Set(firstMonths),
  snapMonth:new Set(snapMonths)
};
const lineHover = {};
function colorOf(p){ return COLORS[partners.indexOf(p) % COLORS.length]; }
function ink(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function stageColor(month){
  const i = Math.max(applyMonths.indexOf(month), 0);
  return "hsl(" + ((i * 47) % 360) + ",68%,64%)";
}
function valsOf(k){
  return k==="partner"?partners:k==="system"?systems:k==="reloan"?reloans:k==="metric"?METRICS:k==="applyMonth"?applyMonths:k==="loanMonth"?loanMonths:k==="firstMonth"?firstMonths:snapMonths;
}
function chip(k, v, on, inner){
  return `<button type="button" data-k="${k}" data-v="${v}" class="${on?"on":""}">${inner}</button>`;
}
function ops(scope, k, withRecent){
  const mark = quick[scope][k] || 0;
  const recent = withRecent ? `<button type="button" data-recent="${k}" data-n="6" class="${mark===6?"on":""}">近6个月</button><button type="button" data-recent="${k}" data-n="12" class="${mark===12?"on":""}">近12个月</button>` : "";
  return `<div class="fops">${recent}<button type="button" data-act="all" data-k="${k}">全选</button><button type="button" data-act="none" data-k="${k}">清空</button></div>`;
}
function renderFilter(rootId, sel, scope, withMetric){
  const partnerChips = partners.map(p => chip("partner", p, sel.partner.has(p), `<i style="background:${colorOf(p)}"></i>${p}`)).join("");
  const systemChips = systems.map(s => chip("system", s, sel.system.has(s), s)).join("");
  const reloanChips = reloans.map(s => chip("reloan", s, sel.reloan.has(s), s)).join("");
  const clusters = [["fpd1","fpd7","fpd30"],["spd1","spd7","spd30"],["tpd1","tpd7","tpd30"]].map(g => `<span class="cluster">${g.map(m => chip("metric", m, sel.metric && sel.metric.has(m), m)).join("")}</span>`).join("");
  const months = (k, list) => list.map(m => chip(k, m, sel[k].has(m), m)).join("");
  const row = (label, body, k, withRecent, hint) => `<div class="frow"><div class="flabel">${label}</div>${hint ? `<span class="hint">${hint}</span>` : ""}<div class="fitems">${body}</div>${ops(scope, k, withRecent)}</div>`;
  const metricRow = withMetric ? row("风险指标", `<div class="fclusters">${clusters}</div>`, "metric", false, "只影响本屏订单风险、金额风险") : "";
  document.getElementById(rootId).innerHTML = `<div class="filter">${row("partner", partnerChips, "partner", false)}${row("system", systemChips, "system", false)}${row("首借/复借", reloanChips, "reloan", false)}${metricRow}${row("进件月", months("applyMonth", applyMonths), "applyMonth", true)}${row("首借月", months("loanMonth", loanMonths), "loanMonth", true)}</div>`;
}
function renderFlowFilter(){
  const sel = flowSelected;
  const partnerChips = partners.map(p => chip("partner", p, sel.partner.has(p), `<i style="background:${colorOf(p)}"></i>${p}`)).join("");
  const systemChips = systems.map(s => chip("system", s, sel.system.has(s), s)).join("");
  const months = (k, list) => list.map(m => chip(k, m, sel[k].has(m), m)).join("");
  const row = (label, body, k, withRecent) => `<div class="frow"><div class="flabel">${label}</div><div class="fitems">${body}</div>${ops("flow", k, withRecent)}</div>`;
  document.getElementById("bar-flow").innerHTML = `<div class="filter">${row("partner", partnerChips, "partner", false)}${row("system", systemChips, "system", false)}${row("首借月", months("firstMonth", firstMonths), "firstMonth", true)}${row("自然月", months("snapMonth", snapMonths), "snapMonth", true)}</div>`;
}
function renderBars(){
  renderFilter("bar-top", selected, "top", true);
  renderFilter("bar-cnt", stageState.cnt.selected, "cnt", false);
  renderFilter("bar-amt", stageState.amt.selected, "amt", false);
  renderFlowFilter();
}
function fmt(n){ return Math.round(n).toLocaleString("en-US"); }
function money(n){
  const r = Math.round(n * 100) / 100;
  const digits = Number.isInteger(r) ? 0 : 2;
  return r.toLocaleString("en-US", {minimumFractionDigits:digits, maximumFractionDigits:2});
}
function pct(fz, fm){ return fm > 0 ? (fz/fm*100).toFixed(2)+"%" : ""; }
function aggPass(){
  const rows = PASS.filter(r => selected.partner.has(r.p) && selected.system.has(r.s) && selected.reloan.has(r.r) && selected.applyMonth.has(r.am));
  const months = [...new Set(rows.map(r => r.am))].sort();
  const usePartners = partners.filter(p => selected.partner.has(p));
  const index = Object.fromEntries(months.map((m,i) => [m,i]));
  const series = usePartners.map(p => ({name:p, color:colorOf(p), dash:[], pts:months.map(m => ({x:m, pass:0, apply:0, amt:0, loan:0}))}));
  const by = Object.fromEntries(series.map(s => [s.name, s]));
  rows.forEach(row => {
    const pt = by[row.p].pts[index[row.am]];
    pt.pass += row.n;
    pt.apply += row.a;
    pt.amt += row.m;
    pt.loan += row.l || 0;
  });
  return {months, series};
}
function aggReloan(){
  const rows = RELOAN.filter(r => selected.partner.has(r.p) && selected.system.has(r.s) && selected.reloan.has(r.r));
  const months = [...new Set(rows.map(r => r.sm))].sort();
  const usePartners = partners.filter(p => selected.partner.has(p));
  const index = Object.fromEntries(months.map((m,i) => [m,i]));
  const series = usePartners.map(p => ({name:p, color:colorOf(p), dash:[], pts:months.map(m => ({x:m, settle:0, next:0}))}));
  const by = Object.fromEntries(series.map(s => [s.name, s]));
  rows.forEach(row => {
    const pt = by[row.p].pts[index[row.sm]];
    pt.settle += row.c;
    pt.next += row.n;
  });
  return {months, series};
}
function aggRisk(kind){
  const metrics = METRICS.filter(m => selected.metric.has(m));
  const rows = RISK.filter(r => selected.partner.has(r.p) && selected.system.has(r.s) && selected.reloan.has(r.r) && selected.applyMonth.has(r.am) && selected.loanMonth.has(r.lm));
  const months = [...new Set(rows.map(r => r.lm))].sort();
  const usePartners = partners.filter(p => selected.partner.has(p));
  const index = Object.fromEntries(months.map((m,i) => [m,i]));
  const series = [];
  usePartners.forEach(p => {
    metrics.forEach((metric, mi) => {
      series.push({name:p+"-"+metric, color:colorOf(p), dash:DASH[mi % DASH.length], pts:months.map(m => ({x:m, fm:0, fz:0}))});
    });
  });
  const by = Object.fromEntries(series.map(s => [s.name, s]));
  const off = kind === "amt" ? 2 : 0;
  rows.forEach(row => {
    metrics.forEach(metric => {
      const pt = by[row.p+"-"+metric].pts[index[row.lm]];
      const v = row[metric];
      pt.fm += v[off];
      pt.fz += v[off+1];
    });
  });
  return {months, series, metrics, usePartners};
}
function aggStage(kind){
  const sel = stageState[kind].selected;
  const rows = RISK.filter(r => sel.partner.has(r.p) && sel.system.has(r.s) && sel.reloan.has(r.r) && sel.applyMonth.has(r.am) && sel.loanMonth.has(r.lm));
  const months = [...new Set(rows.map(r => r.am))].filter(Boolean).sort();
  const off = 2;
  const index = Object.fromEntries(METRICS.map((m,i) => [m, i]));
  const cntFm = Object.fromEntries(months.map(m => [m, 0]));
  const series = months.map(m => ({name:m, color:stageColor(m), dash:[], pts:METRICS.map(metric => ({x:metric, fm:0, fz:0}))}));
  const by = Object.fromEntries(series.map(s => [s.name, s]));
  rows.forEach(row => {
    const s = by[row.am];
    if (!s) return;
    cntFm[row.am] += row.fpd1[0];
    METRICS.forEach(metric => {
      const pt = s.pts[index[metric]];
      const v = row[metric];
      pt.fm += v[off];
      pt.fz += v[off + 1];
    });
  });
  return {months:METRICS, series:series.filter(s => cntFm[s.name] >= STAGE_MIN)};
}
function renderStageLegend(id, series, st){
  const el = document.getElementById(id);
  const key = series.map(s => s.name + "@" + s.color).join("|");
  if (el.dataset.key !== key){
    el.dataset.key = key;
    el.innerHTML = series.map(s => `<button type="button" data-legend="${s.name}"><i style="background:${s.color}"></i>${s.name}</button>`).join("");
  }
  el.querySelectorAll("button[data-legend]").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.legend === st.solo);
    btn.classList.toggle("hot", btn.dataset.legend === st.hover);
  });
}
function plotSize(canvas){
  const plot = canvas.parentElement;
  return {w:Math.max(160, plot.clientWidth), h:Math.max(120, plot.clientHeight)};
}
function prepCanvas(canvas, w, h){
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  return ctx;
}
function yExtent(values){
  const nums = values.filter(v => isFinite(v));
  if (!nums.length) return {ymin:0, ymax:1};
  let ymin = Math.min.apply(null, nums);
  let ymax = Math.max.apply(null, nums);
  if (ymax === ymin){
    const bump = Math.abs(ymax) * 0.08 || 0.01;
    return {ymin:ymin - bump, ymax:ymax + bump};
  }
  const pad = (ymax - ymin) * 0.12;
  return {ymin:ymin - pad, ymax:ymax + pad};
}
function stageVals(stage){
  const vals = [];
  stage.series.forEach(s => s.pts.forEach(p => { if (p.fm > 0) vals.push(p.fz / p.fm); }));
  return vals;
}
function placeEndLabels(items, top, bottom){
  const gap = 13;
  const rows = items.map(it => Object.assign({}, it, {labelY:it.y}));
  rows.sort((a,b) => a.labelY - b.labelY || (a.text < b.text ? -1 : 1));
  for (let i = 1; i < rows.length; i++){
    if (rows[i].labelY < rows[i - 1].labelY + gap) rows[i].labelY = rows[i - 1].labelY + gap;
  }
  if (rows.length && rows[rows.length - 1].labelY > bottom){
    const shift = rows[rows.length - 1].labelY - bottom;
    rows.forEach(it => { it.labelY -= shift; });
  }
  if (rows.length && rows[0].labelY < top){
    const shift = top - rows[0].labelY;
    rows.forEach(it => { it.labelY += shift; });
  }
  rows.forEach(it => { it.labelY = Math.max(top, Math.min(bottom, it.labelY)); });
  return rows;
}
function drawEndLabels(ctx, labels, top, bottom, w){
  const placed = placeEndLabels(labels, top, bottom);
  const paint = lb => {
    ctx.globalAlpha = lb.hot ? 1 : 0.16;
    ctx.fillStyle = lb.color;
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(lb.text).width;
    ctx.textAlign = "left";
    let x = lb.x + 8;
    if (x + tw > w - 4){
      ctx.textAlign = "right";
      x = lb.x - 8;
    }
    ctx.fillText(lb.text, x, lb.labelY);
  };
  placed.filter(lb => !lb.hot).forEach(paint);
  placed.filter(lb => lb.hot).forEach(paint);
  ctx.globalAlpha = 1;
}
function drawAxis(ctx, pad, w, ymin, ymax, yAt, yLabel){
  ctx.strokeStyle = ink("--chart-grid");
  ctx.fillStyle = ink("--chart-label");
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let g = 0; g <= 4; g++){
    const v = ymin + (ymax - ymin) * g / 4;
    const y = yAt(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(yLabel(v), pad.l - 6, y);
  }
}
function drawStage(canvas, empty, months, series, ready, valueOf, yLabel, hitOf, hoverName, extent){
  const size = plotSize(canvas);
  const h = size.h;
  const pad = {l:56, r:68, t:8, b:40};
  const w = size.w;
  const ctx = prepCanvas(canvas, w, h);
  const pts = [];
  series.forEach(s => s.pts.forEach((p,i) => { if (ready(p)) pts.push({s, p, i}); }));
  if (!months.length || !pts.length){
    empty.hidden = false;
    canvas._hit = null;
    return;
  }
  empty.hidden = true;
  const ih = h - pad.t - pad.b;
  const ext = extent || yExtent(pts.map(o => valueOf(o.p)));
  const ymin = ext.ymin, ymax = ext.ymax;
  const span = ymax - ymin || 1;
  const inner = Math.max(w - pad.l - pad.r, 9);
  const gap = Math.min(GROUP_GAP, inner * 0.06);
  const slot = (inner - (STAGE_GROUPS.length - 1) * gap) / Math.max(months.length, 1);
  const xAt = i => pad.l + slot * (i + 0.5) + (i >= 6 ? 2 : i >= 3 ? 1 : 0) * gap;
  const yAt = v => pad.t + ih - ((v - ymin) / span) * ih;
  drawAxis(ctx, pad, w, ymin, ymax, yAt, yLabel);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = ink("--chart-label");
  ctx.font = "11px sans-serif";
  months.forEach((m,i) => ctx.fillText(m, xAt(i), pad.t + ih + 6));
  ctx.fillStyle = ink("--chart-axis");
  STAGE_GROUPS.forEach(g => ctx.fillText(g.name, (xAt(g.from) + xAt(g.to)) / 2, pad.t + ih + 24));
  const hover = series.some(s => s.name === hoverName) ? hoverName : "";
  const ordered = !hover ? series : series.filter(s => s.name !== hover).concat(series.filter(s => s.name === hover));
  const hit = [];
  const labels = [];
  ordered.forEach(s => {
    const hot = !hover || s.name === hover;
    ctx.globalAlpha = hot ? 1 : 0.16;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = hot && hover ? 3 : 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false;
    let last = null;
    s.pts.forEach((p,i) => {
      if (!ready(p)) { started = false; return; }
      const x = xAt(i), y = yAt(valueOf(p));
      if (!started){ ctx.moveTo(x,y); started = true; } else ctx.lineTo(x,y);
      last = {x, y};
    });
    ctx.stroke();
    ctx.setLineDash([]);
    s.pts.forEach((p,i) => {
      if (!ready(p)) return;
      const x = xAt(i), y = yAt(valueOf(p));
      ctx.beginPath(); ctx.arc(x, y, hot && hover ? 4.5 : 3.2, 0, Math.PI * 2); ctx.fill();
      hit.push(Object.assign({x, y, name:s.name, month:p.x}, hitOf(p)));
    });
    if (last) labels.push({x:last.x, y:last.y, text:s.name, hot, color:s.color});
  });
  drawEndLabels(ctx, labels, pad.t + 6, pad.t + ih - 6, w);
  canvas._hit = hit;
}
function drawOne(canvas, empty, months, series, ready, valueOf, yLabel, hitOf, hoverName){
  const size = plotSize(canvas);
  const h = size.h;
  const w = size.w;
  const pad = {l:58, r:76, t:6, b:52};
  const ctx = prepCanvas(canvas, w, h);
  const pts = [];
  series.forEach(s => s.pts.forEach((p,i) => { if (ready(p)) pts.push({s, p, i}); }));
  if (!months.length || !pts.length){
    empty.hidden = false;
    canvas._hit = null;
    return;
  }
  empty.hidden = true;
  const ih = h - pad.t - pad.b;
  const ext = yExtent(pts.map(o => valueOf(o.p)));
  const ymin = ext.ymin, ymax = ext.ymax;
  const span = ymax - ymin || 1;
  const slotW = (w - pad.l - pad.r) / Math.max(months.length, 1);
  const xAt = i => pad.l + slotW * (i + 0.5);
  const yAt = v => pad.t + ih - ((v - ymin) / span) * ih;
  drawAxis(ctx, pad, w, ymin, ymax, yAt, yLabel);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "10px sans-serif";
  ctx.fillStyle = ink("--chart-label");
  months.forEach((m,i) => {
    ctx.save();
    ctx.translate(xAt(i), pad.t + ih + 4);
    ctx.rotate(Math.PI / 4);
    ctx.fillText(m, 0, 0);
    ctx.restore();
  });
  const hover = series.some(s => s.name === hoverName) ? hoverName : "";
  const ordered = !hover ? series : series.filter(s => s.name !== hover).concat(series.filter(s => s.name === hover));
  const hit = [];
  const labels = [];
  ordered.forEach(s => {
    const hot = !hover || s.name === hover;
    ctx.globalAlpha = hot ? 1 : 0.16;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = hot && hover ? 3 : 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false;
    let last = null;
    s.pts.forEach((p,i) => {
      if (!ready(p)) { started = false; return; }
      const x = xAt(i), y = yAt(valueOf(p));
      if (!started){ ctx.moveTo(x,y); started = true; } else ctx.lineTo(x,y);
      last = {x, y};
    });
    ctx.stroke();
    ctx.setLineDash([]);
    s.pts.forEach((p,i) => {
      if (!ready(p)) return;
      const x = xAt(i), y = yAt(valueOf(p));
      ctx.beginPath(); ctx.arc(x,y, hot && hover ? 4.5 : 3.2, 0, Math.PI*2); ctx.fill();
      hit.push(Object.assign({x,y,name:s.name,month:p.x}, hitOf(p)));
    });
    if (last) labels.push({x:last.x, y:last.y, text:s.name, hot, color:s.color});
  });
  drawEndLabels(ctx, labels, pad.t + 6, pad.t + ih - 6, w);
  canvas._hit = hit;
}
function aggFlow(){
  const rows = FLOW.filter(r => flowSelected.partner.has(r.p) && flowSelected.system.has(r.s) && flowSelected.firstMonth.has(r.fm) && flowSelected.snapMonth.has(r.sm));
  const fms = [...new Set(rows.map(r => r.fm))].sort();
  const sms = [...new Set(rows.map(r => r.sm))].sort();
  const map = {};
  rows.forEach(r => {
    const key = r.fm + "\t" + r.sm;
    if (!map[key]) map[key] = {u:0, o:0, a:0, nc:0, na:0, od:0, st:0};
    map[key].u += r.u;
    map[key].o += r.o;
    map[key].a += r.a;
    map[key].nc += r.nc || 0;
    map[key].na += r.na || 0;
    map[key].od += r.od || 0;
    map[key].st += r.st || 0;
  });
  return {fms, sms, map};
}
function heatColor(t){
  const a = [222, 235, 247], b = [8, 81, 156];
  const c = a.map((x,i) => Math.round(x + (b[i] - x) * t));
  return "rgb(" + c.join(",") + ")";
}
function heatCell(v, min, max, text){
  if (v == null || text === "") return "<td></td>";
  const t = max > min ? (v - min) / (max - min) : 0.5;
  const hot = t >= 0.65 ? " hot" : "";
  return `<td class="${hot}" style="background:${heatColor(t)}">${text}</td>`;
}
function renderHeatTable(id, agg, valueOf, formatOf){
  const nums = [];
  agg.fms.forEach(fm => {
    agg.sms.forEach(sm => {
      const box = agg.map[fm + "\t" + sm];
      if (!box || !(box.u > 0)) return;
      const v = valueOf(box);
      if (v != null && isFinite(v)) nums.push(v);
    });
  });
  const min = nums.length ? Math.min.apply(null, nums) : 0;
  const max = nums.length ? Math.max.apply(null, nums) : 0;
  const head = ["<tr><th>首借月</th>"].concat(agg.sms.map(sm => "<th>" + sm + "</th>")).join("") + "</tr>";
  const body = agg.fms.map(fm => {
    const cells = ["<td>" + fm + "</td>"];
    agg.sms.forEach(sm => {
      const box = agg.map[fm + "\t" + sm];
      if (!box || !(box.u > 0)){
        cells.push("<td></td>");
        return;
      }
      const v = valueOf(box);
      cells.push(heatCell(v, min, max, v == null ? "" : formatOf(v, box)));
    });
    return "<tr>" + cells.join("") + "</tr>";
  }).join("");
  document.getElementById(id).innerHTML = head + body;
}
function renderFlowTables(){
  const agg = aggFlow();
  const rate = (n, box) => box.u > 0 ? n / box.u : null;
  renderHeatTable("tblFlowKeep", agg, box => rate(box.o, box), v => (v * 100).toFixed(2) + "%");
  renderHeatTable("tblFlowOd", agg, box => rate(box.od, box), v => (v * 100).toFixed(2) + "%");
  renderHeatTable("tblFlowSettle", agg, box => rate(box.st, box), v => (v * 100).toFixed(2) + "%");
  renderHeatTable("tblFlowAmt", agg, box => box.a, (v, box) => money(v));
  renderHeatTable("tblFlowAvgCnt", agg, box => box.u > 0 ? box.nc / box.u : null, v => v.toFixed(2));
  renderHeatTable("tblFlowAvgAmt", agg, box => box.u > 0 ? box.na / box.u : null, v => money(v));
}
function paintCharts(){
  const pass = aggPass();
  const pct1 = v => (v * 100).toFixed(1) + "%";
  drawOne(document.getElementById("cvPass"), document.getElementById("emptyPass"), pass.months, pass.series, p => p.apply > 0, p => p.pass / p.apply, pct1, p => ({kind:"pass", pass:p.pass, apply:p.apply}), lineHover.cvPass || "");
  drawOne(document.getElementById("cvUse"), document.getElementById("emptyUse"), pass.months, pass.series, p => p.pass > 0, p => p.loan / p.pass, pct1, p => ({kind:"use", loan:p.loan, pass:p.pass}), lineHover.cvUse || "");
  drawOne(document.getElementById("cvAvg"), document.getElementById("emptyAvg"), pass.months, pass.series, p => p.pass > 0, p => p.amt / p.pass, v => money(v), p => ({kind:"avg", amt:p.amt, pass:p.pass}), lineHover.cvAvg || "");
  const reloan = aggReloan();
  drawOne(document.getElementById("cvReloan"), document.getElementById("emptyReloan"), reloan.months, reloan.series, p => p.settle > 0, p => p.next / p.settle, pct1, p => ({kind:"reloan", next:p.next, settle:p.settle}), lineHover.cvReloan || "");
  const cnt = aggRisk("cnt");
  const amt = aggRisk("amt");
  drawOne(document.getElementById("cvCnt"), document.getElementById("emptyCnt"), cnt.months, cnt.series, p => p.fm > 0, p => p.fz / p.fm, pct1, p => ({kind:"risk", fz:p.fz, fm:p.fm}), lineHover.cvCnt || "");
  drawOne(document.getElementById("cvAmt"), document.getElementById("emptyAmt"), amt.months, amt.series, p => p.fm > 0, p => p.fz / p.fm, pct1, p => ({kind:"risk", fz:p.fz, fm:p.fm}), lineHover.cvAmt || "");
  const stagePair = {cnt:aggStage("cnt"), amt:aggStage("amt")};
  const stageExt = yExtent(stageVals(stagePair.cnt).concat(stageVals(stagePair.amt)));
  [["cnt","legendCnt","cvStageCnt","emptyStageCnt"],["amt","legendAmt","cvStageAmt","emptyStageAmt"]].forEach(row => {
    const st = stageState[row[0]];
    const stage = stagePair[row[0]];
    if (st.solo && !stage.series.some(s => s.name === st.solo)) st.solo = "";
    const shown = st.solo ? stage.series.filter(s => s.name === st.solo) : stage.series;
    renderStageLegend(row[1], stage.series, st);
    drawStage(document.getElementById(row[2]), document.getElementById(row[3]), stage.months, shown, p => p.fm > 0, p => p.fz / p.fm, pct1, p => ({kind:"stageAmt", fz:p.fz, fm:p.fm}), st.hover, stageExt);
  });
  return {pass, cnt, reloan};
}
function drawCharts(){
  paintCharts();
  renderFlowTables();
}
function draw(){
  renderBars();
  drawCharts();
}
function showTip(ev, canvas){
  let tipEl = document.getElementById("tip");
  if (!tipEl){
    tipEl = document.createElement("div");
    tipEl.id = "tip";
    document.body.appendChild(tipEl);
  }
  const hit = canvas._hit || [];
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  let best = null, bd = 14;
  hit.forEach(p => { const d = Math.hypot(p.x-x, p.y-y); if (d < bd){ bd = d; best = p; } });
  if (!best){ tipEl.style.display = "none"; return null; }
  tipEl.style.display = "block";
  tipEl.style.left = (ev.clientX+12)+"px";
  tipEl.style.top = (ev.clientY+12)+"px";
  if (best.kind === "pass") tipEl.innerHTML = `${best.month} ${best.name}<br>${(best.pass/best.apply*100).toFixed(2)}%<br>通过量 ${fmt(best.pass)} / 进件量 ${fmt(best.apply)}`;
  else if (best.kind === "use") tipEl.innerHTML = `${best.month} ${best.name}<br>${(best.loan/best.pass*100).toFixed(2)}%<br>放款件 ${fmt(best.loan)} / 通过件 ${fmt(best.pass)}`;
  else if (best.kind === "avg") tipEl.innerHTML = `${best.month} ${best.name}<br>${money(best.amt/best.pass)}<br>通过金额 ${money(best.amt)} / 通过量 ${fmt(best.pass)}`;
  else if (best.kind === "reloan") tipEl.innerHTML = `${best.month} ${best.name}<br>${(best.next/best.settle*100).toFixed(2)}%<br>下一笔放款 ${fmt(best.next)} / 结清 ${fmt(best.settle)}`;
  else if (best.kind === "stageAmt") tipEl.innerHTML = `${best.name} ${best.month}<br>${(best.fz/best.fm*100).toFixed(2)}%<br>${money(best.fz)} / ${money(best.fm)}`;
  else tipEl.innerHTML = `${best.month} ${best.name}<br>${(best.fz/best.fm*100).toFixed(2)}%<br>${fmt(best.fz)} / ${fmt(best.fm)}`;
  return best;
}
function scopeOf(el){
  const host = el.closest("[data-side]");
  return host ? host.dataset.side : "top";
}
function selOf(el){
  const scope = scopeOf(el);
  if (scope === "top") return selected;
  if (scope === "flow") return flowSelected;
  return stageState[scope].selected;
}
function clearMonthQuick(el, k){
  if (k !== "applyMonth" && k !== "loanMonth" && k !== "firstMonth" && k !== "snapMonth") return;
  quick[scopeOf(el)][k] = 0;
}
function clearSideSolo(el, k){
  const host = el.closest("[data-side]");
  if (!host || k !== "applyMonth") return;
  const st = stageState[host.dataset.side];
  if (st) st.solo = "";
}
document.body.addEventListener("click", ev => {
  const legendBtn = ev.target.closest("button[data-legend]");
  if (legendBtn){
    const side = legendBtn.closest("[data-side]").dataset.side;
    const st = stageState[side];
    st.solo = st.solo === legendBtn.dataset.legend ? "" : legendBtn.dataset.legend;
    paintCharts();
    return;
  }
  const recent = ev.target.closest("button[data-recent]");
  if (recent){
    const sel = selOf(recent);
    const k = recent.dataset.recent;
    const n = Number(recent.dataset.n);
    sel[k] = new Set(valsOf(k).slice(Math.max(0, valsOf(k).length - n)));
    quick[scopeOf(recent)][k] = n;
    clearSideSolo(recent, k);
    draw();
    return;
  }
  const act = ev.target.closest("button[data-act]");
  if (act){
    const sel = selOf(act);
    const k = act.dataset.k;
    sel[k] = act.dataset.act === "all" ? new Set(valsOf(k)) : new Set();
    clearMonthQuick(act, k);
    clearSideSolo(act, k);
    draw();
    return;
  }
  const chipBtn = ev.target.closest("button[data-v]");
  if (chipBtn){
    const sel = selOf(chipBtn);
    const k = chipBtn.dataset.k, v = chipBtn.dataset.v;
    if (sel[k].has(v)) sel[k].delete(v); else sel[k].add(v);
    clearMonthQuick(chipBtn, k);
    clearSideSolo(chipBtn, k);
    draw();
  }
});
function bindLegend(id){
  const el = document.getElementById(id);
  el.addEventListener("mouseover", ev => {
    const side = el.closest("[data-side]").dataset.side;
    const btn = ev.target.closest("button[data-legend]");
    const name = btn ? btn.dataset.legend : "";
    if (stageState[side].hover === name) return;
    stageState[side].hover = name;
    paintCharts();
  });
  el.addEventListener("mouseleave", () => {
    const side = el.closest("[data-side]").dataset.side;
    if (!stageState[side].hover) return;
    stageState[side].hover = "";
    paintCharts();
  });
}
bindLegend("legendCnt");
bindLegend("legendAmt");
function bindCanvas(id){
  const el = document.getElementById(id);
  const sideHost = el.closest("[data-side]");
  el.addEventListener("mousemove", ev => {
    const best = showTip(ev, el);
    if (!best) return;
    if (sideHost && stageState[sideHost.dataset.side]){
      const st = stageState[sideHost.dataset.side];
      if (st.hover === best.name) return;
      st.hover = best.name;
      paintCharts();
      return;
    }
    if ((lineHover[id] || "") === best.name) return;
    lineHover[id] = best.name;
    paintCharts();
  });
  el.addEventListener("mouseleave", () => {
    const t = document.getElementById("tip");
    if (t) t.style.display = "none";
    if (sideHost && stageState[sideHost.dataset.side]){
      const st = stageState[sideHost.dataset.side];
      if (!st.hover) return;
      st.hover = "";
      paintCharts();
      return;
    }
    if (!lineHover[id]) return;
    lineHover[id] = "";
    paintCharts();
  });
}
["cvPass","cvUse","cvAvg","cvReloan","cvCnt","cvAmt","cvStageCnt","cvStageAmt"].forEach(bindCanvas);
document.getElementById("foldBtn").addEventListener("click", () => {
  const screen = document.querySelector(".screen");
  const folded = screen.classList.toggle("folded");
  document.getElementById("foldBtn").textContent = folded ? "展开筛选" : "收起筛选";
  Object.keys(lineHover).forEach(k => { lineHover[k] = ""; });
  stageState.cnt.hover = "";
  stageState.amt.hover = "";
  requestAnimationFrame(() => requestAnimationFrame(paintCharts));
});
window.addEventListener("resize", paintCharts);
(function(){
  const toc = document.getElementById("toc");
  const links = Array.from(toc.querySelectorAll("a"));
  function markToc(){
    let cur = "part-trend";
    links.forEach(a => {
      const el = document.getElementById(a.dataset.part);
      if (el && el.getBoundingClientRect().top <= 80) cur = a.dataset.part;
    });
    links.forEach(a => a.classList.toggle("on", a.dataset.part === cur));
  }
  const tocHome = document.querySelector(".head-actions");
  function placeToc(){
    const rect = document.querySelector(".head-row").getBoundingClientRect();
    const floated = rect.bottom < 4;
    toc.classList.toggle("float", floated);
    if (floated){
      if (toc.parentElement !== document.body) document.body.appendChild(toc);
    } else if (toc.parentElement !== tocHome){
      tocHome.insertBefore(toc, tocHome.firstChild);
    }
    markToc();
  }
  window.addEventListener("scroll", placeToc, {passive:true});
  placeToc();
})();
renderBars();
drawCharts();
requestAnimationFrame(paintCharts);
