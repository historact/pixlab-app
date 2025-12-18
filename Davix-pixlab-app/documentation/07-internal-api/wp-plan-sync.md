# /internal/wp-sync/plan

- **Purpose**: Synchronize WordPress plan metadata into the local `plans` table.
- **Auth**: `X-Davix-Bridge-Token` required.
- **Method**: POST.
- **Payload**: plan attributes such as `plan_slug`, `name`, `monthly_quota_files`, billing details.
- **Behavior**: Upserts plan rows and caches free plan metadata for key resolution.
