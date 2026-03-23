# Changelog

This file tracks release history for PixLab. New releases should be added as new top-level sections, with the newest release first.

## PixLab 1.0.0 — Initial Release

### Overview
PixLab 1.0.0 launches a production Node.js/Express API platform for HTML rendering, image processing, PDF processing, and image analysis tooling. The release includes authenticated public APIs under `/v1/*`, protected internal/admin operational surfaces, MySQL-backed usage/quota/account lifecycle data, signed output delivery controls, and startup/runtime safety checks for production operation.

### Highlights
- Unified public processing API across four domains: HTML rendering, image transforms, PDF workflows, and analysis tools.
- Authenticated multi-surface architecture: external API key auth, internal bridge-token auth + IP allowlisting, and session/TOTP-protected admin operations.
- Plan-aware enforcement model with endpoint gating, upload/page/time limits, burst and daily rate limits, concurrency controls, and quota reservation/finalization.
- Signed URL enforcement for generated assets, with configurable required mode and expiry/signature validation.
- Built-in operational lifecycle systems: schema verification/auto-migrations, health/diagnostic routes, metrics + alerting engines, and recurring retention/cleanup jobs.

### Included in this release

#### Public API
- `POST /v1/h2i`: HTML/CSS rendering to either image output (`action=image`) or PDF output (`action=pdf`).
- `POST /v1/image`: multipart image processing endpoint with action-based workflows for conversion/editing, metadata, watermarking, and image-to-PDF generation.
- `POST /v1/pdf`: multipart PDF workflows including conversion, merge/split/edit, metadata, encryption/decryption, and extraction operations.
- `POST /v1/tools`: image analysis endpoint supporting single-tool and multi-tool batch analysis.
- Public generated outputs are served from static paths under `/h2i`, `/image`, and `/pdf` (and `/tools` static path is mounted for output hosting compatibility).

#### HTML Rendering
- Supports HTML input with optional CSS, width/height sizing, and image/PDF output mode selection.
- PDF rendering controls include format, landscape mode, margin, scale, print mode/background, and CSS page-size preference options.
- Enforces HTML size and render bounds, request timeouts, endpoint concurrency limits, plan-aware quotas, and per-day public-key/IP rate limits.
- Includes outbound request interception controls for rendering security: protocol restrictions, localhost/private-network blocking, DNS lookup checks, and DNS rebinding modes.

#### Image Processing
- Supported actions: `format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, and `multitask`.
- Supports common image upload formats (JPEG, PNG, WebP, GIF, AVIF, SVG), output conversion, and multi-file request handling.
- Includes orientation normalization, blur/sharpen, grayscale/sepia, brightness/contrast/saturation, border/padding/background workflows, and text/image watermark placement controls.
- Supports image-to-PDF generation with single/multi-page mode and configurable page/embed options.
- Metadata action returns structured metadata/EXIF responses (with optional raw EXIF), while transform actions produce signed output URLs.

#### PDF Processing
- Supported actions: `merge`, `to-images`, `compress`, `extract-images`, `watermark`, `rotate`, `metadata`, `reorder`, `delete-pages`, `extract`, `flatten`, `encrypt`, `decrypt`, and `split`.
- Uses native/system-assisted PDF toolchain plus in-process PDF editing to support conversion, structural edits, watermarking, and protection/unprotection flows.
- Page-range parsing and page-limit enforcement are applied for page-expanding actions (`to-images`, `extract-images`, `split`) with plan-aware caps.
- Returns generated file/image artifacts via output URLs with signed URL support.

#### Tools and Analysis
- `single` and `multitask` execution modes with one or multiple tool operations per request.
- Implemented tools include metadata/EXIF extraction, dominant/palette color analysis, format detection, orientation checks, perceptual/cryptographic hashing, similarity scoring, dimension/aspect inspection, transparency estimation, image quality scoring, and compression-efficiency estimation.
- Similarity mode supports pairwise and "to first" comparisons, with request-size safeguards for pairwise analysis.

#### Authentication and Access Control
- Public `/v1/*` endpoints require API keys via `X-Api-Key` or `Authorization: Bearer`; production rejects body/query key locations.
- Distinguishes owner/public/customer key types and loads customer subscription/plan data for runtime enforcement.
- Internal `/internal/*` APIs require `x-davix-bridge-token`, enforce token equality checks, and apply IP allowlist controls.
- Diagnostics endpoints use stricter internal middleware requiring explicit allowlist configuration.
- Admin surface is mounted under a secretized path (`/${ADMIN_PATH}/${ADMIN_PASS}`) with DB-backed sessions, password hash verification, TOTP checks, login lockout controls, and CSRF protection for state-changing requests.

#### Plans, Quotas, and Limits
- Plan model supports endpoint allow/deny flags and per-endpoint limits (files/request, upload MB, image dimensions, PDF page caps, timeout, scoped monthly quotas, burst settings).
- Quota accounting supports reservation/finalization/refund lifecycle and idempotent dedupe via request IDs/idempotency keys.
- Monthly usage tracking persists endpoint-scoped counters, bytes, error stats, and request summaries.
- Public traffic rate controls include per-scope daily counters; customer traffic includes configurable burst limiting.
- Concurrency semaphores are implemented per major domain (h2i/image/pdf/tools), with timeout-based queue rejection behavior.

#### Internal and Admin Operations
- Internal subscription and key lifecycle APIs include user summary/usage/log retrieval, key provisioning/rotation/disable/toggle, purge/reconcile operations, plan sync, and subscription event ingestion.
- Admin APIs include monitoring/metrics views, log channel controls, event querying/export paths, and alerting rule management/ack/silence workflows.
- Monitoring endpoints expose metrics snapshots and generated snapshot artifacts for alert context.

#### Data, Schema, and Lifecycle Management
- Canonical SQL baseline and migration framework are included, with startup schema checks and optional auto-migration execution.
- MySQL persistence covers API keys, plans, usage, request logs, quota ledger, subscription events, rate-limit windows, admin sessions/lockouts, alert rules/state/events/deliveries, and lease locks.
- Background jobs include API key expiry processing, orphan/retention cleanup, ledger reclaim/cleanup, subscription-event cleanup, alert-delivery/event retention cleanup, admin-session retention cleanup, output file retention cleanup, and temp upload cleanup.

#### Reliability and Production Readiness
- Startup validation verifies required env configuration, trust-proxy posture, schema readiness, and critical runtime dependencies (including Sharp/Puppeteer probes and required PDF binaries).
- Health endpoints (`/health`, `/health/health`) and internal diagnostics endpoints provide service and schema status visibility.
- Request lifecycle instrumentation includes request IDs, optional idempotency-key normalization/validation, structured logging, redaction paths, error normalization, and metrics recording.
- Global and endpoint-specific timeout middleware and upload validation enforce predictable failure behavior and protect service stability.

### Notes
- This release establishes the full v1 API and operational foundation shipped in the repository codebase.
- Usage billing counters are finalized on successful work completion paths, while error paths still record request and error metadata for auditability.
- Signed output URL enforcement is deployment-configurable; when required mode is enabled, output retrieval requires valid `exp` and `sig` parameters.
