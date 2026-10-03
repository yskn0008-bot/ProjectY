import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarToMirrorItem,
  reminderToMirrorItem,
  moneyToMirrorItem,
  missionControlToMirrorItems,
  reconcilePrefix,
  createBaseHomeRefreshHandler
} from '../dist/base-home/handler.js';

class MemoryRedis {
  constructor(){ this.map=new Map(); }
  async command(parts){
    const [op,key,...rest]=parts;
    if(op==='GET') return this.map.get(key) ?? null;
    if(op==='SET'){
      if(rest.includes('NX') && this.map.has(key)) return null;
      this.map.set(key, rest[0]);
      return 'OK';
    }
    if(op==='DEL') return this.map.delete(key) ? 1 : 0;
    throw new Error('unsupported redis op '+op);
  }
}

test('BASE HOME adapters preserve source ownership and stable mirror keys', () => {
  const calendar=calendarToMirrorItem({
    id:'event-abc',
    title:'歯医者',
    start:'2026-10-03T10:00:00+09:00',
    location:'那覇',
    allDay:false
  });
  assert.match(calendar.syncKey,/^calendar:[a-f0-9]{16}$/);
  assert.equal(calendar.area,'Life');
  assert.equal(calendar.status,'保留');
  assert.equal(calendar.actionUrl,'calshow:1790989200');

  const reminder=reminderToMirrorItem({
    id:'rem-1',
    title:'保険を確認',
    dueAt:'2026-10-03T12:00:00+09:00',
    priority:1,
    overdue:true
  });
  assert.match(reminder.syncKey,/^reminder:[a-f0-9]{16}$/);
  assert.equal(reminder.priority,'P0');
  assert.equal(reminder.status,'本人操作');
  assert.equal(reminder.blocker,'期限超過');

  const money=moneyToMirrorItem({
    updatedAt:'2026-10-03T08:00:00.000Z',
    usableAmount:1453,
    nextPayment:{label:'返済',date:'2026-10-10',amount:30000},
    nextIncome:{label:'家賃収入',date:'2026-10-13',amount:160485},
    shortfall:{amount:28547,date:'2026-10-10'},
    actionUrl:'scriptable:///run?scriptName=YOS%20Money%20v1.6'
  });
  assert.equal(money.syncKey,'money:current');
  assert.equal(money.status,'本人操作');
  assert.match(money.nextAction,/使えるお金 1,453円/);
  assert.match(money.nextAction,/次の支払い 2026-10-10 返済 30,000円/);
  assert.match(money.nextAction,/次の入金 2026-10-13 家賃収入 160,485円/);
  assert.match(money.blocker,/28,547円/);
});

test('Mission Control adapter mirrors active P0/P1 projects and recent completions only', () => {
  const items=missionControlToMirrorItems({
    updated_at:'2026-10-03T17:00:00+09:00',
    projects:[
      {id:'base',name:'BASE HOME',status:'active',priority:1,next_action:'同期',blocker:'deploy',source_links:['https://github.com/x/y']},
      {id:'later',name:'Later',status:'paused',priority:1,next_action:'later'},
      {id:'p3',name:'P3',status:'active',priority:3,next_action:'later'}
    ],
    recently_completed:[
      {id:'c1',title:'完了A',completed_at:'2026-10-03T07:00:00Z',result:'merged',source_url:'https://github.com/x/y/commit/1'}
    ]
  },'a'.repeat(40));
  assert.equal(items.length,2);
  assert.ok(items.some(x=>x.syncKey.startsWith('projecty:project:')&&x.status==='実行中'&&x.blocker==='deploy'));
  assert.ok(items.some(x=>x.syncKey.startsWith('projecty:recent:')&&x.status==='完了'));
});

test('reconcilePrefix archives only stale mirror-owned rows and clears mapping', async () => {
  const redis=new MemoryRedis();
  redis.map.set('yos:notion:mirror:v1:item:calendar:stale','page-stale');
  const calls=[];
  const fetchImpl=async (url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/query')){
      return Response.json({
        results:[
          {id:'page-keep',properties:{'同期キー':{rich_text:[{plain_text:'calendar:keep'}]}}},
          {id:'page-stale',properties:{'同期キー':{rich_text:[{plain_text:'calendar:stale'}]}}}
        ],
        has_more:false
      });
    }
    if(String(url).includes('/pages/page-stale')){
      return Response.json({id:'page-stale',archived:true});
    }
    throw new Error('unexpected '+url);
  };
  const archived=await reconcilePrefix({
    prefix:'calendar:',
    keep:new Set(['calendar:keep']),
    notionToken:'secret',
    notionDataSourceId:'965c608632c1463d93b487a9cb69b3ad',
    redis,
    fetchImpl
  });
  assert.equal(archived,1);
  assert.equal(redis.map.has('yos:notion:mirror:v1:item:calendar:stale'),false);
  assert.equal(calls.filter(x=>x.url.includes('/pages/page-stale')).length,1);
});

test('BASE HOME endpoint rejects bad auth before external writes', async () => {
  let calls=0;
  const handler=createBaseHomeRefreshHandler({
    widgetToken:'w'.repeat(32),
    notionToken:'notion',
    notionDataSourceId:'965c608632c1463d93b487a9cb69b3ad',
    redis:new MemoryRedis(),
    fetchImpl:async()=>{ calls+=1; return new Response('{}',{status:500}); }
  });
  const response=await handler(new Request('https://example.test/api/yos/widget?mode=base-home-refresh',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer wrong'},
    body:JSON.stringify({schema:'yos-base-home-refresh-v1',eventId:'base-home:1',syncedAt:new Date().toISOString(),calendar:[]})
  }));
  assert.equal(response.status,401);
  assert.equal(calls,0);
});

test('BASE HOME endpoint accepts empty snapshots so stale rows can be reconciled away', async () => {
  const redis=new MemoryRedis();
  const calls=[];
  const fetchImpl=async (url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/query')){
      return Response.json({
        results:[{id:'stale',properties:{'同期キー':{rich_text:[{plain_text:String(url).includes('x')?'x':'calendar:old'}]}}}],
        has_more:false
      });
    }
    if(String(url).includes('/pages/stale')) return Response.json({id:'stale',archived:true});
    throw new Error('unexpected '+url);
  };
  const handler=createBaseHomeRefreshHandler({
    widgetToken:'w'.repeat(32),
    notionToken:'notion',
    notionDataSourceId:'965c608632c1463d93b487a9cb69b3ad',
    redis,
    fetchImpl
  });
  const response=await handler(new Request('https://example.test/api/yos/widget?mode=base-home-refresh',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+('w'.repeat(32))},
    body:JSON.stringify({
      schema:'yos-base-home-refresh-v1',
      eventId:'base-home:20261003T170000',
      syncedAt:'2026-10-03T08:00:00.000Z',
      calendar:[]
    })
  }));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.results.calendar.archived,1);
});
