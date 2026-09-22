import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const engine={chromium,webkit}[browserName];
if(!engine)throw new Error(`Unsupported browser: ${browserName}`);
const baseURL=process.env.YOS_BASE_URL||'http://127.0.0.1:4173/yos/';
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const fixedNow=`${date}T08:00:00+09:00`;

const browser=await engine.launch();
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
await context.addInitScript(({date,now})=>{
  const NativeDate=Date,fixedTime=NativeDate.parse(now);
  globalThis.Date=class extends NativeDate{
    constructor(...args){super(...(args.length?args:[fixedTime]))}
    static now(){return fixedTime}
  };
  localStorage.setItem('yos-life-v1',JSON.stringify({
    days:{[date]:{
      schedule:[
        {id:'event-1',title:'既存の予定',start:`${date}T09:00:00+09:00`,end:`${date}T09:30:00+09:00`,category:'personal'},
        {id:'event-2',title:'買い物',start:`${date}T10:00:00+09:00`,end:`${date}T11:00:00+09:00`,category:'personal'}
      ],
      tasks:[
        {text:'生活タスク1',done:false,category:'personal'},
        {text:'生活タスク2',done:false,category:'personal'}
      ],
      checkin:{health:'3',mood:'2'},
      note:'明日の準備を小さく始める。',
      lastSync:new NativeDate(fixedTime).toISOString()
    }},
    moneySafety:{income:'310000',expense:'204800',currentBalance:'105200',nextPayment:'家賃',goal:'今月の支払いを確認する'}
  }));
  localStorage.setItem('hj-domain-journeys-v1',JSON.stringify([{id:'life-rebuild',name:'人生の再建',theme:'価値を届ける力を高める'}]));
  localStorage.setItem('hj-user-profile-v1',JSON.stringify({focusDomain:'life-rebuild'}));
  localStorage.setItem('yos-task-dashboard-cache-v1',JSON.stringify({savedAt:fixedTime,data:{tasks:[
    {order:1,title:'本人確認を終える',state:'本人操作',priority:'P0',owner:'ようすけ'},
    {order:2,title:'次の作業',state:'次にやる',priority:'P1',owner:'YOS'}
  ]}}));
},{date,now:fixedNow});

const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));

try{
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.waitForSelector('#taskDashboard',{state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#taskDashboardBody')?.innerText.includes('重要なこと'));

  const visual=await page.evaluate(()=>{
    const cockpit=document.querySelector('#taskDashboard').getBoundingClientRect();
    const nav=document.querySelector('.bottom-nav').getBoundingClientRect();
    const home=document.querySelector('#homePage');
    return {
      width:innerWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      cockpitTop:cockpit.top,cockpitBottom:cockpit.bottom,navTop:nav.top,navHeight:nav.height,
      text:home.innerText,
      detailsOpen:[...home.querySelectorAll('details')].some(node=>node.open)
    };
  });
  assert.equal(visual.width,390);
  assert.ok(visual.scrollWidth<=visual.clientWidth+1,`horizontal overflow: ${visual.scrollWidth}/${visual.clientWidth}`);
  assert.ok(visual.navHeight>=48&&visual.navHeight<=72,`unexpected nav height: ${visual.navHeight}`);
  assert.ok(visual.cockpitTop>=0,`cockpit top clipped: ${visual.cockpitTop}`);
  assert.ok(visual.cockpitBottom<=visual.navTop+1,`cockpit exceeds first viewport: ${visual.cockpitBottom}/${visual.navTop}`);
  assert.equal(visual.detailsOpen,false,'details must stay collapsed on first view');
  for(const label of ['今日の運転席','今日','今やる','次','予定','お金','重要なこと'])assert.match(visual.text,new RegExp(label),`missing ${label}`);
  for(const value of ['本人確認を終える','次の作業','既存の予定','4,588円','本人操作'])assert.match(visual.text,new RegExp(value),`missing seeded value ${value}`);

  const authVisible=await page.locator('#taskDashboardAuth').isVisible();
  assert.equal(authVisible,false,'fresh cached Tasks must not add auth friction to the first view');

  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:`test-results/yos-cockpit-390-${browserName}.png`,fullPage:false});

  await page.locator('.money-decision-card').click();
  await page.waitForFunction(()=>document.body.dataset.domain==='money');
  assert.equal(await page.locator('#brandTitle').textContent(),'MY MONEY','Money card did not open Money');

  await page.locator('.bottom-nav [data-page="home"]').click();
  await page.waitForFunction(()=>document.body.dataset.domain==='home');
  await Promise.all([
    page.waitForURL(url=>url.pathname.endsWith('/life/')||url.pathname.endsWith('/life/index.html')),
    page.locator('.schedule-card').click()
  ]);
  assert.match(new URL(page.url()).pathname,/\/life\/?(?:index\.html)?$/,'Schedule card did not open Life');
  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
}finally{
  await browser.close();
}
