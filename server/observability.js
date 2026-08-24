export function createObservability({ enabled, createRequestId }) {
  const metrics = { total: 0, byStatus: {}, byRoute: {} };
  function middleware(req, res, next) {
    const requestId = createRequestId();
    const started = Date.now();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const route = req.route?.path || req.path;
      metrics.total += 1;
      metrics.byStatus[res.statusCode] =
        (metrics.byStatus[res.statusCode] || 0) + 1;
      metrics.byRoute[route] = (metrics.byRoute[route] || 0) + 1;
      if (enabled)
        console.log(
          JSON.stringify({
            level: "info",
            event: "http.request",
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        );
    });
    next();
  }
  return { metrics, middleware };
}
