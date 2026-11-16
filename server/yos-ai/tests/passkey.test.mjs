import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasskeyHandler,verifyPasskeySession} from '../dist/auth/passkey.js';

const O='https://yskn0008-bot.github.io';
const PAGE='11111111-2222-3333-4444-555555555555';
const EDITOR='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const id='a'.repeat(32),subjectHash='owner';
function fixture({audited=true,wrongEditor=false,publicPage=false,authCounter=0,failSignature=false,beforeAuthStore=()=>{}}={}){
 const db=new Map();let code='',editedAt='';
 const redis={async command(args){
  const [cmd,key,value,...opts]=args;
  if(cmd==='GET')return db.get(key)??null;
  if(cmd==='GETDEL'){const x=db.get(key)??null;db.delete(key);return x}
  if(cmd==='DEL'){return Number(db.delete(key))}
  if(cmd==='SET'){
   if(opts.includes('NX')&&db.has(key))return null;
   if(opts.includes('XX')&&!db.has(key))return null;
   db.set(key,value);return 'OK';
  }
  if(cmd==='EVAL'){
   const [script,keysCount,k,previous,next]=args.slice(1);
   assert.equal(keysCount,1);assert.match(script,/redis.call/);
   if(db.get(k)!==previous)return 0;
   db.set(k,next);return 1;
  }
  throw Error('Unknown Redis command: '+cmd);
 }};
 const fido={
  async generateRegistrationOptions(o){
   assert.equal(o.rpID,'yskn0008-bot.github.io');
   assert.equal(o.authenticatorSelection.userVerification,'required');
   return {challenge:'C'.repeat(43),user:{id:'Z3JvdXA'},rp:{id:o.rpID}};
  },
  async verifyRegistrationResponse(o){
   assert.equal(o.expectedOrigin,O);assert.equal(o.expectedRPID,'yskn0008-bot.github.io');
   assert.equal(o.expectedChallenge,'C'.repeat(43));assert.equal(o.requireUserVerification,true);
   return failSignature?{verified:false}:{verified:true,registrationInfo:{credential:{id,publicKey:new Uint8Array(65).fill(1),counter:0,transports:['internal']}}};
  },
  async generateAuthenticationOptions(o){
   assert.equal(o.userVerification,'required');return {challenge:'D'.repeat(43),allowCredentials:o.allowCredentials};
  },
  async verifyAuthenticationResponse(o){
   assert.equal(o.expectedOrigin,O);assert.equal(o.expectedRPID,'yskn0008-bot.github.io');
   assert.equal(o.expectedChallenge,'D'.repeat(43));assert.equal(o.requireUserVerification,true);
   beforeAuthStore(db);
   return failSignature?{verified:false}:{verified:true,authenticationInfo:{newCounter:authCounter}};
  }
 };
 const pairing={pageId:PAGE,editorId:EDITOR,notionToken:'test-server-only',auditedPrivate:audited,
  async fetchImpl(url,init){
   assert.equal(init.headers.Authorization,'Bearer test-server-only');
   if(String(url).includes('/v1/pages/'))return Response.json({object:'page',id:PAGE,public_url:publicPage?'https://notion.site/public':null,archived:false});
   if(String(url).includes('/children'))return Response.json({has_more:false,results:[{
    type:'paragraph',last_edited_by:{id:wrongEditor?'00000000-0000-0000-0000-000000000000':EDITOR},
    last_edited_time:editedAt,paragraph:{rich_text:[{plain_text:code}]}
   }]});
   throw Error('Unexpected Notion url');
  }};
 const handler=createPasskeyHandler({redis,allowedOrigins:[O],subjectHash,pairing,fido});
 const request=async(action,params={},token='',origin=O)=>{const r=await handler(new Request('https://example.invalid/api/yos/tasks?passkey=1',{
  method:'POST',headers:{origin,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...params})
 }));return {status:r.status,json:await r.json()}};
 const begin=async()=>{
  const a=await request('pair-start');
  if(a.status!==200)return a;
  code=a.json.code;editedAt=new Date().toISOString();
  return a;
 };
 const enroll=async()=>{
  const a=await begin();assert.equal(a.status,200);
  const reg=await request('register-options',{pairRequestId:a.json.requestId,pairCode:a.json.code});assert.equal(reg.status,200);
  const verify=await request('register-verify',{requestId:reg.json.requestId,credential:{id}});
  return {a,reg,verify};
 };
 return {db,redis,request,handler,begin,enroll,setCode:x=>{code=x},setEditTime:x=>{editedAt=x}};
}

