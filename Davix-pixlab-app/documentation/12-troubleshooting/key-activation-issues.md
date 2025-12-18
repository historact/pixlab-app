# Key Activation Issues

- Ensure key status is `active`; internal toggle/disable endpoints can change status.
- Check `valid_from`/`valid_until` values; keys outside window return `invalid_api_key` or `key_expired`.
- Hash mismatch triggers lookup failure; rotate or re-provision via internal endpoints.
