import assert from 'node:assert/strict';

function origin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url;
  } catch {
    throw new Error('Provide only exact public HTTPS service origins, without credentials or paths.');
  }
}
const frontend = origin(process.argv[2]);
const backend = origin(process.argv[3]);
const request = (base, path) => fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });

try {
  const login = await request(frontend, '/login');
  assert.equal(login.status, 200, 'Frontend login must be public');
  const html = await login.text();
  assert.match(html, /@rkgit\.edu\.in/);
  assert.doesNotMatch(html, /Explore as shadowcoder|Try username setup/);
  for (const name of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'strict-transport-security']) assert.ok(login.headers.get(name), `Missing ${name}`);
  console.log('PASS college-only production login, no demo accounts, security headers');

  const providers = await (await request(frontend, '/api/auth/providers')).json();
  assert.deepEqual(Object.keys(providers), ['google']);
  assert.equal(new URL(providers.google.callbackUrl).origin, frontend.origin, 'Google callback must match production frontend');
  assert.equal((await request(frontend, '/api/posts')).status, 401);
  const home = await request(frontend, '/');
  assert.equal(home.status, 307);
  assert.equal(new URL(home.headers.get('location'), frontend).pathname, '/login');
  console.log('PASS Google-only provider and logged-out access controls');

  for (const [path, status] of [['/health', 200], ['/ready', 200], ['/api/posts', 401], ['/internal/session', 401], ['/docs', 404], ['/openapi.json', 404]]) {
    assert.equal((await request(backend, path)).status, status, `Backend ${path}`);
    console.log(`PASS FastAPI ${path}: ${status}`);
  }
  console.log('Deployment smoke checks passed. Complete the two-account Google sign-in checks in docs/DEPLOYMENT.md.');
} catch {
  console.error('Deployment checks failed. Check production origins, deployment protection, private configuration, migrations, and service health. No credentials or response bodies were printed.');
  process.exitCode = 1;
}
