import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script=readFileSync(new URL('../scriptable/YOS JOURNAL.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

const feed=(extra={})=>({
  date:'2001年1月2日',
  issuedOn:'2001-01-02',
  headline:'確かな根拠を、次の選択に。',
  lead:'当人に関係する記事だけを選ぶ。',
  articles:[{
    category:'WORK / DECISIONS',
    title:'今必要な条件を確認する',
    summary:'公式資料を確認し、対象と日付を区別する。',
    reason:'現在の判断に必要な条件を照合するため。',
    action:'公式の原文と条件を確認する',
    caveat:'本人の実際の状況は未確認',
    source:'Original source',
    sourceDate:'',
    link:'https://example.org/story',
    image:'',
    imageCaption:'',
    imageKind:'',
    keyPoints:['確認できる事実']
  }],
  ...extra
});

async function show(issue,{offline=false,cache=null,shortcutParameter=null}={}){
  const files=new Map();
  if(cache){files.set('/local/YOS-JOURNAL',true);files.set('/local/YOS-JOURNAL/latest.json',JSON.stringify(cache))}
  const manager={
    documentsDirectory:()=>'/local',
    joinPath:(a,b)=>a+'/'+b,
    fileExists:p=>files.has(p),
    createDirectory:p=>files.set(p,true),
    readString:p=>files.get(p),
    writeString:(p,v)=>files.set(p,v)
  };
  const FileManager={local:()=>manager};
  class Request{
    constructor(){this.response=null}
    async loadString(){
      if(offline)throw Error('offline');
      this.response={statusCode:200};
      return JSON.stringify(issue);
    }
  }
  let html='';
  class WebView{
    async loadHTML(value){html=value}
    async present(){}
  }
  await new AsyncFunction('FileManager','Request','WebView','Script','args',script)(
    FileManager,Request,WebView,{complete(){}},{shortcutParameter}
  );
  return {html,files};
}

test('editorial cover identifies old issue before the articles and links to verified story anchors',async()=>{
  const {html}=await show(feed());
  assert.match(script,/YOS JOURNAL v1\.6/);
  assert.match(html,/edition-state past/);
  assert.match(html,/保存済みの過去号/);
  assert.match(html,/発行日：2001-01-02/);
  assert.match(html,/IN THIS ISSUE/);
  assert.match(html,/href="#story-1"/);
  assert.match(html,/id="story-1"/);
  assert.match(html,/掲載・更新日：未確認/);
  assert.doesNotMatch(html,/<span class="edition-state ">本日号/);
});

test('new issue is labeled today; no invented stale warning',async()=>{
  const issuedOn=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  const {html}=await show(feed({issuedOn}));
  assert.match(html,/本日号/);
  assert.doesNotMatch(html,/保存済みの過去号/);
});

test('offline displays cache with explicit failure and old-issue warning',async()=>{
  const {html}=await show(null,{offline:true,cache:feed()});
  assert.match(html,/最新版取得不可/);
  assert.match(html,/IN THIS ISSUE/);
  assert.match(html,/保存済みの過去号/);
});

test('unsafe URLs or missing personal rationale are not shown as eligible stories',async()=>{
  const original=feed().articles[0];
  const {html}=await show(feed({articles:[
    {...original,link:'javascript:alert(1)'},
    {...original,reason:''},
    original
  ]}));
  assert.match(html,/1 STORIES/);
  assert.doesNotMatch(html,/javascript:alert/);
  assert.match(html,/WHY IT MATTERS/);
});

test('illustrative photos and optional credits are explicitly labeled and escaped',async()=>{
  const a={...feed().articles[0],
    image:'https://example.org/photo.png',
    imageKind:'illustrative',
    imageCaption:'説明',
    imageCredit:'撮影者 <b>sample</b>'
  };
  const {html}=await show(feed({articles:[a]}));
  assert.match(html,/イメージ写真/);
  assert.match(html,/写真：撮影者 &lt;b&gt;sample&lt;\/b&gt;/);
  assert.doesNotMatch(html,/写真：撮影者 <b>sample<\/b>/);
});

test('invalid feed shows explicit unavailable state without fabricating stories',async()=>{
  const {html}=await show({issuedOn:'2001-01-02',articles:[{title:'missing source'}]});
  assert.match(html,/AWAITING EDITION/);
  assert.match(html,/取得できませんでした/);
  assert.doesNotMatch(html,/href="#story-1"/);
});
