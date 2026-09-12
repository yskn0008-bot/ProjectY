import type {GoogleWorkloadAuthConfig} from '../config.js';
import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {FetchLike} from '../http.js';
import {GoogleDriveClient} from '../sources/google-drive-client.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {bearerToken, secureJson} from '../api/shared.js';
import {parseProjection} from '../tasks/handler.js';
import {selectWidgetFeed} from './selection.js';

const PROJECTION_NAME = 'YOS Tasks｜MY WAY Read Projection';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TASK_RANGE = "'Tasks'!A1:J200";

export interface CreateWidgetFeedHandlerOptions {
  widgetToken: string;
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
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
