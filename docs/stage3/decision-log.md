# Stage 3 Decision Log

- Use Railway for backend/Postgres and Vercel for web to match prior delivery velocity.
- Use three repo-ready packages: backend root, `cli/`, and `web/`.
- Use env allowlists for admin bootstrap via `ADMIN_GITHUB_USERNAMES` and `ADMIN_GITHUB_IDS`.
- Use internal app JWT access tokens and opaque hashed refresh tokens; GitHub tokens are never stored.
- Keep Stage 2 tests in legacy mode while adding Stage 3 tests for authenticated/versioned behavior.
