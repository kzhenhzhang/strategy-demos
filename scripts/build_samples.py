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


def drift_for(day: date) -> float:
    if day >= date(2026, 10, 1):
        return 0.04
    if day >= date(2026, 9, 1):
        return 0.025
    return 0.0


def main() -> None:
    rows = []
    day = date(2026, 6, 1)
    end = date(2026, 10, 31)
    while day <= end:
        drift = drift_for(day)
        iso = day.isoformat()
        month = iso[:7]
        for group, risk_mul in (("a组", 0.82), ("b组", 1.0)):
            for score, base_risk, base_pass in BANDS:
                apply_n = rng.randint(40, 88)
                pass_rate = min(0.94, max(0.18, base_pass - drift + rng.uniform(-0.015, 0.015)))
                pass_n = max(1, min(apply_n, round(apply_n * pass_rate)))
                loan_n = max(1, min(pass_n, round(pass_n * rng.uniform(0.74, 0.9))))
                amount = loan_n * rng.randint(4200, 6800)
                due = max(1, round(loan_n * rng.uniform(0.62, 0.86)))
                risk = min(0.85, max(0.02, base_risk * risk_mul + drift + rng.uniform(-0.02, 0.02)))
                bad = min(due, max(0, round(due * risk)))
                due_amt = max(amount // 5, int(amount * rng.uniform(0.55, 0.82)))
                bad_amt = min(due_amt, int(due_amt * (bad / due if due else 0)))
                rows.append({
                    "决策组": group,
                    "提交日期": iso,
                    "submit_date": iso,
                    "submit_month": month,
                    "客群": "新客" if rng.random() < 0.62 else "老客",
                    "渠道": "线上" if rng.random() < 0.7 else "线下",
                    "进件量": apply_n,
                    "通过量": pass_n,
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
        day += timedelta(days=1)

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
