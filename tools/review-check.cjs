const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9229/json")).json();
  const target = targets.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let serial = 0;
  const pending = new Map(),
    errors = [],
    report = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params);
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (expr) => {
    for (let i = 0; i < 100; i++) {
      if (await run(expr)) return;
      await delay(100);
    }
    throw Error("Timeout " + expr);
  };
  const click = async (a) => {
    await run(`document.querySelector('[data-action="${a}"]').click()`);
    await delay(100);
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp("Page.navigate", { url: "http://127.0.0.1:8766/" });
  await wait("!!document.querySelector('[data-action=conditions]')");
  await run("localStorage.setItem('kk1-data-v1','{broken-review');");
  await cdp("Page.reload");
  await wait(
    "document.querySelector('#warning').textContent.includes('元のデータは退避しました')",
  );
  await wait("!!document.querySelector('[data-action=dismiss]')");
  await click("dismiss");
  await run("document.querySelector('[data-nav=settings]').click()");
  assert.equal(
    await run(
      "Object.keys(localStorage).some(k=>k.startsWith('kk1-data-v1-broken-')&&localStorage.getItem(k)==='{broken-review')",
    ),
    true,
  );
  await click("export-broken");
  report.push("broken JSON archived, warning and settings export: OK");
  assert.equal(
    await run("JSON.parse(localStorage.getItem('kk1-data-v1')).lastExport"),
    null,
  );
  await click("export");
  assert.equal(
    await run("JSON.parse(localStorage.getItem('kk1-data-v1')).lastExport"),
    null,
  );
  await click("close");
  await click("export");
  await click("export-saved");
  assert.match(
    await run("JSON.parse(localStorage.getItem('kk1-data-v1')).lastExport"),
    /^\d{4}-\d{2}-\d{2}$/,
  );
  report.push("export date changes only after saved confirmation: OK");
  await click("guide");
  await run(
    "(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};dispatchEvent(e);})()",
  );
  assert.equal(
    await run("!!document.querySelector('[data-action=install]')"),
    true,
  );
  await click("dismiss");
  report.push("open install guide refreshed on beforeinstallprompt: OK");
  await run(
    "window.__noReload='kept';navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));",
  );
  await delay(500);
  assert.equal(await run("window.__noReload"), "kept");
  report.push("controllerchange without update click does not reload: OK");
  // 登録のない別オリジンで、初回claimが再読み込みを起こさないことを確認。
  await cdp("Storage.clearDataForOrigin", {
    origin: "http://localhost:8766",
    storageTypes: "all",
  });
  await cdp("Page.navigate", { url: "http://localhost:8766/" });
  await wait("!!document.querySelector('[data-action=conditions]')");
  await wait("!!navigator.serviceWorker.controller");
  assert.equal(
    await run("performance.getEntriesByType('navigation')[0].type"),
    "navigate",
  );
  report.push("initial clients.claim does not reload: OK");
  if (await run("!!document.querySelector('[data-action=dismiss]')"))
    await click("dismiss");
  // テスト用の版を一時配信し、更新の承認後だけ再読み込みされることを確かめる。
  const originalSW = fs.readFileSync("sw.js", "utf8");
  try {
    fs.writeFileSync(
      "sw.js",
      originalSW.replace("kk1-v3", "kk1-v3-review-" + Date.now()),
    );
    await run("navigator.serviceWorker.getRegistration().then(r=>r.update())");
    await wait("!document.querySelector('#update').hidden");
    await run("window.__waitingVersion='still here'");
    await delay(300);
    assert.equal(await run("window.__waitingVersion"), "still here");
    await run("document.querySelector('#update').click()");
    await wait(
      "performance.getEntriesByType('navigation')[0].type==='reload'&&!!document.querySelector('[data-action=conditions]')",
    );
    report.push(
      "actual waiting worker: reload only after update button click: OK",
    );
  } finally {
    fs.writeFileSync("sw.js", originalSW);
  }
  await cdp("Page.navigate", { url: "http://127.0.0.1:8766/" });
  await wait("!!document.querySelector('[data-action=conditions]')");
  assert.equal(errors.length, 0);
  fs.writeFileSync(
    "_check/review-results.json",
    JSON.stringify({ report, jsErrors: errors.length }, null, 2),
  );
  console.log(report.join("\n"));
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
