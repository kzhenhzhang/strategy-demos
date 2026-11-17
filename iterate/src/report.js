/**
 * Download admission report HTML — same renderer as skill CLI
 * (vendor/admission/render-report-html.js + theme).
 */
(function (global) {
  "use strict";

  function buildReportHtml(report) {
    const api = global.AdmissionRenderReport;
    if (!api || typeof api.buildReportHtml !== "function") {
      throw new Error("报告渲染器未加载（AdmissionRenderReport）");
    }
    const themeCss = global.ADMISSION_THEME_CSS || "";
    return api.buildReportHtml(report, themeCss);
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadReport(report) {
    const html = buildReportHtml(report);
    const stamp = (report.generatedAt || "").slice(0, 10) || "out";
    downloadText(`admission-report-${stamp}.html`, html, "text/html;charset=utf-8");
  }

  function pct(x, digits) {
    if (x == null || !Number.isFinite(Number(x))) return "—";
    return (Number(x) * 100).toFixed(digits != null ? digits : 2) + "%";
  }

  global.AdmissionReport = { buildReportHtml, downloadReport, pct };
})(typeof window !== "undefined" ? window : global);
