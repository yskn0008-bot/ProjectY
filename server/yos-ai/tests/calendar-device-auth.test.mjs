import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTaskDashboardHandler} from '../dist/tasks/handler.js';

const origin='https://yskn0008-bot.github.io';
const deviceKey='yos_cd_'+'7'.repeat(64);
const deviceHash=createHash('sha256').update(deviceKey).digest('hex');

function fixture(configuredHash=deviceHash){
 const calls={google:0,notion:0};
 const handler=createTaskDashboardHandler({
  allowedOrigins:[origin,'https://other-allowed.example'],allowMissingOrigin:false,
  identityVerifier:{async verify(token){calls.google++;if(token!=='approved-google')throw Error('Not authorized');return {sub:'owner'}}},
  identityGate:{async authorize(){return {subjectHash:'owner'}}},
  googleWorkloadAuth:{mode:'application_default'},
  calendarDeviceKeyHash:configuredHash,
  notionToken:'private-token',
  notionDataSourceId:'965c608632c1463d93b487a9cb69b3ad',
  fetchImpl:async (url,options)=>{
   calls.notion++;
   assert.match(String(url),/^https:\/\/api\.notion\.com/);
   assert.equal(options.headers.Authorization,'Bearer private-token');
   return Response.json({results:[],has_more:false,next_cursor:null});
  }
 });
 function req(path='?source=notion',token=deviceKey,from=origin,method='GET',payload){
  return new Request('https://api.example.test/api/yos/tasks'+path,{
   method,headers:{Origin:from,Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
 }
 return {handler,req,calls};
}
test('device key reads existing Notion tasks without Google only for the official Calendar site',async()=>{
 const f=fixture();
 const res=await f.handler(f.req());
 assert.equal(res.status,200);
 const result=await res.json();
 assert.equal(result.source,'notion');
 assert.equal(result.complete,true);
 assert.equal(f.calls.google,0);
 assert.equal(f.calls.notion,1);
});
test('device key cannot read Google projection, unknown sources or alternate allowed origin',async()=>{
 const f=fixture();
 assert.equal((await f.handler(f.req(''))).status,403);
 assert.equal((await f.handler(f.req('?source=google'))).status,403);
 assert.equal((await f.handler(f.req('?source=notion',deviceKey,'https://other-allowed.example'))).status,403);
 assert.equal((await f.handler(f.req('?source=notion',deviceKey,'https://evil.example'))).status,403);
 assert.equal(f.calls.google,0);assert.equal(f.calls.notion,0);
});
test('no key, an incorrect key or a missing server hash never exposes Notion data',async()=>{
 const f=fixture();
 assert.equal((await f.handler(f.req('?source=notion','yos_cd_'+'0'.repeat(64)))).status,401);
 assert.equal((await f.handler(f.req('?source=notion','yos_cd_invalid'))).status,401);
 assert.equal((await f.handler(f.req('?source=notion',''))).status,401);
 const missing=fixture('');
 assert.equal((await missing.handler(missing.req())).status,401);
 assert.equal(f.calls.notion,0);assert.equal(missing.calls.notion,0);
});
test('original Google identity path stays available and untouched',async()=>{
 const f=fixture();
 assert.equal((await f.handler(f.req('?source=notion','approved-google'))).status,200);
 assert.equal(f.calls.google,1);
 assert.equal(f.calls.notion,1);
});
test('invalid task completion cannot reach Notion write API',async()=>{
 const f=fixture();
 const res=await f.handler(f.req('?source=notion',deviceKey,origin,'PATCH',{action:'complete',pageId:'wrong'}));
 assert.equal(res.status,400);assert.equal(f.calls.notion,0);
});
test('rotating the configured server-side hash revokes all old setup links',async()=>{
 const f=fixture('f'.repeat(64));
 assert.equal((await f.handler(f.req())).status,401);
 assert.equal(f.calls.notion,0);
});
