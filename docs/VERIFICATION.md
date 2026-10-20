# Verification

Run from the repository root with Node 20.9+ and Python 3.11+:

```sh
npm ci
npm run backend:install
npm test
npm run test:backend
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

CI repeats backend tests, frontend tests/types/lint, the production npm dependency audit, and production build without real credentials or a production database. Backend tests use disposable SQLite; the local integration suite exercises real PostgreSQL.

With `npm run local` running in another terminal:

```sh
npm run test:local
npm run test:smoke
```

For an alternate printed port use `node scripts/local-check.mjs http://localhost:3001`. The local runner only accepts loopback targets. It checks sessions, onboarding, account ownership, strict errors, votes (including concurrent changes), comments, public response privacy, pagination/cursors, and cascading deletion. It removes its temporary posts and may initialize the third demo account as `localtester`.

Backend tests cover unsigned/forged/expired/wrong-scope assertions, algorithm allowlisting, request binding, mutation replay, strict validation, ownership, votes, cascade behavior, pagination, shared database rate limits, bounds, generic errors, trusted hosts, production docs, and fail-closed configuration. Frontend tests cover HMAC compatibility, auth privacy, middleware controls, local boundaries, assertion signing, same-origin enforcement, bounded bodies, and deadlines.

## Checks for a real deployment

Follow DEPLOYMENT.md for Vercel + Render + Supabase and run the read-only scripts/deployment-smoke.mjs against real HTTPS origins. Local checks do not establish any of the following. Verify against your intended services before launch:

- [ ] Apply Alembic to the reviewed/backed-up PostgreSQL database. Confirm old data, aliases, pepper, and vote enum remain intact.
- [ ] Verify RLS on all forum/security tables and no public Supabase Data API reads/writes. Verify the restricted server role has the required access.
- [ ] Keep database credentials only in FastAPI; Google/session/pepper only in Next.js; give both servers the same independent service secret. Keep demo flags disabled.
- [ ] Test verified @rkgit.edu.in Google Workspace sign-in with matching hd, personal Gmail rejection, old unrestricted session invalidation, first alias, duplicate/reserved alias rejection, logout, and eight-hour session expiry.
- [ ] Verify session responses contain only the user's own ID, alias, and expiry; public content responses expose no identity fields other than usernames.
- [ ] Repeat create/comment/vote/toggle/delete across two browser profiles; cross-account deletion must return 403 and leave the post intact.
- [ ] Unauthenticated direct backend business requests return 401; production docs are unavailable. Cross-site or missing-Origin frontend mutations return 403.
- [ ] Test production CSP with login, hydration, forms and navigation; inspect actual TLS, secure cookies, HSTS and framing headers at the deployed edge.
- [ ] Restrict database/backend ingress, require TLS, verify provider certificate/hostname trust, and enforce body/header/read-time and unauthenticated rate limits at the reverse proxy.
- [ ] Check logging configuration without copying real tokens, cookies, request bodies, profiles, or secrets. Provider IP logging is separate from application storage.
- [ ] Monitor dependencies, failed requests and aggregate abuse without storing identities/IPs in application logs. Test backup restoration and protect the stable pepper.
- [ ] Add an appropriate moderation/reporting process before broad campus access.

Deployment remains unverified until these checks are actually completed against the intended environment.
