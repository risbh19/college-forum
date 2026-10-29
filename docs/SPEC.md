# College Forum — Product & API Spec

Source of truth for what we are building. If code and this file disagree, fix one of them in the same commit.

## 1. Goal

A Reddit-style forum for one college where people can post and comment **anonymously**. Google login proves "this is a real person (from our college)", but the database must never be able to answer "who is shadowcoder42?".

## 2. Decisions (change here first, then in code)

| Topic | Decision |
|---|---|
| Who can read | Logged-in users only (keeps the forum inside the college). |
| Who can log in | Students require verified college-managed `@rkgit.edu.in` Google Workspace accounts, with exact validated `hd`. The user authorized a separate, privately configured production operator username/password at `/admin/login`; it grants no password signup for students. |
| Local development | `npm run local` provides shared synthetic demo accounts and portable PostgreSQL without external setup. This is a user-requested development-only exception; production Google authentication is unchanged. |
| Identity | `anonId = HMAC-SHA256(ANON_PEPPER, lowercase(email))`, first 32 hex chars. |
| Public name | Username chosen once, 3–20 chars `[a-zA-Z0-9_]`, unique case-insensitively, not changeable in v1. |
| Boards | Fixed list in `lib/boards.ts`: general, cse, hostel, placements, confessions. |
| Votes | One vote per user per post: UP or DOWN. Clicking the same vote again removes it. |
| Deleting | Authors can delete their own posts (comments/votes cascade). No editing in v1. |
| Moderation | Members report posts/comments; three distinct reporters auto-hide the target. Backend `ADMIN_ANON_IDS` controls the `/admin` portal: statistics, search of all content, hide/restore/delete, report dismissal and account suspension. |
| Out of scope (v1) | Image uploads, comment voting, nested replies, notifications, username change, account deletion UI. |

### Local app boundary

The local credentials provider exists only when `NODE_ENV=development`, `COLLEGE_FORUM_LOCAL=1`, the app origin is HTTP loopback, and the PostgreSQL URL names the dedicated `college_forum_local` database on loopback. The launcher binds both services to this computer. Production builds cannot enable local credentials. Synthetic local accounts are shared and not private; the UI states this explicitly. Local state persists under ignored `.local/`, without reading or creating `.env`. The data model and API response privacy rules remain the same.

## 3. Data model

```
User     id (anonId, PK) · username · usernameLower (unique) · createdAt
Post     id (cuid) · title · body · board · userId → User · createdAt · hidden (default false)
Comment  id (cuid) · body · postId → Post · userId → User · createdAt · hidden (default false)
Vote     (userId, postId) composite PK · type UP|DOWN
Report   id · postId? → Post · commentId? → Comment · reporterId → User · reason · createdAt
```
`User.suspended` is a boolean, false by default. Migration `0003_admin_accounts` adds it without changing existing records or identities. Suspension denies all member API reads and writes on the next request, including existing sessions. The private identity/session lookup remains available for sign-in; it grants no forum access. Existing content remains unless separately moderated. Accounts are listed and targeted only by username; admin accounts cannot be suspended through the portal. Admin roles remain backend-only configuration.
All foreign keys use `onDelete: Cascade`. Indexes: `Post(board, createdAt)`, `Post(createdAt)`, `Comment(postId, createdAt)`, `Vote(postId)`.

Reports require exactly one target, a trimmed 3–500 character reason, and unique `(postId, reporterId)` / `(commentId, reporterId)` pairs. A member cannot report their own content. Parent-row locks serialize reporting and moderation with writes/deletion. Hidden posts return 404 on direct reads, comments and votes; hidden comments are omitted from lists and counts. Authors may still delete their own hidden posts. Report DTOs return only `{ success: true }`; admin queue DTOs include content, counts and reasons, never identities.

## 4. Auth flow

