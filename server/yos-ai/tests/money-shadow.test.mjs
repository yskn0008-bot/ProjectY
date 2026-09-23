import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoneyShadowHandler} from '../api/yos/money-shadow.mjs';

const ORIGIN='https://yskn0008-bot.github.io';
const TOKEN='A'.repeat(43);
function fakeStorage(){
  const store=new Map();
  const fetchImpl=async (_url,init)=>{
    const args=JSON.parse(init.body);
    const cmd=args[0],key=args[1],rest=args.slice(2);
    let result=null;
    if(cmd==='SETEX'){store.set(key,String(rest[1]));result='OK';}
    else if(cmd==='GET'){result=store.has(key)?store.get(key):null;}
    else if(cmd==='DEL'){result=store.delete(key)?1:0;}
    else if(cmd==='SET'){
      const value=String(rest[0]);
      const nx=rest.includes('NX');
      if(nx&&store.has(key))result=null;else{store.set(key,value);result='OK';}
    }else throw new Error('unexpected command '+cmd);
    return new Response(JSON.stringify({result}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {store,fetchImpl};
}
function harness(){
  const fake=fakeStorage();
  return {
    ...fake,
    run:createMoneyShadowHandler({
      environment:{UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'secret'},
      fetchImpl:fake.fetchImpl
    })
  };
}
function snapshot(overrides={}){
  return {
    updated_at:'2026-09-24T00:00:00.000Z',
    balance:4588,
    today_usable:0,
    spent_today:0,
    next_payment:{date:'2026-09-26',label:'車保険',amount:7060},
    next_income:{date:'2026-10-13',label:'家賃収入',amount:160485},
    projected_after_next_payment:-2472,
    shortage_after_next_payment:true,
    shortfall_after_next_payment:2472,
    shortage_possible:true,
    shortfall:89952,
    ...overrides
  };
}
function req(url,{method='GET',body,origin,token=TOKEN}={}){
  const headers={};
  if(token)headers['X-YOS-Money-Token']=token;
  if(origin)headers.Origin=origin;
  if(body!==undefined)headers['Content-Type']='application/json';
  return new Request(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}

test('first sync baselines the already-seen alert and next GET is silent',async()=>{
  const h=harness();
  let response=await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot()}));
  assert.equal(response.status,200);
  response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert'));
  assert.equal(response.status,204);
  assert.equal(await response.text(),'');
});

test('changed Money shortage is delivered once with real facts then suppressed',async()=>{
  const h=harness();
  await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot()}));
  await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot({shortfall:90500})}));
  let response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert'));
  assert.equal(response.status,200);
  const text=await response.text();
  assert.match(text,/90,500円/);
  assert.match(text,/9\/26 車保険 7,060円/);
  assert.match(text,/10\/13 家賃収入 160,485円/);
  response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert'));
  assert.equal(response.status,204);
});

test('clear state resets delivery so the same shortage can alert if it returns',async()=>{
  const h=harness();
  await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot()}));
  await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot({shortage_possible:false,shortfall:0})}));
  let response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert'));
  assert.equal(response.status,204);
  await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:snapshot()}));
  response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert'));
  assert.equal(response.status,200);
});

test('POST is restricted to the ProjectY Pages origin and token is required',async()=>{
  const h=harness();
  let response=await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:'https://evil.example',body:snapshot()}));
  assert.equal(response.status,403);
  response=await h.run(req('https://api.example/yos/money-shadow?mode=money-alert',{token:''}));
  assert.equal(response.status,401);
});

test('OPTIONS exposes only the minimal CORS contract',async()=>{
  const h=harness();
  const response=await h.run(new Request('https://api.example/yos/money-shadow',{method:'OPTIONS',headers:{Origin:ORIGIN}}));
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
  assert.match(response.headers.get('access-control-allow-headers'),/X-YOS-Money-Token/);
});

test('unknown Money values stay unknown instead of becoming zero',async()=>{
  const h=harness();
  const value=snapshot({balance:null,today_usable:null,next_payment:{date:'2026-09-26',label:'車保険',amount:null}});
  const response=await h.run(req('https://api.example/yos/money-shadow',{method:'POST',origin:ORIGIN,body:value}));
  assert.equal(response.status,200);
  const shadow=[...h.store.entries()].find(([key])=>key.startsWith('yos:money-shadow:'));
  assert.ok(shadow);
  const saved=JSON.parse(shadow[1]);
  assert.equal(saved.balance,null);
  assert.equal(saved.today_usable,null);
  assert.equal(saved.next_payment.amount,null);
});
