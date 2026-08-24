import {loadYosRuntimeConfig, type Environment} from './config.js';
import {loadYosStorageConfig} from './storage/config.js';

export type PreflightCheckStatus = 'pass' | 'fail' | 'warning';

export interface PreflightCheck {
  id: string;
  status: PreflightCheckStatus;
  message: string;
}

export interface ProductionPreflightReport {
  status: 'ready' | 'blocked';
  checks: PreflightCheck[];
  failed: number;
  warnings: number;
}

const REQUIRED_VARIABLES = [
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'YOS_ALLOWED_ORIGINS',
  'GOOGLE_ALLOWED_SUBJECT_HASH',
  'GCP_PROJECT_NUMBER',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'YOS_LAW_DOCUMENT_ID',
  'YOS_MASTER_DOCUMENT_ID',
  'YOS_CHANGE_LOG_DOCUMENT_ID',
  'YOS_SYSTEM_MASTER_DOCUMENT_ID',
  'YOS_TAXI_MASTER_DOCUMENT_ID',
  'PROJECT75_SPREADSHEET_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
] as const;

const PLACEHOLDER_PATTERN = /^(?:changeme|example|placeholder|secret|todo|your[_-]|<.+>)$/iu;

export function runProductionPreflight(environment: Environment): ProductionPreflightReport {
  const checks: PreflightCheck[] = [];

  for (const name of REQUIRED_VARIABLES) {
    const value = environment[name]?.trim();
    if (!value) {
      checks.push({id: name, status: 'fail', message: `${name} is missing`});
      continue;
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      checks.push({id: name, status: 'fail', message: `${name} still contains a placeholder`});
      continue;
    }
    checks.push({id: name, status: 'pass', message: `${name} is set`});
  }

  validateLoader('runtime_config', () => loadYosRuntimeConfig({...environment, NODE_ENV: 'production'}), checks);
  validateLoader('storage_config', () => loadYosStorageConfig(environment), checks);

  const subjectHash = environment.GOOGLE_ALLOWED_SUBJECT_HASH?.trim();
  if (subjectHash && !/^[A-Za-z0-9_-]{43}$/u.test(subjectHash)) {
    checks.push({
      id: 'subject_hash_format',
      status: 'warning',
      message: 'GOOGLE_ALLOWED_SUBJECT_HASH should be an unpadded SHA-256 Base64URL digest'
    });
  } else if (subjectHash) {
    checks.push({id: 'subject_hash_format', status: 'pass', message: 'Subject hash format is valid'});
  }

  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  if (clientId && !clientId.endsWith('.apps.googleusercontent.com')) {
    checks.push({
      id: 'google_client_id_format',
      status: 'warning',
      message: 'GOOGLE_CLIENT_ID does not use the standard Google OAuth client ID suffix'
    });
  } else if (clientId) {
    checks.push({id: 'google_client_id_format', status: 'pass', message: 'Google client ID format is valid'});
  }

  const serviceAccountEmail = environment.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (serviceAccountEmail && !serviceAccountEmail.endsWith('.iam.gserviceaccount.com')) {
    checks.push({
      id: 'service_account_format',
      status: 'warning',
      message: 'GCP_SERVICE_ACCOUNT_EMAIL does not use the standard service account domain'
    });
  } else if (serviceAccountEmail) {
    checks.push({id: 'service_account_format', status: 'pass', message: 'Service account email format is valid'});
  }

  if ((environment.GOOGLE_AUTH_MODE?.trim() || 'vercel_oidc') !== 'vercel_oidc') {
    checks.push({
      id: 'keyless_auth',
      status: 'fail',
      message: 'Production requires GOOGLE_AUTH_MODE=vercel_oidc'
    });
  } else {
    checks.push({id: 'keyless_auth', status: 'pass', message: 'Keyless Google authentication is selected'});
  }

  const failed = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  return {
    status: failed === 0 ? 'ready' : 'blocked',
    checks,
    failed,
    warnings
  };
}

function validateLoader(id: string, load: () => unknown, checks: PreflightCheck[]): void {
  try {
    load();
    checks.push({id, status: 'pass', message: `${id} is valid`});
  } catch (error) {
    checks.push({
      id,
      status: 'fail',
      message: error instanceof Error ? error.message : `${id} is invalid`
    });
  }
}