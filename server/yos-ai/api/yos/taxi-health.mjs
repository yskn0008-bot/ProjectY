const REQUIRED = [
  'GOOGLE_AUTH_MODE',
  'GCP_PROJECT_NUMBER',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'YOS_ALLOWED_ORIGINS',
  'PROJECT75_SPREADSHEET_ID',
  'YOS_TAXI_SYNC_TOKEN_SHA256'
];

function validate(environment) {
  const missing = REQUIRED.filter((name) => !String(environment[name] ?? '').trim());
  const invalid = [];

  const mode = String(environment.GOOGLE_AUTH_MODE ?? '').trim();
  if (mode && mode !== 'vercel_oidc') invalid.push('GOOGLE_AUTH_MODE');

  const projectNumber = String(environment.GCP_PROJECT_NUMBER ?? '').trim();
  if (projectNumber && !/^\d{6,30}$/u.test(projectNumber)) invalid.push('GCP_PROJECT_NUMBER');

  for (const name of ['GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID']) {
    const value = String(environment[name] ?? '').trim();
    if (value && !/^[a-z][a-z0-9-]{2,62}$/u.test(value)) invalid.push(name);
  }

  const serviceAccount = String(environment.GCP_SERVICE_ACCOUNT_EMAIL ?? '').trim();
  if (serviceAccount && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}@[A-Za-z0-9-]{3,63}\.iam\.gserviceaccount\.com$/u.test(serviceAccount)) {
    invalid.push('GCP_SERVICE_ACCOUNT_EMAIL');
  }

  const origins = String(environment.YOS_ALLOWED_ORIGINS ?? '').trim();
  if (origins) {
    try {
      const values = origins.split(',').map((value) => value.trim()).filter(Boolean);
      if (values.length === 0) throw new Error('empty');
      for (const value of values) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.origin !== value) throw new Error('invalid');
      }
    } catch {
      invalid.push('YOS_ALLOWED_ORIGINS');
    }
  }

  const spreadsheetId = String(environment.PROJECT75_SPREADSHEET_ID ?? '').trim();
  if (spreadsheetId && !/^[A-Za-z0-9_-]{10,200}$/u.test(spreadsheetId)) invalid.push('PROJECT75_SPREADSHEET_ID');

  const tokenHash = String(environment.YOS_TAXI_SYNC_TOKEN_SHA256 ?? '').trim();
  if (tokenHash && !/^[a-f0-9]{64}$/iu.test(tokenHash)) invalid.push('YOS_TAXI_SYNC_TOKEN_SHA256');

  return {missing, invalid: [...new Set(invalid)]};
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return Response.json(
        {status: 'method_not_allowed'},
        {status: 405, headers: {'Cache-Control': 'no-store', Allow: 'GET'}}
      );
    }

    const result = validate(process.env);
    const ready = result.missing.length === 0 && result.invalid.length === 0;
    return Response.json(
      {
        status: ready ? 'ready' : 'incomplete',
        service: 'yos-taxi-sync',
        missing: result.missing,
        invalid: result.invalid
      },
      {
        status: ready ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
          'Referrer-Policy': 'no-referrer'
        }
      }
    );
  }
};
