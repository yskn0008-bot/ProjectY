import type { AuthorizedIdentity, VerifiedGoogleIdentity } from './types.js';

const GOOGLE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com'
]);

export interface IdentityGateOptions {
  expectedAudience: string | string[];
  allowedSubjectHash: string;
  clock?: () => number;
  allowedClockSkewSeconds?: number;
  requireEmailVerified?: boolean;
}

export class IdentityGate {
  private readonly expectedAudiences: Set<string>;
  private readonly clock: () => number;
  private readonly allowedClockSkewSeconds: number;

  constructor(private readonly options: IdentityGateOptions) {
    const audiences = Array.isArray(options.expectedAudience)
      ? options.expectedAudience
      : [options.expectedAudience];
    if (audiences.length === 0 || audiences.some((value) => !value.trim())) {
      throw new Error('expectedAudience is required');
    }
    if (!options.allowedSubjectHash.trim()) throw new Error('allowedSubjectHash is required');

    this.expectedAudiences = new Set(audiences);
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.allowedClockSkewSeconds = options.allowedClockSkewSeconds ?? 60;
  }

  async authorize(identity: VerifiedGoogleIdentity): Promise<AuthorizedIdentity> {
    const now = this.clock();
    if (!identity.subject.trim() || identity.subject.length > 255) {
      throw new Error('identity subject is invalid');
    }
    if (!GOOGLE_ISSUERS.has(identity.issuer)) throw new Error('identity issuer is invalid');
    if (!matchesAudience(identity.audience, this.expectedAudiences)) {
      throw new Error('identity audience is invalid');
    }
    if (!Number.isSafeInteger(identity.expiresAt) || identity.expiresAt + this.allowedClockSkewSeconds <= now) {
      throw new Error('identity token is expired');
    }
    if (identity.issuedAt !== undefined && identity.issuedAt > now + this.allowedClockSkewSeconds) {
      throw new Error('identity token was issued in the future');
    }
    if (this.options.requireEmailVerified && identity.emailVerified !== true) {
      throw new Error('identity email is not verified');
    }

    const subjectHash = await sha256Base64Url(identity.subject);
    if (!constantTimeStringEqual(subjectHash, this.options.allowedSubjectHash)) {
      throw new Error('identity is not authorized');
    }
    return { subjectHash };
  }
}

function matchesAudience(audience: string | string[], expected: Set<string>): boolean {
  const actual = Array.isArray(audience) ? audience : [audience];
  return actual.some((value) => expected.has(value));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
