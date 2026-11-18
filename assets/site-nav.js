(function () {
  var pages = [
    { id: "review", path: "review/", label: "策略复盘" },
    { id: "iterate", path: "iterate/", label: "策略迭代" },
    { id: "daily", path: "daily/", label: "日常检视" },
    { id: "platform", path: "platform/", label: "全平台检视" }
  ];
  var path = location.pathname.replace(/index\.html$/, "");
  if (!path.endsWith("/")) path += "/";
  var current = "home";
  pages.forEach(function (p) {
    if (path.indexOf("/" + p.path) !== -1) current = p.id;
  });
  var prefix = current === "home" ? "" : "../";
  var nav = document.createElement("header");
  nav.className = "sd-nav";
  nav.setAttribute("role", "navigation");
  nav.setAttribute("aria-label", "王含章 · 风控策略");
  var html = '<a class="sd-brand" href="' + prefix + 'index.html">王含章</a><span class="sd-role">风控策略</span>';
  pages.forEach(function (p) {
    var cls = p.id === current ? ' class="is-current" aria-current="page"' : "";
    html += '<a href="' + prefix + p.path + '"' + cls + ">" + p.label + "</a>";
  });
  html += '<span class="sd-note">用 AI 落地 · 合成示例</span>';
  nav.innerHTML = html;
  document.body.insertBefore(nav, document.body.firstChild);

  function setH() {
    document.documentElement.style.setProperty("--sd-nav-h", nav.offsetHeight + "px");
  }
  setH();
  window.addEventListener("resize", setH);
  window.dispatchEvent(new Event("resize"));
})();
