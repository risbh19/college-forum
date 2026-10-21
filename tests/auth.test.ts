import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Profile } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { authOptions } from '../lib/auth'
import { COLLEGE_AUTH_POLICY } from '../lib/access-policy'
import { spawnSync } from 'node:child_process'

const jwt = authOptions.callbacks?.jwt
const session = authOptions.callbacks?.session
const signIn = authOptions.callbacks?.signIn
const logError = authOptions.logger?.error
if (!jwt || !session || !signIn || !logError) throw new Error('Required privacy callbacks or logger are missing')

const ANON_ID = 'a'.repeat(32)
const EXPIRES = '2030-01-01T00:00:00.000Z'
const PRIVATE_VALUES = ['synthetic-sensitive-access-token', 'synthetic-sensitive-refresh-token',
  'synthetic-sensitive-client-secret', 'synthetic-person@rkgit.edu.in', 'Synthetic Real Name',
  'synthetic-google-subject', 'https://example.invalid/private-callback?code=synthetic-code', '192.0.2.1', ANON_ID]
const PRIVATE_DIAGNOSTIC = PRIVATE_VALUES.join(' ')

function captureAuthLogs(context: TestContext) {
  const error = context.mock.method(console, 'error', () => {})
  const warn = context.mock.method(console, 'warn', () => {})
  const log = context.mock.method(console, 'log', () => {})
  const debug = context.mock.method(console, 'debug', () => {})
  return (expected: readonly string[]) => {
    const calls = error.mock.calls.map(call => call.arguments)
    assert.deepEqual(calls, expected.map(reason => [reason]))
    const output = JSON.stringify(calls)
    for (const value of PRIVATE_VALUES) assert.ok(!output.includes(value))
    assert.equal(warn.mock.callCount(), 0)
    assert.equal(log.mock.callCount(), 0)
    assert.equal(debug.mock.callCount(), 0)
  }
}

test('NextAuth error logger emits only fixed codes for direct, wrapped and nested error names/codes', context => {
  const assertLogs = captureAuthLogs(context)
  const privateError = (details: { name?: string; code?: string } = {}) => Object.assign(new Error(PRIVATE_DIAGNOSTIC), {
    stack: PRIVATE_DIAGNOSTIC, profile: { email: PRIVATE_VALUES[3], name: PRIVATE_VALUES[4], sub: PRIVATE_VALUES[5] },
    access_token: PRIVATE_VALUES[0], refresh_token: PRIVATE_VALUES[1], url: PRIVATE_VALUES[6], ...details,
  })
  const cases: { code: string; metadata: Parameters<typeof logError>[1]; reason: string }[] = [
    { code: 'OAUTH_GET_ACCESS_TOKEN_ERROR', metadata: privateError(), reason: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    { code: 'OAUTH_V1_GET_ACCESS_TOKEN_ERROR', metadata: privateError(), reason: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: { error: privateError({ name: 'OPError' }), profile: PRIVATE_DIAGNOSTIC }, reason: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ name: 'OAuthCallbackError', code: 'invalid_client' }), reason: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ code: 'invalid_grant' }), reason: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
    { code: 'PKCE_ERROR', metadata: privateError(), reason: 'OAUTH_STATE_OR_PKCE' },
    { code: 'STATE_ERROR', metadata: privateError(), reason: 'OAUTH_STATE_OR_PKCE' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: { error: privateError({ name: 'StateError' }) }, reason: 'OAUTH_STATE_OR_PKCE' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ name: 'PKCEError' }), reason: 'OAUTH_STATE_OR_PKCE' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' }), reason: 'OAUTH_ID_TOKEN_INVALID' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: { error: privateError({ name: 'JWSSignatureVerificationFailed' }) }, reason: 'OAUTH_ID_TOKEN_INVALID' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: Object.assign(privateError(), { cause: { error: privateError({ code: 'ERR_JWT_EXPIRED' }) } }), reason: 'OAUTH_ID_TOKEN_INVALID' },
    { code: 'OAUTH_CALLBACK_HANDLER_ERROR', metadata: privateError({ name: 'BackendUsernameLookupError' }), reason: 'BACKEND_USERNAME_LOOKUP_FAILED' },
    { code: 'JWT_SESSION_ERROR', metadata: { error: privateError({ code: 'BACKEND_USERNAME_LOOKUP_FAILED' }) }, reason: 'BACKEND_USERNAME_LOOKUP_FAILED' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ name: 'OAuthCallbackError' }), reason: 'OTHER' },
    { code: PRIVATE_DIAGNOSTIC, metadata: privateError({ name: PRIVATE_DIAGNOSTIC, code: PRIVATE_DIAGNOSTIC }), reason: 'OTHER' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: privateError({ name: `OPError ${PRIVATE_DIAGNOSTIC}`, code: `PKCE_ERROR ${PRIVATE_DIAGNOSTIC}` }), reason: 'OTHER' },
    { code: 'OAUTH_CALLBACK_ERROR', metadata: Object.assign(privateError(), { message: 'PKCE_ERROR invalid_grant ERR_JWT_INVALID' }), reason: 'OTHER' },
  ]
  for (const { code, metadata } of cases) logError(code, metadata)
  authOptions.logger?.warn?.('NO_SECRET')
  authOptions.logger?.debug?.(PRIVATE_DIAGNOSTIC, { profile: PRIVATE_DIAGNOSTIC, tokens: PRIVATE_DIAGNOSTIC })
  assert.equal(authOptions.debug, false)
  assertLogs(cases.map(item => item.reason))
})

