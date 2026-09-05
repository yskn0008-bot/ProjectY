import {getVercelOidcToken} from '@vercel/oidc';

const JWT_SEGMENT = '[A-Za-z0-9_-]+';
const JWT_PATTERN = new RegExp(`^${JWT_SEGMENT}\\.${JWT_SEGMENT}\\.${JWT_SEGMENT}$`, 'u');

export function validateVercelOidcToken(value: string): string {
  const token = value.trim();
  if (!token) throw new Error('Vercel OIDC token is required');
  if (token.length > 8192) throw new Error('Vercel OIDC token is too large');
  if (!JWT_PATTERN.test(token)) throw new Error('Vercel OIDC token format is invalid');
  return token;
}

export async function readVercelOidcToken(): Promise<string | undefined> {
  const raw = await getVercelOidcToken();
  if (!raw?.trim()) return undefined;
  return validateVercelOidcToken(raw);
}

export async function requireVercelOidcToken(): Promise<string> {
  const token = await readVercelOidcToken();
  if (!token) throw new Error('Vercel OIDC token is required');
  return token;
}
