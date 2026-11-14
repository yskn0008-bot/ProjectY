import type {IdentityGate} from '../auth/identity-gate.js';
import type {IdentityVerifier} from '../auth/types.js';
import type {GoogleWorkloadAuthConfig} from '../config.js';
import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {FetchLike} from '../http.js';
import {GoogleDriveClient} from '../sources/google-drive-client.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {loadNotionTaskDashboard, completeNotionTask} from '../widget/notion-source.js';
import {loadNotionCalendarMoney} from '../widget/morning.js';
import {allowedOrigin, bearerToken, secureJson, type CorsOptions} from '../api/shared.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";
const HEADER = ['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'] as const;

export interface TaskDashboardItem {
  order: number;
  id?: string;
  sourceKind?: 'calendar' | 'reminder' | 'money' | 'task';
  dueEnd?: string | null;
  dueTimeZone?: string | null;
  habitCycle?: string;
  area?: string;
  lastEditedAt?: string | null;
  title: string;
  state: string;
  owner: string;
  due: string | null;
  priority: string;
  nextAction: string;
  completion: string;
  blocker: string;
  evidence: string;
  actionUrl?: string | null;
  lastSynced?: string | null;
}

export interface TaskDashboardResponse {
  source?: 'notion';
  complete?: boolean;
  ignoredBlankCount?: number;
  generatedAt: string | null;
  tasks: TaskDashboardItem[];
}

export interface CreateTaskDashboardHandlerOptions extends CorsOptions {
  identityVerifier: IdentityVerifier;
  identityGate: IdentityGate;
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  notionToken?: string;
  notionDataSourceId?: string;
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
    if (!['GET', 'PATCH'].includes(request.method)) return secureJson({error: 'Method not allowed'}, 405, origin, {Allow:'GET, PATCH, OPTIONS'});

    try {
      const idToken = bearerToken(request);
      const identity = await options.identityVerifier.verify(idToken);
      await options.identityGate.authorize(identity);
    } catch {
      return secureJson({error: 'Authentication failed'}, 401, origin);
    }

    // Explicit opt-in: legacy MY WAY callers retain their Google projection contract.
    // A failed authoritative read must never masquerade as a successful stale fallback.
    const source = new URL(request.url).searchParams.get('source');
    if (source !== null && source !== 'notion') return secureJson({error: 'Unknown task source'}, 400, origin);
    if (request.method === 'PATCH' && source !== 'notion') return secureJson({error: 'Completion requires Notion source'}, 400, origin);
    if (source === 'notion') {
      if (!options.notionToken?.trim() || !options.notionDataSourceId?.trim()) {
        return secureJson({error: 'Notion task source is unavailable'}, 503, origin);
      }
      if (request.method === 'PATCH') {
        if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return secureJson({error: 'JSON required'}, 415, origin);
        const body = await request.text();
        if (body.length > 2048) return secureJson({error: 'Request too large'}, 413, origin);
        let input: any;
        try { input = JSON.parse(body); } catch { return secureJson({error: 'Invalid request'}, 400, origin); }
        if (!input || input.action !== 'complete' || !/^[a-f0-9]{32}$/iu.test(input.pageId) || typeof input.expectedEditedAt !== 'string' || input.expectedEditedAt.length > 80 || typeof input.expectedState !== 'string') return secureJson({error: 'Invalid completion request'}, 400, origin);
        try {
          const task = await completeNotionTask({notionToken: options.notionToken, notionDataSourceId: options.notionDataSourceId, fetchImpl, pageId: input.pageId, expectedEditedAt: input.expectedEditedAt, expectedState: input.expectedState});
          return secureJson({source: 'notion', task}, 200, origin);
        } catch {
          return secureJson({error: 'Completion not confirmed; refresh Notion tasks before retrying'}, 409, origin);
        }
      }
      try {
        const result = await loadNotionTaskDashboard({
          notionToken: options.notionToken,
          notionDataSourceId: options.notionDataSourceId,
          calendar: true,
          fetchImpl
        });
        if(request.method==='GET'&&new URL(request.url).searchParams.get('calendarMoney')==='1'){
          let calendarMoney;
          try {calendarMoney=await loadNotionCalendarMoney({notionToken:options.notionToken,fetchImpl});}
          catch {calendarMoney={status:'unavailable' as const};}
          return secureJson({...result,calendarMoney},200,origin,{'Cache-Control':'private, no-store'});
        }
        return secureJson(result, 200, origin, {'Cache-Control': 'private, no-store'});
      } catch {
        return secureJson({error: 'Notion tasks could not be read completely'}, 503, origin);
      }
    }

    try {
      const accessTokenProvider = await createGoogleAccessTokenProvider(options.googleWorkloadAuth);
      const accessToken = await accessTokenProvider.getAccessToken();
      const projection = await drive.findByExactName(PROJECTION_NAME, SHEET_MIME, accessToken);
      if (!projection) return secureJson({error: 'Task dashboard source is unavailable'}, 503, origin);
      const result = await sheets.batchGet(projection.id, [TASK_RANGE], accessToken);
      const rows = result.valueRanges[0]?.values ?? [];
      const parsed = parseProjection(rows);
      return secureJson(parsed, 200, origin, {'Cache-Control':'private, no-store'});
    } catch {
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
    'Access-Control-Allow-Methods':'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'600',
    'Cache-Control':'no-store',
    'Vary':'Origin'
  }});
}