1. `/login` → Google OAuth (scopes: `openid email profile`, nothing more).
2. `signIn` callback: require Google provider, boolean email_verified=true, exact normalized email domain rkgit.edu.in and exact hd=rkgit.edu.in. Reject other/missing claims.
3. `jwt` callback (first request after sign-in): compute `anonId` from `profile.email`, look up username, return a **fresh** token `{ anonId, username, authPolicy }` where authPolicy is a non-identifying authorization-policy version. Email, name, picture and Google ID are dropped here.
4. `session` callback: rebuild the session as `{ user: { id: anonId, username } }`.
5. `middleware.ts`: not logged in → `/login` (API: 401). Logged in without username → `/setup-username` (API: 403). Fully set up → `/login` and `/setup-username` redirect to `/`.
6. `/setup-username` POSTs `/api/username`, then calls `update()` from `useSession()` so the JWT picks up the username, then navigates to `/`.
7. JWT and session maxAge are seven days; production cookies are Secure/HttpOnly/SameSite. Client updates cannot assign identities or privileges. Admin membership is checked live in FastAPI, not trusted from client/session fields.

Why `middleware.ts` instead of `pages.newUser`: with JWT sessions and no database adapter NextAuth never flags a user as "new", so `newUser` never fires.

### Dedicated production administrator login

The operator-only NextAuth v4 credentials provider is enabled only by complete private configuration, `NODE_ENV=production`, and HTTPS frontend/backend origins. Local demo credentials retain their original development-only boundary. The operator uses a random synthetic ID, independent of student HMAC identities. FastAPI requires a signed `admin-login` assertion whose subject matches its configured, explicitly allowlisted operator ID, validates a strict username/password input, and verifies a salted scrypt hash (N=32768, r=8, p=3). It creates the synthetic account after the first successful authentication only, rejecting username collisions and suspended accounts. The response exposes only username. No plaintext password is stored in the database or hosting configuration.

Admin login uses the existing CSRF-protected NextAuth flow, Vercel auth IP throttling, and a shared FastAPI limit of five operator attempts per minute, including failures. Missing limiter infrastructure fails closed. Sessions are rebuilt from `{ anonId, username, authPolicy }`; an operator-specific non-identifying policy version permits revocation without changing student sessions or `ANON_PEPPER`. Every admin action still checks the backend allowlist. Disabling the frontend flag or rotating its version invalidates existing operator-password sessions. The offline generator writes a private ignored credential sheet and never contacts a database or hosting service.

## 5. API contract

All routes return JSON. Errors: `{ "error": "message" }`. Status codes: 400 invalid input, 401 not logged in, 403 no username / not owner, 404 not found, 409 conflict.
No response ever contains `userId`/anonId. `author` always means `{ username }`.

| Method & path | Body / query | Success response |
|---|---|---|
| `POST /api/username` | `{ username }` | `200 { username }` · `409` if taken (rely on the DB unique constraint, catch Prisma `P2002`) · `409` if the user already has one |
| `GET /api/posts` | `?board=<slug>&cursor=<postId>` (20 per page) | `{ posts: PostSummary[], nextCursor: string \| null }` |
| `POST /api/posts` | `{ title, body, board }` | `201 PostSummary` |
| `GET /api/posts/[id]` | — | `PostSummary` |
| `DELETE /api/posts/[id]` | — | `200 { success: true }` · `403` if not the author |
| `GET /api/comments` | `?postId=` | `{ comments: CommentView[] }` oldest first |
| `POST /api/comments` | `{ postId, body }` | `201 CommentView` |
| `POST /api/votes` | `{ postId, type: "UP"\|"DOWN" }` | `{ score, myVote: "UP"\|"DOWN"\|null }` (same type again = toggle off) |
| `POST /api/reports` | `{ postId?, commentId?, reason }` exactly one target | `{ success: true }`; duplicate report is idempotent while visible |
| `GET /api/admin/status` | — | `{ isAdmin: boolean }` for the current member |
| `GET /api/admin/reports` | — | Admin only: `{ items }`, latest 100 reported targets, each with id/kind/title/body/hidden/reportCount/reasons |
| `GET /api/admin/overview` | — | Admin only: aggregate members/suspendedMembers/posts/comments/hiddenPosts/hiddenComments/reportedItems counts |
| `GET /api/admin/content` | `?kind=posts\|comments&board=<slug>&visibility=all\|visible\|hidden&q=<text>&page=1` | Admin only: `{ items, hasMore }`, 20 items/page; content, username, board, date, visibility and parent post reference; no account IDs |
| `GET /api/admin/accounts` | `?q=<username>&page=1` | Admin only: `{ items, hasMore }`, 20 items/page; username, createdAt, suspended and isAdmin only |
| `PATCH /api/admin/accounts/[username]` | `{ suspended: boolean }` | Admin only: `{ success: true }`; protected admins return 403 |
| `PATCH /api/admin/{posts\|comments}/[id]` | `{ hidden: boolean }` | Admin only: `{ success: true }`; restore retains reports and never restores a hidden parent automatically |
| `DELETE /api/admin/reports/{posts\|comments}/[id]` | — | Admin only: `{ success: true }`; clears the target's reports without changing visibility; new reports can be submitted |
| `DELETE /api/admin/{posts\|comments}/[id]` | — | Admin only: `{ success: true }`, cascading deletion |

