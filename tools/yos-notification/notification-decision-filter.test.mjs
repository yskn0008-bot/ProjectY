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


test('a forged or contradictory decision label never triggers a YOS notification',()=>{
  const base=good('P1');
  for(const input of [
    base.replace('優先度: P1','優先度: P1\n優先度: P2'),
    base.replace('YOS_ALERT\n優先度: P1','YOS_ALERT\nYOS_SILENT\n優先度: P1'),
    base.replace('YOS_ALERT\n優先度: P1','YOS_ALERT\n優先度: P2\n優先度: P1'),
    base.replace('優先度: P1','事実: something\n優先度: P1'),
    base+'\nYOS_SILENT'
  ]) assert.equal(evaluate(input),'',input);
});


test('long GPT prose cannot push the actionable next step and source outside notification text',()=>{
  const oversized=good('P0','重要事項'.repeat(300))
    .replace('本人への影響: 支払い可否の確認が必要','本人への影響: '+'大きな影響'.repeat(120))
    .replace('将来のリスク: 放置すると期限を過ぎる','将来のリスク: '+'損失リスク'.repeat(120));
  const output=evaluate(oversized);
  assert.match(output,/次の一手：原本で期限と手続を確認/);
  assert.match(output,/根拠：本日の元通知/);
  assert.equal(output.length<=550,true);
});


test('short Japanese natural alert is displayed without the old fixed headings',()=>{
  const {decisionResult,notificationText}=(()=>{let out;vm.runInNewContext(code,{module:{exports:{}},Script:undefined,args:undefined},{timeout:1000});const mod={exports:{}};vm.runInNewContext(code,{module:mod},{timeout:1000});return mod.exports})();
  const raw='YOS_ALERT\n口座振替が失敗しています。元アプリで請求期限を確認してください。';
  assert.equal(decisionResult(raw).status,'alert');
  assert.equal(notificationText(raw),'口座振替が失敗しています。元アプリで請求期限を確認してください。');
  assert.doesNotMatch(notificationText(raw),/事実:|影響:|根拠:|YOS_ALERT/);
});
test('SILENT stays empty; invalid or contradictory model output is NOT a completed silent decision',()=>{
  const mod={exports:{}};vm.runInNewContext(code,{module:mod},{timeout:1000});
  const {decisionResult,notificationText}=mod.exports;
  assert.equal(decisionResult('YOS_SILENT').status,'silent');
  assert.equal(notificationText('YOS_SILENT'),'');
  for(const raw of ['', '接続エラー', 'YOS_ALERT', 'YOS_ALERT\n確認コード 123456',
    'YOS_ALERT\n期限を確認してください\nYOS_SILENT']){
    assert.equal(decisionResult(raw).status,'invalid',raw);
    assert.equal(notificationText(raw),'');
  }
  assert.equal(decisionResult({yosMode:'structured',response:'YOS_ALERT\n口座が利用停止になりました。元アプリで確認してください。'}).status,'alert');
});
test('structured Scriptable mode distinguishes invalid, silent, and actionable without extra notifications',()=>{
  function run(response){
    let output;vm.runInNewContext(code,{args:{shortcutParameter:{yosMode:'structured',response}},
      Script:{setShortcutOutput(v){output=v},complete(){}},module:{exports:{}}},{timeout:1000});
    return output;
  }
  assert.equal(run('YOS_SILENT').status,'silent');
  assert.equal(run('YOS_ALERT\n銀行アプリで確認してください。').status,'alert');
  assert.equal(run('model timeout').status,'invalid');
});
