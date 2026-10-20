import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { encode, type JWT } from 'next-auth/jwt'
import { middleware } from '../middleware'
import { COLLEGE_AUTH_POLICY, LOCAL_AUTH_POLICY } from '../lib/access-policy'
import { rateLimits } from '../lib/rate-limit'

const TEST_SECRET = 'synthetic-middleware-secret-only-for-tests-32'
const ORIGIN = 'http://localhost:3000'

async function withTestSecret(run: () => Promise<void>) {
  const previous = process.env.NEXTAUTH_SECRET
  const previousUrl = process.env.NEXTAUTH_URL
  const previousAuth = rateLimits.auth
  rateLimits.auth = async () => null
  process.env.NEXTAUTH_SECRET = TEST_SECRET
  process.env.NEXTAUTH_URL = ORIGIN
  try {
    await run()
  } finally {
    rateLimits.auth = previousAuth
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previous
    if (previousUrl === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = previousUrl
  }
}

async function request(path: string, token?: JWT, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (token) {
    const cookie = await encode({ token, secret: TEST_SECRET, maxAge: 3600 })
    // getToken chooses the cookie name from its environment. Supplying both
    // synthetic names keeps this test independent of a developer's app origin.
    headers.set('cookie', `next-auth.session-token=${cookie}; __Secure-next-auth.session-token=${cookie}`)
  }
  return middleware(new NextRequest(new URL(path, ORIGIN), { method: init.method, headers }))
}

function assertAllowed(response: Response) {
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get('location'), null)
}

function assertRedirect(response: Response, target: string) {
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), `${ORIGIN}${target}`)
}

test('logged-out users are redirected from protected pages and can open login', async () => {
  await withTestSecret(async () => {
    for (const path of ['/', '/create', '/board/cse', '/post/synthetic', '/setup-username']) {
      assertRedirect(await request(path), '/login')
    }
    assertAllowed(await request('/login'))
    assertAllowed(await request('/privacy'))
  })
})

test('auth throttling returns JSON 429 with Retry-After before NextAuth runs', async (context) => {
  const limiter = context.mock.method(rateLimits, 'auth', async () => Response.json({ error: 'Too many requests. Try again shortly.' }, {
    status: 429, headers: { 'Retry-After': '45', 'Cache-Control': 'private, no-store' },
  }))
  for (const path of ['/api/auth', '/api/auth/session', '/api/auth/callback/google']) {
    const response = await middleware(new NextRequest(new URL(path, ORIGIN)))
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '45')
    assert.equal(response.headers.get('x-middleware-next'), null)
    assert.ok(response.headers.get('content-security-policy'))
    assert.deepEqual(await response.json(), { error: 'Too many requests. Try again shortly.' })
  }
  assert.equal(limiter.mock.callCount(), 3)
  await middleware(new NextRequest(new URL('/api/authentication', ORIGIN)))
  assert.equal(limiter.mock.callCount(), 3)
})

test('logged-out API calls return JSON 401 without a redirect', async () => {
  await withTestSecret(async () => {
    for (const path of ['/api', '/api/posts', '/api/comments', '/api/votes', '/api/username']) {
      const response = await request(path)
      assert.equal(response.status, 401)
      assert.equal(response.headers.get('location'), null)
      assert.deepEqual(await response.json(), { error: 'Login required' })
    }
  })
})

test('auth endpoint exemptions respect the exact path boundary', async () => {
  await withTestSecret(async () => {
    for (const path of ['/api/auth', '/api/auth/session', '/api/auth/callback/google']) {
      assertAllowed(await request(path))
    }
    for (const path of ['/api/authentication', '/api/auth-extra']) {
      const response = await request(path)
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Login required' })
    }
  })
})

