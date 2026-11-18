#!/usr/bin/env python3
"""Rebuild the public platform page with the same charts as the monitor.

Numbers are invented. Partner ids are P-01..P-06, not real platforms.
The chart engine is the monitor's drawing code with the data arrays removed.
"""

import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "platform" / "engine.js"
CSS = ROOT / "platform" / "monitor.css"
OUT = ROOT / "platform" / "index.html"

MONTHS = []
y, m = 2025, 8
while (y, m) <= (2026, 10):
    MONTHS.append(f"{y:04d}-{m:02d}")
    m += 1
    if m == 13:
        m = 1
        y += 1

# name, systems, first month, base monthly applies, pass rate, ticket
PARTNERS = [
    ("P-01", ("android", "ios"), "2025-08", 3800, 0.68, 6200),
    ("P-02", ("ios",), "2025-08", 1600, 0.73, 7100),
    ("P-03", ("android",), "2025-08", 2400, 0.64, 5400),
    ("P-04", ("android", "ios"), "2025-11", 1400, 0.66, 5800),
    ("P-05", ("ios",), "2026-04", 800, 0.71, 7600),
    ("P-06", ("android",), "2026-06", 650, 0.61, 4900),
]
METRICS = ["fpd1", "fpd7", "fpd30", "spd1", "spd7", "spd30", "tpd1", "tpd7", "tpd30"]
HORIZON = {name: i for i, name in enumerate(METRICS)}
BASE_RISK = {
    "fpd1": 0.19, "fpd7": 0.26, "fpd30": 0.33,
    "spd1": 0.17, "spd7": 0.23, "spd30": 0.30,
    "tpd1": 0.15, "tpd7": 0.21, "tpd30": 0.27,
}


def month_index(value):
    return MONTHS.index(value)


def build_rows(rng):
    pass_rows = []
    risk_rows = []
    reloan_rows = []
    cohorts = {}
    last = len(MONTHS) - 1
    for name, systems, start, base_apply, base_pass, ticket in PARTNERS:
        sys_w = {"android": 0.68, "ios": 0.32} if len(systems) == 2 else {systems[0]: 1}
        for am in MONTHS:
            if am < start:
                continue
            age = month_index(am)
            for system in systems:
                for kind, kind_w, pass_adj, use_adj in (
                    ("首借", 0.58, 0.02, -0.03),
                    ("复借", 0.42, -0.035, 0.04),
                ):
                    wave = 0.04 * ((age % 5) - 2) / 2
                    apply_n = int(base_apply * sys_w[system] * kind_w * (1 + 0.012 * age + wave) * rng.uniform(0.92, 1.08))
                    apply_n = max(apply_n, 40)
                    pass_rate = min(0.86, max(0.42, base_pass + pass_adj + (0.012 if system == "ios" else 0) - 0.003 * age + rng.uniform(-0.015, 0.015)))
                    passed = max(1, int(apply_n * pass_rate))
                    use_rate = min(0.95, max(0.55, 0.81 + use_adj + rng.uniform(-0.03, 0.03)))
                    loans = max(1, int(passed * use_rate))
                    amount = round(passed * ticket * rng.uniform(0.94, 1.06), 2)
                    pass_rows.append({"p": name, "am": am, "s": system, "r": kind, "a": apply_n, "n": passed, "m": amount, "l": loans})

                    risk = {"p": name, "lm": am, "am": am, "s": system, "r": kind}
                    remain = last - age
                    for metric in METRICS:
                        if remain < HORIZON[metric]:
                            risk[metric] = [0, 0, 0, 0]
                            continue
                        rate = BASE_RISK[metric] + (0.02 if kind == "复借" else 0) + (0.01 if name in ("P-03", "P-06") else 0) + rng.uniform(-0.02, 0.02)
                        rate = min(0.55, max(0.08, rate))
                        cnt_fm = max(HORIZON[metric] == 0 and 80 or 40, int(loans * rng.uniform(0.72, 0.9)))
                        cnt_fz = int(cnt_fm * rate)
                        amt_fm = round(cnt_fm * ticket * 0.92, 2)
                        amt_fz = round(amt_fm * rate * 0.94, 2)
                        risk[metric] = [cnt_fm, cnt_fz, amt_fm, amt_fz]
                    risk_rows.append(risk)

                    settle = max(1, int(loans * (0.22 if kind == "首借" else 0.36)))
                    nxt = int(settle * (0.31 if kind == "首借" else 0.48) * rng.uniform(0.9, 1.1))
                    reloan_rows.append({"p": name, "sm": am, "s": system, "r": kind, "c": settle, "n": nxt})
                    if kind == "首借":
                        cohorts[(name, system, am)] = loans

    flow_rows = []
    for (name, system, fm), loans in cohorts.items():
        start_i = month_index(fm)
        for sm in MONTHS[start_i:]:
            age = month_index(sm) - start_i
            users = max(30, int(loans * rng.uniform(0.86, 0.98)))
            keep = max(0.08, 0.78 - 0.045 * age)
            overdue = min(0.24, 0.035 + 0.014 * age)
            settle_r = max(0.04, 1 - keep - overdue)
            scale = keep + overdue + settle_r
            keep, overdue, settle_r = keep / scale, overdue / scale, settle_r / scale
            current = int(round(users * keep))
            late = int(round(users * overdue))
            settled = users - current - late
            if settled < 0:
                current += settled
                settled = 0
            ticket = next(p[5] for p in PARTNERS if p[0] == name)
            live_cnt = int(current * max(0.4, 1.15 - 0.05 * age))
            live_amt = round(live_cnt * ticket * 0.85, 2)
            total_amt = round(live_amt + late * ticket * 0.45 + settled * ticket * 0.2, 2)
            flow_rows.append({
                "p": name, "s": system, "fm": fm, "sm": sm,
                "u": users, "o": current, "od": late, "st": settled,
                "a": total_amt, "nc": live_cnt, "na": live_amt,
            })
    return pass_rows, risk_rows, flow_rows, reloan_rows


