# Deploy RKGIT College Forum

Target: **Vercel frontend + Render FastAPI + Supabase PostgreSQL**. Only verified, college-managed **@rkgit.edu.in Google Workspace accounts** can sign in. Personal Gmail, other domains, subdomains and accounts without the matching Google hosted-domain claim are rejected by server code. Changing or omitting `ALLOWED_EMAIL_DOMAIN` cannot open access.

For dashboard-by-dashboard instructions, follow [Manual Vercel deployment](VERCEL_SETUP.md). Database migration head `0002_reports`, RLS on all seven forum/security tables, and a read-only Upstash PING were verified during setup. Hosted Render readiness, the Vercel frontend, real Google sign-in and live quotas remain unverified. Do not paste credentials into chat or commit them.

## 1. Review the source and prepare accounts

- Review the release changes and push the release commit to your GitHub repository. Vercel and Render build the committed remote source, so the production branch must contain the FastAPI backend and deployment configuration described here.
- You already have Vercel. Create/sign in to Render and create a Supabase PostgreSQL project. Choose nearby service/database regions where available. The blueprint uses Render Singapore.
- The included Render blueprint selects **paid Starter** because Render's pre-deploy migration command requires a paid service. Review current pricing before creating resources. Nothing paid was created by this preparation. For a free trial, remove `preDeployCommand`, choose the free plan yourself, and run migrations once from a trusted local terminal before deploying; free-service cold starts may exceed the frontend's ten-second backend deadline.
- Use a fresh production database with no demo sample content. Never upload `.local/` or its shared demo keys. If migrating an existing real-user database, back it up and retain its exact identity pepper.

## 2. Prepare PostgreSQL privately

In Supabase's **Connect** panel obtain:

| Variable | Connection |
| --- | --- |
| `DATABASE_URL` | Runtime transaction/session pooler URL; URL-encode the password |
| `DIRECT_URL` | Direct connection or session pooler for Alembic; not the transaction pooler |

IPv4-only hosts can use the session pooler if the direct address is unreachable. No Supabase API/service-role key is needed by this app. Database credentials belong only on Render, never in Vercel or any `NEXT_PUBLIC_` variable.

Production connections enforce `sslmode=verify-full`: both encryption and certificate/hostname verification. The backend image bundles the public Supabase Root 2021 CA and automatically selects it for Supabase pooler/direct database hosts. No Windows certificate path or secret-file upload is needed for this provider CA. Other providers use the public CA store. If a project needs a different CA, download its root certificate from the provider dashboard, mount it as a Render secret file, and add `sslrootcert=/etc/secrets/supabase-ca.pem` to **both** database URLs. Use `&` if a query already exists. An explicit CA takes precedence; certificate/hostname verification cannot be disabled.

Alembic creates/adopts the original forum tables plus shared rate-limit/replay tables and enables RLS. The server SQL role needs the expected owner/bypass-RLS access. Public Supabase Data API roles must not read/write forum or security records; review existing policies if you reuse a project. Keep that privileged SQL credential on the backend only.

The current head is `0002_reports`: it preserves existing records, adds default-visible `hidden` columns to posts/comments, creates private reports with one-target/unique-reporter constraints, and enables RLS on Report. Deploy the backend migration before the new frontend. Readiness rejects the old revision. Do not run this migration against an unreviewed target.

Set backend-only `ADMIN_ANON_IDS` to a comma-separated list of existing 32-character anonymous IDs for trusted moderators. An operator may obtain their **own** ID from their authenticated session; do not publish IDs or place them in `NEXT_PUBLIC_` variables. Do not change the identity pepper. Empty disables admin actions. Restart/redeploy the backend after changes. `/admin` shows the latest 100 reported targets; admins can hide/delete any post/comment on its detail page. Reports auto-hide at three distinct accounts, but require human review and an abuse contact. There is no unhide or appeal workflow in this release.

To calculate a trusted moderator's ID locally, run this standalone helper from an interactive terminal at the repository root:

```sh
node scripts/print-anon-id.mjs
```

Enter the existing production `ANON_PEPPER` at the hidden prompt (at least 32 characters, with no echo or masking characters), then enter the moderator's college email at the normal prompt. The email prompt echoes normally; prompt labels use the terminal (stderr), and stdout contains only the 32-character ID plus a newline. The helper uses exactly `HMAC-SHA256(ANON_PEPPER, lowercase(trim(email)))`, truncated to 32 hex characters. It preserves pepper whitespace and never reads environment variables or files, including `.env`. It accepts no command-line arguments or piped input. Ctrl+C cancels and restores the terminal; invalid input or a non-interactive terminal exits without an ID. Never place the pepper in a command, shell variable, file, or chat. The helper neither stores inputs nor contacts any service, and is not imported by or deployed as an app endpoint.

