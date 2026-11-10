const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const width = Number(process.env.CHECK_WIDTH || 375),
  height = width === 430 ? 932 : 667;
const out = path.join(__dirname, "../_check");
fs.mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9229/json")).json();
  const target = targets.find((t) => t.type === "page");
  if (!target) throw Error("Edge page unavailable");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let serial = 0;
  const pending = new Map(),
    errors = [],
    report = [];
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errors.push(m.params);
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.method === "Page.javascriptDialogOpening")
      cdp("Page.handleJavaScriptDialog", { accept: true });
  });
  const run = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expr) => {
    for (let i = 0; i < 100; i++) {
      if (await run(expr)) return;
      await delay(100);
    }
    throw Error("Timeout: " + expr);
  };
  const click = async (selector) => {
    await run(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.click();})()`,
    );
    await delay(80);
  };
  const action = (a) => click(`[data-action="${a}"]`);
  async function snap(name) {
    if (await run("document.body.classList.contains('quizzing')")) {
      assert.equal(
        await run(
          "getComputedStyle(document.querySelector('header')).display==='none'&&getComputedStyle(document.querySelector('nav')).display==='none'",
        ),
        true,
        "quiz chrome hidden",
      );
      const position = await run("scrollY");
      await run("window.scrollTo(0,document.body.scrollHeight)");
      await delay(40);
      assert.equal(
        await run(
          "(()=>{const c=document.querySelector('.quiz-controls');return !c||document.querySelector('.quiz-content').getBoundingClientRect().bottom<=c.getBoundingClientRect().top;})()",
        ),
        true,
        "content clears fixed controls " + name,
      );
      await run("window.scrollTo(0," + position + ")");
    } else
      assert.equal(
        await run(
          "getComputedStyle(document.querySelector('header')).display!=='none'&&getComputedStyle(document.querySelector('nav')).display!=='none'",
        ),
        true,
        "normal chrome visible",
      );
    assert.equal(
      await run("document.documentElement.scrollWidth <= innerWidth"),
      true,
      "horizontal overflow " + name,
    );
    const shot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(out, width + "-" + name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
    report.push(name + ": OK / no horizontal scroll");
  }
  async function nav(name) {
    await click(`[data-nav="${name}"]`);
  }
  async function choose(type) {
    await action("conditions");
    await run(
      `(()=>{const s=document.querySelector('[name="type"]');s.value='${type}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await snap("conditions-" + type);
    await action("start");
    await wait(`!!document.querySelector('[data-action="stop"]')`);
  }
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const base = process.env.CHECK_URL || "http://127.0.0.1:8765/";
  await cdp("Storage.clearDataForOrigin", {
    origin: new URL(base).origin,
    storageTypes: "all",
  });
  await cdp("Page.navigate", { url: base });
  await wait(`!!document.querySelector('[data-action="dismiss"]')`);
  await snap("install-guide");
  await action("dismiss");
  await snap("home");
  await nav("settings");
  await run(
    "(()=>{const s=document.querySelector('[name=fontSize]');s.value='L';s.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await nav("home");
  await wait(`!!navigator.serviceWorker.controller`);
  await run("navigator.serviceWorker.ready.then(()=>true)");
  // flash: bookmark, flag memo, answer and all three grades.
  await choose("flash");
  await snap("flash-question");
  await action("bookmark");
  await action("flag");
  await run(`document.querySelector('#memo').value='ブラウザ検証メモ'`);
  await action("saveflag");
  const savedId = await run(
    `JSON.parse(localStorage.getItem('kk1-data-v1')).bookmarks[0]`,
  );
  await action("reveal");
  await snap("flash-answer");
  await action("grade-ng");
  await action("reveal");
  await action("grade-unsure");
  await action("reveal");
  await action("grade-ok");
  await action("stop"); // auto accept dialogs below
  await snap("result");
  await click('[data-action^="review:"]');
  await snap("result-review");
  await action("close");
  await action("home");
  // Correct choice is read from the original JSON so the real answer buttons are exercised.
  await choose("choice");
  await snap("choice-question");
  let q = await run(`document.querySelector('.question').textContent`);
  let all = ["zaimu", "bunseki", "genka"].flatMap((f) =>
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../questions", f + ".json"),
        "utf8",
      ),
    ),
  );
  const correct = all.find((x) => x.question === q).answer;
  await click(`[data-choice="${correct}"]`);
  await snap("choice-correct");
  const before = await run(`JSON.parse(localStorage.getItem('kk1-data-v1'))`);
  await action("replace");
  const after = await run(`JSON.parse(localStorage.getItem('kk1-data-v1'))`);
  assert.equal(
    Object.values(after.progress).reduce(
      (s, p) => s + p.ok + p.unsure + p.ng,
      0,
    ),
    Object.values(before.progress).reduce(
      (s, p) => s + p.ok + p.unsure + p.ng,
      0,
    ),
  );
  await snap("choice-unsure");
  await action("next");
  q = await run(`document.querySelector('.question').textContent`);
  const wrong = (all.find((x) => x.question === q).answer + 1) % 4;
  await click(`[data-choice="${wrong}"]`);
  await snap("choice-incorrect");
  await action("next");
  await action("stop");
  await action("home");
  await choose("calc");
  await snap("calc-question");
  await action("step");
  await snap("calc-hint");
  await action("step");
  await snap("calc-steps");
  await action("direct");
  await snap("calc-answer");
  await action("grade-ok");
  await action("direct");
  await snap("calc-direct-answer");
  await action("grade-unsure");
  await action("stop");
  await action("home");
  await choose("essay");
  await snap("essay-question");
  await action("step");
  await snap("essay-keywords");
  await action("step");
  await snap("essay-answer");
  await action("grade-ok");
  await action("stop");
  await snap("result-essay");
  await action("home");
  await nav("progress");
  await snap("progress");
  await run("window.scrollTo(0,document.body.scrollHeight)");
  await snap("progress-flags");
  await click('[data-action^="review:"]');
  await snap("flag-review");
  await action("close");
  await nav("settings");
  await snap("settings");
  await run(
    `(()=>{const f=document.querySelector('[name="fontSize"]');f.value='L';f.dispatchEvent(new Event('change',{bubbles:true}));const t=document.querySelector('[name="theme"]');t.value='dark';t.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await snap("settings-large-dark");
  const saved = await run(`localStorage.getItem('kk1-data-v1')`);
  await cdp("Page.reload");
  await wait(`!!document.querySelector('[data-action="conditions"]')`);
  assert.equal(await run(`localStorage.getItem('kk1-data-v1')`), saved);
  const state = JSON.parse(saved);
  assert.ok(state.progress[savedId]);
  assert.ok(state.bookmarks.includes(savedId));
  assert.equal(state.flags[savedId].memo, "ブラウザ検証メモ");
  assert.equal(state.settings.fontSize, "L");
  assert.equal(state.settings.theme, "dark");
  report.push("reload persistence: progress/bookmark/flag/settings OK");
  await snap("home-reloaded");
  await cdp("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cdp("Page.reload");
  await wait(`!!document.querySelector('[data-action="conditions"]')`);
  await snap("offline-home");
  await choose("calc");
  await action("direct");
  await snap("offline-calc");
  report.push("Service Worker offline reload and question: OK");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 932,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await snap("offline-calc-430");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 667,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    errors.length,
    0,
    "JavaScript errors: " + JSON.stringify(errors),
  );
  report.push("JavaScript errors: 0");
  await cdp("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  report.push("base URL: " + base);
  fs.writeFileSync(
    path.join(out, width + "-browser-results.json"),
    JSON.stringify(
      {
        viewport: `${width}x${height}`,
        browser: "Microsoft Edge headless",
        report,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(report.join("\n"));
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  process.exit(1);
});
