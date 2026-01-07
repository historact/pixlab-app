# Davix Pixlab (Node.js)

Pixlab is a public/customer API for HTML-to-image and image/PDF tooling.

## Documentation

- Environment variables: [`docs/env.md`](docs/env.md)
- API documentation: [`documentation/`](documentation/)

## Production hardening

For production deployments, review the following toggles in `docs/env.md`:

- Sandbox settings for Puppeteer (`PUPPETEER_NO_SANDBOX`)
- DNS rebinding mitigation for H2I (`H2I_DNS_REBINDING_MODE`)
- DB failure handling for daily limits (`RATE_LIMIT_DB_FAILURE_MODE`)
- Customer burst limiter scope (`CUSTOMER_BURST_APPLIES_TO`)
- Automatic migrations (`AUTO_RUN_MIGRATIONS`)
