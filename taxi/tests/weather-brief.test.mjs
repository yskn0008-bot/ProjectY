import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const js = await readFile(new URL('../weather-brief-v1.js',import.meta.url),'utf8');
const root={};const ctx={globalThis:root,URL,Date,Intl,Number,JSON,String,Error};
vm.runInNewContext(js,ctx,{filename:'weather-brief-v1.js'});
const weather=root.YosTaxiNahaWeather;
const NOW=Date.parse('2026-11-13T08:00:00Z');
function payload(now=NOW,rain=[0.1,1.4,0.2,0.6]){
  return {properties:{meta:{updated_at:new Date(now-20*60*1000).toISOString()},timeseries:rain.map((v,i)=>({time:new Date(now+i*3600000).toISOString(),data:{next_1_hours:{details:{precipitation_amount:v}}}}))}};
}
test('那覇6時間予報は公開日時・1時間ごとの降水量を検証し推定を分離する',()=>{
  const s=weather.extract(payload(),NOW);
  assert.equal(s.hours,4);
  assert.equal(s.wetHours,2);
  assert.equal(s.peakRain,1.4);
  assert.equal(s.firstWet,'2026-11-13T09:00:00.000Z');
  assert.match(weather.wording(s),/0.5mm以上の雨予報/);
});
test('雨がない場合も確定実況とは言わない',()=>{
  const s=weather.extract(payload(NOW,[0,0.2,0.3]),NOW);
  assert.equal(s.wetHours,0);
  assert.match(weather.wording(s),/予報/);
  assert.match(weather.wording(null),/取得できません/);
});
test('古い・未来の・不正な降水予報を拒否する',()=>{
  const stale=payload(NOW-7*3600000);
  assert.throws(()=>weather.extract(stale,NOW),/outdated/);
  const future=payload(NOW+60*60000);
  assert.throws(()=>weather.extract(future,NOW),/outdated/);
  assert.throws(()=>weather.extract({properties:{meta:{updated_at:new Date(NOW).toISOString()},timeseries:[]}},NOW),/unavailable/);
  const nonsensical=payload(NOW,[900,NaN,-1]);
  assert.throws(()=>weather.extract(nonsensical,NOW),/no next-six-hour/);
});
test('降水データが欠けている時に雨ゼロとして誤認しない',()=>{
  const absent=payload(NOW,[0,1]);
  absent.properties.timeseries[0].data.next_1_hours.details.precipitation_amount=null;
  const summary=weather.extract(absent,NOW);
  assert.equal(summary.hours,1);
  assert.equal(summary.peakRain,1);
  assert.throws(()=>weather.extract(payload(NOW,[null]),NOW),/no next-six-hour/);
});
test('既存営業前ブリーフから自動雨予報が起動し、手動確認への戻り道がある',async()=>{
  const html=await readFile(new URL('../demand-calendar.html',import.meta.url),'utf8');
  assert.match(html,/id="nahaAutoWeather"/);
  assert.match(html,/weather-brief-v1\.js/);
  assert.match(html,/https:\/\/www\.jma\.go\.jp\/bosai\/nowc\//);
  assert.match(js,/lat=26\.2124&lon=127\.6809/);
  assert.match(js,/CACHE_HOURS=3/);
  assert.match(js,/age<MAX_CACHE_AGE/);
  assert.match(js,/取得時点の約6時間予報/);
  assert.match(js,/AbortController/);
  assert.match(js,/CC BY 4\.0/);
  assert.doesNotMatch(html,/DiDiで配車/);
});
