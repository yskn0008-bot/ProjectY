/**
 * Calendar-only WebAuthn passkey. New enrollment uses a verified, owner-edited
 * private Notion page; no Google sign-in is required. Legacy Tasks Google
 * authorization remains separate. Notion secrets never reach the browser.
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {allowedOrigin, bearerToken, secureJson, type CorsOptions} from '../api/shared.js';

const RP_ID = 'yskn0008-bot.github.io';
const RP_ORIGIN = 'https://' + RP_ID;
const CRED_KEY = 'yos:calendar:passkey:v1:primary';
const CHALLENGE = 'yos:calendar:passkey:v1:challenge:';
const SESSION = 'yos:calendar:passkey:v1:session:';
const SESSION_SECONDS = 12 * 3600;
const CHALLENGE_SECONDS = 300;
const PAIR = 'yos:calendar:passkey:v1:pair:';
const NOTION_VERSION = '2022-06-28';
const UUID = /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/iu;
const PAIR_CODE = /^YOS-[a-f0-9]{64}$/u;
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
  generation?: number;
}
type Fido = {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
};
export interface NotionPairingConfig {
  pageId: string;
  editorId: string;
  notionToken: string;
  // Must be manually audited: Notion API cannot prove that no other users
  // are granted edit access. Disabled unless ownership and sharing reviewed.
  auditedPrivate: boolean;
  fetchImpl?: FetchLike;
}
export interface PasskeyOptions extends CorsOptions {
  redis: RedisCommandClient;
  subjectHash: string;
  pairing?: NotionPairingConfig;
  fido?: Fido;
}
async function credential(redis: RedisCommandClient): Promise<CredentialRecord | null> {
  const data = await redis.command<string | null>(['GET', CRED_KEY]);
  if (!data) return null;
  const c = JSON.parse(data) as CredentialRecord;
  if (!match(c.id, /^[A-Za-z0-9_-]{20,1000}$/) || !match(c.publicKey, /^[A-Za-z0-9_-]{20,4000}$/) ||
      !Number.isSafeInteger(c.counter) || c.counter < 0 ||
      (c.generation !== undefined && (!Number.isSafeInteger(c.generation) || c.generation < 0)) ||
      typeof c.subjectHash !== 'string' ||
      !Array.isArray(c.transports)) throw Error('Invalid passkey record');
  return c;
}
function pairingAllowed(pairing: NotionPairingConfig | undefined): pairing is NotionPairingConfig {
  return !!pairing && pairing.auditedPrivate === true &&
    UUID.test(pairing.pageId) && UUID.test(pairing.editorId) && !!pairing.notionToken.trim();
}
async function verifyNotionEditorCode(config: NotionPairingConfig, code: string, startedAt: number) {
  // Only server-side reads. No integration token, private page blocks or
  // credential key material are returned to the unauthenticated client.
  const f: FetchLike = config.fetchImpl ?? fetch;
  const headers = {Authorization:'Bearer '+config.notionToken, 'Notion-Version':NOTION_VERSION};
  const page = await f('https://api.notion.com/v1/pages/'+config.pageId,{headers});
  if (!page.ok) throw Error('Notion page is not accessible');
  const pageJson: any = await page.json();
  if (pageJson?.object !== 'page' ||
      String(pageJson.id||'').replaceAll('-','').toLowerCase()!==config.pageId.replaceAll('-','').toLowerCase() ||
      pageJson.public_url !== null || pageJson.archived===true || pageJson.in_trash===true) {
    throw Error('Pairing page is not confirmed private');
  }
  const response = await f('https://api.notion.com/v1/blocks/'+config.pageId+'/children?page_size=100',{headers});
  if (!response.ok) throw Error('Notion blocks are not accessible');
  const content: any = await response.json();
  if (content?.has_more !== false || !Array.isArray(content.results) || content.results.length>100)
    throw Error('Notion pairing block set is not complete');
  const matched = content.results.filter((b:any)=>{
    if (b?.type!=='paragraph' || b.archived===true || b.in_trash===true ||
        String(b.last_edited_by?.id||'').replaceAll('-','').toLowerCase()!==config.editorId.replaceAll('-','').toLowerCase() ||
        typeof b.last_edited_time!=='string' || !Array.isArray(b.paragraph?.rich_text)) return false;
    const editedAt=Date.parse(b.last_edited_time);
    if (!Number.isFinite(editedAt) || editedAt + 30000 < startedAt) return false;
    return b.paragraph.rich_text.map((x:any)=>x?.plain_text).join('')===code;
  });
  if (matched.length!==1) throw Error('Owner-edited pairing proof is unavailable');
}
async function takeChallenge(redis: RedisCommandClient, requestId: unknown, kind: string) {
  if (!match(requestId, /^[a-f0-9]{64}$/)) throw Error('Invalid challenge ID');
  const data = await redis.command<string | null>(['GETDEL', CHALLENGE + requestId]);
  if (!data) throw Error('Challenge expired or used');
  const saved = JSON.parse(data) as {challenge:string;kind:string;mode?:string};
  if (saved.kind !== kind || !match(saved.challenge, /^[A-Za-z0-9_-]{30,150}$/)) throw Error('Challenge mismatch');
  return saved;
}
async function saveChallenge(redis: RedisCommandClient, challenge: string, kind: string, mode=kind) {
  const requestId = random();
  const stored = await redis.command<string | null>(
    ['SET', CHALLENGE + requestId, JSON.stringify({challenge,kind,mode}), 'NX', 'EX', CHALLENGE_SECONDS]
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
  const record = JSON.parse(data) as {subjectHash:string;expiresAt:number;generation?:number};
  if (record.subjectHash !== subjectHash || !Number.isFinite(record.expiresAt) ||
      record.expiresAt <= Date.now()) return false;
  // Credential generation is checked for every bearer request. A future
  // owner-verified recovery rotation can revoke all outstanding sessions
  // without scanning or deleting every Redis token key.
  const current = await credential(redis);
  return !!current && current.subjectHash === subjectHash &&
    (current.generation ?? 0) === (record.generation ?? 0);
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
      if (body.action === 'pair-start') {
        if (!pairingAllowed(options.pairing))
          return secureJson({error:'Notion pairing is not yet configured and verified'},503,origin);
        if (await credential(options.redis)) return secureJson({error:'Passkey already enrolled'},409,origin);
        const requestId=random(),code='YOS-'+random(),startedAt=Date.now();
        const ok=await options.redis.command<string|null>([
          'SET',PAIR+requestId,JSON.stringify({codeHash:await sha(code),startedAt,owner:options.subjectHash}),
          'NX','EX',CHALLENGE_SECONDS
        ]);
        if (ok!=='OK') throw Error('Pairing challenge unavailable');
        return secureJson({requestId,code,expiresIn:CHALLENGE_SECONDS,
          pageUrl:'https://www.notion.so/'+options.pairing.pageId.replaceAll('-','')},200,origin);
      }
      if (body.action === 'register-options') {
        if (!pairingAllowed(options.pairing))
          return secureJson({error:'Notion pairing is not yet configured and verified'},503,origin);
        if (await credential(options.redis)) return secureJson({error:'Passkey already enrolled'},409,origin);
        if (!match(body.pairRequestId,/^[a-f0-9]{64}$/) || !match(body.pairCode,PAIR_CODE))
          throw Error('Invalid pairing proof');
        const pairKey=PAIR+body.pairRequestId;
        const saved=await options.redis.command<string|null>(['GET',pairKey]);
        if (!saved) throw Error('Pairing challenge expired');
        const pair=JSON.parse(saved) as {codeHash:string;startedAt:number;owner:string};
        if (pair.owner!==options.subjectHash || pair.codeHash!==await sha(body.pairCode) ||
            !Number.isFinite(pair.startedAt) || pair.startedAt>Date.now()+30000 ||
            Date.now()-pair.startedAt>CHALLENGE_SECONDS*1000)
          throw Error('Pairing proof does not match');
        await verifyNotionEditorCode(options.pairing,body.pairCode,pair.startedAt);
        // Consume only after owner edit verified, atomically. No replay.
        const consumed=await options.redis.command<string|null>(['GETDEL',pairKey]);
        if (consumed!==saved) throw Error('Pairing proof was consumed or replaced');
        const registration=await fido.generateRegistrationOptions({
          rpName:'YOS Calendar',rpID:RP_ID,userName:'YOS Owner',
          userID:new TextEncoder().encode(options.subjectHash),attestationType:'none',
          supportedAlgorithmIDs:[-7,-257],
          authenticatorSelection:{residentKey:'required',userVerification:'required'}
        });
        const requestId=await saveChallenge(options.redis,registration.challenge,'register','notion');
        return secureJson({requestId,options:registration},200,origin);
      }
      if (body.action === 'register-verify') {
        if (!pairingAllowed(options.pairing))
          return secureJson({error:'Notion pairing is not yet configured and verified'},503,origin);
        if (await credential(options.redis)) return secureJson({error:'Passkey already enrolled'},409,origin);
        const saved=await takeChallenge(options.redis,body.requestId,'register');
        if (saved.mode!=='notion') throw Error('Enrollment proof was not verified');
        const v=await fido.verifyRegistrationResponse({
          response:body.credential,expectedChallenge:saved.challenge,expectedOrigin:RP_ORIGIN,expectedRPID:RP_ID,
          requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]
        });
        if (!v.verified || !v.registrationInfo?.credential) throw Error('Unverified registration');
        const c=v.registrationInfo.credential;
        const record: CredentialRecord = {
          id:c.id,publicKey:b64url(c.publicKey),counter:c.counter,
          transports:c.transports||[],subjectHash:options.subjectHash,generation:0
        };
        const result=await options.redis.command<string|null>(['SET',CRED_KEY,JSON.stringify(record),'NX']);
        if (result!=='OK') throw Error('Credential already enrolled or storage unavailable');
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
          response:body.credential,expectedChallenge:challenge.challenge,expectedOrigin:RP_ORIGIN,expectedRPID:RP_ID,
          requireUserVerification:true,
          credential:{id:c.id,publicKey:fromB64(c.publicKey),counter:c.counter,transports:c.transports as any}
        });
        if (!v.verified || !v.authenticationInfo || !Number.isSafeInteger(v.authenticationInfo.newCounter)) throw Error('Authentication unverified');
        // Synced passkeys may legitimately keep counter 0; all other counters increase.
        const next=v.authenticationInfo.newCounter;
        if (c.counter>0 && next<=c.counter) throw Error('Authenticator replay');
        // Atomic compare-and-swap prevents concurrent assertions from rolling back counters.
        const updated=await options.redis.command<number>([
          'EVAL',
          "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[1], ARGV[2]); return 1",
          1,CRED_KEY,JSON.stringify(c),JSON.stringify({...c,counter:next})
        ]);
        if (updated !== 1) throw Error('Credential changed during verification');
        const token='yos_pk_'+random();
        const expiresAt=Date.now()+SESSION_SECONDS*1000;
        const sessionSaved=await options.redis.command<string|null>(['SET',SESSION+await sha(token),JSON.stringify({subjectHash:options.subjectHash,expiresAt,generation:c.generation??0}),'NX','EX',SESSION_SECONDS]);
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
