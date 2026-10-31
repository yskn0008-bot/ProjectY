import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('./YOS_TODAY_TOMORROW_Widget_v1.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('(async function ()'));

function runtime(runsInWidget, denyPermissions, widgetMode = 'DAY', withTaskFeed = false) {
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
    Request: class {constructor(){this.response={statusCode:200};} async loadJSON(){return {tasks:[{title:'TEST_DUE<&',due:new Date().toISOString().slice(0,10)}]};}},
    URLScheme: {forRunningScript(){return 'scriptable:///run?scriptName=YOS%20TODAY';}},
    CalendarEvent: {async between(start){
      if (!firstCalendarDate) firstCalendarDate = new Date(start).toISOString().slice(0,10);
      if (denyPermissions) throw new Error('Access denied');
      return [{title:'TEST_CAL_EVENT',startDate:new Date(start.getTime()+7200000),endDate:new Date(start.getTime()+10800000),isAllDay:false}];
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
