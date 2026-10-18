# College Forum — Codex Build Plan

Ek step = ek file = ek Codex prompt = ek commit. Isse GitHub history clean rehti hai aur kuch toot jaye toh sirf ek commit revert karna padta hai.

Pehle `AGENTS.md` aur `docs/SPEC.md` padh lo — Codex har task ki shuruaat mein `AGENTS.md` khud padh leta hai, isliye prompts chhote hain.

---

## How every step works

```
1. Codex ko repo root mein kholo (new thread)       → AGENTS.md auto-load hoti hai
2. Step ka prompt paste karo
3. git status && git diff                           → sirf expected file badli ho
4. Check command chalao (typecheck / lint / browser)
5. git add <file> && git commit -m "..." && git push
```

**Commit/push tum khud karo, Codex se nahi.** Codex ka sandbox default mein network band rakhta hai aur git update/network jaise kaam approval maangte hain (workspace-write mode). Windows pe kuch setups mein Codex `.git` mein likh hi nahi pata ya HTTPS push fail hota hai — isliye "Codex file likhe, tum review karke commit karo" sabse safe aur reliable hai. Isse tum har diff khud dekhte ho, jo security-sensitive project mein zaroori hai.

**Rules**
- Har naye step ke liye fresh Codex thread kholo; purane thread ka context mat ghasito.
- Codex ne extra file chhedi? `git restore <file>` ya `git checkout -- <file>` karo, commit mat karo.
- `.env` kabhi Codex ko mat dikhao, kabhi prompt mein secret paste mat karo.
- Check fail ho toh Codex ko error paste karke bolo "fix only this error, don't touch other files", phir wapas check.
- Commit messages: `feat:` `fix:` `chore:` `docs:`.
- Project Linux home mein rakho (`~/projects/college-forum`), `/mnt/c/...` mein nahi — slow hota hai aur permissions ke issues aate hain.

---

# PHASE A — Accounts aur machine setup (koi commit nahi)

### A1. Git identity (WSL terminal)

```bash
git --version
git config --global user.name "Your Name"
git config --global user.email "<GitHub noreply email>"
git config --global init.defaultBranch main
git config --global --list | grep -E "user|defaultBranch"
```

Commit email **public history mein dikhta hai**. Anonymous-forum project hai, toh apna asli email commits mein mat daalo: GitHub → Settings → Emails → "Keep my email addresses private" ON karo aur wahan dikhne wala `ID+username@users.noreply.github.com` address yahan use karo. Saath mein "Block command line pushes that expose my email" bhi ON kar do.

### A2. GitHub se login (SSH — WSL mein sabse seedha)

```bash
ssh-keygen -t ed25519 -C "college-forum"          # Enter, Enter, Enter
cat ~/.ssh/id_ed25519.pub                          # poora output copy karo
```
GitHub → Settings → SSH and GPG keys → New SSH key → paste → Save. Phir:
```bash
ssh -T git@github.com     # "Hi <username>! You've successfully authenticated" aana chahiye
```
(Alternative: `gh auth login` agar GitHub CLI installed hai.)

### A3. GitHub repo banao

github.com → New repository → name `college-forum` → **Private** (launch tak) → **README / .gitignore / license kuch add mat karo** (empty repo chahiye) → Create.

### A4. Supabase project

1. supabase.com → New project → region apne paas ka (India ke liye Mumbai) → strong DB password (password manager mein save).
2. Project ke **Connect** button se do connection strings lo:
   - `DATABASE_URL` → **Transaction pooler** (port 6543). End mein `?pgbouncer=true` add karo.
   - `DIRECT_URL` → **Direct connection** (port 5432). Agar IPv6/"can't reach" error aaye toh **Session pooler** string use karo.
3. Dono abhi kisi file mein mat daalo — Phase B mein `.env` mein jayengi.

### A5. Google OAuth client

Google Cloud Console → naya project → APIs & Services → OAuth consent screen / Google Auth Platform (naam update hota rehta hai) → External → app name "College Forum" → sirf default scopes (email, profile, openid). Phir Credentials → Create credentials → OAuth client ID → **Web application**:
- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

Client ID aur secret save karo. (Production URL deploy ke time add karenge.) Testing mode mein sirf "Test users" login kar sakte hain — apna aur dost ka Gmail wahan add karo.

### A6. Secrets generate karo

```bash
openssl rand -base64 32     # → NEXTAUTH_SECRET
openssl rand -hex 32        # → ANON_PEPPER
```
**`ANON_PEPPER` ko password manager mein backup karo.** Ye kabhi change/lose hua toh har user ki identity badal jayegi (sab accounts aur posts orphan).

### A7. Codex ready hai? (project folder ban jaye uske baad Step 1 ke baad check karna)

```bash
codex --ask-for-approval never "Summarize the current instructions."
```
Codex ko `AGENTS.md` ki baatein (stack, privacy rules) quote karni chahiye. Nahi kar raha toh file ka naam exactly `AGENTS.md` (capital) hona chahiye aur Codex ko repo root se start karo.

---

# PHASE B — Project bootstrap

### Step 1 — Scaffold + GitHub se connect (scaffold hi pehla commit hai)

Next.js ka latest version ab 14 se aage hai, isliye version **pin** kiya hai:

```bash
mkdir -p ~/projects && cd ~/projects
npx create-next-app@14.2.35 college-forum --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
cd college-forum
git log --oneline          # "Initial commit from Create Next App" dikhna chahiye
git branch -M main
git remote add origin git@github.com:<your-github-username>/college-forum.git
git push -u origin main
```
`git log` khali aaye toh Git identity (A1) set nahi thi: `git add -A && git commit -m "chore: scaffold Next.js 14 app"` karo.

