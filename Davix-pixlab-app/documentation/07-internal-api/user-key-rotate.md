# /internal/user/key/rotate

- **Purpose**: Rotate a customer's API key by identity.
- **Auth**: Bridge token required.
- **Method**: POST with identifiers and optional validity window.
- **Behavior**: Generates a new plaintext key, updates DB hashes, returns new key and metadata.
