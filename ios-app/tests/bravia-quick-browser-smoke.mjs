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
const boundary='window.location.href="/__action?device="+encodeURIComponent(device)+"&action="+encodeURIComponent(action||"")+"&label="+encodeURIComponent(label||"")+"&slot="+encodeURIComponent(slot||"")+"&n="+nonce';
assert.equal(html.split(boundary).length,2);
const browserHTML=html.replace(boundary,'(window.sent||(window.sent=[])).push({device,action,label,slot})').replace('<script>','<script>window.sent=[];');
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
  assert.equal(await page.evaluate(()=>window.sent.length),0,'startup has no native side effect');
  await page.locator('[data-home-kind="device"][data-home-id="tv"]').click();
  assert.equal(await page.evaluate(()=>window.sent.filter(x=>x.device==='home'&&x.action==='layoutLoad').length),1);
  await page.evaluate(()=>nativeResult({ok:true,home:true,kind:'layoutLoad',record:{raw:null,value:null}}));
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),0);
  await page.locator('#homeLauncherHandle').click();
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),0);
  await page.locator('#homeLauncherHandle').click();
  await page.locator('#homeLayoutOpen').click();
  assert.equal(await page.locator('#homeUnifiedEditor').isVisible(),true);
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),8);
  await page.locator('#homeUnifiedEditor').getByText('取消',{exact:true}).click();
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),0);
  await page.evaluate(()=>{
   window.sent=[];
   nativeResult({ok:true,picture:{entries:[
    {target:'pictureMode',available:true,state:'ready',value:'standard',options:['standard','cinema'],min:null,max:null,step:null},
    {target:'brightness',available:true,state:'ready',value:'50',options:[],min:0,max:100,step:1},
    {target:'contrast',available:true,state:'ready',value:'100',options:[],min:0,max:100,step:1},
    {target:'color',available:false,state:'failed',value:'',options:[],min:null,max:null,step:null}
   ],saved:{day:false,night:false,movie:false},message:'test'}});
   nativeResult({ok:true,apps:['YouTube','Netflix','Prime Video','U-NEXT','Spotify',...Array.from({length:22},(_,i)=>'App '+i)].map((title,index)=>({title,index}))});
  });
  assert.equal(await page.locator('#modeBadge').textContent(),'カーソル');
  assert.equal(await page.locator('#tvGrid button').count(),12);
  for(const tab of ['light','ac','floor']){await page.locator('#homePageSwitch [data-next]').click();assert.equal(await page.locator('.remote-panel.active').getAttribute('data-panel'),tab)}
  for(const tab of ['ac','light','tv']){await page.locator('#homePageSwitch [data-prev]').click();assert.equal(await page.locator('.remote-panel.active').getAttribute('data-panel'),tab)}
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
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),0);
  await page.locator('#homeLauncherHandle').click();
  assert.equal(await page.locator('#tvAppScroll button:visible').count(),27);
  await page.locator('#tvAppScroll').scrollIntoViewIfNeeded();
  const appMetrics=await page.locator('#tvAppScroll').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,height:e.querySelector('button').getBoundingClientRect().height}));
  assert.ok(appMetrics.scroll<=appMetrics.width+1&&appMetrics.height>=44);
  await page.locator('#homeLauncherHandle').click();assert.equal(await page.locator('#tvAppScroll button:visible').count(),0);
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
  assert.equal(await page.evaluate(()=>document.getElementById('presetHome').nextElementSibling.classList.contains('home-fixed-keys')),true);
  await page.locator('#presetPosition').selectOption('below');
  await page.evaluate(()=>closeLayoutEditor());
  assert.equal(await page.locator('#tvGrid button').count(),12);
  // New HOME layout: long press must enter edit without sending a device command.
  await page.evaluate(()=>window.sent.length=0);
  const upper0=page.locator('[data-home-slot="upper:0"]'),upper1=page.locator('[data-home-slot="upper:1"]');
  await upper0.scrollIntoViewIfNeeded();let a=await upper0.boundingBox(),b=await upper1.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.equal(await page.locator('#homeUnifiedEditor').isVisible(),true);
  const duringLongPress=await page.evaluate(()=>window.sent.filter(x=>!['homeStopHolds','tvHoldStop','lightHoldStop','homeRead'].includes(x.device)&&!(x.device==='system'&&['refreshMode','refreshAC'].includes(x.action))));
  assert.deepEqual(duringLongPress,[],'long press must never send a device mutation');
  const first=await upper0.textContent(),second=await upper1.textContent();
  a=await upper0.boundingBox();b=await upper1.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
  assert.equal(await upper0.textContent(),second);assert.equal(await upper1.textContent(),first);
  await page.locator('#homeUnifiedEditor label').filter({hasText:'フリック 右'}).locator('select').selectOption('volumeUp');
  await page.locator('#homeUnifiedEditor').getByText('変更を保存',{exact:true}).click();
  const save=await page.evaluate(()=>window.sent.filter(x=>x.device==='home'&&x.action==='layoutSave'));
  assert.equal(save.length,1);const packet=JSON.parse(save[0].slot);
  assert.equal(packet.next.layout.upper[0].action,'home');assert.equal(packet.next.flick.flick.right,'volumeUp');
  await page.evaluate(x=>nativeResult({ok:true,home:true,kind:'layoutSave',record:{raw:JSON.stringify(x.next),value:x.next}}),packet);
  assert.equal(await page.locator('#homeUnifiedEditor').isVisible(),false);
  await page.evaluate(()=>window.sent.length=0);
  const pad=page.locator('#homeFlickPad');await pad.scrollIntoViewIfNeeded();const p=await pad.boundingBox();
  await page.mouse.move(p.x+p.width*.25,p.y+p.height*.5);await page.mouse.down();await page.mouse.move(p.x+p.width*.75,p.y+p.height*.5,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.sent.filter(x=>x.device==='tv'&&x.action==='volumeUp').length),1);
  await page.evaluate(()=>window.sent.length=0);
  await upper0.click();assert.equal(await page.evaluate(()=>window.sent.filter(x=>x.device==='home'&&x.action==='layoutRun').length),1);
  await page.evaluate(()=>nativeResult({ok:true,home:true,kind:'layoutRun',message:'fixture'}));
  assert.deepEqual(errors,[]);
  console.log(name+' actual cooked HTML / 12 keys / 4 panels / drag commit once / apps / error PASS');
  await context.close();
 }finally{await browser.close();}
}