Copy the resulting ID privately into Render's `ADMIN_ANON_IDS` (comma-separate multiple IDs), then redeploy/restart FastAPI. The moderator must still sign in with the same permitted college account and choose a username; deriving an ID does not create an account or bypass verification. Preserve the existing pepper to retain account identities.

## 3. Create the Render backend

1. In Render, create a **Blueprint** from the reviewed GitHub repository using root `render.yaml`. Alternatively create a Docker Web Service manually with the settings below.
2. Review the paid plan before creation. Supply the private variables from [backend.env.example](../deploy/backend.env.example). Set `BACKEND_URL` to the service's exact public HTTPS origin shown by Render. If the assigned subdomain differs from the expected name, correct the variable before redeploying.
3. Generate an independent random `BACKEND_SHARED_SECRET` of at least 32 characters and save it privately. This exact value will also go into Vercel. Do not reuse a desktop demo key or a key from an unrestricted old frontend.
4. The pre-deploy step runs `python -m alembic -c alembic.ini upgrade head`. A migration failure blocks the new release. It does not run sample seeds or drop old records. Back up existing data before schema changes.
5. Wait for the backend readiness check to pass, then verify the endpoints below. Automatic deploys are disabled in the blueprint; release deliberately after CI passes.

| Render setting | Value |
| --- | --- |
| Runtime | Docker |
| Dockerfile / context | `./backend/Dockerfile` / `./backend` |
| Pre-deploy | `python -m alembic -c alembic.ini upgrade head` |
| Start | Docker default `python -m app.serve` |
| Health check | `/ready` |
| Environment | `APP_ENV=production`, `COLLEGE_FORUM_LOCAL=0` |

The unprivileged container listens on `0.0.0.0:$PORT`. Render supplies `PORT`; do not hardcode the frontend's port. Request access logs and forwarded-header trust are disabled by the provided entrypoint. Render terminates TLS; the frontend calls the public HTTPS URL. No CORS allowlist or browser database access is required because browsers only call the Vercel same-origin gateway.

Expected backend results: `/health` 200; `/ready` 200 only when the expected migration and forum/security tables are usable; unsigned `/api/posts` and `/internal/session` 401; `/docs` and `/openapi.json` 404. `/health` alone does not establish database readiness. Keep `BACKEND_URL` in sync if you add a custom domain, including the Host used by Render health checks.

## 4. Configure Google Workspace sign-in

1. Create a Google OAuth **Web application** client in Google Cloud / Google Auth Platform. Use only `openid email profile` scopes.
2. Determine your stable Vercel production origin, for example `https://your-project.vercel.app` or your own verified custom domain. Use the exact real origin, not the example and not a changing preview URL.
3. Add that HTTPS origin as an authorized JavaScript origin, and this exact redirect URI:

   ```text
   https://YOUR-FRONTEND/api/auth/callback/google
   ```

4. Fill app branding with accurate operator/support details. The app provides a public `/privacy` page; review it against your operational retention/backups/contact process, then use its production URL for the privacy notice. Announce an actual administrator contact channel to members.
5. If the Cloud project belongs to the college Workspace organization, **Internal** audience can limit access at Google too. A personal Google Cloud project cannot simply claim that organization; use External with the app's server-side college checks. Review Google's current publishing/branding requirements and the college administrator's OAuth app-access policy before campus launch. Workspace administrators can block even a published OAuth app.
6. Configure production access rather than relying on a temporary developer setup. Test with two actual permitted college accounts. The `hd` request hint selects the college, but access is enforced by checking the validated ID token's exact `hd`, email domain and boolean `email_verified` in server callbacks.

No Google email/profile/hosted-domain claim is stored in the forum database or returned in the application session. The JWT retains only the anonymous identity, alias and a non-identifying authorization-policy version. Pre-policy sessions must sign in again. Local-demo sessions are rejected in production.

## 5. Create the Vercel frontend

1. Import the same reviewed GitHub repository. Set **root directory to the repository root**, framework **Next.js**, and Node **22.x** (or another supported version >=20.9). Use the production branch containing these changes.
2. `vercel.json` supplies `npm ci` and `node scripts/check-production.mjs && npm run build`. The preflight rejects missing/short/reused secrets, non-HTTPS origins, demo flags and misleading domain overrides without printing values.
3. Create an Upstash Redis database, copy its REST URL/token privately, and add the variables from [frontend.env.example](../deploy/frontend.env.example) to Vercel's **Production** environment:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The production OAuth web client |
   | `NEXTAUTH_URL` | Exact stable Vercel/custom HTTPS frontend origin |
   | `NEXTAUTH_SECRET` | Independent random session secret, at least 32 characters |
   | `ANON_PEPPER` | Independent random identity key, at least 32 characters; preserve forever for this database |
   | `BACKEND_SHARED_SECRET` | Exact service secret set on Render |
   | `BACKEND_URL` | Exact Render backend HTTPS origin |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Private Redis REST credentials, on Vercel only |
   | `COLLEGE_FORUM_LOCAL` | `0` |
   | `ALLOWED_EMAIL_DOMAIN` | `rkgit.edu.in` (code also enforces this fixed policy) |

