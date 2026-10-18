# College Forum

A Reddit-style college forum with five boards, permanent usernames, posts, comments, and toggleable votes. Run the complete local app without external accounts, or configure Google OAuth and Supabase for production.

## Quick start

Requires **Node.js 20.9 or newer** with npm.

```sh
git clone https://github.com/risbh19/college-forum.git
cd college-forum
npm ci
npm run local
```

Open the printed URL, normally **http://localhost:3000**. On Windows, after installing dependencies, you can also double-click [Start Local.cmd](Start%20Local.cmd). Google, Supabase, Docker, and `.env` are not needed for this mode.

| Local account | Purpose |
| --- | --- |
| Explore as shadowcoder | Use `u/shadowcoder42` |
| Switch to campusowl | Use `u/campusowl` to test another account's votes and comments |
| Try username setup | Choose the third account's permanent alias on its first sign-in |

Log out to switch accounts. The first launch adds clearly labeled sample discussions. Posts, comments, votes, usernames, and sessions survive restarts. Press **Ctrl+C** to stop; rerun `npm run local` to resume. If a port is busy, use the alternative local URL printed by the launcher.

The launcher runs portable PostgreSQL and Next.js on loopback, with the same Prisma schema used in production. Data and randomly generated local connection/session settings are saved in ignored **`.local/`**. Keep that folder to preserve your data, and never commit it. Backup or OneDrive synchronization can still copy its contents.

**Local accounts are shared and are not private.** Local credentials require development mode, an explicit flag, loopback app/database addresses, and the dedicated `college_forum_local` database. Production builds cannot enable this provider.

## Features

- General, CSE, Hostel, Placements, and Confessions boards.
- Newest-first feeds with 20-post cursor pagination and expired-cursor recovery.
- Posts, flat comments, toggleable up/down votes, and author-only post deletion.
- Permanent usernames with case-insensitive uniqueness.
- Responsive navigation, keyboard focus, and loading/error/empty states.
- Server-side auth, ownership checks, Zod validation, and explicit public response mapping.

## Stack

| Layer | Technology |
| --- | --- |
| App and API | Next.js 14.2.35 App Router, React 18, strict TypeScript |
| Styling | Tailwind CSS 3 |
| Authentication | NextAuth 4.24.15 with encrypted JWT sessions |
| Data | Prisma 6.19.3 and PostgreSQL |
| Production | Google OAuth, Supabase, Vercel |
| Local runtime | Portable PostgreSQL and synthetic demo accounts |

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies and generate Prisma Client |
| `npm run local` | Run the complete local demo |
| `npm run dev` | Develop with your Google/Supabase configuration |
| `npm run build` | Create the production build, with types and lint checked |
| `npm start` | Serve the production build |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Check ESLint |
| `npm test` | Run unit, auth privacy, local-mode, and middleware tests |
| `npm run test:local` | Run two-account HTTP/database checks against the running local app |
| `npm run test:smoke` | Check logged-out access and login rendering on a running app |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:push` | Apply the schema to the configured database; review its target first |

Run `test:local` in a second terminal while the local app is running. For another port, use `node scripts/local-check.mjs http://localhost:3001` with the printed URL. The runner removes its temporary posts, comments, and votes. It may choose `localtester` for the third account when testing first-time setup.

GitHub Actions runs schema validation, types, lint, unit tests, and a production build on pushes and pull requests. CI uses synthetic connection strings and does not access a production database. Detailed results and live-service checks are in [Verification](docs/VERIFICATION.md) and [Build handoff](docs/BUILD_HANDOFF.md).

## Configure Google and Supabase

This setup is optional for the local demo and required for the Google-authenticated app.

