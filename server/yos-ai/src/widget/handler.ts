import type {GoogleWorkloadAuthConfig} from '../config.js';
import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {FetchLike} from '../http.js';
import {GoogleDriveClient} from '../sources/google-drive-client.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {bearerToken, secureJson} from '../api/shared.js';
import {parseProjection} from '../tasks/handler.js';
import {selectCalendarWindow, selectWidgetFeed} from './selection.js';
import {loadNotionTaskDashboard} from './notion-source.js';
import {loadNotionMorningBrief, unavailableMorningBrief} from './morning.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";

export interface CreateWidgetFeedHandlerOptions {
  widgetToken: string;
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  notionToken?: string;
  notionDataSourceId?: string;
  fetchImpl?: FetchLike;
}

export function createWidgetFeedHandler(options: CreateWidgetFeedHandlerOptions): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const drive = new GoogleDriveClient(fetchImpl);
  const sheets = new GoogleSheetsClient(fetchImpl);

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return secureJson({error: 'Method not allowed'}, 405, null, {Allow: 'GET'});

    try {
      if (!safeEqual(bearerToken(request), options.widgetToken)) throw new Error('Authorization failed');
    } catch {
      return secureJson({error: 'Authentication failed'}, 401, null);
    }

    const query = new URL(request.url).searchParams;
    const mode = query.get('mode');
    if (mode === 'calendar') {
      const start=query.get('start') ?? '';
      const end=query.get('end') ?? '';
      if (!validCalendarWindow(start,end)) return secureJson({error:'Invalid calendar window'},400,null);
      // Existing bearer widget token guards this narrow due-date projection too.
      if(options.notionToken?.trim()) {
        try {
          const direct=await loadNotionTaskDashboard({
            notionToken:options.notionToken,
            ...(options.notionDataSourceId?.trim()?{notionDataSourceId:options.notionDataSourceId.trim()}:{}),
            calendarMode:true,fetchImpl
          });
          return secureJson({...selectCalendarWindow(direct.tasks,direct.generatedAt,start,end,direct.sourceComplete),source:'notion'},200,null,{'Cache-Control':'private, no-store'});
        } catch {
          // Fall back to the existing projection only when direct Notion is unavailable.
        }
      }
      try {
        const auth=await createGoogleAccessTokenProvider(options.googleWorkloadAuth);
        const access=await auth.getAccessToken();
        const projection=await drive.findByExactName(PROJECTION_NAME,SHEET_MIME,access);
        if(!projection) return secureJson({error:'Calendar task source is unavailable'},503,null);
        const range=await sheets.batchGet(projection.id,[TASK_RANGE],access);
        const parsed=parseProjection(range.valueRanges[0]?.values??[]);
        return secureJson({...selectCalendarWindow(parsed.tasks,parsed.generatedAt,start,end,false),source:'projection'},200,null,{'Cache-Control':'private, no-store'});
      } catch { return secureJson({error:'Calendar task source is temporarily unavailable'},503,null); }
    }
    if (mode === 'morning-brief') {
      if (!options.notionToken?.trim()) {
        return secureJson(unavailableMorningBrief('notion-token-unavailable'), 200, null, {'Cache-Control':'private, no-store'});
      }
      try {
        const brief = await loadNotionMorningBrief({
          notionToken: options.notionToken,
          ...(options.notionDataSourceId?.trim() ? {notionTasksDataSourceId: options.notionDataSourceId.trim()} : {}),
          fetchImpl
        });
        return secureJson(brief, 200, null, {'Cache-Control':'private, no-store'});
      } catch {
        return secureJson(unavailableMorningBrief(), 200, null, {'Cache-Control':'private, no-store'});
      }
    }

    if (options.notionToken?.trim()) {
      try {
        const direct = await loadNotionTaskDashboard({
          notionToken: options.notionToken,
          ...(options.notionDataSourceId?.trim() ? {notionDataSourceId: options.notionDataSourceId.trim()} : {}),
          fetchImpl
        });
        return secureJson(selectWidgetFeed(direct.tasks, direct.generatedAt), 200, null);
      } catch {
        // Keep the existing Google projection as a fail-safe if Notion is temporarily unavailable.
      }
    }

    try {
      const accessTokenProvider = await createGoogleAccessTokenProvider(options.googleWorkloadAuth);
      const accessToken = await accessTokenProvider.getAccessToken();
      const projection = await drive.findByExactName(PROJECTION_NAME, SHEET_MIME, accessToken);
      if (!projection) return secureJson({error: 'Widget source is unavailable'}, 503, null);
      const result = await sheets.batchGet(projection.id, [TASK_RANGE], accessToken);
      const rows = result.valueRanges[0]?.values ?? [];
      const parsed = parseProjection(rows);
      return secureJson(selectWidgetFeed(parsed.tasks, parsed.generatedAt), 200, null);
    } catch {
      return secureJson({error: 'Widget feed is temporarily unavailable'}, 503, null);
    }
  };
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}


function validCalendarWindow(start:string,end:string):boolean {
  const valid = (value:string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const t=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(t) && new Date(t).toISOString().slice(0,10)===value ? t : false;
  };
  const from=valid(start), to=valid(end);
  return from!==false && to!==false && to>=from && to-from<=31*86400000;
}
