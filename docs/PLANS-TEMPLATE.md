# PixLab Plans Template

This document describes the `plans` table used by PixLab to define subscription plans.
Each row in `plans` is one subscription plan record that controls pricing metadata, feature permissions, and usage limits/quotas.
The structure below is derived from the real database schema and plan sync logic in the repository (not guessed).

## Plans table schema (derived from code)

| Column | Type (from schema) | Meaning visible from code usage |
|---|---|---|
| `id` | `int(10) unsigned` (PK, AUTO_INCREMENT) | Internal plan identifier. |
| `plan_slug` | `varchar(50)` (unique) | Stable plan key used by sync and lookup (`free`, etc.). |
| `name` | `varchar(100)` | Human-readable plan name. |
| `billing_period` | `varchar(20)` | Billing cycle (`monthly`/`yearly` accepted by sync route). |
| `monthly_quota_files` | `int(10) unsigned` | Monthly total file quota. |
| `max_files_per_request` | `int(10) unsigned` | Max files allowed per request (global). |
| `max_total_upload_mb` | `int(10) unsigned` | Max combined upload size per request in MB (global). |
| `max_dimension_px` | `int(10) unsigned` | Max pixel dimension for legacy/global image constraints. |
| `timeout_seconds` | `int(10) unsigned` | Request timeout budget in seconds. |
| `allow_h2i` | `tinyint(1)` | Global on/off for H2I capability. |
| `allow_image` | `tinyint(1)` | Global on/off for image capability. |
| `allow_pdf` | `tinyint(1)` | Global on/off for PDF capability. |
| `allow_tools` | `tinyint(1)` | Global on/off for tools capability. |
| `max_upload_bytes_per_file` | `int(10) unsigned` | Max upload size per individual file (bytes). |
| `h2i_enabled` | `tinyint(1)` | H2I scoped enable flag. |
| `h2i_max_html_chars` | `int(10) unsigned` | H2I max HTML input length. |
| `h2i_max_render_width` | `int(10) unsigned` | H2I max render width (px). |
| `h2i_max_render_height` | `int(10) unsigned` | H2I max render height (px). |
| `h2i_max_render_pixels` | `int(10) unsigned` | H2I max render area (pixels). |
| `image_enabled` | `tinyint(1)` | Image scoped enable flag. |
| `image_max_dimension_px` | `int(10) unsigned` | Image max dimension (px). |
| `image_max_total_upload_mb` | `int(10) unsigned` | Image max total upload (MB). |
| `image_max_files_per_request` | `int(10) unsigned` | Image max files per request. |
| `pdf_enabled` | `tinyint(1)` | PDF scoped enable flag. |
| `pdf_max_total_upload_mb` | `int(10) unsigned` | PDF max total upload (MB). |
| `pdf_max_files_per_request` | `int(10) unsigned` | PDF max files per request. |
| `pdf_max_pages_to_images` | `int(10) unsigned` | PDF page cap for PDF-to-images flow. |
| `pdf_max_pages_extract_images` | `int(10) unsigned` | PDF page cap for extract-images flow. |
| `pdf_max_pages_split` | `int(10) unsigned` | PDF page cap for split flow. |
| `tools_enabled` | `tinyint(1)` | Tools scoped enable flag. |
| `tools_max_dimension_px` | `int(10) unsigned` | Tools max dimension (px). |
| `tools_max_total_upload_mb` | `int(10) unsigned` | Tools max total upload (MB). |
| `tools_max_files_per_request` | `int(10) unsigned` | Tools max files per request. |
| `quota_mode` | `enum('monthly_total_only','monthly_scoped_only','monthly_both')` | Quota accounting mode. |
| `monthly_h2i_limit` | `int(10) unsigned` | Monthly H2I scoped quota. |
| `monthly_image_limit` | `int(10) unsigned` | Monthly image scoped quota. |
| `monthly_pdf_limit` | `int(10) unsigned` | Monthly PDF scoped quota. |
| `monthly_tools_limit` | `int(10) unsigned` | Monthly tools scoped quota. |
| `burst_limit_per_min` | `int(10) unsigned` | Burst request limit. |
| `burst_window_seconds` | `int(10) unsigned` | Burst window size in seconds. |
| `burst_applies_to` | `varchar(16)` | Burst scope (`h2i`/`all` accepted by sync route). |
| `is_free` | `tinyint(1)` | Marks free tier plans. |
| `description` | `text` | Optional plan description. |
| `created_at` | `timestamp` | Row creation timestamp. |
| `updated_at` | `timestamp` | Row update timestamp. |

---

## Plan Template 1 (YAML)

