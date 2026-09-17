import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('quick add appends one unfinished task without replacing existing tasks',async()=>{
  const source=await read('task-quick-add-v1.js');
  const window={};
  vm.runInNewContext(source,{window,Date,Intl});
  const api=window.__yosLifeTaskQuickAddV1Api;
  const data={activeLifeDate:'2026-09-17',days:{'2026-09-17':{tasks:[{text:'既存',done:false,category:'personal'}],lifeFlow:{startedAt:'2026-09-17T08:00:00Z'}}}};
  const result=api.addTask(data,'動作確認');
  assert.equal(result.added,true);
  assert.deepEqual(data.days['2026-09-17'].tasks.map(task=>task.text),['既存','動作確認']);
  assert.equal(data.days['2026-09-17'].tasks[1].done,false);
});

test('quick add rejects empty and duplicate unfinished tasks and owns the plus button',async()=>{
  const [source,loader]=await Promise.all([read('task-quick-add-v1.js'),read('yos-suite-v3.js')]);
  const window={};
  vm.runInNewContext(source,{window,Date,Intl});
  const data={activeLifeDate:'2026-09-17',days:{'2026-09-17':{tasks:[{text:'動作確認',done:false}],lifeFlow:{startedAt:'x'}}}};
  assert.equal(window.__yosLifeTaskQuickAddV1Api.addTask(data,'  ').reason,'empty');
  assert.equal(window.__yosLifeTaskQuickAddV1Api.addTask(data,'動作確認').reason,'duplicate');
  assert.match(source,/button\[aria-label="タスクを追加"\]/);
  assert.match(source,/removeAttribute\('data-open-page'\)/);
  assert.match(loader,/task-quick-add-v1\.js\?v=1/);
  assert.doesNotMatch(source,/localStorage\.clear\(/);
});
