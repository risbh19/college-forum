# API and authentication security review

Scope: both `app/api` route handlers, `lib/auth.ts`, middleware/gateway controls and the FastAPI authorization/DTO boundary they depend on. Includes the requested reporting/admin endpoints. This is a source and automated regression review, not a deployed penetration test.

| Finding | Resolution | Regression coverage |
| --- | --- | --- |
| Medium: upstream backend error strings were forwarded verbatim, allowing SQL/service details into client responses. | Allowlist public messages; map unknown errors to generic status messages. Non-JSON upstream failures return generic 503. Retry headers accept only bounded decimal seconds on 429. FastAPI validation errors no longer reveal schema details. | `tests/backend-client.test.ts`, `tests/forum-proxy.test.ts`, backend safe-error tests |
| Medium: Origin enforcement existed only inside the forum handler, leaving future API mutations without the required middleware guard. | POST/DELETE/PATCH on all API paths require exact configured Origin before authentication/forwarding. Only exact `/api/auth` and its children are exempt for NextAuth's own CSRF/OAuth processing. Missing/malformed origin configuration fails closed. | `tests/middleware.test.ts`, `tests/gateway.test.ts`, proxy tests |
| Hardening gap: JSON allowance was 64 KiB; session expiry was eight hours; secure-cookie behavior depended on inferred HTTPS configuration. | Bound actual request bytes to 20 KiB before JSON parsing, including chunked/Unicode and deceptive lengths. Session/JWT both seven days. Secure cookies explicitly required in production; middleware uses matching cookie naming. | `tests/api.test.ts`, auth/middleware tests, backend request-bound tests |
| Hardening gap: security headers depended solely on middleware coverage. | Add fallback headers in `next.config.mjs`; middleware supplies a fresh script nonce for rendered pages. CSP permits the exact Google sign-in form destination, with self-only resource origins. Referrer and permissions headers are consistent. | `tests/headers.test.ts`, middleware header tests, production login check |

Ownership checks were already enforced in FastAPI: author deletion compares the signed viewer with the stored author, and account IDs from JSON are rejected. Explicit public Post/Comment/Vote DTOs already omitted account identifiers. No existing ownership bypass or public userId leak was reproduced. Tests retain these checks and extend them to reports/admin responses, including forged reporter IDs, no-username sessions and cross-account deletion.

Authentication retains exact verified RKGIT Google Workspace checks, state/PKCE/nonce, minimal rebuilt JWT/session objects, and disabled sensitive provider logging. Client session updates reload usernames from the backend; they cannot change identity or grant admin rights. Admin access is checked in FastAPI against backend-only configuration on every request, including when a member owns the target. Empty admin configuration grants no access.

Reports count distinct signed members under database constraints and parent row locks. The third report hides the target. Hidden posts cannot be read or interacted with through direct public paths; hidden comments are omitted from lists and counts. Admin-only queue DTOs contain content/reasons but no author/reporter IDs. Author deletion remains permitted for their own hidden post.

Upstash receives only namespaced HMAC identifiers. Raw IPs and tokens are neither logged nor passed as Redis identifiers. Redis errors fail closed, telemetry/analytics are disabled, and the offline exception remains confined to the existing explicit loopback development demo.

Remaining operational verification: real Google OAuth, Vercel/Render headers and proxy trust, live Redis windows/outages, PostgreSQL RLS and concurrent reporting under the deployed configuration. Coordinated reports from three valid accounts can hide legitimate content; moderators must review reports. No unhide/appeal workflow is included.

## Changed files

Exact paths for the combined security and reporting requests:

- `.env.example`
- `README.md`
- `app/(main)/admin/page.tsx`
- `app/(main)/layout.tsx`
- `app/(main)/post/[id]/page.tsx`
- `app/api/[...path]/route.ts`
- `app/privacy/page.tsx`
- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/moderation.py`
- `backend/app/schemas.py`
- `backend/app/security.py`
- `backend/migrations/versions/0002_reports.py`
- `backend/tests/test_api.py`
- `backend/tests/test_migration.py`
- `backend/tests/test_moderation.py`
- `components/comments/CommentList.tsx`
- `components/posts/PostCard.tsx`
- `components/ui/ModerationButtons.tsx`
- `components/ui/Navbar.tsx`
- `components/ui/ReportButton.tsx`
- `deploy/backend.env.example`
- `deploy/frontend.env.example`
- `docs/DEPLOYMENT.md`
- `docs/FASTAPI_MIGRATION.md`
- `docs/SECURITY_REVIEW.md`
- `docs/SPEC.md`
- `docs/VERIFICATION.md`
- `lib/api.ts`
- `lib/auth.ts`
- `lib/backend-client.ts`
- `lib/forum-proxy.ts`
- `lib/gateway-security.ts`
- `lib/rate-limit.ts`
- `lib/validators.ts`
- `middleware.ts`
- `next.config.mjs`
- `package-lock.json`
- `package.json`
- `render.yaml`
- `scripts/check-production.mjs`
- `tests/api.test.ts`
- `tests/auth.test.ts`
- `tests/backend-client.test.ts`
- `tests/deployment.test.ts`
- `tests/forum-proxy.test.ts`
- `tests/headers.test.ts`
- `tests/middleware.test.ts`
- `tests/rate-limit.test.ts`
- `tests/validators.test.ts`
- `types/index.ts`
