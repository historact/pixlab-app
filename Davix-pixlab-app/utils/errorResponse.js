function sendError(res, statusCode, code, message, options = {}) {
  const payload = {
    status: 'error',
    code,
    message,
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
