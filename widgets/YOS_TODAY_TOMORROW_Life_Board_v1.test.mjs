import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('./YOS_TODAY_TOMORROW_Widget_v1.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('(async function ()'));

function runtime(runsInWidget, denyPermissions, widgetMode = 'DAY', withTaskFeed = false, tasksOverride = null, calendarOverride = null) {
  let html = '';
  let widgetSet = false;
  let presented = 0;
  let completed = false;
  let widgetUrl = null;
  let firstCalendarDate = null;
  class Stack {
    addStack() { return new Stack(); }
    addText() { return {}; }
    addImage() { return {}; }
    addSpacer() {}
    setPadding() {}
    layoutHorizontally() {}
    layoutVertically() {}
    centerAlignContent() {}
  }
  class Widget extends Stack {set url(value){widgetUrl=value;}get url(){return widgetUrl;}}
  const globals = {
    args: {widgetParameter: widgetMode},
    config: {runsInWidget},
    Color: class {constructor(value) {this.value = value;}},
    Font: {semiboldSystemFont(){return {};},systemFont(){return {};}},
    Size: class {}, Point: class {}, LinearGradient: class {},
    FileManager: {
      local(){return {documentsDirectory(){return '/tmp';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};},
      iCloud(){return {documentsDirectory(){return '/icloud';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};}
    },
    Keychain: {contains(){return withTaskFeed;},get(){return 'mockToken';}},
    Request: class {constructor(){this.response={statusCode:200};} async loadJSON(){return {tasks:tasksOverride || [{title:'TEST_DUE<&',due:new Date().toISOString().slice(0,10)}]};}},
    URLScheme: {forRunningScript(){return 'scriptable:///run?scriptName=YOS%20TODAY';}},
    CalendarEvent: {async between(start){
      if (!firstCalendarDate) firstCalendarDate = new Date(start).toISOString().slice(0,10);
      if (denyPermissions) throw new Error('Access denied');
      return calendarOverride || [{title:'TEST_CAL_EVENT',startDate:new Date(start.getTime()+7200000),endDate:new Date(start.getTime()+10800000),isAllDay:false}];
    }},
    Reminder: {async allIncomplete(){
      if (denyPermissions) throw new Error('Access denied');
      return [{title:'TEST_ROUTINE',calendar:{title:'習慣'},dueDate:new Date()}];
    }},
    SFSymbol: {named(){return {applyFont(){},image:{}};}},
    ListWidget: Widget,
    WebView: class {async loadHTML(value){html=value;} async present(){presented++;}},
    Script: {setWidget(){widgetSet=true;},complete(){completed=true;}}
  };
  return {globals, snapshot:()=>({html,widgetSet,presented,completed,widgetUrl,firstCalendarDate})};
}

for (const runsInWidget of [true,false]) {
  for (const denyPermissions of [false,true]) {
    test('YOS Today '+(runsInWidget?'widget':'full screen')+' / '+(denyPermissions?'permission denied':'readable'), async () => {
      const mock = runtime(runsInWidget,denyPermissions);
      await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
      const actual = mock.snapshot();
      assert.equal(actual.completed,true);
      assert.equal(actual.widgetUrl,'scriptable:///run?scriptName=YOS%20TODAY');
      if (runsInWidget) {
        assert.equal(actual.widgetSet,true);
        assert.equal(actual.presented,0);
      } else {
        assert.equal(actual.widgetSet,false);
        assert.equal(actual.presented,1);
        assert.match(actual.html,/id="tabToday"/);
        assert.match(actual.html,/id="tabWeek"/);
        assert.match(actual.html,denyPermissions?/Appleカレンダー未取得/:/TEST_CAL_EVENT/);
        assert.match(actual.html,denyPermissions?/未連携/:/TEST_ROUTINE/);
      }
    });
  }
}

test('NIGHT parameter never turns app-mode Today into tomorrow', async () => {
  const mock = runtime(false,false,'NIGHT',true);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const view=mock.snapshot();
  assert.equal(view.firstCalendarDate,new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()).toISOString().slice(0,10));
  assert.match(view.html,/期限｜TEST_DUE&lt;&amp;/);
  assert.match(view.html,/タスク期限はYOSの優先最大3件のみ/);
});

test('when Calendar access is denied, available due tasks remain visible', async () => {
  const mock = runtime(false,true,'DAY',true);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const view=mock.snapshot();
  assert.match(view.html,/予定未取得/);
  assert.match(view.html,/期限｜TEST_DUE&lt;&amp;/);
});

test('overdue task is not silently promoted as todays top priority', async () => {
  const localDate = offset => {
    const now = new Date();
    const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const tasks = [
    {title:'21 | Old Night Brief task',due:localDate(-20),nextAction:'Long historical detail should be folded away'},
    {title:'22 | Relevant current task',due:localDate(+1),nextAction:'Current action'},
  ];
  const mock = runtime(false,false,'DAY',true,tasks);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page = mock.snapshot().html;
  const firstHero = page.slice(page.indexOf('<section class="hero">'),page.indexOf('</section>',page.indexOf('<section class="hero">')));
  assert.match(firstHero,/今日の見通し/);
  assert.doesNotMatch(firstHero,/Relevant current task/);
  assert.match(page,/Relevant current task/);
  assert.doesNotMatch(firstHero,/Old Night Brief task/);
  assert.match(page,/期限を過ぎた登録タスク 1件/);
  assert.match(page,/Old Night Brief task/);
  assert.match(page,/<details><summary>対応内容を見る/);
  assert.doesNotMatch(page,/21 \| Old Night Brief task/);
});

test('a feed with only expired tasks is presented as needing verification', async () => {
  const before = new Date();
  const old = new Date(before.getFullYear(),before.getMonth(),before.getDate()-20);
  const due = [old.getFullYear(),String(old.getMonth()+1).padStart(2,'0'),String(old.getDate()).padStart(2,'0')].join('-');
  const mock = runtime(false,false,'DAY',true,[{title:'Night Brief',due}]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page = mock.snapshot().html;
  assert.match(page,/期限を過ぎた登録タスク 1件/);
  assert.match(page,/期限が過ぎたタスクの状態を確認/);
  assert.match(page,/Notionで状態を確認/);
});

test('explicit taxi-demand reference calendar entries are not reported as appointments', async () => {
  const d=new Date();
  const eventStart = new Date(d.getFullYear(),d.getMonth(),d.getDate(),9,0);
  const eventEnd = new Date(d.getFullYear(),d.getMonth(),d.getDate(),10,0);
  const calendar=[
    {title:'［タクシー需要］首里城復興祭',startDate:eventStart,endDate:eventEnd,isAllDay:true},
    {title:'My actual visit',startDate:new Date(eventStart.getTime()+7200000),endDate:new Date(eventEnd.getTime()+7200000),isAllDay:true}
  ];
  const mock=runtime(false,false,'DAY',false,null,calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/今日の見通し/);
  assert.match(page,/登録された予定 1件/);
  assert.match(page,/参考イベント 1件（予定とは別）/);
  assert.match(page,/My actual visit/);
  assert.match(page,/［タクシー需要］首里城復興祭/);
  const upcoming = page.slice(page.indexOf('これからの予定'),page.indexOf('<details class="refcalendar"'));
  assert.doesNotMatch(upcoming,/首里城復興祭/);
  assert.match(page,/class="weekref"/);
});

test('reference events alone do not count as personal appointment', async () => {
  const d=new Date();
  const calendar=[{title:'[タクシー需要] Local Event',startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),9),endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),10),isAllDay:true}];
  const mock=runtime(false,false,'DAY',false,null,calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/参考以外の予定は未登録/);
  assert.match(page,/参考イベント 1件（予定とは別）/);
});

test('the fullscreen header is offset below native WebView controls', () => {
  assert.match(source,/\.wrap\{max-width:640px;margin:auto;padding:112px 18px 72px/);
  assert.match(source,/\.task b\{display:-webkit-box;-webkit-line-clamp:2/);
});

test('readable typography is preserved in both views', () => {
  const styles = source.slice(source.indexOf('const styles = ['), source.indexOf('].join("");', source.indexOf('const styles = [')));
  const sizes = [...styles.matchAll(/font-size:(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 10, 'expected full-screen typography definitions');
  assert.ok(sizes.every((px) => px >= 14), 'full-screen text must not become tiny');
  assert.match(source, /label\(content,title,13,C\.soft,true\)/);
  assert.match(source, /label\(content,value,16,C\.ink,true,2\)/);
  assert.match(styles, /\.tabs button\{[^']*min-height:48px/);
  assert.match(source, /これからの予定/);
});

test('new view is read only and discloses unavailable sources', () => {
  assert.match(source,/読み取り専用の初期版/);
  assert.match(source,/健康：/);
  assert.doesNotMatch(source,/CalendarEvent\.create|Reminder\.create|\.writeString\(/);
});
