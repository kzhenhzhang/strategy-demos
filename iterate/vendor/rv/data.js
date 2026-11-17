(function (RV) {
"use strict";
  var S = RV.app.state;
  var C = RV.app.constants;
  var $ = (id) => document.getElementById(id);
  const parseNum = RV.infra.parseNum;
  const rowVal = RV.infra.rowVal;
  const strVal = RV.infra.strVal;
  var data = RV.data = RV.data || {};
  var target = data;

function syncHeadersFromRows() {
  if (!S.rawRows.length) { S.headers = []; return; }
  const order = Object.keys(S.rawRows[0]);
  const extra = new Set();
  for (let i = 1; i < Math.min(S.rawRows.length, 200); i++) {
    for (const k of Object.keys(S.rawRows[i])) extra.add(k);
  }
  S.headers = order.concat([...extra].filter((k) => !order.includes(k)));
}
async function parseCSVTextAsync(text, onProgress) {
  const rows = [];
  let i = 0;
  const len = text.length;
  if (len && text.charCodeAt(0) === 0xfeff) i = 1;

  function readField() {
    let field = "";
    if (i >= len) return field;
    if (text[i] === '"') {
      i++;
      while (i < len) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; }
          else { i++; break; }
        } else field += text[i++];
      }
      if (i < len && text[i] === ",") i++;
      return field;
    }
    while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") field += text[i++];
    if (i < len && text[i] === ",") i++;
    return field;
  }

  function readRow() {
    const row = [];
    while (i < len) {
      row.push(readField());
      if (i >= len || text[i] === "\n" || text[i] === "\r") break;
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    return row;
  }

  const headerRow = readRow();
  if (!headerRow.length) throw new Error("CSV 表头为空");
  const keys = [];
  const seen = {};
  for (let c = 0; c < headerRow.length; c++) {
    let h = String(headerRow[c]).replace(/\u00a0/g, " ").trim();
    if (!h) h = `列${c + 1}`;
    let key = h;
    if (seen[key] != null) { seen[key]++; key = `${h}__${seen[key]}`; }
    else seen[key] = 1;
    keys.push(key);
  }

  let dataRows = 0;
  while (i < len) {
    const r = readRow();
    if (!r.length || (r.length === 1 && r[0] === "")) continue;
    const obj = {};
    for (let c = 0; c < keys.length; c++) obj[keys[c]] = r[c] !== undefined ? r[c] : "";
    rows.push(obj);
    dataRows++;
    if (dataRows % C.CSV_PARSE_YIELD_ROWS === 0) {
      if (onProgress) onProgress(dataRows);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(dataRows);
  return { fields: keys, data: rows };
}
function clearColumnUniquesCache() {
  Object.keys(S.columnUniquesCache).forEach((k) => delete S.columnUniquesCache[k]);
}
async function getColumnUniquesAsync(col, onProgress) {
  if (!col) return [];
  if (S.columnUniquesCache[col]) return S.columnUniquesCache[col];
  const s = new Set();
  const n = S.rawRows.length;
  for (let i = 0; i < n; i++) {
    s.add(strVal(rowVal(S.rawRows[i], col)));
    if (i > 0 && i % C.UNIQUES_YIELD_ROWS === 0) {
      if (onProgress) onProgress(i, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  S.columnUniquesCache[col] = [...s].sort((a, b) => String(a).localeCompare(String(b), "zh"));
  return S.columnUniquesCache[col];
}
function getColumnUniques(col) { return S.columnUniquesCache[col] || []; }
function isNumericFilterColumn(col) { return S.numCols.includes(col); }
function getNumericColumnStats(col, sampleMax = 40000) {
  if (!S.rawRows.length || !col) return null;
  let min = Infinity, max = -Infinity, n = 0;
  const step = Math.max(1, Math.floor(S.rawRows.length / sampleMax));
  for (let i = 0; i < S.rawRows.length; i += step) {
    const v = parseNum(rowVal(S.rawRows[i], col));
    if (v == null) continue;
    n++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!n) return null;
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(4).replace(/\.?0+$/, ""));
  return { min: fmt(min), max: fmt(max) };
}
function inferColumns() {
  S.enumCols = [];
  S.numCols = [];
  S.binaryCols = [];
  for (const h of S.headers) {
    const vals = new Set();
    let numericCount = 0, nonEmpty = 0, binaryCount = 0;
    for (let i = 0; i < Math.min(S.rawRows.length, 5000); i++) {
      const v = rowVal(S.rawRows[i], h);
      if (v === "" || v == null) continue;
      nonEmpty++;
      const sv = String(v).trim().toLowerCase();
      vals.add(strVal(v));
      if (!Number.isNaN(Number(String(v).replace(/,/g, "")))) numericCount++;
      if (sv === "0" || sv === "1" || v === 0 || v === 1) binaryCount++;
    }
    if (nonEmpty > 0 && binaryCount / nonEmpty > 0.95) S.binaryCols.push(h);
    else if (nonEmpty > 0 && numericCount / nonEmpty > 0.85) S.numCols.push(h);
    else if (vals.size > 1 && vals.size <= C.MAX_ENUM) S.enumCols.push(h);
  }
}

function estimateColumnCardinality(col, sampleMax = 5000) {
  const unique = new Set();
  let nonEmpty = 0;
  if (!col || !S.rawRows.length) return { uniqueCount: 0, nonEmptyCount: 0, uniqueRatio: 0 };
  const step = Math.max(1, Math.floor(S.rawRows.length / sampleMax));
  for (let i = 0; i < S.rawRows.length; i += step) {
    const raw = rowVal(S.rawRows[i], col);
    if (raw === "" || raw == null) continue;
    nonEmpty++;
    unique.add(strVal(raw));
  }
  return {
    uniqueCount: unique.size,
    nonEmptyCount: nonEmpty,
    uniqueRatio: nonEmpty ? (unique.size / nonEmpty) : 0,
  };
}

function buildGroupDimensionCandidates() {
  const all = (S.headers || []).filter(Boolean);
  const binarySet = new Set(S.binaryCols || []);
  const enumSet = new Set(S.enumCols || []);
  const numericSet = new Set(S.numCols || []);
  const recommended = [];
  const metaByCol = {};
  const idLikeRe = /(id|编号|编码|订单|合同|借据|客户号|用户号|身份证|证件|手机|手机号|phone|mobile|uuid|guid|流水号)/i;
  const timeLikeRe = /(月|周|日|日期|时间|date|time|month)/i;
  const bucketLikeRe = /(分层|分组|标签|类型|级别|渠道|地区|城市|省|机构|产品|客群|档位|bucket|segment|group|level|type)/i;

  for (const col of all) {
    const card = estimateColumnCardinality(col);
    const isBinary = binarySet.has(col);
    const isEnum = enumSet.has(col);
    const isNumeric = numericSet.has(col);
    const isTimeLike = timeLikeRe.test(col);
    const isIdLikeName = idLikeRe.test(col);
    const isBucketLike = bucketLikeRe.test(col);
    const highCardinality = card.uniqueCount > 120 || card.uniqueRatio >= 0.7;
    const likelyId = isIdLikeName && card.uniqueRatio >= 0.6;
    const lowCardNumeric = isNumeric && card.uniqueCount >= 2 && card.uniqueCount <= 20;

    const isRecommended = !likelyId && (
      isTimeLike
      || isBinary
      || isEnum
      || lowCardNumeric
      || (isBucketLike && !highCardinality)
    );
    if (isRecommended) recommended.push(col);

    metaByCol[col] = {
      type: isBinary ? "binary" : isEnum ? "enum" : isNumeric ? "numeric" : "text",
      uniqueCount: card.uniqueCount,
      nonEmptyCount: card.nonEmptyCount,
      uniqueRatio: card.uniqueRatio,
      recommended: isRecommended,
      highCardinality: highCardinality && !isTimeLike,
      likelyId: likelyId,
    };
  }

  return {
    all,
    recommended: recommended.length ? recommended : all.slice(0, 20),
    metaByCol,
  };
}

  Object.assign(target, {
    syncHeadersFromRows, parseCSVTextAsync, clearColumnUniquesCache, getColumnUniquesAsync, getColumnUniques,
    isNumericFilterColumn, getNumericColumnStats, inferColumns, buildGroupDimensionCandidates,
  });
})(window.RV);
