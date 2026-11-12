import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browser=await ({chromium,webkit}[browserName]).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP'});
const page=await context.newPage();
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
try {
  // Home has unrelated runtime integrations. Do not use real network or accounts.
  await page.route('https://project-y-yos-ai.vercel.app/**',r=>r.fulfill({
    status:503,contentType:'application/json',body:'{"error":"test only"}'
  }));
  await page.goto(base+'/yos/',{waitUntil:'domcontentloaded'});
  await page.locator('#openMenu').click();
  const dialog=page.locator('#menuDialog');
  await dialog.waitFor({state:'visible',timeout:10000});
  const link=dialog.locator('a[href="./notification-history.html"]');
  assert.equal(await link.count(),1,'one menu link, not duplicate entries');
  await link.click();
  await page.waitForURL(/\/yos\/notification-history\.html$/, {timeout:10000});
  assert.equal(await page.locator('h1').innerText(),'通知履歴');
  assert.match(await page.locator('#message').innerText(),/未取得/);
  assert.equal(await page.locator('.event').count(),0);
  const home=page.locator('.footer a[href="./"]');
  await home.click();
  await page.waitForURL(/\/yos\/?$/, {timeout:10000});
  console.log('Alerts STREAM navigation '+browserName+' passed');
} finally {
  await browser.close();
}
