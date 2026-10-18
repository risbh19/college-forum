# Build handoff

Built on 19 October 2026 (Asia/Calcutta).

Implemented the complete v1 source in this workspace using Next.js 14.2.35, NextAuth 4.24.15, Prisma 6.19.3, strict TypeScript, Tailwind CSS 3, and Zod. The supplied AGENTS.md, specification, and build plan are retained.

The app includes Google sign-in, permanent case-insensitive usernames, all five boards, protected feeds, 20-post cursor pagination, create/delete posts, comments, vote toggling, and responsive navigation. Database access uses explicit selections and public response mapping; auth callbacks discard provider identity fields. Concurrent vote changes use serializable transactions with retries.

## Verification results

- 35 automated tests passed: HMAC compatibility and normalization, validation, token/session privacy, Google verification/domain restrictions, signed-session middleware access controls, and strict local-mode boundaries.
- TypeScript and ESLint passed.
- Repository final review checked lockfile consistency, README link targets, CI workflow structure, ignored local/secret files, and staged whitespace. GitHub CI is configured to repeat schema, types, lint, unit, and build checks; its remote result is separate from the local verification record.
- The final production build passed with all application and API routes.
- Prisma schema validation passed and Prisma Client was generated. The complete local app now runs against portable PostgreSQL, with its schema applied only to the dedicated loopback database. No Supabase database was changed.
- 15 production HTTP smoke checks passed, covering login rendering, protected-page redirects, API 401 JSON errors, and an unauthenticated session.
- A running production build was also checked with `COLLEGE_FORUM_LOCAL=1`: it did not advertise or display local demo login. The local flag cannot enable demo credentials in production.
- The production login page was inspected in the in-app browser. The configuration-required state and expandable privacy disclosure work. No browser errors or warnings appeared on the final login page.
- The local login, protected feed, post creation form, and comment submission were also verified in the browser. The local HTTP suite passed 15 groups covering real account sessions, onboarding/session refresh, cross-account ownership, comments, voting, concurrent votes, 20-row pagination, invalid/deleted cursors, validation, and cascading deletion. Its temporary posts were removed.
- The app and PostgreSQL were stopped and restarted. The browser-created post, its comment, and the signed-in session persisted. That temporary test post was then removed, and the untouched onboarding fixture was reset so the user can choose an alias.
- Secret filenames are ignored by Git. No .env file was read or created; .env.example contains only empty values.

## Run and finish configuration

For the user-requested usable local app, run `npm run local` or double-click `Start Local.cmd`, then open the printed localhost URL. No Google, Supabase, Docker, or .env setup is needed. Portable PostgreSQL and randomly generated local-only connection/session settings persist in ignored `.local/`. Demo accounts are shared and clearly labeled as not private.

Local database persistence and cross-account workflows are verified. Production Google OAuth, Supabase/RLS, and Vercel deployment remain unverified. For those services, follow README.md and complete docs/VERIFICATION.md with your own private configuration. No hosting accounts or resources were created and no deployment was performed.

Git origin is https://github.com/risbh19/college-forum.git. The complete source includes the working local app, launcher, and development-only credentials.

Suggested commit for the local app addition: feat: add complete local forum mode

## Files added

All source files are new because the workspace initially contained only .git. Generated node_modules, .next, next-env.d.ts, and TypeScript build caches are excluded below.

```text
.env.example
.eslintrc.json
.gitignore
AGENTS.md
README.md
Start Local.cmd
app/(auth)/login/page.tsx
app/(main)/board/[name]/page.tsx
app/(main)/create/page.tsx
app/(main)/error.tsx
app/(main)/layout.tsx
app/(main)/loading.tsx
app/(main)/not-found.tsx
app/(main)/page.tsx
app/(main)/post/[id]/page.tsx
app/api/auth/[...nextauth]/route.ts
app/api/comments/route.ts
app/api/posts/[id]/route.ts
app/api/posts/route.ts
app/api/username/route.ts
app/api/votes/route.ts
app/globals.css
app/icon.svg
app/layout.tsx
app/not-found.tsx
app/providers.tsx
app/setup-username/page.tsx
components/auth/GoogleSignInButton.tsx
components/auth/LocalLogin.tsx
components/auth/UsernameForm.tsx
components/comments/CommentBox.tsx
components/comments/CommentList.tsx
components/layout/BoardNavigation.tsx
components/layout/CommunityPanel.tsx
components/layout/Sidebar.tsx
components/posts/DeletePostButton.tsx
components/posts/PostCard.tsx
components/posts/PostFeed.tsx
components/posts/PostForm.tsx
components/ui/BoardBadge.tsx
components/ui/Icon.tsx
components/ui/Navbar.tsx
components/ui/VoteButton.tsx
docs/BUILD_HANDOFF.md
docs/BUILD_PLAN.md
docs/SPEC.md
docs/VERIFICATION.md
lib/api.ts
lib/auth.ts
lib/boards.ts
lib/db.ts
lib/hash.ts
lib/local-mode.ts
lib/queries.ts
lib/time.ts
lib/validators.ts
middleware.ts
next.config.mjs
package-lock.json
package.json
postcss.config.mjs
prisma/enable-rls.sql
prisma/schema.prisma
scripts/smoke.mjs
scripts/local.mjs
scripts/local-check.mjs
tailwind.config.ts
tests/auth.test.ts
tests/hash.test.ts
tests/local-mode.test.ts
tests/middleware.test.ts
tests/validators.test.ts
tsconfig.json
types/index.ts
types/next-auth.d.ts
```
