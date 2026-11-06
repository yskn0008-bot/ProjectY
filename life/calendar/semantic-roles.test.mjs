import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1]||'';
const colors={schedule:'#123A59',task:'#5E43A4',habit:'#146B4C',money:'#916200',danger:'#B42318'};
function whiteContrast(hex){
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const luminance=channels.reduce((v,c,i)=>v+[.2126,.7152,.0722][i]*linear(c),0);
  return 1.05/(luminance+.05);
}
test('semantic category colors are distinct and have WCAG AA text contrast on white',()=>{
  assert.equal(new Set(Object.values(colors)).size,5);
  for(const [name,hex] of Object.entries(colors)){
    assert.match(html,new RegExp('--'+name+':'+hex,'i'));
    assert.ok(whiteContrast(hex)>=4.5,name+' text contrast');
  }
});
test('first view is single-screen overview with day/week/month navigation',()=>{
  assert.match(script,/mode:'glance'/);
  for(const mode of ['glance','month','week','day'])assert.match(html,new RegExp('data-mode="'+mode+'"'));
  for(const id of ['glanceWeekDays','glanceScheduleItems','glanceTaskItems','glanceIncome','glanceExpense','glanceHabitText','glanceAdvice'])
    assert.match(html,new RegExp('id="'+id+'"'));
});
test('prototype never modifies existing Money or MY LIFE and does not pretend to live-sync Notion/Apple',()=>{
  assert.doesNotMatch(script,/\blocalStorage\.setItem\s*\(/);
  assert.doesNotMatch(script,/\bfetch\s*\(/);
  assert.match(script,/readLocal\('yos-life-v1'\)/);
  assert.match(script,/readLocal\('yos-money-v2'\)/);
  assert.match(html,/Notion・Apple：未接続/);
  assert.match(html,/架空の表示例/);
});
test('money privacy, planned versus actual and transfer exclusion are explicit',()=>{
  assert.match(script,/state\.moneyPrivate=Boolean\(data\?\.privacy\)/);
  assert.match(script,/state\.moneyRead=Boolean\(data&&Array\.isArray\(data\.transactions\)&&!state\.moneyPrivate\)/);
  assert.match(script,/const hasDayMoney=money\.length>0/);
  assert.match(script,/available&&hasDayMoney\?cash/);
  assert.match(script,/\['expense','debt','saving','investment'\]/);
  assert.match(script,/completed===true\|\|tx\.paid===true/);
});
test('single habit report is NOT mistaken for 100-percent completion',()=>{
  assert.match(html,/aria-label="習慣の実施報告の有無"/);
  assert.match(script,/habitRecords\?'記録あり':'未確認'/);
  assert.match(script,/classList\.toggle\('has-report',Boolean\(habitRecords\)\)/);
  assert.doesNotMatch(script,/glanceHabitBar'\)\.style\.width='100%'/);
  assert.match(script,/記録なし＝未実施ではありません/);
});
test('inline JavaScript is syntactically valid and user-visible freshness is present',()=>{
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script));
  assert.match(html,/id="lastRead"/);
  assert.match(html,/id="sourceDetail"/);
  assert.match(script,/window\.addEventListener\('storage'/);
});
