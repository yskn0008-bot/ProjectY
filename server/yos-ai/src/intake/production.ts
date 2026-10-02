import type {Environment} from '../config.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createClarityIntakeHandler} from './handler.js';
import {createNotionMirrorHandler, mirrorNotionInput} from './mirror-handler.js';
import {moneyShadowToMirrorInput, type MoneyShadowSnapshot} from './money-mirror.js';
import {createIosSnapshotHandler} from './ios-snapshot.js';

export function createProductionClarityIntakeHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });

  return createClarityIntakeHandler({
    tokenSha256: requiredHash(options.environment, 'YOS_CLARITY_INTAKE_TOKEN_SHA256'),
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionPageId: required(options.environment, 'YOS_NOTION_INBOX_PAGE_ID'),
    redis
  });
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


export function createProductionIosSnapshotHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });

  return createIosSnapshotHandler({
    tokenSha256: requiredHash(options.environment, 'YOS_CLARITY_INTAKE_TOKEN_SHA256'),
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionDataSourceId: options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() || null,
    redis
  });
}
