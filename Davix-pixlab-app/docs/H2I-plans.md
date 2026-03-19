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

## Free Plan : (YAML)

```yaml
Plan1:
  id: 1 # Internal PK; normally DB-generated
  plan_slug: free # Unique plan key used by APIs/sync
  name: Free # Display name
  billing_period: monthly
  monthly_quota_files: 150
  max_files_per_request: 1
  max_total_upload_mb: 5
  max_dimension_px: 2000
  timeout_seconds: 20
  allow_h2i: 1
  allow_image: 1
  allow_pdf: 1
  allow_tools: 1
  max_upload_bytes_per_file: 5242880
  h2i_enabled: 1
  h2i_max_html_chars: 20000
  h2i_max_render_width: 2000
  h2i_max_render_height: 2000
  h2i_max_render_pixels: 4000000
  image_enabled: 1
  image_max_dimension_px: 2000
  image_max_total_upload_mb: 5
  image_max_files_per_request: 1
  pdf_enabled: 1
  pdf_max_total_upload_mb: 5
  pdf_max_files_per_request: 1
  pdf_max_pages_to_images: 5
  pdf_max_pages_extract_images: 5
  pdf_max_pages_split: 5
  tools_enabled: 1
  tools_max_dimension_px: 2000
  tools_max_total_upload_mb: 5
  tools_max_files_per_request: 1
  quota_mode: monthly_total_only
  monthly_h2i_limit: NULL
  monthly_image_limit: NULL
  monthly_pdf_limit: NULL
  monthly_tools_limit: NULL
  burst_limit_per_min: 5
  burst_window_seconds: 60
  burst_applies_to: all
  is_free: 1
  description: Free plan for developers who want to explore PixLab. Includes access to H2I rendering, image processing, PDF tools, and utilities with limited usage suitable for testing and small personal projects.
  created_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
  updated_at: <YYYY-MM-DD HH:MM:SS> # Usually DB-managed
```

## Pro Plan : (YAML)

```yaml
Plan2:
  id: 2
  plan_slug: pro
  name: Pro
  billing_period: monthly
  monthly_quota_files: 1000
  max_files_per_request: 3
  max_total_upload_mb: 15
  max_dimension_px: 4000
  timeout_seconds: 45
  allow_h2i: 1
  allow_image: 1
  allow_pdf: 1
  allow_tools: 1
  max_upload_bytes_per_file: 15728640
  h2i_enabled: 1
  h2i_max_html_chars: 50000
  h2i_max_render_width: 4000
  h2i_max_render_height: 4000
  h2i_max_render_pixels: 16000000
  image_enabled: 1
  image_max_dimension_px: 4000
  image_max_total_upload_mb: 15
  image_max_files_per_request: 3
  pdf_enabled: 1
  pdf_max_total_upload_mb: 15
  pdf_max_files_per_request: 3
  pdf_max_pages_to_images: 20
  pdf_max_pages_extract_images: 20
  pdf_max_pages_split: 20
  tools_enabled: 1
  tools_max_dimension_px: 4000
  tools_max_total_upload_mb: 15
  tools_max_files_per_request: 3
  quota_mode: monthly_total_only
  monthly_h2i_limit: null
  monthly_image_limit: null
  monthly_pdf_limit: null
  monthly_tools_limit: null
  burst_limit_per_min: 20
  burst_window_seconds: 60
  burst_applies_to: all
  is_free: 0
  description: Pro plan for developers and small production applications. Provides higher request limits and increased processing capacity across all PixLab endpoints.
  created_at: 2026-03-19 00:00:00
  updated_at: 2026-03-19 00:00:00
```

## Business Plan : (YAML)

```yaml
Plan3:
  id: 3
  plan_slug: business
  name: Business
  billing_period: monthly
  monthly_quota_files: 5000
  max_files_per_request: 5
  max_total_upload_mb: 30
  max_dimension_px: 6000
  timeout_seconds: 60
  allow_h2i: 1
  allow_image: 1
  allow_pdf: 1
  allow_tools: 1
  max_upload_bytes_per_file: 31457280
  h2i_enabled: 1
  h2i_max_html_chars: 100000
  h2i_max_render_width: 6000
  h2i_max_render_height: 6000
  h2i_max_render_pixels: 36000000
  image_enabled: 1
  image_max_dimension_px: 6000
  image_max_total_upload_mb: 30
  image_max_files_per_request: 5
  pdf_enabled: 1
  pdf_max_total_upload_mb: 30
  pdf_max_files_per_request: 5
  pdf_max_pages_to_images: 50
  pdf_max_pages_extract_images: 50
  pdf_max_pages_split: 50
  tools_enabled: 1
  tools_max_dimension_px: 6000
  tools_max_total_upload_mb: 30
  tools_max_files_per_request: 5
  quota_mode: monthly_total_only
  monthly_h2i_limit: null
  monthly_image_limit: null
  monthly_pdf_limit: null
  monthly_tools_limit: null
  burst_limit_per_min: 30
  burst_window_seconds: 60
  burst_applies_to: all
  is_free: 0
  description: Business plan designed for production systems, SaaS platforms, and agencies that require higher processing capacity and larger request limits.
  created_at: 2026-03-19 00:00:00
  updated_at: 2026-03-19 00:00:00
```
