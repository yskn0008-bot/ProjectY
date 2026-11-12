import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../yos/daystream/index.html',import.meta.url),'utf8');
const js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
test('learning apply preserves accepted Charcoal UI and parses in browsers',()=>{
 assert.equal(js.length,2);
 js.forEach(x=>new vm.Script(x));
 assert.match(html,/--bg:#353a44/);
 assert.match(html,/id="timelinePanel"/);
});
test('suggestions never auto-reschedule and only confirmed start records allow adoption',()=>{
 assert.match(js[0],/if\(x.kind==='start'\)/);
 assert.match(js[0],/button.textContent='表示日の時間割に反映'/);
 assert.match(js[1],/hint.kind!=='start'\|\|hint.count<3/);
 assert.match(js[1],/window\.YOS_DAYSTREAM_APPLY_SUGGESTION=\(hint\)=>/);
 assert.match(js[0],/完了時刻/);
});
test('adoption fails closed for ambiguous, fixed, completed and conflicting tasks',()=>{
 assert.match(js[1],/matching=items\.filter\(x=>x&&!x\.f&&x\.kind==='task'&&!x\.done/);
 assert.match(js[1],/if\(matching.length!==1\)return \{ok:false/);
 assert.match(js[1],/targetMinute\+target\.d>1440/);
 assert.match(js[1],/items\.some\(x=>x&&x\.id!==target\.id/);
 assert.match(js[1],/ほかの予定やタスクと重なるため自動反映しません/);
 assert.match(js[1],/if\(!confirm\('「'/);
});
test('changes only DAYSTREAM local plan with verified readback and failure rollback',()=>{
 assert.match(js[1],/const oldStart=target\.s;target\.s=targetMinute/);
 assert.match(js[1],/if\(!persist\(\)\)\{target\.s=oldStart/);
 assert.match(js[1],/smoothRender\(\);updateReview\(\)/);
 assert.match(js[1],/days:\{\.\.\.savedDays,\[selectedDay\]:entries\}/);
 assert.match(js[0],/元のNotion\/Apple予定は変更しません/);
 assert.doesNotMatch(js[0],/fetch\(.*suggested/);
});
