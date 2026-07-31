import {GoogleAuth, IdentityPoolClient, OAuth2Client} from 'google-auth-library';
import type {GoogleWorkloadAuthConfig} from '../config.js';
import {GoogleAuthAccessTokenProvider, type AccessTokenProvider} from '../sources/access-token-provider.js';
import {GoogleAuthLibraryVerifier} from './google-auth-library-verifier.js';
import {validateVercelOidcToken} from './vercel-oidc.js';

export const GOOGLE_READ_ONLY_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
] as const;

export const GOOGLE_SHEETS_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
] as const;

const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const STS_TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const SERVICE_ACCOUNT_EMAIL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}@[A-Za-z0-9-]{3,63}\.iam\.gserviceaccount\.com$/u;

type GoogleScopes = readonly string[];

export function createGoogleIdentityVerifier(clientId: string): GoogleAuthLibraryVerifier {
  if (!clientId.trim()) throw new Error('Google client ID is required');
  return new GoogleAuthLibraryVerifier(new OAuth2Client(clientId), clientId);
}

export async function createGoogleAccessTokenProvider(
  config: GoogleWorkloadAuthConfig,
  vercelOidcToken?: string,
  scopes: GoogleScopes = GOOGLE_READ_ONLY_SCOPES
): Promise<AccessTokenProvider> {
  if (config.mode === 'application_default') {
    const auth = new GoogleAuth({scopes: [...scopes]});
    const client = await auth.getClient();
    return new GoogleAuthAccessTokenProvider(client);
  }

  return new GoogleAuthAccessTokenProvider(
    createVercelIdentityPoolClient(config, vercelOidcToken ?? '', scopes)
  );
}

export function createVercelIdentityPoolClient(
  config: Extract<GoogleWorkloadAuthConfig, {mode: 'vercel_oidc'}>,
  vercelOidcToken: string,
  scopes: GoogleScopes = GOOGLE_READ_ONLY_SCOPES
): IdentityPoolClient {
  const subjectToken = validateVercelOidcToken(vercelOidcToken);
  const audience = workloadIdentityAudience(config);
  const impersonationUrl = serviceAccountImpersonationUrl(config.serviceAccountEmail);

  return new IdentityPoolClient({
    type: 'external_account',
    audience,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: STS_TOKEN_URL,
    service_account_impersonation_url: impersonationUrl,
    scopes: [...scopes],
    subject_token_supplier: {
      async getSubjectToken(context) {
        if (context.audience !== audience) throw new Error('Google WIF audience mismatch');
        if (context.subjectTokenType !== SUBJECT_TOKEN_TYPE) {
          throw new Error('Google WIF subject token type mismatch');
        }
        return subjectToken;
      }
    }
  });
}

export function workloadIdentityAudience(
  config: Extract<GoogleWorkloadAuthConfig, {mode: 'vercel_oidc'}>
): string {
  return [
    '//iam.googleapis.com/projects',
    config.projectNumber,
    'locations/global/workloadIdentityPools',
    config.workloadIdentityPoolId,
    'providers',
    config.workloadIdentityProviderId
  ].join('/');
}

export function serviceAccountImpersonationUrl(serviceAccountEmail: string): string {
  if (!SERVICE_ACCOUNT_EMAIL.test(serviceAccountEmail)) {
    throw new Error('Google service account email is invalid');
  }
  return `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`;
}
