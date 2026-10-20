import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const backendRoot = path.join(projectRoot, 'backend');
export const pythonPath = path.join(backendRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

export function runPython(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, { cwd: backendRoot, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Python command failed')));
  });
}

export async function ensurePython() {
  if (!existsSync(pythonPath)) {
    const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    const candidates = [process.env.COLLEGE_FORUM_PYTHON, ...(existsSync(bundled) ? [bundled] : []), 'python3', 'python'].filter(Boolean);
    const base = candidates.find((candidate) => spawnSync(candidate, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'], { timeout: 5000, windowsHide: true, stdio: 'ignore' }).status === 0);
    if (!base) throw new Error('Python 3.11 or newer is required. Install Python and retry.');
    const result = spawnSync(base, ['-m', 'venv', path.join(backendRoot, '.venv')], { windowsHide: true, stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Could not create the backend Python environment');
  }
  const expected = createHash('sha256').update(readFileSync(path.join(backendRoot, 'requirements.txt'))).digest('hex');
  const marker = path.join(backendRoot, '.venv', '.requirements.sha256');
  if (!existsSync(marker) || readFileSync(marker, 'utf8') !== expected) {
    console.log('Installing the locked FastAPI dependencies into backend/.venv…');
    await runPython(['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt']);
    writeFileSync(marker, expected);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await ensurePython();
    const command = process.argv[2] ?? 'dev';
    if (command === 'test') await runPython(['-m', 'pytest', '-q']);
    else if (command === 'upgrade') await runPython(['-m', 'alembic', '-c', 'alembic.ini', 'upgrade', 'head']);
    else if (command === 'dev') await runPython(['-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8000', '--no-access-log', '--env-file', path.join(projectRoot, '.env')]);
    else if (command !== 'install') throw new Error('Unknown backend command');
  } catch {
    console.error('Backend command failed. Check Python, dependency installation, and private environment configuration.');
    process.exitCode = 1;
  }
}
