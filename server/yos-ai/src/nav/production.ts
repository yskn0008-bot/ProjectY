import type {Environment} from '../config.js';
import {loadNavModelRuntimeConfig} from './config.js';
import {createNavModelHandler} from './handler.js';

export interface CreateProductionNavModelHandlerOptions {
  environment: Environment;
}

export function createProductionNavModelHandler(
  options: CreateProductionNavModelHandlerOptions
): (request: Request) => Promise<Response> {
  const config = loadNavModelRuntimeConfig(options.environment);
  return createNavModelHandler({
    allowedOrigins: config.allowedOrigins,
    googleWorkloadAuth: config.googleWorkloadAuth,
    spreadsheetId: config.spreadsheetId,
    cacheMilliseconds: config.cacheMilliseconds
  });
}
