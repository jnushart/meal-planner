const MAX_HTML_BYTES = 8_000_000;
const MAX_REDIRECTS = 4;
const RECIPE_FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; Ladle Recipe Importer/1.0)';
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://meal-planner.nushartj.workers.dev',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
]);

function responseHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = new Set(
    (Deno.env.get('LADLE_ALLOWED_ORIGINS') || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
  for (const allowed of DEFAULT_ALLOWED_ORIGINS) allowedOrigins.add(allowed);
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin'
  });
  if (allowedOrigins.has(origin)) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-headers', 'authorization, content-type, apikey, x-client-info');
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  return headers;
}

function json(request: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(request) });
}

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function validateRecipeUrl(rawValue: unknown) {
  let target: URL;
  try {
    target = new URL(String(rawValue || ''));
  } catch {
    throw new Error('Please provide a valid recipe URL.');
  }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only public HTTP(S) recipe links are supported.');
  if (target.username || target.password) throw new Error('Recipe links with embedded credentials are not supported.');
  const hostname = target.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]' || isPrivateIPv4(hostname)) {
    throw new Error('That recipe link does not point to a public website.');
  }
  return target;
}

async function readLimitedText(body: ReadableStream<Uint8Array> | null) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error('That recipe page is too large to read.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchRecipePage(rawUrl: unknown) {
  let target = validateRecipeUrl(rawUrl);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(target, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'accept-language': 'en-US,en;q=0.8',
        'user-agent': RECIPE_FETCH_USER_AGENT
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('The recipe site returned an incomplete redirect.');
      target = validateRecipeUrl(new URL(location, target).href);
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/(?:html|xhtml|text\/plain)/i.test(contentType)) {
      await response.body?.cancel();
      throw new Error('That link does not point to a readable recipe page.');
    }
    const html = await readLimitedText(response.body);
    if (!html.trim()) throw new Error('The recipe site returned an empty page.');
    return { html, finalUrl: target.href };
  }
  throw new Error('The recipe site redirected too many times.');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Only POST is supported.' }, 405);
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: 'The recipe request was not valid JSON.' }, 400);
  }
  try {
    return json(request, await fetchRecipePage(payload.url));
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'The recipe page could not be read.' }, 502);
  }
});
