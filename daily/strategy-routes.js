/* 瀑布版本。非拒量按客群分卡：系统 × 非拒量 × final_cust_type_0807。拒量不分客群，只按系统分卡。
 * 1028 是当前版本。相对 1020：改 iOS 非拒量客群 1、2、3、4，以及安卓拒量。客群 1 为 fpd1≥951.2172、lgb≥929.1255、and_fpd1≥952.8231；客群 2 为 v2≥936.88965；客群 3 为 andr_fpd7≥937.59906006；客群 4 为 fsc≥941.9556 且 andr_fpd7≥956.80994。安卓拒量下线 5×5≥6，改为 v2≥886.984178968295、v1_20260408≥945.8639、fsc≥913.7823。安卓非拒量、iOS 客群 0、iOS 拒量与 1020 相同。
 * 1020 对应 rej_20261020。相对 0915：安卓非拒量客群 1 改为计数≥3 加 andr_fpd7；客群 2 下线 ph_all，计数改为 tag1～tag6 求和≥2；客群 3 下线 v4 与 v3。iOS 客群 3、4 改为 andr_fpd7≥927.54987。拒量与 0915 相同。
 * 0817 只改安卓非拒量客群 1、2、3，其余卡与 0915 相同。0807 对应 rej_20260811。命中任一软规则即拒绝。0807 拒量阈值用大于，其余版本用大于等于。
 * 本地打开页面时读这份脚本。章头「上传 JSON」只覆盖当次，不改这个文件。
 * 上传内容可以是 { versions: [...] }，或旧的 { routes: [...] }。
 * when 的键是 CSV 表头，值是列表。同一人只进第一张对得上的卡。
 * rules 从上到下是初始瀑布顺序。硬规则固定在前，软规则可在页面上拖。
 */
