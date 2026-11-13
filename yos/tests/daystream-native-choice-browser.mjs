import assert from 'node:assert/strict';

export async function verifyNativeChoice(page){
 const key='YOS_DAYSTREAM_WEB_SHORTCUT_DRAFT_V1';
 await page.locator('#addBtn').click();await page.locator('#newTitle').fill('下書き保持テスト');
 await page.locator('#wizardNext').click();await page.locator('#newTime').fill('14:00');
 await page.locator('#wizardNext').click();await page.locator('#newDuration').fill('25');await page.locator('#wizardNext').click();
 await page.locator('#chooseNativeShortcut').click();
 const pending=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 assert.equal(pending.fields.newTitle,'下書き保持テスト');assert.equal(pending.fields.newTime,'14:00');assert.equal(pending.fields.newDuration,'25');
 assert.match(pending.nonce,/^YOS_PICK_V1:/);
 await page.reload({waitUntil:'networkidle'});await page.locator('#applyNativeShortcut').waitFor();
 assert.equal(await page.locator('#newTitle').inputValue(),'下書き保持テスト');assert.match(await page.locator('#wizardProgress').textContent(),/4 \/ 5/);
 // A denied clipboard must offer ordinary paste without losing the original draft.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>Promise.reject(Error('denied'))}}));
 await page.locator('#applyNativeShortcut').click();await page.locator('#nativeShortcutPaste').waitFor();
 await page.locator('#nativeShortcutPaste').fill('unrelated clipboard');assert.match(await page.locator('#nativeShortcutStatus').textContent(),/別の/);
 assert.equal(await page.locator('#newShortcut').inputValue(),'');
 const encoded=Buffer.from('新しい名前 日本語').toString('base64');
 await page.locator('#nativeShortcutPaste').fill(pending.nonce+'\n'+encoded);
 assert.equal(await page.locator('#newShortcut').inputValue(),'新しい名前 日本語');
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).consumed,key),true);
 await page.reload({waitUntil:'networkidle'});await page.locator('#wizardNext').waitFor();
 assert.equal(await page.locator('#newShortcut').inputValue(),'新しい名前 日本語');
 assert.equal(await page.locator('#applyNativeShortcut').isVisible(),false);
 await page.locator('#wizardNext').click();await page.locator('#saveBtn').click();
 const result=await page.evaluate(k=>({draft:localStorage.getItem(k),task:Object.values(JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')).days).flat().find(x=>x.t==='下書き保持テスト')}),key);
 assert.equal(result.draft,null);assert.equal(result.task.shortcut,'新しい名前 日本語');assert.equal(result.task.s,840);assert.equal(result.task.d,25);
 await page.evaluate(()=>beginLocalEdit(items.find(x=>x.t==='下書き保持テスト')));
 assert.equal(await page.locator('#chooseNativeShortcut').isVisible(),false);await page.locator('#cancelEditor').click();
 // Storage failure stops before launching the external chooser and keeps input.
 await page.locator('#addBtn').click();await page.locator('#newTitle').fill('保存失敗でも保持');
 await page.locator('#wizardNext').click();await page.locator('#newTime').fill('15:00');await page.locator('#wizardNext').click();await page.locator('#newDuration').fill('20');await page.locator('#wizardNext').click();
 await page.evaluate(k=>{const original=Storage.prototype.setItem;window.restoreChoiceStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(name,value){if(name===k)throw Error('保存拒否');return original.call(this,name,value)}},key);
 await page.locator('#chooseNativeShortcut').click();assert.match(await page.locator('#nativeShortcutStatus').textContent(),/保存拒否/);
 assert.equal(await page.locator('#newTitle').inputValue(),'保存失敗でも保持');assert.equal(await page.locator('#applyNativeShortcut').isVisible(),false);
 await page.evaluate(()=>window.restoreChoiceStorage());await page.locator('#cancelEditor').click();
}
