import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const localDir = path.join(root, '.local');
await mkdir(localDir, { recursive: true });

// These keys belong only to this isolated local installation. They are never
// printed, shared with Google, or written to .env or tracked source files.
const settingsPath = path.join(localDir, 'runtime.json');
if (!existsSync(settingsPath)) {
  const value = {
    version: 1,
    password: randomBytes(32).toString('hex'),
    sessionSecret: randomBytes(32).toString('hex'),
    anonPepper: randomBytes(32).toString('hex'),
  };
  await writeFile(settingsPath, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
}
const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
if (![settings.password, settings.sessionSecret, settings.anonPepper].every((value) => typeof value === 'string' && value.length >= 32)) {
  throw new Error('Local runtime settings are invalid. Restore your .local/runtime.json backup.');
}

async function availablePort(start) {
  for (let port = start; port < start + 30; port += 1) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No free local port is available. Stop another local server and retry.');
}

const appPort = await availablePort(3000);
const databasePort = await availablePort(5441);
const origin = `http://localhost:${appPort}`;
const databaseUrl = `postgresql://local_forum:${encodeURIComponent(settings.password)}@127.0.0.1:${databasePort}/college_forum_local`;
const localEnv = {
  ...process.env,
  NODE_ENV: 'development',
  COLLEGE_FORUM_LOCAL: '1',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  NEXTAUTH_URL: origin,
  NEXTAUTH_SECRET: settings.sessionSecret,
  ANON_PEPPER: settings.anonPepper,
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  ALLOWED_EMAIL_DOMAIN: '',
  NEXT_TELEMETRY_DISABLED: '1',
};

const databaseDir = path.join(localDir, 'postgres');
const database = new EmbeddedPostgres({
  databaseDir,
  user: 'local_forum',
  password: settings.password,
  port: databasePort,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});

let app;
let databaseStarted = false;
let shuttingDown = false;
let stage = 'database initialization';

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (app && app.exitCode === null) {
    if (process.platform === 'win32') {
      // Next dev owns a child server. Stop only the tree we launched so a
      // stale child cannot keep the port after the database has stopped.
      const stop = spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await new Promise((resolve) => { stop.once('exit', resolve); stop.once('error', resolve); });
    } else {
      app.kill('SIGTERM');
    }
    await new Promise((resolve) => {
      app.once('exit', resolve);
      setTimeout(resolve, 4000).unref();
    });
  }
  if (databaseStarted) await database.stop();
  process.exitCode = code;
  if (code !== 0) process.exit(code);
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const command = spawn(process.execPath, [path.join(root, script), ...args], {
      cwd: root, env: localEnv, stdio: 'inherit', windowsHide: true,
    });
    command.once('error', reject);
    command.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Local database preparation failed.')));
  });
}

async function seed() {
  if (existsSync(path.join(localDir, 'seeded'))) return;
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const user of [
      { id: '11111111111111111111111111111111', username: 'shadowcoder42' },
      { id: '22222222222222222222222222222222', username: 'campusowl' },
    ]) {
      await client.user.upsert({
        where: { id: user.id }, update: {},
        create: { ...user, usernameLower: user.username.toLowerCase() }, select: { id: true },
      });
    }
    const samples = [
      { id: 'local-welcome', board: 'general', title: 'Welcome to your campus common room 👋', body: 'This is your local College Forum. Start a discussion, try the boards, and make this space your own.\n\nThese welcome posts are sample content. Your new posts, votes, and comments are saved on this computer.', userId: '11111111111111111111111111111111' },
      { id: 'local-study', board: 'cse', title: 'Anyone up for a weekend coding study group?', body: 'Thinking of a small group for DSA, side projects, and finally understanding that one lecture. What would you want to work on?\n\nSample discussion for exploring the CSE board.', userId: '22222222222222222222222222222222' },
      { id: 'local-hostel', board: 'hostel', title: 'What makes a hostel room feel like home?', body: 'A desk lamp, a good playlist, and a reliable snack stash are my top three. Add your small upgrades below.\n\nThis is a sample local discussion.', userId: '11111111111111111111111111111111' },
      { id: 'local-placements', board: 'placements', title: 'A place to share interview prep resources', body: 'Practice questions, resume tips, and lessons from mock interviews—what helped you most? Let’s build a useful thread.\n\nSample content; there are no real job listings here.', userId: '22222222222222222222222222222222' },
      { id: 'local-confessions', board: 'confessions', title: 'Small confession: I still get lost on campus', body: 'Every building looks familiar until I actually need to find a classroom. Please tell me this is a universal first-year experience.\n\nA fictional sample post for the local demo.', userId: '11111111111111111111111111111111' },
      { id: 'local-general', board: 'general', title: 'What’s one thing you wish you knew in your first semester?', body: 'Mine would be: ask the question, even if it feels obvious. Someone else is probably wondering the same thing.\n\nShare a tip in the comments. This is a sample discussion.', userId: '22222222222222222222222222222222' },
    ];
    for (const [index, sample] of samples.entries()) {
      await client.post.upsert({ where: { id: sample.id }, update: {}, create: { ...sample, createdAt: new Date(Date.now() - index * 3600000) }, select: { id: true } });
    }
    await client.comment.upsert({
      where: { id: 'local-welcome-comment' }, update: {},
      create: { id: 'local-welcome-comment', postId: 'local-welcome', userId: '22222222222222222222222222222222', body: 'Try switching accounts from the login page. Each account has its own votes, and only the author can delete a post.' }, select: { id: true },
    });
    await client.vote.upsert({
      where: { userId_postId: { userId: '22222222222222222222222222222222', postId: 'local-welcome' } },
      update: {}, create: { userId: '22222222222222222222222222222222', postId: 'local-welcome', type: 'UP' }, select: { type: true },
    });
    await writeFile(path.join(localDir, 'seeded'), '1\n');
  } finally {
    await client.$disconnect();
  }
}

try {
  console.log('Preparing local PostgreSQL. No external accounts or .env are needed.');
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await database.initialise();
  stage = 'database startup';
  await database.start();
  databaseStarted = true;
  const connection = database.getPgClient();
  await connection.connect();
  const existing = await connection.query("SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = 'college_forum_local'");
  if (existing.rows[0]?.encoding && existing.rows[0].encoding !== 'UTF8') {
    throw new Error('The saved local database must use UTF8 encoding.');
  } else if (existing.rowCount === 0) {
    await connection.query("CREATE DATABASE college_forum_local WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
  }
  await connection.end();
  stage = 'schema preparation';
  await runNode('node_modules/prisma/build/index.js', ['db', 'push', '--skip-generate']);
  stage = 'sample data';
  await seed();
  console.log(`\nCollege Forum local app: ${origin}`);
  console.log('Use either demo account or try username setup. Local accounts are shared, not private.');
  console.log('Posts and comments persist in .local/postgres. Press Ctrl+C to stop.\n');
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd: root, env: localEnv, stdio: 'inherit', windowsHide: true,
  });
  app.once('error', () => { console.error('The local web server could not start.'); void shutdown(1); });
  app.once('exit', (code) => { void shutdown(code ?? 0); });
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : error?.constructor?.name ?? 'Error';
  console.error(`Local startup failed during ${stage} (${code}). Your saved local data was kept.`);
  await shutdown(1);
}
