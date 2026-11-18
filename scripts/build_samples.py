#!/usr/bin/env python3
"""Build synthetic demo.csv and platform.json. Numbers are invented."""

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(20261117)

BANDS = [
    # score, base fpd risk, pass rate
    (560, 0.08, 0.86),
    (640, 0.14, 0.80),
    (720, 0.22, 0.74),
    (800, 0.42, 0.60),
    (880, 0.58, 0.46),
]

FIELDS = [
    "决策组",
    "提交日期",
    "submit_date",
    "submit_month",
    "客群",
    "渠道",
    "进件量",
    "通过量",
    "本次额度",
    "放款订单数",
    "放款金额",
    "fpd1_cnt_fz",
    "fpd1_cnt_fm",
    "fpd1_amt_fz",
    "fpd1_amt_fm",
    "hard_rule_demo",
    "soft_rule_demo",
    "p3_demo_score",
    "模型分",
]


MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
# Apply mix by score. September is the base month; October shifts into 800/880.
SCORE_SHARE = {
    "2026-06": {560: 0.32, 640: 0.28, 720: 0.22, 800: 0.12, 880: 0.06},
    "2026-07": {560: 0.30, 640: 0.27, 720: 0.23, 800: 0.13, 880: 0.07},
    "2026-08": {560: 0.29, 640: 0.26, 720: 0.24, 800: 0.13, 880: 0.08},
    "2026-09": {560: 0.28, 640: 0.26, 720: 0.24, 800: 0.14, 880: 0.08},
    "2026-10": {560: 0.20, 640: 0.22, 720: 0.24, 800: 0.22, 880: 0.12},
}
PASS_RATE = {560: 0.88, 640: 0.80, 720: 0.72, 800: 0.55, 880: 0.40}
COUNT_RISK = {560: 0.14, 640: 0.20, 720: 0.26, 800: 0.42, 880: 0.56}
TICKET = {560: 4000, 640: 5000, 720: 6000, 800: 7500, 880: 9000}


def main() -> None:
    rows = []
    for month in MONTHS:
        month_apply = 20000
        for group, group_w, risk_mul, pass_mul in (
            ("a组", 0.55, 0.92, 1.03),
            ("b组", 0.45, 1.0, 1.0),
        ):
            for segment, seg_w in (("新客", 0.62), ("老客", 0.38)):
                for channel, chan_w in (("线上", 0.70), ("线下", 0.30)):
                    for score, _base_risk, _base_pass in BANDS:
                        share = SCORE_SHARE[month][score]
                        apply_n = max(1, round(month_apply * group_w * seg_w * chan_w * share))
                        pass_rate = min(0.96, PASS_RATE[score] * pass_mul)
                        pass_n = max(1, min(apply_n, round(apply_n * pass_rate)))
                        loan_n = max(1, min(pass_n, round(pass_n * 0.82)))
                        ticket = TICKET[score]
                        credit = pass_n * ticket
                        amount = loan_n * ticket
                        due = max(1, round(loan_n * 0.80))
                        risk = COUNT_RISK[score] * risk_mul
                        if segment == "老客" and month == "2026-10":
                            risk = min(0.85, risk + 0.02)
                        bad = min(due, max(0, round(due * risk)))
                        due_amt = max(1, round(loan_n * ticket * 0.75))
                        bad_amt = min(due_amt, round(due_amt * risk * 0.92))
                        iso = f"{month}-01"
                        rows.append({
                            "决策组": group,
                            "提交日期": iso,
                            "submit_date": iso,
                            "submit_month": month,
                            "客群": segment,
                            "渠道": channel,
                            "进件量": apply_n,
                            "通过量": pass_n,
                            "本次额度": credit,
                            "放款订单数": loan_n,
                            "放款金额": amount,
                            "fpd1_cnt_fz": bad,
                            "fpd1_cnt_fm": due,
                            "fpd1_amt_fz": bad_amt,
                            "fpd1_amt_fm": due_amt,
                            "hard_rule_demo": 1 if score >= 880 else 0,
                            "soft_rule_demo": 1 if score >= 800 else 0,
                            "p3_demo_score": score,
                            "模型分": 1000 - score,
                        })

    sample_path = ROOT / "samples" / "demo.csv"
    with sample_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    platforms = [
        ("P-01", ("Android", "iOS"), 0.0),
        ("P-02", ("Android", "iOS"), -0.01),
        ("P-03", ("iOS",), 0.02),
        ("P-04", ("Android",), 0.015),
    ]
    months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
    platform_rows = []
    for name, systems, bias in platforms:
        for os_name in systems:
            for i, month in enumerate(months):
                base_apply = 1800 if os_name == "Android" else 900
                apply_n = int(base_apply * (1 + 0.04 * i) + rng.randint(-40, 40))
                # October drops, except P-02 Android which rises a little.
                drop = 0.035 if month == "2026-10" else 0.0
                if name == "P-02" and os_name == "Android" and month == "2026-10":
                    drop = -0.012
                pass_rate = min(0.9, max(0.35, 0.71 - bias - 0.008 * i - drop))
                platform_rows.append({
                    "platform": name,
                    "os": os_name,
                    "month": month,
                    "apply": apply_n,
                    "pass": int(round(apply_n * pass_rate)),
                })

    payload = {
        "note": "合成数据，只用于演示筛选。不代表任何真实平台。",
        "months": months,
        "rows": platform_rows,
    }
    (ROOT / "samples" / "platform.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"rows={len(rows)} platform={len(platform_rows)}")


if __name__ == "__main__":
    main()
