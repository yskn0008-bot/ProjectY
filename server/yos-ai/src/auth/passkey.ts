/**
 * Calendar-only WebAuthn passkey. Google identity is required exactly once to
 * enroll. Authentication after that verifies a WebAuthn signature, not Face ID
 * data. The browser never receives the Notion token or credential public key.
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type {IdentityGate} from './identity-gate.js';
import type {IdentityVerifier} from './types.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {allowedOrigin, bearerToken, secureJson, type CorsOptions} from '../api/shared.js';

const RP_ID = 'yskn0008-bot.github.io';
const RP_ORIGIN = 'https://' + RP_ID;
const CRED_KEY = 'yos:calendar:passkey:v1:primary';
const CHALLENGE = 'yos:calendar:passkey:v1:challenge:';
const SESSION = 'yos:calendar:passkey:v1:session:';
const SESSION_SECONDS = 12 * 3600;
const CHALLENGE_SECONDS = 300;
const hex = (bytes: Uint8Array) => [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const sha = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const match = (s: unknown, re: RegExp): s is string => typeof s === 'string' && re.test(s);

interface CredentialRecord {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  subjectHash: string;
}
type Fido = {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
};
export interface PasskeyOptions extends CorsOptions {
  redis: RedisCommandClient;
  identityGate: IdentityGate;
  identityVerifier: IdentityVerifier;
  subjectHash: string;
  fido?: Fido;
}
async function credential(redis: RedisCommandClient): Promise<CredentialRecord | null> {
  const data = await redis.command<string | null>(['GET', CRED_KEY]);
  if (!data) return null;
  const c = JSON.parse(data) as CredentialRecord;
  if (!match(c.id, /^[A-Za-z0-9_-]{20,1000}$/) || !match(c.publicKey, /^[A-Za-z0-9_-]{20,4000}$/) ||
      !Number.isSafeInteger(c.counter) || c.counter < 0 || typeof c.subjectHash !== 'string' ||
      !Array.isArray(c.transports)) throw Error('Invalid passkey record');
  return c;
}
async function requireGoogle(request: Request, options: PasskeyOptions): Promise<void> {
  const id = await options.identityVerifier.verify(bearerToken(request));
  const account = await options.identityGate.authorize(id);
  if (account.subjectHash !== options.subjectHash) throw Error('Owner mismatch');
}
async function takeChallenge(redis: RedisCommandClient, requestId: unknown, kind: string) {
  if (!match(requestId, /^[a-f0-9]{64}$/)) throw Error('Invalid challenge ID');
  const data = await redis.command<string | null>(['GETDEL', CHALLENGE + requestId]);
  if (!data) throw Error('Challenge expired or used');
  const saved = JSON.parse(data) as {challenge:string;kind:string};
  if (saved.kind !== kind || !match(saved.challenge, /^[A-Za-z0-9_-]{30,150}$/)) throw Error('Challenge mismatch');
  return saved.challenge;
}
async function saveChallenge(redis: RedisCommandClient, challenge: string, kind: string) {
  const requestId = random();
  const stored = await redis.command<string | null>(
    ['SET', CHALLENGE + requestId, JSON.stringify({challenge,kind}), 'NX', 'EX', CHALLENGE_SECONDS]
  );
  if (stored !== 'OK') throw Error('Challenge storage unavailable');
  return requestId;
}
/** A session is a random opaque bearer, hashed at rest and limited to 12h. */
export async function verifyPasskeySession(token: string, redis: RedisCommandClient, subjectHash: string) {
  if (!match(token, /^yos_pk_[a-f0-9]{64}$/)) return false;
  const key = SESSION + await sha(token);
  const data = await redis.command<string | null>(['GET', key]);
  if (!data) return false;
  const record = JSON.parse(data) as {subjectHash:string;expiresAt:number};
  return record.subjectHash === subjectHash && Number.isFinite(record.expiresAt) && record.expiresAt > Date.now();
}
export function createPasskeyHandler(options: PasskeyOptions): (request: Request) => Promise<Response> {
  const fido: Fido = options.fido || {generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse};
  return async request => {
    const origin = allowedOrigin(request, options);
    // Origin is pinned to the deployed WebAuthn RP, not just the broad API CORS allowlist.
    if (origin === null || origin !== RP_ORIGIN) return secureJson({error:'Origin not allowed'},403,null);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store','Vary':'Origin'
    }});
    if (request.method !== 'POST') return secureJson({error:'Method not allowed'},405,origin);
    if (!(request.headers.get('content-type')||'').startsWith('application/json')) return secureJson({error:'JSON required'},415,origin);
    let body: any;
    try {
      const raw=await request.text();
      if (raw.length>32768) return secureJson({error:'Request too large'},413,origin);
      body=JSON.parse(raw);
      if (!body || typeof body !== 'object') throw Error();
    } catch {return secureJson({error:'Invalid request'},400,origin);}
    try {
      if (body.action === 'register-options') {
        await requireGoogle(request,options);
        if (await credential(options.redis)) return secureJson({error:'Passkey already enrolled'},409,origin);
        const registration = await fido.generateRegistrationOptions({
          rpName:'YOS Calendar',rpID:RP_ID,userName:'YOS Owner',
          userID:new TextEncoder().encode(options.subjectHash),attestationType:'none',
          supportedAlgorithmIDs:[-7,-257],
          authenticatorSelection:{residentKey:'required',userVerification:'required'}
        });
        const requestId = await saveChallenge(options.redis,registration.challenge,'register');
        return secureJson({requestId,options:registration},200,origin);
      }
      if (body.action === 'register-verify') {
        await requireGoogle(request,options);
        const challenge=await takeChallenge(options.redis,body.requestId,'register');
        if (await credential(options.redis)) return secureJson({error:'Passkey already enrolled'},409,origin);
        const v=await fido.verifyRegistrationResponse({
          response:body.credential,expectedChallenge:challenge,expectedOrigin:RP_ORIGIN,expectedRPID:RP_ID,
          requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]
        });
        if (!v.verified || !v.registrationInfo?.credential) throw Error('Unverified registration');
        const c=v.registrationInfo.credential;
        const saved: CredentialRecord = {
          id:c.id,publicKey:b64url(c.publicKey),counter:c.counter,
          transports:c.transports||[],subjectHash:options.subjectHash
        };
        const result=await options.redis.command<string|null>(['SET',CRED_KEY,JSON.stringify(saved),'NX']);
        if (result !== 'OK') throw Error('Credential exists or storage unavailable');
        return secureJson({registered:true},200,origin);
      }
      if (body.action === 'auth-options') {
        const c=await credential(options.redis);
        if (!c || c.subjectHash !== options.subjectHash) return secureJson({registered:false},409,origin);
        const authentication=await fido.generateAuthenticationOptions({
          rpID:RP_ID,userVerification:'required',allowCredentials:[{id:c.id,transports:c.transports as any}]
        });
        const requestId=await saveChallenge(options.redis,authentication.challenge,'authenticate');
        return secureJson({requestId,options:authentication,registered:true},200,origin);
      }
      if (body.action === 'auth-verify') {
        const challenge=await takeChallenge(options.redis,body.requestId,'authenticate');
        const c=await credential(options.redis);
        if (!c || c.subjectHash!==options.subjectHash || body.credential?.id !== c.id) throw Error('Credential not registered');
        const v=await fido.verifyAuthenticationResponse({
          response:body.credential,expectedChallenge:challenge,expectedOrigin:RP_ORIGIN,expectedRPID:RP_ID,
          requireUserVerification:true,
          credential:{id:c.id,publicKey:fromB64(c.publicKey),counter:c.counter,transports:c.transports as any}
        });
        if (!v.verified || !v.authenticationInfo || !Number.isSafeInteger(v.authenticationInfo.newCounter)) throw Error('Authentication unverified');
        // Synced passkeys may legitimately keep counter 0; all other counters increase.
        const next=v.authenticationInfo.newCounter;
        if (c.counter>0 && next<=c.counter) throw Error('Authenticator replay');
        const saved=await options.redis.command<string|null>(['SET',CRED_KEY,JSON.stringify({...c,counter:next}),'XX']);
        if (saved !== 'OK') throw Error('Credential update failed');
        const token='yos_pk_'+random();
        const expiresAt=Date.now()+SESSION_SECONDS*1000;
        const sessionSaved=await options.redis.command<string|null>(['SET',SESSION+await sha(token),JSON.stringify({subjectHash:options.subjectHash,expiresAt}),'NX','EX',SESSION_SECONDS]);
        if (sessionSaved!=='OK') throw Error('Session storage failed');
        return secureJson({token,expiresAt},200,origin);
      }
      if (body.action === 'logout') {
        const token=bearerToken(request);
        if (!(await verifyPasskeySession(token,options.redis,options.subjectHash))) return secureJson({error:'Invalid session'},401,origin);
        await options.redis.command<number>(['DEL',SESSION+await sha(token)]);
        return secureJson({loggedOut:true},200,origin);
      }
      return secureJson({error:'Unknown action'},400,origin);
    } catch {
      // No credential, challenge, key material or identity is ever returned in error messages.
      return secureJson({error:'Passkey request could not be verified'},401,origin);
    }
  };
}