window.DR_STRATEGY_ROUTES = {
  v: 2,
  versions: [
    {
      "id": "20261028",
      "name": "1028",
      "routes": [
        {
          "id": "and-pass-0",
          "name": "安卓 · 非拒量 · 客群0",
          "when": {
            "system1": [
              "android"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "0"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            }
          ]
        },
        {
          "id": "and-pass-1",
          "name": "安卓 · 非拒量 · 客群1",
          "when": {
            "system1": [
              "android"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "1"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "cust1 至少 3 个",
              "col": "rule_hit_and_cust1_cnt",
              "op": "gte",
              "val": 3
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "andr_fpd7",
              "col": "p3_reb_xgb_ph5002_andr_fpd7_202060911",
              "op": "gte",
              "val": 916.2638
            }
          ]
        },
        {
          "id": "and-pass-2",
          "name": "安卓 · 非拒量 · 客群2",
          "when": {
            "system1": [
              "android"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "2"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "20260626",
              "col": "p3_reb_xgb_ph5002_fpd7_v2_20260626",
              "op": "gte",
              "val": 920.8455851226972
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "20260717",
              "col": "p3_reb_xgb_ph50002_fpd7_v3_20260717",
              "op": "gte",
              "val": 912.78107
            },
            {
              "kind": "soft",
              "type": "sum",
              "name": "tag 至少 2 个",
              "cols": [
                "rule_hit_tag1",
                "rule_hit_tag2",
                "rule_hit_tag3",
                "rule_hit_tag4",
                "rule_hit_tag5",
                "rule_hit_tag6"
              ],
              "op": "gte",
              "val": 2
            }
          ]
        },
        {
          "id": "and-pass-3",
          "name": "安卓 · 非拒量 · 客群3",
          "when": {
            "system1": [
              "android"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "3"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "fsc_20260720",
              "col": "p3_reb_xgb_ph50002_fpd7_fsc_20260720",
              "op": "gte",
              "val": 918.35693
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "fpd1_20260108",
              "col": "p3_reb_xgb_ph50002_fpd1_20260108",
              "op": "gte",
              "val": 960.0948
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "cust3 至少 3 个",
              "col": "rule_hit_and_cust3_cnt",
              "op": "gte",
              "val": 3
            }
          ]
        },
        {
          "id": "ios-pass-0",
          "name": "iOS · 非拒量 · 客群0",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "0"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            }
          ]
        },
        {
          "id": "ios-pass-1",
          "name": "iOS · 非拒量 · 客群1",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "1"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "fpd1_20251211",
              "col": "p3_reb_xgb_ph50002_fpd1_20251211",
              "op": "gte",
              "val": 951.2172
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "lgb_20260720",
              "col": "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720",
              "op": "gte",
              "val": 929.1255
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "and_fpd1_20260128",
              "col": "p3_reb_xgb_ph50002_and_fpd1_20260128",
              "op": "gte",
              "val": 952.8231
            }
          ]
        },
        {
          "id": "ios-pass-2",
          "name": "iOS · 非拒量 · 客群2",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "2"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "20260626",
              "col": "p3_reb_xgb_ph5002_fpd7_v2_20260626",
              "op": "gte",
              "val": 936.88965
            }
          ]
        },
        {
          "id": "ios-pass-3",
          "name": "iOS · 非拒量 · 客群3",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "3"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "andr_fpd7",
              "col": "p3_reb_xgb_ph5002_andr_fpd7_202060911",
              "op": "gte",
              "val": 937.59906006
            }
          ]
        },
        {
          "id": "ios-pass-4",
          "name": "iOS · 非拒量 · 客群4",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "非拒量"
            ],
            "final_cust_type_0807": [
              "4"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "fsc_20260720",
              "col": "p3_reb_xgb_ph50002_fpd7_fsc_20260720",
              "op": "gte",
              "val": 941.9556
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "andr_fpd7",
              "col": "p3_reb_xgb_ph5002_andr_fpd7_202060911",
              "op": "gte",
              "val": 956.80994
            }
          ]
        },
        {
          "id": "and-rej",
          "name": "安卓 · 拒量",
          "when": {
            "system1": [
              "android"
            ],
            "是否拒量": [
              "拒量"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "20260626",
              "col": "p3_reb_xgb_ph5002_fpd7_v2_20260626",
              "op": "gte",
              "val": 886.984178968295
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "20260408",
              "col": "p3_reb_xgb_ph5002_fpd7_v1_20260408",
              "op": "gte",
              "val": 945.8639
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "fsc_20260720",
              "col": "p3_reb_xgb_ph50002_fpd7_fsc_20260720",
              "op": "gte",
              "val": 913.7823
            }
          ]
        },
        {
          "id": "ios-rej",
          "name": "iOS · 拒量",
          "when": {
            "system1": [
              "ios"
            ],
            "是否拒量": [
              "拒量"
            ]
          },
          "rules": [
            {
              "kind": "hard",
              "type": "binary",
              "name": "硬规则",
              "col": "hard_rej"
            },
            {
              "kind": "soft",
              "type": "num",
              "name": "5×5等级≥6",
              "col": "grade_0720_0717_5x5",
              "op": "gte",
              "val": 6
            }
          ]
        }
      ]
    },
    {
      id: "20261020",
      name: "1020",
      routes: [
        {
          id: "and-pass-0",
          name: "安卓 · 非拒量 · 客群0",
          when: { system1: ["android"], "是否拒量": ["非拒量"], final_cust_type_0807: ["0"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
          ],
        },
        {
          id: "and-pass-1",
          name: "安卓 · 非拒量 · 客群1",
          when: { system1: ["android"], "是否拒量": ["非拒量"], final_cust_type_0807: ["1"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "cust1 至少 3 个", col: "rule_hit_and_cust1_cnt", op: "gte", val: 3 },
            { kind: "soft", type: "num", name: "andr_fpd7", col: "p3_reb_xgb_ph5002_andr_fpd7_202060911", op: "gte", val: 916.2638 },
          ],
        },
        {
          id: "and-pass-2",
          name: "安卓 · 非拒量 · 客群2",
          when: { system1: ["android"], "是否拒量": ["非拒量"], final_cust_type_0807: ["2"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 920.8455851226972 },
            { kind: "soft", type: "num", name: "20260717", col: "p3_reb_xgb_ph50002_fpd7_v3_20260717", op: "gte", val: 912.78107 },
            { kind: "soft", type: "sum", name: "tag 至少 2 个", cols: ["rule_hit_tag1", "rule_hit_tag2", "rule_hit_tag3", "rule_hit_tag4", "rule_hit_tag5", "rule_hit_tag6"], op: "gte", val: 2 },
          ],
        },
        {
          id: "and-pass-3",
          name: "安卓 · 非拒量 · 客群3",
          when: { system1: ["android"], "是否拒量": ["非拒量"], final_cust_type_0807: ["3"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "fsc_20260720", col: "p3_reb_xgb_ph50002_fpd7_fsc_20260720", op: "gte", val: 918.35693 },
            { kind: "soft", type: "num", name: "fpd1_20260108", col: "p3_reb_xgb_ph50002_fpd1_20260108", op: "gte", val: 960.0948 },
            { kind: "soft", type: "num", name: "cust3 至少 3 个", col: "rule_hit_and_cust3_cnt", op: "gte", val: 3 },
          ],
        },
        {
          id: "ios-pass-0",
          name: "iOS · 非拒量 · 客群0",
          when: { system1: ["ios"], "是否拒量": ["非拒量"], final_cust_type_0807: ["0"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
          ],
        },
        {
          id: "ios-pass-1",
          name: "iOS · 非拒量 · 客群1",
          when: { system1: ["ios"], "是否拒量": ["非拒量"], final_cust_type_0807: ["1"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 925.68164 },
          ],
        },
        {
          id: "ios-pass-2",
          name: "iOS · 非拒量 · 客群2",
          when: { system1: ["ios"], "是否拒量": ["非拒量"], final_cust_type_0807: ["2"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 932.37787 },
          ],
        },
        {
          id: "ios-pass-3",
          name: "iOS · 非拒量 · 客群3",
          when: { system1: ["ios"], "是否拒量": ["非拒量"], final_cust_type_0807: ["3"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "andr_fpd7", col: "p3_reb_xgb_ph5002_andr_fpd7_202060911", op: "gte", val: 927.54987 },
          ],
        },
        {
          id: "ios-pass-4",
          name: "iOS · 非拒量 · 客群4",
          when: { system1: ["ios"], "是否拒量": ["非拒量"], final_cust_type_0807: ["4"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "andr_fpd7", col: "p3_reb_xgb_ph5002_andr_fpd7_202060911", op: "gte", val: 927.54987 },
          ],
        },
        {
          id: "and-rej",
          name: "安卓 · 拒量",
          when: { system1: ["android"], "是否拒量": ["拒量"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 },
          ],
        },
        {
          id: "ios-rej",
          name: "iOS · 拒量",
          when: { system1: ["ios"], "是否拒量": ["拒量"] },
          rules: [
            { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
            { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 },
          ],
        },
      ],
    },
    {
      id: "20260915",
      name: "0915",
      routes: [
    {
      id: "and-pass-0",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "and-pass-1",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "cust1 至少 2 个", col: "rule_hit_and_cust1_cnt", op: "gte", val: 2 }
      ]
    },
    {
      id: "and-pass-2",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 920.8455851226972 },
        { kind: "soft", type: "num", name: "20260717", col: "p3_reb_xgb_ph50002_fpd7_v3_20260717", op: "gte", val: 912.78107 },
        { kind: "soft", type: "num", name: "ph_all_fpd7", col: "p3_reb_xgb_ph_all_fpd7_20260115", op: "gte", val: 923.0103 },
        { kind: "soft", type: "num", name: "cust2 至少 2 个", col: "rule_hit_and_cust2_cnt", op: "gte", val: 2 }
      ]
    },
    {
      id: "and-pass-3",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "v4_20260806", col: "p3_reb_xgb_ph5002_fpd7_v4_20260806", op: "gte", val: 952.5184 },
        { kind: "soft", type: "num", name: "fsc_20260720", col: "p3_reb_xgb_ph50002_fpd7_fsc_20260720", op: "gte", val: 918.35693 },
        { kind: "soft", type: "num", name: "fpd1_20260108", col: "p3_reb_xgb_ph50002_fpd1_20260108", op: "gte", val: 960.0948 },
        { kind: "soft", type: "num", name: "20250916_v3", col: "p3_reb_xgb_20250916_v3", op: "gte", val: 0.5163843 },
        { kind: "soft", type: "num", name: "cust3 至少 3 个", col: "rule_hit_and_cust3_cnt", op: "gte", val: 3 }
      ]
    },
    {
      id: "ios-pass-0",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "ios-pass-1",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 925.68164 }
      ]
    },
    {
      id: "ios-pass-2",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 932.37787 }
      ]
    },
    {
      id: "ios-pass-3",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 910.76227 }
      ]
    },
    {
      id: "ios-pass-4",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["4"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "fsc_20260720", col: "p3_reb_xgb_ph50002_fpd7_fsc_20260720", op: "gte", val: 941.9556 }
      ]
    },
    {
      id: "and-rej",
      when: { system1: ["android"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 }
      ]
    },
    {
      id: "ios-rej",
      when: { system1: ["ios"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 }
      ]
    }
      ]
    },
    {
      id: "20260817",
      name: "0817",
      routes: [
    {
      id: "and-pass-0",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "and-pass-1",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260717", col: "p3_reb_xgb_ph50002_fpd7_v3_20260717", op: "gte", val: 901.610555 }
      ]
    },
    {
      id: "and-pass-2",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "fsc_20260720", col: "p3_reb_xgb_ph50002_fpd7_fsc_20260720", op: "gte", val: 920.662217 },
        { kind: "soft", type: "num", name: "and_fpd1_20260128", col: "p3_reb_xgb_ph50002_and_fpd1_20260128", op: "gte", val: 925.995 },
        { kind: "soft", type: "num", name: "20260717", col: "p3_reb_xgb_ph50002_fpd7_v3_20260717", op: "gte", val: 912.70416 }
      ]
    },
    {
      id: "and-pass-3",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 902.20197 },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 913.59216 }
      ]
    },
    {
      id: "ios-pass-0",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "ios-pass-1",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 925.68164 }
      ]
    },
    {
      id: "ios-pass-2",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 932.37787 }
      ]
    },
    {
      id: "ios-pass-3",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "lgb_20260720", col: "p3_reb_lgb_ph50002_fpd7_fsc_andr_20260720", op: "gte", val: 910.76227 }
      ]
    },
    {
      id: "ios-pass-4",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["4"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "fsc_20260720", col: "p3_reb_xgb_ph50002_fpd7_fsc_20260720", op: "gte", val: 941.9556 }
      ]
    },
    {
      id: "and-rej",
      when: { system1: ["android"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 }
      ]
    },
    {
      id: "ios-rej",
      when: { system1: ["ios"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "5×5等级≥6", col: "grade_0720_0717_5x5", op: "gte", val: 6 }
      ]
    }
      ]
    },
    {
      id: "20260807",
      name: "0807",
      routes: [
    {
      id: "and-pass-0",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "and-pass-1",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "5_6等级≥7", col: "grade_0626_0408_5_6", op: "gte", val: 7 },
        { kind: "soft", type: "num", name: "20251210_v5", col: "p3_reb_xgb_20251210_v5", op: "gte", val: 0.5750917 }
      ]
    },
    {
      id: "and-pass-2",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 933.7466 },
        { kind: "soft", type: "num", name: "fpd1_20260128", col: "p3_reb_xgb_ph50002_fpd1_20260128", op: "gte", val: 939.1325 },
        { kind: "soft", type: "num", name: "fpd7_20260311", col: "p3_reb_xgb_ph50002_fpd7_20260311", op: "gte", val: 917.6757 },
        { kind: "soft", type: "num", name: "20251210_v5", col: "p3_reb_xgb_20251210_v5", op: "gte", val: 0.58304703 }
      ]
    },
    {
      id: "and-pass-3",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 911.22723 },
        { kind: "soft", type: "num", name: "fpd1_20260128", col: "p3_reb_xgb_ph50002_fpd1_20260128", op: "gte", val: 926.63464 }
      ]
    },
    {
      id: "and-pass-4",
      when: { system1: ["android"], 是否拒量: ["非拒量"], final_cust_type_0807: ["4"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "ios-pass-0",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["0"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" }
      ]
    },
    {
      id: "ios-pass-1",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["1"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 936.24945 },
        { kind: "soft", type: "num", name: "fpd1_20251211", col: "p3_reb_xgb_ph50002_fpd1_20251211", op: "gte", val: 953.507 }
      ]
    },
    {
      id: "ios-pass-2",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["2"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 935.87854 }
      ]
    },
    {
      id: "ios-pass-3",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["3"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 937.3943 },
        { kind: "soft", type: "num", name: "ios_fpd1_20260128", col: "p3_reb_xgb_ph50002_ios_fpd1_20260128", op: "gte", val: 952.94116 }
      ]
    },
    {
      id: "ios-pass-4",
      when: { system1: ["ios"], 是否拒量: ["非拒量"], final_cust_type_0807: ["4"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20260626", col: "p3_reb_xgb_ph5002_fpd7_v2_20260626", op: "gte", val: 930.8762 }
      ]
    },
    {
      id: "and-rej",
      when: { system1: ["android"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20250513_v12", col: "p1_reb_xgb_20250513_v12", op: "gt", val: 0.5509 },
        { kind: "soft", type: "num", name: "fpd1_20251218", col: "p3_reb_xgb_ph50002_fpd1_20251218", op: "gt", val: 977.7605 },
        { kind: "soft", type: "num", name: "fpd7_20260311", col: "p3_reb_xgb_ph50002_fpd7_20260311", op: "gt", val: 889.1102 }
      ]
    },
    {
      id: "ios-rej",
      when: { system1: ["ios"], 是否拒量: ["拒量"] },
      rules: [
        { kind: "hard", type: "binary", name: "硬规则", col: "hard_rej" },
        { kind: "soft", type: "num", name: "20240718_v7", col: "p1_reb_xgb_20240718_v7", op: "gt", val: 0.5363 },
        { kind: "soft", type: "num", name: "fpd1_20251218", col: "p3_reb_xgb_ph50002_fpd1_20251218", op: "gt", val: 934.8879 },
        { kind: "soft", type: "num", name: "fpd7_v1_20260408", col: "p3_reb_xgb_ph5002_fpd7_v1_20260408", op: "gt", val: 885.6978 }
      ]
    }
      ]
    }
  ]
};
