# Verification

This checklist separates local automated checks from checks that require real Google, Supabase, and Vercel configuration. Commands below are reproducible instructions, not a claim that they have already passed. Consult the build handoff for the results of the current local run.

The repository's `.github/workflows/ci.yml` repeats schema validation, TypeScript, ESLint, unit/privacy tests, and the production build on pushes and pull requests. It needs no production credentials and never pushes a database schema. The local HTTP runner remains a separate check against a running local app.

## Local automated checks

Install the locked dependencies, then run:

```sh
npm ci
npx prisma validate
npx prisma generate
npm run test
npm run typecheck
npm run lint
npm run build
```

Prisma validation and production builds can require the environment variable names in `.env.example` to be configured. A successful build does not prove OAuth, a real database connection, or deployed infrastructure security. Do not share environment files or paste secret-bearing output into tickets.

The automated tests use synthetic data. They cover HMAC normalization, key separation, minimum pepper length, validation boundaries, auth callback privacy, and actual middleware access decisions using encrypted synthetic session tokens. Middleware tests verify page redirects, API `401`/`403` responses, and exact auth/setup endpoint boundaries. They do not substitute for a two-account end-to-end run.

With the app running in another terminal, `npm run test:smoke` runs 15 HTTP checks against `http://127.0.0.1:3000`. They verify login rendering, logged-out redirects, JSON API rejections, and an empty unauthenticated session. Set `SMOKE_ORIGIN` to use a different local origin. These requests carry no session cookies and do not create database records.

## Pending live checks

The local app now has a separate, working development path: `npm run local`, followed by `npm run test:local`. Its two-account checks exercise a real portable PostgreSQL database. Production Google/Supabase checks below still require the owner's service configuration; local success does not verify those external services.

These checks require the owner to configure Google OAuth and Supabase. Leave each item unchecked until it has been observed against the intended environment.

- [ ] The schema exists in the intended Supabase database, with `User`, `Post`, `Comment`, and `Vote` tables and the documented cascading relations and indexes.
- [ ] The database has no email, real name, picture, Google ID, or application-stored IP fields. Anonymous user IDs are 32 lowercase hexadecimal characters.
- [ ] RLS is enabled on all four tables. Requests through the Supabase Data API using public/anonymous access cannot read rows. The server's Prisma connection still works.
- [ ] `.env` is ignored by Git and no actual secret has been committed. Review locally without publishing secret-bearing diffs or history.
- [ ] Google sign-in succeeds for a verified permitted email. An unverified/missing email is rejected. With `ALLOWED_EMAIL_DOMAIN` configured, other domains are rejected.
- [ ] Google testing-mode accounts are explicitly allowed; the production consent configuration is ready before wider release.
- [ ] First sign-in goes to `/setup-username`. Reserved names, punctuation, too-short/long names, and case-insensitive duplicates are rejected. A successful choice immediately reaches the feed and cannot be changed through the API.
- [ ] `/api/auth/session` exposes only `user.id`, `user.username`, and `expires`; no email, name, picture, or Google subject appears. Inspect decrypted session behavior through the endpoint; do not copy session cookies into shared tools.
- [ ] Logged-out visits to protected pages go to `/login`. Logged-out API calls return JSON `401`. A signed-in account without a username receives API `403` except for username setup.
- [ ] Account A can create a post, account B can comment and vote, and the changes remain after reload. Boards filter correctly and an unknown board page returns `404`.
- [ ] In a second browser profile or incognito window, B has no Delete control on A's post. A direct `DELETE /api/posts/<A-post-id>` request from B returns `403` and preserves the post.
- [ ] Clicking an active vote removes it; choosing the opposite direction switches it. Scores and `myVote` remain correct after reload and when both accounts interact.
- [ ] A can delete their own post; related comments/votes disappear. Fetching the deleted post returns `404`.
- [ ] Invalid JSON, invalid boards, empty/oversized content, invalid vote values, missing IDs, and nonexistent posts produce the documented JSON errors without Prisma messages or stack traces.
- [ ] Page through more than 20 posts. There are no repeated/skipped posts, including posts with the same creation timestamp, and the final page has `nextCursor: null`.
- [ ] Every post/comment/vote response contains no `userId`, `anonId`, email, profile fields, or author identity except username. The signed-in user's own ID in `/api/auth/session` is the documented exception.
- [ ] User input containing HTML/script syntax renders as text. Mobile navigation, keyboard focus, form error states, and loading controls remain usable.
- [ ] Signing out removes access to the feed and private APIs.

## Deployment checks

- [ ] Vercel's production environment has the required variables. The production origin equals `NEXTAUTH_URL`; Google's authorized redirect URI is that exact origin followed by `/api/auth/callback/google`.
- [ ] The pepper is securely backed up and matches the database's existing user identities. Production secrets and data are excluded from disposable previews.
- [ ] Repeat the live OAuth, RLS, session privacy, ownership, voting, and logout checks against the production deployment.
- [ ] Inspect app and provider logging configuration without recording real tokens, sessions, request bodies, profile data, or environment values. Provider infrastructure may still retain IP logs, as described in the README.
- [ ] Accept the documented v1 limits or add moderation and abuse controls before opening the forum to a broader audience.
