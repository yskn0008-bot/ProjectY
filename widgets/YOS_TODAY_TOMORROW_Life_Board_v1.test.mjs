import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('./YOS_TODAY_TOMORROW_Widget_v1.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('(async function ()'));

function runtime(runsInWidget, denyPermissions, widgetMode = 'DAY', withTaskFeed = false, tasksOverride = null, calendarOverride = null, feedTimestamp = undefined, fixedNow = null) {
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
  class DateForTest extends Date {
    constructor(...parts) {super(...(parts.length?parts:fixedNow?[fixedNow]:[]));}
    static now(){return fixedNow ? new Date(fixedNow).getTime() : Date.now();}
  }
  const globals = {
    args: {widgetParameter: widgetMode},
    Date: DateForTest,
    config: {runsInWidget},
    Color: class {constructor(value) {this.value = value;}},
    Font: {semiboldSystemFont(){return {};},systemFont(){return {};}},
    Size: class {}, Point: class {}, LinearGradient: class {},
    FileManager: {
      local(){return {documentsDirectory(){return '/tmp';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};},
      iCloud(){return {documentsDirectory(){return '/icloud';},joinPath(...parts){return parts.join('/');},fileExists(){return false;}};}
    },
    Keychain: {contains(){return withTaskFeed;},get(){return 'mockToken';}},
    Request: class {constructor(){this.response={statusCode:200};} async loadJSON(){return {generatedAt: feedTimestamp === undefined ? new Date().toISOString() : feedTimestamp, tasks:tasksOverride || [{title:'TEST_DUE<&',due:new Date().toISOString().slice(0,10)}]};}},
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
  const overview = page.slice(page.indexOf('<div class="quick">'),page.indexOf('</div>',page.indexOf('<div class="quick">')));
  assert.match(overview,/今日の見通し/);
  assert.doesNotMatch(overview,/Relevant current task/);
  assert.match(page,/Relevant current task/);
  assert.doesNotMatch(overview,/Old Night Brief task/);
  assert.match(page,/要確認｜期限が過ぎた登録 1件/);
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
  assert.match(page,/要確認｜期限が過ぎた登録 1件/);
  assert.match(page,/完了済みの可能性があります/);
  assert.match(page,/<details class="overdue"><summary>要確認｜期限が過ぎた登録 1件<\/summary>/);
  assert.doesNotMatch(page,/<details class="overdue" open/);
  assert.match(page,/未完了とは判定していません/);
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
  assert.match(page,/予定の登録なし/);
  assert.match(page,/参考イベント 1件（予定とは別）/);
});

test('a quiet day shows actionable tasks before only-reference calendar and no duplicate empty-state paragraphs', async () => {
  const d=new Date();
  const start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),9);
  const end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),10);
  const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const calendar=[{title:'［タクシー需要］参考イベント',startDate:start,endDate:end,isAllDay:true}];
  const tasks=[{title:'Current task',due:date,nextAction:'Open this when needed'}];
  const mock=runtime(false,false,'DAY',true,tasks,calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/<div class="quick">/);
  assert.match(page,/予定の登録なし · 優先 1件 · 参考 1件/);
  assert.ok(page.indexOf('大切なこと') < page.indexOf('これからの予定'),'tasks should come before reference-only schedule');
  assert.match(page,/参考イベント 1件（予定とは別）/);
  assert.doesNotMatch(page,/空き時間が確定したわけではありません。/);
  assert.equal((page.match(/予定の登録なし/g)||[]).length,1);
});

test('when no events exist at all, hide the empty calendar panel but preserve tasks and habits', async () => {
  const d=new Date();
  const due=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const mock=runtime(false,false,'DAY',true,[{title:'Do this today',due}],[]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/Do this today/);
  assert.doesNotMatch(page,/<h3>これからの予定<\/h3>/);
  assert.match(page,/<h3>習慣・身体<\/h3>/);
});

test('habits come before reference-only events on a quiet day', async () => {
  const d=new Date();
  const calendar=[{
    title:'［タクシー需要］参考のみ',
    startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),9),
    endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),10),
    isAllDay:true
  }];
  const mock=runtime(false,false,'DAY',true,[{title:'Task today'}],calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.ok(page.indexOf('<h3>大切なこと</h3>') < page.indexOf('<h3>習慣・身体</h3>'));
  assert.ok(page.indexOf('<h3>習慣・身体</h3>') < page.indexOf('<h3>これからの予定</h3>'));
  assert.match(page,/TEST_ROUTINE/);
  assert.match(page,/MY LIFEで記録を見る/);
});

test('normal appointment days keep the calendar visible ahead of habits', async () => {
  const d=new Date();
  const calendar=[{
    title:'Confirmed regular calendar entry',
    startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),9),
    endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate(),10),
    isAllDay:true
  }];
  const mock=runtime(false,false,'DAY',true,[{title:'Task today'}],calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.ok(page.indexOf('<h3>これからの予定</h3>') < page.indexOf('<h3>大切なこと</h3>'));
  assert.ok(page.indexOf('<h3>大切なこと</h3>') < page.indexOf('<h3>習慣・身体</h3>'));
});

test('fresh calendar and task feed yield a cautious actionable next step', async () => {
  const mock=runtime(false,false,'DAY',true,[{
    title:'Current action',nextAction:'Check source records before submitting'
  }],[]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/YOSの提案 · 画面を開いた時点/);
  assert.match(page,/優先タスクの次の一手/);
  assert.match(page,/Check source records before submitting/);
  assert.match(page,/実際の空き時間を確認/);
});

