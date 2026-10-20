import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Profile } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { authOptions } from '../lib/auth'
import { COLLEGE_AUTH_POLICY } from '../lib/access-policy'

const jwt = authOptions.callbacks?.jwt
const session = authOptions.callbacks?.session
const signIn = authOptions.callbacks?.signIn
if (!jwt || !session || !signIn) throw new Error('Required privacy callbacks are missing')

const ANON_ID = 'a'.repeat(32)
const EXPIRES = '2030-01-01T00:00:00.000Z'

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
