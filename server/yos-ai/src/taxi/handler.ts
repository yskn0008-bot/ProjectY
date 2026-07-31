import {createGoogleAccessTokenProvider, GOOGLE_SHEETS_WRITE_SCOPES} from '../auth/google-runtime.js';
import {readVercelOidcToken} from '../auth/vercel-oidc.js';
import type {GoogleWorkloadAuthConfig} from '../config.js';
import type {FetchLike} from '../http.js';
import {GoogleSheetsClient} from '../sources/google-sheets-client.js';

export interface CreateTaxiEventHandlerOptions {
  allowedOrigins: string[];
  googleWorkloadAuth: GoogleWorkloadAuthConfig;
  spreadsheetId: string;
  tokenSha256: string;
  sheetName?: string;
  fetchImpl?: FetchLike;
  clock?: () => string;
}

interface TaxiEventPayload {
  version: 1;
  eventId: string;
  businessDate: string;
  vehicle: string;
  rideStartedAt: string | null;
  rideEndedAt: string | null;
  pickup: string;
  pickupCoords: string;
  dropoff: string;
  dropoffCoords: string;
  fare: number;
  tip: number;
  payment: string;
  dispatch: string;
  distance: number;
  durationMs: number;
  waitMs: number;
  memo: string;
  clientUpdatedAt: string;
}

const HEADER = [
  'event_id','received_at','business_date','vehicle','ride_started_at','ride_ended_at',
  'pickup','pickup_coords','dropoff','dropoff_coords','fare','tip','payment','dispatch',
  'distance_km','duration_ms','wait_ms','memo','source','confirmation_state','client_updated_at'
];

export function createTaxiEventHandler(options: CreateTaxiEventHandlerOptions): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sheets = new GoogleSheetsClient(fetchImpl);
  const clock = options.clock ?? (() => new Date().toISOString());
  const sheetName = options.sheetName ?? 'リアルタイム記録';
  let sheetReady = false;

  return async (request: Request): Promise<Response> => {
    const origin = allowedOrigin(request, options.allowedOrigins);
    if (origin === null) return json({error: 'Origin not allowed'}, 403, null);
    if (request.method === 'OPTIONS') return preflight(origin);
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, origin, {Allow: 'POST, OPTIONS'});
    if (!(await authorized(request, options.tokenSha256))) return json({error: 'Unauthorized'}, 401, origin);

    let payload: TaxiEventPayload;
    try {
      payload = validatePayload(await request.json());
    } catch (error) {
      return json({error: error instanceof Error ? error.message : 'Invalid request'}, 400, origin);
    }

    try {
      const oidcToken = readVercelOidcToken(request);
      const accessTokenProvider = await createGoogleAccessTokenProvider(
        options.googleWorkloadAuth,
        oidcToken,
        GOOGLE_SHEETS_WRITE_SCOPES
      );
      const accessToken = await accessTokenProvider.getAccessToken();
      if (!sheetReady) {
        await ensureSheet(sheets, options.spreadsheetId, sheetName, accessToken);
        sheetReady = true;
      }

      const keyRange = `'${sheetName.replaceAll("'", "''")}'!A1:A10000`;
      const existing = await sheets.batchGet(options.spreadsheetId, [keyRange], accessToken);
      const keys = new Set(existing.valueRanges.flatMap((range) => range.values ?? []).map((row) => String(row[0] ?? '')));
      if (keys.has(payload.eventId)) return json({ok: true, duplicate: true, eventId: payload.eventId}, 409, origin);

      const row = [
        payload.eventId, clock(), payload.businessDate, payload.vehicle,
        payload.rideStartedAt ?? '', payload.rideEndedAt ?? '', payload.pickup, payload.pickupCoords,
        payload.dropoff, payload.dropoffCoords, payload.fare, payload.tip, payload.payment, payload.dispatch,
        payload.distance, payload.durationMs, payload.waitMs, payload.memo,
        'YOS Taxi ライブ記録', '未確認', payload.clientUpdatedAt
      ];
      const appendRange = `'${sheetName.replaceAll("'", "''")}'!A1:U1`;
      const result = await sheets.appendValues(options.spreadsheetId, appendRange, [row], accessToken);
      return json({ok: true, duplicate: false, eventId: payload.eventId, updatedRange: result.updates?.updatedRange ?? ''}, 201, origin);
    } catch {
      return json({error: 'ProjectYへの保存に失敗しました'}, 503, origin);
    }
  };
}

