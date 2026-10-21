import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { emailToAnonId } from '../lib/hash';
import { printAnonId } from '../scripts/print-anon-id.mjs';

const PEPPER = 'synthetic-helper-pepper-at-least-32-characters';
const EMAIL = '  SYNTHETIC.STUDENT@RKGIT.EDU.IN  ';
const SCRIPT = fileURLToPath(new URL('../scripts/print-anon-id.mjs', import.meta.url));

function expectedId(pepper: string, email: string) {
  const previous = process.env.ANON_PEPPER;
  process.env.ANON_PEPPER = pepper;
  try { return emailToAnonId(email); }
  finally {
    if (previous === undefined) delete process.env.ANON_PEPPER;
    else process.env.ANON_PEPPER = previous;
  }
}

async function terminalRun(pepperInput: string, email = EMAIL) {
  const rawModes: boolean[] = [];
  const input = Object.assign(new PassThrough(), {
    isTTY: true, isRaw: false,
    setRawMode(raw: boolean): void { input.isRaw = raw; rawModes.push(raw); },
  });
  const terminal = Object.assign(new PassThrough(), { isTTY: true });
  const output = new PassThrough();
  let stdout = '', display = '', hiddenOutput = '';
  let waitingForEmail = false;
  output.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  terminal.on('data', (chunk: Buffer) => {
    const value = chunk.toString();
    display += value;
    if (value === 'ANON_PEPPER (hidden): ') {
      queueMicrotask(() => input.write(pepperInput));
    } else if (value === 'Email: ') {
      waitingForEmail = true;
      queueMicrotask(() => input.write(email + '\r'));
    } else if (!waitingForEmail) hiddenOutput += value;
  });
  const status = await printAnonId({ input, terminal, output });
  assert.equal(input.isRaw, false);
  assert.equal(rawModes.at(-1), false);
  assert.equal(hiddenOutput, '\n');
  assert.ok(!display.includes(PEPPER));
  input.destroy(); terminal.destroy(); output.destroy();
  return { status, stdout, display };
}

test('standalone helper stdout equals emailToAnonId for fake inputs; only the normal email prompt echoes', async () => {
  const result = await terminalRun(PEPPER + '\r');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, expectedId(PEPPER, EMAIL) + '\n');
  assert.match(result.stdout, /^[a-f0-9]{32}\n$/);
  assert.ok(!result.stdout.includes(EMAIL));
  assert.ok(result.display.includes(EMAIL));
});

test('hidden input supports backspace and preserves pepper whitespace exactly', async () => {
  const pepper = ' ' + PEPPER + ' ';
  const result = await terminalRun(pepper + 'x\u007f\r');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, expectedId(pepper, EMAIL) + '\n');
});

test('hidden input and extra pasted text cannot be recalled into the normal email prompt', async () => {
  for (const input of [PEPPER + '\u0015' + PEPPER + '\r', PEPPER + '\r' + PEPPER]) {
    const result = await terminalRun(input, '\u0019' + EMAIL);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expectedId(PEPPER, EMAIL) + '\n');
  }
});

test('short peppers, EOF and Ctrl+C produce no ID and restore terminal echo', async () => {
  const short = await terminalRun('short-synthetic-value\r');
  assert.equal(short.status, 1);
  assert.equal(short.stdout, '');
  const cancelled = await terminalRun(PEPPER + '\u0003');
  assert.equal(cancelled.status, 130);
  assert.equal(cancelled.stdout, '');
  const closed = await terminalRun('\u0004');
  assert.equal(closed.status, 1);
  assert.equal(closed.stdout, '');
});

test('the CLI refuses piped input and arguments without echoing fake inputs or diagnostics', () => {
  for (const args of [[], ['--unsupported']]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      input: PEPPER + '\n' + EMAIL + '\n', encoding: 'utf8', windowsHide: true, timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
