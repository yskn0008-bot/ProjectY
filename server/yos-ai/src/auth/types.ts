export interface VerifiedGoogleIdentity {
  subject: string;
  audience: string | string[];
  issuer: string;
  expiresAt: number;
  issuedAt?: number;
  emailVerified?: boolean;
}

export interface IdentityVerifier {
  verify(idToken: string): Promise<VerifiedGoogleIdentity>;
}

export interface AuthorizedIdentity {
  subjectHash: string;
}
