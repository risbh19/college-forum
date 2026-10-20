export class GatewayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function requireSameOrigin(request: Request, configuredOrigin = process.env.NEXTAUTH_URL) {
  if (!configuredOrigin) throw new GatewayError(503, 'Server origin is not configured');
  const expected = new URL(configuredOrigin).origin;
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new GatewayError(403, 'Cross-site request rejected');
  }
}

export async function boundedBody(request: Request, timeoutMs = 10_000): Promise<string> {
  if (Number(request.headers.get('content-length') ?? 0) > 65536) throw new GatewayError(413, 'Request body is too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 65536) throw new GatewayError(413, 'Request body is too large');
          chunks.push(next.value);
        }
        return Buffer.concat(chunks).toString('utf8');
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new GatewayError(408, 'Request timed out')), timeoutMs); }),
    ]);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { clearTimeout(timer); }
}
