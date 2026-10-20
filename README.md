# College Forum

A campus discussion app for **RKGIT**, with a **FastAPI backend**, Next.js frontend, college-only Google Workspace sign-in, permanent aliases, five boards, comments, and toggleable votes. The complete local app runs without external accounts.

**Deploy for real users:** follow [Vercel + Render + Supabase setup](docs/DEPLOYMENT.md). Sign-in accepts only verified college-managed **@rkgit.edu.in** accounts; personal Gmail and other domains are rejected.

## Run locally

Install **Node.js 20.9+ with npm** and **Python 3.11+** (3.12 recommended).

```sh
git clone https://github.com/risbh19/college-forum.git
cd college-forum
npm ci
npm run local
```

Open the printed URL, normally `http://localhost:3000`. On Windows, you can also use [Start Local.cmd](Start%20Local.cmd) after `npm ci`. The first run creates an isolated Python environment and installs locked backend dependencies; internet is needed for dependency installation. No Google, Supabase, Docker, or `.env` is needed for the demo.

The launcher starts **PostgreSQL + FastAPI + Next.js**, all on loopback. Local API documentation is normally `http://127.0.0.1:8000/docs`. Business endpoints require signed service requests; opening a business API URL directly returns 401. The frontend handles these requests automatically.

Choose **shadowcoder**, **campusowl**, or **Try username setup** on the login page. Log out to switch accounts. Demo accounts are shared and are not private. Posts, votes, comments, aliases, and local session keys persist in ignored `.local/`. Keep that folder and its private settings backed up. Do not commit it. OneDrive or other backup software may copy it. Press Ctrl+C to stop all three services and rerun to resume. Busy ports use the alternatives printed by the launcher.

Existing local data from the original Next.js/Prisma app is adopted in place by Alembic. The identity pepper, database password, sessions, table names, and records are preserved; migration adds security tables. Sample posts are seeded only on the first launch.

## Architecture

```text
Browser -> Next.js pages / same-origin API gateway -> FastAPI -> PostgreSQL
                |
          NextAuth Google OAuth
```

| Layer | Implementation |
| --- | --- |
| Frontend | Next.js 15 App Router, React 19, strict TypeScript, Tailwind 3 |
| Authentication | NextAuth 4, verified college Workspace account, PKCE/state/nonce, encrypted HttpOnly JWT session |
| Business backend | Python FastAPI, strict Pydantic schemas, SQLAlchemy 2 |
| Database | PostgreSQL, Alembic migrations; Supabase supported |
| Local runtime | Portable PostgreSQL, Python virtual environment, synthetic demo accounts |

FastAPI owns usernames, feeds, posts, comments, votes, ownership, validation, rate limits, and database queries. Next.js handles pages and Google sessions, then forwards authenticated requests. It has no database client. The retained `prisma/` schema is a historical compatibility reference, not the runtime data layer.

## Security controls

- Every business API call requires an HS256 service assertion valid for 20 seconds, bound to the anonymous account, HTTP method, path, and exact body hash. Issuer, audience, algorithm, scope, and claim allowlist are checked. Mutation assertions are single-use with database replay protection.
- Mutations through the frontend require the configured same-origin `Origin`; cross-site requests are rejected. Browser session cookies remain HttpOnly and same-site. Service assertions never enter browser storage.
- FastAPI checks account membership and ownership independently. Author IDs come from signed assertions, never request JSON. Public response schemas expose usernames and ownership flags only.
- Strict schemas reject unknown fields, invalid types, reserved usernames, and invalid boards. Request bodies are capped at 64 KiB with a total read deadline; queries are bounded. User text is rendered as text.
- Database-backed per-account limits apply across backend instances: posts 10/minute, comments 30, votes 120, username attempts 5, reads 240. Explicit local mode multiplies limits by 10. Limits use HMAC keys and store no IP addresses.
- Nonce-based CSP, framing prevention, no-store responses, content-type protection, restrictive permissions, and production HSTS are applied by middleware.
- Production PostgreSQL connections require TLS with certificate and hostname verification (`verify-full`). Backend connections require HTTPS except loopback. Production API docs are disabled. SQL parameters and access request logs are disabled in the provided backend command.
- Local login requires development mode, an explicit local flag, loopback services, and a dedicated local database. Production builds cannot enable the demo provider.

These controls do not make the app invulnerable. Infrastructure still needs TLS termination, restricted database/service access, a request-size/rate-limiting edge proxy, monitoring, backups, and ongoing dependency updates. Service-key compromise allows impersonation; protect it on both servers. Per-account limits do not replace edge protection against unauthenticated floods or coordinated abuse. Moderation/reporting tools are outside this version.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run local` | Start all three local services and preserve local data |
| `npm run backend:install` | Create Python environment and install locked backend requirements |
| `npm run backend` | Run configured FastAPI on loopback port 8000 using private root `.env` |
| `npm run dev` | Run configured Next.js frontend |
| `npm run db:upgrade` | Apply Alembic migrations to the configured database; review target and back up first |
| `npm run typecheck` / `npm run lint` | Frontend static checks |
| `npm test` / `npm run test:backend` | Frontend/privacy and backend/security tests |
| `npm run build` / `npm start` | Build and serve production frontend |
| `npm run test:local` | Actual two-account HTTP/PostgreSQL checks against the running local app |
| `npm run test:smoke` | Logged-out HTTP access checks |

For another printed frontend port: `node scripts/local-check.mjs http://localhost:3001`. This runner removes its temporary posts and may initialize the third account as `localtester`. It accepts only loopback targets. CI runs frontend checks, backend tests, production dependency audit, and the production build without production credentials.

## Configure Google and PostgreSQL