Note: scaffold `next.config.mjs` banata hai (doc ke `next.config.js` ki jagah) aur `app/page.tsx` default home page bhi — wo hum Step 36 pe hatayenge.

### Step 2 — `.gitignore` (secrets leak rokna)

Scaffold ka `.gitignore` sirf `.env*.local` ignore karta hai, **`.env` nahi**. Hum `.env` use karenge (Next.js aur Prisma CLI dono padhte hain), isliye ye pehla fix hai.

**Prompt**
```text
Edit only .gitignore. Add a section at the bottom:

# secrets
.env
.env.*
!.env.example

Do not change anything else.
```
**Check**
```bash
touch .env && git check-ignore -v .env     # rule dikhna chahiye
```
**Commit**
```bash
git add .gitignore && git commit -m "chore: ignore .env files" && git push
```

### Step 3 — `.env.example`

**Prompt**
```text
Create .env.example with exactly these variable names and EMPTY values, with one short comment above each explaining it:
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL (comment: http://localhost:3000 locally),
ANON_PEPPER (comment: openssl rand -hex 32, min 32 chars, never change after launch),
ALLOWED_EMAIL_DOMAIN (comment: optional, e.g. college.edu),
DATABASE_URL (comment: Supabase pooled connection, ends with ?pgbouncer=true),
DIRECT_URL (comment: Supabase direct or session-pooler connection, used by prisma db push).
No real values. Touch no other file.
```
**Commit**
```bash
git add .env.example && git commit -m "chore: add .env.example" && git push
```

### Step 3b — Apna asli `.env` (kabhi commit nahi hota, Codex ke bina)

```bash
cp .env.example .env
nano .env          # A4/A5/A6 ki values bharo. NEXTAUTH_URL=http://localhost:3000
git status         # .env dikhna NAHI chahiye
```

### Step 4 — `AGENTS.md`

Is guide ke saath wali `AGENTS.md` repo root mein copy karo.
```bash
git add AGENTS.md && git commit -m "docs: add AGENTS.md for Codex" && git push
```
Ab A7 ka `codex ... "Summarize the current instructions."` check chala lo.

### Step 5 — `docs/SPEC.md`

```bash
mkdir -p docs   # SPEC.md ko docs/ mein copy karo
git add docs/SPEC.md && git commit -m "docs: add product and API spec" && git push
```

### Step 6 — `docs/BUILD_PLAN.md`

```bash
git add docs/BUILD_PLAN.md && git commit -m "docs: add Codex build plan" && git push
```

### Step 7 — Dependencies (manual, Codex nahi)

Versions pinned hain: next-auth **v4**, Prisma **6** (latest tags alag major versions de sakte hain jo is code se compatible nahi).

```bash
npm install next-auth@4.24.15 @prisma/client@6.19.3 zod
npm install -D prisma@6.19.3
npm run lint     # abhi pass hona chahiye
```
**Commit** (do files, ek hi logical change)
```bash
git add package.json package-lock.json && git commit -m "chore: add next-auth, prisma and zod" && git push
```

---

# PHASE C — Database aur identity layer

### Step 8 — `prisma/schema.prisma`

`prisma init` mat chalao — wo apna `.env` banata hai. Schema seedha banwao.

**Prompt**
````text
Create prisma/schema.prisma using exactly this content, nothing else:

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum VoteType {
  UP
  DOWN
}

model User {
  id            String    @id // anonymous ID: HMAC(email) first 32 hex chars. Never an email.
  username      String
  usernameLower String    @unique // case-insensitive uniqueness, prevents impersonation
  createdAt     DateTime  @default(now())

  posts    Post[]
  comments Comment[]
  votes    Vote[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  body      String
  board     String
  userId    String
  createdAt DateTime @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  comments Comment[]
  votes    Vote[]

  @@index([board, createdAt])
  @@index([createdAt])
}

model Comment {
  id        String   @id @default(cuid())
  body      String
  postId    String
  userId    String
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([postId, createdAt])
}

model Vote {
  userId String
  postId String
  type   VoteType

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@id([userId, postId])
  @@index([postId])
}
````
**Check** (ye commands khud chalao)
```bash
npx prisma validate
npx prisma generate
npx prisma db push        # Supabase mein tables ban jayenge
```
Supabase → Table Editor mein `User`, `Post`, `Comment`, `Vote` dikhne chahiye. `User` mein email jaisa koi column nahi.

**Ek baar ka SQL (commit nahi):** Supabase → SQL Editor mein chalao. Supabase tables ko auto REST API se expose karta hai; RLS on karne se wo raasta band ho jata hai (Prisma `postgres` role se connect hota hai, uspe asar nahi padta).
```sql
alter table "User" enable row level security;
alter table "Post" enable row level security;
alter table "Comment" enable row level security;
alter table "Vote" enable row level security;
```
**Commit**
```bash
git add prisma/schema.prisma && git commit -m "feat(db): add Prisma schema" && git push
```

### Step 9 — `package.json` scripts

**Prompt**
```text
Edit only package.json. In "scripts" add these three entries and keep all existing ones:
"typecheck": "tsc --noEmit",
"postinstall": "prisma generate",
"db:push": "prisma db push"
Do not touch dependencies or the lockfile.
```
(`postinstall` Vercel pe zaroori hai: wahan Prisma client build se pehle generate hona chahiye.)

**Check**: `npm run typecheck` → pass.
```bash
git add package.json && git commit -m "chore: add typecheck, postinstall and db:push scripts" && git push
```

### Step 10 — `lib/db.ts`

**Prompt**
````text
Create lib/db.ts exporting a singleton PrismaClient named `prisma` that survives Next.js hot reloads (store it on globalThis in development only). Use exactly:

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
````
**Check**: `npm run typecheck`
```bash
git add lib/db.ts && git commit -m "feat(lib): add Prisma client singleton" && git push
```

### Step 11 — `lib/hash.ts` (privacy ka dil)

Doc mein plain SHA256 tha. College emails guessable hote hain (`rollno@college.edu`) — koi bhi emails ki list hash karke database ke IDs se match kar leta aur sab ki identity khul jaati. Fix: secret key (`ANON_PEPPER`) ke saath HMAC, aur 16 ki jagah 32 chars.

**Prompt**
````text
Create lib/hash.ts with exactly this content:

import { createHmac } from 'crypto'

/**
 * Email -> permanent anonymous ID.
 * HMAC-SHA256 keyed with a server-side secret (ANON_PEPPER), NOT plain SHA256:
 * plain hashes of guessable college emails can be reversed by hashing a list of emails.
 */
export function emailToAnonId(email: string): string {
  const pepper = process.env.ANON_PEPPER
  if (!pepper || pepper.length < 32) {
    throw new Error('ANON_PEPPER is missing or shorter than 32 characters')
  }
  return createHmac('sha256', pepper)
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 32)
}
````
**Check**: `npm run typecheck`, phir
```bash
set -a; . ./.env; set +a
npx --yes tsx -e "import {emailToAnonId} from './lib/hash'; console.log(emailToAnonId('Test@College.edu '), emailToAnonId('test@college.edu'))"
```
Dono hash **same** aane chahiye (case/space ka farq nahi) — 32 hex chars.
```bash
git add lib/hash.ts && git commit -m "feat(lib): add keyed HMAC anonymous ID" && git push
```

