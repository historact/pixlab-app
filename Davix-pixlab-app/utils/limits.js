const { sendError } = require('./errorResponse');
const { getGlobalUploadCeilings } = require('./config');
const { recordTimeout } = require('./metrics');

const MB = 1024 * 1024;


const DEFAULT_PUBLIC_ENDPOINT_TIMEOUTS_MS = Object.freeze({
  h2i: 30_000,
  image: 30_000,
  pdf: 30_000,
  tools: 30_000,
});

const DEFAULT_PUBLIC_H2I_LIMITS = Object.freeze({
  maxHtmlChars: 100_000,
  maxRenderWidth: 5_000,
  maxRenderHeight: 8_000,
  maxRenderPixels: 20_000_000,
});

const DEFAULT_PUBLIC_PDF_PAGE_LIMITS = Object.freeze({
  toImagesProd: 50,
  toImagesDev: 200,
  extractImagesProd: 50,
  extractImagesDev: 200,
  split: 200,
});

const DEFAULT_CUSTOMER_H2I_LIMITS = Object.freeze({
  maxHtmlChars: 100_000,
  maxRenderWidth: 5_000,
  maxRenderHeight: 8_000,
  maxRenderPixels: 20_000_000,
});

const DEFAULT_CUSTOMER_UPLOAD_LIMITS = Object.freeze({
  maxFiles: 10,
  maxTotalUploadMb: 10,
  perFileUploadMb: 10,
});

function clampToCap(value, cap) {
  if (!Number.isFinite(cap) || cap <= 0) return value;
  if (!Number.isFinite(value) || value <= 0) return cap;
  return Math.min(value, cap);
}

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
  const normalizeNumber = v => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    ...plan,
    timeout_seconds: normalizeInt(plan.timeout_seconds),
    timeout_ms: normalizeInt(plan.timeout_ms),
    max_files_per_request: normalizeInt(plan.max_files_per_request),
    max_total_upload_mb: normalizeNumber(plan.max_total_upload_mb),
    max_dimension_px: normalizeInt(plan.max_dimension_px),
    max_upload_bytes_per_file: normalizeInt(plan.max_upload_bytes_per_file),
    allow_h2i: plan.allow_h2i !== undefined ? normalizeBool(plan.allow_h2i) : null,
    allow_image: plan.allow_image !== undefined ? normalizeBool(plan.allow_image) : null,
    allow_pdf: plan.allow_pdf !== undefined ? normalizeBool(plan.allow_pdf) : null,
    allow_tools: plan.allow_tools !== undefined ? normalizeBool(plan.allow_tools) : null,
    h2i_enabled: plan.h2i_enabled !== undefined ? normalizeBool(plan.h2i_enabled) : null,
    image_enabled: plan.image_enabled !== undefined ? normalizeBool(plan.image_enabled) : null,
    pdf_enabled: plan.pdf_enabled !== undefined ? normalizeBool(plan.pdf_enabled) : null,
    tools_enabled: plan.tools_enabled !== undefined ? normalizeBool(plan.tools_enabled) : null,
    h2i_max_html_chars: normalizeInt(plan.h2i_max_html_chars),
    h2i_max_render_width: normalizeInt(plan.h2i_max_render_width),
    h2i_max_render_height: normalizeInt(plan.h2i_max_render_height),
    h2i_max_render_pixels: normalizeInt(plan.h2i_max_render_pixels),
    image_max_dimension_px: normalizeInt(plan.image_max_dimension_px),
    image_max_total_upload_mb: normalizeNumber(plan.image_max_total_upload_mb),
    image_max_files_per_request: normalizeInt(plan.image_max_files_per_request),
    pdf_max_total_upload_mb: normalizeNumber(plan.pdf_max_total_upload_mb),
    pdf_max_files_per_request: normalizeInt(plan.pdf_max_files_per_request),
    pdf_max_pages_to_images: normalizeInt(plan.pdf_max_pages_to_images),
    pdf_max_pages_extract_images: normalizeInt(plan.pdf_max_pages_extract_images),
    pdf_max_pages_split: normalizeInt(plan.pdf_max_pages_split),
    tools_max_dimension_px: normalizeInt(plan.tools_max_dimension_px),
    tools_max_total_upload_mb: normalizeNumber(plan.tools_max_total_upload_mb),
    tools_max_files_per_request: normalizeInt(plan.tools_max_files_per_request),
    burst_limit_per_min: normalizeInt(plan.burst_limit_per_min),
    burst_window_seconds: normalizeInt(plan.burst_window_seconds),
    burst_applies_to: typeof plan.burst_applies_to === 'string' ? plan.burst_applies_to.toLowerCase() : null,
    quota_mode: typeof plan.quota_mode === 'string' ? plan.quota_mode.toLowerCase() : null,
    monthly_h2i_limit: normalizeInt(plan.monthly_h2i_limit),
    monthly_image_limit: normalizeInt(plan.monthly_image_limit),
    monthly_pdf_limit: normalizeInt(plan.monthly_pdf_limit),
    monthly_tools_limit: normalizeInt(plan.monthly_tools_limit),
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

