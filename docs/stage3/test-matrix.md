# Stage 3 Test Matrix

## Backend

- Stage 2 regression suite: create/idempotency, filters, sorting, pagination, natural-language search, upstream failures.
- Stage 3 suite: API version header, bearer auth, analyst/admin RBAC, pagination links, CSV export, refresh rotation, rate limit.
- NLS hardening suite: inclusive age ranges, exclusive age caps, repeated countries,
  grouped OR demographic clauses, probability/confidence thresholds, natural sort
  phrases, and all flat fields combined in one search.

## CLI

- PKCE challenge format.
- Credential path and cleanup at `~/.insighta/credentials.json` equivalent.
- Flag-to-query mapping for profile commands.

## Web

- CSRF token creation, verification, tamper rejection, and expiry rejection.
- Manual smoke after deploy: login, dashboard, profiles, detail, search, account, logout.

## Live Smoke

1. GitHub OAuth web login.
2. `insighta login --api-url <live-backend>`.
3. `insighta whoami`.
4. `insighta profiles list --limit 5`.
5. `insighta profiles search "young males from nigeria"`.
6. `insighta profiles search "40+ men from angola that are not up to 67 years old and women from ghana that are younger than 36 years"`.
7. Admin-only `insighta profiles create --name "Harriet Tubman"`.
8. `insighta profiles export --format csv`.