test('initial Google login is not required: owner-edited private Notion proof enrolls passkey',async()=>{
 const f=fixture();
 const {a,reg,verify}=await f.enroll();
 assert.match(a.json.code,/^YOS-[a-f0-9]{64}$/);assert.equal(reg.status,200);assert.equal(verify.status,200);
 assert.equal(verify.json.registered,true);
 assert.equal((await f.request('pair-start')).status,409);
});
test('Google bearer alone cannot enroll, and unaudited Notion page refuses any pairing',async()=>{
 const f=fixture();
 assert.equal((await f.request('register-options',{},'old-google-token')).status,401);
 const disabled=fixture({audited:false});
 assert.equal((await disabled.request('pair-start')).status,503);
 assert.equal((await disabled.request('register-options',{},'old-google-token')).status,503);
 assert.equal(disabled.db.size,0);
});
test('published or wrong-editor page cannot authorize passkey; secret never reflected',async()=>{
 for(const config of [{wrongEditor:true},{publicPage:true}]){
  const f=fixture(config);const a=await f.begin();
  assert.equal(a.status,200);
  const denied=await f.request('register-options',{pairRequestId:a.json.requestId,pairCode:a.json.code});
  assert.equal(denied.status,401);
  assert.doesNotMatch(JSON.stringify(denied.json),/YOS-[a-f0-9]{64}/);
  assert.equal([...f.db.keys()].filter(x=>x.includes('credential')).length,0);
 }
});
test('pairing requires exact code, valid timestamp, fresh challenge and cannot be replayed',async()=>{
 const f=fixture();const a=await f.begin();
 const p={pairRequestId:a.json.requestId,pairCode:a.json.code};
 assert.equal((await f.request('register-options',{...p,pairCode:'YOS-'+'0'.repeat(64)})).status,401);
 f.setEditTime(new Date(Date.now()-1000*3600).toISOString());
 assert.equal((await f.request('register-options',p)).status,401);
 f.setEditTime(new Date().toISOString());
 const reg=await f.request('register-options',p);assert.equal(reg.status,200);
 assert.equal((await f.request('register-options',p)).status,401);
 assert.equal((await f.request('register-verify',{requestId:reg.json.requestId,credential:{id}})).status,200);
 assert.equal((await f.request('register-verify',{requestId:reg.json.requestId,credential:{id}})).status,409);
});
test('invalid WebAuthn registration never stores credentials',async()=>{
 const f=fixture({failSignature:true});
 const a=await f.begin();
 const reg=await f.request('register-options',{pairRequestId:a.json.requestId,pairCode:a.json.code});
 assert.equal(reg.status,200);
 assert.equal((await f.request('register-verify',{requestId:reg.json.requestId,credential:{id}})).status,401);
 assert.equal([...f.db.keys()].filter(k=>k.includes('credential')).length,0);
});
test('passkey authentication creates hashed 12h session; replay and logout denied',async()=>{
 const f=fixture();assert.equal((await f.enroll()).verify.status,200);
 const options=await f.request('auth-options');assert.equal(options.status,200);
 const auth=await f.request('auth-verify',{requestId:options.json.requestId,credential:{id}});
 assert.equal(auth.status,200);assert.match(auth.json.token,/^yos_pk_[a-f0-9]{64}$/);
 assert.equal(await verifyPasskeySession(auth.json.token,f.redis,subjectHash),true);
 assert.equal(await verifyPasskeySession(auth.json.token,f.redis,'different'),false);
 assert.equal((await f.request('auth-verify',{requestId:options.json.requestId,credential:{id}})).status,401);
 const key=[...f.db.keys()].find(k=>k.includes(':session:'));assert.ok(key);
 assert.doesNotMatch(key,auth.json.token);
 const session=JSON.parse(f.db.get(key));
 assert.ok(session.expiresAt<=Date.now()+12*3600*1000&&session.expiresAt>Date.now());
 assert.equal((await f.request('logout',{},auth.json.token)).status,200);
 assert.equal(await verifyPasskeySession(auth.json.token,f.redis,subjectHash),false);
});
test('expired sessions are denied even if Redis key still exists',async()=>{
 const f=fixture();await f.enroll();
 const a=await f.request('auth-options');
 const auth=await f.request('auth-verify',{requestId:a.json.requestId,credential:{id}});
 const key=[...f.db.keys()].find(k=>k.includes(':session:'));
 const old=JSON.parse(f.db.get(key));f.db.set(key,JSON.stringify({...old,expiresAt:Date.now()-1}));
 assert.equal(await verifyPasskeySession(auth.json.token,f.redis,subjectHash),false);
});
test('atomic counter protection refuses concurrent modified credential without session',async()=>{
 const f=fixture({authCounter:1,beforeAuthStore:db=>{
  const key='yos:calendar:passkey:v1:primary';
  const current=JSON.parse(db.get(key));db.set(key,JSON.stringify({...current,counter:9}));
 }});
 await f.enroll();
 const a=await f.request('auth-options');
 assert.equal((await f.request('auth-verify',{requestId:a.json.requestId,credential:{id}})).status,401);
 assert.equal([...f.db.keys()].filter(k=>k.includes(':session:')).length,0);
});
test('origin, unsupported method and malformed JSON stop before enrollment',async()=>{
 const f=fixture();
 assert.equal((await f.request('pair-start',{},'','https://evil.example')).status,403);
 const raw=await f.handler(new Request('https://example.invalid/api/yos/tasks?passkey=1',
  {method:'POST',headers:{origin:O,'content-type':'application/json'},body:'not-json'}));
 assert.equal(raw.status,400);
 assert.equal((await f.request('auth-options')).status,409);
 assert.equal(f.db.size,0);
});
