# Manual Vercel deployment

Use GitHub `risbh19/college-forum`, branch `master`. The frontend belongs on Vercel and FastAPI stays on Render. Store real credentials only in the hosting dashboards. The example files contain variable names and safe placeholders, not real secrets.

## 1. Finish the Render backend

Open the existing backend service and deploy the latest `master` commit. Use a Docker service with repository-root Dockerfile `backend/Dockerfile` and Docker build context `backend`. The existing blueprint already describes this layout.

Set these under Render → service → Environment:

| Variable | Private value or setting |
| --- | --- |
| `APP_ENV` | `production` |
| `COLLEGE_FORUM_LOCAL` | `0` |
| `BACKEND_URL` | The actual service origin, currently `https://college-forum-qp9v.onrender.com` |
| `BACKEND_SHARED_SECRET` | Your independent service secret; use the exact same value on Vercel |
| `DATABASE_URL` | Your PostgreSQL runtime connection string |
| `DIRECT_URL` | Your direct/session-pooler migration connection string |
| `ADMIN_ANON_IDS` | Leave empty until a trusted moderator account exists |

Values must be a single line with no surrounding `< >`. Use the Supabase session pooler on port 5432 for migrations; the transaction pooler on port 6543 is not a migration target. The supplied port-5432 session URL can serve both variables initially. Never paste a local Windows `sslrootcert` path into Render: the image includes the public Supabase CA and selects it automatically. Custom provider CAs can still use an explicit mounted `sslrootcert`.

Migration head `0002_reports` was applied and database RLS verified during setup. The paid blueprint's pre-deploy command can safely repeat `alembic upgrade head`. If your existing service uses a different plan, confirm its migration mechanism before deploying. Set the health-check path to `/ready`; it must return HTTP 200 before the frontend is released. `/health` alone does not verify database access.

## 2. Import the Next.js frontend

1. Vercel → Add New / Create New → Project → import `risbh19/college-forum`.
2. Use your existing Hobby team. Choose **Next.js**, **Root Directory `./`**, production branch **`master`**, and Node **22.x**.
3. Let `vercel.json` supply install/build settings. It runs `npm ci`, the production configuration check, then `npm run build`.
4. If Vercel initially detects **Services**, let the repository configuration finish loading and select the standalone Next.js project at the repository root. Keep the Python backend on Render.
5. Create the project and note its assigned production domain under Settings → Domains. Do not guess the final domain from the project name: Vercel may add a suffix.

An initial build with missing Google credentials or an unset frontend origin intentionally fails the configuration check. Finish the next steps and redeploy. Do not remove the check or insert fake credentials to bypass it.

## 3. Create the Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/auth/clients), select/create your Google Cloud project, complete the app's branding/support details, and create an OAuth client of type **Web application**.

Use your exact assigned frontend origin for **Authorized JavaScript origins**, and append `/api/auth/callback/google` for **Authorized redirect URIs**. For example, if the assigned origin is `https://YOUR-PROJECT.vercel.app`, the redirect URI is:

```text
https://YOUR-PROJECT.vercel.app/api/auth/callback/google
```

Choose Internal audience only if the Cloud project belongs to the college Workspace organization; otherwise configure External with the app's server-side college checks. While Google is in Testing, add the intended college test accounts. Review publishing and college Workspace app-access requirements before inviting the whole campus. The application always requires verified `@rkgit.edu.in` email and matching Google hosted domain.

Save the Google client ID and secret directly in Vercel; do not put them in GitHub or chat. The public `/privacy` route is available for the app's privacy notice after deployment.

## 4. Set Vercel Production variables

Vercel → project → Settings → Environment Variables. Select **Production only** for the real service credentials. The complete names are also in [frontend.env.example](../deploy/frontend.env.example).

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Google Web client ID |
| `GOOGLE_CLIENT_SECRET` | The Google Web client secret |
| `NEXTAUTH_URL` | Exact assigned HTTPS frontend origin, without `/login` or a callback path |
| `NEXTAUTH_SECRET` | Your session secret, at least 32 characters |
| `ANON_PEPPER` | Your independent identity key, at least 32 characters; keep stable once accounts exist |
| `BACKEND_SHARED_SECRET` | Exact same service secret as Render |
| `BACKEND_URL` | `https://college-forum-qp9v.onrender.com`, if this is still your backend's actual origin |
| `UPSTASH_REDIS_REST_URL` | Your Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Your Redis REST token |
| `COLLEGE_FORUM_LOCAL` | `0` |
| `ALLOWED_EMAIL_DOMAIN` | `rkgit.edu.in` |
| `NEXT_TELEMETRY_DISABLED` | `1` |

The three session/identity/service keys must be independent. Use **Sensitive** for secret values, and keep Vercel's automatic system-environment exposure enabled for `VERCEL=1`. Do not add `DATABASE_URL`, `DIRECT_URL`, `ADMIN_ANON_IDS`, or any `NEXT_PUBLIC_` secret. Previews need separate service data and secrets.

## 5. Deploy and verify

Choose Deploy or Deployments → Redeploy after all Production variables are saved. Confirm Render `/ready` is HTTP 200 and the frontend `/login` renders with Google sign-in. Google OAuth must use the same origin as `NEXTAUTH_URL`.

Test with two real college accounts: choose aliases, post/comment/vote, reload to see changes, deny cross-account deletion, and reject personal Gmail. Test reporting with three distinct reporters in staging; verify only configured admins can hide/delete. Follow [verification](VERIFICATION.md) before inviting students.

Only the supplied database migration/RLS checks and the read-only Upstash PING have been completed for the real services. Google OAuth, hosted Render readiness, frontend deployment, and live quota behavior still need verification. Credentials shared during setup should be replaced privately before public launch; preserve the identity pepper once real account identities have been established.
