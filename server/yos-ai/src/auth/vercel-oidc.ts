const VERCEL_OIDC_HEADER = 'x-vercel-oidc-token';
const JWT_SEGMENT = '[A-Za-z0-9_-]+';
const JWT_PATTERN = new RegExp(`^${JWT_SEGMENT}\\.${JWT_SEGMENT}\\.${JWT_SEGMENT}$`, 'u');

export function readVercelOidcToken(request: Request): string | undefined {
  const raw = request.headers.get(VERCEL_OIDC_HEADER)?.trim();
  if (!raw) return undefined;
  if (raw.length > 8192) throw new Error('Vercel OIDC token is too large');
  if (!JWT_PATTERN.test(raw)) throw new Error('Vercel OIDC token format is invalid');
  return raw;
}

export function requireVercelOidcToken(request: Request): string {
  const token = readVercelOidcToken(request);
  if (!token) throw new Error('Vercel OIDC token is required');
  return token;
}
