import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const type=process.env.YOS_BROWSER||'chromium',browser=await (type==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 const res=await page.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
 assert.equal(res.status(),200);
 await page.locator('#timelinePanel').waitFor();
 await page.locator('#yosWebImport').waitFor();
 assert.equal(await page.locator('#yosWebHistory').isVisible(),true);
 const status=await page.evaluate(()=>{
  const day=new Date(),iso=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  const p={version:1,days:{[iso]:[{id:19001,t:'WEB PORT STORAGE SMOKE',s:480,d:30,kind:'task'}]},hiddenCalendar:{}};
  return {ok:window.YOS_DAYSTREAM_WEB.write(p),day};
 });
 assert.equal(status.ok,true,'browser save writes verified local plan');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('WEB PORT STORAGE SMOKE',{exact:false}).first().waitFor();
 const changed=await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  p.days[Object.keys(p.days)[0]][0].s=540;
  const ok=window.YOS_DAYSTREAM_WEB.write(p);
  return {ok,backup:localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_BACKUP_V1')};
 });
 assert.equal(changed.ok,true);
 assert.match(changed.backup,/WEB PORT STORAGE SMOKE/);
 const learning=await page.evaluate(()=>{
  const web=window.YOS_DAYSTREAM_WEB,stamp=new Date().toISOString();
  for(let i=0;i<3;i++)web.logCompletion({title:'完了試験',at:stamp,day:'2026-11-13',plannedStart:540});
  return web.suggestions()
 });
 assert.equal(learning.length,1);
 assert.equal(learning[0].count,3);
 assert.deepEqual(errors,[],'no script errors during load, storage, reload or learning');
 console.log('DAYSTREAM Web port browser smoke PASS',type);
}finally{await browser.close()}
