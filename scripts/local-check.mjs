import { randomUUID } from 'node:crypto';

const base = new URL(process.argv[2] ?? 'http://localhost:3000');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('The local integration check requires a plain HTTP loopback origin.');
}

let completed = 0;
const createdPosts = new Map();
let succeeded = false;
function check(condition, label) {
  if (!condition) throw new Error(label);
}
function passed(label) {
  completed += 1;
  console.log(`PASS ${label}`);
}

class Browser {
  cookies = new Map();

  async request(path, options = {}) {
    const headers = new Headers();
    if (this.cookies.size) {
      headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    let body;
    if ('json' in options) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.json);
    } else if (options.form) {
      headers.set('content-type', 'application/x-www-form-urlencoded');
      body = new URLSearchParams(options.form).toString();
    } else if ('raw' in options) {
      headers.set('content-type', 'application/json');
      body = options.raw;
    }
    const response = await fetch(new URL(path, base), {
      method: options.method ?? 'GET', headers, body, redirect: 'manual', signal: AbortSignal.timeout(60_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.slice(0, cookie.indexOf(';') === -1 ? undefined : cookie.indexOf(';'));
      const separator = first.indexOf('=');
      if (separator === -1) continue;
      const name = first.slice(0, separator);
      const value = first.slice(separator + 1);
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { response, data };
  }

  async csrf() {
    const { response, data } = await this.request('/api/auth/csrf');
    check(response.status === 200 && typeof data?.csrfToken === 'string', 'NextAuth CSRF endpoint failed');
    return data.csrfToken;
  }

  async signIn(account) {
    const csrfToken = await this.csrf();
    const { response } = await this.request('/api/auth/callback/local-demo', {
      method: 'POST', form: { csrfToken, account, callbackUrl: base.href, json: 'true' },
    });
    check([200, 302, 303].includes(response.status), 'Local credential callback failed');
    const current = await this.session();
    check(Boolean(current?.user?.id), 'Local credential sign-in did not create a session');
    return current;
  }

  async session() {
    const { response, data } = await this.request('/api/auth/session');
    check(response.status === 200, 'NextAuth session endpoint failed');
    return data;
  }

  async updateSession() {
    const csrfToken = await this.csrf();
    const { response, data } = await this.request('/api/auth/session', {
      method: 'POST', json: { csrfToken, data: { user: { username: 'client_spoofed_name' } } },
    });
    check(response.status === 200, 'NextAuth session update failed');
    return data;
  }
}

function publicResponse(value) {
  const forbidden = new Set(['userId', 'anonId', 'email', 'name', 'picture', 'image', 'sub']);
  function visit(current) {
    if (typeof current === 'string') {
      check(!/^[a-f0-9]{32}$/.test(current), 'An anonymous account identifier leaked in an API response');
    } else if (Array.isArray(current)) {
      current.forEach(visit);
    } else if (current && typeof current === 'object') {
      for (const [key, entry] of Object.entries(current)) {
        check(!forbidden.has(key), 'A private identity field leaked in an API response');
        visit(entry);
      }
    }
  }
  visit(value);
}

function minimalSession(value) {
  check(value && typeof value === 'object', 'A session was not returned');
  check(Object.keys(value).sort().join(',') === 'expires,user', 'Session contains unexpected top-level fields');
  check(Object.keys(value.user ?? {}).sort().join(',') === 'id,username', 'Session contains provider profile fields');
  check(/^[a-f0-9]{32}$/.test(value.user.id), 'Session does not contain the derived anonymous identity');
  check(value.user.username === null || typeof value.user.username === 'string', 'Session username is invalid');
}

async function api(browser, path, options, status, label) {
  const result = await browser.request(path, options);
  // Record successful creations before assertions, so even a response-contract
  // failure cannot strand records made by this run. Never register seed rows.
  if (path === '/api/posts' && options.method === 'POST' && result.response.status === 201
    && typeof result.data?.id === 'string') {
    createdPosts.set(result.data.id, browser);
  }
  if (options.method === 'DELETE' && path.startsWith('/api/posts/')
    && [200, 404].includes(result.response.status)) {
    createdPosts.delete(decodeURIComponent(path.slice('/api/posts/'.length)));
  }
  check(result.response.status === status, `${label}: unexpected HTTP status`);
  check(result.data !== null && typeof result.data === 'object', `${label}: expected a JSON response`);
  publicResponse(result.data);
  if (status >= 400) check(typeof result.data.error === 'string', `${label}: expected a JSON error`);
  return result.data;
}

const signedOut = new Browser();
const one = new Browser();
const two = new Browser();
const newcomer = new Browser();

try {
  const providers = await signedOut.request('/api/auth/providers');
  check(providers.response.status === 200 && providers.data?.['local-demo']?.type === 'credentials',
    'Local demo provider is unavailable. Start the app with npm run local.');
  passed('development-only local credential provider is available');

  await api(signedOut, '/api/posts', {}, 401, 'Logged-out API protection');
  passed('logged-out API requests return JSON 401');

  const firstSession = await one.signIn('student-one');
  const secondSession = await two.signIn('student-two');
  minimalSession(firstSession);
  minimalSession(secondSession);
  check(firstSession.user.username === 'shadowcoder42', 'First seeded account username differs');
  check(secondSession.user.username === 'campusowl', 'Second seeded account username differs');
  check(firstSession.user.id !== secondSession.user.id, 'Local accounts do not have distinct identities');
  passed('two local accounts sign in through NextAuth with minimal sessions');

  const newSession = await newcomer.signIn('new-student');
  minimalSession(newSession);
  if (!newSession.user.username) {
    await api(newcomer, '/api/posts', {}, 403, 'Username setup access control');
    const redirect = await newcomer.request('/');
    check(redirect.response.status === 307 && new URL(redirect.response.headers.get('location'), base).pathname === '/setup-username',
      'An incomplete account did not redirect to username setup');
    await api(newcomer, '/api/username', { method: 'POST', json: { username: 'admin' } }, 400, 'Reserved username');
    await api(newcomer, '/api/username', { method: 'POST', json: { username: 'SHADOWCODER42' } }, 409, 'Case-insensitive username uniqueness');
    const chosen = await api(newcomer, '/api/username', { method: 'POST', json: { username: 'localtester' } }, 200, 'Username creation');
    check(chosen.username === 'localtester', 'Username creation returned an unexpected username');
  }
  const refreshed = await newcomer.updateSession();
  minimalSession(refreshed);
  check(Boolean(refreshed.user.username) && refreshed.user.username !== 'client_spoofed_name', 'Session update trusted the client username');
  await api(newcomer, '/api/posts', {}, 200, 'Updated username access');
  await api(newcomer, '/api/username', { method: 'POST', json: { username: 'different_alias' } }, 409, 'Immutable username');
  passed(newSession.user.username
    ? 'existing newcomer account keeps its immutable username after a server session update'
    : 'newcomer completes username setup, uniqueness checks, and server session update');

  await api(one, '/api/posts', { method: 'POST', raw: '{invalid' }, 400, 'Invalid JSON');
  await api(one, '/api/posts', { method: 'POST', json: { title: 'ok', body: '', board: 'nope' } }, 400, 'Invalid post');
  await api(one, '/api/posts?board=nope', {}, 400, 'Invalid board query');
  passed('invalid JSON, content, and boards return JSON 400');

  const title = `Local integration ${Date.now()} ${randomUUID().slice(0, 8)}`;
  const post = await api(one, '/api/posts', {
    method: 'POST', json: { title, body: 'Synthetic integration post. It is removed by the check.', board: 'cse' },
  }, 201, 'Post creation');
  check(typeof post.id === 'string' && post.title === title && post.isMine === true, 'Created post has incorrect owner or content');
  const postPath = `/api/posts/${encodeURIComponent(post.id)}`;
  passed('account one creates a private-ID-free post');

  const feed = await api(two, '/api/posts?board=cse', {}, 200, 'Board feed');
  check(Array.isArray(feed.posts) && feed.posts.some((item) => item.id === post.id && item.isMine === false), 'Second account cannot find the post in its board feed');
  const otherView = await api(two, postPath, {}, 200, 'Single post');
  check(otherView.isMine === false && otherView.author?.username === 'shadowcoder42', 'Second account ownership view is incorrect');
  passed('board list and single-post reads expose username and ownership only');

  await api(two, postPath, { method: 'DELETE' }, 403, 'Cross-account delete');
  await api(one, postPath, {}, 200, 'Post survives unauthorized delete');
  passed('account two cannot delete account one\'s post');

  const comment = await api(two, '/api/comments', {
    method: 'POST', json: { postId: post.id, body: 'Synthetic comment from the second local account.' },
  }, 201, 'Comment creation');
  check(comment.isMine === true && comment.author?.username === 'campusowl', 'Comment ownership is incorrect');
  const commentsPath = `/api/comments?postId=${encodeURIComponent(post.id)}`;
  const comments = await api(one, commentsPath, {}, 200, 'Comment listing');
  check(comments.comments?.some((item) => item.id === comment.id && item.isMine === false), 'First account cannot read the second account\'s comment');
  passed('cross-account comments persist without disclosing private IDs');

  for (const [type, expectedScore, expectedVote] of [
    ['UP', 1, 'UP'], ['UP', 0, null], ['DOWN', -1, 'DOWN'], ['UP', 1, 'UP'],
  ]) {
    const vote = await api(two, '/api/votes', { method: 'POST', json: { postId: post.id, type } }, 200, 'Vote toggle');
    check(vote.score === expectedScore && vote.myVote === expectedVote, 'Vote toggle or switch returned an incorrect state');
  }
  const afterVotes = await api(two, postPath, {}, 200, 'Persisted vote state');
  check(afterVotes.score === 1 && afterVotes.myVote === 'UP' && afterVotes.commentCount === 1, 'Reloaded vote/comment state differs');
  passed('upvote, toggle off, downvote, switch, and persisted counts are correct');

  const simultaneousVotes = await Promise.all([
    api(one, '/api/votes', { method: 'POST', json: { postId: post.id, type: 'DOWN' } }, 200, 'Concurrent first-account vote'),
    api(two, '/api/votes', { method: 'POST', json: { postId: post.id, type: 'DOWN' } }, 200, 'Concurrent second-account vote'),
  ]);
  check(simultaneousVotes.every((vote) => vote.myVote === 'DOWN'), 'Concurrent votes did not keep each account\'s own vote');
  const simultaneousViews = await Promise.all([
    api(one, postPath, {}, 200, 'First-account concurrent vote read'),
    api(two, postPath, {}, 200, 'Second-account concurrent vote read'),
  ]);
  check(simultaneousViews.every((view) => view.score === -2 && view.myVote === 'DOWN'), 'Concurrent votes have an inconsistent final score');
  passed('two simultaneous account mutations both succeed and produce the same final vote score');

  await api(two, '/api/votes', { method: 'POST', json: { postId: post.id, type: 'SIDEWAYS' } }, 400, 'Invalid vote');
  await api(two, '/api/comments', { method: 'POST', json: { postId: post.id, body: '   ' } }, 400, 'Empty comment');
  const missing = `missing-${randomUUID().slice(0, 20)}`;
  await api(one, `/api/posts/${missing}`, {}, 404, 'Missing post read');
  await api(two, '/api/comments', { method: 'POST', json: { postId: missing, body: 'Missing parent' } }, 404, 'Missing comment parent');
  await api(two, '/api/votes', { method: 'POST', json: { postId: missing, type: 'UP' } }, 404, 'Missing vote parent');
  passed('invalid votes/comments and missing parent posts return documented errors');

  const paginationIds = new Set();
  const paginationLabel = `Local pagination ${Date.now()} ${randomUUID().slice(0, 8)}`;
  for (let index = 0; index < 22; index += 1) {
    const created = await api(one, '/api/posts', {
      method: 'POST', json: {
        title: `${paginationLabel} ${index + 1}`,
        body: 'Synthetic pagination fixture. Removed by this integration check.',
        board: 'hostel',
      },
    }, 201, 'Pagination fixture creation');
    check(typeof created.id === 'string' && created.isMine === true, 'Pagination fixture ownership is incorrect');
    paginationIds.add(created.id);
  }
  check(paginationIds.size === 22, 'Pagination fixtures were not distinct');

  const seen = new Set();
  const seenOwn = new Set();
  const seenCursors = new Set();
  let cursor = null;
  let pageCount = 0;
  do {
    const query = new URLSearchParams({ board: 'hostel' });
    if (cursor) query.set('cursor', cursor);
    const page = await api(two, `/api/posts?${query}`, {}, 200, 'Twenty-row pagination');
    check(Array.isArray(page.posts) && page.posts.length <= 20, 'A feed page exceeded its twenty-row limit');
    if (pageCount === 0) {
      check(page.posts.length === 20 && typeof page.nextCursor === 'string', 'The first twenty-row page did not expose a next cursor');
    }
    for (const item of page.posts) {
      check(item.board === 'hostel', 'Board pagination returned another board');
      check(!seen.has(item.id), 'Pagination repeated a post across pages');
      seen.add(item.id);
      if (paginationIds.has(item.id)) seenOwn.add(item.id);
    }
    check(page.nextCursor === null || typeof page.nextCursor === 'string', 'Pagination returned an invalid cursor');
    if (page.nextCursor) {
      check(!seenCursors.has(page.nextCursor), 'Pagination repeated a next cursor');
      seenCursors.add(page.nextCursor);
    }
    cursor = page.nextCursor;
    pageCount += 1;
    // Our fixtures are the newest twenty-two posts. Bound traversal so the
    // check remains small even when an existing local board has a long history.
  } while (cursor && seenOwn.size < paginationIds.size && pageCount < 3);
  check(pageCount >= 2 && seenOwn.size === paginationIds.size, 'Pagination skipped one of the twenty-two newly created posts');
  passed('twenty-two own posts paginate in twenty-row pages without duplicate or missing records');

  const existingCursor = paginationIds.values().next().value;
  const crossBoard = new URLSearchParams({ board: 'general', cursor: existingCursor });
  await api(one, `/api/posts?${crossBoard}`, {}, 400, 'Cross-board cursor');
  await api(one, `/api/posts?cursor=${encodeURIComponent(missing)}`, {}, 400, 'Unknown expired cursor');
  await api(one, `/api/posts/${encodeURIComponent(existingCursor)}`, { method: 'DELETE' }, 200, 'Delete own cursor anchor');
  const deletedCursor = new URLSearchParams({ board: 'hostel', cursor: existingCursor });
  await api(one, `/api/posts?${deletedCursor}`, {}, 400, 'Deleted cursor anchor');
  passed('cross-board, unknown, and deleted cursor anchors return JSON 400');

  const deleted = await api(one, postPath, { method: 'DELETE' }, 200, 'Owner deletion');
  check(deleted.success === true, 'Owner deletion did not report success');
  await api(one, postPath, {}, 404, 'Deleted post read');
  const afterDelete = await api(two, commentsPath, {}, 200, 'Deleted post comments');
  check(Array.isArray(afterDelete.comments) && afterDelete.comments.length === 0, 'Deleted post retained readable comments');
  await api(two, '/api/votes', { method: 'POST', json: { postId: post.id, type: 'UP' } }, 404, 'Deleted post vote');
  passed('owner deletion removes the post and its comments and prevents further votes');

  succeeded = true;
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  console.error(`Local integration failed: ${message}${message === 'fetch failed' ? '. Start npm run local, wait for it to be ready, and rerun this check.' : ''}`);
  process.exitCode = 1;
} finally {
  let cleanupFailures = 0;
  for (const [createdPostId, owner] of createdPosts) {
    try {
      const cleanup = await owner.request(`/api/posts/${encodeURIComponent(createdPostId)}`, { method: 'DELETE' });
      check(cleanup.response.status === 200 || cleanup.response.status === 404, 'Own integration post cleanup failed');
    } catch {
      cleanupFailures += 1;
    }
  }
  if (cleanupFailures) {
    console.error('Could not clean up every integration-created post; remove the synthetic integration fixtures using the first local account.');
    process.exitCode = 1;
  }
}

if (succeeded && process.exitCode !== 1) {
  console.log(`Local integration passed: ${completed} check groups. All integration-created posts were removed; no seeded welcome posts were changed.`);
}
