import { createHmac } from 'node:crypto';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function hiddenPepper(input, terminal) {
  return new Promise(resolve => {
    const characters = [];
    const finish = (cancelled = false, entered = false) => {
      input.removeListener('keypress', keypress);
      input.removeListener('end', end);
      input.removeListener('error', end);
      const value = entered ? characters.join('') : undefined;
      characters.length = 0;
      resolve({ value, cancelled });
    };
    const end = () => finish();
    const keypress = (text, key) => {
      if (key?.ctrl && key.name === 'c') finish(true);
      else if (key?.ctrl && key.name === 'd') finish();
      else if (key?.name === 'return' || key?.name === 'enter') finish(false, true);
      else if (key?.name === 'backspace') characters.pop();
      else if (key?.ctrl && key.name === 'u') characters.length = 0;
      else if (!key?.ctrl && !key?.meta && text && !/[\u0000-\u001f\u007f-\u009f]/.test(text)) characters.push(...text);
    };
    // No readline history/kill ring and no output containing the secret, even while editing.
    emitKeypressEvents(input);
    input.on('keypress', keypress);
    input.once('end', end);
    input.once('error', end);
    terminal.write('ANON_PEPPER (hidden): ');
    input.resume();
  });
}

/**
 * Standalone local utility. No environment, files, network, or application imports.
 * @param {{ input?: import('node:stream').Readable & { isTTY?: boolean, isRaw?: boolean, setRawMode?: (raw: boolean) => unknown }, output?: import('node:stream').Writable, terminal?: import('node:stream').Writable & { isTTY?: boolean } }} [io]
 * @returns {Promise<number>}
 */
export async function printAnonId({ input = process.stdin, output = process.stdout, terminal = process.stderr } = {}) {
  if (!input.isTTY || !terminal.isTTY || typeof input.setRawMode !== 'function') return 1;
  const wasRaw = Boolean(input.isRaw);
  let cancelled = false, reader;
  const controller = new AbortController();
  const cancel = () => { cancelled = true; controller.abort(); };
  const close = () => controller.abort();
  let id;
  try {
    // Ask for the secret first so an early/pasted secret can never enter an echoing prompt.
    input.setRawMode(true);
    const { value: pepper, cancelled: secretCancelled } = await hiddenPepper(input, terminal);
    terminal.write('\n');
    if (secretCancelled) return 130;
    if (pepper === undefined || pepper.length < 32) return 1;
    reader = createInterface({ input, output: terminal, terminal: true, historySize: 0 });
    reader.once('SIGINT', cancel);
    reader.once('close', close);
    terminal.write('Email: ');
    const email = await reader.question('', { signal: controller.signal });
    id = createHmac('sha256', pepper).update(email.toLowerCase().trim()).digest('hex').slice(0, 32);
  } catch {
    // Never print input, errors, stack traces or configuration, including on cancellation.
    return cancelled ? 130 : 1;
  } finally {
    reader?.removeListener('close', close);
    reader?.removeListener('SIGINT', cancel);
    reader?.close();
    input.setRawMode(wasRaw);
    input.pause();
  }
  return new Promise(resolve => output.write(`${id}\n`, error => resolve(error ? 1 : 0)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No CLI arguments are accepted; neither email nor pepper can come from argv.
  if (process.argv.length !== 2) process.exitCode = 1;
  else {
    const finish = status => {
      // The ID write has finished; release Windows console handles after restoring echo.
      process.exit(status);
    };
    void printAnonId().then(finish, () => finish(1));
  }
}
