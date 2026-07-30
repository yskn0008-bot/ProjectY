import type {Environment} from '../config.js';
import {loadNavModelRuntimeConfig} from './config.js';
import {createNavModelHandlerV47} from './handler-v47.js';

export interface CreateProductionNavModelHandlerOptions {
  environment: Environment;
}

export function createProductionNavModelHandler(
  options: CreateProductionNavModelHandlerOptions
): (request: Request) => Promise<Response> {
  const config = loadNavModelRuntimeConfig(options.environment);
  return createNavModelHandlerV47({
    allowedOrigins: config.allowedOrigins,
    googleWorkloadAuth: config.googleWorkloadAuth,
    spreadsheetId: config.spreadsheetId,
    cacheMilliseconds: config.cacheMilliseconds
  });
}
