"""Runtime regression for the existing Clarity Notion inline Scriptable bridge.

Runs a simulated Scriptable/Notion environment. No live records are written.
"""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import shutil
import subprocess
import unittest

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "patch_notion_inline_bridge.py"
spec = spec_from_file_location("notion_bridge_patch_under_test", SCRIPT_PATH)
module = module_from_spec(spec)
spec.loader.exec_module(module)

NODE_TEST = r"""
const assert = require('node:assert/strict');
const vm = require('node:vm');
const script = process.argv[1];
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const DS={
  task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',
  shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',
  project:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',
  life_event:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',
  person:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',
  learning:'28bcd894-b709-4b23-9fdc-c9dc43043bfc',
  money:'95b30d16-7530-40c6-a320-dab99acad55d',
  balance:'94fc7e9f-fd20-4073-bbcf-02efe8e95c5c'
};
const KEY_FIELD={task:'同期キー',shopping:'メモ',project:'同期キー',life_event:'記録キー',person:'元データ・根拠',learning:'根拠・参照',money:'原本ID',balance:'原本'};
let pages=[], inboxBlocks=[], local='', serial=0, events=[], failReadback=false;
function propText(property){return (property?.rich_text||property?.title||[]).map(v=>v.plain_text||v.text?.content||'').join('');}
function blockText(block){return (block.paragraph?.rich_text||[]).map(v=>v.plain_text||v.text?.content||'').join('');}
async function capture(id,target,raw,dateTime='',amount='',kind='',transport='plainTexts'){
  let output;
  const fm={
    documentsDirectory:()=>'/tmp',
    joinPath:(p,n)=>p+'/'+n,
    fileExists:()=>Boolean(local),
    readString:()=>local,
    writeString:(p,v)=>{local=v;}
  };
  class Request{
    constructor(url){this.url=url;this.method='GET';this.response={statusCode:200};}
    async loadJSON(){
      if(this.url.includes('/blocks/'+INBOX+'/children')){
        if(this.method==='PATCH'){
          const body=JSON.parse(this.body);
          inboxBlocks.push(...body.children);
          events.push('inbox_append');
          return {};
        }
        return {results:inboxBlocks,has_more:false,next_cursor:null};
      }
      const dsId=Object.keys(DS).find(k=>this.url.endsWith('/data_sources/'+DS[k]+'/query'));
      if(dsId){
        const filter=JSON.parse(this.body).filter;
        const matches=pages.filter(p=>p.target===dsId).filter(p=>{
          const check=f=>{
            if(f.and)return f.and.every(check);
            const field=f.property, rule=f.rich_text||f.title||f.date;
            if(f.date){const value=p.properties[field]?.date?.start||'';return value===f.date.equals;}
            const value=propText(p.properties[field]);
            return rule.equals!==undefined?value===rule.equals:value.includes(rule.contains);
          };
          return check(filter);
        });
        return {results:matches.slice(0,2).map(p=>({id:p.id}))};
      }
      if(this.url.endsWith('/pages')&&this.method==='POST'){
        const body=JSON.parse(this.body);
        const target=Object.keys(DS).find(k=>DS[k]===body.parent.data_source_id);
        const page={id:'page-'+(++serial),target,properties:body.properties};
        pages.push(page);
        events.push('destination_create:'+target);
        return {id:page.id};
      }
      if(this.url.includes('/pages/')){
        const id=this.url.split('/').at(-1),page=pages.find(p=>p.id===id);
        if(!page){this.response.statusCode=404;return {error:'not found'};}
        if(failReadback)return {properties:{}};
        return {properties:page.properties};
      }
      throw new Error('Unexpected Notion request '+this.method+' '+this.url);
    }
  }
  const payload=new URLSearchParams({request_id:id,target,title:raw.slice(0,70),raw,date_time:dateTime,amount,kind}).toString();
  const voiceInput={notionPending:true,notionTarget:target,notionTitle:raw.slice(0,70),notionRaw:raw,notionDateTime:dateTime,notionAmount:amount,notionKind:kind};
  const inactiveVoiceInput={...voiceInput,notionPending:false};
  const plannerInput={actions:[{id,executor:'notion',module:'NEXT_NOTION',operation:'save',parameters:{target,title:raw.slice(0,70),raw_text:raw,date_time:dateTime,amount,kind},risk:'low',status:'planned',needs_review:false,needs_confirmation:false}]};
  const nonNotionPlan={actions:[{id,executor:'device',module:'NEXT_DEVICE',operation:'set_wifi',parameters:{state:'off'},risk:'low',status:'planned',needs_review:false,needs_confirmation:false}]};
  const reviewPlan={actions:[{id,executor:'notion',module:'NEXT_NOTION',operation:'save',parameters:{target,title:raw.slice(0,70),raw_text:raw,date_time:dateTime,amount,kind},risk:'low',status:'planned',needs_review:true,needs_confirmation:false}]};
  const shortcutParameter=transport==='shortcutParameter'?payload:transport==='shortcutDictionary'?voiceInput:transport==='inactiveShortcutDictionary'?inactiveVoiceInput:transport==='planner'?plannerInput:transport==='plannerNoNotion'?nonNotionPlan:transport==='plannerNeedsReview'?reviewPlan:undefined;
  const context={args:{plainTexts:transport==='plainTexts'?[payload]:[],shortcutParameter},Keychain:{contains:()=>true,get:()=> 'simulated-token'},Request,FileManager:{local:()=>fm},Script:{setShortcutOutput:v=>{output=v;},complete:()=>{}},Date,Number,String,JSON,Math,Error,decodeURIComponent,encodeURIComponent};
  await vm.runInNewContext('(async()=>{'+script+'})()',context);
  return output;
}
function targetCount(target){return pages.filter(p=>p.target===target).length;}
function seedLegacy(target,title,dateTime=''){const titleField={task:'やること',shopping:'商品名',project:'案件名',life_event:'イベント名',person:'人物・イベント',learning:'判断・経験',money:'項目',balance:'口座・資産'}[target];const properties={[titleField]:{title:[{plain_text:title}]}};const dateField={task:'期限',money:'日付',balance:'確認日'}[target];if(dateField&&dateTime)properties[dateField]={date:{start:dateTime}};pages.push({id:'legacy-'+(++serial),target,properties});}
function allInboxText(){return inboxBlocks.map(blockText).join('\n');}
(async()=>{
  assert.equal(await capture('task-001','task','テストタスクを登録'),'OK:task');
  assert.equal(inboxBlocks.length,1,'raw input must enter the existing Inbox');
  assert.ok(events.indexOf('inbox_append')<events.indexOf('destination_create:task'),'Inbox must be written before the long-term target');
  assert.equal(targetCount('task'),1);
  local='';
  assert.equal(await capture('task-002','task','テストタスクを登録'),'DUPLICATE:task');
  assert.equal(inboxBlocks.length,1,'retry with a fresh request id must not duplicate the Inbox capture');
  assert.equal(targetCount('task'),1,'retry must not duplicate the task');
  assert.equal(await capture('task-003','task','別のタスクを登録'),'OK:task');
  assert.equal(inboxBlocks.length,2);
  assert.equal(targetCount('task'),2);

  failReadback=true;
  await assert.rejects(capture('task-004','task','読み戻し失敗後に再試行する'),/Notion destination readback did not match capture key/);
  failReadback=false;
  local='';
  assert.equal(await capture('task-005','task','読み戻し失敗後に再試行する'),'DUPLICATE:task');
  assert.equal(inboxBlocks.length,3,'failed readback and retry must keep one Inbox capture');
  assert.equal(targetCount('task'),3,'failed readback and retry must keep one task');

  seedLegacy('task','旧タスク','2026-11-01T09:00:00+09:00');
  await assert.rejects(capture('legacy-task-001','task','旧タスク','2026-11-01T09:00:00+09:00'),/same title/);
  assert.equal(targetCount('task'),4,'an unkeyed legacy task with the same title and due time must not be duplicated');
  assert.equal(await capture('legacy-task-002','task','旧タスク','2026-11-01T10:00:00+09:00'),'OK:task');
  assert.equal(targetCount('task'),5,'the same task title at a different due time remains a separate task');
  seedLegacy('shopping','旧商品');
  await assert.rejects(capture('legacy-shopping-001','shopping','旧商品'),/same title/);
  assert.equal(targetCount('shopping'),1,'an unkeyed legacy shopping item must not be duplicated');

  const beforeDate=inboxBlocks.length;
  assert.equal(await capture('task-006','task','時刻違いタスク','2026-11-01T09:00:00+09:00'),'OK:task');
  assert.equal(await capture('task-007','task','時刻違いタスク','2026-11-01T10:00:00+09:00'),'OK:task');
  assert.equal(inboxBlocks.length,beforeDate+2,'different due times are different captures');
  assert.equal(targetCount('task'),7);

  assert.equal(await capture('voice-bridge-001','task','Voice経由のテスト保存','2026-11-02T09:00:00+09:00','','','shortcutParameter'),'OK:task');
  assert.equal(await capture('voice-bridge-002','task','Voice経由のテスト保存','2026-11-02T09:00:00+09:00'),'DUPLICATE:task');
  assert.equal(targetCount('task'),8,'Scriptable Shortcut Input entry must share the same dedupe path');
  assert.equal(await capture('voice-dictionary-001','task','Clarity.Voice辞書入力','2026-11-02T10:00:00+09:00','','','shortcutDictionary'),'OK:task');
  assert.equal(await capture('voice-dictionary-002','task','Clarity.Voice辞書入力','2026-11-02T10:00:00+09:00'),'DUPLICATE:task');
  assert.equal(targetCount('task'),9,'Clarity.Voice notion* dictionary fields must normalize into the shared route');
  const beforeInactive={inbox:inboxBlocks.length,tasks:targetCount('task')};
  assert.equal(await capture('voice-dictionary-inactive','task','無効化されたNotion項目','','','','inactiveShortcutDictionary'),'SKIP:no_notion_save');
  assert.deepEqual({inbox:inboxBlocks.length,tasks:targetCount('task')},beforeInactive,'notionPending=false must not write to Inbox or Tasks');
  assert.equal(await capture('voice-planner-001','task','GPTプランからのClarity.Voice保存','2026-11-03T11:00:00+09:00','','','planner'),'OK:task');
  assert.equal(await capture('voice-planner-002','task','GPTプランからのClarity.Voice保存','2026-11-03T11:00:00+09:00'),'DUPLICATE:task');
  assert.equal(await capture('voice-planner-003','task','次の別の指示を保存','2026-11-03T11:00:00+09:00','','','planner'),'OK:task');
  assert.equal(await capture('voice-planner-skip','task','Notion保存なしの端末操作','','','','plannerNoNotion'),'SKIP:no_notion_save');
  assert.equal(await capture('voice-planner-review','task','確認が必要なNotion保存','','','','plannerNeedsReview'),'SKIP:no_notion_save');
  assert.equal(targetCount('task'),11,'only planned, safe, single Notion save actions may route; repeated planner IDs must not collide');

  for(const target of ['shopping','project','life_event','person','learning','money','balance']){
    const amount=['money','balance'].includes(target)?'682':'';
    const raw='一度だけ保存する '+target;
    assert.equal(await capture(target+'-a',target,raw,'',amount), 'OK:'+target);
    local='';
    assert.equal(await capture(target+'-b',target,raw,'',amount), 'DUPLICATE:'+target);
    assert.equal(targetCount(target),target==='shopping'?2:1,'destination must be idempotent for '+target);
  }

  const inboxBefore=inboxBlocks.length;
  assert.equal(await capture('inbox-a','inbox','曖昧なのでInboxに保留'),'OK:inbox');
  local='';
  assert.equal(await capture('inbox-b','inbox','曖昧なのでInboxに保留'),'DUPLICATE:inbox');
  assert.equal(inboxBlocks.length,inboxBefore+1);

  const longRaw='長文'.repeat(2500);
  assert.equal(await capture('long-a','task',longRaw),'OK:task');
  assert.ok(allInboxText().includes(longRaw),'Inbox must preserve raw text longer than one Notion text object');
  assert.ok(inboxBlocks.at(-1).paragraph.rich_text.every(x=>x.text.content.length<=2000));
  console.log('Inbox-first, target idempotency, readback retry, legacy duplicate guards, Shortcut Input query/dictionary/planner bridges, safe skip, distinct-due-time, and long-raw simulation: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
"""

class NotionBridgeRuntimeTests(unittest.TestCase):
    def test_raw_first_idempotency_and_readback(self):
        if not shutil.which("node"):
            self.skipTest("Node.js is not installed in this environment")
        result=subprocess.run(
            ["node","-e",NODE_TEST,module.BRIDGE_SCRIPT],
            capture_output=True,text=True,timeout=25,check=False
        )
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS",result.stdout)

if __name__=="__main__":
    unittest.main()
