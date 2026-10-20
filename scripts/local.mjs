import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { projectRoot as root, backendRoot, pythonPath, ensurePython, runPython } from './python.mjs';

process.chdir(root);
const localDir = path.join(root, '.local');
await mkdir(localDir, { recursive: true });
const settingsPath = path.join(localDir, 'runtime.json');
const settings = existsSync(settingsPath) ? JSON.parse(await readFile(settingsPath, 'utf8')) : {
  version: 1, password: randomBytes(32).toString('hex'),
  sessionSecret: randomBytes(32).toString('hex'), anonPepper: randomBytes(32).toString('hex'),
};
settings.backendSharedSecret ??= randomBytes(32).toString('hex');
if (![settings.password, settings.sessionSecret, settings.anonPepper, settings.backendSharedSecret].every(value => typeof value === 'string' && value.length >= 32)) {
  throw new Error('Invalid local settings. Restore your private .local/runtime.json backup.');
}
await writeFile(settingsPath, JSON.stringify(settings), { mode: 0o600 });

async function availablePort(start) {
  for (let port = start; port < start + 30; port++) {
    if (await new Promise(resolve => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    })) return port;
  }
  throw new Error('No free local port. Stop another local server and retry.');
}
const appPort = await availablePort(3000);
const databasePort = await availablePort(5441);
const backendPort = await availablePort(8000);
const origin = `http://localhost:${appPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const databaseUrl = `postgresql://local_forum:${encodeURIComponent(settings.password)}@127.0.0.1:${databasePort}/college_forum_local`;
const sharedEnv = { ...process.env, COLLEGE_FORUM_LOCAL: '1', BACKEND_URL: backendUrl, BACKEND_SHARED_SECRET: settings.backendSharedSecret };
const backendEnv = { ...sharedEnv, APP_ENV: 'development', DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, PYTHONUTF8: '1' };
delete backendEnv.NEXTAUTH_SECRET;
delete backendEnv.ANON_PEPPER;
const webEnv = { ...sharedEnv, NODE_ENV: 'development', NEXTAUTH_URL: origin,
  NEXTAUTH_SECRET: settings.sessionSecret, ANON_PEPPER: settings.anonPepper,
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', ALLOWED_EMAIL_DOMAIN: '', NEXT_TELEMETRY_DISABLED: '1' };
delete webEnv.DATABASE_URL;
delete webEnv.DIRECT_URL;
const databaseDir = path.join(localDir, 'postgres');
const database = new EmbeddedPostgres({ databaseDir, user: 'local_forum', password: settings.password,
  port: databasePort, persistent: true, postgresFlags: ['-h', '127.0.0.1'],
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
let app, backend, databaseStarted = false, shuttingDown = false, stage = 'Python preparation';
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [app, backend]) {
    if (!child || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await new Promise(resolve => { stop.once('exit', resolve); stop.once('error', resolve); });
    } else child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
  }
  if (databaseStarted) await database.stop();
  process.exitCode = code;
  if (code) process.exit(code);
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
try {
  await ensurePython();
  stage = 'database initialization';
  console.log('Preparing local PostgreSQL and FastAPI. No external accounts or .env needed.');
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await database.initialise();
  await database.start();
  databaseStarted = true;
  const connection = database.getPgClient();
  await connection.connect();
  try {
    const existing = await connection.query("SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = 'college_forum_local'");
    if (existing.rows[0]?.encoding && existing.rows[0].encoding !== 'UTF8') throw new Error('UTF8 database required');
    if (!existing.rowCount) await connection.query("CREATE DATABASE college_forum_local WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
  } finally { await connection.end(); }
  stage = 'schema migration';
  await runPython(['-m', 'alembic', '-c', 'alembic.ini', 'upgrade', 'head'], backendEnv);
  if (!existsSync(path.join(localDir, 'seeded'))) {
    stage = 'sample data';
    await runPython(['-m', 'app.seed'], backendEnv);
    await writeFile(path.join(localDir, 'seeded'), '1\n');
  }
  stage = 'FastAPI startup';
  backend = spawn(pythonPath, ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', String(backendPort), '--no-access-log'],
    { cwd: backendRoot, env: backendEnv, stdio: 'inherit', windowsHide: true });
  backend.once('error', () => { console.error('FastAPI could not start.'); void shutdown(1); });
  backend.once('exit', code => { if (!shuttingDown) void shutdown(code || 1); });
  let ready = false;
  for (let attempt = 0; attempt < 60 && !shuttingDown; attempt++) {
    try { ready = (await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('FastAPI startup timed out');
  stage = 'frontend startup';
  console.log(`\nCollege Forum: ${origin}\nFastAPI docs (local only): ${backendUrl}/docs`);
  console.log('Shared demo accounts; saved data stays in .local/postgres. Ctrl+C stops all three services.\n');
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)],
    { cwd: root, env: webEnv, stdio: 'inherit', windowsHide: true });
  app.once('error', () => { console.error('Frontend could not start.'); void shutdown(1); });
  app.once('exit', code => { void shutdown(code ?? 0); });
} catch {
  console.error(`Local startup failed during ${stage}. Saved data was kept; check Python and port availability.`);
  await shutdown(1);
}
