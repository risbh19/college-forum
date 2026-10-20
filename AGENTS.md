# AGENTS.md — College Forum

Anonymous college forum. Users log in with Google, but **we never store their email or any real identity** — only a keyed-hash anonymous ID and a username they choose.

Read `docs/SPEC.md` for the product/API requirements. This file is the short version of the rules you must follow on every task.

## Stack (FastAPI migration authorized by the user)

- Next.js **15.5.x**, App Router, TypeScript (strict), Tailwind CSS 3
- Backend = Python FastAPI in `backend/`, SQLAlchemy 2, PostgreSQL, and Alembic migrations. Next.js API routes are an authenticated same-origin gateway only; no business logic or database access there.
- `next-auth` **v4** (`getServerSession`, `authOptions`) with **JWT sessions**. Do NOT use Auth.js v5 / `auth()` / `NextAuth()` from `next-auth@5`.
- Preserve existing PostgreSQL records, table/column names, cascading relations, and HMAC identity algorithm. SQLAlchemy replaces the Prisma runtime; the original Prisma schema is retained only as a migration reference.
- Validation: strict Pydantic schemas in FastAPI; Zod for frontend checks.
- Hosting: Vercel for Next.js plus a separately hosted FastAPI service.

Next 15 reminders: await route/page `params` and page `searchParams`; their types are Promises. Server Components by default; add `'use client'` only when you need state, effects or event handlers.

## Privacy rules (these override everything else)

1. Never store, log, return or put into the JWT/session: email, real name, profile picture, Google ID (`sub`), IP address.
2. The anonymous ID is `HMAC-SHA256(ANON_PEPPER, lowercase(trim(email)))`, first 32 hex chars, from `lib/hash.ts`. Never use a plain unkeyed hash. Never change the algorithm or the pepper (it would change every user's identity).
3. The anonymous ID (`User.id`, `userId`) is **never sent to the client or included in any API response**. Public responses expose `username` only. Use explicit FastAPI response DTOs so `userId` cannot leak. The only exception is `session.user.id`, which belongs to the logged-in user themself.
4. The `jwt` callback builds a fresh token (`{ anonId, username }`) — the default NextAuth token contains the real email, name, picture and Google ID.
5. Never `console.log` request bodies, tokens, sessions or env values.
6. Never read, print, open or commit `.env`. Do not ask for secret values; use the names in `.env.example`.

## Local app (user-requested development mode)

The user requested a usable local app without external account setup. `npm run local` starts portable PostgreSQL, FastAPI, and Next.js with Alembic schema adoption, seed content, and development-only shared demo accounts. Local state and generated connection settings live only in ignored `.local/`; never print those settings or commit that folder. `Start Local.cmd` launches it on Windows.

`lib/local-mode.ts` must keep local credentials disabled outside `NODE_ENV=development`, the explicit `COLLEGE_FORUM_LOCAL=1` flag, loopback app/backend hosts on the frontend and loopback dedicated database in FastAPI, and the dedicated `college_forum_local` database. Never weaken these boundaries. Production continues using verified Google accounts, HMAC identities, FastAPI, SQLAlchemy, PostgreSQL/Supabase, and the documented privacy rules. Local demo identities are synthetic, shared, and clearly labeled as not private.

`npm run test:local` runs actual HTTP/account/database checks against the running local app and removes its temporary posts. Never target production or external hosts with this runner.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit  (must pass before you finish)
npm run lint         # next lint     (must pass before you finish)
npm run build        # production build (run at phase checkpoints)
npm run test:backend # FastAPI security/API tests
npm run backend      # configured Python backend
npm run db:upgrade   # Alembic; review/back up configured target first
```

## Project layout

```
app/(auth)/login/page.tsx        app/(main)/{layout,page}.tsx
app/(main)/post/[id]/page.tsx    app/(main)/board/[name]/page.tsx   app/(main)/create/page.tsx
app/setup-username/page.tsx      app/api/{auth/[...nextauth],[...path]}/route.ts
components/{auth,posts,comments,ui,layout}/   lib/{auth,backend-client,backend-assertion,gateway-security,hash,validators,boards,queries,time}.ts
types/{index.ts,next-auth.d.ts}  backend/{app,migrations,tests}/    middleware.ts
```

## Coding conventions

- Path alias `@/*` for imports. No `any`; no `// @ts-ignore`.
- Original Next.js backend convention (superseded by FastAPI migration): (1) `getServerSession(authOptions)` → 401 if none, 403 if no username (middleware also enforces this; do both), (2) validate input with the zod schemas in `lib/validators.ts` → 400 with `{ error: string }`, (3) Prisma query with explicit `select`, (4) JSON response. Never trust `userId` from the request body — take it from the session.
- Current API routes authenticate the NextAuth session, enforce same-origin bounded mutations, and sign requests to FastAPI. FastAPI validates Pydantic inputs, membership, ownership and explicit response DTOs. Never trust an account ID in JSON.
- Errors are JSON `{ error: "message" }` with the right status code. Never return raw database errors or stack traces.
- Render user content as plain text in JSX. Never use `dangerouslySetInnerHTML`.
- UI strings in English. Tailwind utility classes only, no extra CSS libraries.
- Keep components small and in the folder listed above. Do not add dependencies unless the task says so.

## Git workflow

- **One logical change per task = one file (or the files the task names).** Touch nothing else.
- **Do not run `git commit`, `git push`, `git add -A` or `git reset`.** The user commits and pushes manually after reviewing the diff. When finished, print the exact file(s) you changed and a suggested commit message (Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`).
- Do not edit `package.json` / lockfile unless the task is a dependency task.

## Definition of done (for every task)

1. Changes are scoped to the requested feature/migration.
2. `npm run typecheck` and `npm run lint` pass (if they exist yet).
3. Privacy rules above still hold.
4. Reply with: files changed, how to verify, suggested commit message. No long explanations.
