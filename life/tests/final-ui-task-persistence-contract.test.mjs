import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../home-v1.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../home-v1.css',import.meta.url),'utf8');

test('final Life identity and today-first controls are present',()=>{
  for(const label of ['MY LIFE','by YOS'])assert.ok(html.includes(label),label);
  for(const label of ['今日のくらし','カレンダー','タスク','習慣','メモ','今日の予定','次のタスク','暮らしのリズム'])assert.ok(js.includes(label),label);
  assert.match(css,/--life-home-accent:#5f866f/);
  assert.match(css,/Final Visual SSOT: a warm, compact day planner/);
  assert.match(css,/min-height:calc\(100dvh/,'Life planner must use the lower iPhone viewport');
  for(const className of ['life-day-ribbon-v2','life-paper-grid-v2','life-rhythm-v2','life-memo-v2','life-yos-companion-v2'])assert.ok(js.includes(className),className);
});

test('shared navigation exposes all five domains while Life tools remain',()=>{
  for(const label of ['Home','Life','Money','Hero’s Journey','Idea'])assert.ok(js.includes(label),label);
  for(const label of ['ホーム','予定','記録','改善'])assert.ok(js.includes(`label:'${label}'`),label);
  assert.match(js,/class="life-nav-compat-v1" data-page="record"/);
  assert.match(js,/if\(button\)activatePage\(button\.dataset\.page,true\)/);
  assert.match(css,/#lifeBottomNavV1\{[^}]*grid-template-columns:repeat\(5,1fr\)/);
  assert.match(css,/#lifeBottomNavV1 \.life-nav-compat-v1\{position:absolute;/);
  const domainNav=js.match(/const DOMAIN_NAV=\[(.*?)\];/s)?.[1] || '';
  assert.equal((domainNav.match(/\{label:/g) || []).length,5,'visible domain navigation must remain five items');
  for(const item of [
    "{label:'Home',icon:'⌂'",
    "{label:'Life',icon:'♡'",
    "{label:'Money',icon:'¥'",
    "{label:'Hero’s Journey',icon:'△'",
    "{label:'Idea',icon:'✦'"
  ]) assert.ok(domainNav.includes(item),item);
});

test('existing three-task persistence remains non-destructive',()=>{
  assert.ok(html.includes("KEY='yos-life-v1'"));
  assert.ok(html.includes("SETTINGS='yos-life-settings-v1'"));
  assert.match(html,/while\(d\.tasks\.length<3\)/);
  assert.match(html,/localStorage\.setItem\(KEY,JSON\.stringify\(data\)\)/);
  assert.match(html,/window\.__yosLifeToggleTaskV1=toggleTask/,'Home and detailed Life must share the same task save operation');
  assert.match(js,/window\.__yosLifeToggleTaskV1\(index\)/);
  assert.doesNotMatch(`${html}\n${js}`,/localStorage\.(?:removeItem|clear)\s*\(/);
  assert.match(js,/toggleTaskAt\(Number\(taskButton\.dataset\.homeTaskIndex\)\)/);
  assert.match(js,/\.\.\.\(data\.moneySafety&&typeof data\.moneySafety==='object'\?data\.moneySafety:\{\}\)/,'Life saves must retain compatible Money fields');
});
