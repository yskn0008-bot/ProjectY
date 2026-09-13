import type {Environment} from '../config.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createClarityIntakeHandler} from './handler.js';

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
