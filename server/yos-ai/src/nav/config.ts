import type {Environment, GoogleWorkloadAuthConfig} from '../config.js';

export interface NavModelRuntimeConfig {
  allowedOrigins: string[];
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  spreadsheetId: string;
  cacheMilliseconds: number;
}

export function loadNavModelRuntimeConfig(environment: Environment): NavModelRuntimeConfig {
  const nodeEnvironment = environment.NODE_ENV ?? 'production';
  return {
    allowedOrigins: parseOrigins(required(environment, 'YOS_ALLOWED_ORIGINS'), nodeEnvironment),
    googleWorkloadAuth: parseGoogleWorkloadAuth(environment, nodeEnvironment),
    spreadsheetId: privateId(environment, 'PROJECT75_SPREADSHEET_ID'),
    cacheMilliseconds: positiveInteger(environment, 'YOS_NAV_MODEL_CACHE_SECONDS', 900, 86_400) * 1000
  };
}

function parseGoogleWorkloadAuth(environment: Environment, nodeEnvironment: string): GoogleWorkloadAuthConfig {
  const mode = environment.GOOGLE_AUTH_MODE?.trim() || (nodeEnvironment === 'production' ? 'vercel_oidc' : 'application_default');
  if (mode === 'application_default') {
    if (nodeEnvironment === 'production') {
      throw new Error('GOOGLE_AUTH_MODE=application_default is not allowed in production by default');
    }
    return {mode};
  }
  if (mode !== 'vercel_oidc') throw new Error('GOOGLE_AUTH_MODE must be vercel_oidc or application_default');
  return {
    mode,
    projectNumber: digits(environment, 'GCP_PROJECT_NUMBER'),
    workloadIdentityPoolId: identifier(environment, 'GCP_WORKLOAD_IDENTITY_POOL_ID'),
    workloadIdentityProviderId: identifier(environment, 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'),
    serviceAccountEmail: required(environment, 'GCP_SERVICE_ACCOUNT_EMAIL')
  };
}

function parseOrigins(raw: string, nodeEnvironment: string): string[] {
  const origins = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  if (origins.length === 0) throw new Error('YOS_ALLOWED_ORIGINS must include at least one origin');
  for (const origin of origins) {
    const url = new URL(origin);
    const localDevelopment = nodeEnvironment !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.origin !== origin || (url.protocol !== 'https:' && !localDevelopment)) {
      throw new Error('YOS_ALLOWED_ORIGINS must contain exact HTTPS origins');
    }
  }
  return origins;
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function privateId(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!/^[A-Za-z0-9_-]{10,200}$/u.test(value)) throw new Error(`Invalid private resource identifier: ${name}`);
  return value;
}

function identifier(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!/^[a-z][a-z0-9-]{2,62}$/u.test(value)) throw new Error(`Invalid Google Cloud identifier: ${name}`);
  return value;
}

function digits(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!/^\d{6,30}$/u.test(value)) throw new Error(`Invalid Google Cloud project number: ${name}`);
  return value;
}

function positiveInteger(environment: Environment, name: string, fallback: number, maximum: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid positive integer environment variable: ${name}`);
  }
  return value;
}
