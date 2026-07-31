import type {Environment} from '../config.js';
import {loadNavModelRuntimeConfig} from '../nav/config.js';
import {createTaxiEventHandler} from './handler.js';

export function createProductionTaxiEventHandler(options: {environment: Environment}): (request: Request) => Promise<Response> {
  const base = loadNavModelRuntimeConfig(options.environment);
  const tokenSha256 = requiredHash(options.environment, 'YOS_TAXI_SYNC_TOKEN_SHA256');
  return createTaxiEventHandler({
    allowedOrigins: base.allowedOrigins,
    googleWorkloadAuth: base.googleWorkloadAuth,
    spreadsheetId: base.spreadsheetId,
    tokenSha256,
    sheetName: options.environment.YOS_TAXI_LIVE_SHEET_NAME?.trim() || 'リアルタイム記録'
  });
}

function requiredHash(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value || !/^[a-f0-9]{64}$/iu.test(value)) throw new Error(`Missing or invalid environment variable: ${name}`);
  return value.toLowerCase();
}
