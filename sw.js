// アプリのファイルを直したら CACHE_VERSION を1つ上げる。
const CACHE_VERSION = "kk1-v3";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./js/app.js",
  "./js/srs.js",
  "./js/store.js",
  "./js/questions.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(CORE);
      const response = await fetch("./questions/index.json");
      if (!response.ok) throw Error("問題一覧を取得できません");
      const index = await response.clone().json();
      await cache.put("./questions/index.json", response);
      await cache.addAll(index.files.map((f) => "./questions/" + f));
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith("kk1-") && k !== CACHE_VERSION) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      if (new URL(event.request.url).pathname.includes("/questions/")) {
        let response;
        try {
          response = await fetch(event.request);
          if (!response.ok) throw Error(response.status);
        } catch {
          return (await cache.match(event.request)) || Response.error();
        }
        try {
          await cache.put(event.request, response.clone());
        } catch {
          /* キャッシュ保存失敗時も取得した問題を返す。 */
        }
        return response;
      }
      return (await cache.match(event.request)) || fetch(event.request);
    })(),
  );
});
