# Error Format

Errors use a uniform JSON envelope:
```json
{
  "status": "error",
  "code": "invalid_api_key",
  "message": "Your API key is missing or invalid.",
  "error": {
    "code": "invalid_api_key",
    "message": "Your API key is missing or invalid.",
    "hint": "Provide a valid API key in the X-Api-Key header or as ?key= in the query.",
    "details": {}
  }
}
```

Common codes include `invalid_api_key`, `key_expired`, `missing_field`, `monthly_quota_exceeded`, `rate_limit_exceeded`, `payload_too_large`, `too_many_files`, `html_render_failed`, `image_processing_failed`, `pdf_tool_failed`, `tool_processing_failed`, and `timeout`.