Shapes:
```ts
type Author = { username: string }
type PostSummary = { id: string; title: string; body: string; board: string; createdAt: string;
                     author: Author; commentCount: number; score: number; myVote: 'UP' | 'DOWN' | null; isMine: boolean }
type CommentView = { id: string; body: string; createdAt: string; author: Author; isMine: boolean }
```
`score = UP votes − DOWN votes`. `isMine` is computed on the server by comparing `userId` to the session; the raw ID is never sent.

JSON bodies over 20 KiB return 413 before parsing. Middleware rejects POST/DELETE/PATCH without the exact configured Origin (except NextAuth's own CSRF-protected subtree). Upstash limits per account: posts 5/hour, comments 20/hour, votes 60/min, username 5/hour; auth routes share 20/min per trusted Vercel IP. Rate rejections return JSON 429 and Retry-After; unavailable Redis fails closed with 503. Only namespaced HMAC identifiers go to Redis. The explicit development demo remains offline.

## 6. Privacy model — what is and isn't protected

**Protected**
- The database holds no email, name, picture, Google ID or IP. A leaked database alone cannot be linked to emails because the hash is keyed with `ANON_PEPPER`.
- JWT carries anonId, username and a non-identifying authPolicy version; the browser session exposes only its own account id, username and expiry. Old unrestricted tokens must sign in again.
- Public API responses never contain the anonId.

**Honest limits (do not claim more than this in the UI or README)**
- Google necessarily sees that you logged in. Vercel and Supabase infrastructure logs may contain IP addresses even though our app does not store them.
- Whoever has **both** the database and `ANON_PEPPER` plus a list of emails can test whether a given email has an account. Keep the pepper only in Vercel/Supabase-side env settings, never in git, and limit who can access them.
- Anonymity is also behavioural: writing style, timing and details in posts can identify someone.
- `ANON_PEPPER` must never change after launch. Losing it = every user gets a new identity.

## 7. Environment variables

| Name | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `NEXTAUTH_SECRET` | signs/encrypts the JWT (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | `http://localhost:3000` locally, the Vercel URL in production |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Next.js only: shared rate limits |
| `ADMIN_ANON_IDS` | FastAPI only: comma-separated 32-character anonymous account IDs; empty disables admin access |
| `ADMIN_LOGIN_ACCOUNT_ID` | Both services: privately configured random synthetic operator ID |
| `ADMIN_LOGIN_ENABLED`, `ADMIN_LOGIN_VERSION` | Next.js only: explicit production operator-login flag and revocable session version |
| `ADMIN_LOGIN_USERNAME`, `ADMIN_LOGIN_PASSWORD_HASH` | FastAPI only: dedicated username and salted scrypt verifier; no plaintext password |
| `ANON_PEPPER` | HMAC key for anonymous IDs (`openssl rand -hex 32`, min 32 chars) |
| `ALLOWED_EMAIL_DOMAIN` | rkgit.edu.in; fixed in code, cannot broaden access |
| `DATABASE_URL` | Supabase pooled connection (runtime, serverless-friendly) |
| `DIRECT_URL` | Supabase direct/session connection (used by `prisma db push`) |

Secrets live in `.env` locally (git-ignored; Next.js and the Prisma CLI both read it) and in Vercel's dashboard in production. `.env.example` lists names only.

## 8. Security checklist (verify before launch)

- [ ] `.env` is git-ignored; `git log -p | grep -i secret` finds nothing real
- [ ] No API response contains `userId`
- [ ] Every mutating route checks the session and validates with zod
- [ ] Delete checks ownership on the server
- [ ] No `dangerouslySetInnerHTML` anywhere
- [ ] `/api/auth/session` returns only `user.id`, `user.username` and `expires`
- [ ] Production `NEXTAUTH_URL` and Google redirect URI match exactly
