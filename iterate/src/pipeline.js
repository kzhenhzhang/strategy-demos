/**
 * Thin orchestration: parse UI inputs → AdmissionEngine (run.js-aligned).
 */
(function (global) {
  "use strict";

  const RV = global.RV;

  function aliasVolumeCols(rows, fields) {
    const applyCol = fields.applyCol || "进件量";
    const passCol = fields.passCol || "通过量";
    if (applyCol === "进件量" && passCol === "通过量") return rows;
    return rows.map((row) => {
      const o = Object.assign({}, row);
      if (applyCol !== "进件量") o["进件量"] = row[applyCol];
      if (passCol !== "通过量") o["通过量"] = row[passCol];
      return o;
    });
  }

  /** Normalize filter to non-empty value list. Supports {values[]} or legacy {value}. */
  function filterValues(f) {
    if (!f) return [];
    if (Array.isArray(f.values)) {
      return f.values.map((v) => String(v ?? "").trim()).filter(Boolean);
    }
    if (f.value != null && f.value !== "") return [String(f.value).trim()];
    return [];
  }

  /**
   * Segment filters: AND across rows; OR within a row's values[].
   * Empty values → skip that row (no constraint).
   */
  function applySegmentFilters(rows, filters) {
    if (!filters || !filters.length) return rows;
    return rows.filter((row) => {
      for (const f of filters) {
        if (!f.col) continue;
        const values = filterValues(f);
        if (!values.length) continue;
        const cell = String(row[f.col] ?? "").trim();
        if (!values.includes(cell)) return false;
      }
      return true;
    });
  }

  /** Short display aliases → CSV column (common online labels). */
  const COL_ALIASES = {
    p1_20240718_v7: "p1_reb_xgb_20240718_v7",
    p3_fpd1_1218: "p3_reb_xgb_ph50002_fpd1_20251218",
    p3_fpd7_v1: "p3_reb_xgb_ph5002_fpd7_v1_20260408",
  };

  function resolveCol(name) {
    const t = String(name || "").trim();
    return COL_ALIASES[t] || t;
  }

  function parseCmpLine(line, idPrefix, index, asHard) {
    const raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) return null;

    let m = raw.match(/^(.+?)\s*(>=|<=|>|<|gte|lte|gt|lt)\s*(-?\d+(?:\.\d+)?)\s*$/i);
    if (m) {
      const labelLeft = m[1].trim();
      const col = resolveCol(labelLeft);
      let op = m[2].toLowerCase();
      const map = { ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };
      if (map[op]) op = map[op];
      const threshold = Number(m[3]);
      const name = raw.includes(labelLeft) && labelLeft !== col
        ? `${labelLeft}${m[2]}${m[3]}`
        : `${col} ${op} ${threshold}`;
      return {
        id: `${idPrefix}_${index + 1}`,
        name,
        type: "numeric_cmp",
        column: col,
        operator: op,
        threshold,
        includeMissing: false,
        isHard: !!asHard,
      };
    }

    m = raw.match(/^binary\s*:\s*(.+?)(?:\s*:\s*(one|zero|1|0))?$/i);
    if (m) {
      const col = resolveCol(m[1].trim());
      const hw = (m[2] || "one").toLowerCase();
      const hitWhen = hw === "zero" || hw === "0" ? "zero" : "one";
      return {
        id: `${idPrefix}_${index + 1}`,
        name: col,
        type: "binary_col",
        column: col,
        hitWhen,
        isHard: !!asHard,
      };
    }

    // 列=1 / 列=0 → 二元规则
    m = raw.match(/^(.+?)\s*=\s*([01])\s*$/);
    if (m) {
      const col = resolveCol(m[1].trim());
      const hitWhen = m[2] === "0" ? "zero" : "one";
      return {
        id: `${idPrefix}_${index + 1}`,
        name: `${col}=${m[2]}`,
        type: "binary_col",
        column: col,
        hitWhen,
        isHard: !!asHard,
      };
    }

    if (/^[\w.\u4e00-\u9fff]+$/.test(raw)) {
      const col = resolveCol(raw);
      return {
        id: `${idPrefix}_${index + 1}`,
        name: col,
        type: "binary_col",
        column: col,
        hitWhen: "one",
        isHard: !!asHard,
      };
    }
    return null;
  }

  function parseRuleLines(text, idPrefix, asHard) {
    const warnings = [];
    const rules = [];
    String(text || "").split(/\r?\n/).forEach((line, i) => {
      const r = parseCmpLine(line, idPrefix, i, asHard);
      if (!r) {
        if (String(line).trim() && !String(line).trim().startsWith("#")) {
          warnings.push(`无法解析规则行：${line.trim()}`);
        }
        return;
      }
      rules.push(r);
    });
    return { rules, warnings };
  }

  /**
   * @param {object} input UI payload
   * @param {(pct:number,msg:string)=>void} onProgress
   */
  async function runAdmissionIteration(input, onProgress) {
    if (!global.AdmissionEngine || !global.AdmissionEngine.runAdmissionEngine) {
      throw new Error("计算引擎未加载");
    }

    const fields = input.fields || {};
    let hardRuntime = [];
    let softRuntime = [];
    const baselineWarnings = [];

    const hardParsed = parseRuleLines(input.hardRulesText || "", "hard", true);
    const softParsed = parseRuleLines(input.softRulesText || "", "soft", false);
    if (hardParsed.rules.length) hardRuntime = hardRuntime.concat(hardParsed.rules);
    if (softParsed.rules.length) softRuntime = softRuntime.concat(softParsed.rules);
    baselineWarnings.push(...hardParsed.warnings, ...softParsed.warnings);

    if (!hardRuntime.length) {
      hardRuntime = [{
        id: "hard_rej",
        name: "hard_rej",
        type: "binary_col",
        column: "hard_rej",
        hitWhen: "one",
        isHard: true,
      }];
    }

    let rows = aliasVolumeCols(input.rows || [], fields);
    rows = applySegmentFilters(rows, input.segmentFilters || []);

    const softLabels = softRuntime.map((r) => r.name);
    const engineInput = {
      rows,
      fields: {
        riskNumCol: fields.riskNumCol || "fpd1_cnt_fz",
        riskDenCol: fields.riskDenCol || "fpd1_cnt_fm",
        decisionCol: fields.decisionCol || fields.groupCol || "决策组",
        postMonthCol: fields.postMonthCol || "submit_month",
        preDateCol: fields.preDateCol || "submit_date",
      },
      targets: input.targets,
      trainWindow: input.trainWindow,
      backtestWindow: input.backtestWindow,
      hardRuntime,
      softRuntime,
      baselineWarnings,
      keepOnlineSoft: input.keepOnlineSoft !== false,
      dropSoftCols: Array.isArray(input.dropSoftCols) ? input.dropSoftCols : [],
      inUseModels: input.inUseModels || softRuntime.map((r) => r.column).filter(Boolean),
      baselineSoftOnlineLabels: softLabels,
      mineOpts: Object.assign({
        minHit: 30,
        minAbsRisk: 0.35,
        minLift: 1.5,
        maxCandidates: 6,
        residualRounds: 10,
      }, input.mineOpts || {}),
      segmentMeta: Object.fromEntries(
        (input.segmentFilters || [])
          .filter((f) => f && f.col && filterValues(f).length)
          .map((f) => {
            const vals = filterValues(f);
            return [f.col, vals.length === 1 ? vals[0] : vals.join("|")];
          })
      ),
    };

    const report = await global.AdmissionEngine.runAdmissionEngine(
      RV,
      engineInput,
      onProgress
    );

    // Same EDA enrich as skill bin/enrich-eda.js → months / inUseBlocks / potentialBlocks
    if (global.AdmissionEnrichReportEda && typeof global.AdmissionEnrichReportEda.enrichReportEda === "function") {
      if (onProgress) onProgress(97, "补全在用/潜在模型 EDA…");
      global.AdmissionEnrichReportEda.enrichReportEda(RV, report, rows, {
        decisionCol: engineInput.fields.decisionCol,
        riskNumCol: engineInput.fields.riskNumCol,
        postMonthCol: engineInput.fields.postMonthCol,
      });
    }
    if (onProgress) onProgress(100, "完成");

    return report;
  }

  global.AdmissionPipeline = {
    runAdmissionIteration,
    parseRuleLines,
    COL_ALIASES,
  };
})(typeof window !== "undefined" ? window : global);
