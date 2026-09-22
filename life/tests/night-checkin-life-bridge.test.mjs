import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../night-checkin-life-bridge-v1.js',import.meta.url),'utf8');

function api(){
  const window={};
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  const atob=value=>Buffer.from(value,'base64').toString('binary');
  const btoa=value=>Buffer.from(value,'binary').toString('base64');
  vm.runInNewContext(source,{window,Date,Intl,TextEncoder:class{encode(v){return encoder.encode(v)}},TextDecoder:class{decode(v){return decoder.decode(v)}},Uint8Array,atob,btoa});
  return window.__yosNightCheckinLifeBridgeV1Api;
}

test('Night Check-in extends the existing yos-life-v1 day without creating another store',()=>{
  const bridge=api();
  const data={activeLifeDate:'2026-09-22',days:{'2026-09-22':{tasks:[{text:'既存タスク',done:false}],lifeFlow:{startedAt:'2026-09-22T08:00:00Z',tomorrowImportant:'既存'}}}};
  const result=bridge.saveInto(data,{raw_input:'今日は進んだ',summary:'前進',mood_state:'落ち着き',tomorrow:'続ける',discoveries:'仮説',three_line_diary:'1\n2\n3',tomorrow_message:'一歩',generated_at:'2026-09-22T23:00:00+09:00'});
  assert.equal(result.date,'2026-09-22');
  assert.equal(result.data.days['2026-09-22'].tasks[0].text,'既存タスク');
  assert.equal(result.data.days['2026-09-22'].lifeFlow.tomorrowImportant,'既存');
  assert.equal(result.data.days['2026-09-22'].lifeFlow.nightCheckin.summary,'前進');
  assert.equal(result.data.days['2026-09-22'].lifeFlow.nightCheckin.schema,'yos-night-checkin-v1');
  assert.equal('money' in result.data.days['2026-09-22'].lifeFlow.nightCheckin,false);
});

test('history returns only earlier Night records, oldest to newest, capped at 30',()=>{
  const bridge=api();
  const days={};
  for(let i=1;i<=35;i++){
    const date='2026-08-'+String(i).padStart(2,'0');
    days[date]={tasks:[{text:'T'+i,done:i%2===0}],lifeFlow:{nightCheckin:{summary:'S'+i,mood_state:'M'+i,discoveries:'D'+i}}};
  }
  days['2026-09-22']={lifeFlow:{nightCheckin:{summary:'today'}}};
  const records=bridge.historyFrom({days},'2026-09-22',30);
  assert.equal(records.length,30);
  assert.notEqual(records.at(-1).summary,'today');
  assert.equal(records.at(-1).date<'2026-09-22',true);
  assert.equal(records[0].date<records.at(-1).date,true);
});

test('base64 bridge round-trips Japanese Shortcut fields',()=>{
  const bridge=api();
  const input='今日あったこと\n気分：落ち着いた';
  assert.equal(bridge.decodeBase64Url(bridge.encodeBase64Url(input)),input);
});

test('Shortcut save lane writes through the same Life bridge and returns a save acknowledgement',()=>{
  assert.match(source,/params\.get\('night_save'\)==='1'/);
  assert.match(source,/night_raw_b64/);
  assert.match(source,/schema:'yos-night-save-ok-v1'/);
  assert.match(source,/shortcuts:\/\/run-shortcut\?name=/);
});

test('bridge source keeps the existing Life SSOT and has no Money duplication',()=>{
  assert.match(source,/const DATA_KEY='yos-life-v1'/);
  assert.match(source,/day\.lifeFlow=\{\.\.\.flow,nightCheckin:record\}/);
  assert.doesNotMatch(source,/localStorage\.setItem\(['"]yos-night/);
  assert.doesNotMatch(source,/spentToday|money:/);
});
