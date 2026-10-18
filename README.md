# College Forum

A private, Reddit-style college forum with Google sign-in, a permanent chosen username, five boards, posts, comments, and toggleable up/down votes. Reading requires a signed-in account with a username. Authors can delete their own posts. The app uses pseudonymous identities and does not store Google profile details in its database.

## Stack

- Next.js 14.2, App Router, strict TypeScript, Tailwind CSS 3
- NextAuth v4 with encrypted JWT sessions and Google OAuth
- Prisma 6 and PostgreSQL on Supabase
- Zod validation; Vercel deployment

## Local setup

Use Node.js 20.9 or newer, as required by `package.json`.

1. Clone the repository and install the locked dependencies:

   ```sh
   git clone https://github.com/risbh19/college-forum.git
   cd college-forum
   npm ci
   ```

2. Copy `.env.example` to a git-ignored `.env` and fill it locally. In PowerShell, use `Copy-Item .env.example .env`; in a POSIX shell, use `cp .env.example .env`. Keep secrets out of chats, screenshots, logs, and Git. Generate a strong `NEXTAUTH_SECRET` and an independent `ANON_PEPPER` of at least 32 characters. Back up the pepper securely and keep it stable for the lifetime of the database.

3. Create a Google OAuth **Web application** client. Use the `openid email profile` scopes. Set the local origin to `http://localhost:3000` and the authorized redirect URI to `http://localhost:3000/api/auth/callback/google`. While the consent screen is in testing mode, add the Google accounts you will use as test users.

4. Create a Supabase project. Put its transaction pooler connection in `DATABASE_URL` with `pgbouncer=true`, and its direct connection or session pooler connection in `DIRECT_URL`. URL-encode special characters in database credentials. Set `NEXTAUTH_URL` to the local origin. Set `ALLOWED_EMAIL_DOMAIN` if only a specific college domain should be accepted; an empty value permits any verified Google account.

5. Review the target database, then run these commands yourself. `db:push` changes its schema:

   ```sh
   npx prisma validate
   npx prisma generate
   npm run db:push
   ```

6. Enable Row Level Security in the Supabase SQL editor before making the project available:

   ```sql
   alter table public."User" enable row level security;
   alter table public."Post" enable row level security;
   alter table public."Comment" enable row level security;
   alter table public."Vote" enable row level security;
   ```

   Do not add permissive public policies. Browser clients use the app API, never Supabase directly. Prisma needs a server-only database role with the required permissions; verify both that Prisma works and that Supabase's unauthenticated Data API cannot read these tables. RLS is database configuration, so repeat this check for every new database.

7. Start the app and complete Google sign-in and username setup:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3000`. For verification commands and the two-account launch checklist, see [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Environment variables

`.env.example` contains names and empty values only. Keep actual values in local `.env` and Vercel's environment settings. No secret variable should use a `NEXT_PUBLIC_` prefix.

| Name | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth web client identifier |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Session token signing/encryption secret |
| `NEXTAUTH_URL` | Exact local or production app origin |
| `ANON_PEPPER` | Server-only HMAC key; at least 32 characters; never change after launch |
| `ALLOWED_EMAIL_DOMAIN` | Optional allowed email domain |
| `DATABASE_URL` | Supabase pooled runtime PostgreSQL connection |
| `DIRECT_URL` | Supabase direct/session connection for schema changes |

## How anonymity works

The server receives the Google profile during OAuth, checks that its email is verified and allowed, then derives a permanent anonymous ID with `HMAC-SHA256(ANON_PEPPER, lowercase(trim(email)))`, truncated to 32 hexadecimal characters. The application database stores that ID and the chosen username, with no email, real name, picture, Google ID, or IP column. Auth callbacks rebuild tokens and sessions to remove Google identity fields. The signed-in user's own anonymous ID appears in their session; post, comment, and vote API responses expose usernames and ownership flags without author IDs.

A leaked database alone cannot be matched against a guessed email list without the pepper. This is pseudonymity, not a promise that nobody can identify a user:

- Google necessarily sees that you logged in. Vercel and Supabase infrastructure logs may contain IP addresses even though this app does not store them.
- Someone with both the database and `ANON_PEPPER`, plus a list of emails, can test whether a given email has an account. Restrict access to both.
- Writing style, timing, and details in posts can identify someone.
- Changing or losing `ANON_PEPPER` changes every user's identity and disconnects future logins from their existing account. Keep a secure backup.

## Deploy to Vercel

Import this repository as a Next.js project. Set all applicable variables above in the deployment environment; set `NEXTAUTH_URL` to the final HTTPS origin. Use the existing pepper whenever the deployment uses the same user database. Install runs Prisma client generation. Apply the schema and RLS explicitly to the intended database before launch; deployment does not push the schema automatically.

Add the production origin and its `/api/auth/callback/google` redirect URI to the Google client, then redeploy after changing environment variables. Use a separate database for disposable previews; do not point untrusted preview code at production data or production secrets. Complete the live checklist in [docs/VERIFICATION.md](docs/VERIFICATION.md), including domain restrictions, two-account ownership, session privacy, and RLS checks. Enable Google's production consent configuration before inviting users beyond the configured test users.

V1 has no moderation tools, rate limiting, image uploads, nested comments, username changes, or account-deletion UI. Review these limits before inviting a wider community.

The product and API contract is in [docs/SPEC.md](docs/SPEC.md); the supplied implementation sequence is in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).
