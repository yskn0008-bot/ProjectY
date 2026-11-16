import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTaskDashboardHandler} from '../dist/tasks/handler.js';

const origin='https://yskn0008-bot.github.io';
const subjectHash='owner';
const token='yos_pk_'+'a'.repeat(64);
const key='yos:calendar:passkey:v1:session:'+createHash('sha256').update(token).digest('hex');

function fixture(){
 const sessions=new Map([[key,JSON.stringify({subjectHash,expiresAt:Date.now()+60_000})]]);
 const counts={google:0,notion:0};
 const redis={async command([command,redisKey]){
  assert.equal(command,'GET');return sessions.get(redisKey)??null;
 }};
 const h=createTaskDashboardHandler({
  allowedOrigins:[origin],allowMissingOrigin:false,
  identityVerifier:{async verify(value){counts.google++;if(value!=='approved-google')throw Error('Invalid Google token');return {}}},
  identityGate:{async authorize(){return {subjectHash}}},
  googleWorkloadAuth:{mode:'application_default'},
  passkeyRedis:redis,passkeySubjectHash:subjectHash,habitRedis:redis,
  notionToken:'private-notion-token',notionDataSourceId:'965c608632c1463d93b487a9cb69b3ad',
  async fetchImpl(url,init){
   counts.notion++;
   assert.match(String(url),/api.notion.com/);
   assert.equal(init.headers.Authorization,'Bearer private-notion-token');
   return Response.json({results:[],has_more:false,next_cursor:null});
  }
 });
 const req=(path,auth=token,method='GET')=>new Request('https://existing.example/api/yos/tasks'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+auth}});
 return {h,req,counts,sessions};
}
test('passkey authorizes only explicit Notion GET, never legacy Google projection',async()=>{
 const f=fixture();
 assert.equal((await f.h(f.req('?source=notion'))).status,200);
 assert.equal(f.counts.notion,1);
 assert.equal((await f.h(f.req(''))).status,403);
 assert.equal((await f.h(f.req('?source=google'))).status,403);
 assert.equal(f.counts.notion,1);
 assert.equal(f.counts.google,0);
});
test('expired and unknown passkey sessions do not reach Notion',async()=>{
 const f=fixture();
 f.sessions.set(key,JSON.stringify({subjectHash,expiresAt:Date.now()-1}));
 assert.equal((await f.h(f.req('?source=notion'))).status,401);
 assert.equal((await f.h(f.req('?source=notion','yos_pk_'+'b'.repeat(64)))).status,401);
 assert.equal(f.counts.notion,0);
});
test('existing Google token remains supported on the unchanged Notion endpoint',async()=>{
 const f=fixture();
 assert.equal((await f.h(f.req('?source=notion','approved-google'))).status,200);
 assert.equal(f.counts.google,1);
 assert.equal(f.counts.notion,1);
});
test('unauthorized PATCH cannot modify Notion',async()=>{
 const f=fixture();
 assert.equal((await f.h(f.req('?source=notion','wrong-google','PATCH'))).status,401);
 assert.equal(f.counts.notion,0);
});
