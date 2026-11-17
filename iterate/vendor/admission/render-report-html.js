/**
 * Shared admission report HTML renderer (browser + Node).
 * Pure: buildReportHtml(reportJson, themeCss) → standalone HTML string.
 * No fs / argv. Source of truth for skill CLI and admission-iteration-app.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  // Always expose on global for browser + Node eval harnesses
  if (root) root.AdmissionRenderReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function buildReportHtml(j, themeCss) {
    if (!j || typeof j !== "object") throw new Error("buildReportHtml: report required");
    themeCss = themeCss || "";
    const reportTitle = String(j.title || "").trim() || "迭代准入策略报告";

const pct = (x) => (x == null || Number.isNaN(x) ? "—" : (x * 100).toFixed(2) + "%");
const pp = (x) => (x == null || Number.isNaN(x) ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + " pp");
const rel = (a, t) => (t ? Math.abs(a - t) / t : NaN);
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const fmt3 = (x) => (x == null || !Number.isFinite(x) ? "—" : Number(x).toFixed(3));
const fmtInt = (x) => (x == null || !Number.isFinite(Number(x)) ? "—" : String(Math.round(Number(x))));

const riskB = j.statusQuo.riskB;
const passB = j.statusQuo.passB;
const riskA = j.statusQuo.riskA;
const passA = j.statusQuo.passA;
const tRisk = j.targets.risk;
const tPass = j.targets.pass;
const riskGap = riskB.rate - tRisk;
const passGap = passB.rate - tPass;
const rp = j.riskPlan;
const ppPlan = j.passPlan;
const cands = j.candidates || [];
const riskPlanRules = rp.rules || [];
const passPlanRules = ppPlan.rules || [];
const auxBandPct =
  (j.targets?.auxBand != null
    ? j.targets.auxBand
    : j.gateOverrides?.auxBand != null
      ? j.gateOverrides.auxBand
      : 0.05) * 100;
const riskPlanOk = rp.risk?.rate != null && rp.risk.rate <= tRisk;
const riskPlanPassDev = rel(rp.pass?.rate, tPass) * 100;
const passPlanOk = ppPlan.pass?.rate != null && ppPlan.pass.rate >= tPass;
function riskOvershootPct(rate) {
  if (rate == null || tRisk == null || !Number.isFinite(rate) || !(tRisk > 0)) return NaN;
  if (rate <= tRisk) return 0;
  return ((rate - tRisk) / tRisk) * 100;
}
const passPlanRiskDev = riskOvershootPct(ppPlan.risk?.rate);
const riskPlanRiskDev = riskOvershootPct(rp.risk?.rate);
const passPlanPassDev = rel(ppPlan.pass?.rate, tPass) * 100;
// 现状辅约束（无增量时）
const statusRiskRel = rel(riskB.rate, tRisk) * 100;

function planLamp(riskRate, passRate) {
  const rDev = riskOvershootPct(riskRate);
  const pDev = rel(passRate, tPass) * 100;
  if (!Number.isFinite(rDev) || !Number.isFinite(pDev)) return "bad";
  if (rDev >= auxBandPct || pDev >= auxBandPct) return "bad";
  return "good";
}
function riskLamp() {
  return planLamp(rp.risk?.rate, rp.pass?.rate);
}
function passLamp() {
  return planLamp(ppPlan.risk?.rate, ppPlan.pass?.rate);
}
const lampLabel = { good: "绿灯", warn: "黄灯", bad: "红灯" };
const rLamp = riskLamp();
const pLamp = passLamp();
const gateNote = j.gateOverrides?.note || "命中≥30";
const gateBullets = (() => {
  if (Array.isArray(j.gateOverrides?.bullets) && j.gateOverrides.bullets.length) {
    return j.gateOverrides.bullets;
  }
  return String(gateNote)
    .split("；")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((detail, i) => ({
      id: `legacy_${i}`,
      label: detail.length > 18 ? `${detail.slice(0, 16)}…` : detail,
      detail,
    }));
})();
const liftChip =
  j.gateOverrides?.minLift > 0
    ? `Lift≥${j.gateOverrides.minLift}`
    : "Lift不限制";
const mineGateExtraChips = [
  `fpd1>${((j.gateOverrides?.minAbsRisk ?? 0.35) * 100).toFixed(0)}%`,
  liftChip,
];
const hasPlansDualOk = j.plansDualOk && typeof j.plansDualOk === "object";
const plansDualOk = {
  known: hasPlansDualOk,
  risk: !!(hasPlansDualOk && j.plansDualOk.risk),
  pass: !!(hasPlansDualOk && j.plansDualOk.pass),
};
const missDual = hasPlansDualOk && (!plansDualOk.risk || !plansDualOk.pass);
const residualRows = Array.isArray(j.residualNotAdopted) ? j.residualNotAdopted : [];

function crossMinePairHtml(j) {
  const cm = j.crossMine;
  if (!cm || cm.mode !== "cross") return "";
  const used = cm.used;
  const pairTxt = used
    ? `${used.a} × ${used.b}（|r|=${fmt3(used.absR)}）`
    : "（无可用对）";
  const tried = (cm.pairs || [])
    .map((p) => `${p.a}×${p.b} |r|=${fmt3(p.absR)}`)
    .join(" → ");
  return `<div>交叉配对<br><b>${esc(pairTxt)}</b>${
    tried ? `<div class="sub muted">候选序 ${esc(tried)}</div>` : ""
  }</div>`;
}

function gateChipsHtml(bullets, extraLabels) {
  const labels = [
    ...(bullets || []).map((b) => b.label),
    ...(extraLabels || []),
  ];
  return labels
    .map((lab) => `<span class="rv-chip rv-chip-muted">${esc(lab)}</span>`)
    .join("");
}

function gateDetailsHtml(bullets, summary) {
  const items = (bullets || [])
    .map(
      (b) => `<li>
      <span class="gate-bullet-label">${esc(b.label)}</span>
      <span class="gate-bullet-detail">${esc(b.detail)}</span>
    </li>`
    )
    .join("");
  return `<details class="gate-details">
    <summary>${esc(summary || "门禁与口径细则")}</summary>
    <ul class="gate-bullet-list">${items}</ul>
  </details>`;
}

function decisionListHtml(items) {
  return `<ul class="decision-list">${items
    .map((it) => {
      if (typeof it === "string") return `<li>${it}</li>`;
      return `<li><span class="k">${esc(it.k)}</span>${it.v}</li>`;
    })
    .join("")}</ul>`;
}

/** 现状 · A/B 组分月风险表（训练贷后窗） */
function statusRiskByMonthHtml() {
  const byB = j.statusQuo?.riskByMonthB || [];
  const byA = j.statusQuo?.riskByMonthA || [];
  if (!byB.length && !byA.length) {
    return `<p class="muted">（无分月风险；请重跑报告）</p>`;
  }
  const mapB = Object.fromEntries(byB.map((x) => [x.month, x]));
  const mapA = Object.fromEntries(byA.map((x) => [x.month, x]));
  const monthKeys = [...new Set([...byB.map((x) => x.month), ...byA.map((x) => x.month)])].sort();
  const rates = [...byB, ...byA].map((x) => x.rate).filter((v) => v != null && Number.isFinite(v));
  const scale = rates.length
    ? { min: Math.min(...rates), max: Math.max(...rates) }
    : { min: 0, max: 0 };
  const rows = monthKeys
    .map((m) => {
      const b = mapB[m];
      const a = mapA[m];
      const bHeat = b?.rate != null ? rateHeatStyle(b.rate, scale.min, scale.max) : "";
      const aHeat = a?.rate != null ? rateHeatStyle(a.rate, scale.min, scale.max) : "";
      return `<tr>
        <td>${esc(m)}</td>
        <td class="num rate-heat"${bHeat ? ` style="${bHeat}"` : ""}>${pct(b?.rate)}</td>
        <td class="num">${b ? `${b.n}/${b.d}` : "—"}</td>
        <td class="num">${b?.rows ?? "—"}</td>
        <td class="num rate-heat"${aHeat ? ` style="${aHeat}"` : ""}>${pct(a?.rate)}</td>
        <td class="num">${a ? `${a.n}/${a.d}` : "—"}</td>
        <td class="num">${a?.rows ?? "—"}</td>
      </tr>`;
    })
    .join("");
  const totB = j.statusQuo?.riskB;
  const totA = j.statusQuo?.riskA;
  return `<p class="hint">训练贷后窗 · 业务 <code>fpd1_cnt%</code>（Σfz/Σfm）· A/B 分列 · 风险列共用色阶</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>月</th>
          <th class="num">B 风险</th><th class="num">B Σfz/Σfm</th><th class="num">B 行数</th>
          <th class="num">A 风险</th><th class="num">A Σfz/Σfm</th><th class="num">A 行数</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>合计（窗内）</td>
          <td class="num">${pct(totB?.rate)}</td>
          <td class="num">${totB ? `${totB.n}/${totB.d}` : "—"}</td>
          <td class="num">${totB?.rows ?? "—"}</td>
          <td class="num">${pct(totA?.rate)}</td>
          <td class="num">${totA ? `${totA.n}/${totA.d}` : "—"}</td>
          <td class="num">${totA?.rows ?? "—"}</td>
        </tr></tfoot>
      </table>
    </div>`;
}

/** 相对影响展示：相对% + 旁注 Δ pp */
function relImpactTxt(rel, deltaPp) {
  if (rel == null || !Number.isFinite(rel)) return "—";
  const sign = rel > 0 ? "+" : "";
  const main = `${sign}${(rel * 100).toFixed(2)}%`;
  const side =
    deltaPp != null && Number.isFinite(deltaPp)
      ? `（${deltaPp >= 0 ? "+" : ""}${(deltaPp * 100).toFixed(2)} pp）`
      : "";
  return `<b>${main}</b>${side}`;
}

function impactRowHtml(label, w) {
  if (!w) {
    return `<tr><td>${esc(label)}</td><td colspan="7" class="muted">未配置</td></tr>`;
  }
  return `<tr>
    <td>${esc(label)}</td>
    <td class="num">${pct(w.statusRisk)}</td>
    <td class="num">${pct(w.rhat)}</td>
    <td class="num">${relImpactTxt(w.riskRel, w.riskPp)}</td>
    <td class="num">${pct(w.histPass)}</td>
    <td class="num">${pct(w.baselinePass)}</td>
    <td class="num">${pct(w.planPass)}</td>
    <td class="num">${relImpactTxt(w.passRel, w.passPp)}</td>
  </tr>`;
}

/** 影响对照口径：短导读 + 可折叠对照表 */
function impactCaliberHtml() {
  return `<p class="hint" style="margin:0.5rem 0 0.25rem">相对影响 =（新 − 旧）/ 旧；风险对比观测与 Swap 预估 R̂，放行对比 Baseline 与新方案。回测规则冻结。</p>
    <details class="appendix" style="margin:0.25rem 0 0.75rem">
      <summary>口径说明（列含义）</summary>
      <div class="table-wrap" style="margin-top:0.5rem">
        <table class="data-table">
          <thead><tr><th>列</th><th>含义</th></tr></thead>
          <tbody>
            <tr><td>现状风险</td><td>该窗 B 组观测 <code>fpd1_cnt%</code></td></tr>
            <tr><td>预估风险 R̂</td><td>Swap 预估（模型分箱 × k，按贷前结构加权）</td></tr>
            <tr><td>风险相对影响</td><td>(R̂ − 现状风险) / 现状风险</td></tr>
            <tr><td>现状通过率（历史）</td><td>历史通过率，仅对照，不作相对影响分母</td></tr>
            <tr><td>Baseline 放行</td><td>硬 ∪ 线上 Soft（含 p1）的策略放行率；放行相对影响的分母</td></tr>
            <tr><td>新方案放行</td><td>硬 ∪ 新策略侧 Soft（可不含 p1）∪ 本方案 Candidates</td></tr>
            <tr><td>放行相对影响</td><td>(新方案放行 − Baseline 放行) / Baseline 放行</td></tr>
            <tr><td>回测</td><td>规则冻结，不重挖；只重算上表指标</td></tr>
          </tbody>
        </table>
      </div>
    </details>`;
}

/**
 * @param {object} impact
 * @param {string} [title]
 * @param {{ caliber?: boolean }} [opts] caliber=false 时不附口径（结.1b 两表共用一份）
 */
function impactTableHtml(impact, title, opts) {
  if (!impact?.train && !impact?.backtest) {
    return `<p class="muted">（无影响对照；请重跑报告）</p>`;
  }
  const showCaliber = !opts || opts.caliber !== false;
  return `${title ? `<p class="hint" style="margin:0 0 .4rem">${esc(title)}</p>` : ""}
    <div class="table-wrap">
      <table class="data-table compare-table">
        <thead><tr>
          <th>窗</th>
          <th class="num">现状风险</th>
          <th class="num">预估风险 R̂</th>
          <th class="num">风险相对影响</th>
          <th class="num">现状通过率（历史）</th>
          <th class="num">Baseline放行</th>
          <th class="num">新方案放行</th>
          <th class="num">放行相对影响</th>
        </tr></thead>
        <tbody>
          ${impactRowHtml("训练", impact.train)}
          ${impactRowHtml("回测", impact.backtest)}
        </tbody>
      </table>
    </div>
    ${showCaliber ? impactCaliberHtml() : ""}`;
}

function ruleSourceLabel(source) {
  if (source === "resume" || (source && String(source).includes("resume"))) return "续挖";
  if (source === "forced") return "指定";
  if (source === "shared") return "共享挖规";
  return source ? String(source) : "—";
}

function fallbackHardFromWaterfalls() {
  const names = new Set();
  for (const key of ["risk", "pass"]) {
    for (const r of j.planDetails?.[key]?.postWaterfall || []) {
      if (r.kind === "hard" && r.name) names.add(r.name);
    }
  }
  return [...names];
}

function currentRulesData() {
  const cr = j.currentRules;
  const hard = cr && Array.isArray(cr.hard) ? cr.hard : fallbackHardFromWaterfalls();
  const soft = cr && Array.isArray(cr.soft) ? cr.soft : j.baselineSoftOnline || [];
  const emptyAll = !hard.length && !soft.length;
  const note =
    (cr && cr.note) ||
    (emptyAll
      ? "无当前规则（调用卡未写 Baseline）"
      : !soft.length
        ? "调用卡未写当前软规则"
        : !hard.length
          ? "调用卡未写当前硬规则"
          : "");
  return { hard, soft, newStrategySoft: cr && cr.newStrategySoft, note, emptyAll };
}

function currentRulesHtml() {
  const { hard, soft, note, emptyAll } = currentRulesData();
  const chip = `<span class="rv-chip rv-chip-muted">当前</span>`;
  if (emptyAll) {
    return `<div class="rule-card rule-card-current">
      <div class="rule-card-head">${chip}<h4>当前规则（线上 Baseline）</h4></div>
      <p class="hint" style="margin:0">${esc(note)}</p>
    </div>`;
  }
  const row = (kind, name) =>
    `<tr><td><span class="kind-tag ${kind === "硬" ? "hard" : "soft"}">${esc(kind)}</span></td><td><code>${esc(name)}</code></td></tr>`;
  const hardRows = hard.length
    ? hard.map((n) => row("硬", n)).join("")
    : `<tr><td><span class="kind-tag hard">硬</span></td><td class="muted">（无）</td></tr>`;
  const softRows = soft.length
    ? soft.map((n) => row("软", n)).join("")
    : `<tr><td><span class="kind-tag soft">软</span></td><td class="muted">（无）</td></tr>`;
  return `<div class="rule-card rule-card-current">
    <div class="rule-card-head">${chip}<h4>当前规则（线上 Baseline）</h4></div>
    ${note ? `<p class="hint" style="margin:0 0 .4rem">${esc(note)}</p>` : ""}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>类型</th><th>规则</th></tr></thead>
        <tbody>${hardRows}${softRows}</tbody>
      </table>
    </div>
  </div>`;
}

function inheritSoftCount() {
  const cr = currentRulesData();
  if (j.gateOverrides?.keepBaselineSoft === false) return 0;
  const histName = "通过量≠1";
  if (Array.isArray(cr.newStrategySoft)) {
    return cr.newStrategySoft.filter((n) => n !== histName).length;
  }
  const drop = new Set(j.baselineSoftNewDrop || j.baselineSoftOffline || []);
  return (j.baselineSoftOnline || cr.soft || []).filter((x) => !drop.has(x) && x !== histName).length;
}

function inheritHistPass() {
  return !!(j.gateOverrides?.includeHistPassInNew || j.currentRules?.includeHistPassInNew);
}

function candListsEqual(a, b) {
  const aa = (a || []).map(String);
  const bb = (b || []).map(String);
  if (aa.length !== bb.length) return false;
  return aa.every((x, i) => x === bb[i]);
}

/**
 * 结.2 方案卡：只列新增 Candidates + 训练/回测瀑布（训练可拖序；不含缺口备注 / 叠规试装）
 * @param {{ rules?: string[], planKey?: string, sameAsRisk?: boolean }} opts
 */
