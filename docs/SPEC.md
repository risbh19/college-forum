# College Forum — Product & API Spec

Source of truth for what we are building. If code and this file disagree, fix one of them in the same commit.

## 1. Goal

A Reddit-style forum for one college where people can post and comment **anonymously**. Google login proves "this is a real person (from our college)", but the database must never be able to answer "who is shadowcoder42?".

## 2. Decisions (change here first, then in code)

| Topic | Decision |
|---|---|
| Who can read | Logged-in users only (keeps the forum inside the college). |
| Who can log in | Any verified Google account, or only `@ALLOWED_EMAIL_DOMAIN` if that env var is set. |
| Identity | `anonId = HMAC-SHA256(ANON_PEPPER, lowercase(email))`, first 32 hex chars. |
| Public name | Username chosen once, 3–20 chars `[a-zA-Z0-9_]`, unique case-insensitively, not changeable in v1. |
| Boards | Fixed list in `lib/boards.ts`: general, cse, hostel, placements, confessions. |
| Votes | One vote per user per post: UP or DOWN. Clicking the same vote again removes it. |
| Deleting | Authors can delete their own posts (comments/votes cascade). No editing in v1. |
| Out of scope (v1) | Moderation tools, image uploads, comment voting, nested replies, notifications, username change, account deletion UI. |

## 3. Data model

```
User     id (anonId, PK) · username · usernameLower (unique) · createdAt
Post     id (cuid) · title · body · board · userId → User · createdAt
Comment  id (cuid) · body · postId → Post · userId → User · createdAt
Vote     (userId, postId) composite PK · type UP|DOWN
```
All foreign keys use `onDelete: Cascade`. Indexes: `Post(board, createdAt)`, `Post(createdAt)`, `Comment(postId, createdAt)`, `Vote(postId)`.

## 4. Auth flow

1. `/login` → Google OAuth (scopes: `openid email profile`, nothing more).
2. `signIn` callback: reject if no email, email not verified, or domain not allowed.
3. `jwt` callback (first request after sign-in): compute `anonId` from `profile.email`, look up username, return a **fresh** token `{ anonId, username }`. Email, name, picture and Google ID are dropped here.
4. `session` callback: rebuild the session as `{ user: { id: anonId, username } }`.
5. `middleware.ts`: not logged in → `/login` (API: 401). Logged in without username → `/setup-username` (API: 403). Fully set up → `/login` and `/setup-username` redirect to `/`.
6. `/setup-username` POSTs `/api/username`, then calls `update()` from `useSession()` so the JWT picks up the username, then navigates to `/`.

Why `middleware.ts` instead of `pages.newUser`: with JWT sessions and no database adapter NextAuth never flags a user as "new", so `newUser` never fires.

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

Shapes:
```ts
type Author = { username: string }
type PostSummary = { id: string; title: string; body: string; board: string; createdAt: string;
                     author: Author; commentCount: number; score: number; myVote: 'UP' | 'DOWN' | null; isMine: boolean }
type CommentView = { id: string; body: string; createdAt: string; author: Author; isMine: boolean }
```
`score = UP votes − DOWN votes`. `isMine` is computed on the server by comparing `userId` to the session; the raw ID is never sent.

## 6. Privacy model — what is and isn't protected

**Protected**
- The database holds no email, name, picture, Google ID or IP. A leaked database alone cannot be linked to emails because the hash is keyed with `ANON_PEPPER`.
- JWT/session carry only `anonId` and `username`.
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
| `ANON_PEPPER` | HMAC key for anonymous IDs (`openssl rand -hex 32`, min 32 chars) |
| `ALLOWED_EMAIL_DOMAIN` | optional, e.g. `college.edu` |
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
