import { boundedBody, GatewayError } from './gateway-security';

/** Bound actual UTF-8 bytes, including chunked requests, before parsing JSON. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await boundedBody(request);
  try { return JSON.parse(text) as unknown; }
  catch { throw new GatewayError(400, 'Invalid JSON'); }
}
