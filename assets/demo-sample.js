(function (global) {
  function waitUntil(pred, timeoutMs) {
    var limit = timeoutMs || 20000;
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function tick() {
        var ok = false;
        try { ok = !!pred(); } catch (e) { ok = false; }
        if (ok) return resolve();
        if (Date.now() - started > limit) return reject(new Error("示例载入超时"));
        setTimeout(tick, 40);
      })();
    });
  }

  async function loadCsvInto(inputId) {
    var input = document.getElementById(inputId);
    if (!input) throw new Error("找不到上传框");
    var res = await fetch(new URL("../samples/demo.csv", location.href));
    if (!res.ok) throw new Error("示例 CSV 加载失败");
    var blob = await res.blob();
    var file = new File([blob], "demo.csv", { type: "text/csv" });
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  global.StrategyDemo = { loadCsvInto: loadCsvInto, waitUntil: waitUntil };
})(window);