```yaml
Plan1:
  id: <AUTO_INCREMENT_ID> # Internal PK; normally DB-generated
  plan_slug: <PLAN_SLUG> # Unique plan key used by APIs/sync
  name: <PLAN_NAME> # Display name
  billing_period: <BILLING_PERIOD_MONTHLY_OR_YEARLY>
  monthly_quota_files: <MONTHLY_TOTAL_FILE_QUOTA>
  max_files_per_request: <MAX_FILES_PER_REQUEST>
  max_total_upload_mb: <MAX_TOTAL_UPLOAD_MB>
  max_dimension_px: <MAX_DIMENSION_PX>
  timeout_seconds: <TIMEOUT_SECONDS>
  allow_h2i: <0_OR_1>
  allow_image: <0_OR_1>
  allow_pdf: <0_OR_1>
  allow_tools: <0_OR_1>
  max_upload_bytes_per_file: <MAX_UPLOAD_BYTES_PER_FILE>
  h2i_enabled: <0_OR_1>
  h2i_max_html_chars: <H2I_MAX_HTML_CHARS>
  h2i_max_render_width: <H2I_MAX_RENDER_WIDTH_PX>
  h2i_max_render_height: <H2I_MAX_RENDER_HEIGHT_PX>
  h2i_max_render_pixels: <H2I_MAX_RENDER_PIXELS>
  image_enabled: <0_OR_1>
  image_max_dimension_px: <IMAGE_MAX_DIMENSION_PX>
  image_max_total_upload_mb: <IMAGE_MAX_TOTAL_UPLOAD_MB>
  image_max_files_per_request: <IMAGE_MAX_FILES_PER_REQUEST>
  pdf_enabled: <0_OR_1>
  pdf_max_total_upload_mb: <PDF_MAX_TOTAL_UPLOAD_MB>
  pdf_max_files_per_request: <PDF_MAX_FILES_PER_REQUEST>
  pdf_max_pages_to_images: <PDF_MAX_PAGES_TO_IMAGES>
  pdf_max_pages_extract_images: <PDF_MAX_PAGES_EXTRACT_IMAGES>
  pdf_max_pages_split: <PDF_MAX_PAGES_SPLIT>
  tools_enabled: <0_OR_1>
  tools_max_dimension_px: <TOOLS_MAX_DIMENSION_PX>
  tools_max_total_upload_mb: <TOOLS_MAX_TOTAL_UPLOAD_MB>
  tools_max_files_per_request: <TOOLS_MAX_FILES_PER_REQUEST>
  quota_mode: <MONTHLY_TOTAL_ONLY_OR_MONTHLY_SCOPED_ONLY_OR_MONTHLY_BOTH>
  monthly_h2i_limit: <MONTHLY_H2I_LIMIT>
  monthly_image_limit: <MONTHLY_IMAGE_LIMIT>
  monthly_pdf_limit: <MONTHLY_PDF_LIMIT>
  monthly_tools_limit: <MONTHLY_TOOLS_LIMIT>
  burst_limit_per_min: <BURST_LIMIT_PER_MIN>
  burst_window_seconds: <BURST_WINDOW_SECONDS>
  burst_applies_to: <H2I_OR_ALL>
  is_free: <0_OR_1>
  description: <PLAN_DESCRIPTION>
  created_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
  updated_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
```

## Plan Template 2 (YAML)

```yaml
Plan2:
  id: <AUTO_INCREMENT_ID> # Internal PK; normally DB-generated
  plan_slug: <PLAN_SLUG> # Unique plan key used by APIs/sync
  name: <PLAN_NAME> # Display name
  billing_period: <BILLING_PERIOD_MONTHLY_OR_YEARLY>
  monthly_quota_files: <MONTHLY_TOTAL_FILE_QUOTA>
  max_files_per_request: <MAX_FILES_PER_REQUEST>
  max_total_upload_mb: <MAX_TOTAL_UPLOAD_MB>
  max_dimension_px: <MAX_DIMENSION_PX>
  timeout_seconds: <TIMEOUT_SECONDS>
  allow_h2i: <0_OR_1>
  allow_image: <0_OR_1>
  allow_pdf: <0_OR_1>
  allow_tools: <0_OR_1>
  max_upload_bytes_per_file: <MAX_UPLOAD_BYTES_PER_FILE>
  h2i_enabled: <0_OR_1>
  h2i_max_html_chars: <H2I_MAX_HTML_CHARS>
  h2i_max_render_width: <H2I_MAX_RENDER_WIDTH_PX>
  h2i_max_render_height: <H2I_MAX_RENDER_HEIGHT_PX>
  h2i_max_render_pixels: <H2I_MAX_RENDER_PIXELS>
  image_enabled: <0_OR_1>
  image_max_dimension_px: <IMAGE_MAX_DIMENSION_PX>
  image_max_total_upload_mb: <IMAGE_MAX_TOTAL_UPLOAD_MB>
  image_max_files_per_request: <IMAGE_MAX_FILES_PER_REQUEST>
  pdf_enabled: <0_OR_1>
  pdf_max_total_upload_mb: <PDF_MAX_TOTAL_UPLOAD_MB>
  pdf_max_files_per_request: <PDF_MAX_FILES_PER_REQUEST>
  pdf_max_pages_to_images: <PDF_MAX_PAGES_TO_IMAGES>
  pdf_max_pages_extract_images: <PDF_MAX_PAGES_EXTRACT_IMAGES>
  pdf_max_pages_split: <PDF_MAX_PAGES_SPLIT>
  tools_enabled: <0_OR_1>
  tools_max_dimension_px: <TOOLS_MAX_DIMENSION_PX>
  tools_max_total_upload_mb: <TOOLS_MAX_TOTAL_UPLOAD_MB>
  tools_max_files_per_request: <TOOLS_MAX_FILES_PER_REQUEST>
  quota_mode: <MONTHLY_TOTAL_ONLY_OR_MONTHLY_SCOPED_ONLY_OR_MONTHLY_BOTH>
  monthly_h2i_limit: <MONTHLY_H2I_LIMIT>
  monthly_image_limit: <MONTHLY_IMAGE_LIMIT>
  monthly_pdf_limit: <MONTHLY_PDF_LIMIT>
  monthly_tools_limit: <MONTHLY_TOOLS_LIMIT>
  burst_limit_per_min: <BURST_LIMIT_PER_MIN>
  burst_window_seconds: <BURST_WINDOW_SECONDS>
  burst_applies_to: <H2I_OR_ALL>
  is_free: <0_OR_1>
  description: <PLAN_DESCRIPTION>
  created_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
  updated_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
```
