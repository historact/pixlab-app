# Admin Key Endpoints

- `/internal/admin/keys` (GET): list API keys with filters; requires bridge token.
- `/internal/admin/keys/export` (GET): export keys as CSV.
- `/internal/admin/key/provision` (POST): generate and store a new key for a customer or order; uses `generateApiKey` and `activateOrProvisionKey`.
- `/internal/admin/key/disable` (POST): disable an existing key.
- `/internal/admin/key/rotate` (POST): rotate an existing key, returning new plaintext and updating hashes.
- `/internal/user/key/rotate` (POST): customer-initiated rotation by identifiers.
- `/internal/user/key/toggle` (POST): toggle activation status.

All endpoints require `X-Davix-Bridge-Token` and operate on `api_keys` records.
