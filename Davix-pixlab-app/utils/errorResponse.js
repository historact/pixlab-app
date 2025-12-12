function sendError(res, statusCode, code, message, options = {}) {
  const payload = {
    error: {
      code,
      message,
    },
  };

  if (options.hint) {
    payload.error.hint = options.hint;
  }

  if (process.env.DEBUG_ERRORS === 'true' && options.details) {
    payload.error.details = String(options.details);
  }

  res.status(statusCode).json(payload);
}

module.exports = { sendError };
