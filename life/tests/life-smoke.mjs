import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const browserName = process.env.LIFE_BROWSER || 'chromium';
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unsupported browser: ${browserName}`);

const baseURL = process.env.LIFE_BASE_URL || 'http://127.0.0.1:4173/life/';
const lifeDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const fixedNow = `${lifeDate}T08:00:00+09:00`;
const nextHour = `${lifeDate}T09:00:00+09:00`;
const followingHour = `${lifeDate}T09:30:00+09:00`;

const browser = await engine.launch();
const context = await browser.newContext({ viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo' });
await context.addInitScript(({date,start,end,now})=>{
  const NativeDate=Date,fixedTime=NativeDate.parse(now);globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixedTime]))}static now(){return fixedTime}};
  if(!localStorage.getItem('yos-life-v1'))localStorage.setItem('yos-life-v1',JSON.stringify({days:{[date]:{schedule:[{id:'existing-event',title:'既存の予定',start,end,category:'personal'},{id:'visual-event-2',title:'買い物',start:`${date}T10:00:00+09:00`,end:`${date}T11:00:00+09:00`,category:'personal'},{id:'visual-event-3',title:'ココナラ作業',start:`${date}T13:00:00+09:00`,end:`${date}T14:00:00+09:00`,category:'work'},{id:'visual-event-4',title:'読書タイム',start:`${date}T19:00:00+09:00`,end:`${date}T20:00:00+09:00`,category:'personal'}],tasks:[{text:'既存タスク',done:false,category:'personal'},{text:'サービス内容を見直す',done:false,category:'work'},{text:'提案文を作り直す',done:true,category:'work'},{text:'家の片付けをする',done:false,category:'personal'}],routines:{wake:[0,1],before:[0],home:[0]},checkin:{sleep:'6.5',health:'3',mood:'2'},note:'明日の準備を小さく始める。',doneToday:'既存のできたこと'}},activeGroup:'wake',moneySafety:{income:'310000',expense:'204800',currentBalance:'105200',requiredPayments:'家賃・光熱費',protectedMoney:'50000',freeMoney:'55200',nextPayment:'家賃',goal:'今月の支払いを確認する'}}));
  if(!localStorage.getItem('hj-domain-journeys-v1'))localStorage.setItem('hj-domain-journeys-v1',JSON.stringify([{id:'life-rebuild',name:'人生の再建',stage:'挑戦者',theme:'価値を届ける力を高める'}]));
  if(!localStorage.getItem('hj-user-profile-v1'))localStorage.setItem('hj-user-profile-v1',JSON.stringify({focusDomain:'life-rebuild'}));
  if(!localStorage.getItem('hj-daily-scenes-v1'))localStorage.setItem('hj-daily-scenes-v1',JSON.stringify([{id:'scene-1',domainId:'life-rebuild',occurredAt:new Date().toISOString(),rawInput:'今日の予定をひとつ終えた。',next:'明日の準備をする。'}]));
  if(!localStorage.getItem('yos-my-way-ideas-v1'))localStorage.setItem('yos-my-way-ideas-v1',JSON.stringify({text:'経験を暮らしの道具にする。'}));
},{date:lifeDate,start:nextHour,end:followingHour,now:fixedNow});

const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
const waitForDailyFlow=async()=>{await page.waitForSelector('#lifeCalendarV1',{state:'attached'});await page.waitForSelector('#lifeDailyFlowV1',{state:'attached'});await page.waitForFunction(()=>Boolean(document.getElementById('lifeFlowDateV1')?.textContent.trim()))};
try{
 await page.goto(baseURL,{waitUntil:'networkidle'});await waitForDailyFlow();
 assert.equal(await page.locator('#lifeCalendarV1').isVisible(),false);
 const yosPage=await context.newPage(),yosErrors=[];yosPage.on('pageerror',e=>yosErrors.push(e.message));
 await yosPage.goto(new URL('../yos/',baseURL).href,{waitUntil:'networkidle'});await yosPage.waitForSelector('#homePage');await mkdir('test-results',{recursive:true});
 const inspect=async(domain,panel,labels,name)=>{if(domain!=='home')await yosPage.locator(`.bottom-nav [data-page="${domain}"]`).click();await yosPage.waitForFunction(n=>document.body.dataset.domain===n,domain);const text=await yosPage.locator(panel).innerText();for(const label of labels)assert.match(text,new RegExp(label),`${domain} is missing ${label}`);await yosPage.screenshot({path:`test-results/${name}-390-${browserName}.png`,fullPage:false})};
 assert.equal(await yosPage.locator('#brandTitle').textContent(),'MY WAY');
 await inspect('home','#homePage',['今日','今やる','次','予定','お金','重要なこと'],'yos-home');
 await inspect('money','#moneyPage',['MY MONEY','今月の状態','収入','支出','残り・見込み','内訳・守るお金','近い支払い'],'yos-money');
 await inspect('journey','#journeyPage',['MY JOURNEY','歩いてきた景色','現在のステージ','現在の景色','最近の経験','次のテーマ'],'yos-journey');
 await inspect('idea','#ideaPage',['MY IDEA','ひらめき、拾えてる','アイデアを残す','最近のアイデアの種'],'yos-idea');
 assert.deepEqual(pageErrors,[]);assert.deepEqual(yosErrors,[]);
}finally{await browser.close()}
