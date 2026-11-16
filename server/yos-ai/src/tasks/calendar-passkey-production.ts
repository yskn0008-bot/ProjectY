import {createGoogleIdentityVerifier} from '../auth/google-runtime.js';
import {IdentityGate} from '../auth/identity-gate.js';
import {loadYosRuntimeConfig, type Environment} from '../config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createCalendarPasskeyHandler} from './calendar-passkey.js';
import type {FetchLike} from '../http.js';

export function createProductionCalendarPasskey(options:{environment:Environment;fetchImpl?:FetchLike}) {
  const config=loadYosRuntimeConfig(options.environment);
  const url=options.environment.UPSTASH_REDIS_REST_URL?.trim();
  const token=options.environment.UPSTASH_REDIS_REST_TOKEN?.trim();
  if(!url||!token){
    return async (_req:Request)=>Response.json({error:'Passkey storage is not configured'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const redis=new UpstashRestClient({url,token,...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{})});
  return createCalendarPasskeyHandler({
    allowedOrigins:config.allowedOrigins,allowMissingOrigin:false,
    redis,allowedSubjectHash:config.allowedSubjectHash,
    identityVerifier:createGoogleIdentityVerifier(config.googleClientId),
    identityGate:new IdentityGate({
      expectedAudience:config.googleClientId,allowedSubjectHash:config.allowedSubjectHash,
      requireEmailVerified:true
    })
  });
}
