import {createGoogleAccessTokenProvider} from '../../dist/auth/google-runtime.js';
import {loadYosRuntimeConfig} from '../../dist/config.js';
import {GoogleDriveClient} from '../../dist/sources/google-drive-client.js';
import {GoogleSheetsClient} from '../../dist/sources/google-sheets-client.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";
const EXPECTED_HEADER = ['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'];

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  return message
    .replace(/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/gu, '[redacted-jwt]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, 'Bearer [redacted]')
    .slice(0, 500);
}

function response(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return response({status:'method_not_allowed'}, 405);

    const result = {
      status: 'diagnostic',
      serviceAccountEmail: String(process.env.GCP_SERVICE_ACCOUNT_EMAIL ?? '').trim() || null,
      projectNumber: String(process.env.GCP_PROJECT_NUMBER ?? '').trim() || null,
      workloadIdentityPoolId: String(process.env.GCP_WORKLOAD_IDENTITY_POOL_ID ?? '').trim() || null,
      workloadIdentityProviderId: String(process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID ?? '').trim() || null,
      stages: {
        config: 'pending',
        accessToken: 'pending',
        driveFind: 'pending',
        sheetsRead: 'pending',
        header: 'pending'
      }
    };

    let googleWorkloadAuth;
    try {
      googleWorkloadAuth = loadYosRuntimeConfig(process.env).googleWorkloadAuth;
      result.stages.config = 'pass';
    } catch (error) {
      result.stages.config = 'fail';
      result.error = {stage:'config', message:safeError(error)};
      return response(result, 503);
    }

    let accessToken;
    try {
      const provider = await createGoogleAccessTokenProvider(googleWorkloadAuth);
      accessToken = await provider.getAccessToken();
      result.stages.accessToken = accessToken ? 'pass' : 'fail';
      if (!accessToken) throw new Error('empty Google access token');
    } catch (error) {
      result.stages.accessToken = 'fail';
      result.error = {stage:'accessToken', message:safeError(error)};
      return response(result, 503);
    }

    let projection;
    try {
      const drive = new GoogleDriveClient(fetch);
      projection = await drive.findByExactName(PROJECTION_NAME, SHEET_MIME, accessToken);
      result.stages.driveFind = projection ? 'pass' : 'not_found';
      if (!projection) {
        result.error = {stage:'driveFind', message:'projection not visible to service account'};
        return response(result, 503);
      }
    } catch (error) {
      result.stages.driveFind = 'fail';
      result.error = {stage:'driveFind', message:safeError(error)};
      return response(result, 503);
    }

    try {
      const sheets = new GoogleSheetsClient(fetch);
      const sheetResult = await sheets.batchGet(projection.id, [TASK_RANGE], accessToken);
      const rows = sheetResult.valueRanges[0]?.values ?? [];
      result.stages.sheetsRead = 'pass';
      result.rowsRead = rows.length;
      const headerIndex = rows.findIndex((row) => EXPECTED_HEADER.every((name, index) => String(row?.[index] ?? '').trim() === name));
      result.stages.header = headerIndex >= 0 ? 'pass' : 'fail';
      if (headerIndex < 0) {
        result.error = {stage:'header', message:'expected Tasks header not found'};
        return response(result, 503);
      }
    } catch (error) {
      result.stages.sheetsRead = 'fail';
      result.error = {stage:'sheetsRead', message:safeError(error)};
      return response(result, 503);
    }

    result.status = 'ready';
    return response(result, 200);
  }
};
