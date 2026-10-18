import assert from 'node:assert/strict'
import test from 'node:test'
import { isLocalDemo } from '../lib/local-mode'

type LocalEnvironment = {
  NODE_ENV?: string
  COLLEGE_FORUM_LOCAL?: string
  NEXTAUTH_URL?: string
  DATABASE_URL?: string
}

const VALID: LocalEnvironment = {
  NODE_ENV: 'development',
  COLLEGE_FORUM_LOCAL: '1',
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/college_forum_local',
}

function withEnvironment(override: LocalEnvironment, run: () => void) {
  const environment: Record<string, string | undefined> = process.env
  const values = { ...VALID, ...override }
  const keys = Object.keys(VALID) as (keyof LocalEnvironment)[]
  const previous = new Map(keys.map((key) => [key, environment[key]]))
  for (const key of keys) {
    const value = values[key]
    if (value === undefined) delete environment[key]
    else environment[key] = value
  }
  try {
    run()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete environment[key]
      else environment[key] = value
    }
  }
}

test('local demo is enabled only for the explicit development flag', () => {
  withEnvironment({}, () => assert.equal(isLocalDemo(), true))
  for (const NODE_ENV of ['production', 'test', '', undefined]) {
    withEnvironment({ NODE_ENV }, () => assert.equal(isLocalDemo(), false))
  }
  for (const COLLEGE_FORUM_LOCAL of ['0', 'true', 'yes', '', undefined]) {
    withEnvironment({ COLLEGE_FORUM_LOCAL }, () => assert.equal(isLocalDemo(), false))
  }
})

test('local demo permits recognized loopback hostnames and PostgreSQL schemes', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    for (const scheme of ['postgres', 'postgresql']) {
      withEnvironment({
        NEXTAUTH_URL: `http://${host}:3000`,
        DATABASE_URL: `${scheme}://synthetic:synthetic@${host}:5432/college_forum_local`,
      }, () => assert.equal(isLocalDemo(), true))
    }
  }
})

test('local demo rejects remote, deceptive, missing, and malformed app origins', () => {
  for (const NEXTAUTH_URL of [
    undefined, '', 'invalid', 'https://localhost:3000', 'http://college.example',
    'http://localhost.attacker.invalid:3000', 'http://127.0.0.1.attacker.invalid:3000',
    'http://localhost@attacker.invalid:3000', 'file:///localhost',
  ]) {
    withEnvironment({ NEXTAUTH_URL }, () => assert.equal(isLocalDemo(), false))
  }
})

test('local demo rejects remote or incorrectly named databases', () => {
  for (const DATABASE_URL of [
    undefined, '', 'invalid', 'https://localhost/college_forum_local',
    'postgresql://synthetic:synthetic@database.example:5432/college_forum_local',
    'postgresql://synthetic:synthetic@localhost.attacker.invalid:5432/college_forum_local',
    'postgresql://localhost@attacker.invalid:5432/college_forum_local',
    'postgresql://localhost:5432/production', 'postgresql://localhost:5432/college_forum_local_extra',
    'postgresql://localhost:5432/college_forum_local/', 'postgresql://localhost:5432/',
  ]) {
    withEnvironment({ DATABASE_URL }, () => assert.equal(isLocalDemo(), false))
  }
})