4. Redeploy after configuring variables; an initial unconfigured build intentionally fails preflight. Do not set database credentials or `DIRECT_URL` on Vercel. Never prefix secrets with `NEXT_PUBLIC_`.
5. Student-facing production login and `/privacy` must be publicly reachable. If Vercel Deployment Protection blocks visitors before Google login, configure the intended production access in your project settings. Protected forum pages themselves still require college sign-in.
6. Give previews a separate backend/database/secrets/Google client. An unconfigured preview intentionally fails preflight; do not copy production credentials into disposable previews.

Keep Vercel's automatic system-environment exposure enabled so `VERCEL=1` is available. Auth throttling trusts only `x-vercel-forwarded-for`; self-hosted frontends require a reviewed proxy integration. Never copy the Redis token to Render or a `NEXT_PUBLIC_` variable. Previews must use separate Redis state/secrets. Quotas are posts 5/hour, comments 20/hour, votes 60/minute and username attempts 5/hour per anonymous account; all auth requests share 20/minute per normalized IP. Shared campus NAT users share that auth quota. Redis stores only HMAC keys; SDK analytics/telemetry are disabled. A Redis outage or missing configuration blocks protected requests with generic 503; limits return JSON 429 and `Retry-After` seconds. The explicitly enabled loopback local demo remains offline and bypasses Upstash.

Generate the three random keys privately with your password manager or a local cryptographic generator. Keep the identity pepper backed up; changing it breaks account continuity. If an old unrestricted frontend used the same backend service secret, rotate only that service secret on both new production services; do not rotate the identity pepper for an existing real-user database.

## 6. Verify before inviting users

Read-only checks against your actual public HTTPS origins:

```sh
node scripts/deployment-smoke.mjs https://YOUR-FRONTEND https://YOUR-BACKEND
```

The runner checks college-only login text, public security headers, Google-only auth, callback origin, unauthenticated access rejection, backend readiness and disabled production docs. It sends no credentials and creates no records. It does **not** prove Google sign-in works.

Then use two real college accounts:

- A signs in, chooses an alias, creates a post. B sees it after reload, comments and votes. A sees B's changes after reload. Voting toggles/switches correctly. The app uses ordinary request/reload updates; live push notifications are outside this version.
- B cannot delete A's post. A can delete it and related comments/votes disappear.
- Personal Gmail and another-domain Google accounts are denied even if manually selected on Google's account picker. College subdomains and non-Workspace accounts are denied too.
- Sign out, reload and confirm private pages/APIs are inaccessible. Old pre-policy cookies do not grant access. Production never shows shared demo accounts.
- On a disposable staging environment, verify rate-limit boundaries/reset and JSON 429/Retry-After; confirm neither raw IPs nor tokens are logged or written to Redis keys. Verify a Redis failure returns generic 503. Unit tests use the real SDKs with mocked REST responses, not a live Redis account.
- Verify public content responses show aliases only; the current user's own anonymous ID is the documented session exception. Never copy real cookies/tokens into shared tools.
- Confirm RLS denies public Data API reads/writes, including Report, and backups are configured. Verify three distinct college accounts hide a test item, repeated reports do not count twice, normal members cannot use admin endpoints, and the configured admin can review/hide/delete without exposing identities. Provide an abuse/moderation contact process. No account-deletion UI is included.

Only after those checks should you share the production frontend URL with students. Keep the backend service key and database credentials private. App rate limits do not replace edge protection or an operational moderation process.

## Release and rollback

Run CI, back up the database, deploy/migrate Render first, then deploy Vercel and repeat checks. Keep service secrets synchronized. Rendering a green build is not evidence of a successful live Google/database test. Automatic database downgrades are deliberately disabled; roll back application code only when schema-compatible, and use a reviewed backup restoration for data rollback.

The local Docker engine was unavailable during preparation, so the actual Linux image build and hosted deployment still need validation on Render. Python startup behavior, readiness failures and frontend configuration guards are covered by local automated tests.

## Official setup references

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec), [pre-deploy commands](https://render.com/docs/deploys#pre-deploy-command), [health checks](https://render.com/docs/health-checks)
- [Supabase PostgreSQL connections and TLS](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Google hosted-domain validation](https://developers.google.com/identity/openid-connect/openid-connect#hd-param), [OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
