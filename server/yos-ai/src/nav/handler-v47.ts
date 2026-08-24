import {createGoogleAccessTokenProvider} from '../auth/google-runtime.js';
import type {GoogleWorkloadAuthConfig} from '../config.js';
import type {FetchLike} from '../http.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';
import {buildImadaNavModel, type ImadaNavModel} from './imada-model.js';

export interface CreateNavModelHandlerOptions {
  allowedOrigins: string[];
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  spreadsheetId: string;
  cacheMilliseconds?: number;
  fetchImpl?: FetchLike;
  clock?: () => string;
}

interface CachedModel {
  model: ImadaNavModel;
  expiresAt: number;
}

const TRIP_RANGES = Array.from({length: 10}, (_, index) => {
  const start = index * 900 + 1;
  const end = (index + 1) * 900;
  return `'乗車履歴'!A${start}:K${end}`;
});

export function createNavModelHandlerV47(options: CreateNavModelHandlerOptions): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sheets = new GoogleSheetsClient(fetchImpl);
  const clock = options.clock ?? (() => new Date().toISOString());
  const cacheMilliseconds = options.cacheMilliseconds ?? 15 * 60 * 1000;
  let cached: CachedModel | null = null;
  let inFlight: Promise<ImadaNavModel> | null = null;

  return async (request: Request): Promise<Response> => {
    const origin = allowedOrigin(request, options.allowedOrigins);
    if (origin === null) return json({error: 'Origin not allowed'}, 403, null, 'no-store');
    if (request.method === 'OPTIONS') return preflight(origin);
    if (request.method !== 'GET') return json({error: 'Method not allowed'}, 405, origin, 'no-store', {Allow: 'GET, OPTIONS'});

    const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';
    const now = Date.now();
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return modelResponse(cached.model, origin, 'memory-cache');
    }

    try {
      inFlight ??= loadModel().finally(() => {
        inFlight = null;
      });
      const model = await inFlight;
      cached = {model, expiresAt: Date.now() + cacheMilliseconds};
      return modelResponse(model, origin, 'project75-live');
    } catch {
      if (cached) return modelResponse(cached.model, origin, 'stale-cache', true);
      return json({error: 'YOS navigation model is temporarily unavailable'}, 503, origin, 'no-store');
    }
  };

  async function loadModel(): Promise<ImadaNavModel> {
    const accessTokenProvider = await createGoogleAccessTokenProvider(options.googleWorkloadAuth);
    const accessToken = await accessTokenProvider.getAccessToken();
    const result = await sheets.batchGet(options.spreadsheetId, TRIP_RANGES, accessToken);
    const rows = result.valueRanges.flatMap((range) => range.values ?? []);
    return buildImadaNavModel(rows, clock());
  }
}

function allowedOrigin(request: Request, allowedOrigins: string[]): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    }
  });
}

function modelResponse(model: ImadaNavModel, origin: string, source: string, stale = false): Response {
  return json(model, 200, origin, 'private, max-age=300', {
    'X-YOS-Model-Source': source,
    'X-YOS-Model-Rides': String(model.confirmedClassifiedRides),
    'X-YOS-Model-Version': model.version,
    ...(stale ? {'Warning': '110 - "Response is stale"'} : {})
  });
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  cacheControl: string,
  extraHeaders: HeadersInit = {}
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Vary', 'Origin');
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), {status, headers});
}
