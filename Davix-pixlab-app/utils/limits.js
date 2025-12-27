const { sendError } = require('./errorResponse');

const MB = 1024 * 1024;

function parseIntEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBytesFromMb(valueMb, fallbackMb) {
  if (valueMb === null || valueMb === undefined) return fallbackMb * MB;
  const parsed = parseFloat(valueMb);
  if (!Number.isFinite(parsed)) return fallbackMb * MB;
  return parsed * MB;
}

function normalizePlan(plan) {
  if (!plan) return null;
  const normalizeBool = v => (v === 1 || v === true || v === '1');
  const normalizeInt = v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    ...plan,
    timeout_seconds: normalizeInt(plan.timeout_seconds),
    max_files_per_request: normalizeInt(plan.max_files_per_request),
    max_total_upload_mb: plan.max_total_upload_mb !== undefined ? Number(plan.max_total_upload_mb) : null,
    max_dimension_px: normalizeInt(plan.max_dimension_px),
    allow_h2i: plan.allow_h2i !== undefined ? normalizeBool(plan.allow_h2i) : null,
    allow_image: plan.allow_image !== undefined ? normalizeBool(plan.allow_image) : null,
    allow_pdf: plan.allow_pdf !== undefined ? normalizeBool(plan.allow_pdf) : null,
    allow_tools: plan.allow_tools !== undefined ? normalizeBool(plan.allow_tools) : null,
  };
}

function getBodyParserLimit() {
  return process.env.BODY_PARSER_JSON_LIMIT || '20mb';
}

const allowedImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

function resolveTimeoutMs(apiKeyType, plan) {
  if (apiKeyType === 'public') {
    return parseIntEnv('PUBLIC_TIMEOUT_MS', 30_000);
  }
  if (apiKeyType === 'owner') {
    return parseIntEnv('OWNER_TIMEOUT_MS', 300_000);
  }
  const fallback = 300_000;
  if (!plan) return fallback;
  if (plan.timeout_seconds !== null && plan.timeout_seconds !== undefined) {
    const asInt = parseInt(plan.timeout_seconds, 10);
    if (Number.isFinite(asInt)) return asInt * 1000;
  }
  return fallback;
}

function resolveEndpointAllowance(apiKeyType, plan, endpoint) {
  if (apiKeyType !== 'customer') return true;
  if (!plan) return true;
  const flagMap = {
    h2i: 'allow_h2i',
    image: 'allow_image',
    pdf: 'allow_pdf',
    tools: 'allow_tools',
  };
  const flagName = flagMap[endpoint];
  if (!flagName) return true;
  const value = plan[flagName];
  if (value === null || value === undefined) return true;
  return value === true;
}

function getPublicUploadDefaults(endpoint) {
  const defaults = {
    image: {
      maxFiles: parseIntEnv('PUBLIC_IMAGE_MAX_FILES_PER_REQ', 10),
      maxTotalUploadMb: parseIntEnv('PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB', 10),
      maxDimensionPx: parseIntEnv('PUBLIC_IMAGE_MAX_DIMENSION_PX', 6000),
    },
    pdf: {
      maxFiles: parseIntEnv('PUBLIC_PDF_MAX_FILES_PER_REQ', 10),
      maxTotalUploadMb: parseIntEnv('PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB', 10),
      maxDimensionPx: null,
    },
    tools: {
      maxFiles: parseIntEnv('PUBLIC_TOOLS_MAX_FILES_PER_REQ', 10),
      maxTotalUploadMb: parseIntEnv('PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB', 10),
      maxDimensionPx: parseIntEnv('PUBLIC_TOOLS_MAX_DIMENSION_PX', 6000),
    },
  };
  return defaults[endpoint] || { maxFiles: 10, maxTotalUploadMb: 10, maxDimensionPx: null };
}

