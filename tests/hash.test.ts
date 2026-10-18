import assert from 'node:assert/strict'
import test from 'node:test'
import { emailToAnonId } from '../lib/hash'

const TEST_PEPPER = '0123456789abcdef0123456789abcdef'

function withPepper(pepper: string | undefined, run: () => void) {
  const previous = process.env.ANON_PEPPER
  if (pepper === undefined) delete process.env.ANON_PEPPER
  else process.env.ANON_PEPPER = pepper
  try {
    run()
  } finally {
    if (previous === undefined) delete process.env.ANON_PEPPER
    else process.env.ANON_PEPPER = previous
  }
}

test('anonymous identity matches the fixed HMAC-SHA256 compatibility vector', () => {
  withPepper(TEST_PEPPER, () => {
    // Synthetic fixture independently calculated with .NET HMACSHA256.
    assert.equal(emailToAnonId('student@college.edu'), 'c8fb2d927468b4557f0de709d784e0de')
  })
})

test('email case and surrounding whitespace do not create a different account', () => {
  withPepper(TEST_PEPPER, () => {
    const canonical = emailToAnonId('student@college.edu')
    assert.equal(emailToAnonId('  STUDENT@COLLEGE.EDU\t\n'), canonical)
    assert.match(canonical, /^[a-f0-9]{32}$/)
  })
})

test('different email addresses produce distinct anonymous identities', () => {
  withPepper(TEST_PEPPER, () => {
    assert.notEqual(emailToAnonId('student@college.edu'), emailToAnonId('other@college.edu'))
    assert.notEqual(emailToAnonId('student@college.edu'), emailToAnonId('student@another.edu'))
  })
})

test('identity depends on the server-side key and remains stable when restored', () => {
  let first = ''
  withPepper(TEST_PEPPER, () => { first = emailToAnonId('student@college.edu') })
  withPepper('fedcba9876543210fedcba9876543210', () => {
    assert.notEqual(emailToAnonId('student@college.edu'), first)
  })
  withPepper(TEST_PEPPER, () => {
    assert.equal(emailToAnonId('student@college.edu'), first)
  })
})

test('missing, empty, and short peppers fail closed', () => {
  for (const pepper of [undefined, '', 'x'.repeat(31)]) {
    withPepper(pepper, () => {
      assert.throws(() => emailToAnonId('student@college.edu'), /ANON_PEPPER.*32/)
    })
  }
})

test('the minimum permitted 32-character pepper works', () => {
  withPepper('x'.repeat(32), () => {
    assert.match(emailToAnonId('student@college.edu'), /^[a-f0-9]{32}$/)
  })
})
