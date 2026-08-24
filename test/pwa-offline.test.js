import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const workerPath = resolve(root, "public/service-worker.js");

async function loadWorker({ fetchImpl = fetch, offlineResponse } = {}) {
  const handlers = new Map();
  const cacheEntries = new Map();
  let precacheRequests = [];
  if (offlineResponse)
    cacheEntries.set("https://mbapo.test/offline.html", offlineResponse);

  const cache = {
    addAll: async (requests) => {
      precacheRequests = requests;
    },
    put: async (request, response) =>
      cacheEntries.set(
        typeof request === "string" ? request : request.url,
        response,
      ),
  };
  const caches = {
    open: async () => cache,
    match: async (request) =>
      cacheEntries.get(typeof request === "string" ? request : request.url),
    keys: async () => [],
    delete: async () => true,
  };
  const self = {
    location: { origin: "https://mbapo.test" },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (name, handler) => handlers.set(name, handler),
  };

  vm.runInNewContext(await readFile(workerPath, "utf8"), {
    Request,
    URL,
    Response,
    caches,
    fetch: fetchImpl,
    self,
  });

  return {
    cacheEntries,
    getPrecacheRequests: () => precacheRequests,
    handlers,
  };
}

async function dispatchFetch(worker, request) {
  let response;
  const event = {
    request,
    respondWith: (promise) => {
      response = Promise.resolve(promise);
    },
  };
  worker.handlers.get("fetch")(event);
  return response;
}

test("el manifiesto referencia activos instalables presentes", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(root, "public/manifest.webmanifest"), "utf8"),
  );

  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.lang, "es");
  assert.ok(manifest.icons.length > 0);
  await Promise.all(
    manifest.icons.map((icon) =>
      stat(
        resolve(
          root,
          `public${new URL(icon.src, "https://mbapo.test").pathname}`,
        ),
      ),
    ),
  );
});

test("el worker usa caché versionada y limpia versiones anteriores", async () => {
  const worker = await readFile(workerPath, "utf8");
  assert.match(worker, /const CACHE_VERSION = "v\d+"/);
  assert.match(
    worker,
    /const CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{CACHE_VERSION\}`/,
  );
  assert.match(worker, /key\.startsWith\("mbapo-"\) && key !== CACHE_NAME/);
  assert.match(worker, /OFFLINE_URL/);
});

test("el precache se descarga sin credenciales ni sesión", async () => {
  const worker = await loadWorker();
  let completion;
  worker.handlers.get("install")({
    waitUntil: (promise) => {
      completion = Promise.resolve(promise);
    },
  });
  await completion;

  const requests = worker.getPrecacheRequests();
  assert.ok(requests.some((request) => request.url.endsWith("/offline.html")));
  assert.ok(requests.every((request) => request.credentials === "omit"));
});

test("el worker nunca intercepta ni almacena API o solicitudes autenticadas", async () => {
  let fetchCalls = 0;
  const worker = await loadWorker({
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    },
  });

  const apiResponse = await dispatchFetch(worker, {
    method: "GET",
    url: "https://mbapo.test/api/dashboard",
    headers: new Headers(),
    mode: "cors",
    credentials: "same-origin",
    destination: "",
  });
  const authenticatedResponse = await dispatchFetch(worker, {
    method: "GET",
    url: "https://mbapo.test/assets/app.js",
    headers: new Headers({ Authorization: "Bearer session-token" }),
    mode: "cors",
    credentials: "same-origin",
    destination: "script",
  });

  assert.equal(apiResponse, undefined);
  assert.equal(authenticatedResponse, undefined);
  assert.equal(fetchCalls, 0);
  assert.equal(worker.cacheEntries.size, 0);
});

test("el worker no conserva respuestas privadas aunque sean activos estáticos", async () => {
  const worker = await loadWorker({
    fetchImpl: async () =>
      new Response("private asset", {
        headers: { "cache-control": "private, max-age=60" },
      }),
  });
  const response = await dispatchFetch(
    worker,
    new Request("https://mbapo.test/assets/private.js", {
      credentials: "same-origin",
    }),
  );

  assert.equal(await response.text(), "private asset");
  assert.equal(worker.cacheEntries.size, 0);
});

test("las navegaciones sin red muestran la página offline precacheada", async () => {
  const worker = await loadWorker({
    fetchImpl: async () => {
      throw new TypeError("offline");
    },
    offlineResponse: new Response("offline fallback", { status: 200 }),
  });
  const response = await dispatchFetch(worker, {
    method: "GET",
    url: "https://mbapo.test/reservas/123",
    headers: new Headers(),
    mode: "navigate",
    credentials: "include",
    destination: "document",
  });

  assert.equal(await response.text(), "offline fallback");
});

test("la página offline es autónoma y accesible", async () => {
  const page = await readFile(resolve(root, "public/offline.html"), "utf8");
  assert.match(page, /<main aria-labelledby="offline-title">/);
  assert.match(page, /<h1 id="offline-title">Estás sin conexión<\/h1>/);
  assert.match(
    page,
    /<button type="button" onclick="window\.location\.reload\(\)">/,
  );
  assert.match(page, /window\.addEventListener\("online"/);
});