function getOwnerUploadDefaults(endpoint) {
  const envMap = {
    image: {
      total: 'OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB',
      dimension: 'OWNER_IMAGE_MAX_DIMENSION_PX',
    },
    pdf: {
      total: 'OWNER_PDF_MAX_TOTAL_UPLOAD_MB',
      dimension: null,
    },
    tools: {
      total: 'OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB',
      dimension: 'OWNER_TOOLS_MAX_DIMENSION_PX',
    },
  };
  const envCfg = envMap[endpoint] || {};
  const maxTotalUploadMb = envCfg.total ? parseIntEnv(envCfg.total, null) : null;
  const maxDimensionPx = envCfg.dimension ? parseIntEnv(envCfg.dimension, null) : null;
  const maxFilesOverride = parseIntEnv('OWNER_MAX_FILES_PER_REQ', null);
  return {
    // Owners are unlimited by default; env vars can opt-in to caps.
    maxFiles: maxFilesOverride ?? 50,
    maxTotalUploadMb: maxTotalUploadMb ?? null,
    maxDimensionPx: maxDimensionPx ?? null,
  };
}

function resolveUploadLimits(apiKeyType, plan, endpoint) {
  const perFileLimitBytes = (() => {
    const parsedBytes = parseInt(process.env.MAX_UPLOAD_BYTES, 10);
    if (Number.isFinite(parsedBytes)) return parsedBytes;
    return toBytesFromMb(null, 10);
  })();
  if (apiKeyType === 'customer') {
    const fallback = getPublicUploadDefaults(endpoint);
    const maxFiles = plan?.max_files_per_request ?? fallback.maxFiles;
    const maxTotalUploadMb = plan?.max_total_upload_mb ?? fallback.maxTotalUploadMb;
    const maxDimensionPx = plan?.max_dimension_px ?? fallback.maxDimensionPx;

    return {
      maxFiles,
      maxTotalBytes: maxTotalUploadMb ? maxTotalUploadMb * MB : null,
      maxDimensionPx,
      perFileLimitBytes,
    };
  }

  const base = apiKeyType === 'public' ? getPublicUploadDefaults(endpoint) : getOwnerUploadDefaults(endpoint);
  return {
    maxFiles: base.maxFiles,
    maxTotalBytes: base.maxTotalUploadMb ? base.maxTotalUploadMb * MB : null,
    maxDimensionPx: base.maxDimensionPx,
    perFileLimitBytes,
  };
}

function resolveRequestLimits(req, endpoint) {
  if (!req._resolvedLimits) req._resolvedLimits = {};
  if (req._resolvedLimits[endpoint]) return req._resolvedLimits[endpoint];

  const normalizedPlan = normalizePlan(req.customerKey?.plan || null);
  const upload = resolveUploadLimits(req.apiKeyType, normalizedPlan, endpoint);
  const timeoutMs = resolveTimeoutMs(req.apiKeyType, normalizedPlan);
  const allowed = resolveEndpointAllowance(req.apiKeyType, normalizedPlan, endpoint);

  const resolved = {
    upload,
    timeoutMs,
    allowed,
    planSlug: normalizedPlan?.plan_slug || null,
  };

  req._resolvedLimits[endpoint] = resolved;
  return resolved;
}

function createEndpointGuard(endpoint) {
  return (req, res, next) => {
    const limits = resolveRequestLimits(req, endpoint);
    if (req.apiKeyType === 'customer' && !limits.allowed) {
      return sendError(res, 403, 'endpoint_not_allowed', 'Your plan does not allow using this endpoint.', {
        details: {
          endpoint,
          plan_slug: limits.planSlug || null,
        },
      });
    }
    return next();
  };
}

function createTimeoutMiddleware(endpoint) {
  return (req, res, next) => {
    const limits = resolveRequestLimits(req, endpoint);
    const timeoutMs = limits.timeoutMs;

    let timer = setTimeout(() => {
      if (!res.headersSent) {
        sendError(res, 503, 'timeout', 'The request took too long to complete.', {
          hint: 'Try again with a smaller payload or fewer operations.',
        });
      }
    }, timeoutMs);

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    res.on('finish', clear);
    res.on('close', clear);
    res.on('error', clear);

    next();
  };
}

module.exports = {
  MB,
  allowedImageMimes,
  getBodyParserLimit,
  resolveRequestLimits,
  createEndpointGuard,
  createTimeoutMiddleware,
};
