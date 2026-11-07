import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const captureCredential='synthetic-route-test-credential-2026';
const notionPage='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const api='https://local-route.test/api/yos/notification';
for (const name of [
  'YOS_CLARITY_INTAKE_TOKEN_SHA256','YOS_NOTION_API_TOKEN','YOS_NOTION_INBOX_PAGE_ID',
  'UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','GOOGLE_CLIENT_ID',
  'GOOGLE_ALLOWED_SUBJECT_HASH','YOS_ALLOWED_ORIGINS'
]) delete process.env[name];

const fakeBlocks=[];
const redisStore=new Map();
const remoteCalls=[];
globalThis.fetch=async function fakeNetwork(url,init={}){
  const address=String(url);
  const method=init.method??'GET';
  remoteCalls.push({address,method});
  if(address==='https://redis-route.test/'){
    const [command,key,value,...extra]=JSON.parse(init.body);
    let result;
    if(command==='SET'&&extra.includes('NX')){
      if(redisStore.has(key)) result=null;
      else{redisStore.set(key,value);result='OK'}
    }else if(command==='SET'){
      redisStore.set(key,value);result='OK';
    }else if(command==='GET')result=redisStore.get(key)??null;
    else if(command==='EVAL'){
      const args=JSON.parse(init.body);
      const leasedKey=args[3],owner=args[4];
      result=redisStore.get(leasedKey)===owner?(redisStore.delete(leasedKey)?1:0):0;
    }else throw new Error('Unexpected fake Redis operation '+command);
    return Response.json({result});
  }
  if(address.startsWith('https://api.notion.com/v1/blocks/')){
    if(method==='GET')return Response.json({results:fakeBlocks,has_more:false,next_cursor:null});
    if(method==='PATCH'){
      const children=JSON.parse(init.body).children;
      for(const child of children)fakeBlocks.push({...child,id:'fake-block-'+fakeBlocks.length});
      return Response.json({results:children.map((_,i)=>({id:'fake-block-'+i}))});
    }
  }
  throw new Error('Blocked unexpected external network call: '+address);
};

const route=(await import('../api/yos/notification.mjs')).default;
const request=(method,body,authorization,origin='')=>new Request(api,{
  method,headers:{
    ...(authorization?{Authorization:authorization}:{}),
    ...(body!==undefined?{'Content-Type':'application/json'}:{}),
    ...(origin?{Origin:origin}:{})
  },
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});

test('route rejects requests when service configuration is absent (503, no outbound I/O)',async()=>{
  const response=await route.fetch(request('GET'));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'YOS notification service is unavailable'});
  assert.equal(remoteCalls.length,0);
});

test('route CORS preflight accepts only explicitly allowed origin',async()=>{
  process.env.YOS_ALLOWED_ORIGINS='https://trusted-route.test';
  const good=new Request(api,{method:'OPTIONS',headers:{Origin:'https://trusted-route.test'}});
  const accepted=await route.fetch(good);
  assert.equal(accepted.status,204);
  assert.equal(accepted.headers.get('access-control-allow-origin'),'https://trusted-route.test');
  const bad=new Request(api,{method:'OPTIONS',headers:{Origin:'https://other-route.test'}});
  const denied=await route.fetch(bad);
  assert.equal(denied.status,403);
  assert.equal(denied.headers.get('access-control-allow-origin'),null);
  assert.equal(remoteCalls.length,0);
});

test('route connects auth, Redis receipt, Notion append, history and state transitions',async()=>{
  process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256=createHash('sha256').update(captureCredential).digest('hex');
  process.env.YOS_NOTION_API_TOKEN='synthetic-notion-test-value';
  process.env.YOS_NOTION_INBOX_PAGE_ID=notionPage;
  process.env.UPSTASH_REDIS_REST_URL='https://redis-route.test';
  process.env.UPSTASH_REDIS_REST_TOKEN='synthetic-redis-test-value';
  const auth='Bearer '+captureCredential;
  const noAuth=await route.fetch(request('GET'));
  assert.equal(noAuth.status,401);
  assert.equal(remoteCalls.length,0);
  const input={text:'銀行：引落失敗 8,200円',sourceApp:'銀行',eventId:'synthetic-route-event-0001'};
  const created=await route.fetch(request('POST',input,auth,'https://trusted-route.test'));
  assert.equal(created.status,201);
  assert.equal(created.headers.get('access-control-allow-origin'),'https://trusted-route.test');
  const payload=await created.json();
  assert.equal(payload.decision,'YOS_ALERT');
  assert.equal(payload.category,'money-review');
  assert.equal(fakeBlocks.length,1);
  const repeat=await route.fetch(request('POST',input,auth));
  assert.equal(repeat.status,200);
  assert.equal((await repeat.json()).duplicate,true);
  assert.equal(fakeBlocks.length,1);
  const history=await (await route.fetch(request('GET',undefined,auth))).json();
  assert.equal(history.events.length,1);
  assert.equal(history.events[0].status,'unread');
  const mark=await route.fetch(request('POST',{action:'mark',id:payload.id,status:'done'},auth));
  assert.equal(mark.status,200);
  assert.equal(fakeBlocks.length,2);
  const after=await (await route.fetch(request('GET',undefined,auth))).json();
  assert.equal(after.events[0].status,'done');
  assert.ok(remoteCalls.some(x=>x.address.startsWith('https://api.notion.com/v1/blocks/')));
  assert.ok(remoteCalls.some(x=>x.address==='https://redis-route.test/'));
});
