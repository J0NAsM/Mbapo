const CACHE_PREFIX = "mbapo-static-";
const CACHE_VERSION = "v4";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
];
const publicRequest = (url) =>
  new Request(new URL(url, self.location.origin), { credentials: "omit" });
const OFFLINE_REQUEST = publicRequest(OFFLINE_URL);
const PRECACHE_REQUESTS = PRECACHE_URLS.map(publicRequest);
const STATIC_DESTINATIONS = new Set([
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "worker",
]);

function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function isAuthenticatedRequest(request) {
  return (
    request.headers.has("authorization") ||
    request.headers.has("x-idempotency-key") ||
    request.credentials === "include"
  );
}

function isStaticAssetRequest(request, url) {
  return (
    STATIC_DESTINATIONS.has(request.destination) ||
    url.pathname.startsWith("/assets/") ||
    PRECACHE_URLS.includes(url.pathname)
  );
}

function canCache(response) {
  const cacheControl = response.headers.get("cache-control") || "";
  return (
    response.ok &&
    (response.type === "basic" || response.type === "default") &&
    !response.headers.has("set-cookie") &&
    !/\b(?:no-store|private)\b/i.test(cacheControl)
  );
}

async function cacheStaticResponse(request, response) {
  if (!canCache(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(new Request(request, { credentials: "omit" }));
  await cacheStaticResponse(request, response);
  return response;
}

async function networkFirstNavigation(request) {
  try {
    // Never store navigation responses: they can depend on a session or cookies.
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_REQUEST)) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_REQUESTS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mbapo-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isAuthenticatedRequest(request) || !isStaticAssetRequest(request, url))
    return;

  event.respondWith(cacheFirstStatic(request));
});
