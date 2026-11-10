import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
test("問題のキャッシュ保存失敗でもネットワークの応答を返す", async () => {
  const handlers = {};
  const response = new Response('[{"id":"q-1"}]');
  const context = {
    URL,
    Response,
    fetch: async () => response,
    caches: {
      open: async () => ({
        put: async () => {
          throw Error("quota");
        },
        match: async () => new Response("old"),
      }),
    },
    self: {
      location: { origin: "https://example.test" },
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"),
    context,
  );
  let result;
  handlers.fetch({
    request: { method: "GET", url: "https://example.test/questions/a.json" },
    respondWith: (p) => {
      result = p;
    },
  });
  assert.equal(await result, response);
});
