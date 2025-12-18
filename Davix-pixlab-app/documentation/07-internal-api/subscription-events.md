# /internal/subscription/event

- **Purpose**: Apply subscription lifecycle events to customer API keys.
- **Auth**: `X-Davix-Bridge-Token` matching `SUBSCRIPTION_BRIDGE_TOKEN`.
- **Method**: POST.
- **Payload**: includes identifiers (`subscription_id`, `customer_email`, `order_id`), `event` type, plan info, and validity windows used by `routes/subscription-route.js` to call `applySubscriptionStateChange`.
- **Notes**: Idempotent updates by matching existing key rows; logs in DB.
