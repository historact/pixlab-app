# Storage

- Generated assets saved under `public/` subfolders: `h2i/`, `img-edit/`, `pdf/`, `tools/`.
- Folders are created on startup and served via Express static middleware.
- URLs are `BASE_URL/<folder>/<filename>`.
- Daily cleanup removes files older than 24h; additional orphan/retention cleaners run when enabled.
