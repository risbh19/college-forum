import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Profile } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { authOptions } from '../lib/auth'
import { prisma } from '../lib/db'

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

function googleProfile(email: string | undefined, verified: unknown): Profile {
  const profile: Profile & { email_verified?: unknown } = { email, email_verified: verified }
  return profile
}

function mockUsernameLookup(context: TestContext, username: string | null) {
  const original = prisma.user.findUnique
  const lookup = context.mock.fn(async (..._arguments: unknown[]) => username === null ? null : { username })
  // Prisma's model delegate is a proxy without a concrete method descriptor.
  // Assigning a spy directly works; Node's mock.method descriptor lookup does not.
  prisma.user.findUnique = lookup as unknown as typeof prisma.user.findUnique
  context.after(() => { prisma.user.findUnique = original })
  return lookup
}

test('subsequent JWT callbacks strip provider identity and arbitrary legacy fields', async () => {
  const result = await jwt({
    ...jwtInput({
      anonId: ANON_ID,
      username: 'shadowcoder',
      email: 'synthetic@college.edu',
      name: 'Synthetic Provider Name',
      picture: 'https://example.invalid/avatar',
      sub: 'synthetic-google-subject',
      accessToken: 'synthetic-access-token',
      arbitrary: { email: 'synthetic@college.edu' },
    }),
  })
  assert.deepEqual(result, { anonId: ANON_ID, username: 'shadowcoder' })
})

test('legacy provider tokens without an anonymous identity cannot preserve PII', async () => {
  const result = await jwt(jwtInput({
    email: 'synthetic@college.edu', name: 'Synthetic Name', picture: 'synthetic-picture', sub: 'google-subject',
  }))
  assert.deepEqual(result, { anonId: undefined, username: null })
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
    token: { anonId: ANON_ID, username: 'shadowcoder', email: 'synthetic@college.edu', sub: 'google-subject' },
    user: { id: 'provider-id', email: 'synthetic@college.edu', emailVerified: null },
    newSession: { user: { username: 'client_override' } },
    trigger: 'update',
  })
  assert.deepEqual(result, { expires: EXPIRES, user: { id: ANON_ID, username: 'shadowcoder' } })
})

test('new accounts receive a minimal session before choosing a username', async () => {
  const result = await session({
    session: { expires: EXPIRES, user: { id: 'old-id', username: null } },
    token: { anonId: ANON_ID, username: null },
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
      profile: { email: '  STUDENT@COLLEGE.EDU  ', sub: 'provider-id', name: 'Synthetic Name' },
      trigger: 'signIn',
    })
    assert.deepEqual(result, { anonId: 'c8fb2d927468b4557f0de709d784e0de', username: 'shadowcoder' })
    assert.equal(lookup.mock.callCount(), 1)
    assert.deepEqual(lookup.mock.calls[0].arguments, [{
      where: { id: 'c8fb2d927468b4557f0de709d784e0de' }, select: { username: true },
    }])
  })
})

test('client session updates reload the username from the DB instead of trusting the client', async (context) => {
  const lookup = mockUsernameLookup(context, 'server_username')

  const result = await jwt({
    ...jwtInput({ anonId: ANON_ID, username: null, email: 'synthetic@college.edu' }),
    trigger: 'update',
    session: { user: { id: 'client-chosen-id', username: 'client_username' }, username: 'client_username' },
  })
  assert.deepEqual(result, { anonId: ANON_ID, username: 'server_username' })
  assert.equal(lookup.mock.callCount(), 1)
  assert.deepEqual(lookup.mock.calls[0].arguments, [{ where: { id: ANON_ID }, select: { username: true } }])
})

test('first sign-in without a database account keeps the username unset', async (context) => {
  mockUsernameLookup(context, null)

  await withEnvironment('ANON_PEPPER', '0123456789abcdef0123456789abcdef', async () => {
    const result = await jwt({ ...jwtInput({}), profile: { email: 'student@college.edu' }, trigger: 'signIn' })
    assert.deepEqual(result, { anonId: 'c8fb2d927468b4557f0de709d784e0de', username: null })
  })
})

test('Google sign-in requires an email and strictly verified boolean status', async () => {
  await withEnvironment('ALLOWED_EMAIL_DOMAIN', undefined, async () => {
    const input = { user: { id: 'provider-id' }, account: null }
    assert.equal(await signIn({ ...input, profile: undefined }), false)
    assert.equal(await signIn({ ...input, profile: googleProfile(undefined, true) }), false)
    for (const verified of [false, undefined, 'true', 1]) {
      assert.equal(await signIn({ ...input, profile: googleProfile('student@college.edu', verified) }), false)
    }
    assert.equal(await signIn({ ...input, profile: googleProfile('student@college.edu', true) }), true)
  })
})

test('college email restrictions match the exact domain after normalization', async () => {
  await withEnvironment('ALLOWED_EMAIL_DOMAIN', '  College.EDU  ', async () => {
    const input = { user: { id: 'provider-id' }, account: null }
    for (const email of ['student@college.edu', '  STUDENT@COLLEGE.EDU  ']) {
      assert.equal(await signIn({ ...input, profile: googleProfile(email, true) }), true)
    }
    for (const email of ['student@gmail.com', 'student@evilcollege.edu', 'student@college.edu.attacker.invalid', 'student@sub.college.edu']) {
      assert.equal(await signIn({ ...input, profile: googleProfile(email, true) }), false)
    }
  })
})
