import {createGoogleIdentityVerifier} from '../auth/google-runtime.js';
import {IdentityGate} from '../auth/identity-gate.js';
import {loadYosRuntimeConfig, type Environment} from '../config.js';
import type {FetchLike} from '../http.js';
import {createTaskDashboardHandler} from './handler.js';

export interface CreateProductionTaskDashboardOptions {
  environment: Environment;
  fetchImpl?: FetchLike;
}

export function createProductionTaskDashboard(options: CreateProductionTaskDashboardOptions): (request: Request) => Promise<Response> {
  const config = loadYosRuntimeConfig(options.environment);
  const identityVerifier = createGoogleIdentityVerifier(config.googleClientId);
  const identityGate = new IdentityGate({
    expectedAudience: config.googleClientId,
    allowedSubjectHash: config.allowedSubjectHash,
    requireEmailVerified: true
  });
  return createTaskDashboardHandler({
    allowedOrigins: config.allowedOrigins,
    allowMissingOrigin: false,
    identityVerifier,
    identityGate,
    googleWorkloadAuth: config.googleWorkloadAuth,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
}
