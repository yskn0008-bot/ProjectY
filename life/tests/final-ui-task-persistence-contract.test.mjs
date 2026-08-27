import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../home-v1.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../home-v1.css',import.meta.url),'utf8');

test('final Life identity and today-first controls are present',()=>{
  for(const label of ['MY LIFE','by YOS','今日の暮らしを整える'])assert.ok(html.includes(label),label);
  for(const label of ['今日のくらし','カレンダー','タスク','習慣','メモ','暮らしのリズム','今日のタスク'])assert.ok(js.includes(label),label);
  assert.match(css,/--life-home-accent:#3f9b72/);
});

test('shared navigation exposes all five domains while Life tools remain',()=>{
  for(const label of ['Home','Life','Money',"Hero's Journey",'Idea'])assert.ok(js.includes(label),label);
  for(const label of ['ホーム','予定','記録','改善'])assert.ok(js.includes(`label:'${label}'`),label);
});

test('existing three-task persistence remains non-destructive',()=>{
  assert.ok(html.includes("KEY='yos-life-v1'"));
  assert.ok(html.includes("SETTINGS='yos-life-settings-v1'"));
  assert.match(html,/while\(d\.tasks\.length<3\)/);
  assert.match(html,/localStorage\.setItem\(KEY,JSON\.stringify\(data\)\)/);
  assert.doesNotMatch(`${html}\n${js}`,/localStorage\.(?:removeItem|clear)\s*\(/);
});