The demo does not need this setup. For real accounts:

1. Copy `.env.example` to `.env` and fill it privately. Never paste secrets into chats, logs, screenshots, or Git.
2. Create a Google OAuth web client. Development origin: `http://localhost:3000`; callback: `http://localhost:3000/api/auth/callback/google`. Allow test accounts in Google's testing configuration.
3. Configure PostgreSQL or Supabase. Runtime `DATABASE_URL` can use the transaction pooler; `DIRECT_URL` must use the direct/session pooler for migrations. URL-encode passwords. Legacy `pgbouncer=true` is removed by the SQLAlchemy connection helper.
4. Generate **independent** random secrets of at least 32 characters for `NEXTAUTH_SECRET`, `ANON_PEPPER`, and `BACKEND_SHARED_SECRET`. Keep the identity pepper stable permanently. The service secret must match on Next.js and FastAPI. None are `NEXT_PUBLIC_` variables.
5. Set `APP_ENV=development`, `BACKEND_URL=http://127.0.0.1:8000`, and `NEXTAUTH_URL=http://localhost:3000` for configured local development. Leave `COLLEGE_FORUM_LOCAL=0` to use Google.
6. Run `npm run backend:install`, review the database target, then `npm run db:upgrade`. The migration creates/adopts the forum tables and enables PostgreSQL RLS on forum/security tables. The server database role must have the intended access; public Supabase Data API roles must have none. Verify this on the actual database.
7. In separate terminals, run `npm run backend` and `npm run dev`. Sign in and choose an alias.

| Variable | Service | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Next.js | Google OAuth web client |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Next.js | Encrypted sessions and exact public frontend origin |
| `ANON_PEPPER` | Next.js | Stable email HMAC key; at least 32 characters |
| `ALLOWED_EMAIL_DOMAIN` | Next.js | `rkgit.edu.in`; code enforces the college even if this is unset or changed |
| `BACKEND_SHARED_SECRET` | Both | Independent service authentication secret; at least 32 characters |
| `BACKEND_URL` | Both | Exact backend origin; HTTPS except loopback |
| `DATABASE_URL` | FastAPI | PostgreSQL runtime connection |
| `DIRECT_URL` | Migration only | Direct/session PostgreSQL connection |
| `APP_ENV` | FastAPI | `production` or `development`; defaults to production |
| `COLLEGE_FORUM_LOCAL` | Both | Keep `0` for real Google deployments |

On separate hosts, give each service only its listed variables. Local `.env` is a development convenience. The provided launcher passes no database credentials to Next.js and no Google credentials to FastAPI.

## Deploy

Host Next.js on Vercel or a Node host and FastAPI as a separate Python/container service. `backend/Dockerfile` runs as an unprivileged user and disables access logs. Build with `docker build -t college-forum-api backend`. The included Render blueprint runs Alembic as a pre-deploy step. On other hosts, run migrations explicitly with the private environment before starting the backend. Alembic downgrade is intentionally disabled for the adoption migration to protect existing data.

Use `APP_ENV=production`, HTTPS service origins, a stable `NEXTAUTH_SECRET`/`ANON_PEPPER`, and the same service secret on both hosts. Set `NEXTAUTH_URL` and Google's callback to the exact public frontend origin. Do not expose a development server. Restrict backend ingress to the frontend/private network where practical. Configure your reverse proxy to preserve the configured backend Host, enforce body/header/time limits, and trust only the actual proxy address for forwarded headers. Database TLS uses `verify-full` with the bundled public CA store by default. For a provider-specific CA, mount its PEM certificate and set `sslrootcert=/path/provider-ca.pem` in the private database URL. Hostname/certificate verification cannot be disabled in production.

Google OAuth, hosted PostgreSQL RLS, TLS/proxy configuration, and deployed behavior require verification in your own environment; local tests do not certify them. Use separate data/secrets for previews. See [Verification](docs/VERIFICATION.md).

## Privacy

Google sign-in requires a verified email whose exact domain is `rkgit.edu.in` and a matching Google `hd` claim. A policy version in the private JWT rejects old unrestricted sessions; users sign in again. The public `/privacy` page describes data handling.

The frontend derives `HMAC-SHA256(ANON_PEPPER, lowercase(trim(email)))`, truncated to 32 hex characters. Google profile fields are discarded from application sessions. FastAPI receives the derived identity, not the email. The database has no email, real name, photo, Google subject, or IP columns. Public content responses expose usernames; a user's own anonymous ID appears in their session.

This is pseudonymity. Google sees sign-in; hosting providers may retain IP logs. Someone holding the pepper, database, and an email list can test matches. Writing style, timing, and content can identify an author. Lost or changed peppers disconnect future logins from existing accounts. Shared demo accounts do not provide private identities.

## Source layout

```text
backend/app/          FastAPI routes, models, validation, service security
backend/migrations/   Alembic schema adoption/migrations
backend/tests/        API, ownership, validation, replay and rate-limit tests
app/                  Next.js pages, NextAuth, authenticated API gateway
components/           Responsive forum interface
lib/                  Auth, HMAC, backend client, gateway checks and UI helpers
scripts/              Three-service launcher, Python setup, HTTP checks
tests/                Frontend auth/privacy, middleware and gateway tests
prisma/               Original schema/RLS reference (historical)
docs/                 Product spec, deployment, migration notes and verification
```

The [product specification](docs/SPEC.md) describes the forum requirements. Current architecture is documented here and in [migration notes](docs/FASTAPI_MIGRATION.md); production setup is in the [deployment guide](docs/DEPLOYMENT.md). Editing, image uploads, nested replies, notifications, moderation UI, username changes, and account-deletion UI remain outside this version.
