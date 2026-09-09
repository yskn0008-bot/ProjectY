import {createGoogleAccessTokenProvider} from '../../dist/auth/google-runtime.js';
import {loadYosRuntimeConfig} from '../../dist/config.js';
import {GoogleDriveClient} from '../../dist/sources/google-drive-client.js';
import {GoogleSheetsClient} from '../../dist/sources/google-sheets-client.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";
const EXPECTED_HEADER = ['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'];

function response(stages, status = 200) {
  return Response.json(
    {status: status === 200 ? 'ready' : 'blocked', stages},
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex'
      }
    }
  );
}

function notFound() {
  return Response.json(
    {status: 'not_found'},
    {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex'
      }
    }
  );
}

function classifyDriveFailure(error) {
  const text = error instanceof Error ? error.message : '';
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/iu.test(text)) return 'api_disabled';
  if (/insufficientPermissions|insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/iu.test(text)) return 'scope_denied';
  if (/exact-name lookup is ambiguous/iu.test(text)) return 'ambiguous';
  const status = /HTTP\s+(\d{3})/u.exec(text)?.[1] ?? '';
  if (status === '400') return 'bad_request';
  if (status === '401') return 'unauthorized';
  if (status === '403') return 'forbidden';
  if (status === '429') return 'rate_limited';
  if (/^5\d\d$/u.test(status)) return 'upstream_error';
  return 'fail';
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return Response.json({status: 'method_not_allowed'}, {status: 405, headers: {'Cache-Control': 'no-store', Allow: 'GET'}});
    }

    // Preview is intentionally denied by the production-only Google WIF condition.
    // Keep this temporary probe production-only so its result reflects the real runtime.
    if (String(process.env.VERCEL_ENV ?? '').trim() !== 'production') return notFound();

    const stages = {
      config: 'pending',
      accessToken: 'pending',
      driveFind: 'pending',
      sheetsRead: 'pending',
      header: 'pending'
    };

    let googleWorkloadAuth;
    try {
      googleWorkloadAuth = loadYosRuntimeConfig(process.env).googleWorkloadAuth;
      stages.config = 'pass';
    } catch {
      stages.config = 'fail';
      return response(stages, 503);
    }

    let accessToken;
    try {
      const provider = await createGoogleAccessTokenProvider(googleWorkloadAuth);
      accessToken = await provider.getAccessToken();
      if (!accessToken) throw new Error('empty Google access token');
      stages.accessToken = 'pass';
    } catch {
      stages.accessToken = 'fail';
      return response(stages, 503);
    }

    let projection;
    try {
      const drive = new GoogleDriveClient(fetch);
      projection = await drive.findByExactName(PROJECTION_NAME, SHEET_MIME, accessToken);
      if (!projection) {
        stages.driveFind = 'not_found';
        return response(stages, 503);
      }
      stages.driveFind = 'pass';
    } catch (error) {
      stages.driveFind = classifyDriveFailure(error);
      return response(stages, 503);
    }

    try {
      const sheets = new GoogleSheetsClient(fetch);
      const result = await sheets.batchGet(projection.id, [TASK_RANGE], accessToken);
      const rows = result.valueRanges[0]?.values ?? [];
      stages.sheetsRead = 'pass';
      const headerIndex = rows.findIndex((row) => EXPECTED_HEADER.every((name, index) => String(row?.[index] ?? '').trim() === name));
      if (headerIndex < 0) {
        stages.header = 'fail';
        return response(stages, 503);
      }
      stages.header = 'pass';
    } catch {
      stages.sheetsRead = 'fail';
      return response(stages, 503);
    }

    return response(stages, 200);
  }
};