test('accounts without a username can access setup and only its exact API endpoint', async () => {
  await withTestSecret(async () => {
    const token = { anonId: 'a'.repeat(32), authPolicy: COLLEGE_AUTH_POLICY, username: null }
    assertAllowed(await request('/setup-username', token))
    assertAllowed(await request('/api/username', token))
    assertAllowed(await request('/api/auth/session', token))
    for (const path of ['/', '/login', '/create', '/setup-username/extra']) {
      assertRedirect(await request(path, token), '/setup-username')
    }
    for (const path of ['/api/posts', '/api/comments', '/api/votes', '/api/username/extra']) {
      const response = await request(path, token)
      assert.equal(response.status, 403)
      assert.equal(response.headers.get('location'), null)
      assert.deepEqual(await response.json(), { error: 'Set a username first' })
    }
  })
})

test('completed accounts reach protected content and are redirected away from auth setup', async () => {
  await withTestSecret(async () => {
    const token = { anonId: 'b'.repeat(32), authPolicy: COLLEGE_AUTH_POLICY, username: 'shadowcoder' }
    for (const path of ['/login', '/setup-username']) {
      assertRedirect(await request(path, token), '/')
    }
    for (const path of ['/', '/create', '/board/cse', '/post/synthetic', '/api/posts', '/api/comments', '/api/votes']) {
      assertAllowed(await request(path, token))
    }
  })
})

test('provider tokens without a derived anonymous identity do not grant access', async () => {
  await withTestSecret(async () => {
    const token = { sub: 'synthetic-provider-id', username: 'shadowcoder' }
    assertRedirect(await request('/', token), '/login')
    const response = await request('/api/posts', token)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Login required' })
  })
})

test('old unrestricted tokens and local-demo tokens cannot access production', async () => {
  await withTestSecret(async () => {
    for (const authPolicy of [undefined, 'old-policy', LOCAL_AUTH_POLICY]) {
      const token = { anonId: 'a'.repeat(32), username: 'old_user', authPolicy }
      assertRedirect(await request('/', token), '/login')
      assert.equal((await request('/api/posts', token)).status, 401)
    }
  })
})

test('middleware requires the exact configured Origin for every POST DELETE and PATCH API mutation', async () => {
  await withTestSecret(async () => {
    const token = { anonId: 'a'.repeat(32), authPolicy: COLLEGE_AUTH_POLICY, username: 'test_alias' }
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      for (const path of ['/api', '/api/posts', '/api/username', '/api/reports', '/api/admin/posts/test', '/api/authentication', '/api/future-route']) {
        for (const origin of [undefined, 'null', 'https://attacker.invalid', `${ORIGIN}.attacker.invalid`, 'http://localhost:3001']) {
          const headers: Record<string, string> = origin ? { origin } : {}
          const response = await request(path, token, { method, headers })
          assert.equal(response.status, 403)
          assert.deepEqual(await response.json(), { error: 'Cross-site request rejected' })
          assert.equal(response.headers.get('x-middleware-next'), null)
        }
        assertAllowed(await request(path, token, { method, headers: { origin: ORIGIN } }))
      }
      for (const path of ['/api/auth', '/api/auth/callback/google', '/api/auth/signout']) {
        assertAllowed(await request(path, undefined, { method, headers: { origin: 'https://accounts.google.com' } }))
      }
    }
    assertAllowed(await request('/api/posts', token))
    assertAllowed(await request('/login'))
    assert.equal((await request('/api/posts', token, { method: 'POST', headers: { origin: ORIGIN, 'sec-fetch-site': 'cross-site' } })).status, 403)
    for (const value of ['', 'invalid', 'file:///local', 'https://user:pass@forum.example']) {
      process.env.NEXTAUTH_URL = value
      const response = await request('/api/posts', token, { method: 'POST', headers: { origin: ORIGIN } })
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { error: 'Service temporarily unavailable' })
    }
  })
})

test('middleware attaches fresh nonces and consistent security headers to the login page', async () => {
  await withTestSecret(async () => {
    const one = await request('/login'), two = await request('/login')
    const csp = one.headers.get('content-security-policy') ?? ''
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/)
    assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com/)
    assert.notEqual(csp, two.headers.get('content-security-policy'))
    assert.equal(one.headers.get('x-frame-options'), 'DENY')
    assert.equal(one.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(one.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.match(one.headers.get('permissions-policy') ?? '', /camera=\(\)/)
  })
})
