# Build handoff

Built on 19 October 2026 (Asia/Calcutta).

Implemented the complete v1 source in this workspace using Next.js 14.2.35, NextAuth 4.24.15, Prisma 6.19.3, strict TypeScript, Tailwind CSS 3, and Zod. The supplied AGENTS.md, specification, and build plan are retained.

The app includes Google sign-in, permanent case-insensitive usernames, all five boards, protected feeds, 20-post cursor pagination, create/delete posts, comments, vote toggling, and responsive navigation. Database access uses explicit selections and public response mapping; auth callbacks discard provider identity fields. Concurrent vote changes use serializable transactions with retries.

## Verification results

- 31 automated tests passed: HMAC compatibility and normalization, validation, token/session privacy, Google verification/domain restrictions, and signed-session middleware access controls.
- TypeScript and ESLint passed.
- The final production build passed with all application and API routes.
- Prisma schema validation passed using synthetic process-local connection strings; Prisma Client was generated. No database connection or schema push was performed.
- 15 production HTTP smoke checks passed, covering login rendering, protected-page redirects, API 401 JSON errors, and an unauthenticated session.
- The production login page was inspected in the in-app browser. The configuration-required state and expandable privacy disclosure work. No browser errors or warnings appeared on the final login page.
- Secret filenames are ignored by Git. No .env file was read or created; .env.example contains only empty values.

## Run and finish configuration

Follow README.md to fill your local .env privately, configure Google OAuth, apply the schema to the intended Supabase database, enable RLS, and run npm run dev. The login button remains disabled until the required configuration is present. The verification preview used a fresh process-local session secret, never saved to a file.

Live Google OAuth, real database persistence, RLS enforcement, cross-account ownership/voting, and Vercel deployment remain unverified. Complete docs/VERIFICATION.md against your configured services. No hosting accounts or resources were created and no deployment was performed.

Git origin is https://github.com/risbh19/college-forum.git. Nothing has been pushed.

Suggested commit: feat: build anonymous college forum

## Files added

All source files are new because the workspace initially contained only .git. Generated node_modules, .next, next-env.d.ts, and TypeScript build caches are excluded below.

```text
.env.example
.eslintrc.json
.gitignore
AGENTS.md
README.md
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
tailwind.config.ts
tests/auth.test.ts
tests/hash.test.ts
tests/middleware.test.ts
tests/validators.test.ts
tsconfig.json
types/index.ts
types/next-auth.d.ts
```
