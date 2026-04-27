# Stage 3 Grading Audit

This audit is written against `stage3_task_details.md` and `STAGE 3 TASK - TRD.md`.
It includes the likely automated and manual checks needed for a 100/100 outcome.

## Likely Grader Logic

### Authentication & PKCE Flow - 20 pts

- `GET /auth/github` redirects to GitHub with `client_id`, `redirect_uri`, `state`,
  `code_challenge`, `code_challenge_method=S256`, and user scope.
- CLI flow accepts loopback redirect URIs such as `http://127.0.0.1:<port>/callback`.
- CLI validates returned `state` before exchanging the code.
- `POST /auth/github/cli` rejects missing `code`, short/missing `code_verifier`,
  and non-loopback `redirect_uri`.
- Backend exchanges GitHub `code + code_verifier`, fetches GitHub identity, upserts
  the user, and returns app access/refresh tokens.
- Web flow stores signed OAuth state in an HTTP-only cookie, validates callback
  state, upserts the user, and establishes a web session through a one-time auth code.
- `POST /auth/refresh` returns exactly `status`, `access_token`, `refresh_token`.
- Refresh token reuse fails because the old token is revoked immediately.
- `POST /auth/logout` revokes the refresh token.
- Access tokens expire after 3 minutes; refresh tokens expire after 5 minutes.

### Role Enforcement - 10 pts

- User rows include `role` and `is_active`.
- Default role is `analyst`.
- Admin bootstrap uses `ADMIN_GITHUB_USERNAMES` and `ADMIN_GITHUB_IDS`.
- Inactive users receive `403`.
- All `/api/*` routes require bearer auth.
- Admin can create, delete, read, search, and export.
- Analyst can read, search, and export.
- Analyst create/delete returns `403`.
- Enforcement is centralized in auth/RBAC middleware, not scattered inline checks.

### CLI - 20 pts

- Package exposes global `insighta` binary.
- `insighta login` creates `state`, `code_verifier`, `code_challenge`, temporary
  callback server, and opens browser.
- Credentials are stored at `~/.insighta/credentials.json`.
- Requests include `Authorization: Bearer` and `X-API-Version: 1`.
- Auto-refresh runs once after `401`; failed refresh prompts re-login via clear errors.
- Required commands exist:
  - `login`, `logout`, `whoami`
  - `profiles list/get/search/create/export`
- List/search output is a structured table with loading feedback.
- Export writes the CSV file into the current working directory.

### Web Portal - 15 pts

- Required pages exist: Login, Dashboard, Profiles, Profile Detail, Search, Account.
- Login uses GitHub OAuth.
- Access/refresh/user cookies are HTTP-only.
- Tokens are not exposed to browser JavaScript.
- Server-side requests use the same backend API and include `X-API-Version: 1`.
- Middleware refreshes expired access tokens using the refresh token and redirects
  back to the requested page.
- Mutating BFF route includes CSRF double-submit validation.
- Profiles and search pages expose visible pagination controls.

### API Updates - 10 pts

- Missing `X-API-Version` returns `400` with:
  `{ "status": "error", "message": "API version header required" }`.
- Unsupported versions return `400`.
- `GET /api/profiles` and `GET /api/profiles/search` include `page`, `limit`,
  `total`, `total_pages`, `links.self`, `links.next`, `links.prev`, and `data`.
- Pagination preserves Stage 2 max-cap behavior: `limit > 50` clamps to `50`.
- `GET /api/profiles/export?format=csv` returns `text/csv`.
- CSV response includes `Content-Disposition: attachment; filename="profiles_<timestamp>.csv"`.
- CSV columns are exactly:
  `id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at`.
- Export applies list filters and sorting.

### Rate Limiting & Logging - 5 pts

- `/auth/*`: 10 requests per minute per IP.
- `/api/*`: 60 requests per minute per authenticated user.
- Excess requests return `429` with standardized error shape.
- Every request logs method, endpoint, status code, and response time.

### CI/CD - 5 pts

- GitHub Actions runs on PR/push to `main`.
- Backend job runs install, lint, and tests.
- CLI job runs lint, tests, and package dry-run.
- Web job runs install, lint, tests, and build.

### Engineering Standards - 5 pts

- Three repo-ready surfaces exist: backend root, `cli/`, and `web/`.
- Conventional commit scopes are documented.
- Env templates are present and secrets are not committed.
- Governance docs cover scorecard, tests, deployment, decisions, evidence, and submission.

### README - 10 pts

- README covers system architecture.
- README covers auth flow.
- README covers CLI usage.
- README covers token handling.
- README covers role enforcement.
- README covers natural-language parsing.
- README covers local setup, tests, env, and deployment.

## Natural-Language Edge Cases Covered

- `young males from nigeria` -> gender, age range, country.
- `females above 30` -> gender and minimum age.
- `male and female teenagers above 17` -> age group and minimum age, with
  gender intentionally omitted because both genders are present.
- `women from tanzania between the ages of 50 and 54 inclusive` -> female,
  Tanzania, `min_age=50`, `max_age=54`.
- `people aged 18 to 21 from kenya` -> Kenya, `min_age=18`, `max_age=21`.
- `40+ men from angola that are not up to 67 years old and women from ghana
  that are younger than 36 years` -> OR clauses:
  male Angola `min_age=40`, `max_age=66`; female Ghana `max_age=35`.
- `men from angola and ghana with gender probability at least 90 percent and
  country confidence at least 80 percent` -> male, `country_ids=[AO,GH]`,
  `min_gender_probability=0.9`, `min_country_probability=0.8`.
- `adult women from kenya at least 30 years old not older than 45 with gender
  confidence is at least 80 percent and country probability 70 percent or
  above highest gender confidence` -> every flat field together:
  `gender`, `age_group`, `country_id`, `min_age`, `max_age`,
  `min_gender_probability`, `min_country_probability`, `sort_by`, and `order`.
- `men from angola and ghana and women from kenya and nigeria` -> OR clauses
  where each clause has a repeated-country filter.
- `children under 13 from ghana` and `seniors 60 or older from ghana` cover
  exclusive and inclusive age-bound synonyms.

## Current Verification

- Backend: `npm run lint` passed.
- Backend: `npm test` passed `49/49`.
- CLI: `npm run lint` passed.
- CLI: `npm test` passed `3/3`.
- CLI: `npm pack --dry-run` passed.
- Web: `npm run lint` passed.
- Web: `npm test` passed `2/2`.
- Web: `npm run build` passed.
- Web: `npm audit --omit=dev` returned `0 vulnerabilities`.

## Deployment-Only Gates

These cannot be guaranteed by code until the live environment is configured:

- GitHub OAuth app for web must use callback:
  `<BACKEND_PUBLIC_URL>/auth/github/callback`.
- GitHub OAuth app for CLI must use loopback callback:
  `http://127.0.0.1/callback`.
  GitHub allows loopback redirect URIs to vary by port when the callback URL is
  registered as a loopback URL.
- Railway must set all backend env vars from `.env.example`.
- Vercel must set all web env vars from `web/.env.example`.
- `ADMIN_GITHUB_USERNAMES` or `ADMIN_GITHUB_IDS` must include the demo admin.
- Backend must be seeded with all 2,026 profiles.
- Final smoke must verify real GitHub login, CLI login, web login, read/search,
  admin create, analyst denial, export, refresh after access expiry, and logout.

## Current Risk Position

There are no known code-level gaps against the TRD after this audit. A literal
100/100 still depends on correct live OAuth, Railway, Vercel, repo split, and
submission URLs.
