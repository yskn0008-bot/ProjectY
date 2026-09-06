import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseProjection} from '../dist/tasks/handler.js';

test('task projection parses metadata and ordered rows without source identifiers',()=>{
  const rows=[
    ['projection_version','1'],
    ['source','Notion YOS Tasks'],
    ['authoritative','FALSE'],
    ['generated_at','2026-09-07T06:40:00+09:00'],
    [],
    ['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'],
    [2,'02｜二番','実行中','開発','','P0','進める','証拠まで','なし','Issue #2'],
    [1,'01｜一番','本人操作','陽介','2026-09-07T10:00:00Z','P0','実行','完了確認','','Calendar']
  ];
  const parsed=parseProjection(rows);
  assert.equal(parsed.generatedAt,'2026-09-07T06:40:00+09:00');
  assert.deepEqual(parsed.tasks.map(item=>item.order),[1,2]);
  assert.equal(parsed.tasks[0].title,'01｜一番');
  assert.equal(parsed.tasks[0].due,'2026-09-07T10:00:00Z');
});

test('task projection rejects missing contract header and ignores malformed rows',()=>{
  assert.throws(()=>parseProjection([['wrong','header']]),/header/);
  const rows=[['実行順','やること','状態','担当','期限','優先度','次の一手','完了条件','ブロッカー','正本・根拠'],['x','bad'],[1,'ok']];
  assert.deepEqual(parseProjection(rows).tasks.map(item=>item.title),['ok']);
});

test('public source contains no private projection id or Notion token contract',()=>{
  const handler=readFileSync(new URL('../src/tasks/handler.ts',import.meta.url),'utf8');
  const route=readFileSync(new URL('../api/yos/tasks.mjs',import.meta.url),'utf8');
  const all=handler+route;
  assert.doesNotMatch(all,/1N7Pzs2ObijeiiLABtQR9uZUZf6-bNvBGXdCMnN-i-_c/);
  assert.doesNotMatch(all,/NOTION_API_TOKEN|965c6086-32c1-463d-93b4-87a9cb69b3ad/);
  assert.match(handler,/Authentication failed/);
  assert.match(handler,/Origin not allowed/);
});
