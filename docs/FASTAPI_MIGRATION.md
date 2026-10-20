# FastAPI migration

The user requested a FastAPI backend and stronger security after the initial Next.js implementation. This supersedes the original backend/version choices; the product requirements remain in SPEC.md.

## Boundaries

- Next.js handles Google OAuth via NextAuth 4, encrypted eight-hour browser sessions, the email HMAC, server-rendered pages, and a same-origin gateway.
- FastAPI owns all business endpoints and PostgreSQL access via SQLAlchemy. It independently validates signed assertions, membership, input, ownership, and response schemas.
- Browser mutations go through `/api/[...path]`. The gateway rejects missing/cross-site origins, caps body size/read time, and signs a 20-second assertion. No service token or database credential is shipped to the client.
- `/internal/session` accepts only identity-scoped assertions and returns `{username}`. It never receives a Google profile.
- Public post/comment DTOs preserve the original frontend shape. Existing IDs, HMAC identities, aliases, timestamps, vote enum, FK cascades, and data remain compatible.

## Persistence and migration

`0001_fastapi_baseline` uses schema adoption for the original four forum tables and creates `RateBucket` and `UsedAssertion`. It enables PostgreSQL RLS on all six tables. The migration is idempotent through Alembic's revision state and `create_all(checkfirst=True)`. It does not copy or drop original records. The baseline cannot be downgraded destructively; restore a reviewed backup if rollback is necessary.

Alembic revisions must be treated as historical schema definitions after release. Future schema changes need new explicit migrations, not edits to this revision or reliance on the current model metadata.

The launcher preserves `.local/runtime.json` keys and adds an independent service signing secret. It runs Alembic before starting FastAPI, skips sample seeding after the first launch, and removes database URLs from the frontend child environment. The retained Prisma schema and old RLS SQL are compatibility references only.

## Concurrency and abuse checks

Vote and comment writes lock the parent PostgreSQL post row. This serializes vote toggle/switch operations including the first vote, and coordinates with author deletion. Function-scoped database dependencies finish commits before success responses are sent. Username uniqueness is enforced by the database with a lowercase unique key. Security counters use atomic upserts in separate committed transactions, so failed validation attempts count too. Mutation nonce records prevent reusing a signed assertion. Tests use SQLite for deterministic API/security cases and the local HTTP runner exercises real PostgreSQL including concurrent votes.

Rate keys contain HMACs of account/operation; replay keys contain HMACs of random assertion IDs. No IP addresses or raw tokens are persisted. Expired replay entries are purged during writes. Edge rate limiting remains necessary to protect unsigned traffic and distributed floods before application code runs.

## Framework security update

The dependency audit reported known advisories in the original Next.js 14 stack. The frontend was migrated to Next.js 15.5.28 and React 19, including asynchronous route/page params. PostCSS is pinned/overridden to 8.5.31 to remove a vulnerable nested dependency. The original Next 14 pin was superseded by the user's stronger-security request. NextAuth remains v4.

## Deployment limits

No Google, Supabase, container hosting, or Vercel resources were created or deployed by this migration. Real OAuth, hosted RLS, ingress/TLS/proxy settings, certificate verification, operational monitoring, and backup restoration still need environment-specific checks. Neither dependency audits nor local tests are a penetration test or a guarantee of security. See the README and verification checklist for setup.