function resolvePublicTimeoutMs(endpoint) {
  const endpointMap = {
    h2i: 'PUBLIC_H2I_TIMEOUT_MS',
    image: 'PUBLIC_IMAGE_TIMEOUT_MS',
    pdf: 'PUBLIC_PDF_TIMEOUT_MS',
    tools: 'PUBLIC_TOOLS_TIMEOUT_MS',
  };
  const endpointVar = endpointMap[endpoint];
  if (!endpointVar) return DEFAULT_PUBLIC_ENDPOINT_TIMEOUTS_MS.h2i;
  return parseIntEnv(endpointVar, DEFAULT_PUBLIC_ENDPOINT_TIMEOUTS_MS[endpoint]);
}

function resolveTimeoutMs(apiKeyType, plan, endpoint) {
  if (apiKeyType === 'public') {
    return resolvePublicTimeoutMs(endpoint);
  }
  if (apiKeyType === 'owner') {
    return parseIntEnv('OWNER_TIMEOUT_MS', 300_000);
  }
  const fallback = 300_000;
  if (!plan) return fallback;
  if (plan.timeout_ms !== null && plan.timeout_ms !== undefined) {
    const asInt = parseInt(plan.timeout_ms, 10);
    if (Number.isFinite(asInt) && asInt > 0) return asInt;
  }
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
    h2i: ['h2i_enabled', 'allow_h2i'],
    image: ['image_enabled', 'allow_image'],
    pdf: ['pdf_enabled', 'allow_pdf'],
    tools: ['tools_enabled', 'allow_tools'],
  };
  const flagNames = flagMap[endpoint];
  if (!flagNames) return true;
  const [overrideFlag, legacyFlag] = flagNames;
  const value = plan[overrideFlag] !== null && plan[overrideFlag] !== undefined ? plan[overrideFlag] : plan[legacyFlag];
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
  const globalPerFileLimitBytes = (() => {
    const parsedBytes = parseInt(process.env.GLOBAL_MAX_UPLOAD_BYTES, 10);
    if (Number.isFinite(parsedBytes) && parsedBytes > 0) return parsedBytes;
    return toBytesFromMb(null, DEFAULT_CUSTOMER_UPLOAD_LIMITS.perFileUploadMb);
  })();

  const perFileLimitBytes = (() => {
    if (apiKeyType === 'customer') {
      const planPerFile = parseInt(plan?.max_upload_bytes_per_file, 10);
      if (!Number.isFinite(planPerFile) || planPerFile <= 0) {
        return Number.isFinite(globalPerFileLimitBytes) && globalPerFileLimitBytes > 0
          ? globalPerFileLimitBytes
          : null;
      }
      return clampToCap(planPerFile, globalPerFileLimitBytes);
    }
    return globalPerFileLimitBytes;
  })();
  if (apiKeyType === 'customer') {
    const endpointMap = {
      image: {
        maxFiles: plan?.image_max_files_per_request,
        maxTotalUploadMb: plan?.image_max_total_upload_mb,
        maxDimensionPx: plan?.image_max_dimension_px,
      },
      pdf: {
        maxFiles: plan?.pdf_max_files_per_request,
        maxTotalUploadMb: plan?.pdf_max_total_upload_mb,
        maxDimensionPx: null,
      },
      tools: {
        maxFiles: plan?.tools_max_files_per_request,
        maxTotalUploadMb: plan?.tools_max_total_upload_mb,
        maxDimensionPx: plan?.tools_max_dimension_px,
      },
    };
    const endpointLimits = endpointMap[endpoint] || {};
    const maxFiles = endpointLimits.maxFiles ?? plan?.max_files_per_request ?? DEFAULT_CUSTOMER_UPLOAD_LIMITS.maxFiles;
    const maxTotalUploadMb = endpointLimits.maxTotalUploadMb ?? plan?.max_total_upload_mb ?? DEFAULT_CUSTOMER_UPLOAD_LIMITS.maxTotalUploadMb;
    const maxDimensionPx = endpointLimits.maxDimensionPx ?? plan?.max_dimension_px ?? null;
    const capped = applyGlobalCeilings({ maxFiles, maxTotalUploadMb, maxDimensionPx });

    const effectiveMaxTotalUploadMb = Number.isFinite(capped.maxTotalUploadMb) && capped.maxTotalUploadMb > 0
      ? capped.maxTotalUploadMb
      : null;
    return {
      maxFiles: capped.maxFiles,
      maxTotalUploadMb: effectiveMaxTotalUploadMb,
      maxTotalBytes: effectiveMaxTotalUploadMb ? effectiveMaxTotalUploadMb * MB : null,
      maxDimensionPx: capped.maxDimensionPx,
      perFileLimitBytes,
    };
  }

  const base = apiKeyType === 'public' ? getPublicUploadDefaults(endpoint) : getOwnerUploadDefaults(endpoint);
  const capped = applyGlobalCeilings({
    maxFiles: base.maxFiles,
    maxTotalUploadMb: base.maxTotalUploadMb,
    maxDimensionPx: base.maxDimensionPx,
  });
  const effectiveMaxTotalUploadMb = Number.isFinite(capped.maxTotalUploadMb) && capped.maxTotalUploadMb > 0
    ? capped.maxTotalUploadMb
    : null;
  return {
    maxFiles: capped.maxFiles,
    maxTotalUploadMb: effectiveMaxTotalUploadMb,
    maxTotalBytes: effectiveMaxTotalUploadMb ? effectiveMaxTotalUploadMb * MB : null,
    maxDimensionPx: capped.maxDimensionPx,
    perFileLimitBytes,
  };
}

