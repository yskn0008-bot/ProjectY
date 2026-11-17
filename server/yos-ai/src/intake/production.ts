import type {Environment} from '../config.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createClarityIntakeHandler} from './handler.js';
import {createInboxSorter} from './inbox-sorter.js';
import {createNotionMirrorHandler, mirrorNotionInput} from './mirror-handler.js';
import {moneyShadowToMirrorInput, type MoneyShadowSnapshot} from './money-mirror.js';

export function createProductionClarityIntakeHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });

  const intake = createClarityIntakeHandler({
    tokenSha256: requiredHash(options.environment, 'YOS_CLARITY_INTAKE_TOKEN_SHA256'),
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionPageId: required(options.environment, 'YOS_NOTION_INBOX_PAGE_ID'),
    redis
  });
  return async (request: Request): Promise<Response> => {
    // An Inbox receipt is always committed before any destination attempt.
    // The separate opt-in gate is required; no production activation
    // occurs merely by deploying this code.
    if (options.environment.YOS_INBOX_INSTANT_ENABLED !== '1') return intake(request);
    let captureId: string | undefined;
    try {
      const body = await request.clone().json() as Record<string, unknown>;
      if (typeof body.captureId === 'string' && /^[a-zA-Z0-9._:-]{8,128}$/u.test(body.captureId)) captureId = body.captureId;
    } catch {
      // Invalid inputs are still rejected by the original intake handler.
    }
    const saved = await intake(request);
    if (!saved.ok || !captureId) return saved;
    let routing: {created: number; duplicates: number; held: number} | {pending: true};
    try {
      const sorter = createInboxSorter({
        notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
        inboxPageId: required(options.environment, 'YOS_NOTION_INBOX_PAGE_ID'),
        redis,
        mode: 'run',
        captureId
      });
      routing = await sorter();
    } catch {
      // Never turn a confirmed Raw capture into an apparent intake failure.
      // Pending captures remain in Inbox. The existing daily sorter must remain gated independently.
      routing = {pending: true};
    }
    const receipt = await saved.json() as Record<string, unknown>;
    return Response.json({...receipt, routing}, {
      status: saved.status,
      headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    });
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredHash(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!/^[a-f0-9]{64}$/iu.test(value)) throw new Error(`Missing or invalid environment variable: ${name}`);
  return value.toLowerCase();
}


export function createProductionNotionMirrorHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });

  return createNotionMirrorHandler({
    tokenSha256: requiredHash(options.environment, 'YOS_CLARITY_INTAKE_TOKEN_SHA256'),
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionDataSourceId: options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() || null,
    redis
  });
}


export function createProductionMoneyNotionMirror(options: {environment: Environment}): (snapshot: MoneyShadowSnapshot) => Promise<void> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });
  const notionToken = required(options.environment, 'YOS_NOTION_API_TOKEN');
  const notionDataSourceId = options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() || null;

  return async (snapshot: MoneyShadowSnapshot): Promise<void> => {
    await mirrorNotionInput({
      input: moneyShadowToMirrorInput(snapshot),
      notionToken,
      notionDataSourceId,
      redis
    });
  };
}
