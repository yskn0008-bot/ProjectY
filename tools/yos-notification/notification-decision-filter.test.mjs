import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('./Notification-Decision-Filter-v0.5.js',import.meta.url),'utf8');
function evaluate(input) {
  let output;
  const ctx={
    args:{shortcutParameter:input},
    Script:{setShortcutOutput(v){output=v},complete(){}},
    module:{exports:{}}
  };
  vm.runInNewContext(code,ctx,{timeout:1000});
  return output;
}
function good(p='P1',body='請求期限が本日です') {
  return [
    'YOS_ALERT','優先度: '+p,'事実: '+body,
    '本人への影響: 支払い可否の確認が必要',
    '将来のリスク: 放置すると期限を過ぎる',
    '推奨する次の一手: 原本で期限と手続を確認',
    '根拠と鮮度: 本日の元通知。残高未取得'
  ].join('\n');
}
const quiet=[
  'YOS_SILENT\n優先度: P3\n事実: 広告です',
  'YOS_SILENT','日常の通知です',
  '「YOS_ALERT」と書いてあるが通常案内',
  'YOS_ALERT\n優先度: P2\n事実: 通常案内\n推奨する次の一手: なし\n根拠と鮮度: 元通知',
  good().replace('YOS_ALERT','YOS_SILENT'),
  good().replace('優先度: P1','優先度: P3'),
  good().replace('事実: 請求期限が本日です','事実: '),
  good().replace('推奨する次の一手: 原本で期限と手続を確認','推奨する次の一手: '),
  good().replace('根拠と鮮度: 本日の元通知。残高未取得','根拠と鮮度: '),
  good().replace('YOS_ALERT\n',''),
  good().replace('YOS_ALERT','YOS_ALERTED'),
  good().replace('YOS_ALERT','YOS_ALERT\n優先度: P2'),
  '',null,undefined,{}
];
for(const [i,input] of quiet.entries())
  test('no duplicate notification on silent/invalid input '+(i+1),()=>assert.equal(evaluate(input),''));
test('valid P0/P1 creates only a Japanese alert with a concrete next action',()=>{
  for(const p of ['P0','P1']){
    const result=evaluate(good(p));
    assert.match(result,/【YOS重要｜P[01]】/);
    assert.match(result,/次の一手：原本で期限/);
    assert.doesNotMatch(result,/YOS_ALERT|YOS_SILENT/);
  }
});
test('mask long numbers before passing to notification surface',()=>{
  const value=evaluate({response:good('P1','取引番号 123456789012345678901')});
  assert.match(value,/長い番号非表示/);
  assert.doesNotMatch(value,/123456789012345678901/);
});
test('never repeat OTP or verification secrets on lock screen',()=>{
  assert.equal(evaluate(good('P0','認証コード123456')),'');
});
test('Scriptable executes output+complete without network/notification effects',()=>{
  let completed=0, output;
  vm.runInNewContext(code,{args:{shortcutParameter:good()},Script:{
    setShortcutOutput(v){output=v},complete(){completed++}
  }},{timeout:1000});
  assert.equal(completed,1);
  assert.match(output,/【YOS重要｜P1】/);
});

test('accept the already used five-field iPhone GPT contract without an extra risk field',()=>{
  const old=good().replace('推奨する次の一手','次の一手').replace('将来のリスク: 放置すると期限を過ぎる\n','');
  assert.match(evaluate(old),/次の一手：原本で期限/);
});
