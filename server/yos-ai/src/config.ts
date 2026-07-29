export type Environment = Record<string, string | undefined>;

export type GoogleWorkloadAuthConfig =
  | {
      mode: 'vercel_oidc';
      projectNumber: string;
      workloadIdentityPoolId: string;
      workloadIdentityProviderId: string;
      serviceAccountEmail: string;
    }
  | {
      mode: 'application_default';
    };

export interface YosRuntimeConfig {
  openAiApiKey: string;
  openAiModel: string;
  googleClientId: string;
  allowedOrigins: string[];
  allowedSubjectHash: string;
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  sourceIds: {
    law: string;
    yosMaster: string;
    changeLog: string;
    systemMaster: string;
    taxiMaster: string;
    project75: string;
  };
  limits: {
    requestsPerHour: number;
    maxOutputTokens: number;
    liveMaxOutputTokens: number;
    maxContextCharacters: number;
    maxDocumentCharacters: number;
  };
}

export function loadYosRuntimeConfig(environment: Environment): YosRuntimeConfig {
  const nodeEnvironment = environment.NODE_ENV ?? 'production';
  return {
    openAiApiKey: required(environment, 'OPENAI_API_KEY'),
    openAiModel: environment.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
    googleClientId: required(environment, 'GOOGLE_CLIENT_ID'),
    allowedOrigins: parseOrigins(required(environment, 'YOS_ALLOWED_ORIGINS'), nodeEnvironment),
    allowedSubjectHash: required(environment, 'GOOGLE_ALLOWED_SUBJECT_HASH'),
    googleWorkloadAuth: parseGoogleWorkloadAuth(environment, nodeEnvironment),
    sourceIds: {
      law: privateId(environment, 'YOS_LAW_DOCUMENT_ID'),
      yosMaster: privateId(environment, 'YOS_MASTER_DOCUMENT_ID'),
      changeLog: privateId(environment, 'YOS_CHANGE_LOG_DOCUMENT_ID'),
      systemMaster: privateId(environment, 'YOS_SYSTEM_MASTER_DOCUMENT_ID'),
      taxiMaster: privateId(environment, 'YOS_TAXI_MASTER_DOCUMENT_ID'),
      project75: privateId(environment, 'PROJECT75_SPREADSHEET_ID')
    },
    limits: {
      requestsPerHour: positiveInteger(environment, 'YOS_REQUESTS_PER_HOUR', 30, 1_000),
      maxOutputTokens: positiveInteger(environment, 'YOS_MAX_OUTPUT_TOKENS', 5_000, 128_000),
      liveMaxOutputTokens: positiveInteger(environment, 'YOS_LIVE_MAX_OUTPUT_TOKENS', 1_500, 20_000),
      maxContextCharacters: positiveInteger(environment, 'YOS_MAX_CONTEXT_CHARACTERS', 100_000, 1_000_000),
      maxDocumentCharacters: positiveInteger(environment, 'YOS_MAX_DOCUMENT_CHARACTERS', 30_000, 200_000)
    }
  };
}

function parseGoogleWorkloadAuth(environment: Environment, nodeEnvironment: string): GoogleWorkloadAuthConfig {
  const mode = environment.GOOGLE_AUTH_MODE?.trim() || (nodeEnvironment === 'production' ? 'vercel_oidc' : 'application_default');
  if (mode === 'application_default') {
    if (nodeEnvironment === 'production') {
      throw new Error('GOOGLE_AUTH_MODE=application_default is not allowed in production by default');
    }
    return { mode };
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

function positiveInteger(environment: Environment, name: string, fallback: number, maximum: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid positive integer environment variable: ${name}`);
  }
  return value;
}
