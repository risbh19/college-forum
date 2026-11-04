import assert from 'node:assert/strict';

// No cookies or Origin: reads require login and mutations must fail the Origin
// guard before authentication or database access. These checks create no data.
const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:3000';
const cases = [
  ['GET', '/', 307],
  ['GET', '/create', 307],
  ['GET', '/setup-username', 307],
  ['GET', '/board/cse', 307],
  ['GET', '/api/posts', 401],
  ['POST', '/api/posts', 403],
  ['GET', '/api/posts/synthetic-missing-post', 401],
  ['DELETE', '/api/posts/synthetic-missing-post', 403],
  ['GET', '/api/comments?postId=synthetic-missing-post', 401],
  ['POST', '/api/comments', 403],
  ['POST', '/api/votes', 403],
  ['POST', '/api/username', 403],
  ['GET', '/api/authentication', 401],
];

for (const [method, path, status] of cases) {
  const response = await fetch(new URL(path, origin), { method, redirect: 'manual' });
  assert.equal(response.status, status, `${method} ${path}`);
  if (status === 307) {
    assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login');
  } else {
    assert.deepEqual(await response.json(), { error: status === 403 ? 'Cross-site request rejected' : 'Login required' });
  }
  console.log(`PASS ${method} ${path}: ${status}`);
}

const login = await fetch(new URL('/login', origin));
assert.equal(login.status, 200);
assert.match(await login.text(), /Continue with Google|Explore as shadowcoder/);
console.log('PASS GET /login: 200 with sign-in UI');

const session = await fetch(new URL('/api/auth/session', origin));
assert.equal(session.status, 200);
const payload = await session.json();
assert.ok(payload === null || (typeof payload === 'object' && Object.keys(payload).length === 0));
console.log('PASS GET /api/auth/session: 200 with no authenticated identity');
console.log('15 logged-out HTTP smoke checks passed.');
