# Stage 3 Deployment Checklist

## Backend - Railway

- Provision PostgreSQL.
- Set all variables from `.env.example`.
- Set `BACKEND_PUBLIC_URL` to the Railway HTTPS URL.
- Set `WEB_APP_URL` to the Vercel HTTPS URL.
- Configure GitHub OAuth callback: `<BACKEND_PUBLIC_URL>/auth/github/callback`.
- Run `npm start`; startup applies migrations and seed.

## CLI

- In the split CLI repo, publish or install globally with `npm install -g .`.
- Configure GitHub OAuth app for loopback callback support.
- Use `insighta login --api-url <BACKEND_PUBLIC_URL>`.

## Web - Vercel

- Set variables from `web/.env.example`.
- Set `BACKEND_API_URL` to the Railway backend URL.
- Set `NEXT_PUBLIC_WEB_APP_URL` to the Vercel URL.
- Set `SESSION_COOKIE_SECURE=true`.

## Final Verification

- Run backend tests, CLI tests, web tests/build.
- Smoke both deployed URLs from a clean browser.
- Submit backend repo, CLI repo, web repo, live backend URL, and live web URL.
