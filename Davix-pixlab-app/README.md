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

## Runtime requirements

- Node.js 22.x (see `package.json` engines).

## Dependency install / build

- Install requires access to the public npm registry or your configured proxy registry.
- If you use a proxy registry, set it via npm config (for example, `npm config set registry https://your-registry.example.com`).
- In CI, prefer `npm ci` with the lockfile and validate with `npm ls --depth=0`.
