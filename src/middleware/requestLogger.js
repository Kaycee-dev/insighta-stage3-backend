function requestLogger(logger = console.log) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      logger(`[request] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`);
    });
    next();
  };
}

module.exports = { requestLogger };
