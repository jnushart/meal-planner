const MAX_HTML_BYTES = 8_000_000;
const MAX_REDIRECTS = 4;
const RECIPE_FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; Ladle Recipe Importer/1.0)';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function isPrivateIPv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function validateRecipeUrl(rawValue) {
  let target;
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

async function readLimitedText(body) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
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

async function fetchRecipePage(rawUrl) {
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
      response.body?.cancel();
      if (!location) throw new Error('The recipe site returned an incomplete redirect.');
      target = validateRecipeUrl(new URL(location, target).href);
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/(?:html|xhtml|text\/plain)/i.test(contentType)) {
      response.body?.cancel();
      throw new Error('That link does not point to a readable recipe page.');
    }
    const html = await readLimitedText(response.body);
    if (!html.trim()) throw new Error('The recipe site returned an empty page.');
    return { html, finalUrl: target.href };
  }
  throw new Error('The recipe site redirected too many times.');
}

async function handleRecipeImport(request) {
  if (request.method !== 'GET') return jsonResponse({ error: 'Only GET is supported for recipe importing.' }, 405);
  const rawUrl = new URL(request.url).searchParams.get('url');
  if (!rawUrl) return jsonResponse({ error: 'Add a recipe URL first.' }, 400);
  try {
    const result = await fetchRecipePage(rawUrl);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'The recipe page could not be read.' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/import') return handleRecipeImport(request);
    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'That hosted feature is not available.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
