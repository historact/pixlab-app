# /internal/user/key/toggle

- **Purpose**: Activate or disable an API key for a user.
- **Auth**: Bridge token required.
- **Method**: POST with identity and `status` flag.
- **Behavior**: Updates `api_keys.status` and respects validity windows.
