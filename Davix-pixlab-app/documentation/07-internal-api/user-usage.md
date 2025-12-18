# /internal/user/usage

- **Purpose**: Returns usage counters for a user/key combination for the current period.
- **Auth**: Bridge token required.
- **Method**: POST with identifiers to resolve key; reads `usage_monthly`.
- **Response**: Usage totals including remaining quota if applicable.
