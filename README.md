# Insighta Labs+ Stage 3

Secure access and multi-interface integration for the HNG14 Backend Wizards
Stage 3 task. This repository is the backend source of truth and also contains
repo-ready `cli/` and `web/` packages for the required three-repository split.

## System Architecture

- Backend: Node.js 20, Express 4, PostgreSQL, raw SQL migrations, UUID v7.
- CLI: Node.js global binary named `insighta`, storing credentials at
  `~/.insighta/credentials.json`.
- Web portal: Next.js app with server-side backend calls and HTTP-only session
  cookies.
- One backend API serves both interfaces. Profile data, users, roles, refresh
  tokens, and one-time web auth codes live in PostgreSQL.

## Auth Flow

- CLI login generates `state`, `code_verifier`, and `S256 code_challenge`,
  starts a local `127.0.0.1` callback server, opens GitHub via
  `/auth/github?client=cli`, then exchanges `code + code_verifier` with
  `POST /auth/github/cli`.
- Web login starts at `/auth/github?client=web`; the backend stores signed OAuth
  state in an HTTP-only cookie, handles `/auth/github/callback`, creates a
  one-time web auth code, and redirects to the web portal callback.
- The web portal exchanges the one-time code through `POST /auth/web/session`
  and stores app tokens in HTTP-only cookies.
- GitHub access tokens are only used to fetch identity. Insighta issues its own
  app access and refresh tokens.

## Token Handling

- Access token: signed app JWT, 3-minute expiry.
- Refresh token: 5-minute opaque random token; only SHA-256 hashes are stored.
- Refresh rotation: `POST /auth/refresh` invalidates the old refresh token
  immediately and issues a new access/refresh pair.
- Logout: `POST /auth/logout` revokes the refresh token server-side.
- CLI auto-refreshes once on `401`; web stores tokens away from JavaScript.

## Role Enforcement

- Users default to `analyst`.
- Admin bootstrap is controlled by `ADMIN_GITHUB_USERNAMES` and
  `ADMIN_GITHUB_IDS`.
- Central middleware authenticates `/api/*`, blocks inactive users, and attaches
  `req.user`.
- Admins can create, delete, read, search, and export profiles.
- Analysts can read, search, and export only. Create/delete returns `403`.

## API Updates

All `/api/*` requests require:

```http
Authorization: Bearer <access_token>
X-API-Version: 1
```

Missing version returns:

```json
{ "status": "error", "message": "API version header required" }
```

Paginated list and search responses include:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "total_pages": 203,
  "links": {
    "self": "/api/profiles?page=1&limit=10",
    "next": "/api/profiles?page=2&limit=10",
    "prev": null
  },
  "data": []
}
```

CSV export:

```http
GET /api/profiles/export?format=csv
```

It applies the same filters and sorting as `GET /api/profiles` and returns the
required CSV column order.

## Natural Language Parsing

The Stage 2 rule-based parser remains intact. It maps phrases such as:

- `young males from nigeria` -> `gender=male`, `min_age=16`, `max_age=24`,
  `country_id=NG`
- `females above 30` -> `gender=female`, `min_age=30`
- `adult males from kenya` -> `gender=male`, `age_group=adult`,
  `country_id=KE`

No AI or LLM is used. Uninterpretable text returns:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

## CLI Usage

```bash
cd cli
npm install -g .
insighta login --api-url https://<backend-host>
insighta whoami
insighta profiles list --gender male --country NG --page 2 --limit 20
insighta profiles get <id>
insighta profiles search "young males from nigeria"
insighta profiles create --name "Harriet Tubman"
insighta profiles export --format csv --gender male --country NG
insighta logout
```

## Web Portal

Required pages are implemented in `web/`:

- Login
- Dashboard
- Profiles list
- Profile detail
- Search
- Account

The portal calls the same backend API and uses HTTP-only cookies plus CSRF
checks on mutating BFF routes.

## Local Setup

```bash
cp .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

Backend environment:

- `DATABASE_URL`
- `BACKEND_PUBLIC_URL`
- `WEB_APP_URL`
- `JWT_SECRET`
- `GITHUB_WEB_CLIENT_ID`, `GITHUB_WEB_CLIENT_SECRET`
- `GITHUB_CLI_CLIENT_ID`, `GITHUB_CLI_CLIENT_SECRET`
- `ADMIN_GITHUB_USERNAMES` or `ADMIN_GITHUB_IDS`

## Tests

```bash
npm run lint
npm test

cd cli
npm run lint
npm test
npm pack --dry-run

cd ../web
npm run lint
npm test
npm run build
```

Backend tests cover Stage 2 regressions plus Stage 3 auth, RBAC, versioning,
pagination links, CSV export, refresh rotation, and rate limiting.

## Deployment

- Backend: Railway with PostgreSQL, using `npm start`.
- Web: Vercel, using `web/` as the project root.
- CLI: install globally from the split CLI repository.

Submission requires the backend repo URL, CLI repo URL, web repo URL, live
backend URL, and live web portal URL.
