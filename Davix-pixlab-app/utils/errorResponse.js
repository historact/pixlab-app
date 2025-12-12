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

  if (typeof options.details !== 'undefined') {
    payload.error.details = options.details;
  }

  res.status(statusCode).json(payload);
}

module.exports = { sendError };
