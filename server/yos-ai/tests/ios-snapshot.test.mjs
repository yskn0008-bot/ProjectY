import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createIosSnapshotHandler} from '../dist/intake/ios-snapshot.js';

const token='ios-snapshot-token-0123456789';
const tokenSha256=createHash('sha256').update(token).digest('hex');
const notionDataSourceId='01234567-89ab-cdef-0123-456789abcdef';

function makeRedis(){
  const state=new Map();
  return {
    state,
    client:{
      async command(command){
        const [name,key,value]=command;
        if(name==='SET'&&command.includes('NX')){
          if(state.has(key))return null;
          state.set(key,value);
          return 'OK';
        }
        if(name==='SET'){state.set(key,value);return 'OK';}
        if(name==='GET')return state.get(key)??null;
        if(name==='DEL')return state.delete(key)?1:0;
        throw new Error('Unexpected redis command '+name);
      }
    }
  };
}

function req(body,authorization=`Bearer ${token}`){
  return new Request('https://example.com/api/yos/intake?mode=ios-snapshot',{
    method:'POST',
    headers:{Authorization:authorization,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
}

function calendarBody(eventId,items,fullSnapshot=true){
  return {
    eventId,
    syncedAt:'2026-10-03T01:00:00+09:00',
    scope:'calendar:next7',
    fullSnapshot,
    items
  };
}

function reminderBody(eventId,items,fullSnapshot=true){
  return {
    eventId,
    syncedAt:'2026-10-03T01:01:00+09:00',
    scope:'reminder:next7',
    fullSnapshot,
    items
  };
}

function notionFetch(calls){
  let created=0;
  return async (input,init)=>{
    const url=String(input);
    calls.push({url,init});
    if(url.includes('/data_sources/')&&url.endsWith('/query')){
      return Response.json({results:[]});
    }
    if(url==='https://api.notion.com/v1/pages'&&init.method==='POST'){
      created+=1;
      return Response.json({id:`page-${created}`});
    }
    if(url.startsWith('https://api.notion.com/v1/pages/')&&init.method==='PATCH'){
      return Response.json({id:url.split('/').pop()});
    }
    throw new Error('Unexpected Notion request '+url);
  };
}

test('full calendar snapshot upserts current rows and retires rows missing from the next snapshot',async()=>{
  const redis=makeRedis();
  const calls=[];
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:notionFetch(calls)
  });

  const first=await handler(req(calendarBody('calendar-full-001',[
    {title:'歯医者',start:'2026-10-03T15:00:00+09:00',end:'2026-10-03T16:00:00+09:00'},
    {title:'買い物',start:'2026-10-04T10:00:00+09:00',end:'2026-10-04T11:00:00+09:00'}
  ])));
  assert.equal(first.status,201);
  const firstPayload=await first.json();
  assert.deepEqual(firstPayload,{ok:true,duplicate:false,updated:2,retired:0});

  const scopeKey='yos:notion:ios-snapshot:v1:scope:calendar:next7';
  const firstKeys=JSON.parse(redis.state.get(scopeKey));
  assert.equal(firstKeys.length,2);
  assert.ok(firstKeys.every((key)=>/^calendar:[a-f0-9]{64}$/u.test(key)));

  calls.length=0;
  const second=await handler(req(calendarBody('calendar-full-002',[
    {title:'歯医者',start:'2026-10-03T15:00:00+09:00',end:'2026-10-03T16:00:00+09:00'}
  ])));
  assert.equal(second.status,201);
  const secondPayload=await second.json();
  assert.equal(secondPayload.updated,1);
  assert.equal(secondPayload.retired,1);

  const patchBodies=calls
    .filter((call)=>call.url.startsWith('https://api.notion.com/v1/pages/')&&call.init.method==='PATCH')
    .map((call)=>JSON.parse(call.init.body));
  assert.ok(patchBodies.some((body)=>body.properties?.['状態']?.select?.name==='完了'));
  const secondKeys=JSON.parse(redis.state.get(scopeKey));
  assert.equal(secondKeys.length,1);
  assert.equal(secondKeys[0],firstKeys[0]);
});

test('empty full snapshot retires all previously known rows instead of leaving stale data',async()=>{
  const redis=makeRedis();
  const calls=[];
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:notionFetch(calls)
  });

  await handler(req(reminderBody('reminder-seed-001',[
    {title:'薬',due:'2026-10-03T12:00:00+09:00'}
  ])));
  calls.length=0;

  const response=await handler(req(reminderBody('reminder-empty-002',[])));
  assert.equal(response.status,201);
  const payload=await response.json();
  assert.equal(payload.updated,0);
  assert.equal(payload.retired,1);
  assert.deepEqual(JSON.parse(redis.state.get('yos:notion:ios-snapshot:v1:scope:reminder:next7')),[]);
  assert.ok(calls.some((call)=>{
    if(!call.url.startsWith('https://api.notion.com/v1/pages/'))return false;
    const body=JSON.parse(call.init.body);
    return body.properties?.['状態']?.select?.name==='完了';
  }));
});

