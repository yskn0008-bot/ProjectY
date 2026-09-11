import type {Environment} from '../config.js';
import {createRawFirstProcessor} from '../intake/raw-first-processor.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createSlackEventsHandler} from './handler.js';

export function createProductionSlackEventsHandler(options: {
  environment: Environment;
  waitUntil: (promise: Promise<unknown>) => void;
}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({url: storage.upstashUrl, token: storage.upstashToken});
  const processor = createRawFirstProcessor({
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionPageId: required(options.environment, 'YOS_NOTION_INBOX_PAGE_ID'),
    redis
  });
  return createSlackEventsHandler({
    signingSecret: required(options.environment, 'YOS_SLACK_SIGNING_SECRET'),
    botToken: required(options.environment, 'YOS_SLACK_BOT_TOKEN'),
    redis,
    processor,
    waitUntil: options.waitUntil
  });
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
