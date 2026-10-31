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
async function capture(id,target,raw,dateTime='',amount='',kind=''){
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
        const field=filter.property, rule=filter.rich_text;
        const matches=pages.filter(p=>p.target===dsId).filter(p=>{
          const value=propText(p.properties[field]);
          return rule.equals!==undefined?value===rule.equals:value.includes(rule.contains);
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
  const payload=new URLSearchParams({request_id:id,target,title:'テスト '+target,raw,date_time:dateTime,amount,kind}).toString();
  const context={args:{plainTexts:[payload]},Keychain:{contains:()=>true,get:()=> 'simulated-token'},Request,FileManager:{local:()=>fm},Script:{setShortcutOutput:v=>{output=v;},complete:()=>{}},Date,Number,String,JSON,Math,Error,decodeURIComponent,encodeURIComponent};
  await vm.runInNewContext('(async()=>{'+script+'})()',context);
  return output;
}
function targetCount(target){return pages.filter(p=>p.target===target).length;}
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

  const beforeDate=inboxBlocks.length;
  assert.equal(await capture('task-006','task','時刻違いタスク','2026-11-01T09:00:00+09:00'),'OK:task');
  assert.equal(await capture('task-007','task','時刻違いタスク','2026-11-01T10:00:00+09:00'),'OK:task');
  assert.equal(inboxBlocks.length,beforeDate+2,'different due times are different captures');
  assert.equal(targetCount('task'),5);

  for(const target of ['shopping','project','life_event','person','learning','money','balance']){
    const amount=['money','balance'].includes(target)?'682':'';
    const raw='一度だけ保存する '+target;
    assert.equal(await capture(target+'-a',target,raw,'',amount), 'OK:'+target);
    local='';
    assert.equal(await capture(target+'-b',target,raw,'',amount), 'DUPLICATE:'+target);
    assert.equal(targetCount(target),1,'destination must be idempotent for '+target);
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
  console.log('Inbox-first, target idempotency, readback retry, distinct-due-time, and long-raw simulation: PASS');
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
