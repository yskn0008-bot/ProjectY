export interface CorsOptions {
  allowedOrigins: string[];
  allowMissingOrigin?: boolean;
}

export function allowedOrigin(request: Request, options: CorsOptions): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return options.allowMissingOrigin ? '' : null;
  return options.allowedOrigins.includes(origin) ? origin : null;
}

export function secureJson(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders: HeadersInit = {}
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Vary', 'Origin');
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), { status, headers });
}

export function corsPreflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    }
  });
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (!match?.[1] || match[1].length > 8192) throw new Error('Authorization failed');
  return match[1];
}