test('partial snapshot adds a created item without retiring other scope members',async()=>{
  const redis=makeRedis();
  const calls=[];
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:notionFetch(calls)
  });

  await handler(req(calendarBody('calendar-seed-001',[
    {title:'A',start:'2026-10-03T09:00:00+09:00',end:'2026-10-03T10:00:00+09:00'}
  ])));
  calls.length=0;

  const response=await handler(req(calendarBody('calendar-partial-002',[
    {title:'B',start:'2026-10-04T09:00:00+09:00',end:'2026-10-04T10:00:00+09:00'}
  ],false)));
  assert.equal(response.status,201);
  const payload=await response.json();
  assert.equal(payload.updated,1);
  assert.equal(payload.retired,0);
  const keys=JSON.parse(redis.state.get('yos:notion:ios-snapshot:v1:scope:calendar:next7'));
  assert.equal(keys.length,2);
  assert.equal(calls.some((call)=>{
    if(!call.url.startsWith('https://api.notion.com/v1/pages/'))return false;
    const body=JSON.parse(call.init.body);
    return body.properties?.['状態']?.select?.name==='完了';
  }),false);
});

test('reminder snapshot produces an actionable Reminders row and app entry URL',async()=>{
  const redis=makeRedis();
  const calls=[];
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:notionFetch(calls)
  });
  const response=await handler(req(reminderBody('reminder-full-003',[
    {title:'薬',due:'2026-10-03T12:00:00+09:00'}
  ])));
  assert.equal(response.status,201);
  const create=calls.find((call)=>call.url==='https://api.notion.com/v1/pages');
  const body=JSON.parse(create.init.body);
  assert.equal(body.properties['状態'].select.name,'本人操作');
  assert.equal(body.properties['担当'].select.name,'陽介');
  assert.match(body.properties['同期キー'].rich_text[0].text.content,/^reminder:[a-f0-9]{64}$/u);
  assert.match(body.properties['操作URL'].url,/YOS_OpenApp/u);
  assert.match(body.properties['操作URL'].url,/reminders/u);
});

test('duplicate snapshot event performs no second Notion write',async()=>{
  const redis=makeRedis();
  const calls=[];
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:notionFetch(calls)
  });
  const body=calendarBody('calendar-duplicate-004',[
    {title:'A',start:'2026-10-03T09:00:00+09:00',end:'2026-10-03T10:00:00+09:00'}
  ]);
  assert.equal((await handler(req(body))).status,201);
  calls.length=0;
  const duplicate=await handler(req(body));
  assert.equal(duplicate.status,200);
  assert.deepEqual(await duplicate.json(),{ok:true,duplicate:true,updated:0,retired:0});
  assert.equal(calls.length,0);
});

test('invalid auth and malformed snapshot are rejected before Notion writes',async()=>{
  const redis=makeRedis();
  let calls=0;
  const handler=createIosSnapshotHandler({
    tokenSha256,
    notionToken:'notion-secret',
    notionDataSourceId,
    redis:redis.client,
    fetchImpl:async()=>{calls+=1;return Response.json({});}
  });
  assert.equal((await handler(req(calendarBody('bad-auth-001',[]),'Bearer wrong-token-but-long-enough'))).status,401);
  const invalid=calendarBody('bad-body-002',[{title:'A',start:'not-a-date',end:'2026-10-03T10:00:00+09:00'}]);
  assert.equal((await handler(req(invalid))).status,400);
  assert.equal(calls,0);
});
