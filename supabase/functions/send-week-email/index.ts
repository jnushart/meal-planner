const MAX_HTML_LENGTH = 240_000;
const MAX_TEXT_LENGTH = 60_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

function cleanSingleLine(value: unknown, maxLength: number) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Only POST is supported.' }, 405);

  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const mailFrom = Deno.env.get('LADLE_MAIL_FROM') || '';
  if (!resendApiKey || !mailFrom) return json(request, { error: 'Email sending is not configured yet.' }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: 'The email request was not valid JSON.' }, 400);
  }

  const recipient = cleanSingleLine(payload.recipient, 254).toLowerCase();
  const subject = cleanSingleLine(payload.subject || 'Ladle · Your meal plan', 140);
  const html = String(payload.html || '');
  const text = String(payload.text || '');
  if (!EMAIL_PATTERN.test(recipient)) return json(request, { error: 'Enter a valid recipient email address.' }, 400);
  if (!html || html.length > MAX_HTML_LENGTH || !text || text.length > MAX_TEXT_LENGTH) return json(request, { error: 'The meal plan is too large to send.' }, 413);

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID()
    },
    body: JSON.stringify({ from: mailFrom, to: [recipient], subject, html, text })
  });
  if (!resendResponse.ok) {
    const providerMessage = await resendResponse.text().catch(() => '');
    console.error('Resend rejected Ladle email', resendResponse.status, providerMessage.slice(0, 500));
    return json(request, { error: resendResponse.status === 429 ? 'The email service is temporarily rate-limited. Try again shortly.' : 'The email service rejected the message. Check the sender address and email settings.' }, resendResponse.status === 429 ? 429 : 502);
  }

  const result = await resendResponse.json().catch(() => ({}));
  return json(request, { sent: true, id: result?.id || null });
});
