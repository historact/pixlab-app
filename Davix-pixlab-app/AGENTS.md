# PixLab SSOT Documentation Extraction Rules

## Goal
Produce a complete, code-evidenced documentation set (single source of truth) for PixLab:
- customers / external developers
- internal developer team
- code reviewers / auditors
- operators (deployment + env behavior)

## Non-negotiable rules
- Do NOT guess. If unclear, trace the code until confirmed.
- Every factual claim MUST include evidence: file path + function/symbol + brief quoted/paraphrased logic.
- For every behavior, label it as one of:
  (A) code-enforced, (B) env-configurable, (C) convention, (D) not confirmed.
- Prefer structured outputs: Markdown tables, checklists, and matrices.
- Produce documentation that is copy/paste usable (especially cURL).
- Inventory must be exhaustive: endpoints, actions, env, packages, features, limits, errors, modules.

## What to extract (must be exhaustive)

### 1) Complete endpoint inventory (external + internal)
- List EVERY HTTP route PixLab serves (not only /v1/*):
  - path, method, purpose
  - public/external vs internal/admin
  - auth required? (API key, bearer, session, none)
  - input type (json, multipart, urlencoded)
  - output type (json, file, signed url)
  - limits, gates, rate limiting if present
  - prod vs dev differences

### 2) API key usage & authentication guide
- All supported API key delivery methods (headers, query/body dev-only fallbacks, etc.)
- Examples for each method
- Production rules and rejection behaviors
- Signed output URL requirements and how to access outputs
- Request-Id behavior and how to use it for support

### 3) Full API contract per endpoint × action
For EVERY endpoint:
- list all supported actions (and any aliases)
- for EACH action:
  - required parameters
  - optional parameters + defaults
  - validation rules (types, ranges, enums, clamps)
  - accepted-but-ignored fields (explicitly call out)
  - output shape and examples
  - ALL possible error codes and HTTP statuses

### 4) cURL examples (must be complete)
For EVERY endpoint and for EVERY action:
- Provide a working cURL example
- Include ALL supported parameters for that action (even optional ones)
- Include auth header examples
- Include idempotency header example
- Use realistic placeholder URLs and file paths

### 5) Error architecture (full)
- Common error response envelope and variations per endpoint
- Central error utilities/middleware
- Complete list of error codes (validation, auth, limits, processing, dependencies)
- Where each error is thrown (file + function)
- Which endpoints can produce which errors
- How request_id is attached and propagated

### 6) ENV catalog (must be exhaustive)
- Every env var read by the app:
  - usage locations
  - defaults
  - parsing/validation
  - behavior controlled (endpoint availability, auth, signing, limits, gates, logging)
  - prod vs dev differences

### 7) Limits, quotas, and gates (must be exhaustive)
- Upload bytes (per file and total)
- Max files per request
- Pixel/page/width/height limits
- Timeouts and concurrency limits
- Plan/role based gates if present
- Per-endpoint differences and exact enforcement points

### 8) Architecture map (system + code)
- entrypoints, routing tree, middleware order
- modules for h2i/image/pdf/tools and any other services
- storage/output directories and URL building
- signing, static serving guards, security boundaries

### 9) Feature inventory (must be exhaustive)
- Produce a complete “features list” derived from code:
  - all capabilities exposed to users (endpoints/actions)
  - internal-only capabilities (admin, health, diagnostics, workers)
  - background jobs / schedulers if any
  - file formats supported (inputs/outputs)
  - third-party integrations (e.g., qpdf, puppeteer/chromium, sharp, storage providers)
- Each feature must link to evidence (file paths).

### 10) Dependency + package inventory (must be exhaustive)
- List dependencies and why they exist:
  - read package.json (and lockfile if needed)
  - group dependencies by purpose (api/server, image, pdf, auth, logging, storage, tooling)
  - identify native/system dependencies required at runtime (chromium, qpdf, fonts, etc.)
  - note optional dependencies and conditional use
- Include versions as pinned in repo.

### 11) Operational inventory (must be exhaustive)
- Deployment expectations:
  - required system packages
  - recommended resources (CPU/RAM/disk)
  - storage paths + cleanup/retention behavior
  - logging outputs and log levels
  - health checks/monitoring endpoints if any
  - security notes (CORS, headers, SSRF risks, file upload hardening)

## Output requirements
- Create/maintain docs under `/docs/`.
- Maintain an index at `/docs/README.md` linking to all sections.
- Add a “Known Unknowns” section for anything not confirmable from code.
- Whenever possible, include file path references inline.


# agents.md — PixLab Documentation Agents

## Prime directive
You are writing a **Source of Truth** spec for this repository. Do not guess. Do not omit.

## Evidence model
- (A) code-enforced: directly implemented
- (B) env-configurable: behavior changes via env
- (C) convention: implied patterns, not hard guaranteed
- (D) not confirmed: cannot be proven from this repo

## Rules
1. **Evidence-only**
   - Every claim must cite file path + function/symbol + (if possible) line range or snippet.
   - If not provable: label as (D) Known Unknown.

2. **Exhaustiveness over elegance**
   - Enumerations must be complete: env keys, actions, endpoints, tables, error codes.
   - Use checklists for anything enumerable.

3. **Inventory-first**
   - Create inventories (tables/lists) before writing explanations.

4. **No silent assumptions**
   - If a default is not explicitly set in code, say “none”.
   - If parsing rules are ambiguous, show the exact parser code behavior.

5. **Do not overwrite existing docs**
   - Create new files with the next available numeric prefix under /docs.

6. **Repo-wide scanning**
   - Scan routes/, utils/, admin/, scripts/, server.js, db.js, usage.js, migrations/.
   - Use ripgrep patterns for process.env.* and follow helper functions.

7. **Production vs dev clarity**
   - Always note behavior differences controlled by NODE_ENV/isProduction and validators.

## Output format expectations
- Use markdown.
- Provide a master table + detailed sections.
- Include a “Coverage” section listing files scanned and key search patterns.



