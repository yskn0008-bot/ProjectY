import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasskeyHandler,verifyPasskeySession} from '../dist/auth/passkey.js';
const O='https://yskn0008-bot.github.io',id='a'.repeat(32),subjectHash='owner';
function fixture(){
 const db=new Map();let verifyCalls=0;
 const redis={async command(args){
  const [cmd,key,value,...opts]=args;
  if(cmd==='GET')return db.get(key)??null;
  if(cmd==='GETDEL'){const v=db.get(key)??null;db.delete(key);return v}
  if(cmd==='DEL'){const v=db.delete(key);return Number(v)}
  if(cmd==='SET'){
   if(opts.includes('NX')&&db.has(key))return null;
   if(opts.includes('XX')&&!db.has(key))return null;
   db.set(key,value);return 'OK';
  }
  throw Error('Unexpected Redis '+cmd)
 }};
 const fido={
  async generateRegistrationOptions(o){assert.equal(o.rpID,'yskn0008-bot.github.io');assert.equal(o.authenticatorSelection.userVerification,'required');return {challenge:'C'.repeat(43),user:{id:'Z3JvdXA'},rp:{id:o.rpID}}},
  async verifyRegistrationResponse(o){verifyCalls++;assert.equal(o.expectedOrigin,O);assert.equal(o.expectedRPID,'yskn0008-bot.github.io');assert.equal(o.requireUserVerification,true);assert.equal(o.expectedChallenge,'C'.repeat(43));return {verified:true,registrationInfo:{credential:{id,publicKey:new Uint8Array(65).fill(1),counter:0,transports:['internal']}}}},
  async generateAuthenticationOptions(o){assert.equal(o.rpID,'yskn0008-bot.github.io');assert.equal(o.userVerification,'required');return {challenge:'D'.repeat(43),allowCredentials:o.allowCredentials}},
  async verifyAuthenticationResponse(o){verifyCalls++;assert.equal(o.expectedOrigin,O);assert.equal(o.expectedRPID,'yskn0008-bot.github.io');assert.equal(o.expectedChallenge,'D'.repeat(43));assert.equal(o.requireUserVerification,true);return {verified:true,authenticationInfo:{newCounter:0}}}
 };
 const handler=createPasskeyHandler({redis,allowedOrigins:[O],identityVerifier:{async verify(token){if(token!=='real-google')throw Error('No verified Google');return {subject:'owner'}}},identityGate:{async authorize(){return {subjectHash}}},subjectHash,fido});
 const request=async(action,params={},token='',origin=O)=>{const r=await handler(new Request('https://example.invalid/api/yos/passkey',{method:'POST',headers:{origin,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...params})}));return {status:r.status,json:await r.json()}};
 return {request,handler,redis,db,verifyCalls:()=>verifyCalls};
}
test('only the approved Google subject can enroll a passkey; origin is pinned',async()=>{
 const f=fixture();
 assert.equal((await f.request('register-options')).status,401);
 assert.equal((await f.request('register-options',{},'real-google','https://other.invalid')).status,403);
 assert.equal(f.db.size,0);
});
test('registration requires Google at both steps and only one passkey is allowed',async()=>{
 const f=fixture();
 const begin=await f.request('register-options',{},'real-google');
 assert.equal(begin.status,200);
 assert.equal((await f.request('register-verify',{requestId:begin.json.requestId,credential:{id}},'wrong')).status,401);
 const end=await f.request('register-verify',{requestId:begin.json.requestId,credential:{id}},'real-google');
 assert.equal(end.status,200);assert.equal(end.json.registered,true);
 assert.equal((await f.request('register-verify',{requestId:begin.json.requestId,credential:{id}},'real-google')).status,401);
 assert.equal((await f.request('register-options',{},'real-google')).status,409);
});
test('Face ID proof exchanges once for a hashed 12h session; replay and logout fail closed',async()=>{
 const f=fixture();
 const a=await f.request('register-options',{},'real-google');
 assert.equal((await f.request('register-verify',{requestId:a.json.requestId,credential:{id}},'real-google')).status,200);
 const b=await f.request('auth-options');assert.equal(b.status,200);
 const login=await f.request('auth-verify',{requestId:b.json.requestId,credential:{id}});
 assert.equal(login.status,200);assert.match(login.json.token,/^yos_pk_[a-f0-9]{64}$/);
 assert.equal((await verifyPasskeySession(login.json.token,f.redis,subjectHash)),true);
 assert.equal((await verifyPasskeySession(login.json.token,f.redis,'different-owner')),false);
 assert.equal((await f.request('auth-verify',{requestId:b.json.requestId,credential:{id}})).status,401);
 assert.equal((await f.request('logout',{},login.json.token)).status,200);
 assert.equal((await verifyPasskeySession(login.json.token,f.redis,subjectHash)),false);
});
test('unregistered users cannot obtain a WebAuthn session and stale/invalid sessions are refused',async()=>{
 const f=fixture();
 assert.equal((await f.request('auth-options')).status,409);
 assert.equal((await verifyPasskeySession('yos_pk_'+id+id,f.redis,subjectHash)),false);
 assert.equal((await f.request('logout',{},'yos_pk_'+id+id)).status,401);
});
