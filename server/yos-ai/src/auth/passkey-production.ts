import {IdentityGate} from './identity-gate.js';
import {createGoogleIdentityVerifier} from './google-runtime.js';
import {loadYosRuntimeConfig, type Environment} from '../config.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createPasskeyHandler} from './passkey.js';
export function createProductionPasskeyHandler(o:{environment:Environment}) {
 const env=o.environment,config=loadYosRuntimeConfig(env);
 if(!env.UPSTASH_REDIS_REST_URL?.trim()||!env.UPSTASH_REDIS_REST_TOKEN?.trim())throw Error('Passkey store is unavailable');
 return createPasskeyHandler({
  allowedOrigins:config.allowedOrigins,allowMissingOrigin:false,
  redis:new UpstashRestClient({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN}),
  identityVerifier:createGoogleIdentityVerifier(config.googleClientId),
  identityGate:new IdentityGate({expectedAudience:config.googleClientId,allowedSubjectHash:config.allowedSubjectHash,requireEmailVerified:true}),
  subjectHash:config.allowedSubjectHash
 });
}
