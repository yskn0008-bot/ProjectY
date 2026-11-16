/**
 * YOS Calendar-only passkey credential and short-lived session.
 * Uses the same owner gate as existing Google Tasks authentication.
 * No secret or Notion token is ever served to the browser.
 */
import {createHash, randomBytes} from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import type {IdentityVerifier} from '../auth/types.js';
import type {IdentityGate} from '../auth/identity-gate.js';
import {allowedOrigin, bearerToken, secureJson, type CorsOptions} from '../api/shared.js';

export const CALENDAR_ORIGIN = 'https://yskn0008-bot.github.io';
export const CALENDAR_RP_ID = 'yskn0008-bot.github.io';
const CHALLENGE_LIFETIME_SECONDS = 300;
const SESSION_SECONDS = 12 * 60 * 60;
const PREFIX = 'yos:calendar:passkey:v1:';
const SESSION_TOKEN = /^yos_pk_[A-Za-z0-9_-]{43}$/u;
type Credential = {id:string; publicKey:string; counter:number; transports:string[]; owner:string};
export interface CalendarPasskeyOptions extends CorsOptions {
  redis:RedisCommandClient;
  identityVerifier:IdentityVerifier;
  identityGate:IdentityGate;
  allowedSubjectHash:string;
}
function sha(value:string){return createHash('sha256').update(value).digest('base64url')}
function credentialKey(owner:string){return PREFIX+'credential:'+owner}
function sessionKey(token:string){return PREFIX+'session:'+sha(token)}
function challengeKey(kind:'register'|'login',challenge:string){return PREFIX+'challenge:'+kind+':'+sha(challenge)}
function isObject(x:unknown):x is Record<string,any>{return !!x&&typeof x==='object'&&!Array.isArray(x)}
function clientChallenge(response:unknown):string{
  if(!isObject(response)||!isObject(response.response)||typeof response.response.clientDataJSON!=='string')throw Error('Invalid client response');
  const s=response.response.clientDataJSON;
  if(s.length>8192||!/^[A-Za-z0-9_-]+$/u.test(s))throw Error('Invalid client data');
  const parsed=JSON.parse(Buffer.from(s,'base64url').toString('utf8'));
  if(!isObject(parsed)||typeof parsed.challenge!=='string'||!/^[A-Za-z0-9_-]{32,256}$/u.test(parsed.challenge))throw Error('Invalid challenge');
  return parsed.challenge;
}
async function getCredential(redis:RedisCommandClient,owner:string):Promise<Credential|null>{
  const raw=await redis.command<string|null>(['GET',credentialKey(owner)]);
  if(!raw)return null;
  const obj:unknown=JSON.parse(raw);
  if(!isObject(obj)||obj.owner!==owner||typeof obj.id!=='string'||!/^[A-Za-z0-9_-]{16,1024}$/u.test(obj.id)||typeof obj.publicKey!=='string'||obj.publicKey.length>4096||!Number.isSafeInteger(obj.counter)||!Array.isArray(obj.transports))throw Error('Stored passkey is invalid');
  return obj as Credential;
}
export async function verifyCalendarPasskeySession(redis:RedisCommandClient,rawToken:string,owner:string):Promise<boolean>{
  if(!SESSION_TOKEN.test(rawToken))return false;
  const value=await redis.command<string|null>(['GET',sessionKey(rawToken)]);
  return value===owner;
}
async function saveChallenge(redis:RedisCommandClient,kind:'register'|'login',challenge:string){
  const state=await redis.command<string|null>(['SET',challengeKey(kind,challenge),'1','NX','EX',CHALLENGE_LIFETIME_SECONDS]);
  if(state!=='OK')throw Error('Challenge unavailable');
}
async function claimChallenge(redis:RedisCommandClient,kind:'register'|'login',response:unknown){
  const challenge=clientChallenge(response);
  const claimed=await redis.command<string|null>(['GETDEL',challengeKey(kind,challenge)]);
  if(claimed!=='1')throw Error('Challenge expired or already used');
  return challenge;
}
export function createCalendarPasskeyHandler(options:CalendarPasskeyOptions):(req:Request)=>Promise<Response>{
  return async request=>{
    const origin=allowedOrigin(request,options);
    if(origin!==CALENDAR_ORIGIN)return secureJson({error:'Origin not allowed'},403,null);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600',
      'Cache-Control':'no-store','Vary':'Origin'
    }});
    if(request.method==='GET'){
      try{return secureJson({registered:!!(await getCredential(options.redis,options.allowedSubjectHash))},200,origin)}
      catch{return secureJson({error:'Passkey storage unavailable'},503,origin)}
    }
    if(request.method!=='POST')return secureJson({error:'Method not allowed'},405,origin,{Allow:'GET, POST, OPTIONS'});
    if(!(request.headers.get('content-type')||'').startsWith('application/json'))return secureJson({error:'JSON required'},415,origin);
    const body=await request.text();
    if(body.length>65536)return secureJson({error:'Request too large'},413,origin);
    let input:unknown;
    try{input=JSON.parse(body)}catch{return secureJson({error:'Invalid JSON'},400,origin)}
    if(!isObject(input)||typeof input.action!=='string')return secureJson({error:'Invalid action'},400,origin);
    const action=input.action,owner=options.allowedSubjectHash;
    try{
      if(action==='register-options'||action==='register-verify'){
        // Enrollment is permitted only after the EXISTING Google identity gate.
        const googleToken=bearerToken(request);
        const identity=await options.identityVerifier.verify(googleToken);
        const allowed=await options.identityGate.authorize(identity);
        if(allowed.subjectHash!==owner)return secureJson({error:'Not authorized'},403,origin);
        if(action==='register-options'){
          if(await getCredential(options.redis,owner))return secureJson({error:'Passkey already registered'},409,origin);
          const opts=await generateRegistrationOptions({
            rpName:'YOS Calendar',rpID:CALENDAR_RP_ID,userName:'YOS',userDisplayName:'YOS',
            userID:Uint8Array.from(Buffer.from(owner,'base64url')),
            attestationType:'none',timeout:60000,
            authenticatorSelection:{residentKey:'required',userVerification:'required'}
          });
          await saveChallenge(options.redis,'register',opts.challenge);
          return secureJson({options:opts},200,origin);
        }
        if(await getCredential(options.redis,owner))return secureJson({error:'Passkey already registered'},409,origin);
        const response=input.response;
        const challenge=await claimChallenge(options.redis,'register',response);
        const verification=await verifyRegistrationResponse({
          response:response as any,expectedChallenge:challenge,
          expectedOrigin:CALENDAR_ORIGIN,expectedRPID:CALENDAR_RP_ID,
          requireUserPresence:true,requireUserVerification:true
        });
        if(!verification.verified||!verification.registrationInfo?.credential)throw Error('Attestation verification failed');
        const result=verification.registrationInfo.credential;
        if(result.id!==(response as any).id)throw Error('Credential identity mismatch');
        const stored:Credential={
          id:result.id,publicKey:Buffer.from(result.publicKey).toString('base64url'),
          counter:result.counter,transports:Array.isArray(result.transports)?result.transports:[],owner
        };
        const created=await options.redis.command<string|null>(['SET',credentialKey(owner),JSON.stringify(stored),'NX']);
        if(created!=='OK')return secureJson({error:'Passkey already registered'},409,origin);
        return secureJson({registered:true},200,origin);
      }
      if(action==='login-options'){
        const stored=await getCredential(options.redis,owner);
        if(!stored)return secureJson({error:'Register passkey using Google once'},409,origin);
        const opts=await generateAuthenticationOptions({
          rpID:CALENDAR_RP_ID,allowCredentials:[{id:stored.id,transports:stored.transports as any}],
          userVerification:'required',timeout:60000
        });
        await saveChallenge(options.redis,'login',opts.challenge);
        return secureJson({options:opts},200,origin);
      }
      if(action==='login-verify'){
        const stored=await getCredential(options.redis,owner);
        if(!stored)return secureJson({error:'Passkey not registered'},409,origin);
        const response=input.response;
        if(!isObject(response)||response.id!==stored.id)throw Error('Wrong credential');
        const challenge=await claimChallenge(options.redis,'login',response);
        const verified=await verifyAuthenticationResponse({
          response:response as any,expectedChallenge:challenge,
          expectedOrigin:CALENDAR_ORIGIN,expectedRPID:CALENDAR_RP_ID,
          requireUserVerification:true,
          credential:{id:stored.id,publicKey:Uint8Array.from(Buffer.from(stored.publicKey,'base64url')),counter:stored.counter,transports:stored.transports as any}
        });
        if(!verified.verified)throw Error('Signature verification failed');
        // A synced passkey may have counter=0; the one-time challenge prevents replay.
        if(verified.authenticationInfo.newCounter>stored.counter){
          await options.redis.command(['SET',credentialKey(owner),JSON.stringify({...stored,counter:verified.authenticationInfo.newCounter})]);
        }
        const session='yos_pk_'+randomBytes(32).toString('base64url');
        await options.redis.command(['SET',sessionKey(session),owner,'EX',SESSION_SECONDS]);
        return secureJson({token:session,expiresIn:SESSION_SECONDS},200,origin);
      }
      if(action==='logout'){
        const token=bearerToken(request);
        if(!await verifyCalendarPasskeySession(options.redis,token,owner))return secureJson({error:'Authentication failed'},401,origin);
        await options.redis.command(['DEL',sessionKey(token)]);
        return secureJson({loggedOut:true},200,origin);
      }
      return secureJson({error:'Unknown action'},400,origin);
    }catch{
      return secureJson({error:'Passkey verification failed or temporarily unavailable'},401,origin);
    }
  }
}
