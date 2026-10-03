import {loadYosRuntimeConfig, type Environment} from '../config.js';
import type {FetchLike} from '../http.js';
import {createWidgetFeedHandler} from './handler.js';

export interface CreateProductionWidgetFeedOptions {
  environment: Environment;
  fetchImpl?: FetchLike;
}

export function createProductionWidgetFeed(options: CreateProductionWidgetFeedOptions): (request: Request) => Promise<Response> {
  const config = loadYosRuntimeConfig(options.environment);
  const widgetToken = options.environment.YOS_WIDGET_TOKEN?.trim() ?? '';
  if (widgetToken.length < 32 || widgetToken.length > 512) {
    throw new Error('YOS_WIDGET_TOKEN must be between 32 and 512 characters');
  }

  const notionToken = options.environment.YOS_NOTION_API_TOKEN?.trim() ?? '';
  const notionDataSourceId = options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() ?? '';

  return createWidgetFeedHandler({
    widgetToken,
    googleWorkloadAuth: config.googleWorkloadAuth,
    ...(notionToken ? {notionToken} : {}),
    ...(notionDataSourceId ? {notionDataSourceId} : {}),
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
}
