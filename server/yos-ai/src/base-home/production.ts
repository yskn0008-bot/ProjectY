import type {Environment} from '../config.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createBaseHomeRefreshHandler} from './handler.js';

export function createProductionBaseHomeRefreshHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken
  });

  const widgetToken = required(options.environment, 'YOS_WIDGET_TOKEN');
  if (widgetToken.length < 32 || widgetToken.length > 512) {
    throw new Error('YOS_WIDGET_TOKEN must be between 32 and 512 characters');
  }

  return createBaseHomeRefreshHandler({
    widgetToken,
    notionToken: required(options.environment, 'YOS_NOTION_API_TOKEN'),
    notionDataSourceId: options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() || null,
    redis
  });
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
