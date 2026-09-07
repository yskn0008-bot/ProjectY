import type {IdentityGate} from '../auth/identity-gate.js';
import type {IdentityVerifier} from '../auth/types.js';
import type {GoogleWorkloadAuthConfig} from '../config.js';
import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {FetchLike} from '../http.js';
import {GoogleDriveClient} from '../sources/google-drive-client.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {allowedOrigin, bearerToken, secureJson, type CorsOptions} from '../api/shared.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";
const HEADER = ['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'] as const;

export interface TaskDashboardItem {
  order: number;
  title: string;
  state: string;
  owner: string;
  due: string | null;
  priority: string;
  nextAction: string;
  completion: string;
  blocker: string;
  evidence: string;
}

export interface TaskDashboardResponse {
  generatedAt: string | null;
  tasks: TaskDashboardItem[];
}

export interface CreateTaskDashboardHandlerOptions extends CorsOptions {
  identityVerifier: IdentityVerifier;
  identityGate: IdentityGate;
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  fetchImpl?: FetchLike;
}

export function createTaskDashboardHandler(options: CreateTaskDashboardHandlerOptions): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const drive = new GoogleDriveClient(fetchImpl);
  const sheets = new GoogleSheetsClient(fetchImpl);

  return async (request: Request): Promise<Response> => {
    const origin = allowedOrigin(request, options);
    if (origin === null) return secureJson({error: 'Origin not allowed'}, 403, null);
    if (request.method === 'OPTIONS') return preflight(origin);
    if (request.method !== 'GET') return secureJson({error: 'Method not allowed'}, 405, origin, {Allow:'GET, OPTIONS'});

    try {
      const idToken = bearerToken(request);
      const identity = await options.identityVerifier.verify(idToken);
      await options.identityGate.authorize(identity);
    } catch {
      return secureJson({error: 'Authentication failed'}, 401, origin);
    }

    try {
      const accessTokenProvider = await createGoogleAccessTokenProvider(options.googleWorkloadAuth);
      const accessToken = await accessTokenProvider.getAccessToken();
      const projection = await drive.findByExactName(PROJECTION_NAME, SHEET_MIME, accessToken);
      if (!projection) {
        console.error(JSON.stringify({level:'error',event:'yos_tasks_source_unavailable',stage:'drive-find',source:PROJECTION_NAME}));
        return secureJson({error: 'Task dashboard source is unavailable'}, 503, origin);
      }
      const result = await sheets.batchGet(projection.id, [TASK_RANGE], accessToken);
      const rows = result.valueRanges[0]?.values ?? [];
      const parsed = parseProjection(rows);
      return secureJson(parsed, 200, origin, {'Cache-Control':'private, no-store'});
    } catch (error) {
      console.error(JSON.stringify({
        level:'error',
        event:'yos_tasks_unavailable',
        stage:'google-read',
        message:error instanceof Error ? error.message : 'unknown error'
      }));
      return secureJson({error: 'Task dashboard is temporarily unavailable'}, 503, origin);
    }
  };
}

export function parseProjection(rows: unknown[][]): TaskDashboardResponse {
  const normalized = rows.map((row) => row.map(cell));
  const generatedAt = normalized.find((row) => row[0] === 'generated_at')?.[1] || null;
  const headerIndex = normalized.findIndex((row) => HEADER.every((name,index) => row[index] === name));
  if (headerIndex < 0) throw new Error('Task projection header is invalid');
  const tasks: TaskDashboardItem[] = [];
  for (const row of normalized.slice(headerIndex + 1)) {
    if (!row.some(Boolean)) continue;
    const order = Number.parseInt(row[0] ?? '', 10);
    const title = clean(row[1], 160);
    if (!Number.isSafeInteger(order) || order < 1 || order > 999 || !title) continue;
    tasks.push({
      order,
      title,
      state: clean(row[2], 30),
      owner: clean(row[3], 30),
      due: clean(row[4], 80) || null,
      priority: clean(row[5], 12),
      nextAction: clean(row[6], 500),
      completion: clean(row[7], 700),
      blocker: clean(row[8], 500),
      evidence: clean(row[9], 500)
    });
  }
  tasks.sort((a,b) => a.order - b.order);
  return {generatedAt: generatedAt ? clean(generatedAt, 80) : null, tasks};
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function clean(value: string | undefined, max: number): string {
  return (value ?? '').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, max);
}

function preflight(origin: string): Response {
  return new Response(null, {status:204, headers:{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'600',
    'Cache-Control':'no-store',
    'Vary':'Origin'
  }});
}