### Step 12 — `lib/boards.ts`

**Prompt**
````text
Create lib/boards.ts with exactly:

export const BOARDS = [
  { slug: 'general', label: 'General' },
  { slug: 'cse', label: 'CSE' },
  { slug: 'hostel', label: 'Hostel' },
  { slug: 'placements', label: 'Placements' },
  { slug: 'confessions', label: 'Confessions' },
] as const

export type BoardSlug = (typeof BOARDS)[number]['slug']
export const BOARD_SLUGS = BOARDS.map((b) => b.slug) as [BoardSlug, ...BoardSlug[]]
````
```bash
npm run typecheck && git add lib/boards.ts && git commit -m "feat(lib): add board list" && git push
```

### Step 13 — `lib/validators.ts`

**Prompt**
````text
Create lib/validators.ts with zod schemas. Use exactly:

import { z } from 'zod'
import { BOARD_SLUGS } from './boards'

export const RESERVED_USERNAMES = ['admin', 'administrator', 'moderator', 'mod', 'support', 'deleted', 'anonymous', 'system', 'staff']

export const usernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, '3-20 characters: letters, numbers, underscore only')
  .refine((u) => !RESERVED_USERNAMES.includes(u.toLowerCase()), 'This username is reserved')

export const postSchema = z.object({
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(1).max(10000),
  board: z.enum(BOARD_SLUGS),
})

export const commentSchema = z.object({
  postId: z.string().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
})

export const voteSchema = z.object({
  postId: z.string().min(1).max(40),
  type: z.enum(['UP', 'DOWN']),
})
````
```bash
npm run typecheck && git add lib/validators.ts && git commit -m "feat(lib): add zod validators" && git push
```

### Step 14 — `types/next-auth.d.ts`

Session aur JWT ko typed banata hai (`session.user.id`, `session.user.username`).

**Prompt**
````text
Create types/next-auth.d.ts with exactly:

import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    anonId?: string
    username?: string | null
  }
}
````
```bash
npm run typecheck && git add types/next-auth.d.ts && git commit -m "feat(types): type NextAuth session and JWT" && git push
```

### Step 15 — `lib/auth.ts` (sabse sensitive file — diff line-by-line padho)

Doc ke code mein 3 problems thi, jo source se verify ki:
1. NextAuth v4 default JWT mein `name`, `email`, `picture` aur `sub` (= **Google ka user ID**) pehle se daal deta hai. `signIn` mein `user.email = ''` karna isse bharosemand tareeke se nahi rokta. Fix: `jwt` callback mein **naya token object** return karo.
2. JWT sirf login ke time banta hai — username baad mein set hone par token mein purana (khali) rehta. Fix: `update()` trigger + khali username par DB se refresh.
3. `pages.newUser` JWT-only setup mein kabhi fire nahi hota (adapter nahi hai toh user "new" mark hi nahi hota). Fix: Step 17 ka `middleware.ts`.

**Prompt**
````text
Create lib/auth.ts exporting `authOptions: NextAuthOptions` (next-auth v4). Use exactly this code:

import type { NextAuthOptions } from 'next-auth'
import GoogleProvider, { type GoogleProfile } from 'next-auth/providers/google'
import { emailToAnonId } from './hash'
import { prisma } from './db'

async function usernameFor(anonId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: anonId },
    select: { username: true },
  })
  return row?.username ?? null
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },

  callbacks: {
    async signIn({ profile }) {
      const p = profile as GoogleProfile | undefined
      if (!p?.email || !p.email_verified) return false

      // Optional: restrict to one college domain, e.g. ALLOWED_EMAIL_DOMAIN=rkgit.edu.in
      const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase()
      if (domain && !p.email.toLowerCase().endsWith('@' + domain)) return false

      return true
    },

    async jwt({ token, profile, trigger }) {
      // `profile` exists only on the sign-in request. The default token already holds the
      // real email, name, picture and Google ID, so return a brand-new object instead.
      if (profile?.email) {
        const anonId = emailToAnonId(profile.email)
        return { anonId, username: await usernameFor(anonId) }
      }

      // Refresh username after setup-username (client calls update()) or while still unset.
      if (token.anonId && (trigger === 'update' || !token.username)) {
        token.username = await usernameFor(token.anonId)
      }
      return token
    },

    async session({ session, token }) {
      // Rebuild the session from scratch so no email/name/image can ever leak into it.
      return {
        expires: session.expires,
        user: { id: token.anonId as string, username: token.username ?? null },
      }
    },
  },

  pages: { signIn: '/login' },
}

