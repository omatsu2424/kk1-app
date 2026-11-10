const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9229/json")).json(),
    target = targets.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map(),
    errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params);
  });
  const call = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const run = async (expression) =>
    (
      await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.value;
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  let stopped = false;
  try {
    await fetch("http://127.0.0.1:8766/");
  } catch {
    stopped = true;
  }
  assert.ok(stopped, "Python server must be stopped");
  await call("Page.reload");
  for (let i = 0; i < 100; i++) {
    if (await run(`!!document.querySelector('[data-action="conditions"]')`))
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(
    await run(`!!document.querySelector('[data-action="conditions"]')`),
  );
  await run(
    `document.querySelector('[data-action="conditions"]').click();document.querySelector('[data-action="start"]').click();document.querySelector('[data-action="direct"]').click();`,
  );
  assert.ok(await run(`!!document.querySelector('[data-action="grade-ok"]')`));
  assert.equal(
    await run("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  assert.equal(errors.length, 0);
  const shot = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(__dirname, "../_check/offline-server-stopped.png"),
    Buffer.from(shot.data, "base64"),
  );
  fs.writeFileSync(
    path.join(__dirname, "../_check/offline-server-stopped.json"),
    JSON.stringify(
      {
        serverStopped: true,
        reload: true,
        question: true,
        jsErrors: errors.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "Python server stopped: offline reload + calculation answer OK; JS errors 0",
  );
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
