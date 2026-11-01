import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../YOS_Inbox_Classifier.js',import.meta.url),'utf8');
function setup(initialBlocks=[],mode='run'){
  let blocks=initialBlocks,rows=[],calls=[],serial=0,fail=null,output=null;
  class Request{
    constructor(url){this.url=url;this.method='GET';this.response={statusCode:200};}
    async loadJSON(){
      const path=this.url.replace('https://api.notion.com/v1','');calls.push([this.method,path]);
      if(fail&&path.includes(fail)){this.response.statusCode=503;return {message:'temporary'};}
      if(path.startsWith('/blocks/')){
        const cursor=new URL(this.url).searchParams.get('start_cursor');
        const start=cursor?Number(cursor):0;
        return {results:blocks.slice(start,start+100),has_more:start+100<blocks.length,next_cursor:start+100<blocks.length?String(start+100):null};
      }
      if(path.startsWith('/data_sources/')&&path.endsWith('/query')){
        const ds=path.split('/')[2],f=JSON.parse(this.body).filter;
        const found=rows.filter(r=>r.ds===ds).filter(r=>{
          const prop=r.properties[f.property];
          if(f.date)return prop?.date?.start===f.date.equals;
          const val=(prop?.title||prop?.rich_text||[]).map(x=>x.text?.content||x.plain_text||'').join('');
          return f.title?val===f.title.equals:f.rich_text?.equals!==undefined?val===f.rich_text.equals:val.includes(f.rich_text.contains);
        });return {results:found.slice(0,2),has_more:found.length>2};
      }
      if(path==='/pages'&&this.method==='POST'){
        const b=JSON.parse(this.body),row={id:'row-'+(++serial),ds:b.parent.data_source_id,properties:b.properties};rows.push(row);return {id:row.id};
      }
      if(path.startsWith('/pages/'))return rows.find(r=>r.id===path.split('/').at(-1))||{};
      throw Error('Unexpected '+path);
    }
  }
  let state='';
  const ctx={Request,Keychain:{contains:()=>true,get:()=> 'test'},FileManager:{local:()=>({documentsDirectory:()=>'/tmp',joinPath:()=>'/tmp/state',readString:()=>state,writeString:(_,s)=>{state=s;}})},args:{queryParameters:{mode}},Alert:class{addAction(){} async present(){output=this.title+' '+this.message;}},Script:{complete(){}},Date,Intl,Array,Set,Math,JSON,Error,Number,String,encodeURIComponent};
  vm.createContext(ctx);
  const usable=source.replace(/try\{await inboxSync\(\)\}[\s\S]*$/,'globalThis.__test={captureFromBlocks,classifyCapture,saveCapture,inboxSync,allInboxBlocks};');
  vm.runInContext(usable,ctx);
  return {api:ctx.__test,rows,calls,setFailure:x=>fail=x,setBlocks:x=>blocks=x,getOutput:()=>output};
}
function para(text,id){return {id,type:'paragraph',paragraph:{rich_text:[{text:{content:text}}]}};}
function capture(id,text,source='Memo',date='2026-11-01T01:00:00.000Z'){
  return [para(`${date} · ${source} · clarity:${id}`,'meta-'+id),para(text,'raw-'+id),{id:'divider-'+id,type:'divider',divider:{}}];
}

test('explicit user captures route once; repeat and source notifications do not create rows',async()=>{
  const blocks=[...capture('task1','タスク: 郵便を受け取る'),...capture('shop1','ラグを欲しいものに追加して'),...capture('diary1','日記に今日は散歩したを記録して'),...capture('notification1','タスク: 送金する','Clarity Notification')];
  const s=setup(blocks);
  await s.api.inboxSync();
  assert.equal(s.rows.length,3);assert.deepEqual(s.rows.map(r=>r.ds),['965c6086-32c1-463d-93b4-87a9cb69b3ad','d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc','fe0e0973-d1cc-4bde-b138-1cb1da64ac68']);
  assert.match(s.getOutput(),/登録 3件/);
  await s.api.inboxSync();assert.equal(s.rows.length,3);assert.match(s.getOutput(),/登録 0件/);
  assert.equal(s.calls.filter(([method,path])=>method==='POST'&&path==='/pages').length,3);
});

test('consultation, money, share, date ambiguity and life log remain raw only',async()=>{
  const cases=[...capture('q','ラグを買っていい？'),...capture('money','PayPay残高1405円を登録して'),...capture('share','タスク: 送金する','Clarity Share'),...capture('date','タスク: 明日9時に電話する'),...capture('life','生活記録に散歩を保存して'),...capture('hypo','もしタスク: 買い物')];
  const s=setup(cases);await s.api.inboxSync();assert.equal(s.rows.length,0);assert.match(s.getOutput(),/保留 6件/);
});

test('pagination, legacy duplicate and write failure keep original and stop safely',async()=>{
  const padding=Array.from({length:101},(_,i)=>para('unrelated '+i,'pad'+i));
  const s=setup([...padding,...capture('x','タスク: 電話する')]);
  await s.api.inboxSync();assert.equal(s.rows.length,1);assert.ok(s.calls.some(([,p])=>p.includes('start_cursor=100')));
  s.setBlocks([...padding,...capture('x','タスク: 電話する'),...capture('y','タスク: 待つ')]);
  s.setFailure('/pages');await s.api.inboxSync();assert.equal(s.rows.length,1);assert.match(s.getOutput(),/保留あり/);
  s.setFailure(null);await s.api.inboxSync();assert.equal(s.rows.length,2);
  s.setBlocks([...capture('z','タスク: 電話する')]);await s.api.inboxSync();assert.equal(s.rows.length,2);assert.match(s.getOutput(),/同名の既存項目/);
});

test('unbounded or malformed Inbox pagination cannot authorize a write',async()=>{
  const s=setup([]);const c={id:'a',raw:'タスク: 散歩',at:'invalid',source:'Memo'};
  assert.equal(s.api.classifyCapture(c).status,'hold');
  assert.equal(s.api.captureFromBlocks([para('2026-11-01T00:00:00Z · Memo · clarity:a','m')]).length,0);
});

test('device acceptance defaults to the one approved fixture, never historical backlog',async()=>{
  const blocks=[...capture('older','タスク: 以前の入力'),...capture('yos-test-20261101-0649','タスク: YOS Inbox仕分けテスト（動作確認後に完了）')];
  const s=setup(blocks,'test');await s.api.inboxSync();assert.equal(s.rows.length,1);
  assert.equal(s.rows[0].properties['やること'].title[0].text.content,'YOS Inbox仕分けテスト(動作確認後に完了)');
  await s.api.inboxSync();assert.equal(s.rows.length,1);
  const missing=setup(capture('older','タスク: 以前の入力'),'test');
  await assert.rejects(missing.api.inboxSync(),/安全なテスト入力をInboxで確認できません/);
  assert.equal(missing.rows.length,0);
});