function planImpactSummaryHtml(opts) {
  const { rules, planKey, sameAsRisk } = opts || {};
  const ruleList = rules || [];
  const plan = (planKey && j.planDetails?.[planKey]) || { rules: ruleList };
  const hardN = (currentRulesData().hard || []).length;
  const softN = inheritSoftCount();
  const inheritTxt = inheritHistPass()
    ? `沿用当前：硬 ${hardN} · 软 ${softN} · 通过量≠1（老规则不下线）`
    : `沿用当前：硬 ${hardN} · 软 ${softN}（老规则不下线）`;
  let rulesBlock;
  if (sameAsRisk) {
    rulesBlock = `<p class="hint" style="margin:0 0 .45rem">${esc(inheritTxt)}</p>
      <p class="hint" style="margin:0 0 .45rem">新增与<strong>风险方案相同</strong>（${ruleList.length} 条），不重复列表。</p>`;
  } else if (!ruleList.length) {
    rulesBlock = `<p class="hint" style="margin:0 0 .45rem">${esc(inheritTxt)}</p>
      <p class="muted" style="margin:0 0 .45rem">无新增 Candidates（Baseline-only）</p>`;
  } else {
    const rows = ruleList
      .map(
        (name, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td><span class="kind-tag added">新增</span></td>
          <td><code>${esc(name)}</code></td>
        </tr>`
      )
      .join("");
    rulesBlock = `<p class="hint" style="margin:0 0 .45rem">${esc(inheritTxt)}</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="num">#</th><th>角色</th><th>规则</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
  const bt = plan.backtest;
  const hasBt = !!(bt && (bt.postWaterfall || bt.preHit || bt.swap));
  return `<div class="rule-card rule-card-plan">
    <div class="rule-card-head"><h4>新增 ${ruleList.length} 条</h4></div>
    ${rulesBlock}
    ${windowWfHtml("训练窗", plan.postWaterfall, plan.postWaterfallSegment, plan.preHit, planKey || "", {
      dnd: plan.waterfallDnD,
    })}
    ${
      hasBt
        ? windowWfHtml(
            "回测窗",
            bt.postWaterfall,
            bt.postWaterfallSegment,
            bt.preHit,
            `${planKey || ""}-bt`,
            { readonly: true }
          )
        : windowWfHtml("回测窗", null, null, null, planKey || "", { emptyNote: "本轮未指定回测窗" })
    }
    ${
      plan.waterfallDnD
        ? `<script type="application/json" class="wf-dnd-data" data-plan-key="${esc(planKey || "")}">${JSON.stringify(plan.waterfallDnD).replace(/</g, "\\u003c")}</script>`
        : ""
    }
  </div>`;
}

function windowWfHtml(label, postRows, postSeg, preRows, planKey, opts) {
  const emptyNote = opts && opts.emptyNote;
  if (emptyNote) {
    return `<div>
      <p class="hint" style="margin:.55rem 0 .35rem"><strong>${esc(label)}</strong></p>
      <p class="muted" style="margin:0">${esc(emptyNote)}</p>
    </div>`;
  }
  const readonly = !!(opts && opts.readonly);
  const dnd = readonly ? null : opts && opts.dnd;
  return `<div>
    <p class="hint" style="margin:.55rem 0 .35rem"><strong>${esc(label)} · 贷后风险瀑布</strong></p>
    ${postWfTableHtml(postRows, planKey, dnd, postSeg, readonly ? { readonly: true } : null)}
    <p class="hint" style="margin:.55rem 0 .35rem"><strong>${esc(label)} · 贷前命中瀑布</strong></p>
    ${preHitTableHtml(preRows, planKey, dnd, readonly ? { readonly: true } : null)}
  </div>`;
}

const months =
  j.months ||
  [...new Set((j.inUseBlocks || []).flatMap((b) => (b.groups || []).map((g) => (g.groupParts && g.groupParts[0]) || g.group)))].sort();

const inUse = j.inUseBlocks || [];
const potential = j.potentialBlocks || [];
const best = inUse.slice().sort((a, b) => (b.overall.ks || 0) - (a.overall.ks || 0))[0];

function ksMonth(block, month) {
  if (block.ksByMonth && block.ksByMonth[month]) return block.ksByMonth[month].ks;
  const g = (block.groups || []).find((x) => ((x.groupParts && x.groupParts[0]) || x.group) === month);
  return g ? g.ks : null;
}

function nearReason(c) {
  const parts = [];
  const absThr = j.gateOverrides?.minAbsRisk;
  const absPct = absThr != null && Number.isFinite(Number(absThr))
    ? (Number(absThr) * 100).toFixed(0)
    : "35";
  if (c.overallAbsOk === false) parts.push(`整体风险 ${pct(c.badRate)}≤${absPct}%`);
  if (c.stable && c.stable.ok === false) {
    const fails = (c.stable.detail || []).filter((d) => !d.pass);
    if (fails.length) {
      parts.push(
        "分月未过: " +
          fails
            .map(
              (d) =>
                `${d.month}(进件=${d.hitApplyVol ?? d.hit},风险样本=${d.riskDen ?? "—"},risk=${pct(d.badRate)},lift=${d.lift != null && Number.isFinite(d.lift) ? d.lift.toFixed(2) : "—"})`
            )
            .join("; ")
      );
    } else parts.push("跨月门禁未过");
  }
  return parts.join("；") || "—";
}

/** Port of RV.infra cyanAmber / rateHeat for static HTML generation */
function cyanAmberHeatStyle(t) {
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  const g = Math.pow(u, 0.85);
  const hue = 192 - g * 146;
  const sat = 64 + g * 28;
  const bgL = 28 + g * 30;
  const fgL = bgL >= 42 ? 14 + (58 - bgL) * 0.34 : 95 - g * 11;
  const fgSat = bgL >= 42 ? Math.min(58, sat) : Math.max(26, sat - 18);
  return `background:hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${bgL.toFixed(1)}%);color:hsl(${hue.toFixed(1)} ${fgSat.toFixed(1)}% ${fgL.toFixed(1)}%)`;
}
function rateHeatStyle(rate, min, max) {
  if (rate == null || !Number.isFinite(rate)) return "";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const span = max - min;
  const t = span > 1e-12 ? Math.min(1, Math.max(0, (rate - min) / span)) : 0.5;
  return cyanAmberHeatStyle(t);
}
function ratesOfBins(bins) {
  return (bins || []).map((b) => b.rate).filter((v) => v != null && Number.isFinite(v));
}
function heatScale(binsList) {
  const vals = binsList.flatMap(ratesOfBins);
  if (!vals.length) return { min: 0, max: 0 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function sortTh(key, label, type = "num") {
  return `<th class="th-sortable num" data-sort-key="${esc(key)}" data-sort-type="${type}"><button type="button" class="th-sort-btn">${esc(label)}</button></th>`;
}
function sortThText(key, label) {
  return `<th class="th-sortable" data-sort-key="${esc(key)}" data-sort-type="text"><button type="button" class="th-sort-btn">${esc(label)}</button></th>`;
}

function metricTable(blocks, tableId) {
  const monthThs = months.map((m) => sortTh(`ks_${m}`, `KS ${m}`)).join("");
  const rows = blocks
    .map((b) => {
      const monthTds = months
        .map((m) => {
          const v = ksMonth(b, m);
          return `<td class="num" data-sort-value="${v == null ? "" : v}">${fmt3(v)}</td>`;
        })
        .join("");
      return `<tr data-col="${esc(b.col)}">
        <td data-sort-value="${esc(b.col)}"><code>${esc(b.col)}</code></td>
        <td class="num" data-sort-value="${b.overall.ks ?? ""}">${fmt3(b.overall.ks)}</td>
        <td class="num" data-sort-value="${b.overall.auc ?? ""}">${fmt3(b.overall.auc)}</td>
        <td class="num" data-sort-value="${b.overall.iv ?? ""}">${fmt3(b.overall.iv)}</td>
        ${monthTds}
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap">
    <table class="data-table sortable-table" id="${esc(tableId)}">
      <thead><tr>
        ${sortThText("col", "列")}
        ${sortTh("ks", "KS")}
        ${sortTh("auc", "AUC")}
        ${sortTh("iv", "IV")}
        ${monthThs}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function binNd(b) {
  if (!b || (b.num == null && b.den == null)) return "—";
  return `${b.num ?? "—"}/${b.den ?? "—"}`;
}

function binsByLabel(bins) {
  return Object.fromEntries((bins || []).map((b) => [b.label, b]));
}

function binLabelsOf(block) {
  const overall = block.bins || [];
  if (overall.length) return overall.map((b) => b.label);
  for (const m of months) {
    const bins = block.binsByMonth?.[m] || [];
    if (bins.length) return bins.map((b) => b.label);
  }
  return [];
}

function binPeriodCells(b, scale) {
  const heat = b ? rateHeatStyle(b.rate, scale.min, scale.max) : "";
  const styleAttr = heat ? ` style="${heat}"` : "";
  return `<td class="num rate-heat bin-period-start"${styleAttr}>${b ? pct(b.rate) : "—"}</td>
    <td class="num">${binNd(b)}</td>`;
}

function niceCeil(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function binChartSeries(block) {
  const bins = block.bins || [];
  let totNum = 0;
  let totDen = 0;
  for (const b of bins) {
    if (b.num != null && Number.isFinite(Number(b.num))) totNum += Number(b.num);
    if (b.den != null && Number.isFinite(Number(b.den))) totDen += Number(b.den);
  }
  const overallRate = totDen > 0 ? totNum / totDen : null;
  return bins.map((b, i) => {
    const den = b.den != null && Number.isFinite(Number(b.den)) ? Number(b.den) : 0;
    const num = b.num != null && Number.isFinite(Number(b.num)) ? Number(b.num) : null;
    const rate =
      b.rate != null && Number.isFinite(Number(b.rate))
        ? Number(b.rate)
        : num != null && den > 0
          ? num / den
          : null;
    return {
      i,
      label: b.label,
      num,
      den,
      denShare: totDen > 0 ? den / totDen : 0,
      rate,
      lift: overallRate && rate != null ? rate / overallRate : null,
    };
  });
}

function svgLinePath(xs, ys) {
  let d = "";
  let drawing = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || !Number.isFinite(ys[i])) {
      drawing = false;
      continue;
    }
    d += (drawing ? " L " : " M ") + xs[i].toFixed(1) + " " + ys[i].toFixed(1);
    drawing = true;
  }
  return d;
}

/** 整体组合图：柱=分母占比，线=风险 / Lift */
function binComboChartHtml(block) {
  const series = binChartSeries(block);
  if (!series.length) return "";
  const W = 720;
  const H = 208;
  const pad = { l: 48, r: 70, t: 10, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const n = series.length;
  const slot = plotW / n;
  const maxShare = niceCeil(Math.max(0, ...series.map((p) => p.denShare)));
  const maxRate = niceCeil(Math.max(0, ...series.map((p) => (p.rate != null ? p.rate : 0))));
  const maxLift = niceCeil(Math.max(0, ...series.map((p) => (p.lift != null ? p.lift : 0)), 1));
  const yShare = (v) => pad.t + plotH * (1 - v / maxShare);
  const yRate = (v) => pad.t + plotH * (1 - v / maxRate);
  const yLift = (v) => pad.t + plotH * (1 - v / maxLift);
  const xAt = (i) => pad.l + slot * (i + 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const grid = ticks
    .map((t) => {
      const y = (pad.t + plotH * (1 - t)).toFixed(1);
      return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" class="bin-combo-grid"/>`;
    })
    .join("");
  const leftTicks = ticks
    .map((t) => {
      const v = maxShare * t;
      const y = yShare(v);
      return `<text x="${pad.l - 6}" y="${y + 3}" class="bin-combo-tick" text-anchor="end">${(v * 100).toFixed(t === 0 ? 0 : 1)}%</text>`;
    })
    .join("");
  const rightTicks = ticks
    .map((t) => {
      const v = maxRate * t;
      const y = yRate(v);
      return `<text x="${W - pad.r + 6}" y="${y + 3}" class="bin-combo-tick bin-combo-tick-risk" text-anchor="start">${(v * 100).toFixed(t === 0 ? 0 : 1)}%</text>`;
    })
    .join("");
  const liftTicks = ticks
    .map((t) => {
      const v = maxLift * t;
      const y = yLift(v);
      return `<text x="${W - 6}" y="${y + 3}" class="bin-combo-tick bin-combo-tick-lift" text-anchor="end">${v.toFixed(t === 0 ? 0 : 2)}</text>`;
    })
    .join("");
  const lift1 =
    maxLift >= 1
      ? `<line x1="${pad.l}" y1="${yLift(1).toFixed(1)}" x2="${W - pad.r}" y2="${yLift(1).toFixed(1)}" class="bin-combo-lift1"/>`
      : "";
  const bars = series
    .map((p) => {
      const bw = Math.max(4, slot * 0.5);
      const x = xAt(p.i) - bw / 2;
      const y = yShare(p.denShare);
      const h = Math.max(0, pad.t + plotH - y);
      return `<rect class="bin-combo-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
    })
    .join("");
  const xs = series.map((p) => xAt(p.i));
  const riskPath = svgLinePath(
    xs,
    series.map((p) => (p.rate == null ? null : yRate(p.rate)))
  );
  const liftPath = svgLinePath(
    xs,
    series.map((p) => (p.lift == null ? null : yLift(p.lift)))
  );
  const riskDots = series
    .map((p) =>
      p.rate == null
        ? ""
        : `<circle class="bin-combo-dot-risk" cx="${xAt(p.i).toFixed(1)}" cy="${yRate(p.rate).toFixed(1)}" r="3.2"/>`
    )
    .join("");
  const liftDots = series
    .map((p) =>
      p.lift == null
        ? ""
        : `<circle class="bin-combo-dot-lift" cx="${xAt(p.i).toFixed(1)}" cy="${yLift(p.lift).toFixed(1)}" r="3"/>`
    )
    .join("");
  const xLabels = series
    .map((p) => `<text class="bin-combo-x" x="${xAt(p.i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.i + 1}</text>`)
    .join("");
  const payload = JSON.stringify(
    series.map((p) => ({
      i: p.i + 1,
      label: p.label,
      num: p.num,
      den: p.den,
      denShare: p.denShare,
      rate: p.rate,
      lift: p.lift,
    }))
  ).replace(/</g, "\\u003c");
  return `<div class="bin-combo" data-bin-combo data-pad-l="${pad.l}" data-pad-r="${pad.r}" data-vb-w="${W}">
    <div class="bin-combo-legend">
      <span><i class="lg-bar"></i>分母占比</span>
      <span><i class="lg-risk"></i>风险</span>
      <span><i class="lg-lift"></i>Lift</span>
    </div>
    <div class="bin-combo-plot">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="分箱组合图：分母占比、风险、Lift">
        ${grid}
        ${lift1}
        ${bars}
        ${riskPath ? `<path class="bin-combo-line-risk" d="${riskPath}" fill="none"/>` : ""}
        ${liftPath ? `<path class="bin-combo-line-lift" d="${liftPath}" fill="none"/>` : ""}
        ${riskDots}${liftDots}
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" class="bin-combo-axis"/>
        <line x1="${W - pad.r}" y1="${pad.t}" x2="${W - pad.r}" y2="${pad.t + plotH}" class="bin-combo-axis"/>
        <line x1="${pad.l}" y1="${pad.t + plotH}" x2="${W - pad.r}" y2="${pad.t + plotH}" class="bin-combo-axis"/>
        ${leftTicks}${rightTicks}${liftTicks}${xLabels}
        <text class="bin-combo-axis-title" x="12" y="${pad.t + plotH / 2}" text-anchor="middle" transform="rotate(-90 12 ${pad.t + plotH / 2})">分母占比</text>
      </svg>
      <div class="bin-combo-tip" hidden></div>
    </div>
    <textarea class="bin-combo-data" hidden>${payload}</textarea>
  </div>`;
}

/** 行为箱、列为整体+分月（每期：风险 / 分子分母） */
function binMatrixHtml(block) {
  const labels = binLabelsOf(block);
  const monthCols = (block && block.months && block.months.length ? block.months : months) || [];
  const periods = [{ key: "overall", label: "整体", bins: block.bins || [] }].concat(
    monthCols.map((m) => ({ key: m, label: m, bins: block.binsByMonth?.[m] || [] }))
  );
  const scale = heatScale([block.bins || [], ...monthCols.map((m) => block.binsByMonth?.[m] || [])]);
  if (!labels.length) return `<p class="muted">（无分箱）</p>`;
  const maps = periods.map((p) => binsByLabel(p.bins));
  const groupRow = periods
    .map((p) => `<th class="num bin-period-start" colspan="2">${esc(p.label)}</th>`)
    .join("");
  const subRow = periods
    .map(() => `<th class="num bin-period-start">风险</th><th class="num">分子/分母</th>`)
    .join("");
  const body = labels
    .map((label, i) => {
      const cells = maps.map((map) => binPeriodCells(map[label], scale)).join("");
      return `<tr>
        <th class="num bin-sticky-1" scope="row">${i + 1}</th>
        <td class="bin-sticky-2"><code>${esc(label)}</code></td>
        ${cells}
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap">
    <table class="data-table bin-matrix">
      <thead>
        <tr>
          <th class="num bin-sticky-1" rowspan="2">箱</th>
          <th class="bin-sticky-2" rowspan="2">区间</th>
          ${groupRow}
        </tr>
        <tr>${subRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function binModeSummary(block) {
  if (block.binMode === "unique_values") {
    return `取值 ${block.nUnique ?? "—"} 个，按枚举值`;
  }
  return "等频";
}

function modelBinSection(block, open = false) {
  return `<details class="appendix model-bins"${open ? " open" : ""}>
    <summary><code>${esc(block.col)}</code> · KS=${fmt3(block.overall?.ks)} · ${esc(binModeSummary(block))}</summary>
    ${binComboChartHtml(block)}
    ${binMatrixHtml(block)}
  </details>`;
}

function evalRateScale(cells) {
  const vals = (cells || [])
    .map((c) => c && c.rate)
    .filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return { min: 0, max: 0 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function evalRateDenCells(cell, scale) {
  const heat = cell ? rateHeatStyle(cell.rate, scale.min, scale.max) : "";
  const styleAttr = heat ? ` style="${heat}"` : "";
  const nd =
    cell && (cell.num != null || cell.den != null) ? `${cell.num ?? "—"}/${cell.den ?? "—"}` : "—";
  return `<td class="num rate-heat bin-period-start"${styleAttr}>${cell ? pct(cell.rate) : "—"}</td>
    <td class="num">${nd}</td>`;
}

function evalPeriodHead(monthCols) {
  const groupRow = [`<th class="num bin-period-start" colspan="2">整体</th>`]
    .concat(monthCols.map((m) => `<th class="num bin-period-start" colspan="2">${esc(m)}</th>`))
    .join("");
  const subRow = Array(1 + monthCols.length)
    .fill(`<th class="num bin-period-start">风险</th><th class="num">分子/分母</th>`)
    .join("");
  return { groupRow, subRow };
}

function wfHitByMonthTable(plan) {
  const wf =
    plan && plan.wfHitAllTime && plan.wfHitAllTime.rules && plan.wfHitAllTime.rules.length
      ? plan.wfHitAllTime
      : plan && plan.wfHitByMonth;
  const monthCols = (wf && wf.months && wf.months.length ? wf.months : months) || [];
  const rules = (wf && wf.rules) || [];
  if (!rules.length) {
    return `<p class="muted">（无分月瀑布命中；请重跑 enrich / report）</p>`;
  }
  const allCells = [];
  for (const r of rules) {
    allCells.push(r.overall);
    for (const m of monthCols) allCells.push(r.byMonth?.[m]);
  }
  const scale = evalRateScale(allCells);
  const { groupRow, subRow } = evalPeriodHead(monthCols);
  const body = rules
    .map((r, i) => {
      const cells = [evalRateDenCells(r.overall, scale)]
        .concat(monthCols.map((m) => evalRateDenCells(r.byMonth?.[m], scale)))
        .join("");
      const kind = r.kind === "hard" ? ` <span class="muted">硬</span>` : "";
      return `<tr>
        <th class="num bin-sticky-1" scope="row">${i + 1}</th>
        <td class="bin-sticky-2"><code>${esc(r.name)}</code>${kind}</td>
        ${cells}
      </tr>`;
    })
    .join("");
  const scopeNote = wf && wf.scope === "all_post_b" ? "全期贷后 B（不分训练/回测）· " : "训练贷后窗 B · ";
  return `<p class="hint muted">${scopeNote}序变命中：本规则命中且未被更前规则截走 · 单元格=瀑布命中风险 + 分子/分母（fpd1_cnt%）</p>
  <div class="table-wrap">
    <table class="data-table bin-matrix">
      <thead>
        <tr>
          <th class="num bin-sticky-1" rowspan="2">序</th>
          <th class="bin-sticky-2" rowspan="2">规则</th>
          ${groupRow}
        </tr>
        <tr>${subRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function ruleMonthHitTableHtml(plan) {
  const items = (plan && plan.ruleMonthHit) || [];
  const monthCols = (plan && plan.ruleMonthHitMonths && plan.ruleMonthHitMonths.length
    ? plan.ruleMonthHitMonths
    : plan && plan.wfHitAllTime && plan.wfHitAllTime.months && plan.wfHitAllTime.months.length
      ? plan.wfHitAllTime.months
      : plan && plan.wfHitByMonth && plan.wfHitByMonth.months && plan.wfHitByMonth.months.length
        ? plan.wfHitByMonth.months
        : months) || [];
  if (!items.length) {
    return `<p class="muted">（无规则分月命中；请重跑 enrich / report）</p>`;
  }
  const allCells = [];
  for (const r of items) {
    allCells.push(r.hit?.overall, r.miss?.overall);
    for (const m of monthCols) {
      allCells.push(r.hit?.byMonth?.[m], r.miss?.byMonth?.[m]);
    }
  }
  const scale = evalRateScale(allCells);
  const { groupRow, subRow } = evalPeriodHead(monthCols);
  const sideRow = (side, label) => {
    const cells = [evalRateDenCells(side?.overall, scale)]
      .concat(monthCols.map((m) => evalRateDenCells(side?.byMonth?.[m], scale)))
      .join("");
    return `<td class="hit-sticky-side">${esc(label)}</td>${cells}`;
  };
  const body = items
    .map((r) => `<tr>
        <td class="hit-sticky-rule" rowspan="2"><code>${esc(r.name)}</code></td>
        ${sideRow(r.hit, "命中")}
      </tr>
      <tr>${sideRow(r.miss, "未命中")}</tr>`)
    .join("");
  const hitScope =
    plan && plan.ruleMonthHitScope === "all_post_b"
      ? "全期贷后 B（不分训练/回测）· "
      : "训练贷后窗 B · ";
  return `<p class="hint muted">${hitScope}独立命中：不论瀑布顺序 · 每条规则两行（命中 / 未命中）· 风险=fpd1_cnt%</p>
  <div class="table-wrap">
    <table class="data-table bin-matrix">
      <thead>
        <tr>
          <th class="hit-sticky-rule" rowspan="2">规则</th>
          <th class="hit-sticky-side" rowspan="2">侧</th>
          ${groupRow}
        </tr>
        <tr>${subRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function sliceD5Cell(cell, scale, kind) {
  const heat = cell ? rateHeatStyle(cell.rate, scale.min, scale.max) : "";
  const styleAttr = heat ? ` style="${heat}"` : "";
  const nd =
    cell && (cell.num != null || cell.den != null) ? `${cell.num ?? "—"}/${cell.den ?? "—"}` : "—";
  const extras = [];
  if (kind === "hit") {
    if (cell && cell.hitApply != null) extras.push(`进件 ${fmtInt(cell.hitApply)}`);
    if (cell && cell.lift != null && Number.isFinite(cell.lift)) extras.push(`Lift ${cell.lift.toFixed(2)}`);
  } else if (cell && cell.n != null) {
    extras.push(`N=${fmtInt(cell.n)}`);
  }
  const sub = extras.length ? `<div class="muted">${extras.join(" · ")}</div>` : "";
  return `<td class="num rate-heat bin-period-start"${styleAttr}>${cell ? pct(cell.rate) : "—"}${sub}</td>
    <td class="num">${nd}</td>`;
}

function sliceD5WindowTable(pack, title) {
  const rules = (pack && pack.rules) || [];
  const monthCols = (pack && pack.months) || [];
  if (!rules.length) return "";
  const values = ["1", "0"];
  const allCells = [];
  for (const rule of rules) {
    for (const val of values) {
      const sl = rule.slices && rule.slices[val];
      allCells.push(sl?.hit?.overall, sl?.base?.overall);
      for (const m of monthCols) {
        allCells.push(sl?.hit?.byMonth?.[m], sl?.base?.byMonth?.[m]);
      }
    }
  }
  const scale = evalRateScale(allCells);
  const { groupRow, subRow } = evalPeriodHead(monthCols);
  const body = rules
    .map((rule) =>
      values
        .map((val) => {
          const sl = rule.slices && rule.slices[val];
          const hitCells = [sliceD5Cell(sl?.hit?.overall, scale, "hit")]
            .concat(monthCols.map((m) => sliceD5Cell(sl?.hit?.byMonth?.[m], scale, "hit")))
            .join("");
          const baseCells = [sliceD5Cell(sl?.base?.overall, scale, "base")]
            .concat(monthCols.map((m) => sliceD5Cell(sl?.base?.byMonth?.[m], scale, "base")))
            .join("");
          return `<tr>
        <td class="hit-sticky-rule" rowspan="2"><code>${esc(rule.name)}</code></td>
        <td class="hit-sticky-side">d5=${esc(val)}</td>
        <td class="hit-sticky-side">命中</td>
        ${hitCells}
      </tr>
      <tr>
        <td class="hit-sticky-side">d5=${esc(val)}</td>
        <td class="hit-sticky-side">切片</td>
        ${baseCells}
      </tr>`;
        })
        .join("")
    )
    .join("");
  return `<h4 class="plan-subhead">${esc(title)}</h4>
  <div class="table-wrap">
    <table class="data-table bin-matrix">
      <thead>
        <tr>
          <th class="hit-sticky-rule" rowspan="2">规则</th>
          <th class="hit-sticky-side" rowspan="2">d5</th>
          <th class="hit-sticky-side" rowspan="2">侧</th>
          ${groupRow}
        </tr>
        <tr>${subRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function ruleSliceByD5Html(plan) {
  const pack = plan && plan.ruleSliceByD5;
  const all = pack && (pack.all || pack.train);
  if (!all || !all.rules || !all.rules.length) return "";
  const col = pack.col || "d5策略通过量";
  return `<p class="hint muted">全期贷后 B（不分训练/回测）· 独立命中 · 切 <code>${esc(col)}</code>=1 / =0 · 风险=fpd1_cnt%（Σfz/Σfm）· Lift=命中风险/同切片同月底盘</p>
  ${sliceD5WindowTable(all, "全期贷后 B")}`;
}

function planEvalPanelHtml(plan, title, panelId, active) {
  if (!plan) {
    return `<div class="rv-result-card plan-panel${active ? " is-active" : ""}" id="${esc(panelId)}" data-plan-panel role="tabpanel">
      <h3 class="plan-title">${esc(title)}</h3>
      <p class="muted">（无方案；请重跑 domain_run）</p>
    </div>`;
  }
  const alignNote =
    plan.evalAlignOk === false
      ? `<p class="muted">瀑布掩码与贷后 B 行未对齐，分月瀑布/命中表未生成。请重跑 enrich / report。</p>`
      : "";
  const bins = plan.modelBins || [];
  const binBody = bins.length
    ? bins.map((b, i) => modelBinSection(b, i === 0)).join("\n")
    : `<p class="muted">（本方案规则未解析出模型列，或请重跑 enrich）</p>`;
  const sliceD5 = ruleSliceByD5Html(plan);
  return `<div class="rv-result-card plan-panel${active ? " is-active" : ""}" id="${esc(panelId)}" data-plan-panel role="tabpanel">
    <h3 class="plan-title">${esc(title)}</h3>
    <p class="hint muted">全期贷后 B（不分训练/回测）· 风险=fpd1_cnt%（Σfz/Σfm）· 分母=fpd1_cnt_fm · 规则=硬∪沿用软∪ Candidates · 分箱默认等频 5 箱；取值数 &lt; 12 则按枚举值</p>
    ${alignNote}
    <div class="module-stack">
      ${submoduleHtml("2.1", "用到模型的分箱", binBody, false, {
        key: `${panelId}-bins`,
        collapsed: true,
      })}
      ${submoduleHtml("2.2", "分月瀑布命中风险", wfHitByMonthTable(plan), false, {
        key: `${panelId}-wf`,
        collapsed: true,
      })}
      ${submoduleHtml("2.3", "规则分月命中 / 不命中", ruleMonthHitTableHtml(plan), false, {
        key: `${panelId}-hit`,
        collapsed: true,
      })}
      ${
        sliceD5
          ? submoduleHtml("2.4", "Candidate × d5策略通过量 分月", sliceD5, false, {
              key: `${panelId}-d5`,
              collapsed: true,
            })
          : ""
      }
    </div>
  </div>`;
}

function planEvalTabsHtml(riskPlan, passPlan) {
  return `<div class="plan-tabs-wrap">
    <div class="tabs" role="tablist" aria-label="方案评估">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-plan-tab="eval-panel-risk">风险方案</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-plan-tab="eval-panel-pass">通过率方案</button>
    </div>
    <div class="plan-tab-panels">
      ${planEvalPanelHtml(riskPlan, "风险方案", "eval-panel-risk", true)}
      ${planEvalPanelHtml(passPlan, "通过率方案", "eval-panel-pass", false)}
    </div>
  </div>`;
}

/**
 * 规则命中分月表（近失残差 / 贷后窗B全量共用）。
 * @param {object[]} list
 * @param {{ extraHeader?: string, extraCell?: (c)=>string, emptyText?: string }} opts
 */
function ruleHitMonthTable(list, opts) {
  const items = Array.isArray(list) ? list : [];
  const extraHeader = opts?.extraHeader || "";
  const extraCell = opts?.extraCell;
  const emptyText = opts?.emptyText || "（无）";
  const allRates = items
    .flatMap((c) => [
      c.badRate,
      ...months.map(
        (m) => (c.byMonth?.[m] || (c.stable?.detail || []).find((d) => d.month === m))?.badRate
      ),
    ])
    .filter((v) => v != null && Number.isFinite(v));
  const scale = allRates.length
    ? { min: Math.min(...allRates), max: Math.max(...allRates) }
    : { min: 0, max: 0 };

  const rows = items
    .map((c) => {
      const monthCells = months
        .map((m) => {
          const d = c.byMonth?.[m] || (c.stable?.detail || []).find((x) => x.month === m);
          if (!d)
            return `<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>`;
          const heat = rateHeatStyle(d.badRate, scale.min, scale.max);
          const st = heat ? ` style="${heat}"` : "";
          const liftTxt = d.lift != null && Number.isFinite(d.lift) ? d.lift.toFixed(2) : "—";
          const hitVol = d.hitApplyVol != null ? d.hitApplyVol : d.hit;
          const riskN = d.riskDen != null ? d.riskDen : "—";
          return `<td class="num">${hitVol}</td><td class="num">${riskN}</td><td class="num rate-heat"${st}>${pct(d.badRate)}</td><td class="num">${liftTxt}</td>`;
        })
        .join("");
      const oh = rateHeatStyle(c.badRate, scale.min, scale.max);
      const ost = oh ? ` style="${oh}"` : "";
      const hitVol = c.hitApplyVol != null ? c.hitApplyVol : c.hit;
      const tail = extraCell ? `<td class="muted">${extraCell(c)}</td>` : "";
      return `<tr>
        <td><code>${esc(c.expr || c.name || "—")}</code></td>
        <td class="num">${hitVol != null ? hitVol : "—"}</td>
        <td class="num">${c.riskDen != null ? c.riskDen : "—"}</td>
        <td class="num rate-heat"${ost}>${pct(c.badRate)}</td>
        <td class="num">${c.lift != null ? Number(c.lift).toFixed(2) : "—"}</td>
        ${monthCells}
        ${tail}
      </tr>`;
    })
    .join("");

  const monthGroupThs = months
    .map(
      (m) =>
        `<th class="num">${esc(m)} 命中进件量</th><th class="num">${esc(m)} 风险样本量</th><th class="num">${esc(m)} fpd1风险</th><th class="num">${esc(m)} Lift</th>`
    )
    .join("");
  const colSpan = 5 + months.length * 4 + (extraHeader ? 1 : 0);

  return `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>表达式</th><th class="num">整体命中进件量</th><th class="num">整体风险样本量</th><th class="num">整体 fpd1风险</th><th class="num">整体 Lift</th>
        ${monthGroupThs}
        ${extraHeader ? `<th>${esc(extraHeader)}</th>` : ""}
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${colSpan}" class="muted">${esc(emptyText)}</td></tr>`}</tbody>
    </table>
  </div>`;
}

function nearMissTable() {
  return ruleHitMonthTable(j.nearMiss || [], {
    extraHeader: "未过原因",
    extraCell: (c) => esc(nearReason(c)),
    emptyText: "（无近失）",
  });
}

function postBHitTable() {
  const pack = j.postBHitTables || {};
  const rules = pack.rules || [];
  const srcLabel = (c) =>
    Array.isArray(c.sources) && c.sources.length ? c.sources.join(" · ") : "—";
  return `${
    pack.sampleNote
      ? `<p class="hint muted">${esc(pack.sampleNote)} · 工作样本 N=${pack.workN ?? "—"}（贷后 B=${pack.postB ?? "—"}）· 规则 ${pack.ruleCount ?? rules.length} 条</p>`
      : ""
  }
  ${ruleHitMonthTable(rules, {
    extraHeader: "来源",
    extraCell: (c) => esc(srcLabel(c)),
    emptyText: "（无；请重跑 domain 生成 postBHitTables）",
  })}`;
}

const shellCss = `
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "PingFang SC", system-ui, sans-serif;
  background: var(--wb-canvas);
  color: var(--text);
  line-height: 1.5;
  font-size: 14px;
}
.app-header {
  background: var(--header-bg);
  color: var(--on-dark);
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.app-header h1 { margin: 0; font-size: 1.35rem; font-weight: 700; }
.app-header p { margin: .35rem 0 0; opacity: .9; font-size: .85rem; color: var(--text-dim); }
.content { padding: 1rem 1.25rem 2.5rem; max-width: none; margin: 0; flex: 1; min-width: 0; }
.report-shell {
  display: flex; align-items: flex-start; gap: 0;
  max-width: 1400px; margin: 0 auto; min-height: calc(100vh - 3.5rem);
}
.report-toc {
  position: sticky; top: 0; align-self: flex-start;
  width: 14.5rem; flex: 0 0 14.5rem;
  max-height: 100vh; overflow: auto;
  padding: 1rem .75rem 2rem 1rem;
  border-right: 1px solid var(--border-soft);
  background: color-mix(in oklab, var(--wb-sheet, #111) 92%, transparent);
  z-index: 20;
}
.report-toc .toc-title {
  font-size: .72rem; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: var(--text-muted); margin: 0 0 .65rem;
}
.report-toc nav { display: flex; flex-direction: column; gap: .15rem; }
.report-toc .toc-group { display: flex; flex-direction: column; gap: .08rem; }
.report-toc .toc-sub {
  display: flex; flex-direction: column; gap: .04rem;
  padding: 0 0 .2rem .45rem; margin: 0 0 .1rem;
  border-left: 1px solid var(--border-soft);
  margin-left: .5rem;
}
.report-toc a {
  display: block; padding: .35rem .5rem; border-radius: 6px;
  color: var(--text-dim); text-decoration: none; font-size: .8rem; line-height: 1.35;
}
.report-toc .toc-sub a {
  font-size: .72rem; padding: .22rem .45rem; color: var(--text-muted);
}
.report-toc a:hover { background: color-mix(in oklab, var(--accent) 12%, transparent); color: var(--text); }
.report-toc a.is-active {
  background: color-mix(in oklab, var(--accent) 18%, transparent);
  color: var(--accent); font-weight: 600;
}
.report-toc a.is-parent-active { color: var(--text); font-weight: 600; }
.report-section, .submodule[id] { scroll-margin-top: .75rem; }
.toc-mobile-btn {
  display: none; position: fixed; right: 1rem; bottom: 1rem; z-index: 40;
  appearance: none; border: 1px solid var(--border); border-radius: 999px;
  background: var(--wb-sheet); color: var(--text); padding: .55rem 1rem;
  font-size: .85rem; box-shadow: var(--shadow-surface); cursor: pointer;
}
.report-toc-backdrop { display: none; }
@media (max-width: 900px) {
  .report-shell { display: block; }
  .report-toc {
    position: fixed; left: 0; top: 0; bottom: 0; transform: translateX(-105%);
    transition: transform .2s ease; width: min(16rem, 82vw); max-height: none;
    box-shadow: var(--shadow-surface);
  }
  .report-toc.is-open { transform: translateX(0); }
  .toc-mobile-btn { display: inline-flex; }
  .report-toc-backdrop.is-open {
    display: block; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 19;
  }
}
.collapse-head {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  margin: 0 0 .65rem;
}
.collapse-head h2, .collapse-head .submodule-title { margin: 0; flex: 1; min-width: 0; }
.collapse-toggle, .swap-src-toggle {
  appearance: none; border: 1px solid var(--border); background: var(--surface, transparent);
  color: var(--text); border-radius: var(--radius-sm, 6px); padding: .2rem .65rem;
  font-size: .75rem; cursor: pointer; flex: 0 0 auto; white-space: nowrap;
}
.collapse-toggle:hover, .swap-src-toggle:hover { border-color: var(--accent); color: var(--accent); }
.report-section.is-collapsed > .collapse-body,
.submodule.is-collapsed > .collapse-body { display: none; }
.report-section.is-collapsed { padding-bottom: .85rem; }
.report-document section {
  background: var(--wb-sheet);
  padding: 1.35rem 1.45rem 1.5rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-surface);
}
.report-document h2 {
  border-bottom: none;
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-strong);
}
.report-document h3 {
  font-size: .92rem;
  color: var(--text-strong);
  margin: 1rem 0 .65rem;
  font-weight: 600;
}
.report-document h4 {
  font-size: .84rem;
  color: var(--text-dim);
  margin: .75rem 0 .4rem;
  font-weight: 600;
}
.report-document p { font-size: .88rem; color: var(--text-dim); margin: .35rem 0; }
.sample-scope {
  margin: 0 0 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: var(--wb-block);
}
.sample-scope h2 { margin-top: 0; }
.sample-scope .scope-lead {
  font-size: .92rem; color: var(--text); line-height: 1.55; margin: 0 0 .65rem;
}
.sample-scope .scope-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: .4rem;
  font-size: .88rem; color: var(--text-dim); line-height: 1.5;
}
.sample-scope .scope-list li { padding-left: 0; }
.sample-scope .scope-list .k {
  display: inline-block; min-width: 5.5rem; margin-right: .35rem;
  font-weight: 700; color: var(--text-muted); font-size: .75rem;
}
.sample-scope code { word-break: break-all; }
.rv-wb-meta {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 0.35rem 0.5rem; padding: 0.1rem 0 0.45rem;
}
.rv-chip {
  display: inline-flex; align-items: center;
  padding: 0.15rem 0.55rem; border-radius: var(--radius-pill);
  font-size: 0.75rem; border: 1px solid var(--tag-border);
  background: var(--tag-bg); color: var(--text);
}
.rv-chip-muted {
  background: var(--surface); border-color: var(--border); color: var(--text-muted);
}
.rv-result-card {
  background: var(--wb-block);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.1rem;
  margin-top: .75rem;
}
.metric-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: .75rem; margin: .35rem 0 .85rem;
}
.metric-card {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: .85rem .9rem;
  text-align: center;
}
.metric-card .val {
  font-size: 1.25rem; font-weight: 700; color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.metric-card .val.bad { color: var(--danger); }
.metric-card .val.good { color: var(--success); }
.metric-card .sub {
  margin-top: 0.2rem; font-size: 0.72rem; color: var(--text-muted);
  font-variant-numeric: tabular-nums; line-height: 1.35;
}
.metric-card .lbl { font-size: .72rem; color: var(--text-muted); margin-top: .35rem; }
.table-wrap { overflow-x: auto; margin: .35rem 0; }
.data-table {
  width: max-content; max-width: none;
  border-collapse: collapse; font-size: .82rem; margin: .35rem 0 0;
}
.data-table th, .data-table td {
  border: none; border-bottom: 1px solid var(--table-divider);
  padding: .55rem .65rem; text-align: left; vertical-align: middle;
}
.data-table th {
  background: transparent; color: var(--table-header);
  font-weight: 600; font-size: .72rem; letter-spacing: .03em;
  white-space: nowrap;
}
.data-table tbody tr:hover { background: var(--table-row-hover); }
.data-table .num {
  text-align: right; font-variant-numeric: tabular-nums;
  color: var(--text-strong); white-space: nowrap;
}
.data-table th.num { color: var(--table-header); }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table .rate-heat { font-weight: 600; text-align: right; }
.data-table td .sub { font-size: .68rem; color: var(--text-muted); font-weight: 400; }
/* 双方案对照表：表头与单元格统一左对齐，两方案列等宽 */
.data-table.plan-compare-table {
  width: 100%;
  max-width: 56rem;
  table-layout: fixed;
}
.data-table.plan-compare-table th,
.data-table.plan-compare-table td {
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}
.data-table.plan-compare-table th:first-child,
.data-table.plan-compare-table td:first-child {
  width: 7.5rem;
  white-space: nowrap;
  color: var(--text-muted);
  font-weight: 600;
}
.data-table.plan-compare-table th:not(:first-child),
.data-table.plan-compare-table td:not(:first-child) {
  width: calc((100% - 7.5rem) / 2);
}
.data-table.plan-compare-table td.num {
  text-align: left;
  white-space: normal;
}
.data-table.plan-compare-table code {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-all;
}
.th-sort-btn {
  background: none; border: none; font: inherit; color: inherit;
  cursor: pointer; padding: 0; text-align: inherit;
}
.th-sort-btn:hover { color: var(--accent); }
.th-sortable[data-sort-dir="asc"] .th-sort-btn::after { content: " ↑"; color: var(--accent); }
.th-sortable[data-sort-dir="desc"] .th-sort-btn::after { content: " ↓"; color: var(--accent); }
.wf-drag-cell { width: 1.6rem; padding-right: 0 !important; color: var(--text-muted); }
.drag-handle { cursor: grab; user-select: none; font-size: .95rem; line-height: 1; opacity: .55; }
.drag-handle:active { cursor: grabbing; }
.drag-handle-disabled { opacity: .2; cursor: default; pointer-events: none; }
tr.wf-row.hard td:nth-child(2) { box-shadow: inset 3px 0 0 var(--hard, #64748b); }
tr.wf-row.soft td:nth-child(2), tr.wf-row.custom td:nth-child(2) { box-shadow: inset 3px 0 0 var(--soft, #0d9488); }
tr.wf-row.wf-sort-hidden { display: none; }
tr.wf-row.wf-dragging { opacity: .9; background: var(--surface, #fff); }
tr.segment-row td { background: color-mix(in oklab, var(--bg-info-soft, #eef2ff) 55%, transparent); font-size: .82rem; }
.kind-tag.segment { background: var(--border); color: var(--text-dim); }
.swap-src-block { margin-top: 1rem; }
.swap-src-head {
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  margin: .75rem 0 .35rem;
}
.swap-src-head h4 { margin: 0; font-size: .95rem; }
.swap-src-toggle {
  appearance: none; border: 1px solid var(--border); background: var(--surface, #fff);
  color: var(--text); border-radius: var(--radius-sm, 6px); padding: .2rem .65rem;
  font-size: .78rem; cursor: pointer;
}
.swap-src-toggle:hover { border-color: var(--accent); color: var(--accent); }
.swap-src-body.is-collapsed { display: none; }
.swap-seg-chart { display: flex; height: 1.35rem; border-radius: 6px; overflow: hidden; margin: .5rem 0 .75rem; border: 1px solid var(--border); }
.swap-seg-chart span { display: block; height: 100%; min-width: 0; }
.swap-seg-chart .seg-inin { background: color-mix(in oklab, var(--accent, #60a5fa) 70%, transparent); }
.swap-seg-chart .seg-swapin { background: color-mix(in oklab, var(--ok, #22c55e) 65%, transparent); }
.swap-seg-chart .seg-swapout { background: color-mix(in oklab, var(--warn, #f59e0b) 70%, transparent); }
.swap-seg-chart .seg-outout { background: color-mix(in oklab, var(--text-muted, #94a3b8) 45%, transparent); }
.swap-seg-legend { display: flex; flex-wrap: wrap; gap: .5rem .9rem; margin: 0 0 .75rem; font-size: .78rem; color: var(--text-muted); }
.swap-seg-legend i { display: inline-block; width: .65rem; height: .65rem; border-radius: 2px; margin-right: .3rem; vertical-align: -1px; }
.swap-seg-legend i.seg-inin { background: color-mix(in oklab, var(--accent, #60a5fa) 70%, transparent); }
.swap-seg-legend i.seg-swapin { background: color-mix(in oklab, var(--ok, #22c55e) 65%, transparent); }
.swap-seg-legend i.seg-swapout { background: color-mix(in oklab, var(--warn, #f59e0b) 70%, transparent); }
.swap-seg-legend i.seg-outout { background: color-mix(in oklab, var(--text-muted, #94a3b8) 45%, transparent); }
.swap-bar-chart { display: grid; gap: .35rem; margin: .5rem 0 .85rem; }
.swap-bar-row { display: grid; grid-template-columns: minmax(7rem, 28%) 1fr auto; gap: .45rem; align-items: center; font-size: .78rem; }
.swap-bar-row .bar-track { height: .55rem; background: color-mix(in oklab, var(--border) 55%, transparent); border-radius: 99px; overflow: hidden; }
.swap-bar-row .bar-fill { height: 100%; background: color-mix(in oklab, var(--accent, #60a5fa) 75%, transparent); border-radius: 99px; }
.waterfall-placeholder-row td { padding: 0; border: none; background: transparent; }
.waterfall-placeholder-row .waterfall-placeholder {
  height: 2.4rem; margin: .15rem .35rem;
  border: 1px dashed var(--accent); border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .78rem; color: var(--text-dim);
}
.muted { color: var(--text-muted); font-size: .84rem; }
.cfg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: .45rem .9rem; font-size: .84rem; color: var(--text-dim);
}
.cfg-grid b { color: var(--text); font-weight: 600; }
.decision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: .75rem;
}
.decision-strip {
  background: var(--wb-block);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1rem;
}
.decision-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 5rem; font-size: 0.75rem; font-weight: 700;
  border-radius: 999px; padding: 0.2rem 0.6rem;
  background: var(--border); color: var(--text-dim);
}
.decision-strip.good .decision-badge { background: var(--bg-soft-green); color: var(--success); }
.decision-strip.warn .decision-badge { background: var(--bg-warn-soft); color: var(--text-warn-dark); }
.decision-strip.bad .decision-badge { background: var(--bg-danger-soft); color: var(--text-danger-dark); }
.decision-title { margin: .45rem 0 .25rem; font-weight: 700; color: var(--text-strong); }
.decision-text { font-size: .86rem; color: var(--text-dim); }
.decision-list {
  list-style: none; margin: .35rem 0 0; padding: 0;
  display: flex; flex-direction: column; gap: .35rem;
  font-size: .86rem; color: var(--text-dim); line-height: 1.45;
}
.decision-list .k {
  display: inline-block; min-width: 3.2rem; margin-right: .35rem;
  font-weight: 700; font-size: .72rem; color: var(--text-muted);
  letter-spacing: .02em;
}
.decision-mini-wrap { margin: 0 0 .15rem; }
.decision-mini-table { font-size: .78rem; }
.decision-mini-table th,
.decision-mini-table td { padding: .28rem .4rem; }
.rule-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: .75rem .85rem .9rem;
  background: color-mix(in oklab, var(--wb-block, #111) 88%, transparent);
}
.rule-card-current { border-left: 3px solid var(--border); }
.rule-card-plan { border-left: 3px solid var(--accent); }
.rule-card-head {
  display: flex; align-items: center; gap: .4rem; flex-wrap: wrap;
  margin: 0 0 .45rem;
}
.rule-card-head h4 {
  margin: 0; font-size: .9rem; font-weight: 700; color: var(--text-strong);
}
.plan-rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: .85rem;
  margin-top: .85rem;
}
.kind-tag.added { background: var(--bg-soft-green); color: var(--success); border-color: var(--border-success-soft); }
.gate-chip-row {
  display: flex; flex-wrap: wrap; gap: .35rem; margin: .25rem 0 .4rem;
}
.gate-details {
  margin: .45rem 0 0;
  font-size: .84rem; color: var(--text-dim);
}
.gate-details > summary {
  cursor: pointer; color: var(--text-strong); font-weight: 600;
  list-style-position: outside;
}
.gate-bullet-list {
  list-style: none; margin: .5rem 0 0; padding: 0;
  display: flex; flex-direction: column; gap: .45rem;
}
.gate-bullet-list li {
  padding: .4rem .55rem;
  border-left: 3px solid var(--border-soft);
  background: color-mix(in oklab, var(--wb-block, #111) 80%, transparent);
  border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
}
.gate-bullet-label {
  display: block; font-weight: 700; color: var(--text-strong);
  font-size: .78rem; margin-bottom: .15rem;
}
.gate-bullet-detail { display: block; line-height: 1.45; }
.cfg-gate-cell .gate-chip-row { margin-top: .35rem; }
.backtest-block { margin: 0; }
.submodule {
  margin: 0.85rem 0 1.1rem;
  padding: 0.75rem 0.9rem 0.9rem;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--wb-block, #111) 88%, transparent);
}
.submodule + .submodule { margin-top: 0.75rem; }
.submodule-title {
  display: flex; align-items: baseline; gap: .5rem; flex-wrap: wrap;
  margin: 0 0 .55rem; font-size: .95rem; font-weight: 700; color: var(--text-strong);
  line-height: 1.35;
}
.submodule-num {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 2.4rem; padding: 0.12rem 0.4rem;
  border-radius: 999px; font-size: .72rem; font-weight: 700;
  letter-spacing: .02em;
  background: color-mix(in oklab, var(--accent) 18%, transparent);
  color: var(--accent); border: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
  flex-shrink: 0;
}
.submodule-body > :first-child { margin-top: 0; }
.submodule-body > :last-child { margin-bottom: 0; }
.submodule.submodule-nested {
  border-left-color: var(--border);
  background: color-mix(in oklab, var(--bg-info-soft, #1a2030) 35%, transparent);
}
.submodule.submodule-nested .submodule-num {
  background: var(--border); color: var(--text-dim); border-color: var(--border);
}
.module-stack { display: flex; flex-direction: column; gap: 0.15rem; }
.lamp {
  display: inline-flex; align-items: center; gap: .35rem;
  font-weight: 600; font-size: .82rem;
}
.lamp::before {
  content: ""; width: .55rem; height: .55rem; border-radius: 50%;
  background: var(--border);
}
.lamp.good { color: var(--success); }
.lamp.good::before { background: var(--success); }
.lamp.warn { color: var(--text-warn-dark); }
.lamp.warn::before { background: var(--warn); }
.lamp.bad { color: var(--text-danger-dark); }
.lamp.bad::before { background: var(--danger); }
.status.ok { color: var(--success); }
.status.err { color: var(--danger); }
details.appendix, details.model-bins {
  margin-top: .5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: .55rem .75rem;
}
details.appendix + details.appendix,
details.model-bins + details.model-bins { margin-top: .45rem; }
details.appendix summary, details.model-bins summary {
  cursor: pointer; font-weight: 600; font-size: .88rem; color: var(--text-strong);
}
.bin-matrix thead th { background: var(--bg, var(--surface)); }
.bin-matrix .bin-period-start { border-left: 1px solid var(--table-divider); }
.bin-matrix .bin-sticky-1,
.bin-matrix .bin-sticky-2 {
  position: sticky;
  z-index: 2;
  background: var(--bg, var(--surface));
}
.bin-matrix thead .bin-sticky-1,
.bin-matrix thead .bin-sticky-2 { z-index: 3; }
.bin-matrix .bin-sticky-1 { left: 0; }
.bin-matrix .bin-sticky-2 { left: 2.6rem; min-width: 7.5rem; }
.bin-matrix tbody tr:hover .bin-sticky-1,
.bin-matrix tbody tr:hover .bin-sticky-2 { background: var(--table-row-hover); }
.bin-matrix .hit-sticky-rule,
.bin-matrix .hit-sticky-side {
  position: sticky;
  z-index: 2;
  background: var(--bg, var(--surface));
}
.bin-matrix thead .hit-sticky-rule,
.bin-matrix thead .hit-sticky-side { z-index: 3; }
.bin-matrix .hit-sticky-rule {
  left: 0;
  width: 16rem;
  min-width: 16rem;
  max-width: 16rem;
  white-space: normal;
  word-break: break-all;
}
.bin-matrix .hit-sticky-rule code {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-all;
}
.bin-matrix .hit-sticky-side {
  left: 16rem;
  width: 4.2rem;
  min-width: 4.2rem;
  white-space: nowrap;
  box-shadow: 1px 0 0 var(--table-divider);
}
.bin-matrix tbody tr:hover .hit-sticky-rule,
.bin-matrix tbody tr:hover .hit-sticky-side { background: var(--table-row-hover); }
.bin-combo { margin: .55rem 0 1.1rem; }
.bin-combo-legend {
  display: flex; flex-wrap: wrap; gap: .35rem 1rem;
  font-size: .75rem; color: var(--text-muted); margin: 0 0 .35rem;
}
.bin-combo-legend i {
  display: inline-block; width: .75rem; height: .65rem; margin-right: .3rem;
  vertical-align: -1px; border-radius: 2px;
}
.bin-combo-legend .lg-bar { background: color-mix(in oklab, var(--accent, #60a5fa) 38%, transparent); border: 1px solid var(--accent, #60a5fa); }
.bin-combo-legend .lg-risk { background: var(--danger, #f87171); }
.bin-combo-legend .lg-lift { background: var(--warn, #fbbf24); }
.bin-combo-plot { position: relative; cursor: crosshair; }
.bin-combo svg { width: 100%; height: auto; display: block; overflow: hidden; }
.bin-combo-grid { stroke: var(--table-divider, #2a3344); stroke-width: 1; }
.bin-combo-axis { stroke: var(--text-muted, #94a3b8); stroke-width: 1; }
.bin-combo-lift1 { stroke: var(--warn, #fbbf24); stroke-width: 1; stroke-dasharray: 3 3; opacity: .45; }
.bin-combo-bar { fill: color-mix(in oklab, var(--accent, #60a5fa) 32%, transparent); }
.bin-combo-line-risk { stroke: var(--danger, #f87171); stroke-width: 1.8; }
.bin-combo-line-lift { stroke: var(--warn, #fbbf24); stroke-width: 1.6; stroke-dasharray: 5 3; }
.bin-combo-dot-risk { fill: var(--danger, #f87171); }
.bin-combo-dot-lift { fill: var(--warn, #fbbf24); }
.bin-combo-tick, .bin-combo-x, .bin-combo-axis-title {
  fill: var(--text-muted, #94a3b8); font-size: 9px;
}
.bin-combo-tick-risk { fill: var(--danger, #f87171); }
.bin-combo-tick-lift { fill: var(--warn, #fbbf24); }
.bin-combo-axis-title { font-size: 10px; }
.bin-combo-tip {
  position: fixed; z-index: 80; pointer-events: none;
  min-width: 11rem; max-width: 18rem;
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border); border-radius: 6px;
  padding: .4rem .55rem; font-size: .75rem; line-height: 1.5;
  color: var(--text); box-shadow: 0 6px 18px rgba(0,0,0,.22);
}
.bin-combo-tip[hidden] { display: none; }
.bin-combo-tip .k { color: var(--text-muted); }
.check-list { margin: .35rem 0 0; padding-left: 1.1rem; color: var(--text-dim); font-size: .86rem; }
.check-list li { margin: .2rem 0; }
.hint { font-size: .78rem; color: var(--text-subtle); margin: .25rem 0 .5rem; }
.tabs {
  display: flex; gap: .35rem; flex-wrap: wrap;
  margin: .85rem 0 .65rem; border-bottom: 1px solid var(--border);
  padding-bottom: .65rem; align-items: center;
}
.tab-btn {
  padding: .4rem .9rem; border: 1px solid transparent; background: transparent;
  cursor: pointer; font-size: .85rem; color: var(--text-muted);
  border-radius: var(--radius-pill); font-family: inherit;
}
.tab-btn:hover { background: var(--surface); color: var(--text); }
.tab-btn.active {
  color: var(--on-accent); font-weight: 600;
  background: var(--accent); border-color: var(--accent);
}
.plan-tab-panels { margin-top: .35rem; }
.plan-panel { display: none; margin-top: 0; }
.plan-panel.is-active { display: block; }
.plan-panel > h3 { margin-top: 1.1rem; }
.plan-panel > h3:first-child { margin-top: 0; }
.plan-panel .plan-title { margin: 0 0 .35rem; font-size: 1rem; }
.round-block {
  margin: .55rem 0 .85rem;
  padding: .65rem .75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.round-block h4 { margin: 0 0 .4rem; font-size: .84rem; color: var(--text-strong); }
.kind-tag {
  display: inline-block;
  font-size: .68rem;
  font-weight: 700;
  padding: .05rem .35rem;
  border-radius: var(--radius-pill);
  margin-right: .25rem;
  background: var(--surface-raised);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.kind-tag.hard { background: var(--bg-danger-soft); color: var(--text-danger-dark); border-color: var(--border-danger-chip); }
.kind-tag.custom, .kind-tag.soft { background: var(--bg-soft-green); color: var(--success); border-color: var(--border-success-soft); }
`;

function fmtLift(x) {
  return x != null && Number.isFinite(x) ? Number(x).toFixed(2) : "—";
}

const SEGMENT_META_KEYS = new Set(["n", "postN", "postB", "preB", "preN", "backtest"]);

/** 迭代客群筛条件（跳过样本量元数据） */
function segmentFiltersHtml(seg) {
  const parts = [];
  for (const [k, v] of Object.entries(seg || {})) {
    if (SEGMENT_META_KEYS.has(k)) continue;
    if (v != null && typeof v === "object") continue;
    parts.push(`<code>${esc(k)}=${esc(String(v))}</code>`);
  }
  return parts.join(" · ") || "—";
}

function decisionScopeHtml(dec) {
  if (!dec || typeof dec !== "object") {
    return "贷后/贷前指标与挖规均在 <b>B 组</b>；对照表另报 A 组";
  }
  const col = dec.col || "决策组";
  const sample = dec.sample != null ? String(dec.sample) : "—";
  const control = dec.control != null ? String(dec.control) : "—";
  const note = dec.note ? ` · ${esc(dec.note)}` : "";
  return `<code>${esc(col)}</code>：样本/B=<code>${esc(sample)}</code> · 对照/A=<code>${esc(control)}</code>${note}；指标与挖规在 <b>B</b>`;
}

/** 潜在池定义：TopN / 扩展列 / 排除列 */
function potentialPoolHtml(report) {
  const topN = report.potentialTopN ?? (report.top10 || []).length;
  const extra = report.extraPotentialCols || [];
  const excl = report.excludePotentialCols || [];
  const rankN = (report.ranking || []).length;
  return `<div class="cfg-grid">
    <div>潜在取 TopN<br><b>${esc(String(topN))}</b>${rankN ? `<div class="sub muted">KS 全池 ${rankN} 列</div>` : ""}</div>
    <div>扩展列<br><b>${extra.length ? extra.map((c) => `<code>${esc(c)}</code>`).join(" · ") : "—"}</b></div>
    <div>排除列<br><b>${excl.length ? excl.map((c) => `<code>${esc(c)}</code>`).join(" · ") : "—"}</b></div>
  </div>`;
}

/** 残差已挖未入选（residualNotAdopted） */
function residualNotAdoptedHtml(items, dualOk) {
  const rows = Array.isArray(items) ? items : [];
  const known = !!(dualOk && dualOk.known);
  const miss = known && (!dualOk.risk || !dualOk.pass);
  const hint = miss
    ? `<p class="hint">未双达标时列出残差扫描到、但未进方案的规则。工作样本=训练贷后窗·B·未命中硬∪Baseline软∪当时已采纳 Candidates。每方案最多 16 条；全文见 JSON <code>residualNotAdopted</code>。</p>`
    : `<p class="hint muted">双达标路径上的残差扫描留档（每方案最多 16 条）。</p>`;
  if (!rows.length) {
    return `${hint}<p class="muted">（残差续挖未留下未入选规则；若续挖耗尽见方案试装轨迹）</p>`;
  }
  const planLabel = (p) => (p === "pass" ? "通过率" : p === "risk" ? "风险" : p || "—");
  const body = rows
    .map((r) => {
      const hit = r.hitApplyVol ?? r.hit;
      return `<tr>
        <td>${esc(planLabel(r.plan))}</td>
        <td class="num">${r.round != null ? r.round : "—"}</td>
        <td class="num">${r.workN != null ? r.workN : "—"}</td>
        <td>${r.expr ? `<code>${esc(r.expr)}</code>` : `<span class="muted">—</span>`}</td>
        <td class="num">${hit != null ? hit : "—"}</td>
        <td class="num">${r.badRate != null ? pct(r.badRate) : "—"}</td>
        <td class="num">${fmtLift(r.lift)}</td>
        <td>${esc(r.whyNotAdopted || "—")}</td>
      </tr>`;
    })
    .join("");
  return `${hint}
    <div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>方案</th><th class="num">轮</th><th class="num">残差N</th><th>表达式</th>
        <th class="num">命中进件</th><th class="num">风险</th><th class="num">Lift</th><th>未入选原因</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

/** 挖规采纳轮次（mineRounds） */
function mineRoundsHtml(rounds) {
  const rows = Array.isArray(rounds) ? rounds : [];
  if (!rows.length) return `<p class="muted">（无 mineRounds）</p>`;
  const body = rows
    .map((r) => {
      const hit = r.hitApplyVol ?? r.hit ?? r.hitCount;
      const months = (r.months || [])
        .map((m) => {
          const mark = m.inGate || m.inAbsRiskGate ? "*" : "";
          return `${m.month}${mark}:${m.hitApplyVol ?? m.hit ?? "—"}/${pct(m.badRate)}`;
        })
        .join(" · ");
      return `<tr>
        <td class="num">${r.round ?? "—"}</td>
        <td class="muted">${esc(r.planTag || "—")}</td>
        <td class="num">${r.workN != null ? r.workN : "—"}</td>
        <td><code>${esc(r.expr || `${r.column || ""} ${r.operator || ""} ${r.threshold ?? ""}`.trim())}</code></td>
        <td class="num">${hit != null ? hit : "—"}</td>
        <td class="num">${pct(r.badRate)}</td>
        <td class="num">${fmtLift(r.lift)}</td>
        <td class="muted" style="font-size:.78rem">${esc(months || "—")}</td>
      </tr>`;
    })
    .join("");
  return `<p class="hint muted">分月列：命中进件/风险；带 * 为绝对风险门禁月。完整尝试见附录近失 / JSON <code>mineLog</code>。</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th class="num">轮</th><th>标签</th><th class="num">残差N</th><th>表达式</th>
        <th class="num">命中进件</th><th class="num">风险</th><th class="num">Lift</th><th>分月（进件/风险）</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

/** 方案叠规试装轨迹（accept / 地板回退 / 续挖 / 缺口） */
function assembleTrailHtml(log) {
  const rows = Array.isArray(log) ? log : [];
  if (!rows.length) return "";
  const actionLabel = (a) => {
    switch (a.action) {
      case "accept":
        return "接纳";
      case "accept_forced":
        return "强制保留";
      case "rollback_floor":
        return "地板回退";
      case "rollback_aux":
        return "辅带回退";
      case "skip":
        return "跳过";
      case "mine_exhausted":
        return "续挖耗尽";
      case "seed_start":
        return "种子尝试";
      case "seed_fail":
        return "种子未达标";
      case "seed_ok":
        return "种子双达标";
      case "seed_adopt":
        return "采用种子";
      case "gap":
        return "缺口";
      default:
        return a.action || "—";
    }
  };
  const detail = (a) => {
    if (a.action === "mine_exhausted")
      return `残差续挖无过门禁候选（轮次 ${a.resumeRound ?? "—"}）`;
    if (a.action === "seed_start")
      return a.why || `种子#${a.seedRank ?? "—"}/${a.seedTotal ?? "—"}`;
    if (a.action === "seed_fail" || a.action === "seed_ok" || a.action === "seed_adopt")
      return a.reason || a.why || "—";
    const bits = [];
    if (a.why) bits.push(a.why);
    if (a.reason && a.reason !== a.why) bits.push(a.reason);
    return bits.join("；") || "—";
  };
  const yn = (v) => (v === true ? "是" : v === false ? "否" : "—");
  const body = rows
    .map((a, i) => {
      const expr =
        a.expr != null && String(a.expr)
          ? `<code>${esc(a.expr)}</code>`
          : `<span class="muted">—</span>`;
      return `<tr>
      <td class="num">${i + 1}</td>
      <td class="num">${a.seedRank != null ? `#${a.seedRank}${a.seedTotal != null ? "/" + a.seedTotal : ""}` : "—"}</td>
      <td>${esc(actionLabel(a))}</td>
      <td>${expr}</td>
      <td>${esc(detail(a))}</td>
      <td class="num">${a.pass != null ? pct(a.pass) : "—"}</td>
      <td class="num">${a.risk != null ? pct(a.risk) : "—"}</td>
      <td class="num">${a.rhatTrain != null ? pct(a.rhatTrain) : "—"}</td>
      <td class="num">${a.rhatBt != null ? pct(a.rhatBt) : "—"}</td>
      <td>${esc(yn(a.dualOk))}</td>
      <td class="muted">${esc(ruleSourceLabel(a.source))}</td>
    </tr>`;
    })
    .join("");
  const nRoll = rows.filter(
    (a) => a.action === "rollback_floor" || a.action === "rollback_aux"
  ).length;
  const nAcc = rows.filter((a) => a.action === "accept").length;
  return `<details class="appendix" style="margin:0.5rem 0 1rem">
    <summary>叠规试装轨迹 <span class="muted">（接纳 ${nAcc} · 回退 ${nRoll}；第一轮按不同模型种子回退，先双达标即停）</span></summary>
    <div class="table-wrap" style="margin-top:0.5rem">
      <table class="data-table">
        <thead><tr>
          <th class="num">#</th><th class="num">种子</th><th>动作</th><th>表达式</th><th>说明</th>
          <th class="num">叠后放行</th><th class="num">叠后观测风险</th>
          <th class="num">训练 R̂</th><th class="num">回测 R̂</th><th>双达标</th><th>来源</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </details>`;
}

function binColSelectionHtml(sel) {
  if (!sel?.chosen && !sel?.tried?.length) return "";
  const modeNote =
    sel.mode === "max_swapin_est_fallback"
      ? `兜底：全无梯度，取预估 swapin 最高（${pct(sel.fallbackSwapinEstRate)}）`
      : sel.mode === "ks_gradient"
        ? "KS 序首个通过 4 箱严格单调自检"
        : esc(sel.modeLabel || sel.mode || "—");
  const skipped = (sel.tried || []).filter((t) => t.col !== sel.chosen);
  const skipRows = skipped
    .slice(0, 12)
    .map(
      (t) => `<tr>
      <td class="num">#${t.ksRank ?? "—"}</td>
      <td><code>${esc(t.col)}</code></td>
      <td class="num">${fmt3(t.ks)}</td>
      <td>${t.hasGradient ? '<span class="status ok">有梯度</span>' : '<span class="status err">无</span>'}</td>
      <td class="muted">${esc(t.reason || "—")}${
        t.swapinEstRate != null ? ` · 预估swapin ${pct(t.swapinEstRate)}` : ""
      }</td>
    </tr>`
    )
    .join("");
  const more =
    skipped.length > 12 ? `<p class="muted">另有 ${skipped.length - 12} 列已跳过（见 JSON binColSelection.tried）</p>` : "";
  return `<div class="rv-result-card" style="margin:0.75rem 0">
    <h4>分箱列选用理由</h4>
    <p><code>${esc(sel.chosen || "—")}</code> · KS 名次 <strong>#${sel.ksRank ?? "—"}</strong>（KS=${fmt3(sel.ks)}）· mode=<code>${esc(
      sel.mode || "—"
    )}</code></p>
    <p class="hint">${modeNote}</p>
    ${
      skipRows
        ? `<div class="table-wrap"><table class="data-table">
      <thead><tr><th class="num">KS序</th><th>列</th><th class="num">KS</th><th>梯度</th><th>原因</th></tr></thead>
      <tbody>${skipRows}</tbody>
    </table></div>${more}`
        : `<p class="muted">无跳过列（KS#1 即通过）</p>`
    }
  </div>`;
}

function swapinEstBinsHtml(est) {
  if (!est?.bins?.length) return "";
  const body = est.bins
    .map(
      (b) => `<tr>
      <td><code>${esc(b.label)}</code></td>
      <td class="num">${pct(b.ininRate)}${b.ininDen != null ? `<div class="sub">${b.ininNum}/${b.ininDen}</div>` : ""}</td>
      <td class="num">${pct(b.swapinEst)}</td>
      <td class="num">${pct(b.swapinObs)}</td>
      <td class="num">${b.swapinPreApply != null ? Number(b.swapinPreApply).toLocaleString("zh-CN") : "—"}</td>
      <td class="num">${pct(b.share)}</td>
    </tr>`
    )
    .join("");
  return `<h4>swapin 分箱预估（${esc(est.binCol)} · ${est.nBins} 箱等频 · k=${est.k}）</h4>
    <p class="hint">箱内预估 = 该箱 inin 风险 × k；总 swapin 预估按各箱<strong>贷前 swapin 进件</strong>结构加权</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>箱</th><th class="num">inin 风险</th><th class="num">swapin 预估</th><th class="num">swapin 观测</th><th class="num">贷前进件</th><th class="num">结构占比</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

function swapSegChartHtml(segments, totalApply) {
  const order = ["inin", "swapin", "swapout", "outout"];
  const tot = totalApply || order.reduce((s, k) => s + (segments?.[k]?.applyVol || 0), 0) || 1;
  const bars = order
    .map((k) => {
      const v = segments?.[k]?.applyVol || 0;
      const w = Math.max(0, (v / tot) * 100);
      return `<span class="seg-${k}" style="width:${w.toFixed(3)}%" title="${esc(segments?.[k]?.label || k)} ${Number(v).toLocaleString("zh-CN")}"></span>`;
    })
    .join("");
  const legend = order
    .map((k) => {
      const s = segments?.[k] || {};
      return `<span><i class="seg-${k}"></i>${esc(s.label || k)} ${s.applyVol != null ? Number(s.applyVol).toLocaleString("zh-CN") : "—"}（${pct(s.applyShare)}）</span>`;
    })
    .join("");
  return `<div class="swap-seg-chart">${bars}</div><div class="swap-seg-legend">${legend}</div>`;
}

function swapSrcBarChartHtml(breakBlock) {
  if (!breakBlock?.rows?.length) return "";
  const max = Math.max(1, ...breakBlock.rows.map((r) => r.stepVol || r.hitVol || 0));
  const rows = breakBlock.rows
    .map((r) => {
      const v = r.stepVol != null ? r.stepVol : r.hitVol || 0;
      const w = Math.max(0, (v / max) * 100);
      return `<div class="swap-bar-row" data-rule-id="${esc(r.ruleId || "")}">
        <div class="bar-label" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(2)}%"></div></div>
        <div class="num bar-val">${v != null ? Number(v).toLocaleString("zh-CN") : "—"}</div>
      </div>`;
    })
    .join("");
  return `<div class="swap-bar-chart" data-src-bars>${rows}</div>`;
}

function swapSrcWfTableHtml(breakBlock, planKey, srcKey) {
  if (!breakBlock) return `<p class="muted">（无 ${esc(srcKey)} 拆解）</p>`;
  const canDnd = !!(breakBlock.dnd && breakBlock.rules?.length);
  const body = (breakBlock.rows || [])
    .map((r) => {
      const isHard = r.kind === "hard";
      return `<tr class="wf-row ${esc(r.kind || "")}${isHard ? " hard" : ""}" data-rule-id="${esc(r.ruleId || "")}" data-kind="${esc(isHard ? "hard" : "soft")}">
      ${canDnd ? dragHandleCell(!isHard) : ""}
      <td><span class="kind-tag ${esc(r.kind || "")}">${esc(r.kind || "—")}</span> ${esc(r.name)}</td>
      <td class="num src-hit">${r.hitVol != null ? Number(r.hitVol).toLocaleString("zh-CN") : "—"}</td>
      <td class="num src-hit-share">${pct(r.hitShare)}</td>
      <td class="num src-step-rate wf-ord-step-rate">${pct(r.stepRate)}</td>
      <td class="num src-step wf-ord-step">${r.stepVol != null ? Number(r.stepVol).toLocaleString("zh-CN") : "—"}</td>
      <td class="num src-only-rate">${r.onlyRate == null ? "—" : pct(r.onlyRate)}</td>
      <td class="num src-only">${r.onlyVol == null ? "—" : Number(r.onlyVol).toLocaleString("zh-CN")}</td>
    </tr>`;
    })
    .join("");
  const dndJson = canDnd
    ? `<script type="application/json" class="swap-src-dnd-data" data-plan-key="${esc(planKey || "")}" data-src-key="${esc(srcKey)}">${JSON.stringify(breakBlock.dnd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `${swapSrcBarChartHtml(breakBlock)}
  <div class="table-wrap">
    <table class="data-table wf-table swap-src-table" data-wf-kind="swap-src" data-plan-key="${esc(planKey || "")}" data-src-key="${esc(srcKey)}">
      <thead><tr>${canDnd ? "<th></th>" : ""}<th>规则</th><th class="num">进件量</th><th class="num">进件占比</th><th class="num">瀑布命中率</th><th class="num">瀑布命中进件</th><th class="num">仅命中率</th><th class="num">仅命中进件</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${canDnd ? 8 : 7}" class="muted">（无规则行）</td></tr>`}</tbody>
    </table>
  </div>
  ${dndJson}`;
}

function swapSourcesHtml(sources, planKey) {
  if (!sources) return "";
  const segs = sources.segments || {};
  const uid = `swap-src-${esc(planKey || "plan")}`;
  return `<div class="swap-src-block" data-swap-sources>
    <div class="swap-src-head">
      <h4>Swap 用户来源</h4>
      <button type="button" class="swap-src-toggle" data-swap-src-toggle aria-controls="${uid}" aria-expanded="true">收起</button>
    </div>
    <div class="swap-src-body" id="${uid}">
      <p class="hint muted">${esc(sources.note || "")} · 贷前总进件 ${sources.totalApply != null ? Number(sources.totalApply).toLocaleString("zh-CN") : "—"}</p>
      <h4>① 四象限总览</h4>
      ${swapSegChartHtml(segs, sources.totalApply)}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>段</th><th class="num">行数</th><th class="num">进件量</th><th class="num">进件占比</th></tr></thead>
        <tbody>${["inin", "swapin", "swapout", "outout"]
          .map((k) => {
            const s = segs[k] || {};
            return `<tr><td>${esc(s.label || k)}</td><td class="num">${s.rowCount ?? "—"}</td><td class="num">${s.applyVol != null ? Number(s.applyVol).toLocaleString("zh-CN") : "—"}</td><td class="num">${pct(s.applyShare)}</td></tr>`;
          })
          .join("")}</tbody>
      </table></div>
      <h4>② ${esc(sources.swapin?.title || "swapin × 当前策略瀑布")}</h4>
      <p class="hint muted">样本：贷前 B ∩ swapin（线上拒 · 新策略放）· 段进件 ${sources.swapin?.segApply != null ? Number(sources.swapin.segApply).toLocaleString("zh-CN") : "—"}</p>
      ${swapSrcWfTableHtml(sources.swapin, planKey, "swapin")}
      <h4>③ ${esc(sources.swapout?.title || "swapout × 新策略瀑布")}</h4>
      <p class="hint muted">样本：贷前 B ∩ swapout（线上放 · 新策略拒）· 段进件 ${sources.swapout?.segApply != null ? Number(sources.swapout.segApply).toLocaleString("zh-CN") : "—"}</p>
      ${swapSrcWfTableHtml(sources.swapout, planKey, "swapout")}
    </div>
  </div>`;
}

function swapTableHtml(swap, planKey) {
  if (!swap?.segments) return `<p class="muted">（无 Swap）</p>`;
  const order = ["inin", "swapin", "swapout", "outout"];
  const rows = order
    .map((k) => {
      const s = swap.segments[k];
      if (!s) return "";
      const r = s.risk || {};
      const estNote =
        k === "swapin" && swap.swapinEst?.swapinEstRate != null
          ? `<div class="sub">预估 ${pct(swap.swapinEst.swapinEstRate)}</div>`
          : "";
      return `<tr>
        <td>${esc(s.label || k)}</td>
        <td class="num">${s.rowCount ?? "—"}</td>
        <td class="num">${s.applyVol != null ? Number(s.applyVol).toLocaleString("zh-CN") : "—"}</td>
        <td class="num">${pct(s.applyShare)}</td>
        <td class="num">${pct(r.rate)}${r.num != null ? `<div class="sub">${r.num}/${r.den}</div>` : ""}${estNote}</td>
      </tr>`;
    })
    .join("");
  const useBinEst = String(swap.Rhat?.method || "").includes("bin_inin_x_k");
  const rhat = swap.Rhat
    ? `<p class="hint">估算 R̂ = <strong>${pct(swap.Rhat.R)}</strong>（${
        useBinEst
          ? `分箱×k + 贷前结构：w=${swap.Rhat.w != null ? swap.Rhat.w.toFixed(3) : "—"}（贷前 inin/(inin+swapin)）· inin ${pct(swap.Rhat.ininRate)} · swapin预估 ${pct(swap.Rhat.swapinRate)} · 观测swapin ${pct(swap.Rhat.swapinRateObs)}`
          : `观测 + 贷前结构：w=${swap.Rhat.w != null ? swap.Rhat.w.toFixed(3) : "—"} · inin ${pct(swap.Rhat.ininRate)} · swapin ${pct(swap.Rhat.swapinRate)}`
      }）</p>`
    : "";
  const rhatObs =
    swap.RhatObs && useBinEst
      ? `<p class="hint muted">对照·观测 swapin + 贷前结构 R̂ = ${pct(swap.RhatObs.R)}（swapin 观测 ${pct(swap.RhatObs.swapinRate)}）</p>`
      : "";
  return `${rhat}${rhatObs}
  ${binColSelectionHtml(swap.binColSelection)}
  <div class="table-wrap"><table class="data-table">
    <thead><tr><th>段</th><th class="num">行数</th><th class="num">进件量</th><th class="num">进件占比</th><th class="num">贷后风险</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${swapinEstBinsHtml(swap.swapinEst)}
  ${swapSourcesHtml(swap.sources, planKey || "")}`;
}

function dragHandleCell(draggable) {
  if (draggable) {
    return `<td class="wf-drag-cell"><span class="drag-handle" title="拖拽调整瀑布顺序" aria-label="拖拽">⠿</span></td>`;
  }
  return `<td class="wf-drag-cell"><span class="drag-handle drag-handle-disabled" title="硬规则不可拖" aria-hidden="true">⠿</span></td>`;
}

function postWfTableHtml(rows, planKey, dnd, segmentRows, opts) {
  if (!rows?.length && !(segmentRows || []).length) return `<p class="muted">（无贷后瀑布）</p>`;
  const readonly = !!(opts && opts.readonly);
  const canDnd = !readonly && !!(dnd && dnd.rules && dnd.rules.length);
  const body = (rows || [])
    .map((r) => {
      const kind = r.kind || "";
      const isHard = kind === "hard";
      const id = r.ruleId || "";
      return `<tr class="wf-row ${esc(kind)}${isHard ? " hard" : ""}" data-rule-id="${esc(id)}" data-kind="${esc(kind)}">
      ${canDnd ? dragHandleCell(!isHard) : ""}
      <td><span class="kind-tag ${esc(kind)}">${esc(kind || "—")}</span> ${esc(r.name)}</td>
      <td class="num">${r.postHitVol != null ? r.postHitVol : "—"}</td>
      <td class="num">${pct(r.riskHit)}</td>
      <td class="num wf-ord-risk">${pct(r.wfHitRisk)}${r.wfHitDen != null ? `<div class="sub">den ${r.wfHitDen}</div>` : ""}</td>
      <td class="num">${pct(r.onlyHitRisk)}${r.onlyHitDen != null ? `<div class="sub">den ${r.onlyHitDen}</div>` : ""}</td>
    </tr>`;
    })
    .join("");
  // segment「未命中任意规则」：展示 miss 侧（与主站一致），钉在 tfoot，不参与 DnD
  const foot = (segmentRows || [])
    .map((r) => {
      const sample = r.postMissVol;
      const risk = r.riskMiss;
      return `<tr class="segment-row" data-segment-id="${esc(r.ruleId || "")}">
      ${canDnd ? `<td class="wf-drag-cell"><span class="drag-handle drag-handle-disabled" title="分段不可拖" aria-hidden="true">⠿</span></td>` : ""}
      <td><span class="kind-tag segment">segment</span> ${esc(r.name)}<div class="sub">口径：硬∪软均未命中（放行残差）</div></td>
      <td class="num">${sample != null ? sample : "—"}<div class="sub">未命中侧 den</div></td>
      <td class="num">${pct(risk)}<div class="sub">未命中侧 fpd1</div></td>
      <td class="num">—</td>
      <td class="num">—</td>
    </tr>`;
    })
    .join("");
  return `<div class="table-wrap">
    <table class="data-table wf-table" data-wf-kind="post" data-plan-key="${esc(planKey || "")}">
    <thead><tr>${canDnd ? "<th></th>" : ""}<th>规则</th><th class="num">命中样本</th><th class="num">命中风险</th><th class="num">瀑布命中风险</th><th class="num">仅命中风险</th></tr></thead>
    <tbody>${body}</tbody>
    ${foot ? `<tfoot>${foot}</tfoot>` : ""}
  </table></div>`;
}

function preHitTableHtml(rows, planKey, dnd, opts) {
  if (!rows?.length) return `<p class="muted">（无贷前命中瀑布）</p>`;
  const readonly = !!(opts && opts.readonly);
  const canDnd = !readonly && !!(dnd && dnd.rules && dnd.rules.length);
  const body = rows
    .map((r) => {
      const kind = r.kind === "custom" ? "soft" : r.kind || "";
      const isHard = kind === "hard" || r.kind === "hard";
      const id = r.ruleId || "";
      const onlyVolTxt =
        r.onlyVol != null && Number.isFinite(Number(r.onlyVol))
          ? Number(r.onlyVol).toLocaleString("zh-CN")
          : "—";
      return `<tr class="wf-row ${esc(kind)}${isHard ? " hard" : ""}" data-rule-id="${esc(id)}" data-kind="${esc(isHard ? "hard" : "soft")}">
      ${canDnd ? dragHandleCell(!isHard) : ""}
      <td><span class="kind-tag ${esc(r.kind || kind)}">${esc(r.kind || kind || "—")}</span> ${esc(r.ruleName)}</td>
      <td class="num">${r.hitVol != null ? Number(r.hitVol).toLocaleString("zh-CN") : "—"}</td>
      <td class="num">${pct(r.hitRate)}</td>
      <td class="num">${pct(r.onlyRate)}</td>
      <td class="num">${onlyVolTxt}</td>
      <td class="num wf-ord-step">${r.stepVol != null ? Number(r.stepVol).toLocaleString("zh-CN") : "—"}</td>
      <td class="num wf-ord-step-rate">${pct(r.stepRate)}</td>
      <td class="num wf-ord-cum">${r.cumVol != null ? Number(r.cumVol).toLocaleString("zh-CN") : "—"}</td>
    </tr>`;
    })
    .join("");
  return `<div class="table-wrap">
    <table class="data-table wf-table" data-wf-kind="pre" data-plan-key="${esc(planKey || "")}">
    <thead><tr>${canDnd ? "<th></th>" : ""}<th>规则</th><th class="num">命中进件</th><th class="num">命中率</th><th class="num">仅命中率</th><th class="num">仅命中样本</th><th class="num">瀑布步进件</th><th class="num">步进率</th><th class="num">累计拒量</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function roundBlockHtml(r) {
  const hitVol = (x) => (x.hitApplyVol != null ? x.hitApplyVol : x.hit);
  const gateSet = new Set(r.gateMonths || []);
  const monthRows = (r.months || [])
    .map((m) => {
      const inGate = m.inGate != null ? !!m.inGate : gateSet.size ? gateSet.has(m.month) : true;
      let gateCell;
      if (!inGate) {
        gateCell = `<span class="muted" title="非近3月门禁窗，仅对照">对照</span>`;
      } else if (m.pass) {
        gateCell = `<span class="status ok">过</span>`;
      } else {
        gateCell = `<span class="status err">未过</span>`;
      }
      return `<tr>
      <td>${esc(m.month)}${inGate ? "" : ` <span class="muted">·对照</span>`}</td>
      <td class="num">${hitVol(m) != null ? hitVol(m) : "—"}</td>
      <td class="num">${m.riskDen != null ? m.riskDen : "—"}</td>
      <td class="num">${pct(m.badRate)}</td>
      <td class="num">${fmtLift(m.lift)}</td>
      <td>${gateCell}</td>
    </tr>`;
    })
    .join("");
  const gateNote = (r.gateMonths || []).length
    ? `硬门禁月：${(r.gateMonths || []).join("、")}；其余月仅对照展示`
    : "分月展示训练窗全部月份；近 3 月为硬门禁";
  return `<div class="round-block">
    <h4>第 ${r.planRound || r.round} 轮 · ${esc(r.scope || "")}（工作样本 n=${r.workN ?? "—"} · 样本风险 ${pct(r.workBizRisk)}）</h4>
    <p><code>${esc(r.expr)}</code> · 命中进件量 ${hitVol(r) != null ? hitVol(r) : "—"} · 风险样本量 ${r.riskDen != null ? r.riskDen : "—"} · fpd1 ${pct(r.badRate)} · Lift ${fmtLift(r.lift)}</p>
    <p class="hint muted">${esc(gateNote)}</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>月</th><th class="num">命中进件量</th><th class="num">风险样本量</th><th class="num">fpd1风险</th><th class="num">Lift</th><th>门禁</th></tr></thead>
      <tbody>${monthRows || `<tr><td colspan="6" class="muted">（无分月）</td></tr>`}</tbody>
    </table></div>
  </div>`;
}

function collapseToggleBtn(expanded) {
  return `<button type="button" class="collapse-toggle" aria-expanded="${expanded ? "true" : "false"}">${
    expanded ? "收起" : "展开"
  }</button>`;
}

function submoduleHtml(num, title, bodyHtml, nested, opts) {
  const collapsed = !!(opts && opts.collapsed);
  const key = (opts && opts.key) || `sub-${num}`;
  const idAttr = opts && opts.id ? ` id="${esc(opts.id)}"` : "";
  return `<div class="submodule${nested ? " submodule-nested" : ""}${
    collapsed ? " is-collapsed" : ""
  }"${idAttr} data-sub="${esc(String(num))}" data-collapse-key="${esc(key)}" data-collapse-level="sub">
    <div class="collapse-head">
      <h3 class="submodule-title"><span class="submodule-num">${esc(String(num))}</span><span>${esc(
        title
      )}</span></h3>
      ${collapseToggleBtn(!collapsed)}
    </div>
    <div class="submodule-body collapse-body">${bodyHtml}</div>
  </div>`;
}

function sectionHtml(id, title, innerHtml, opts) {
  const collapsed = !!(opts && opts.collapsed);
  const toc = (opts && opts.toc) || title;
  const extraClass = (opts && opts.className) || "";
  return `<section id="${esc(id)}" class="report-section ${extraClass}${
    collapsed ? " is-collapsed" : ""
  }" data-collapse-key="${esc(id)}" data-collapse-level="section" data-toc="${esc(toc)}">
    <div class="section-head collapse-head">
      <h2>${esc(title)}</h2>
      ${collapseToggleBtn(!collapsed)}
    </div>
    <div class="section-body collapse-body">${innerHtml}</div>
  </section>`;
}

function backtestBlockHtml(bt, planKey, sectionNum, opts) {
  if (!bt) return "";
  const base = sectionNum || "6";
  const seg = bt.segment || {};
  const meta = `<p class="hint muted">${esc(bt.note || "规则冻结自训练窗；重算 Swap/R̂、贷后瀑布与贷前命中瀑布")}</p>
    <div class="gate-chip-row">
      <span class="rv-chip">回测贷后 <code>${esc(bt.windows?.post || "—")}</code></span>
      <span class="rv-chip">回测贷前 <code>${esc(bt.windows?.pre || "—")}</code></span>
      <span class="rv-chip rv-chip-muted">贷后 B=${seg.postB ?? "—"}</span>
      <span class="rv-chip rv-chip-muted">贷前 B=${seg.preB ?? "—"}</span>
      <span class="rv-chip rv-chip-muted">窗内 B 现状风险 ${pct(bt.riskB?.rate)}</span>
      <span class="rv-chip">R̂ ${pct(bt.swap?.Rhat?.R)}</span>
      <span class="rv-chip rv-chip-muted">新策略放行风险 ${pct(bt.swap?.newPass?.risk?.rate ?? bt.swap?.newPass?.risk)}</span>
    </div>
    <div class="module-stack">
      ${submoduleHtml(
        `${base}.1`,
        "Swap 风险预估",
        swapTableHtml(bt.swap, `${planKey || ""}-bt`),
        true
      )}
      ${submoduleHtml(
        `${base}.2`,
        "贷后风险瀑布",
        postWfTableHtml(bt.postWaterfall, `${planKey || ""}-bt`, null, bt.postWaterfallSegment, { readonly: true }),
        true
      )}
      ${submoduleHtml(
        `${base}.3`,
        "贷前命中瀑布",
        preHitTableHtml(bt.preHit, `${planKey || ""}-bt`, null, { readonly: true }),
        true
      )}
    </div>`;
  return submoduleHtml(base, "回测窗（规则冻结 · 不重挖）", meta, false, {
    key: `${planKey || "plan"}-bt`,
    collapsed: !!(opts && opts.collapsed),
  });
}

function planPanelHtml(plan, title, subtitle, panelId, active) {
  if (!plan) {
    return `<div class="rv-result-card plan-panel${active ? " is-active" : ""}" id="${esc(panelId)}" data-plan-panel role="tabpanel">
      <h3 class="plan-title">${esc(title)}</h3>
      <p class="muted">（无 planDetails，请重跑 domain_run）</p>
    </div>`;
  }
  const roundsHtml = (plan.rounds || []).map(roundBlockHtml).join("") || `<p class="muted">本方案无采纳轮次</p>`;
  const planRhat = plan.swap?.Rhat?.R ?? plan.impact?.train?.rhat ?? plan.impact?.rhat;
  const overview = `<p class="hint">${esc(subtitle)} · 规则 ${ (plan.rules || []).length } 条 · 方案后风险（观测） ${pct(plan.metrics?.risk?.rate)} · 预估 R̂ ${pct(planRhat)} · 策略放行率 ${pct(plan.metrics?.pass?.rate)}${plan.metrics?.pass?.admit != null && plan.metrics?.pass?.apply != null ? `（${plan.metrics.pass.admit}/${plan.metrics.pass.apply}）` : ""}</p>
    <div class="cfg-grid">
      ${(plan.rules || []).map((r) => `<div>规则<br><b><code>${esc(r)}</code></b></div>`).join("") || "<div>规则<br><b>—</b></div>"}
    </div>
    ${plan.gap ? `<div class="callout callout-warn" style="margin:0.5rem 0 1rem"><strong>缺口：</strong>${esc(plan.gap)}</div>` : ""}
    ${assembleTrailHtml(plan.assembleLog)}
    ${
      (plan.pruneRemoved || []).length
        ? `<div class="callout callout-warn" style="margin:0.5rem 0 1rem"><strong>仅命中剪枝（已删 ${plan.pruneRemoved.length} 条）</strong><ul style="margin:0.35rem 0 0 1.1rem">${plan.pruneRemoved
            .map(
              (p) =>
                `<li><code>${esc(p.name)}</code> · ${esc((p.reasons || []).join("；"))} · 贷后仅命中den=${p.onlyHitDen ?? "—"} · 贷前仅命中率=${p.onlyRate == null ? "—" : pct(p.onlyRate)}</li>`
            )
            .join("")}</ul></div>`
        : ""
    }`;
  return `<div class="rv-result-card plan-panel${active ? " is-active" : ""}" id="${esc(panelId)}" data-plan-panel role="tabpanel">
    <h3 class="plan-title">${esc(title)}</h3>
    <div class="module-stack">
      ${submoduleHtml("1", "方案概要", overview, false, { key: `${panelId}-1` })}
      ${submoduleHtml("2", "训练 / 回测 · 影响对照", impactTableHtml(plan.impact), false, {
        key: `${panelId}-2`,
      })}
      ${submoduleHtml(
        "3",
        "训练窗 · Swap（线上硬+软 vs 新=硬+Baseline软+本方案 Candidates）",
        swapTableHtml(plan.swap, plan.label || ""),
        false,
        { key: `${panelId}-3` }
      )}
      ${submoduleHtml(
        "4",
        "训练窗 · 贷后风险瀑布",
        postWfTableHtml(plan.postWaterfall, plan.label || "", plan.waterfallDnD, plan.postWaterfallSegment),
        false,
        { key: `${panelId}-4`, collapsed: true }
      )}
      ${submoduleHtml(
        "5",
        "训练窗 · 贷前命中瀑布",
        preHitTableHtml(plan.preHit, plan.label || "", plan.waterfallDnD),
        false,
        { key: `${panelId}-5`, collapsed: true }
      )}
      ${backtestBlockHtml(plan.backtest, plan.label || "", "6", { collapsed: true })}
      ${submoduleHtml("7", "训练窗 · 轮次与按月命中", roundsHtml, false, {
        key: `${panelId}-7`,
        collapsed: true,
      })}
    </div>
    ${
      plan.waterfallDnD
        ? `<script type="application/json" class="wf-dnd-data" data-plan-key="${esc(plan.label || "")}">${JSON.stringify(plan.waterfallDnD).replace(/</g, "\\u003c")}</script>`
        : ""
    }
  </div>`;
}

function planTabsHtml(riskPlan, passPlan, tRiskPct, tPassPct) {
  return `<div class="plan-tabs-wrap">
    <div class="tabs" role="tablist" aria-label="双方案">
      <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-plan-tab="plan-panel-risk">风险方案</button>
      <button type="button" class="tab-btn" role="tab" aria-selected="false" data-plan-tab="plan-panel-pass">通过率方案</button>
    </div>
    <div class="plan-tab-panels">
      ${planPanelHtml(riskPlan, "风险方案", "挖规目标：压风险 ≤ " + tRiskPct, "plan-panel-risk", true)}
      ${planPanelHtml(passPlan, "通过率方案", "挖规目标：保策略放行率 ≥ " + tPassPct, "plan-panel-pass", false)}
    </div>
  </div>`;
}

const clientJs = `
(function () {
  function cellVal(td, type) {
    const raw = td.getAttribute("data-sort-value");
    if (type === "num") {
      const n = raw === "" || raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : -Infinity;
    }
    return (raw != null ? raw : td.textContent || "").toString();
  }
  function pct(x) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return (Number(x) * 100).toFixed(2) + "%";
  }
  function fmtInt(x) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return Number(x).toLocaleString("zh-CN");
  }
  document.querySelectorAll("table.sortable-table").forEach((table) => {
    const thead = table.tHead;
    if (!thead) return;
    thead.addEventListener("click", (e) => {
      const th = e.target.closest("th.th-sortable");
      if (!th || !table.contains(th)) return;
      const type = th.getAttribute("data-sort-type") || "num";
      const colIdx = Array.prototype.indexOf.call(th.parentNode.children, th);
      const prev = th.getAttribute("data-sort-dir");
      const dir = prev === "desc" ? "asc" : "desc";
      thead.querySelectorAll("th.th-sortable").forEach((x) => x.removeAttribute("data-sort-dir"));
      th.setAttribute("data-sort-dir", dir);
      const tbody = table.tBodies[0];
      const rows = Array.from(tbody.rows);
      rows.sort((a, b) => {
        const av = cellVal(a.cells[colIdx], type);
        const bv = cellVal(b.cells[colIdx], type);
        let cmp = 0;
        if (type === "num") cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), "zh");
        return dir === "asc" ? cmp : -cmp;
      });
      rows.forEach((r) => tbody.appendChild(r));
    });
  });

  document.querySelectorAll("[data-plan-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-plan-tab");
      const wrap = btn.closest(".plan-tabs-wrap");
      if (!wrap || !id) return;
      wrap.querySelectorAll("[data-plan-tab]").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      wrap.querySelectorAll("[data-plan-panel]").forEach((p) => {
        p.classList.toggle("is-active", p.id === id);
      });
    });
  });

  const dndByPlan = {};
  document.querySelectorAll("script.wf-dnd-data").forEach((el) => {
    const key = el.getAttribute("data-plan-key") || "";
    try { dndByPlan[key] = JSON.parse(el.textContent || "{}"); } catch (e) { /* ignore */ }
  });

  function readOrder(tbody) {
    return Array.from(tbody.querySelectorAll("tr.wf-row"))
      .map((tr) => tr.getAttribute("data-rule-id"))
      .filter(Boolean);
  }

  function applyOrderToTbody(tbody, orderIds) {
    const map = {};
    Array.from(tbody.querySelectorAll("tr.wf-row")).forEach((tr) => {
      map[tr.getAttribute("data-rule-id")] = tr;
    });
    orderIds.forEach((id) => {
      if (map[id]) tbody.appendChild(map[id]);
    });
  }

  function recomputePost(dnd, orderIds) {
    const n = dnd.post.n;
    const cum = new Array(n).fill(false);
    const out = {};
    orderIds.forEach((id) => {
      const mask = dnd.post.masks[id] || [];
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        if (!cum[i] && mask[i]) {
          num += dnd.post.fz[i] || 0;
          den += dnd.post.fm[i] || 0;
          cum[i] = true;
        }
      }
      out[id] = { wfHitRisk: den > 0 ? num / den : null, wfHitDen: den };
    });
    return out;
  }

  function recomputePre(dnd, orderIds) {
    const n = dnd.pre.n;
    const total = dnd.pre.totalApply || 0;
    const cum = new Array(n).fill(false);
    const out = {};
    let cumVol = 0;
    orderIds.forEach((id) => {
      const mask = dnd.pre.masks[id] || [];
      let stepVol = 0;
      for (let i = 0; i < n; i++) {
        if (!cum[i] && mask[i]) {
          stepVol += dnd.pre.apply[i] || 0;
          cum[i] = true;
        }
      }
      cumVol += stepVol;
      out[id] = {
        stepVol,
        stepRate: total > 0 ? stepVol / total : null,
        cumVol,
      };
    });
    return out;
  }

  function paintPost(tbody, metrics) {
    tbody.querySelectorAll("tr.wf-row").forEach((tr) => {
      const id = tr.getAttribute("data-rule-id");
      const m = metrics[id];
      if (!m) return;
      const cell = tr.querySelector(".wf-ord-risk");
      if (!cell) return;
      cell.innerHTML = pct(m.wfHitRisk) + (m.wfHitDen != null ? '<div class="sub">den ' + m.wfHitDen + "</div>" : "");
    });
  }

  function paintPre(tbody, metrics) {
    tbody.querySelectorAll("tr.wf-row").forEach((tr) => {
      const id = tr.getAttribute("data-rule-id");
      const m = metrics[id];
      if (!m) return;
      const s = tr.querySelector(".wf-ord-step");
      const r = tr.querySelector(".wf-ord-step-rate");
      const c = tr.querySelector(".wf-ord-cum");
      if (s) s.textContent = fmtInt(m.stepVol);
      if (r) r.textContent = pct(m.stepRate);
      if (c) c.textContent = fmtInt(m.cumVol);
    });
  }

  function syncPlanOrder(planKey, orderIds, sourceKind) {
    const dnd = dndByPlan[planKey];
    if (!dnd || !planKey) return;
    document.querySelectorAll("table.wf-table").forEach((table) => {
      if ((table.getAttribute("data-plan-key") || "") !== planKey) return;
      const kind = table.getAttribute("data-wf-kind") || "";
      if (kind === "swap-src") return;
      const tbody = table.tBodies[0];
      if (!tbody) return;
      if (kind === "post") {
        if (sourceKind !== "post") applyOrderToTbody(tbody, orderIds);
        paintPost(tbody, recomputePost(dnd, orderIds));
      } else if (kind === "pre") {
        if (sourceKind !== "pre") applyOrderToTbody(tbody, orderIds);
        paintPre(tbody, recomputePre(dnd, orderIds));
      }
    });
  }

  function bindWfDnD(tbody, planKey, kind) {
    if (!tbody || tbody.dataset.wfBound === "1") return;
    tbody.dataset.wfBound = "1";
    let dragItem = null, placeholder = null, activePointer = null, orderBefore = "";
    let rafPending = false, lastY = 0;

    function movePlaceholder(y) {
      if (!placeholder || !dragItem) return;
      const rows = Array.from(tbody.querySelectorAll("tr.wf-row")).filter(
        (row) => row !== dragItem && !row.classList.contains("hard")
      );
      let before = null;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) { before = row; break; }
      }
      if (before) tbody.insertBefore(placeholder, before);
      else if (rows.length) tbody.insertBefore(placeholder, rows[rows.length - 1].nextSibling);
    }

    function finish(commit) {
      if (!dragItem || !placeholder) return;
      tbody.insertBefore(dragItem, placeholder);
      placeholder.remove();
      dragItem.classList.remove("wf-dragging", "wf-sort-hidden");
      if (activePointer != null) {
        try { dragItem.releasePointerCapture(activePointer); } catch (e) { /* ignore */ }
      }
      if (commit) {
        const order = readOrder(tbody);
        if (order.join("|") !== orderBefore) syncPlanOrder(planKey, order, kind);
      }
      dragItem = null; placeholder = null; activePointer = null; rafPending = false;
    }

    tbody.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".drag-handle:not(.drag-handle-disabled)")) return;
      const item = e.target.closest("tr.wf-row");
      if (!item || item.classList.contains("hard")) return;
      e.preventDefault();
      dragItem = item;
      activePointer = e.pointerId;
      orderBefore = readOrder(tbody).join("|");
      placeholder = document.createElement("tr");
      placeholder.className = "waterfall-placeholder-row";
      placeholder.innerHTML = '<td colspan="' + item.children.length + '"><div class="waterfall-placeholder"></div></td>';
      tbody.insertBefore(placeholder, item);
      item.classList.add("wf-sort-hidden", "wf-dragging");
      item.setPointerCapture(activePointer);
      lastY = e.clientY;
    });
    tbody.addEventListener("pointermove", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      e.preventDefault();
      lastY = e.clientY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (dragItem && placeholder) movePlaceholder(lastY);
      });
    });
    tbody.addEventListener("pointerup", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      e.preventDefault();
      finish(true);
    });
    tbody.addEventListener("pointercancel", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      finish(false);
    });
  }

  document.querySelectorAll("table.wf-table").forEach((table) => {
    const planKey = table.getAttribute("data-plan-key") || "";
    const kind = table.getAttribute("data-wf-kind") || "";
    if (kind === "swap-src") return; // handled below
    if (!dndByPlan[planKey]) return;
    bindWfDnD(table.tBodies[0], planKey, kind);
  });

  /* —— Swap 用户来源：收起/展开 + 瀑布 DnD（更新序步进） —— */
  document.querySelectorAll("[data-swap-src-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("aria-controls");
      const body = id ? document.getElementById(id) : btn.closest(".swap-src-block")?.querySelector(".swap-src-body");
      if (!body) return;
      const collapsed = body.classList.toggle("is-collapsed");
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.textContent = collapsed ? "展开" : "收起";
    });
  });

  const srcDndByKey = {};
  document.querySelectorAll("script.swap-src-dnd-data").forEach((el) => {
    try {
      const planKey = el.getAttribute("data-plan-key") || "";
      const srcKey = el.getAttribute("data-src-key") || "";
      srcDndByKey[planKey + "::" + srcKey] = JSON.parse(el.textContent || "{}");
    } catch (e) { /* ignore */ }
  });

  function recomputeSrcStep(dnd, orderIds) {
    const n = dnd.n || 0;
    const segApply = dnd.segApply || 0;
    const cum = new Array(n).fill(false);
    const out = {};
    orderIds.forEach((id) => {
      const mask = dnd.masks[id] || [];
      let stepVol = 0;
      for (let i = 0; i < n; i++) {
        if (!cum[i] && mask[i]) {
          stepVol += dnd.apply[i] || 0;
          cum[i] = true;
        }
      }
      out[id] = {
        stepVol,
        stepRate: segApply > 0 ? stepVol / segApply : null,
      };
    });
    return out;
  }

  function paintSrcBars(wrap, metrics, orderIds) {
    if (!wrap) return;
    const max = Math.max(1, ...orderIds.map((id) => (metrics[id] && metrics[id].stepVol) || 0));
    orderIds.forEach((id) => {
      const row = wrap.querySelector('.swap-bar-row[data-rule-id="' + id + '"]');
      if (!row) return;
      const v = metrics[id] ? metrics[id].stepVol : 0;
      const fill = row.querySelector(".bar-fill");
      const val = row.querySelector(".bar-val");
      if (fill) fill.style.width = ((v / max) * 100).toFixed(2) + "%";
      if (val) val.textContent = fmtInt(v);
    });
    // reorder bar rows
    orderIds.forEach((id) => {
      const row = wrap.querySelector('.swap-bar-row[data-rule-id="' + id + '"]');
      if (row) wrap.appendChild(row);
    });
  }

  function paintSrcTable(tbody, metrics) {
    tbody.querySelectorAll("tr.wf-row").forEach((tr) => {
      const id = tr.getAttribute("data-rule-id");
      const m = metrics[id];
      if (!m) return;
      const s = tr.querySelector(".src-step");
      const r = tr.querySelector(".src-step-rate");
      if (s) s.textContent = fmtInt(m.stepVol);
      if (r) r.textContent = pct(m.stepRate);
    });
  }

  function bindSrcWfDnD(tbody, dndKey) {
    if (!tbody || tbody.dataset.wfBound === "1") return;
    tbody.dataset.wfBound = "1";
    const dnd = srcDndByKey[dndKey];
    if (!dnd) return;
    let dragItem = null, placeholder = null, activePointer = null, orderBefore = "";
    let rafPending = false, lastY = 0;

    function movePlaceholder(y) {
      if (!placeholder || !dragItem) return;
      const rows = Array.from(tbody.querySelectorAll("tr.wf-row")).filter(
        (row) => row !== dragItem && !row.classList.contains("hard")
      );
      let before = null;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) { before = row; break; }
      }
      if (before) tbody.insertBefore(placeholder, before);
      else if (rows.length) tbody.insertBefore(placeholder, rows[rows.length - 1].nextSibling);
    }

    function finish(commit) {
      if (!dragItem || !placeholder) return;
      tbody.insertBefore(dragItem, placeholder);
      placeholder.remove();
      dragItem.classList.remove("wf-dragging", "wf-sort-hidden");
      if (activePointer != null) {
        try { dragItem.releasePointerCapture(activePointer); } catch (e) { /* ignore */ }
      }
      if (commit) {
        const order = readOrder(tbody);
        if (order.join("|") !== orderBefore) {
          const metrics = recomputeSrcStep(dnd, order);
          paintSrcTable(tbody, metrics);
          const table = tbody.closest("table");
          const block = table && table.closest(".swap-src-body, .swap-src-block");
          const bars = block && table.parentElement && table.parentElement.previousElementSibling;
          const barWrap = (table.parentElement && table.parentElement.previousElementSibling && table.parentElement.previousElementSibling.matches && table.parentElement.previousElementSibling.matches("[data-src-bars]"))
            ? table.parentElement.previousElementSibling
            : (block && block.querySelector("[data-src-bars]"));
          // prefer bars immediately before table-wrap
          let chart = null;
          if (table.parentElement && table.parentElement.previousElementSibling) {
            const prev = table.parentElement.previousElementSibling;
            if (prev.hasAttribute && prev.hasAttribute("data-src-bars")) chart = prev;
          }
          paintSrcBars(chart || barWrap, metrics, order);
        }
      }
      dragItem = null; placeholder = null; activePointer = null; rafPending = false;
    }

    tbody.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".drag-handle:not(.drag-handle-disabled)")) return;
      const item = e.target.closest("tr.wf-row");
      if (!item || item.classList.contains("hard")) return;
      e.preventDefault();
      dragItem = item;
      activePointer = e.pointerId;
      orderBefore = readOrder(tbody).join("|");
      placeholder = document.createElement("tr");
      placeholder.className = "waterfall-placeholder-row";
      placeholder.innerHTML = '<td colspan="' + item.children.length + '"><div class="waterfall-placeholder"></div></td>';
      tbody.insertBefore(placeholder, item);
      item.classList.add("wf-sort-hidden", "wf-dragging");
      item.setPointerCapture(activePointer);
      lastY = e.clientY;
    });
    tbody.addEventListener("pointermove", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      e.preventDefault();
      lastY = e.clientY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (dragItem && placeholder) movePlaceholder(lastY);
      });
    });
    tbody.addEventListener("pointerup", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      e.preventDefault();
      finish(true);
    });
    tbody.addEventListener("pointercancel", (e) => {
      if (!dragItem || e.pointerId !== activePointer) return;
      finish(false);
    });
  }

  document.querySelectorAll("table.swap-src-table").forEach((table) => {
    const planKey = table.getAttribute("data-plan-key") || "";
    const srcKey = table.getAttribute("data-src-key") || "";
    bindSrcWfDnD(table.tBodies[0], planKey + "::" + srcKey);
  });

  /* —— 章节 / 子模块收起（仅收起，不隐藏；localStorage 记忆） —— */
  const COLLAPSE_LS = "admission-report-collapse-v1";
  function loadCollapseState() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_LS) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveCollapseState(state) {
    try { localStorage.setItem(COLLAPSE_LS, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function setCollapsed(el, collapsed) {
    el.classList.toggle("is-collapsed", collapsed);
    const btn = el.querySelector(":scope > .collapse-head .collapse-toggle");
    if (!btn) return;
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.textContent = collapsed ? "展开" : "收起";
  }
  const collapseState = loadCollapseState();
  document.querySelectorAll("[data-collapse-key]").forEach((el) => {
    const key = el.getAttribute("data-collapse-key");
    if (!key || !(key in collapseState)) return;
    setCollapsed(el, !!collapseState[key]);
  });
  document.querySelectorAll(".collapse-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const host = btn.closest("[data-collapse-key]");
      if (!host) return;
      const key = host.getAttribute("data-collapse-key");
      const collapsed = !host.classList.contains("is-collapsed");
      setCollapsed(host, collapsed);
      if (key) {
        collapseState[key] = collapsed;
        saveCollapseState(collapseState);
      }
    });
  });

  /* —— 左侧目录：滚动高亮 + 移动端抽屉 —— */
  const toc = document.getElementById("reportToc");
  const tocBtn = document.getElementById("tocMobileBtn");
  const tocBackdrop = document.getElementById("tocBackdrop");
  function closeToc() {
    if (toc) toc.classList.remove("is-open");
    if (tocBackdrop) tocBackdrop.classList.remove("is-open");
  }
  function openToc() {
    if (toc) toc.classList.add("is-open");
    if (tocBackdrop) tocBackdrop.classList.add("is-open");
  }
  if (tocBtn) tocBtn.addEventListener("click", () => {
    if (toc && toc.classList.contains("is-open")) closeToc();
    else openToc();
  });
  if (tocBackdrop) tocBackdrop.addEventListener("click", closeToc);
  function revealTocTarget(el) {
    if (!el) return;
    const hosts = [];
    const sec = el.closest(".report-section");
    if (sec) hosts.push(sec);
    if (el.classList.contains("submodule") || el.hasAttribute("data-collapse-key")) hosts.push(el);
    hosts.forEach((host) => {
      if (!host.classList.contains("is-collapsed")) return;
      setCollapsed(host, false);
      const key = host.getAttribute("data-collapse-key");
      if (key) {
        collapseState[key] = false;
        saveCollapseState(collapseState);
      }
    });
  }
  document.querySelectorAll("[data-toc-link]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-toc-link");
      const el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      revealTocTarget(el);
      closeToc();
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "start" });
        try { history.replaceState(null, "", "#" + id); } catch (err) { /* ignore */ }
      });
    });
  });
  const tocLinks = Array.from(document.querySelectorAll("[data-toc-link]"));
  function tocTargetTop(el) {
    return el.getBoundingClientRect().top + window.scrollY;
  }
  function tocTargetVisible(el) {
    const sec = el.closest(".report-section");
    if (sec && sec.classList.contains("is-collapsed") && el !== sec) return false;
    return true;
  }
  function syncTocActive() {
    const targets = tocLinks
      .map((a) => document.getElementById(a.getAttribute("data-toc-link") || ""))
      .filter((el) => el && tocTargetVisible(el));
    if (!targets.length) return;
    const y = window.scrollY + 96;
    let active = targets[0];
    for (const el of targets) {
      if (tocTargetTop(el) <= y) active = el;
    }
    tocLinks.forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-toc-link") === active.id);
      a.classList.remove("is-parent-active");
    });
    const activeLink = tocLinks.find((a) => a.getAttribute("data-toc-link") === active.id);
    const group = activeLink && activeLink.closest(".toc-group");
    if (group && activeLink.classList.contains("toc-sub-link")) {
      const parentA = group.querySelector(":scope > a");
      if (parentA && parentA !== activeLink) parentA.classList.add("is-parent-active");
    }
  }
  window.addEventListener("scroll", syncTocActive, { passive: true });
  syncTocActive();

  function fmtPctJs(x) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return (Number(x) * 100).toFixed(2) + "%";
  }
  function fmtLiftJs(x) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return Number(x).toFixed(2);
  }
  function fmtNumJs(x) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return Number(x).toLocaleString("zh-CN");
  }
  document.querySelectorAll("[data-bin-combo]").forEach((wrap) => {
    const tip = wrap.querySelector(".bin-combo-tip");
    const raw = wrap.querySelector(".bin-combo-data");
    const plot = wrap.querySelector(".bin-combo-plot");
    const svg = wrap.querySelector("svg");
    if (!tip || !raw || !plot || !svg) return;
    let rows = [];
    try { rows = JSON.parse(raw.value || raw.textContent || "[]"); } catch (e) { return; }
    if (!rows.length) return;
    const padL = Number(wrap.getAttribute("data-pad-l") || 48);
    const padR = Number(wrap.getAttribute("data-pad-r") || 70);
    const vbW = Number(wrap.getAttribute("data-vb-w") || 720);
    function hideTip() { tip.hidden = true; }
    function showTip(e) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const x = (e.clientX - r.left) * (vbW / r.width);
      if (x < padL || x > vbW - padR) { hideTip(); return; }
      const i = Math.min(rows.length - 1, Math.max(0, Math.floor((x - padL) / ((vbW - padL - padR) / rows.length))));
      const p = rows[i];
      if (!p) { hideTip(); return; }
      tip.hidden = false;
      tip.innerHTML =
        "<div><b>箱 " + p.i + "</b> · <code>" + String(p.label || "").replace(/</g, "&lt;") + "</code></div>" +
        "<div><span class='k'>分子/分母</span> " + fmtNumJs(p.num) + "/" + fmtNumJs(p.den) + "</div>" +
        "<div><span class='k'>分母占比</span> " + fmtPctJs(p.denShare) + "</div>" +
        "<div><span class='k'>风险</span> " + fmtPctJs(p.rate) + "</div>" +
        "<div><span class='k'>Lift</span> " + fmtLiftJs(p.lift) + "</div>";
      let left = e.clientX + 14;
      let top = e.clientY + 14;
      const tw = tip.offsetWidth || 180;
      const th = tip.offsetHeight || 90;
      if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 12;
      if (top + th > window.innerHeight - 8) top = e.clientY - th - 12;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    }
    plot.addEventListener("mousemove", showTip);
    plot.addEventListener("mouseleave", hideTip);
  });
})();
`;

  // Section bodies (for shell + collapse wrappers)
  const scopeBody = `<p class="scope-lead">本报告在指定客群与时间窗内，用与主站同源的 <code>RV.domain</code> 运行时完成挖规与测算。训练窗用于挖规、跨月门禁、剪枝与方案主结论；${
        j.windows.backtest
          ? "回测窗在规则冻结后重算 Swap 风险预估与贷后瀑布，不重挖。"
          : "本轮未指定回测窗。"
      }</p>
      <ul class="scope-list">
        <li><span class="k">计算路径</span>domain 运行时（非 HTML 页面重算）</li>
        <li><span class="k">迭代客群</span>${segmentFiltersHtml(j.segment)}（客群行 n=${j.segment.n ?? "—"}）</li>
        <li><span class="k">决策组</span>${decisionScopeHtml(j.decision)}</li>
        <li><span class="k">训练·贷后</span><code>${esc(j.windows.train?.post || j.windows.post)}</code> · 窗内贷后 B=${j.segment.postB ?? "—"}</li>
        <li><span class="k">训练·贷前</span><code>${esc(j.windows.train?.pre || j.windows.pre)}</code> · 窗内贷前 B=${j.segment.preB ?? "—"}</li>
        ${
          j.windows.backtest
            ? `<li><span class="k">回测·贷后</span><code>${esc(j.windows.backtest.post)}</code> · 窗内贷后 B=${j.segment.backtest?.postB ?? "—"}</li>
        <li><span class="k">回测·贷前</span><code>${esc(j.windows.backtest.pre)}</code>${
                j.windows.backtest.preSameAsTrain ? "（与训练贷前相同）" : ""
              } · 窗内贷前 B=${j.segment.backtest?.preB ?? "—"}</li>`
            : ""
        }
        <li><span class="k">覆盖月份</span>${esc(months.join("、")) || "—"}（训练窗内出现的 submit_month）</li>
        <li><span class="k">风险口径</span>业务 <code>fpd1_cnt%</code>（命中子集 Σfz/Σfm）；方案通过率主口径为策略放行率</li>
        <li><span class="k">线上 Soft</span>${(j.baselineSoftOnline || []).map((x) => `<code>${esc(x)}</code>`).join(" · ") || "—"}（Swap 对照「线上」侧）</li>
        <li><span class="k">新策略 Soft</span>${
          (j.baselineSoftNewDrop || j.baselineSoftOffline || []).length
            ? `不含：${(j.baselineSoftNewDrop || j.baselineSoftOffline || []).map((x) => `<code>${esc(x)}</code>`).join(" · ")}；其余线上软仍叠加 + Candidates`
            : "与线上 Soft 相同（全量叠加）+ Candidates"
        }</li>
        <li><span class="k">Swap 线上</span>${esc(
          j.swapOnline?.note ||
            j.gateOverrides?.swapOnlineNote ||
            (j.gateOverrides?.useHistPassOnline || j.swapOnline?.useHistPassOnline
              ? "软规则空时线上通过=通过量===1"
              : "硬∪线上 Soft")
        )}</li>
        <li><span class="k">Baseline 放行</span>${
          j.baselineOnline?.pass?.rate != null
            ? `${pct(j.baselineOnline.pass.rate)}${
                j.baselineOnline.useHistPassOnline || j.gateOverrides?.useHistPassOnline
                  ? "（软规则空→历史通过量）"
                  : ""
              }`
            : "—"
        }</li>
      </ul>`;
  const riskPlanRhat =
    j.planDetails?.risk?.swap?.Rhat?.R ?? j.planDetails?.risk?.impact?.train?.rhat;
  const passPlanRhat =
    j.planDetails?.pass?.swap?.Rhat?.R ?? j.planDetails?.pass?.impact?.train?.rhat;
  const decisionBody = `<div class="module-stack">
        ${submoduleHtml(
          "结.1",
          "双方案灯条",
          `<div class="decision-grid">
        <div class="decision-strip ${rLamp}">
          <span class="decision-badge">${lampLabel[rLamp]}</span>
          <div class="decision-title">风险方案</div>
          ${decisionListHtml([
            {
              k: "主指标",
              v: `方案后 B 风险（观测） <b>${pct(rp.risk?.rate)}</b> · 预估 R̂ <b>${pct(riskPlanRhat)}</b> vs 目标 ${pct(tRisk)}（现状 ${pct(riskB.rate)}）`,
            },
            {
              k: "相对偏差",
              v: `风险超标 ${Number.isFinite(riskPlanRiskDev) ? riskPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(riskPlanPassDev) ? riskPlanPassDev.toFixed(2) : "—"}%（任一≥${auxBandPct.toFixed(0)}% 红灯）`,
            },
            {
              k: "规则",
              v: `${riskPlanRules.length} 条${rp.gap ? ` · ${esc(rp.gap)}` : ""}`,
            },
          ])}
        </div>
        <div class="decision-strip ${pLamp}">
          <span class="decision-badge">${lampLabel[pLamp]}</span>
          <div class="decision-title">通过率方案</div>
          ${decisionListHtml([
            {
              k: "主指标",
              v: `方案后 B 策略放行率 <b>${pct(ppPlan.pass?.rate)}</b> vs 目标 ${pct(tPass)}`,
            },
            {
              k: "相对偏差",
              v: `风险超标 ${Number.isFinite(passPlanRiskDev) ? passPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(passPlanPassDev) ? passPlanPassDev.toFixed(2) : "—"}%（任一≥${auxBandPct.toFixed(0)}% 红灯）`,
            },
            {
              k: "规则",
              v: `${passPlanRules.length} 条${ppPlan.gap ? ` · ${esc(ppPlan.gap)}` : ""}`,
            },
          ])}
        </div>
      </div>`
        )}
        ${submoduleHtml(
          "结.1b",
          "训练 / 回测 · 影响对照",
          `<div class="module-stack" style="gap:1rem">
            <div>
              <h4 style="margin:0 0 .35rem;font-size:.9rem">风险方案</h4>
              ${impactTableHtml(j.planDetails?.risk?.impact, null, { caliber: false })}
            </div>
            <div>
              <h4 style="margin:0 0 .35rem;font-size:.9rem">通过率方案</h4>
              ${impactTableHtml(j.planDetails?.pass?.impact, null, { caliber: false })}
            </div>
            ${impactCaliberHtml()}
          </div>`,
          false,
          { id: "toc-decision-1b" }
        )}
        ${submoduleHtml(
          "结.2",
          "方案规则与影响摘要",
          `${currentRulesHtml()}
          <div class="plan-tabs-wrap" style="margin-top:.85rem">
            <div class="tabs" role="tablist" aria-label="结.2 双方案">
              <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-plan-tab="decision-2-panel-risk">风险方案</button>
              <button type="button" class="tab-btn" role="tab" aria-selected="false" data-plan-tab="decision-2-panel-pass">通过率方案</button>
            </div>
            <div class="plan-tab-panels">
              <div class="plan-panel is-active" id="decision-2-panel-risk" data-plan-panel role="tabpanel">${planImpactSummaryHtml({
                rules: riskPlanRules,
                planKey: "risk",
              })}</div>
              <div class="plan-panel" id="decision-2-panel-pass" data-plan-panel role="tabpanel">${planImpactSummaryHtml({
                rules: passPlanRules,
                planKey: "pass",
                sameAsRisk: candListsEqual(riskPlanRules, passPlanRules) && riskPlanRules.length > 0,
              })}</div>
            </div>
          </div>`,
          false,
          { id: "toc-decision-2" }
        )}
      </div>`;
  const statusBody = `<div class="module-stack">
        ${submoduleHtml(
          "1.1",
          "B/A 现状指标",
          `<div class="metric-cards">
        <div class="metric-card">
          <div class="val bad">${pct(riskB.rate)}</div>
          <div class="sub">${riskB.n}/${riskB.d} · 样本 ${riskB.rows}</div>
          <div class="lbl">B 贷后风险 · ${pp(riskGap)} vs 目标 ${pct(tRisk)}</div>
        </div>
        <div class="metric-card">
          <div class="val good">${pct(passB.rate)}</div>
          <div class="sub">${passB.pass}/${passB.apply}</div>
          <div class="lbl">B 贷前通过率（历史）· ${pp(passGap)} vs 目标 ${pct(tPass)}</div>
        </div>
        <div class="metric-card">
          <div class="val">${pct(riskA.rate)}</div>
          <div class="sub">${riskA.n}/${riskA.d}</div>
          <div class="lbl">A 贷后风险</div>
        </div>
        <div class="metric-card">
          <div class="val">${pct(passA.rate)}</div>
          <div class="sub">${passA.pass}/${passA.apply}</div>
          <div class="lbl">A 贷前通过率（历史）</div>
        </div>
      </div>`
        )}
        ${submoduleHtml("1.1b", "A/B 组分月风险（训练贷后窗）", statusRiskByMonthHtml())}
        ${submoduleHtml(
          "1.2",
          "在用模型指标",
          `<p class="hint">点击表头排序 · by 月 KS 分列</p>
        ${metricTable(inUse, "tbl-inuse")}`
        )}
        ${submoduleHtml(
          "1.3",
          "等频分箱（最强列默认展开 · 其余可折叠）",
          `<p class="hint">行为箱、列为整体/分月（风险 + 分子/分母）· 默认等频 5 箱 · 取值数 &lt; 12 则按枚举值升序 · 上方组合图：分母占比柱 + 风险/Lift 折线（悬停明细）· 风险格青→橙色阶</p>
        ${best ? modelBinSection(best, true) : "<p class='muted'>—</p>"}
        ${inUse
          .filter((b) => !best || b.col !== best.col)
          .map((b) => modelBinSection(b, false))
          .join("\n")}`
        )}
      </div>`;
  const potentialBody = `<div class="module-stack">
        ${submoduleHtml(
          "2.1",
          "潜在模型指标（KS Top）",
          `<p class="hint">点击表头排序 · by 月 KS 分列</p>
      ${metricTable(potential.length ? potential : inUse.filter((b) => (j.top10 || []).some((t) => t.col === b.col)), "tbl-potential")}`
        )}
        ${submoduleHtml(
          "2.2",
          "潜在模型分箱（箱 × 分月）",
          `${(potential.length ? potential : [])
            .map((b, i) => modelBinSection(b, i === 0))
            .join("\n") || "<p class='muted'>（无 potentialBlocks，请先跑 enrich）</p>"}`
        )}
      </div>`;
  const mineBody = `<div class="module-stack">
        ${submoduleHtml(
          "6.1",
          "挖规门禁与覆盖",
          `<div class="cfg-grid">
        <div>轮次 / Candidates<br><b>≤10 轮 / ≤6 条 · 全流程采纳 ${cands.length}</b></div>
        <div class="cfg-gate-cell">门禁<br>
          <div class="gate-chip-row">${gateChipsHtml(gateBullets, mineGateExtraChips)}</div>
          ${gateDetailsHtml(
            [
              ...gateBullets,
              {
                id: "fpd1",
                label: mineGateExtraChips[0],
                detail: "跨月门禁：各月命中风险（fpd1_cnt%）须高于该阈值",
              },
            ],
            "门禁细则（与口径与自查同源）"
          )}
        </div>
        <div>月覆盖<br><b>${esc(months.join(" / "))}</b></div>
        <div>风险口径<br><b>fpd1_cnt% · Swap/瀑布同源 domain</b></div>
        <div>切点方向<br><div class="gate-chip-row"><span class="rv-chip rv-chip-muted">${esc(
          (j.gateOverrides?.allowedOperators || ["gte"]).join("/")
        )}</span></div></div>
        ${crossMinePairHtml(j)}
      </div>`,
          false,
          { key: "mine-6.1" }
        )}
        ${submoduleHtml(
          "6.2",
          "Candidates 摘要",
          `<p class="hint">本轮全流程采纳 <b>${cands.length}</b> 条（明细见「双方案详情」；方案叠规可能回退部分，见方案概要试装轨迹）。</p>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>#</th><th>表达式</th><th class="num">命中进件</th><th class="num">风险</th><th class="num">Lift</th></tr></thead>
          <tbody>${(cands.length ? cands : []).map((c, i) => {
            const hit = c.meta?.hitApplyVol ?? c.hitApplyVol ?? c.hit ?? c.hitCount;
            const risk = c.meta?.badRate ?? c.badRate;
            const lift = c.meta?.lift ?? c.lift;
            return `<tr>
            <td>${i + 1}</td>
            <td><code>${esc(c.name || c.expr || "—")}</code></td>
            <td class="num">${hit != null ? hit : "—"}</td>
            <td class="num">${risk != null ? pct(risk) : "—"}</td>
            <td class="num">${lift != null && Number.isFinite(Number(lift)) ? Number(lift).toFixed(3) : "—"}</td>
          </tr>`;
          }).join("") || `<tr><td colspan="5" class="muted">（无 Candidates）</td></tr>`}</tbody>
        </table></div>`,
          false,
          { key: "mine-6.2", id: "toc-mine-cands" }
        )}
        ${submoduleHtml(
          "6.3",
          "挖规采纳轮次",
          mineRoundsHtml(j.mineRounds),
          false,
          { key: "mine-6.3", id: "toc-mine-rounds" }
        )}
        ${submoduleHtml(
          "6.4",
          "潜在池定义",
          potentialPoolHtml(j),
          true,
          { key: "mine-6.4" }
        )}
        ${submoduleHtml(
          "6.5",
          "残差已挖未入选",
          residualNotAdoptedHtml(residualRows, plansDualOk),
          false,
          {
            key: "mine-6.5",
            id: "toc-mine-residual",
            collapsed: !(missDual && residualRows.length),
          }
        )}
      </div>`;
  const metaBody = `<div class="module-stack">
        ${submoduleHtml(
          "摘.1",
          "样本量 chip",
          `<div class="rv-wb-meta">
        <span class="rv-chip">客群 n=${j.segment.n}</span>
        <span class="rv-chip">训练贷后 B=${j.segment.postB}</span>
        <span class="rv-chip">训练贷前 B=${j.segment.preB}</span>
        <span class="rv-chip">回测贷后 B=${j.segment.backtest?.postB ?? "—"}</span>
        <span class="rv-chip">回测贷前 B=${j.segment.backtest?.preB ?? "—"}</span>
        <span class="rv-chip rv-chip-muted">k=${j.targets.k}</span>
        <span class="rv-chip rv-chip-muted">Candidates ${cands.length}</span>
        <span class="rv-chip rv-chip-muted">path=domain</span>
      </div>`
        )}
        ${submoduleHtml(
          "摘.2",
          "目标与时间窗",
          `<div class="cfg-grid">
        <div>训练·风险目标 / 窗<br><b>${pct(tRisk)}</b> · <code>${esc(j.windows.train?.post || j.windows.post)}</code></div>
        <div>训练·通过率目标 / 窗<br><b>${pct(tPass)}</b> · <code>${esc(j.windows.train?.pre || j.windows.pre)}</code></div>
        <div>回测·贷后窗<br><b><code>${esc(j.windows.backtest?.post || "—")}</code></b></div>
        <div>回测·贷前窗<br><b><code>${esc(j.windows.backtest?.pre || "—")}</code></b>${
          j.windows.backtest?.preSameAsTrain ? `<div class="sub muted">与训练贷前相同</div>` : ""
        }</div>
        <div>切点方向<br><div class="gate-chip-row"><span class="rv-chip rv-chip-muted">${esc(
          (j.gateOverrides?.allowedOperators || ["gte"]).join("/")
        )}</span></div><span class="muted">${esc(
          j.gateOverrides?.operatorNote || "仅 gte（分数≥阈值）"
        )}</span></div>
        <div>风险口径<br><b>fpd1_cnt%（命中 Σfz/Σfm）</b></div>
      </div>`
        )}
        ${submoduleHtml(
          "摘.3",
          "挖规门禁覆盖",
          `<div class="gate-chip-row">${gateChipsHtml(gateBullets)}</div>
        ${gateDetailsHtml(gateBullets, "门禁与口径细则")}`
        )}
        ${submoduleHtml(
          "6.1",
          "对照表（风险方案 vs 通过率方案）",
          `<div class="table-wrap">
        <table class="data-table plan-compare-table">
          <thead><tr><th>项</th><th>风险方案</th><th>通过率方案</th></tr></thead>
          <tbody>
            <tr><td>规则数</td><td>${riskPlanRules.length}</td><td>${passPlanRules.length}</td></tr>
            <tr><td>规则</td><td class="muted">${riskPlanRules.map((r) => `<code>${esc(r)}</code>`).join("<br>") || "—"}</td><td class="muted">${passPlanRules.map((r) => `<code>${esc(r)}</code>`).join("<br>") || "—"}</td></tr>
            <tr><td>B 风险</td><td>${pct(rp.risk?.rate)}（${rp.risk?.n}/${rp.risk?.d}）</td><td>${pct(ppPlan.risk?.rate)}（${ppPlan.risk?.n}/${ppPlan.risk?.d}）</td></tr>
            <tr><td>B 策略放行率</td><td>${pct(rp.pass?.rate)}${rp.pass?.admit != null ? `（${rp.pass.admit}/${rp.pass.apply}）` : ""}</td><td>${pct(ppPlan.pass?.rate)}${ppPlan.pass?.admit != null ? `（${ppPlan.pass.admit}/${ppPlan.pass.apply}）` : ""}</td></tr>
            <tr><td>主停止</td><td>≤${pct(tRisk)}？ <strong>${riskPlanOk ? "是" : "否"}</strong></td><td>放行率≥${pct(tPass)}？ <strong>${passPlanOk ? "是" : "否"}</strong></td></tr>
            <tr><td>相对偏差（任一≥${auxBandPct.toFixed(0)}%红灯）</td><td>风险超标 ${Number.isFinite(riskPlanRiskDev) ? riskPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(riskPlanPassDev) ? riskPlanPassDev.toFixed(2) : "—"}%</td><td>风险超标 ${Number.isFinite(passPlanRiskDev) ? passPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(passPlanPassDev) ? passPlanPassDev.toFixed(2) : "—"}%</td></tr>
            <tr><td>灯</td><td><span class="lamp ${rLamp}">${lampLabel[rLamp]}</span></td><td><span class="lamp ${pLamp}">${lampLabel[pLamp]}</span></td></tr>
          </tbody>
        </table>
      </div>`
        )}
        ${submoduleHtml(
          "6.2",
          "采纳与现状偏差",
          `<p>${cands.length ? `已采纳 ${cands.length} 条 Candidates。` : "未跑增量有效性。"}现状通过率 ${pct(passB.rate)}（${pp(passGap)} vs 目标 ${pct(tPass)}）。</p>`
        )}
        ${submoduleHtml(
          "6.3",
          "自查灯表",
          `<div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>项</th><th>灯</th><th>动作</th></tr></thead>
          <tbody>
            <tr><td>命中进件量门槛</td><td><span class="lamp warn">黄</span></td><td class="muted">${esc(gateBullets[0]?.label || "命中进件≥30")} · 分月小样本不稳定</td></tr>
            <tr><td>风险方案灯</td><td><span class="lamp ${rLamp}">${lampLabel[rLamp]}</span></td><td class="muted">风险超标 ${Number.isFinite(riskPlanRiskDev) ? riskPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(riskPlanPassDev) ? riskPlanPassDev.toFixed(2) : "—"}%（任一≥${auxBandPct.toFixed(0)}% 红灯）</td></tr>
            <tr><td>通过率方案灯</td><td><span class="lamp ${pLamp}">${lampLabel[pLamp]}</span></td><td class="muted">风险超标 ${Number.isFinite(passPlanRiskDev) ? passPlanRiskDev.toFixed(2) : "—"}% · 放行 ${Number.isFinite(passPlanPassDev) ? passPlanPassDev.toFixed(2) : "—"}%（任一≥${auxBandPct.toFixed(0)}% 红灯）</td></tr>
          </tbody>
        </table>
      </div>`
        )}
      </div>`;
  const appendixBody = `<div class="module-stack">
        ${submoduleHtml(
          "附.1",
          "挖规残差近失（含按月）",
          `<p class="hint">口径=<b>挖规工作样本残差</b>：训练贷后窗·B·未命中硬∪Baseline软·再去掉当时已采纳 Candidates。分月覆盖训练窗全月；跨月硬门禁仍看近 3 月（见「未过原因」）。命中进件=Σ进件；风险样本量=Σfpd1_cnt_fm；fpd1/Lift=业务 <code>fpd1_cnt%</code>。</p>
      ${nearMissTable()}`,
          false,
          { key: "appendix-1", id: "toc-appendix-1" }
        )}
        ${submoduleHtml(
          "附.2",
          "训练贷后窗 B 规则命中（含按月）",
          `<p class="hint">口径=<b>第1轮挖规工作样本</b>：训练贷后窗·B·未命中硬∪Baseline软，<b>不含</b> Candidates 残差。规则集=Candidates ∪ 近失 ∪ mineLog（expr 去重）。用于与全量 B（扣硬）自查对齐。</p>
      ${postBHitTable()}`,
          false,
          { key: "appendix-2", id: "toc-appendix-2" }
        )}
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(reportTitle)}</title>
<style>
${themeCss}
${shellCss}
</style>
</head>
<body>
<header class="app-header">
  <h1>${esc(reportTitle)}</h1>
</header>
<button type="button" class="toc-mobile-btn" id="tocMobileBtn" aria-controls="reportToc">目录</button>
<div class="report-toc-backdrop" id="tocBackdrop"></div>
<div class="report-shell">
<aside class="report-toc" id="reportToc" aria-label="报告目录">
  <div class="toc-title">目录</div>
  <nav>
      <a href="#tab-admission-scope" data-toc-link="tab-admission-scope">样本口径</a>
      <div class="toc-group">
        <a href="#tab-admission-decision" data-toc-link="tab-admission-decision">结论</a>
        <div class="toc-sub">
          <a class="toc-sub-link" href="#toc-decision-1b" data-toc-link="toc-decision-1b">结.1b 影响对照</a>
          <a class="toc-sub-link" href="#toc-decision-2" data-toc-link="toc-decision-2">结.2 规则与瀑布</a>
        </div>
      </div>
      <a href="#tab-admission-plan-eval" data-toc-link="tab-admission-plan-eval">方案评估</a>
      <a href="#tab-admission-plans-detail" data-toc-link="tab-admission-plans-detail">双方案详情</a>
      <a href="#tab-admission-status" data-toc-link="tab-admission-status">现状对照</a>
      <a href="#tab-admission-potential" data-toc-link="tab-admission-potential">潜在模型</a>
      <div class="toc-group">
        <a href="#tab-admission-mine" data-toc-link="tab-admission-mine">挖规过程</a>
        <div class="toc-sub">
          <a class="toc-sub-link" href="#toc-mine-cands" data-toc-link="toc-mine-cands">6.2 Candidates</a>
          <a class="toc-sub-link" href="#toc-mine-rounds" data-toc-link="toc-mine-rounds">6.3 采纳轮次</a>
          <a class="toc-sub-link" href="#toc-mine-residual" data-toc-link="toc-mine-residual">6.5 残差未入选</a>
        </div>
      </div>
      <a href="#tab-admission-meta" data-toc-link="tab-admission-meta">口径与自查</a>
      <div class="toc-group">
        <a href="#tab-admission-appendix" data-toc-link="tab-admission-appendix">附录·近失</a>
        <div class="toc-sub">
          <a class="toc-sub-link" href="#toc-appendix-1" data-toc-link="toc-appendix-1">附.1 近失</a>
          <a class="toc-sub-link" href="#toc-appendix-2" data-toc-link="toc-appendix-2">附.2 规则命中</a>
        </div>
      </div>
  </nav>
</aside>
<main class="content">
  <div class="report-document">

${sectionHtml("tab-admission-scope", "样本口径", scopeBody, { className: "sample-scope", toc: "样本口径" })}

${sectionHtml("tab-admission-decision", "1. 结论（决策条）", decisionBody, { toc: "结论" })}

${sectionHtml(
      "tab-admission-plan-eval",
      "2. 方案评估（分箱 · 分月命中 · 分月瀑布）",
      planEvalTabsHtml(j.planDetails?.risk, j.planDetails?.pass),
      { toc: "方案评估" }
    )}

${sectionHtml(
      "tab-admission-plans-detail",
      "3. 双方案详情",
      planTabsHtml(j.planDetails?.risk, j.planDetails?.pass, pct(tRisk), pct(tPass)),
      { toc: "双方案详情" }
    )}

${sectionHtml("tab-admission-status", "4. 现状对照", statusBody, { collapsed: true, toc: "现状对照" })}

${sectionHtml("tab-admission-potential", "5. 潜在模型（挖规池）", potentialBody, { collapsed: true, toc: "潜在模型" })}

${sectionHtml("tab-admission-mine", "6. 挖规过程", mineBody, { collapsed: !missDual, toc: "挖规过程" })}

${sectionHtml("tab-admission-meta", "7. 口径与自查", metaBody, { collapsed: true, toc: "口径与自查" })}

${sectionHtml("tab-admission-appendix", "附录. 挖规近失（含按月）", appendixBody, { collapsed: true, toc: "附录·近失" })}

  </div>
</main>
</div>
<script>
${clientJs}
</script>
</body>
</html>
`;

    return html;
  }

  return { buildReportHtml };
});
