import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
test('P0 navigation and MY WAY identity are present',()=>{
  assert.match(html,/MY WAY by YOS/); assert.doesNotMatch(html,/MY WAY by (?!YOS)/);
  for(const label of ['Home','Life','Money','Hero’s Journey','Idea','過去の振り返り','記録 / ログ','目標 / 未来','過去の資産','Taxi','設定','ProjectY','YOS改善','ヘルプ']) assert.ok(html.includes(label),label);
  for(const label of ['今ここ','行き先','ここまで','次の一歩','現在状態','理由 / 背景','判断 / 行動']) assert.ok(html.includes(label),label);
});
test('second page has an explicit one-tap UI entry',()=>{
  assert.match(html,/<button[^>]+data-page="archive"[^>]*>[^<]*2ページ目/);
  assert.match(html,/<section id="archivePage"/);
});
test('final five-domain UI uses facts without fabricated Money values',()=>{
  for(const label of ['MY MONEY','MY JOURNEY','MY IDEA','今月のサマリー','お金の見える化','今日のひらめき']) assert.ok(html.includes(label),label);
  for(const page of ['home','money','journey','idea']) assert.match(html,new RegExp(`data-page="${page}"`));
  assert.match(html,/href="\.\.\/life\/"/);
  assert.match(js,/life\?\.moneySafety \|\| today\?\.money \|\| \{\}/);
  assert.doesNotMatch(html,/¥[0-9,]+|\d+%/,'unconnected financial amounts and progress must not be rendered');
  assert.match(html,/未設定/); assert.match(html,/データなし/);
  assert.ok(js.includes('yos-my-way-ideas-v1'));
});
test('existing Life and HJ data are read safely without migrations',()=>{
  for(const key of ['yos-life-v1','hj-domain-journeys-v1','hj-user-profile-v1','hj-daily-scenes-v1']) assert.ok(js.includes(key),key);
  assert.doesNotMatch(js,/localStorage\.removeItem|localStorage\.clear/);
  assert.match(js,/未設定/); assert.match(js,/データなし/);
});
test('iPhone width and offline assets remain supported',()=>{
  assert.match(html,/width=device-width/); assert.match(css,/@media\(max-width:370px\)/); assert.match(css,/safe-area-inset/);
  for(const asset of ['./index.html','./styles.css','./app.js','./manifest.webmanifest']) assert.ok(sw.includes(asset),asset);
  assert.match(sw,/CACHE_PREFIX/); assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
});
