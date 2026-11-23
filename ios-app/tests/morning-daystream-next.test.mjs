import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scriptable/YOS Today Note.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const runMorning=new AsyncFunction('args','WebView','Script',source);

async function render(shortcutParameter){
  let html='';
  class WebView{
    async loadHTML(markup){html=markup;}
    async present(){}
  }
  const Script={setShortcutOutput(){},complete(){}};
  await runMorning({shortcutParameter},WebView,Script);
  return html;
}

test('valid Morning input exposes one read-only DAYSTREAM next step',async()=>{
  const html=await render('【予定】\\n17:00 仕事');
  assert.equal((html.match(/id="morning-daystream-next"/g)||[]).length,1);
  assert.match(html,/href="https:\/\/yskn0008-bot\\.github\\.io\/ProjectY\/yos\/daystream\/"/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/今日の時間割を開く/);
  assert.match(html,/YOS DAILY NOTE/);
  assert.match(html,/YOS JOURNAL｜今日の見出し/);
});

test('missing Morning input remains clearly missing and does not suggest completed handoff',async()=>{
  const html=await render('');
  assert.match(html,/Morningからデータが届いていません/);
  assert.doesNotMatch(html,/id="morning-daystream-next"/);
});

test('user input is escaped and cannot alter the next-step link destination',async()=>{
  const html=await render('【予定】\\n<script>alert(1)</script>');
  assert.doesNotMatch(html,/<script>alert\\(1\\)<\\/script>/);
  assert.match(html,/&lt;script&gt;alert\\(1\\)&lt;\\/script&gt;/);
  assert.equal((html.match(/id="morning-daystream-next"/g)||[]).length,1);
});

test('the handoff does not change private sources, credentials or native shortcut',()=>{
  assert.doesNotMatch(source,/(?:FileManager\\.local|FileManager\\.iCloud|Keychain\\.set|CalendarEvent\\.create|Reminder\\.create|Notion.*POST)/);
  assert.match(source,/if\\(typeof Script\\.setShortcutOutput==='function'\\)Script\\.setShortcutOutput\\(rawInput\\)/);
});
