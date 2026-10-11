import { randomUUID } from 'node:crypto';

function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const requestPath = req.originalUrl.split('?')[0];
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http.request.completed',
      requestId,
      method: req.method,
      path: requestPath,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100
    }));
  });
  next();
}

export default requestLogger;
