function resolveRequestId(reqOrRes) {
  if (!reqOrRes) return null;
  const direct = reqOrRes.requestId;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const nested = reqOrRes.req?.requestId;
  if (typeof nested === 'string' && nested.trim()) return nested;
  return null;
}

function attachRequestId(reqOrRes, payload) {
  const requestId = resolveRequestId(reqOrRes);
  if (!requestId) return payload;

  let output;
  if (payload === null || payload === undefined) {
    output = {};
  } else if (typeof payload === 'object' && !Array.isArray(payload)) {
    output = { ...payload };
  } else {
    return payload;
  }

  const existing = output.request_id;
  if (existing && existing !== requestId) {
    console.warn('[responseMeta] request_id mismatch', { existing, requestId });
    output.request_id = requestId;
    return output;
  }

  if (!existing) {
    output.request_id = requestId;
  }

  return output;
}

module.exports = { attachRequestId, resolveRequestId };
