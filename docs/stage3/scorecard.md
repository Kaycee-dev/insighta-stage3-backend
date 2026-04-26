# Stage 3 Scorecard

| Rubric item | Points | Execution proof |
| --- | ---: | --- |
| Authentication & PKCE flow | 20 | Backend OAuth routes, CLI loopback PKCE, web OAuth callback, refresh rotation tests |
| Role enforcement | 10 | Central middleware, admin-only create/delete, analyst read-only tests |
| CLI | 20 | `cli/` package, global `insighta` bin, token storage, refresh-on-401, table/export commands |
| Web portal | 15 | `web/` Next.js app, required pages, HTTP-only cookies, CSRF utilities |
| API updates | 10 | `X-API-Version`, pagination links, CSV export |
| Rate limiting & logging | 5 | Request logger and fixed-window auth/API limits |
| CI/CD setup | 5 | `.github/workflows/stage3-ci.yml` |
| Engineering standards | 5 | Conventional commit plan, split repo-ready packages, tests |
| README completeness | 10 | Architecture, auth, CLI, token, RBAC, NL parsing sections |

Target: 100/100. No item is intentionally deferred.
