import type { IdentityVerifier, VerifiedGoogleIdentity } from './types.js';

export interface GoogleTokenPayload {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  email_verified?: boolean;
}

export interface GoogleLoginTicket {
  getPayload(): GoogleTokenPayload | undefined;
}

export interface GoogleAuthLibraryClient {
  verifyIdToken(options: {
    idToken: string;
    audience: string | string[];
  }): Promise<GoogleLoginTicket>;
}

export class GoogleAuthLibraryVerifier implements IdentityVerifier {
  constructor(
    private readonly client: GoogleAuthLibraryClient,
    private readonly audience: string | string[]
  ) {}

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    if (!idToken.trim()) throw new Error('Google ID token is required');
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.aud || !payload.iss || !payload.exp) {
      throw new Error('Google ID token payload is incomplete');
    }

    return {
      subject: payload.sub,
      audience: payload.aud,
      issuer: payload.iss,
      expiresAt: payload.exp,
      ...(payload.iat !== undefined ? { issuedAt: payload.iat } : {}),
      ...(payload.email_verified !== undefined ? { emailVerified: payload.email_verified } : {})
    };
  }
}
