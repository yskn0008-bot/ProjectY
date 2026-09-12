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

  return createWidgetFeedHandler({
    widgetToken,
    googleWorkloadAuth: config.googleWorkloadAuth,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
}
