(function (RV) {
  "use strict";

  function fillSelect(sel, items, emptyOption) {
    if (!sel) return;
    sel.innerHTML = "";
    if (emptyOption) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = emptyOption;
      sel.appendChild(o);
    }
    for (const it of items || []) {
      const o = document.createElement("option");
      o.value = it;
      o.textContent = it;
      o.title = it;
      sel.appendChild(o);
    }
  }

  RV.ui.sidebar.fillSelect = fillSelect;

  RV.ui.report = RV.ui.report || {};
  RV.ui.report.analysis = RV.ui.report.analysis || {};
  RV.ui.report.analysis.ensureReportDocument = function () {
    const out = document.getElementById("report-output");
    if (!out) return null;
    let doc = out.querySelector(".report-document");
    if (!doc) {
      out.innerHTML = '<div class="report-document"></div>';
      doc = out.querySelector(".report-document");
    }
    const tabs = document.getElementById("reportTabs");
    if (tabs) tabs.style.display = "none";
    return doc;
  };

  RV.events = RV.events || {};
  RV.events.notify = function (msg, kind) {
    const el = document.getElementById("shellStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  };
  RV.events.refreshProvenanceBar = function () {};

  const out = document.getElementById("report-output");
  if (out && RV.ui.collapsedPicker && RV.ui.collapsedPicker.bindReportEvents) {
    RV.ui.collapsedPicker.bindReportEvents(out);
  }

  function setStatus(msg, kind) {
    const el = document.getElementById("shellStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  async function loadCsvFile(file) {
    setStatus("读取文件…");
    const text = await RV.infra.readFileAsText(file);
    setStatus("解析 CSV…");
    const result = await RV.data.parseCSVTextAsync(text, function (n) {
      setStatus("解析中… " + Number(n).toLocaleString() + " 行");
    });
    const S = RV.app.state;
    S.rawRows = result.data || [];
    RV.data.syncHeadersFromRows();
    RV.data.clearColumnUniquesCache();
    RV.data.inferColumns();
    S.groupDimCandidates = RV.data.buildGroupDimensionCandidates();
    S.lastDailyReview = null;
    S.dailyReviewResultsStale = false;
    S.dailyReviewBusy = false;
    RV.ui.report.dailyReview.initDailyReviewTab();
    const tab = document.getElementById("tab-daily-review");
    if (tab) tab.classList.add("section-visible");
    setStatus(
      "已载入 " + S.rawRows.length.toLocaleString() + " 行 · " + S.headers.length + " 列。配置后点「运行日常检视」。",
      "ok"
    );
  }

  const TOC_ORDER = [
    "drConfig",
    "drChapterMetrics",
    "drBriefBlock",
    "drPanel1",
    "drPanel2",
    "drPanel3",
    "drPanel4",
    "drChapterTrack",
    "drTrackMetrics",
    "drTrackGrade",
    "drTrackBins",
    "drChapterAdmit",
    "drAdmitStatus",
    "drAdmitReplay",
    "drAdmitCross",
    "drAdmitFalls",
    "drChapterLimit",
    "drLimitVersion",
    "drLimitLevel",
    "drLimitChange",
    "drLimitLevelCross",
    "drLimitChangeCross",
    "drLimitSpecial",
  ];
  const TOC_CHAPTER = new Set([
    "drChapterMetrics",
    "drBriefBlock",
    "drPanel1",
    "drPanel2",
    "drPanel3",
    "drPanel4",
  ]);
  const TOC_TRACK = new Set(["drChapterTrack", "drTrackMetrics", "drTrackGrade", "drTrackBins"]);
  const TOC_ADMIT = new Set(["drChapterAdmit", "drAdmitStatus", "drAdmitReplay", "drAdmitCross", "drAdmitFalls"]);
  const TOC_LIMIT = new Set(["drChapterLimit", "drLimitVersion", "drLimitLevel", "drLimitChange", "drLimitLevelCross", "drLimitChangeCross", "drLimitSpecial"]);

  function syncChromeHeights() {
    const bar = document.querySelector(".dr-shell-bar");
    const toc = document.getElementById("drToc");
    const root = document.documentElement;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sd-nav-h")) || 0;
    if (bar) root.style.setProperty("--dr-shell-h", (bar.offsetHeight + navH) + "px");
    const stacked = toc && getComputedStyle(toc).position !== "fixed";
    root.style.setProperty("--dr-toc-h", stacked && toc ? toc.offsetHeight + "px" : "0px");
  }

  function stickyCover(id) {
    const rootStyle = getComputedStyle(document.documentElement);
    const shell = parseFloat(rootStyle.getPropertyValue("--dr-shell-h")) || 0;
    const tocH = parseFloat(rootStyle.getPropertyValue("--dr-toc-h")) || 0;
    let cover = shell + tocH;
    let head = null;
    if (TOC_CHAPTER.has(id) && id !== "drChapterMetrics") head = document.getElementById("drChapterHead");
    else if (TOC_TRACK.has(id) && id !== "drChapterTrack") head = document.getElementById("drTrackHead");
    else if (TOC_ADMIT.has(id) && id !== "drChapterAdmit") head = document.getElementById("drAdmitHead");
    else if (TOC_LIMIT.has(id) && id !== "drChapterLimit") head = document.getElementById("drLimitHead");
    if (head) cover += head.offsetHeight;
    return cover + 16;
  }

  function scrollToToc(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - stickyCover(id);
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  function placeTocThumb() {
    const toc = document.getElementById("drToc");
    if (!toc) return;
    let thumb = toc.querySelector(".dr-toc-thumb");
    if (!thumb) {
      thumb = document.createElement("span");
      thumb.className = "dr-toc-thumb";
      thumb.setAttribute("aria-hidden", "true");
      toc.appendChild(thumb);
    }
    const active = toc.querySelector(".dr-toc-link.is-active");
    if (!active || !document.getElementById("drConfig")) {
      thumb.hidden = true;
      return;
    }
    thumb.hidden = false;
    thumb.style.left = active.offsetLeft + "px";
    thumb.style.top = "0";
    thumb.style.width = active.offsetWidth + "px";
    thumb.style.height = active.offsetHeight + "px";
    thumb.style.transform = "translateY(" + active.offsetTop + "px)";
  }

  function syncTocActive() {
    const toc = document.getElementById("drToc");
    if (!toc) return;
    if (!document.getElementById("drConfig")) {
      toc.querySelectorAll("[data-dr-toc]").forEach((link) => {
        link.classList.remove("is-active", "is-current");
      });
      placeTocThumb();
      return;
    }
    let current = "drConfig";
    for (const id of TOC_ORDER) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= stickyCover(id)) current = id;
    }
    toc.querySelectorAll("[data-dr-toc]").forEach((link) => {
      const id = link.getAttribute("data-dr-toc");
      link.classList.toggle("is-active", id === current);
      if (id === "drChapterMetrics") {
        link.classList.toggle("is-current", TOC_CHAPTER.has(current));
      }
      if (id === "drChapterTrack") {
        link.classList.toggle("is-current", TOC_TRACK.has(current));
      }
      if (id === "drChapterAdmit") {
        link.classList.toggle("is-current", TOC_ADMIT.has(current));
      }
      if (id === "drChapterLimit") {
        link.classList.toggle("is-current", TOC_LIMIT.has(current));
      }
    });
    placeTocThumb();
  }

  syncChromeHeights();
  if (window.ResizeObserver) {
    const bar = document.querySelector(".dr-shell-bar");
    const toc = document.getElementById("drToc");
    const observer = new ResizeObserver(syncChromeHeights);
    if (bar) observer.observe(bar);
    if (toc) observer.observe(toc);
  }
  window.addEventListener("resize", syncChromeHeights);

  const toc = document.getElementById("drToc");
  if (toc) {
    toc.addEventListener("click", function (e) {
      const link = e.target.closest("[data-dr-toc]");
      if (!link) return;
      const id = link.getAttribute("data-dr-toc");
      if (!id || !document.getElementById(id)) return;
      e.preventDefault();
      scrollToToc(id);
    });
  }
  let tocTick = 0;
  window.addEventListener("scroll", function () {
    if (tocTick) return;
    tocTick = window.requestAnimationFrame(function () {
      tocTick = 0;
      syncTocActive();
    });
  }, { passive: true });
  const reportOut = document.getElementById("report-output");
  if (reportOut && window.MutationObserver) {
    new MutationObserver(function () {
      syncChromeHeights();
      syncTocActive();
    }).observe(reportOut, { childList: true, subtree: true });
  }
  syncTocActive();

  document.getElementById("csvFile").addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    loadCsvFile(file).catch(function (err) {
      console.error(err);
      setStatus("加载失败：" + (err && err.message ? err.message : err), "err");
    });
  });
})(window.RV);
