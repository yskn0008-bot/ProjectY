import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('./YOS_TODAY_TOMORROW_Widget_v1.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('(async function ()'));

function runtime(runsInWidget, denyPermissions) {
  let html = '';
  let widgetSet = false;
  let presented = 0;
  let completed = false;
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
  class Widget extends Stack {}
  const globals = {
    args: {widgetParameter: 'DAY'},
    config: {runsInWidget},
    Color: class {constructor(value) {this.value = value;}},
    Font: {semiboldSystemFont(){return {};},systemFont(){return {};}},
    Size: class {}, Point: class {}, LinearGradient: class {},
    FileManager: {
      local(){return {documentsDirectory(){return '/tmp';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};},
      iCloud(){return {documentsDirectory(){return '/icloud';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};}
    },
    Keychain: {contains(){return false;}},
    CalendarEvent: {async between(start){
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
  return {globals, snapshot:()=>({html,widgetSet,presented,completed})};
}

for (const runsInWidget of [true,false]) {
  for (const denyPermissions of [false,true]) {
    test('YOS Today '+(runsInWidget?'widget':'full screen')+' / '+(denyPermissions?'permission denied':'readable'), async () => {
      const mock = runtime(runsInWidget,denyPermissions);
      await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
      const actual = mock.snapshot();
      assert.equal(actual.completed,true);
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