def js(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main():
    rng = random.Random(20261117)
    pass_rows, risk_rows, flow_rows, reloan_rows = build_rows(rng)
    css = CSS.read_text(encoding="utf-8")
    engine = ENGINE.read_text(encoding="utf-8")
    note = (
        "合成示例，图和线上监控同一套。数字不是真实业务。多选时先加总再相除。首借、复借分开。<br>"
        "通过率 = 通过量 / 进件量。用信率 = 放款件 / 通过件。授信件均 = 通过金额 / 通过量。横轴是进件月，线是平台。<br>"
        "结清复借率 = 有下一笔成功放款的结清订单 / 结清订单。横轴是结清月，不跟进件月。<br>"
        "订单风险、金额风险 = 分子 / 分母，分母为 0 不画。横轴是首借月，线是平台加所选风险指标。<br>"
        "用户流转：行是首借月，列是自然月。在贷无逾期、逾期、结清三个率相加为 100%。"
        "总放款额度 = 在贷非逾期 + 在贷逾期 + 结清放款金额。人均在贷笔数 / 人均在贷放款金额 = 在贷非逾期笔数或放款 / 人数。"
    )
    page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>全平台检视</title>
<link rel="stylesheet" href="../assets/theme.css" />
<link rel="stylesheet" href="../assets/site.css" />
<style>
{css}
</style>
</head>
<body>
<div class="screen" id="part-trend">
<header class="mon-head">
  <div class="head-row">
    <h1>全平台检视</h1>
    <div class="head-actions">
      <nav class="toc" id="toc">
        <a href="#part-trend" data-part="part-trend">平台趋势</a>
        <a href="#part-asset" data-part="part-asset">资产走势</a>
        <a href="#part-flow" data-part="part-flow">用户流转</a>
      </nav>
      <button type="button" class="fold" id="foldBtn">收起筛选</button>
    </div>
  </div>
  <div class="note" id="headNote">{note}</div>
</header>
<div class="screen-main">
  <div class="bar" id="bar-top"></div>
  <div class="grid">
    <div class="grid-row top">
      <div class="chart" id="boxPass"><h3>通过率</h3><div class="sub">通过量 / 进件量。横轴是进件月，线是平台。</div><div class="plot"><canvas id="cvPass"></canvas><div class="empty" id="emptyPass" hidden>当前筛选下没有可画的点</div></div></div>
      <div class="chart" id="boxUse"><h3>用信率</h3><div class="sub">放款件 / 通过件。横轴是进件月，线是平台。</div><div class="plot"><canvas id="cvUse"></canvas><div class="empty" id="emptyUse" hidden>当前筛选下没有可画的点</div></div></div>
      <div class="chart" id="boxAvg"><h3>授信件均</h3><div class="sub">通过金额 / 通过量。横轴是进件月，线是平台。</div><div class="plot"><canvas id="cvAvg"></canvas><div class="empty" id="emptyAvg" hidden>当前筛选下没有可画的点</div></div></div>
    </div>
    <div class="grid-row bot">
      <div class="chart" id="boxReloan"><h3>结清复借率</h3><div class="sub">有下一笔成功放款的结清订单 / 结清订单。横轴是结清月，线是平台。</div><div class="plot"><canvas id="cvReloan"></canvas><div class="empty" id="emptyReloan" hidden>当前筛选下没有可画的点</div></div></div>
      <div class="chart" id="boxCnt"><h3>订单风险</h3><div class="sub">件数分子 / 分母，分母为 0 不画。横轴是首借月，线是平台加所选风险指标。</div><div class="plot"><canvas id="cvCnt"></canvas><div class="empty" id="emptyCnt" hidden>当前筛选下没有可画的点</div></div></div>
      <div class="chart" id="boxAmt"><h3>金额风险</h3><div class="sub">金额分子 / 分母，分母为 0 不画。横轴是首借月，线是平台加所选风险指标。</div><div class="plot"><canvas id="cvAmt"></canvas><div class="empty" id="emptyAmt" hidden>当前筛选下没有可画的点</div></div></div>
    </div>
  </div>
</div>
</div>
<section class="vintage" id="part-asset">
  <h2>资产走势</h2>
  <div class="pair">
    <div class="side" data-side="cnt">
      <h3>金额风险</h3>
      <div class="sub">金额分子 / 金额分母。每条线是一个进件月。本侧筛选单独生效。fpd1 订单分母不到 100 的月不画。</div>
      <div class="bar side-bar" id="bar-cnt"></div>
      <div class="legend" id="legendCnt"></div>
      <div class="plot"><canvas id="cvStageCnt"></canvas><div class="empty" id="emptyStageCnt" hidden>当前筛选下没有可画的点</div></div>
    </div>
    <div class="side" data-side="amt">
      <h3>金额风险</h3>
      <div class="sub">金额分子 / 金额分母。每条线是一个进件月。本侧筛选单独生效。fpd1 订单分母不到 100 的月不画。</div>
      <div class="bar side-bar" id="bar-amt"></div>
      <div class="legend" id="legendAmt"></div>
      <div class="plot"><canvas id="cvStageAmt"></canvas><div class="empty" id="emptyStageAmt" hidden>当前筛选下没有可画的点</div></div>
    </div>
  </div>
</section>
<section class="flow" id="part-flow" data-side="flow">
  <h2>用户流转</h2>
  <div class="note">本段筛选独立。行是首借月，列是自然月。多选时先加总再相除。在贷无逾期率、逾期率、结清率相加为 100%。</div>
  <div class="bar side-bar" id="bar-flow"></div>
  <h3>在贷无逾期率</h3>
  <div class="sub">在贷无逾期人数 / 首借人数。</div>
  <div class="heat"><table id="tblFlowKeep"></table></div>
  <h3>逾期率</h3>
  <div class="sub">在贷有逾期人数 / 首借人数。</div>
  <div class="heat"><table id="tblFlowOd"></table></div>
  <h3>结清率</h3>
  <div class="sub">结清人数 / 首借人数。</div>
  <div class="heat"><table id="tblFlowSettle"></table></div>
  <h3>自然月时点总放款额度</h3>
  <div class="sub">在贷非逾期放款 + 在贷逾期放款 + 结清放款，按自然月末时点加总。</div>
  <div class="heat"><table id="tblFlowAmt"></table></div>
  <h3>人均在贷笔数</h3>
  <div class="sub">在贷非逾期笔数合计 / 人数。分母是该首借月队列人数。</div>
  <div class="heat"><table id="tblFlowAvgCnt"></table></div>
  <h3>人均在贷放款金额</h3>
  <div class="sub">在贷非逾期放款合计 / 人数。分母是该首借月队列人数。</div>
  <div class="heat"><table id="tblFlowAvgAmt"></table></div>
</section>
<script>
const PASS = {js(pass_rows)};
const RISK = {js(risk_rows)};
const FLOW = {js(flow_rows)};
const RELOAN = {js(reloan_rows)};
</script>
<script>
{engine}
</script>
<script src="../assets/site-nav.js"></script>
</body>
</html>
"""
    OUT.write_text(page, encoding="utf-8")
    text = OUT.read_text(encoding="utf-8")
    banned = ['"50001"', '"50002"', '"50003"', '"50008"', '"50009"', '"50010"', '"50012"', '"50014"', '"50017"', '"50021"', "10.24.24.83"]
    hits = [b for b in banned if b in text]
    if hits:
        raise SystemExit("banned tokens in page: " + ", ".join(hits))
    print(
        "wrote", OUT,
        "pass", len(pass_rows),
        "risk", len(risk_rows),
        "flow", len(flow_rows),
        "reloan", len(reloan_rows),
        "bytes", OUT.stat().st_size,
    )


if __name__ == "__main__":
    main()