test('NextAuth diagnostics never inspect messages, payloads or serialization hooks, even with malformed metadata', context => {
  const assertLogs = captureAuthLogs(context)
  const unread = context.mock.fn(() => { throw new Error(PRIVATE_DIAGNOSTIC) })
  const guarded = Object.defineProperties({ name: 'Error', code: 'unknown' }, Object.fromEntries(
    ['message', 'stack', 'profile', 'email', 'tokens', 'url', 'toJSON'].map(key => [key, { get: unread }]),
  ))
  const cyclic = { name: 'Error', cause: {} }
  cyclic.cause = cyclic
  const hostile = new Proxy({}, { get: unread })
  for (const metadata of [guarded, { error: guarded }, cyclic, hostile, null, undefined, PRIVATE_DIAGNOSTIC]) {
    assert.doesNotThrow(() => logError(PRIVATE_DIAGNOSTIC, metadata as Parameters<typeof logError>[1]))
  }
  assert.equal(unread.mock.callCount(), 1) // Only the hostile proxy's name/code access throws.
  assertLogs(Array(7).fill('OTHER'))
})

test('backend username lookup failures stay closed and reach the NextAuth logger as a fixed safe code', async context => {
  const assertLogs = captureAuthLogs(context)
  const lookup = mockUsernameLookup(context, null)
  let expected = 0
  await withEnvironment('ANON_PEPPER', '0123456789abcdef0123456789abcdef', async () => {
    for (const failure of ['http', 'network']) {
      lookup.mock.mockImplementation(async () => {
        if (failure === 'network') throw new Error(PRIVATE_DIAGNOSTIC)
        return Response.json({ error: PRIVATE_DIAGNOSTIC }, { status: 503 })
      })
      for (const input of [
        { ...jwtInput({}), account: { provider: 'google', type: 'oauth' as const, providerAccountId: 'synthetic-provider-id' }, profile: googleProfile('student@rkgit.edu.in', true), trigger: 'signIn' as const },
        { ...jwtInput({ anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: null }), trigger: 'update' as const },
      ]) {
        await assert.rejects(async () => jwt(input), (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.name, 'BackendUsernameLookupError')
          assert.equal(error.message, 'Username lookup unavailable')
          assert.equal('cause' in error, false)
          // Simulate NextAuth's callback/session error handler receiving the rejection.
          logError('OAUTH_CALLBACK_HANDLER_ERROR', { error })
          return true
        })
        expected++
      }
    }
  })
  assert.equal(lookup.mock.callCount(), 4)
  assertLogs(Array(expected).fill('BACKEND_USERNAME_LOOKUP_FAILED'))
})

test('JWT sessions and cookies have a seven-day lifetime and production always requires secure cookies', () => {
  assert.equal(authOptions.session?.strategy, 'jwt')
  assert.equal(authOptions.session?.maxAge, 7 * 24 * 60 * 60)
  assert.equal(authOptions.jwt?.maxAge, 7 * 24 * 60 * 60)
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "import('./lib/auth.ts').then(m => process.stdout.write(String((m.authOptions ?? m.default.authOptions).useSecureCookies)))"], {
    env: { ...process.env, NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:3000' }, encoding: 'utf8', windowsHide: true,
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'true')
})