function applyGlobalCeilings({ maxFiles, maxTotalUploadMb, maxDimensionPx }) {
  const ceilings = getGlobalUploadCeilings();
  let cappedMaxFiles = maxFiles;
  let cappedMaxTotalUploadMb = maxTotalUploadMb;

  if (Number.isFinite(ceilings.maxFilesPerReq)) {
    if (cappedMaxFiles === null || cappedMaxFiles === undefined) {
      cappedMaxFiles = ceilings.maxFilesPerReq;
    } else {
      cappedMaxFiles = Math.min(cappedMaxFiles, ceilings.maxFilesPerReq);
    }
  }

  if (Number.isFinite(ceilings.maxTotalUploadMb)) {
    if (cappedMaxTotalUploadMb === null || cappedMaxTotalUploadMb === undefined) {
      cappedMaxTotalUploadMb = ceilings.maxTotalUploadMb;
    } else {
      cappedMaxTotalUploadMb = Math.min(cappedMaxTotalUploadMb, ceilings.maxTotalUploadMb);
    }
  }

  return {
    maxFiles: cappedMaxFiles,
    maxTotalUploadMb: cappedMaxTotalUploadMb,
    maxDimensionPx,
  };
}

function resolveRequestLimits(req, endpoint) {
  if (!req._resolvedLimits) req._resolvedLimits = {};
  if (req._resolvedLimits[endpoint]) return req._resolvedLimits[endpoint];

  const normalizedPlan = normalizePlan(req.customerKey?.plan || null);
  const upload = resolveUploadLimits(req.apiKeyType, normalizedPlan, endpoint);
  const timeoutMs = resolveTimeoutMs(req.apiKeyType, normalizedPlan, endpoint);
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
    if (!req.abortController) {
      req.abortController = new AbortController();
      req.abortSignal = req.abortController.signal;
    }

    let timer = setTimeout(() => {
      if (req.abortController && !req.abortSignal.aborted) {
        req.abortController.abort();
      }
      if (!res.headersSent) {
        recordTimeout(endpoint);
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

function resolveH2iRenderLimits(req) {
  const plan = normalizePlan(req.customerKey?.plan || null);
  const globalLimits = {
    maxHtmlChars: parseIntEnv('GLOBAL_MAX_HTML_CHARS', DEFAULT_PUBLIC_H2I_LIMITS.maxHtmlChars),
    maxRenderWidth: parseIntEnv('GLOBAL_MAX_RENDER_WIDTH', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderWidth),
    maxRenderHeight: parseIntEnv('GLOBAL_MAX_RENDER_HEIGHT', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderHeight),
    maxRenderPixels: parseIntEnv('GLOBAL_MAX_RENDER_PIXELS', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderPixels),
  };

  if (req.apiKeyType === 'public') {
    const publicLimits = {
      maxHtmlChars: parseIntEnv('PUBLIC_H2I_MAX_HTML_CHARS', DEFAULT_PUBLIC_H2I_LIMITS.maxHtmlChars),
      maxRenderWidth: parseIntEnv('PUBLIC_H2I_MAX_RENDER_WIDTH', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderWidth),
      maxRenderHeight: parseIntEnv('PUBLIC_H2I_MAX_RENDER_HEIGHT', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderHeight),
      maxRenderPixels: parseIntEnv('PUBLIC_H2I_MAX_RENDER_PIXELS', DEFAULT_PUBLIC_H2I_LIMITS.maxRenderPixels),
    };
    return {
      maxHtmlChars: clampToCap(publicLimits.maxHtmlChars, globalLimits.maxHtmlChars),
      maxRenderWidth: clampToCap(publicLimits.maxRenderWidth, globalLimits.maxRenderWidth),
      maxRenderHeight: clampToCap(publicLimits.maxRenderHeight, globalLimits.maxRenderHeight),
      maxRenderPixels: clampToCap(publicLimits.maxRenderPixels, globalLimits.maxRenderPixels),
    };
  }

  if (req.apiKeyType === 'customer') {
    const tierLimits = {
      maxHtmlChars: plan?.h2i_max_html_chars ?? DEFAULT_CUSTOMER_H2I_LIMITS.maxHtmlChars,
      maxRenderWidth: plan?.h2i_max_render_width ?? DEFAULT_CUSTOMER_H2I_LIMITS.maxRenderWidth,
      maxRenderHeight: plan?.h2i_max_render_height ?? DEFAULT_CUSTOMER_H2I_LIMITS.maxRenderHeight,
      maxRenderPixels: plan?.h2i_max_render_pixels ?? DEFAULT_CUSTOMER_H2I_LIMITS.maxRenderPixels,
    };
    return {
      maxHtmlChars: clampToCap(tierLimits.maxHtmlChars, globalLimits.maxHtmlChars),
      maxRenderWidth: clampToCap(tierLimits.maxRenderWidth, globalLimits.maxRenderWidth),
      maxRenderHeight: clampToCap(tierLimits.maxRenderHeight, globalLimits.maxRenderHeight),
      maxRenderPixels: clampToCap(tierLimits.maxRenderPixels, globalLimits.maxRenderPixels),
    };
  }

  return globalLimits;
}

function resolvePdfPageLimits(req) {
  const plan = normalizePlan(req.customerKey?.plan || null);
  const defaultGlobalLimits = {
    toImages: process.env.NODE_ENV === 'production' ? DEFAULT_PUBLIC_PDF_PAGE_LIMITS.toImagesProd : DEFAULT_PUBLIC_PDF_PAGE_LIMITS.toImagesDev,
    extractImages: process.env.NODE_ENV === 'production' ? DEFAULT_PUBLIC_PDF_PAGE_LIMITS.extractImagesProd : DEFAULT_PUBLIC_PDF_PAGE_LIMITS.extractImagesDev,
    split: DEFAULT_PUBLIC_PDF_PAGE_LIMITS.split,
  };
  const globalLimits = {
    toImages: parseIntEnv('GLOBAL_PDF_MAX_PAGES_TO_IMAGES', defaultGlobalLimits.toImages),
    extractImages: parseIntEnv('GLOBAL_PDF_MAX_PAGES_EXTRACT_IMAGES', defaultGlobalLimits.extractImages),
    split: parseIntEnv('GLOBAL_PDF_MAX_PAGES_SPLIT', defaultGlobalLimits.split),
  };

  if (req.apiKeyType === 'public') {
    const publicLimits = {
      toImages: parseIntEnv('PUBLIC_PDF_MAX_PAGES_TO_IMAGES', defaultGlobalLimits.toImages),
      extractImages: parseIntEnv('PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES', defaultGlobalLimits.extractImages),
      split: parseIntEnv('PUBLIC_PDF_MAX_PAGES_SPLIT', defaultGlobalLimits.split),
    };
    return {
      toImages: clampToCap(publicLimits.toImages, globalLimits.toImages),
      extractImages: clampToCap(publicLimits.extractImages, globalLimits.extractImages),
      split: clampToCap(publicLimits.split, globalLimits.split),
    };
  }
  if (req.apiKeyType === 'customer') {
    const tierLimits = {
      toImages: plan?.pdf_max_pages_to_images ?? defaultGlobalLimits.toImages,
      extractImages: plan?.pdf_max_pages_extract_images ?? defaultGlobalLimits.extractImages,
      split: plan?.pdf_max_pages_split ?? defaultGlobalLimits.split,
    };
    return {
      toImages: clampToCap(tierLimits.toImages, globalLimits.toImages),
      extractImages: clampToCap(tierLimits.extractImages, globalLimits.extractImages),
      split: clampToCap(tierLimits.split, globalLimits.split),
    };
  }
  return globalLimits;
}

function validatePlanLimits(endpoint) {
  return createEndpointGuard(endpoint);
}

module.exports = {
  MB,
  allowedImageMimes,
  getBodyParserLimit,
  resolveRequestLimits,
  resolveH2iRenderLimits,
  resolvePdfPageLimits,
  normalizePlan,
  createEndpointGuard,
  validatePlanLimits,
  createTimeoutMiddleware,
};
