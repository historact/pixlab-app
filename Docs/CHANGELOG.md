# Changelog

This page tracks customer-facing changes to the PixLab app, which powers Davix H2I through the H2I engine (PixLab).

## Initial Release

### Added
- Public API surface for authenticated processing requests:
  - `POST /v1/h2i` for HTML-to-image and HTML-to-PDF rendering.
  - `POST /v1/image` for image processing and image-to-PDF workflows.
  - `POST /v1/pdf` for PDF conversion and editing operations.
  - `POST /v1/tools` for image analysis utilities.
- API key authentication across public endpoints, including `X-Api-Key` and Bearer token support, with stricter production behavior that rejects API keys in query/body locations.
- HTML rendering pipeline in the H2I engine (PixLab) with support for:
  - HTML and optional CSS input composition.
  - Image output (PNG/JPEG) and PDF output.
  - Configurable viewport/render size and print-oriented PDF options (page format, margins, scale, print background, landscape/portrait, CSS page sizing).
  - Request interception safeguards that block disallowed protocols and private-network targets during page rendering.
- Image processing actions in the H2I engine (PixLab), including format conversion, resize, crop, transform, compression, enhancement, padding, framing, background flattening, text/image watermarking, metadata extraction, and multitask execution in a single request.
- PDF operations in the H2I engine (PixLab), including merge, PDF-to-images conversion, compression, embedded image extraction, watermarking (text or image), page rotation, metadata extraction, page reordering, page deletion, range extraction, flattening, encryption, decryption, and split-by-range output generation.
- Tools/analysis workflows in the H2I engine (PixLab), including metadata and EXIF reads, dominant/palette color extraction, format detection, orientation checks, hash generation, similarity comparisons, transparency estimation, image quality scoring, and efficiency estimation.
- Output delivery model that returns generated file URLs for H2I/image/PDF jobs, with signed URL support for access control and expiration-aware validation on output retrieval.
- Consistent request/response tracing metadata:
  - Per-request `Request-Id` response headers and `request_id` fields in JSON responses.
  - Optional idempotency key acceptance (`Idempotency-Key` / `X-Idempotency-Key`) with validation and echo headers.
- Customer-visible usage controls and protection layers, including endpoint-level plan gating, upload constraints (file count/size/dimensions), PDF page limits for specific actions, daily public-key/IP rate limits, burst controls, endpoint timeouts, and concurrency caps with retry-oriented error responses when the server is busy.
- Structured JSON error responses with stable error codes, validation hints, and sanitized details for public API callers.

---

This changelog is customer-facing.

For future releases, add new entries at the top of this file in reverse chronological order.

Record only externally visible behavior changes.