async function withEnvironment(name: 'ANON_PEPPER' | 'ALLOWED_EMAIL_DOMAIN', value: string | undefined, run: () => Promise<void>) {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

function jwtInput(token: JWT) {
  return { token, user: { id: 'synthetic-provider-user' }, account: null }
}

function googleProfile(email: string | undefined, verified: unknown, hd: unknown = 'rkgit.edu.in'): Profile & { email_verified?: unknown; hd?: unknown } {
  const profile: Profile & { email_verified?: unknown; hd?: unknown } = { email, email_verified: verified, hd }
  return profile
}

function mockUsernameLookup(context: TestContext, username: string | null) {
  const original = globalThis.fetch
  const previous = process.env.BACKEND_SHARED_SECRET
  process.env.BACKEND_SHARED_SECRET = 'synthetic-testing-shared-key-at-least-32-characters'
  const lookup = context.mock.fn(async (..._arguments: unknown[]) => Response.json({ username }))
  globalThis.fetch = lookup as typeof fetch
  context.after(() => {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.BACKEND_SHARED_SECRET
    else process.env.BACKEND_SHARED_SECRET = previous
  })
  return lookup
}

test('subsequent JWT callbacks strip provider identity and arbitrary legacy fields', async () => {
  const result = await jwt({
    ...jwtInput({
      anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY,
      username: 'shadowcoder',
      email: 'synthetic@college.edu',
      name: 'Synthetic Provider Name',
      picture: 'https://example.invalid/avatar',
      sub: 'synthetic-google-subject',
      accessToken: 'synthetic-access-token',
      arbitrary: { email: 'synthetic@college.edu' },
    }),
  })
  assert.deepEqual(result, { anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: 'shadowcoder' })
})

test('legacy provider tokens without an anonymous identity cannot preserve PII', async () => {
  const result = await jwt(jwtInput({
    email: 'synthetic@college.edu', name: 'Synthetic Name', picture: 'synthetic-picture', sub: 'google-subject',
  }))
  assert.deepEqual(result, {})
})

test('session callback rebuilds a minimal session and ignores provider/session extras', async () => {
  const incoming = {
    expires: EXPIRES,
    user: {
      id: 'synthetic-old-id', username: 'old_username',
      email: 'synthetic@college.edu', name: 'Synthetic Name', image: 'synthetic-picture',
    },
    accessToken: 'synthetic-access-token',
  }
  const result = await session({
    session: incoming,
    token: { anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: 'shadowcoder', email: 'synthetic@college.edu', sub: 'google-subject' },
    user: { id: 'provider-id', email: 'synthetic@college.edu', emailVerified: null },
    newSession: { user: { username: 'client_override' } },
    trigger: 'update',
  })
  assert.deepEqual(result, { expires: EXPIRES, user: { id: ANON_ID, username: 'shadowcoder' } })
})

test('new accounts receive a minimal session before choosing a username', async () => {
  const result = await session({
    session: { expires: EXPIRES, user: { id: 'old-id', username: null } },
    token: { anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: null },
    user: { id: 'provider-id', email: 'synthetic@college.edu', emailVerified: null },
    newSession: undefined,
    trigger: 'update',
  })
  assert.deepEqual(result, { expires: EXPIRES, user: { id: ANON_ID, username: null } })
})

test('initial OAuth JWT uses the HMAC identity and only reads the public username', async (context) => {
  const lookup = mockUsernameLookup(context, 'shadowcoder')

  await withEnvironment('ANON_PEPPER', '0123456789abcdef0123456789abcdef', async () => {
    const result = await jwt({
      ...jwtInput({ email: 'synthetic@college.edu', name: 'Synthetic Name', sub: 'provider-id' }),
      account: { provider: 'google', type: 'oauth', providerAccountId: 'synthetic-provider-id' },
      profile: { ...googleProfile('  STUDENT@RKGIT.EDU.IN  ', true), sub: 'provider-id', name: 'Synthetic Name' },
      trigger: 'signIn',
    })
    assert.deepEqual(result, { anonId: '4d3049cdcd3a3d34c35a60af65bc3ecc', authPolicy: COLLEGE_AUTH_POLICY, username: 'shadowcoder' })
    assert.equal(lookup.mock.callCount(), 1)
    assert.equal(new URL(String(lookup.mock.calls[0].arguments[0])).pathname, '/internal/session')
  })
})

test('client session updates reload the username from the DB instead of trusting the client', async (context) => {
  const lookup = mockUsernameLookup(context, 'server_username')

  const result = await jwt({
    ...jwtInput({ anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: null, email: 'synthetic@college.edu' }),
    trigger: 'update',
    session: { user: { id: 'client-chosen-id', username: 'client_username' }, username: 'client_username' },
  })
  assert.deepEqual(result, { anonId: ANON_ID, authPolicy: COLLEGE_AUTH_POLICY, username: 'server_username' })
  assert.equal(lookup.mock.callCount(), 1)
  assert.equal(new URL(String(lookup.mock.calls[0].arguments[0])).pathname, '/internal/session')
})

test('first sign-in without a database account keeps the username unset', async (context) => {
  mockUsernameLookup(context, null)

  await withEnvironment('ANON_PEPPER', '0123456789abcdef0123456789abcdef', async () => {
    const result = await jwt({ ...jwtInput({}), account: { provider: 'google', type: 'oauth', providerAccountId: 'synthetic-provider-id' }, profile: googleProfile('student@rkgit.edu.in', true), trigger: 'signIn' })
    assert.deepEqual(result, { anonId: '4d3049cdcd3a3d34c35a60af65bc3ecc', authPolicy: COLLEGE_AUTH_POLICY, username: null })
  })
})

test('Google sign-in requires exact college email, verified boolean and hosted domain', async () => {
  const input = { user: { id: 'provider-id' }, account: { provider: 'google', type: 'oauth' as const, providerAccountId: 'synthetic-id' } }
  assert.equal(await signIn({ ...input, profile: undefined }), false)
  for (const verified of [false, undefined, 'true', 1]) {
    assert.equal(await signIn({ ...input, profile: googleProfile('student@rkgit.edu.in', verified) }), false)
  }
  for (const email of ['student@rkgit.edu.in', '  STUDENT@RKGIT.EDU.IN  ']) {
    assert.equal(await signIn({ ...input, profile: googleProfile(email, true) }), true)
  }
  for (const email of [undefined, 'student@gmail.com', 'student@evilrkgit.edu.in', 'student@rkgit.edu.in.attacker.invalid', 'student@sub.rkgit.edu.in', 'one@two@rkgit.edu.in', '@rkgit.edu.in']) {
    assert.equal(await signIn({ ...input, profile: googleProfile(email, true) }), false)
  }
  for (const hd of [undefined, null, '', 'gmail.com', 'sub.rkgit.edu.in', 'rkgit.edu.in.attacker.invalid']) {
    const profile = googleProfile('student@rkgit.edu.in', true)
    profile.hd = hd
    assert.equal(await signIn({ ...input, profile }), false)
  }
  assert.equal(await signIn({ ...input, account: null, profile: googleProfile('student@rkgit.edu.in', true) }), false)
})

test('an environment override cannot open sign-in to another domain', async () => {
  for (const domain of [undefined, '', 'gmail.com']) await withEnvironment('ALLOWED_EMAIL_DOMAIN', domain, async () => {
    const input = { user: { id: 'provider-id' }, account: { provider: 'google', type: 'oauth' as const, providerAccountId: 'synthetic-id' } }
    assert.equal(await signIn({ ...input, profile: googleProfile('student@gmail.com', true, 'gmail.com') }), false)
    assert.equal(await signIn({ ...input, profile: googleProfile('student@rkgit.edu.in', true) }), true)
  })
})

test('legacy unrestricted sessions and attempted client upgrades fail closed', async () => {
  const result = await jwt({ ...jwtInput({ anonId: ANON_ID, username: 'old_user' }), trigger: 'update', session: { authPolicy: COLLEGE_AUTH_POLICY } })
  assert.deepEqual(result, {})
})

test('JWT callback refuses an unverified or wrong-domain initial profile', async () => {
  for (const profile of [googleProfile('student@gmail.com', true), googleProfile('student@rkgit.edu.in', false), googleProfile('student@rkgit.edu.in', true, null)]) {
    assert.deepEqual(await jwt({ ...jwtInput({}), account: { provider: 'google', type: 'oauth', providerAccountId: 'synthetic-id' }, profile, trigger: 'signIn' }), {})
  }
})
