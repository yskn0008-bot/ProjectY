const NO_STORE = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin'
};

function allowedOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = new Set((process.env.YOS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : null;
}

function response(body, status, origin, headers = {}) {
  const responseHeaders = {
    ...NO_STORE,
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    ...headers
  };
  if (status === 204) return new Response(null, { status, headers: responseHeaders });
  return Response.json(body, { status, headers: responseHeaders });
}

export default {
  async fetch(request) {
    const origin = allowedOrigin(request);
    if (!origin) return response({ error: 'Origin not allowed' }, 403, null);
    if (request.method === 'OPTIONS') {
      return response({}, 204, origin, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '600'
      });
    }
    if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405, origin, { Allow: 'GET, OPTIONS' });

    const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    if (!googleClientId.endsWith('.apps.googleusercontent.com')) {
      return response({ error: 'YOS is temporarily unavailable' }, 503, origin);
    }
    return response({ googleClientId }, 200, origin);
  }
};