1. Copy `.env.example` to `.env` and fill it privately. PowerShell: `Copy-Item .env.example .env`; POSIX shell: `cp .env.example .env`. Keep secrets out of chats, logs, screenshots, and Git.
2. Create a Google OAuth **Web application** client. Local origin: `http://localhost:3000`. Redirect URI: `http://localhost:3000/api/auth/callback/google`. The app requests only `openid email profile`. Add your test accounts while Google's consent configuration is in testing mode.
3. Create a Supabase database. Use its transaction pooler connection with `pgbouncer=true` for `DATABASE_URL`, and its direct/session pooler connection for `DIRECT_URL`. URL-encode special characters in credentials.
4. Generate independent `NEXTAUTH_SECRET` and `ANON_PEPPER` values. Back up the pepper and never change it after users join. Set `NEXTAUTH_URL` to the app's exact origin.
5. Review the target database, then prepare its schema:

   ```sh
   npx prisma validate
   npm run db:generate
   npm run db:push
   ```

6. Run [prisma/enable-rls.sql](prisma/enable-rls.sql) in Supabase's SQL editor. Verify that unauthenticated Data API requests cannot read the tables while the server's privileged Prisma connection works.
7. Run `npm run dev`, sign in with Google, and choose your permanent username.

### Environment variables

`.env.example` contains empty values only. Store real values in local `.env` and the hosting environment. Do not prefix secrets with `NEXT_PUBLIC_`.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth web client identifier |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Session signing/encryption secret |
| `NEXTAUTH_URL` | Exact app origin; `http://localhost:3000` in configured development |
| `ANON_PEPPER` | Server-only HMAC key, at least 32 characters; keep stable after launch |
| `ALLOWED_EMAIL_DOMAIN` | Optional exact college domain, such as `college.edu` |
| `DATABASE_URL` | Supabase pooled runtime connection |
| `DIRECT_URL` | Direct/session connection for schema changes |

An empty `ALLOWED_EMAIL_DOMAIN` allows any verified Google account. Set it to your college domain to restrict access.

## Privacy model

Google sign-in verifies the profile, then derives an anonymous ID using `HMAC-SHA256(ANON_PEPPER, lowercase(trim(email)))`, truncated to 32 hexadecimal characters. The database has no email, real name, photo, Google ID, or IP columns. Auth callbacks rebuild tokens and sessions to discard provider identity fields.

Public post/comment/vote responses expose usernames and ownership flags rather than author IDs. The signed-in user's **own** anonymous ID appears in their session.

This is pseudonymity, with clear limits:

- Google sees the sign-in. Hosting providers may retain IP addresses in infrastructure logs.
- Someone with the database, pepper, and an email list can test for matching accounts. Restrict access to both database and pepper.
- Writing style, timing, and post details can identify an author.
- Losing or changing the pepper changes users' identities and disconnects future logins from existing accounts.
- Synthetic local demo accounts are shared and do not offer private identities.

## Deploy to Vercel

Import the repository as a Next.js project and configure the variables above. Set `NEXTAUTH_URL` to the final HTTPS origin. Add that origin and its `/api/auth/callback/google` URI to the Google OAuth client. Preserve the existing pepper when using the same user database.

Apply the schema and RLS explicitly before launch; deployment does not push the schema automatically. Complete the [live checklist](docs/VERIFICATION.md), including Google sign-in, domain restrictions, ownership, voting, logout, session privacy, and RLS. Use a separate database and secrets for disposable previews.

## Project layout

```text
app/             Pages, layouts, and API route handlers
components/      Authentication, navigation, posts, comments, and UI
lib/             Auth, privacy hashing, queries, boards, and validation
prisma/          PostgreSQL schema and Supabase RLS SQL
scripts/         Local launcher and HTTP verification runners
tests/           Unit, auth privacy, local-mode, and middleware tests
types/           Public API and NextAuth types
docs/            Product spec, build plan, verification, and handoff
.github/         Continuous integration workflow
```

## Scope and documentation

V1 has no editing, moderation tools, rate limiting, image uploads, nested replies, comment voting, notifications, username changes, or account-deletion UI.

- [Product and API specification](docs/SPEC.md)
- [Original build plan](docs/BUILD_PLAN.md)
- [Verification and live-service checklist](docs/VERIFICATION.md)
- [Implementation handoff](docs/BUILD_HANDOFF.md)