Do not add a `newUser` page. Do not log anything.
````
**Check**: `npm run typecheck`
```bash
git add lib/auth.ts && git commit -m "feat(auth): NextAuth config with anonymous JWT" && git push
```

### Step 16 — `app/api/auth/[...nextauth]/route.ts`

**Prompt**
````text
Create app/api/auth/[...nextauth]/route.ts with exactly:

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
````
(`authOptions` alag file mein isliye hai ki Next.js route file se extra export allow nahi karta.)
```bash
npm run typecheck && git add "app/api/auth/[...nextauth]/route.ts" && git commit -m "feat(auth): add NextAuth route handler" && git push
```

### Step 17 — `middleware.ts`

Login-gate aur username-redirect ek hi jagah. Reading bhi login ke peeche hai (SPEC §2).

**Prompt**
````text
Create middleware.ts in the project root with exactly:

import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api')

  // NextAuth's own endpoints must always be reachable.
  if (pathname.startsWith('/api/auth')) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // 1. Not logged in
  if (!token?.anonId) {
    if (pathname === '/login') return NextResponse.next()
    if (isApi) return NextResponse.json({ error: 'Login required' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 2. Logged in, no username yet
  if (!token.username) {
    if (pathname === '/setup-username' || pathname === '/api/username') {
      return NextResponse.next()
    }
    if (isApi) return NextResponse.json({ error: 'Set a username first' }, { status: 403 })
    return NextResponse.redirect(new URL('/setup-username', req.url))
  }

  // 3. Fully set up: keep them out of the onboarding pages
  if (pathname === '/login' || pathname === '/setup-username') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
````
**Check**: `npm run typecheck && npm run lint`
```bash
git add middleware.ts && git commit -m "feat(auth): gate app behind login and username setup" && git push
```

---

# PHASE D — Login aur username UI

### Step 18 — `app/providers.tsx`

**Prompt**
```text
Create app/providers.tsx: a client component ('use client') that exports default function Providers({ children }: { children: React.ReactNode }) and wraps children in SessionProvider from 'next-auth/react'. Nothing else.
```
```bash
npm run typecheck && git add app/providers.tsx && git commit -m "feat(ui): add SessionProvider wrapper" && git push
```

### Step 19 — `app/layout.tsx` (existing file edit)

**Prompt**
```text
Edit only app/layout.tsx. Keep the existing font setup. Set metadata title to "College Forum" and description to "An anonymous forum for our college". Wrap {children} inside the <Providers> component from '@/app/providers'. Body classes: "bg-slate-50 text-slate-900 antialiased". Do not add anything else.
```
**Check**: `npm run typecheck && npm run lint`
```bash
git add app/layout.tsx && git commit -m "feat(ui): wrap app in Providers and set metadata" && git push
```

### Step 20 — `components/auth/GoogleLoginButton.tsx`

**Prompt**
```text
Create components/auth/GoogleLoginButton.tsx: a client component with a single button "Continue with Google" that calls signIn('google', { callbackUrl: '/' }) from 'next-auth/react'. Tailwind: white button, slate border, rounded-lg, px-4 py-2, hover:bg-slate-50, full width. Disable the button and show "Redirecting…" after click. No icons/images from external URLs.
```
```bash
npm run typecheck && git add components/auth/GoogleLoginButton.tsx && git commit -m "feat(auth): add Google login button" && git push
```

### Step 21 — `app/(auth)/login/page.tsx`

**Prompt**
```text
Create app/(auth)/login/page.tsx (server component, default export). Centered card (max-w-sm) with the title "College Forum", one line "Post anonymously. Log in once with Google.", the GoogleLoginButton, and a small grey privacy note:
"We don't store your email, name, photo or IP in our database. Only a keyed anonymous ID and the username you choose. Google still knows you logged in, and our hosting provider's logs may include IP addresses."
Do not claim stronger anonymity than that. No images.
```
```bash
npm run typecheck && git add "app/(auth)/login/page.tsx" && git commit -m "feat(auth): add login page" && git push
```

### Step 22 — `app/api/username/route.ts`

**Prompt**
```text
Create app/api/username/route.ts exporting POST (Next 14 route handler). Behavior, in order:
1. getServerSession(authOptions); no session → 401 { error: 'Login required' }.
2. If session.user.username is already set → 409 { error: 'Username already set' }.
3. Parse JSON body safely (invalid JSON → 400). Validate body.username with usernameSchema from '@/lib/validators'. On failure → 400 { error: <first zod message> }.
4. prisma.user.create({ data: { id: session.user.id, username, usernameLower: username.toLowerCase() }, select: { username: true } }).
5. Catch Prisma errors: code 'P2002' → 409 { error: 'Username already taken' }. Any other error → 500 { error: 'Something went wrong' } (never return the raw error, never log the request body).
6. Success → 200 { username }.
Never read or return any email/name.
```
**Check**: `npm run typecheck && npm run lint`
```bash
git add app/api/username/route.ts && git commit -m "feat(api): add username setup endpoint" && git push
```

### Step 23 — `app/setup-username/page.tsx`

**Prompt**
```text
Create app/setup-username/page.tsx as a client component. Centered card: title "Choose your username", helper text "This is your only public identity. 3-20 characters: letters, numbers, underscore. You can't change it later.", one text input, a submit button, and an inline error message area.
On submit: POST /api/username with { username }. If response is not ok, show the error from JSON. If ok: call `await update()` from useSession() (so the JWT picks up the new username), then `window.location.href = '/'` (hard navigation so middleware sees the new cookie). Disable the button while submitting. Client-side pre-check with the same regex /^[a-zA-Z0-9_]{3,20}$/ for fast feedback, but the server is the source of truth.
```
**Commit**
```bash
npm run typecheck && npm run lint
git add app/setup-username/page.tsx && git commit -m "feat(auth): add username setup page" && git push
```

## ✅ Checkpoint 1 — Login flow manual test

```bash
npm run dev
```
1. `http://localhost:3000` → `/login` pe redirect hona chahiye.
2. Google se login → `/setup-username`. (`redirect_uri_mismatch` aaye toh A5 ke URI check karo.)
3. Username daalo → `/` pe pahunch jao (abhi Next.js ka default page dikhega — theek hai).
4. Browser mein `http://localhost:3000/api/auth/session` kholo. Sirf ye dikhna chahiye:
   `{"user":{"id":"<32 hex>","username":"..."},"expires":"..."}` — **email/name/image kuch nahi**.
5. Supabase → `User` table mein ek row: `id`, `username`, `usernameLower`, `createdAt` — email nahi.
6. Dobara `/login` kholo → `/` pe redirect. Incognito mein `/api/username` direct kholo → `401`.

Koi bhi step fail ho toh aage mat badho. Fix commit karo: `fix(auth): ...`.

---

# PHASE E — Data layer aur API

### Step 24 — `types/index.ts`

Server aur client dono ye shapes share karte hain (SPEC §5). `userId` in types mein hai hi nahi — taaki galti se leak na ho.

**Prompt**
````text
Create types/index.ts with exactly:

export type VoteValue = 'UP' | 'DOWN'

export type Author = { username: string }

export type PostSummary = {
  id: string
  title: string
  body: string
  board: string
  createdAt: string // ISO string
  author: Author
  commentCount: number
  score: number // UP minus DOWN
  myVote: VoteValue | null
  isMine: boolean
}

export type CommentView = {
  id: string
  body: string
  createdAt: string // ISO string
  author: Author
  isMine: boolean
}

export type PostsPage = { posts: PostSummary[]; nextCursor: string | null }
````
```bash
npm run typecheck && git add types/index.ts && git commit -m "feat(types): add shared API types" && git push
```

### Step 25 — `lib/time.ts`

**Prompt**
```text
Create lib/time.ts exporting `timeAgo(iso: string): string` using Intl.RelativeTimeFormat('en', { numeric: 'auto' }). Pick the largest sensible unit (seconds → minutes → hours → days → weeks → months → years). Under 45 seconds return "just now". Pure function, no dependencies.
```
```bash
npm run typecheck && git add lib/time.ts && git commit -m "feat(lib): add timeAgo helper" && git push
```

### Step 26 — `lib/queries.ts` (leak-proof reads)

Ye file sirf server pe use hogi aur API routes + server pages dono isi se padhenge — ek hi jagah privacy logic.

**Prompt**
```text
Create lib/queries.ts (server-side only, uses prisma from '@/lib/db'). Export these functions, all returning types from '@/types':

- listPosts({ viewerId, board?, cursor? }): Promise<PostsPage>
    * Prisma findMany with orderBy [{ createdAt: 'desc' }, { id: 'desc' }], take 21, and if cursor: cursor { id: cursor }, skip 1. If board is given filter by it.
    * Use `select` (NOT include): id, title, body, board, createdAt, userId, user: { select: { username: true } }, _count: { select: { comments: true } }.
    * If 21 rows came back, nextCursor = id of the 20th row and return only 20, else nextCursor null.
    * Votes: ONE prisma.vote.groupBy({ by: ['postId','type'], _count: { _all: true }, where: { postId: { in: ids } } }) to compute score = UP - DOWN per post, and ONE prisma.vote.findMany({ where: { userId: viewerId, postId: { in: ids } }, select: { postId: true, type: true } }) for myVote. No queries inside loops.
- getPost(id, viewerId): Promise<PostSummary | null> (same select + vote logic for one post).
- listComments(postId, viewerId): Promise<CommentView[]> ordered by createdAt asc, select: id, body, createdAt, userId, user: { select: { username: true } }.
- getVoteState(postId, viewerId): Promise<{ score: number; myVote: VoteValue | null }>.

Privacy: `userId` is selected ONLY to compute `isMine = row.userId === viewerId`. Build every response object with an explicit mapping function (toPostSummary / toCommentView) — never spread a Prisma row into the result, and never include userId in any returned object. createdAt must be returned as createdAt.toISOString().
```
**Check**: `npm run typecheck`. Diff mein dhundo: `grep -n "userId" lib/queries.ts` — har occurrence `select`, `where` ya `isMine` comparison mein ho, return object mein nahi.
```bash
git add lib/queries.ts && git commit -m "feat(lib): add leak-proof post/comment/vote queries" && git push
```

### Step 27 — `app/api/posts/route.ts`

Doc ke GET mein `include` use hua tha — wo Post ka scalar `userId` bhi bahar bhej deta (permanent anonymous ID public ho jaati). Ab `lib/queries.ts` se.

**Prompt**
```text
Create app/api/posts/route.ts with GET and POST (Next 14 route handlers).
Both: session = getServerSession(authOptions); no session → 401 { error }; no session.user.username → 403 { error }.
GET: read ?board and ?cursor from req.url. If board is present it must be one of BOARD_SLUGS else 400. Return Response.json(await listPosts({ viewerId: session.user.id, board, cursor })).
POST: parse JSON safely (invalid → 400). Validate with postSchema; failure → 400 { error: first zod message }. prisma.post.create({ data: { title, body, board, userId: session.user.id }, select: { id: true } }), then return status 201 with await getPost(created.id, session.user.id). Never read userId from the request body. Wrap in try/catch → 500 { error: 'Something went wrong' }.
```
```bash
npm run typecheck && npm run lint
git add app/api/posts/route.ts && git commit -m "feat(api): add posts list and create endpoints" && git push
```

### Step 28 — `app/api/posts/[id]/route.ts`

**Prompt**
```text
Create app/api/posts/[id]/route.ts with GET and DELETE. Next 14 signature: (req: Request, { params }: { params: { id: string } }) — params is a plain object, not a Promise.
Both require a session with a username (401/403 like the other routes).
GET: getPost(params.id, session.user.id); null → 404 { error: 'Post not found' }; else Response.json(post).
DELETE: prisma.post.findUnique({ where: { id: params.id }, select: { userId: true } }); not found → 404; if row.userId !== session.user.id → 403 { error: 'Not your post' }; else prisma.post.delete and return { success: true }. Ownership must be checked on the server.
```
```bash
npm run typecheck && git add "app/api/posts/[id]/route.ts" && git commit -m "feat(api): add get/delete single post endpoints" && git push
```

### Step 29 — `app/api/comments/route.ts`

**Prompt**
```text
Create app/api/comments/route.ts with GET and POST. Both require session + username (401/403).
GET: ?postId is required (400 if missing). Return { comments: await listComments(postId, session.user.id) }.
POST: parse JSON safely, validate with commentSchema (400 with first zod message). Check the post exists (prisma.post.findUnique select id) else 404. Create the comment with userId from the session, select id only, then return status 201 with the matching CommentView — build it by calling listComments(postId, viewerId) and picking the created one, or by an explicit mapping. Never return userId.
```
```bash
npm run typecheck && git add app/api/comments/route.ts && git commit -m "feat(api): add comments endpoints" && git push
```

### Step 30 — `app/api/votes/route.ts`

**Prompt**
```text
Create app/api/votes/route.ts with POST only. Requires session + username. Validate body with voteSchema (400 on failure). Check the post exists (404).
Logic: existing = prisma.vote.findUnique({ where: { userId_postId: { userId, postId } } }).
- no existing → create { userId, postId, type }
- existing with the SAME type → delete it (toggle off)
- existing with a DIFFERENT type → update the type
The `type` in the body is the string 'UP' | 'DOWN' which matches the Prisma enum VoteType.
Return Response.json(await getVoteState(postId, userId)). Handle errors with 500 { error: 'Something went wrong' }.
```
**Check**: `npm run typecheck && npm run lint && npm run build`
```bash
git add app/api/votes/route.ts && git commit -m "feat(api): add vote toggle endpoint" && git push
```

## ✅ Checkpoint 2 — API ka sanity check

`npm run build` pass hona chahiye. Phir `npm run dev` chala ke, login rakhte hue browser DevTools console mein:
```js
await (await fetch('/api/posts', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Hello',body:'First post',board:'general'})})).json()
await (await fetch('/api/posts')).json()
```
Response mein **`userId` kahin nahi** dikhna chahiye (search karo). `isMine: true` dikhna chahiye. Galat board (`board:'nope'`) → `400`.

---

# PHASE F — UI

### Step 31 — `components/ui/BoardBadge.tsx`

**Prompt**
```text
Create components/ui/BoardBadge.tsx: takes prop `slug: string`, finds the label in BOARDS from '@/lib/boards' (fallback: show the slug), renders a small rounded pill (bg-slate-200 text-slate-700 text-xs px-2 py-0.5) as a next/link to `/board/${slug}`.
```
```bash
npm run typecheck && git add components/ui/BoardBadge.tsx && git commit -m "feat(ui): add BoardBadge" && git push
```

### Step 32 — `components/ui/VoteButton.tsx`

**Prompt**
```text
Create components/ui/VoteButton.tsx (client component). Props: postId, initialScore, initialMyVote ('UP'|'DOWN'|null) using VoteValue from '@/types'. Vertical layout: ▲ button, score number, ▼ button. Optimistic update: clicking UP when myVote is UP removes the vote; clicking the other direction switches it; adjust the displayed score accordingly. Then POST /api/votes with { postId, type }. Replace local state with the server's { score, myVote } response; if the request fails, roll back to the previous state. Highlight the active arrow (orange for UP, blue for DOWN). Disable buttons while a request is in flight. aria-labels "Upvote" / "Downvote".
```
```bash
npm run typecheck && npm run lint
git add components/ui/VoteButton.tsx && git commit -m "feat(ui): add VoteButton with optimistic updates" && git push
```

### Step 33 — `components/ui/Navbar.tsx`

**Prompt**
```text
Create components/ui/Navbar.tsx (client component). Sticky top bar, white, border-b. Left: "College Forum" link to "/". Right: a "New post" link to "/create" styled as a small slate-900 button, the text `u/{username}` from useSession().data?.user.username, and a "Log out" button calling signOut({ callbackUrl: '/login' }) from 'next-auth/react'. Never display or use any email.
```
```bash
npm run typecheck && git add components/ui/Navbar.tsx && git commit -m "feat(ui): add Navbar" && git push
```

### Step 34 — `components/layout/Sidebar.tsx`

**Prompt**
```text
Create components/layout/Sidebar.tsx (server component, no hooks). Renders a "Boards" heading and a vertical list of links: "All" → "/", then each board in BOARDS from '@/lib/boards' → `/board/${slug}`. Hidden on small screens (hidden md:block), width w-48, sticky below the navbar.
```
```bash
npm run typecheck && git add components/layout/Sidebar.tsx && git commit -m "feat(ui): add Sidebar" && git push
```

### Step 35 — `app/(main)/layout.tsx`

**Prompt**
```text
Create app/(main)/layout.tsx: renders <Navbar /> then a container `mx-auto flex max-w-5xl gap-6 px-4 py-6` with <Sidebar /> and <main className="min-w-0 flex-1">{children}</main>.
```
```bash
npm run typecheck && git add "app/(main)/layout.tsx" && git commit -m "feat(ui): add main layout with navbar and sidebar" && git push
```

### Step 36 — Default home page hatao

Scaffold ka `app/page.tsx` aur hamara `app/(main)/page.tsx` dono `/` ko claim karenge → build error. Pehle purana hatao.

```bash
git rm app/page.tsx
git commit -m "chore: remove default Next.js home page" && git push
```

### Step 37 — `components/posts/PostCard.tsx`

**Prompt**
```text
Create components/posts/PostCard.tsx. Props: { post: PostSummary } from '@/types'. A white rounded-lg border card with VoteButton on the left (initialScore=post.score, initialMyVote=post.myVote) and on the right: BoardBadge, the title as a next/link to `/post/${post.id}` (font-semibold), the body preview (line-clamp-3, text-slate-600), and a footer "u/{author.username} · {timeAgo(createdAt)} · {commentCount} comments". Render all user text as plain JSX text; never use dangerouslySetInnerHTML.
```
```bash
npm run typecheck && npm run lint
git add components/posts/PostCard.tsx && git commit -m "feat(ui): add PostCard" && git push
```

### Step 38 — `components/posts/PostFeed.tsx`

**Prompt**
```text
Create components/posts/PostFeed.tsx (client component). Props: { initialPosts: PostSummary[]; initialCursor: string | null; board?: string }. Render PostCards in a vertical stack (space-y-3). If initialPosts is empty show "No posts yet. Be the first!". If there is a cursor show a "Load more" button that fetches `/api/posts?cursor=${cursor}${board ? `&board=${board}` : ''}`, appends the returned posts and updates the cursor; show loading state and an error message on failure.
```
```bash
npm run typecheck && git add components/posts/PostFeed.tsx && git commit -m "feat(ui): add PostFeed with load more" && git push
```

### Step 39 — `app/(main)/page.tsx` (home feed)

**Prompt**
```text
Create app/(main)/page.tsx (async server component). Get the session with getServerSession(authOptions) (middleware already guarantees login, but if session is missing call redirect('/login')). Call listPosts({ viewerId: session.user.id }) from '@/lib/queries' directly (no fetch to our own API) and render <h1>Home</h1> plus <PostFeed initialPosts initialCursor />.
```
**Check**: `npm run typecheck && npm run dev` → `/` pe tumhari Checkpoint-2 wali post dikhe, vote kaam kare.
```bash
git add "app/(main)/page.tsx" && git commit -m "feat(ui): add home feed" && git push
```

### Step 40 — `components/posts/PostForm.tsx`

**Prompt**
```text
Create components/posts/PostForm.tsx (client component). Props: { defaultBoard?: string }. Fields: board <select> (options from BOARDS, default defaultBoard or 'general'), title <input> (maxLength 150), body <textarea> (rows 8, maxLength 10000), submit "Post". Client checks mirror postSchema limits, but show server error text from the JSON response. On success: router.push(`/post/${post.id}`) using useRouter from 'next/navigation'. Disable while submitting.
```
```bash
npm run typecheck && git add components/posts/PostForm.tsx && git commit -m "feat(ui): add PostForm" && git push
```

### Step 41 — `app/(main)/create/page.tsx`

**Prompt**
```text
Create app/(main)/create/page.tsx (server component). Read searchParams.board (Next 14: searchParams is a plain object prop). Only pass it as defaultBoard if it is one of BOARD_SLUGS. Render <h1>Create a post</h1> and <PostForm defaultBoard={...} />.
```
```bash
npm run typecheck && git add "app/(main)/create/page.tsx" && git commit -m "feat(ui): add create post page" && git push
```

### Step 42 — `components/posts/DeletePostButton.tsx`

**Prompt**
```text
Create components/posts/DeletePostButton.tsx (client component). Prop: { postId: string }. A small red text button "Delete". On click: window.confirm('Delete this post and all its comments?'); if confirmed DELETE `/api/posts/${postId}`; on success router.push('/') and router.refresh(); on failure show the error text from JSON.
```
```bash
npm run typecheck && git add components/posts/DeletePostButton.tsx && git commit -m "feat(ui): add DeletePostButton" && git push
```

### Step 43 — `components/comments/CommentBox.tsx`

**Prompt**
```text
Create components/comments/CommentBox.tsx (client component). Prop: { postId: string }. A textarea (maxLength 2000) with a "Comment" button. POST /api/comments with { postId, body }. On success clear the textarea and call router.refresh() (the comment list is server-rendered). Show server error text on failure; disable while submitting; don't submit empty/whitespace-only text.
```
```bash
npm run typecheck && git add components/comments/CommentBox.tsx && git commit -m "feat(ui): add CommentBox" && git push
```

### Step 44 — `components/comments/CommentList.tsx`

**Prompt**
```text
Create components/comments/CommentList.tsx (can be a server component). Prop: { comments: CommentView[] }. If empty show "No comments yet." Otherwise a stack of white cards showing "u/{author.username} · {timeAgo(createdAt)}" in small slate text and the body as plain text (whitespace-pre-wrap). timeAgo must be imported from '@/lib/time'. No dangerouslySetInnerHTML.
```
```bash
npm run typecheck && git add components/comments/CommentList.tsx && git commit -m "feat(ui): add CommentList" && git push
```

### Step 45 — `app/(main)/post/[id]/page.tsx`

**Prompt**
```text
Create app/(main)/post/[id]/page.tsx (async server component; Next 14: params is a plain object { id: string }). Get the session (redirect('/login') if missing). post = await getPost(params.id, viewerId); if null call notFound() from 'next/navigation'. comments = await listComments(params.id, viewerId). Render: BoardBadge, title (h1), body (whitespace-pre-wrap), "u/{author.username} · {timeAgo}", VoteButton, a DeletePostButton only if post.isMine, then a "Comments" heading, <CommentBox postId>, and <CommentList comments>.
```
```bash
npm run typecheck && npm run lint
git add "app/(main)/post/[id]/page.tsx" && git commit -m "feat(ui): add single post page with comments" && git push
```

### Step 46 — `app/(main)/board/[name]/page.tsx`

**Prompt**
```text
Create app/(main)/board/[name]/page.tsx (async server component; params is a plain object { name: string }). If params.name is not in BOARD_SLUGS call notFound(). Get the session (redirect('/login') if missing). listPosts({ viewerId, board: params.name }). Render a heading with the board label from BOARDS, a link "New post in this board" to `/create?board=${params.name}`, and <PostFeed initialPosts initialCursor board={params.name} />.
```
```bash
npm run typecheck && npm run lint && npm run build
git add "app/(main)/board/[name]/page.tsx" && git commit -m "feat(ui): add board feed page" && git push
```

### Step 47 — `README.md` (existing file replace)

**Prompt**
```text
Replace README.md. Sections: what the project is (1 paragraph), tech stack, local setup (clone, npm install, cp .env.example .env and fill it, npx prisma db push, npm run dev), environment variables table (names + purpose, no values), "How anonymity works" (anon ID is a keyed HMAC of the email; email/name/picture/Google ID/IP are not stored; public API never exposes the ID) and "Limits" copied faithfully from docs/SPEC.md section 6 without overstating, and links to docs/SPEC.md and docs/BUILD_PLAN.md. English, concise.
```
```bash
git add README.md && git commit -m "docs: write README" && git push
```

## ✅ Checkpoint 3 — Poora app test (do accounts se)

Do alag Google accounts (ek incognito window mein):
1. A post banata hai, B vote + comment karta hai. B ko A ki post pe **Delete** button nahi dikhna chahiye; B ke browser console se `DELETE /api/posts/<id>` → `403`.
2. Vote toggle: same arrow dobara = vote hat jata hai. Refresh ke baad bhi score sahi.
3. `/board/cse` filter kaam kare; `/board/xyz` → 404.
4. Network tab mein kisi bhi API response mein `userId` search karo → zero results.
5. Supabase `Post`/`Comment` mein `userId` sirf 32-hex hash hai, email kisi table mein nahi.
6. Logout → `/` pe jao → `/login` pe redirect.
7. `ALLOWED_EMAIL_DOMAIN` set karke (restart dev server) doosre domain ke Gmail se login try karo → reject hona chahiye.

`SPEC.md` §8 ki checklist poori tick karo.

---

# PHASE G — Deploy (Vercel)

1. **Vercel** → Add New → Project → GitHub repo `college-forum` import. Framework "Next.js" auto-detect hoga. Build ke time `postinstall` Prisma client generate karega.
2. **Environment Variables** (Production) mein `.env` ke saare keys daalo — `ANON_PEPPER` wahi purani jo local mein hai (**ek hi pepper, warna users ki identity alag ho jayegi**). `NEXTAUTH_URL` = production URL (jaise `https://college-forum.vercel.app`), `NEXTAUTH_SECRET` naya generate kar sakte ho.
3. Deploy. Fir **Google Console** mein add karo:
   - JavaScript origin: `https://<your-domain>`
   - Redirect URI: `https://<your-domain>/api/auth/callback/google`
4. Redeploy (env/URL badle ho toh) aur production pe login test karo.
5. Jab asli users bulane ho: OAuth consent screen ko *Testing* se *In production* karo (sirf basic email/profile/openid scopes ke saath aam taur pe alag verification nahi maangta). Aur `ALLOWED_EMAIL_DOMAIN` set karo agar sirf college ke log chahiye.
6. Production DB ke liye alag Supabase project behtar hai; waha bhi `DATABASE_URL`/`DIRECT_URL` badal ke ek baar `npx prisma db push` aur Step 8 wala RLS SQL chalao.

**Launch ke baad (v2 ideas):** posting/voting pe rate limit, report + moderation, security headers (CSP), username change, account delete.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `redirect_uri_mismatch` | Google Console ka redirect URI aur `NEXTAUTH_URL` bilkul match karein (http/https, port, trailing slash) |
| `[next-auth][error][NO_SECRET]` | `NEXTAUTH_SECRET` set nahi — `.env` ya Vercel env check karo, dev server restart |
| `ANON_PEPPER is missing or shorter than 32 characters` | `openssl rand -hex 32` (64 chars) use karo |
| Prisma `P1001 Can't reach database` | `DIRECT_URL` ke liye Supabase Session pooler string try karo; password mein special chars URL-encode karo |
| Username set kiya par wapas `/setup-username` | `update()` call hua? Cookie purani hai — logout/login karke dekho; Step 23 ka `await update()` dekho |
| Redirect loop `/login` ↔ `/` | `NEXTAUTH_SECRET` middleware aur server dono mein same hona chahiye; cookies clear karo |
| Build error about `params` being a Promise | Codex ne Next 15 style likha — `AGENTS.md` ka "Next 14 reminders" dikha ke fix karwao |
| Codex ne extra files badal di | `git restore .` (commit se pehle), prompt mein "Only create/modify X" dobara likho |
| `npm run typecheck` mein `PrismaClient` errors | `npx prisma generate` chalao |
