import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../YOS Journal Book.js',import.meta.url),'utf8');
async function run({review='修正後の物語',choice=0,readbackFails=false,story='元の物語',diary}={}){
 const calls=[],state={html:''};
 const input={date:'2026-11-13',story,diary:diary??'【今日の物語】\n'+story+'\n【本人の回答】\n変更しない回答',question:'今日の問い',answer:'本人の答え'};
 const query=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,k==='date'?v:Buffer.from(v).toString('base64')]));
 class WebView{
  async loadHTML(html){state.html=html}
  async present(){}
  async evaluateJavaScript(){if(readbackFails)throw Error('webview unavailable');return review}
 }
 class Alert{addAction(){}addCancelAction(){}async presentAlert(){return choice}}
 const Data={fromBase64String:v=>({toRawString:()=>Buffer.from(v,'base64').toString()}),fromString:v=>({toBase64String:()=>Buffer.from(v).toString('base64')})};
 try{await vm.runInNewContext('(async()=>{'+source+'})()',{
  args:{queryParameters:query},Data,WebView,Alert,Safari:{open:url=>calls.push(url)},Script:{complete(){}}
 });return {calls,state}}catch(error){return {calls,state,error}}
}

test('edited story is the exact version sent to the existing Notion bridge; original answers stay unchanged',async()=>{
 const r=await run();assert.equal(r.error,undefined);assert.equal(r.calls.length,1);
 const url=new URL(r.calls[0]);
 assert.equal(url.searchParams.get('scriptName'),'YOS Journal Notion Bridge');
 const diary=Buffer.from(url.searchParams.get('diary'),'base64').toString();
 assert.equal(diary,'【今日の物語】\n修正後の物語\n【本人の回答】\n変更しない回答');
 assert.equal(Buffer.from(url.searchParams.get('answer'),'base64').toString(),'本人の答え');
});

test('cancel, empty review and failed readback never send a save request',async()=>{
 for(const options of [{choice:-1},{review:''},{readbackFails:true},{diary:'対応する物語が含まれていない入力'}]){
  const r=await run(options);assert.equal(r.calls.length,0);
 }
});

test('story text cannot break the generated WebView script or execute markup',async()=>{
 const text='</script><script>throw Error("injected")</script>';
 const r=await run({story:text,review:text,choice:-1});
 const script=r.state.html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);new vm.Script(script);
 assert.equal((r.state.html.match(/<script>/g)||[]).length,1);
 assert.ok(r.state.html.includes('storyReview'));
 assert.doesNotMatch(r.state.html,/api\.notion\.com|Bearer |ntn_/);
});

test('Scriptable distribution copy uses the same book implementation',()=>{
 const shipped=fs.readFileSync(new URL('../../../ios-app/scriptable/YOS Journal Book.js',import.meta.url),'utf8');
 assert.ok(shipped.endsWith(source));
});