test('calendar denied means do not suggest the time is free', async () => {
  const mock=runtime(false,true,'DAY',true,[{
    title:'Current action',nextAction:'Check source records'
  }]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/まず予定を確認/);
  assert.match(page,/カレンダーが取得できていないため、空き時間を推定しません/);
});

test('all-day calendar event blocks free-time suggestion', async () => {
  const d=new Date();
  const calendar=[{
    title:'Actual registered all-day calendar entry',
    isAllDay:true,
    startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()),
    endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)
  }];
  const mock=runtime(false,false,'DAY',true,[{
    title:'Current task',nextAction:'Work on new task'
  }],calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/終日予定を確認/);
  assert.match(page,/終日予定が登録されています/);
  assert.doesNotMatch(page,/実際の空き時間を確認して着手する候補/);
});

test('old upstream task timestamp keeps tasks visible but prohibits confident action suggestions', async () => {
  const lastMonth=new Date(Date.now()-40*24*3600000).toISOString();
  const mock=runtime(false,false,'DAY',true,[{
    title:'Old task',nextAction:'Perform stale task'
  }],[],lastMonth);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/タスク未確認/);
  assert.match(page,/タスクの最新状態を確認/);
  assert.match(page,/YOS Tasksの鮮度は未確認/);
  assert.doesNotMatch(page,/着手する候補：Perform stale task/);
});

test('missing upstream timestamp is never silently treated as fresh', async () => {
  const mock=runtime(false,false,'DAY',true,[{
    title:'Undated feed task',nextAction:'Do it now'
  }],[],null);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  assert.match(mock.snapshot().html,/タスク未確認/);
});

test('a nearby scheduled start calls for preparation instead of task planning', async () => {
  const fixed = new Date(2026,10,1,10,0).toISOString();
  const calendar=[{
    title:'A timed appointment',isAllDay:false,
    startDate:new Date(2026,10,1,10,20),endDate:new Date(2026,10,1,11,0)
  }];
  const mock=runtime(false,false,'DAY',true,[{title:'Current task',nextAction:'Focus task'}],
    calendar,fixed,fixed);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/次の予定の準備を優先/);
  assert.match(page,/次の予定まで約20分/);
  assert.match(page,/移動・準備時間は未計算です/);
  assert.doesNotMatch(page,/実際の空き時間を確認して着手する候補/);
});

test('an ongoing appointment wins over task suggestion', async () => {
  const fixed = new Date(2026,10,1,10,0).toISOString();
  const calendar=[{
    title:'Already started',isAllDay:false,
    startDate:new Date(2026,10,1,9,30),endDate:new Date(2026,10,1,10,30)
  }];
  const mock=runtime(false,false,'DAY',true,[{title:'Current task',nextAction:'Focus task'}],
    calendar,fixed,fixed);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  assert.match(mock.snapshot().html,/登録済みの予定を優先/);
});

test('longer gap only suggests a task candidate and discloses that duration is unknown', async () => {
  const fixed = new Date(2026,10,1,10,0).toISOString();
  const calendar=[{
    title:'Later appointment',isAllDay:false,
    startDate:new Date(2026,10,1,13,0),endDate:new Date(2026,10,1,14,0)
  }];
  const mock=runtime(false,false,'DAY',true,[{title:'Current task',nextAction:'Check own work'}],
    calendar,fixed,fixed);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/優先タスクの次の一手/);
  assert.match(page,/次の登録予定まで約3時間/);
  assert.match(page,/所要時間は未確認/);
});

test('many taxi-demand references never crowd out the one real calendar item', async () => {
  const d=new Date();
  const refs=Array.from({length:18},(_,i)=>({
    title:'［タクシー需要］ Reference '+i,isAllDay:true,
    startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()),
    endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)
  }));
  const calendar=refs.concat([{
    title:'Actual event remains',isAllDay:true,
    startDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()),
    endDate:new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)
  }]);
  const mock=runtime(false,false,'DAY',false,null,calendar);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/Actual event remains/);
  assert.match(page,/登録された予定 1件/);
});

test('task action URL is visible only on deliberate tap and HTML-safe', async () => {
  const mock=runtime(false,false,'DAY',true,[{
    title:'Task with action URL',
    actionUrl:'https://example.com/do?a=1&b=2',
    nextAction:'Open details'
  }],[]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const page=mock.snapshot().html;
  assert.match(page,/href="https:\/\/example.com\/do\?a=1&amp;b=2">操作先を開く<\/a>/);
  assert.doesNotMatch(page,/window\.location\s*=|location\.href\s*=/);
});

test('a tap that can launch iPhone automation is explicitly labelled', async () => {
  const mock=runtime(false,false,'DAY',true,[
    {title:'Shortcut action',actionUrl:'shortcuts://run-shortcut?name=MyTest'}
  ],[]);
  await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
  const html=mock.snapshot().html;
  assert.match(html,/href="shortcuts:\/\/run-shortcut\?name=MyTest">ショートカットを起動<\/a>/);
  assert.doesNotMatch(html,/javascript:/);
});

test('unsafe scheme and HTML-breaking action URL are not rendered', async () => {
  const bad=['javascript:alert(1)','https://site.example/"><script>evil</script>'];
  for(const raw of bad){
    const mock=runtime(false,false,'DAY',true,[{title:'Unsafe URL',actionUrl:raw}],[]);
    await new Function(...Object.keys(mock.globals),'return '+body)(...Object.values(mock.globals));
    const page=mock.snapshot().html;
    assert.doesNotMatch(page,/class="tasklink"/);
    assert.doesNotMatch(page,/<script>evil<\/script>/);
  }
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
  assert.match(source,/読み取り専用。/);
  assert.match(source,/健康：/);
  assert.doesNotMatch(source,/CalendarEvent\.create|Reminder\.create|\.writeString\(/);
});
