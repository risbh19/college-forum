import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { encode, type JWT } from 'next-auth/jwt'
import { middleware } from '../middleware'
import { COLLEGE_AUTH_POLICY, LOCAL_AUTH_POLICY } from '../lib/access-policy'

const TEST_SECRET = 'synthetic-middleware-secret-only-for-tests-32'
const ORIGIN = 'http://localhost:3000'

async function withTestSecret(run: () => Promise<void>) {
  const previous = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = TEST_SECRET
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previous
  }
}

async function request(path: string, token?: JWT) {
  const headers = new Headers()
  if (token) {
    const cookie = await encode({ token, secret: TEST_SECRET, maxAge: 3600 })
    // getToken chooses the cookie name from its environment. Supplying both
    // synthetic names keeps this test independent of a developer's app origin.
    headers.set('cookie', `next-auth.session-token=${cookie}; __Secure-next-auth.session-token=${cookie}`)
  }
  return middleware(new NextRequest(new URL(path, ORIGIN), { headers }))
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
