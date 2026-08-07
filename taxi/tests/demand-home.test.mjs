import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../demand-home-v144.js',import.meta.url),'utf8');
const context={globalThis:{}};
vm.runInNewContext(source,context);
const {businessDate,selectDemand}=context.globalThis.YosTaxiDemandHome;
const event=(overrides={})=>({date:'2026-08-07',title:'催事',area:'那覇',demandLevel:'high',confidence:'confirmed',demandWindows:['17:00-18:00'],sourceUrl:'https://example.test',sourceCheckedAt:'2026-08-06',...overrides});

test('午前8時より前は前日を営業日とする',()=>{
  assert.equal(businessDate(new Date(2026,7,8,7,59)),'2026-08-07');
  assert.equal(businessDate(new Date(2026,7,8,8,0)),'2026-08-08');
});

test('営業日の日付、現在時間帯、需要レベル、信頼度を使って選択する',()=>{
  const data={events:[
    event({title:'別日',date:'2026-08-08'}),
    event({title:'今後',demandWindows:['20:00-21:00']}),
    event({title:'開催中・低',demandLevel:'low',demandWindows:['17:00-19:00']}),
    event({title:'開催中・確認済み',demandLevel:'high',confidence:'confirmed',demandWindows:['17:00-19:00']}),
  ]};
  assert.equal(selectDemand(data,new Date(2026,7,7,18,0)).event.title,'開催中・確認済み');
});

test('終了済み需要は今後の需要より優先されない',()=>{
  const data={events:[event({title:'終了',demandWindows:['09:00-10:00']}),event({title:'今後',demandWindows:['20:00-21:00']})]};
  assert.equal(selectDemand(data,new Date(2026,7,7,18,0)).event.title,'今後');
});

test('ホーム導線、失敗時の未確認表示、保存キー非干渉を維持する',async()=>{
  const [html,sw]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../service-worker.js',import.meta.url),'utf8'),
  ]);
  assert.match(html,/href="\.\/demand-calendar\.html">需要カレンダー/);
  assert.match(source,/需要情報を確認できません/);
  assert.match(source,/公式情報・取得日/);
  assert.doesNotMatch(source,/localStorage\.(?:setItem|removeItem|clear)/);
  assert.match(html,/STORE='yos-taxi-ops-v1',SETTINGS='yos-taxi-settings-v2'/);
  assert.match(sw,/demand-calendar\.html/);
  assert.match(sw,/demand-calendar-v1\.json/);
});
