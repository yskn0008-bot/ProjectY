import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

// The actual cooked Scriptable HTML, with a mocked native-device boundary.
// No hardware, credentials, or external network requests.
const src=fs.readFileSync(new URL('../scriptable/remote-widgets/quick-media/YOS Remote Hub Quick TEST.js',import.meta.url),'utf8');
const end=src.indexOf('</script></body></html>'+String.fromCharCode(96))+'</script></body></html>'.length+1;
assert.ok(end>10000);
const html=new Function(src.slice(0,end)+'\nreturn html;')();
assert.ok(!html.includes('\u0000'));
// WKWebView cancels native bridge navigations synchronously in shouldAllowRequest.
// HTTP 204 is not equivalent to that behavior in standalone WebKit.
// Substitute only the native transport before the real startup code runs.
const boundary='bindLightHoldButtons();renderTV();renderTVStudio();try{applyRemoteAppearance()}catch(_){}requestMode();';
assert.equal(html.split(boundary).length,2);
const browserHTML=html.replace(boundary,'window.sent=[];nativeAction=(device,action,label,slot="")=>window.sent.push({device,action,label,slot});'+boundary);
const origin='https://yos-remote.local/';
for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.href===origin)return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:browserHTML});
   if(url.origin==='https://yos-remote.local'&&url.pathname==='/__action')return route.fulfill({status:204,body:''});
   return route.abort();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.deepEqual(errors,[],'startup JavaScript errors');
  assert.equal(await page.locator('#tvGrid button').count(),12,'startup renders all keys');
  assert.ok(await page.evaluate(()=>window.sent.some(x=>x.device==='picture'&&x.action==='probe')),'startup probes via native bridge');
  await page.evaluate(()=>{
   window.sent=[];
   nativeAction=(device,action,label,slot='')=>window.sent.push({device,action,label,slot});
   nativeResult({ok:true,picture:{entries:[
    {target:'pictureMode',available:true,state:'ready',value:'standard',options:['standard','cinema'],min:null,max:null,step:null},
    {target:'brightness',available:true,state:'ready',value:'50',options:[],min:0,max:100,step:1},
    {target:'contrast',available:true,state:'ready',value:'100',options:[],min:0,max:100,step:1},
    {target:'color',available:false,state:'failed',value:'',options:[],min:null,max:null,step:null}
   ],saved:{day:false,night:false,movie:false},message:'test'}});
   nativeResult({ok:true,apps:['YouTube','Netflix','Prime Video','U-NEXT','Spotify'].map((title,index)=>({title,index}))});
  });
  assert.equal(await page.locator('#modeBadge').textContent(),'カーソル');
  assert.equal(await page.locator('#tvGrid button').count(),12);
  for(const tab of ['light','ac','floor','tv']){
   await page.locator('[data-tab="'+tab+'"]').click();
   assert.equal(await page.locator('.remote-panel.active').getAttribute('data-panel'),tab);
  }
  const slider=page.locator('#tvBrightness');
  assert.equal(await slider.isEnabled(),true);
  await slider.scrollIntoViewIfNeeded();
  const rect=await slider.boundingBox();
  assert.ok(rect.height>=44,'slider target must be at least 44 CSS px');
  await page.evaluate(()=>window.sent.length=0);
  // A real pointer drag must only preview until release.
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.72,rect.y+rect.height/2,{steps:6});
  assert.equal(await page.evaluate(()=>window.sent.filter(x=>x.device==='picture'&&x.action==='set').length),0);
  const preview=await page.locator('#tvBrightnessVal').textContent();
  assert.notEqual(preview,'50');
  await page.mouse.up();
  const commands=await page.evaluate(()=>window.sent.filter(x=>x.device==='picture'&&x.action==='set'));
  assert.equal(commands.length,1);
  assert.equal(JSON.parse(commands[0].slot).target,'brightness');
  assert.equal(JSON.parse(commands[0].slot).value,preview);
  await page.locator('#tvAppScroll').scrollIntoViewIfNeeded();
  const appMetrics=await page.locator('#tvAppScroll').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,height:e.querySelector('button').getBoundingClientRect().height}));
  assert.ok(appMetrics.scroll>appMetrics.width&&appMetrics.height>=44);
  await page.evaluate(()=>openPictureEditor());
  assert.ok((await page.locator('#pictureGroups').textContent()).includes('テレビで設定'));
  await page.evaluate(()=>window.sent.length=0);
  await page.locator('#discoverPictureButton').click();
  assert.equal(await page.locator('#discoverPictureButton').isDisabled(),true);
  assert.match(await page.locator('#discoverPictureStatus').textContent(),/問い合わせ中/);
  assert.equal(await page.evaluate(()=>window.sent.filter(x=>x.device==='picture'&&x.action==='discover').length),1);
  await page.evaluate(()=>nativeResult({ok:true,picture:{discovery:true,message:'v1.1：API拒否（12）'}}));
  assert.equal(await page.locator('#discoverPictureButton').isEnabled(),true);
  assert.match(await page.locator('#discoverPictureStatus').textContent(),/API拒否/);
  assert.equal(await page.locator('#tvBrightness').isEnabled(),true);
  await page.evaluate(()=>closePictureEditor());
  // Verify saved-mode editing uses the existing native action boundary and does not apply settings.
  await page.evaluate(()=>openShortcuts());
  await page.locator('#picturePresets .pic-preset').first().getByText('編集',{exact:true}).click();
  await page.locator('#presetName').fill('昼シネマ');
  await page.locator('[data-preset-value="pictureMode"]').selectOption('cinema');
  await page.evaluate(()=>window.sent.length=0);
  await page.locator('#presetEditor').getByText('登録',{exact:true}).click();
  const edits=await page.evaluate(()=>window.sent.filter(x=>x.device==='picture'&&x.action==='edit'));
  assert.equal(edits.length,1);assert.deepEqual(JSON.parse(edits[0].slot),{key:'day',name:'昼シネマ',settings:[{target:'pictureMode',value:'cinema'}]});
  assert.equal(await page.evaluate(()=>window.sent.some(x=>x.action==='set'||x.action==='load')),false);
  await page.evaluate(()=>closeShortcuts());
  await page.evaluate(()=>openLayoutEditor());
  await page.locator('#remoteSize').selectOption('compact');
  await page.locator('#presetPosition').selectOption('above');
  assert.equal(await page.locator('#tvGrid').getAttribute('data-size'),'compact');
  assert.equal(await page.evaluate(()=>document.getElementById('presetHome').nextElementSibling.id),'tvGrid');
  await page.locator('#presetPosition').selectOption('below');
  await page.evaluate(()=>closeLayoutEditor());
  assert.equal(await page.locator('#tvGrid button').count(),12);
  assert.deepEqual(errors,[]);
  console.log(name+' actual cooked HTML / 12 keys / 4 panels / drag commit once / apps / error PASS');
  await context.close();
 }finally{await browser.close();}
}
