# /internal/user/summary

- **Purpose**: Returns user summary and current key info for a WordPress user or subscription identity.
- **Auth**: `X-Davix-Bridge-Token` required.
- **Method**: POST with identifiers (`wp_user_id`, `subscription_id`, `customer_email`, `order_id`).
- **Response**: Includes key status, plan info, and derived usage period via `getUsagePeriodForKey`.