async function ensureSheet(
  sheets: GoogleSheetsClient,
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<void> {
  const titles = await sheets.sheetTitles(spreadsheetId, accessToken);
  if (!titles.includes(sheetName)) await sheets.addSheet(spreadsheetId, sheetName, accessToken);
  const range = `'${sheetName.replaceAll("'", "''")}'!A1:A2`;
  const existing = await sheets.batchGet(spreadsheetId, [range], accessToken);
  const first = String(existing.valueRanges[0]?.values?.[0]?.[0] ?? '');
  if (!first) await sheets.appendValues(spreadsheetId, `'${sheetName.replaceAll("'", "''")}'!A1:U1`, [HEADER], accessToken);
}

function validatePayload(value: unknown): TaxiEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON形式を確認してください');
  const raw = value as Record<string, unknown>;
  if (Number(raw.version) !== 1) throw new Error('未対応のデータ形式です');
  const eventId = text(raw.eventId, 1, 160, 'eventId');
  if (!/^[A-Za-z0-9._:-]+$/u.test(eventId)) throw new Error('eventIdが不正です');
  const businessDate = text(raw.businessDate, 10, 10, 'businessDate');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(businessDate)) throw new Error('businessDateが不正です');
  return {
    version: 1,
    eventId,
    businessDate,
    vehicle: optionalText(raw.vehicle, 40),
    rideStartedAt: optionalIso(raw.rideStartedAt),
    rideEndedAt: optionalIso(raw.rideEndedAt),
    pickup: optionalText(raw.pickup, 160),
    pickupCoords: optionalText(raw.pickupCoords, 80),
    dropoff: optionalText(raw.dropoff, 160),
    dropoffCoords: optionalText(raw.dropoffCoords, 80),
    fare: nonNegative(raw.fare, 1_000_000, 'fare'),
    tip: nonNegative(raw.tip, 1_000_000, 'tip'),
    payment: optionalText(raw.payment, 80),
    dispatch: optionalText(raw.dispatch, 80),
    distance: nonNegative(raw.distance, 2_000, 'distance'),
    durationMs: nonNegative(raw.durationMs, 48 * 60 * 60 * 1000, 'durationMs'),
    waitMs: nonNegative(raw.waitMs, 48 * 60 * 60 * 1000, 'waitMs'),
    memo: optionalText(raw.memo, 500),
    clientUpdatedAt: optionalIso(raw.clientUpdatedAt) ?? new Date(0).toISOString()
  };
}

function text(value: unknown, minimum: number, maximum: number, name: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length < minimum || result.length > maximum) throw new Error(`${name}を確認してください`);
  return result;
}

function optionalText(value: unknown, maximum: number): string {
  const result = typeof value === 'string' ? value.trim() : '';
  return result.slice(0, maximum);
}

function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) throw new Error('日時を確認してください');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('日時を確認してください');
  return date.toISOString();
}

function nonNegative(value: unknown, maximum: number, name: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0 || result > maximum) throw new Error(`${name}を確認してください`);
  return result;
}

async function authorized(request: Request, expectedHash: string): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 512 || !/^[a-f0-9]{64}$/iu.test(expectedHash)) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(actual.toLowerCase(), expectedHash.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    }
  });
}

function json(body: unknown, status: number, origin: string | null, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Vary', 'Origin');
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), {status, headers});
}
