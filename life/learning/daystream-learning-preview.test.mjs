import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDaystreamLearningPreview as render,daystreamLearningPreviewCss as css} from './daystream-learning-preview.mjs';
const due=(title,key='x')=>({key,title,dueDate:'2026-11-13',type:'deadline_date_only',placement:'in_app_only',changesOriginal:false});
const snapshot=(cards,complete=true)=>({status:'read_only',complete,cards});
test('renders a readable in-app proposal without buttons, timers, links, or scripts',()=>{
 const html=render(snapshot([due('ゴミ出し')]));
 assert.match(html,/生活学習からの提案/);
 assert.match(html,/時刻未確認/);
 assert.match(html,/予定は変更しません/);
 assert.doesNotMatch(html,/<script|<button|<a\s|onclick|setInterval|onload/i);
 assert.match(css,/\.yos-learning-preview/);
});
test('escapes potentially malicious Notion source titles',()=>{
 const html=render(snapshot([due('<img src=x onerror=alert(1)>')]));
 assert.doesNotMatch(html,/<img|onerror=/i);
 assert.match(html,/&lt;img/);
});
test('unavailable and missing source data produce no misleading UI',()=>{
 assert.equal(render({status:'unavailable',cards:[due('x')]}),'');
 assert.equal(render(snapshot([])),'');
 assert.equal(render(null),'');
});
test('only validated, immutable date-only hints can appear',()=>{
 const html=render(snapshot([due('a'),{...due('b','b'),changesOriginal:true},{...due('c','c'),placement:'notification'},{...due('d','d'),dueDate:'2026-02-31'}]));
 assert.match(html,/>a</);assert.doesNotMatch(html,/>b</);assert.doesNotMatch(html,/>c</);assert.doesNotMatch(html,/>d</);
});
test('partial source states partial coverage rather than full confidence',()=>{
 const html=render(snapshot([due('確認対象')],false));assert.match(html,/一部取得したタスクのみ/);
});
test('deduplicates cards and limits visible suggestions to 3',()=>{
 const html=render(snapshot([due('first','a'),due('duplicate','a'),due('second','b'),due('third','c'),due('fourth','d')]));
 assert.equal((html.match(/yos-learning-preview__item/g)||[]).length,3);
 assert.doesNotMatch(html,/duplicate|fourth/);
});
