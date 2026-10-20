import assert from 'node:assert/strict'
import test from 'node:test'
import { BOARD_SLUGS } from '../lib/boards'
import { commentSchema, postSchema, reportSchema, RESERVED_USERNAMES, usernameSchema, voteSchema } from '../lib/validators'

test('reports require exactly one target, a bounded reason and no supplied identity', () => {
  assert.equal(reportSchema.safeParse({ postId: 'post', reason: 'Spam content' }).success, true)
  assert.equal(reportSchema.safeParse({ commentId: 'comment', reason: 'Harassment' }).success, true)
  for (const value of [{ reason: 'Spam' }, { postId: 'post', commentId: 'comment', reason: 'Spam' },
    { postId: 'post', reason: ' ' }, { postId: 'post', reason: 'x'.repeat(501) }, { postId: 'post', reason: 'Spam', reporterId: 'fake' }]) {
    assert.equal(reportSchema.safeParse(value).success, false)
  }
})

test('usernames accept both length boundaries and the documented alphabet', () => {
  for (const username of ['Ab_', 'student_2026', 'a'.repeat(20)]) {
    assert.equal(usernameSchema.parse(username), username)
  }
})

test('usernames reject invalid lengths, spaces, punctuation, and Unicode lookalikes', () => {
  for (const username of ['', 'ab', 'a'.repeat(21), ' user', 'user ', 'u ser', 'user-name', 'user.name', 'studént']) {
    assert.equal(usernameSchema.safeParse(username).success, false, `Accepted invalid username: ${username}`)
  }
})

test('reserved usernames are rejected regardless of case', () => {
  for (const username of RESERVED_USERNAMES) {
    assert.equal(usernameSchema.safeParse(username).success, false)
    assert.equal(usernameSchema.safeParse(username.toUpperCase()).success, false)
    const mixedCase = username.slice(0, 1).toUpperCase() + username.slice(1)
    assert.equal(usernameSchema.safeParse(mixedCase).success, false)
  }
})

test('the reserved-name check does not prohibit unrelated longer usernames', () => {
  assert.equal(usernameSchema.safeParse('administrator_2').success, true)
})

test('all fixed boards are accepted and unknown boards are rejected', () => {
  assert.deepEqual([...BOARD_SLUGS], ['general', 'cse', 'hostel', 'placements', 'confessions'])
  for (const board of BOARD_SLUGS) {
    assert.equal(postSchema.safeParse({ title: 'Hello', body: 'A post', board }).success, true)
  }
  for (const board of ['', 'GENERAL', 'nope']) {
    assert.equal(postSchema.safeParse({ title: 'Hello', body: 'A post', board }).success, false)
  }
})

test('post input is trimmed before checking minimum lengths', () => {
  assert.deepEqual(postSchema.parse({ title: '  abc  ', body: '\n x \t', board: 'general' }), {
    title: 'abc', body: 'x', board: 'general',
  })
  for (const post of [
    { title: ' ab ', body: 'x', board: 'general' },
    { title: 'abc', body: '  \n\t', board: 'general' },
  ]) {
    assert.equal(postSchema.safeParse(post).success, false)
  }
})

test('post title and body permit maximum lengths and reject overflow', () => {
  assert.equal(postSchema.safeParse({ title: 'a'.repeat(150), body: 'b'.repeat(10000), board: 'general' }).success, true)
  assert.equal(postSchema.safeParse({ title: 'a'.repeat(151), body: 'body', board: 'general' }).success, false)
  assert.equal(postSchema.safeParse({ title: 'Title', body: 'b'.repeat(10001), board: 'general' }).success, false)
})

test('comment validation enforces a nonempty post ID, trims text, and caps lengths', () => {
  assert.deepEqual(commentSchema.parse({ postId: 'post', body: '  hello\n' }), { postId: 'post', body: 'hello' })
  assert.equal(commentSchema.safeParse({ postId: 'a'.repeat(40), body: 'a'.repeat(2000) }).success, true)
  for (const comment of [
    { postId: '', body: 'hello' },
    { postId: 'a'.repeat(41), body: 'hello' },
    { postId: 'post', body: '\t \n' },
    { postId: 'post', body: 'a'.repeat(2001) },
  ]) {
    assert.equal(commentSchema.safeParse(comment).success, false)
  }
})

test('vote validation accepts only UP or DOWN and a bounded post ID', () => {
  for (const type of ['UP', 'DOWN']) {
    assert.equal(voteSchema.safeParse({ postId: 'p', type }).success, true)
    assert.equal(voteSchema.safeParse({ postId: 'p'.repeat(40), type }).success, true)
  }
  for (const type of ['', 'up', 'down', 'SIDEWAYS', null, 1]) {
    assert.equal(voteSchema.safeParse({ postId: 'p', type }).success, false)
  }
  assert.equal(voteSchema.safeParse({ postId: '', type: 'UP' }).success, false)
  assert.equal(voteSchema.safeParse({ postId: 'p'.repeat(41), type: 'UP' }).success, false)
})

test('validators reject null, arrays, and wrong primitive types', () => {
  for (const invalid of [null, [], 1, true, 'text']) {
    assert.equal(postSchema.safeParse(invalid).success, false)
    assert.equal(commentSchema.safeParse(invalid).success, false)
    assert.equal(voteSchema.safeParse(invalid).success, false)
  }
  assert.equal(postSchema.safeParse({ title: 123, body: 'body', board: 'general' }).success, false)
  assert.equal(commentSchema.safeParse({ postId: 'post', body: 123 }).success, false)
  assert.equal(usernameSchema.safeParse(123).success, false)
})
