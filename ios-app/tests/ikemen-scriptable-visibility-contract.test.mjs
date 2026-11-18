import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../scriptable/YOS イケメン攻略本.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const run=source.slice(source.indexOf('async function launch(){'),source.indexOf('async function main(){'));

test('open the WebView before JavaScript checks or callbacks',()=>{
 assert(run.includes('await web.loadFile(runtimePath)'));
 assert(run.includes('await web.present(false)'));
 assert(run.indexOf('await web.loadFile(runtimePath)')<run.indexOf('await web.present(false)'));
 assert(run.indexOf('await web.present(false)')<run.indexOf('await web.evaluateJavaScript('));
 assert(!source.includes('verifyWebView('));
 assert(!source.includes('captureNext('));
 assert(!source.includes('web.present(true)'));
});

test('preserve the offline personal photos without publishing them',()=>{
 assert.match(source,/lightweightHTML\(injectedHTML\(original,before\)\)/);
 assert.match(source,/Data\.fromBase64String\(base64\)/);
 assert.match(source,/if\(fm\.fileExists\(path\)\)/);
 assert.match(source,/current\.toBase64String\(\)!==base64/);
 assert(!source.includes('data:image/jpeg;base64,/9j/'));
});

test('protect progress when post-dismiss export fails',()=>{
 assert.match(source,/exported=await web\.evaluateJavaScript\(/);
 assert.match(source,/saveState\(exported\)/);
 assert.match(source,/読書記録の保存は未確認/);
 assert.match(source,/const previous=fm\.fileExists\(statePath\)/);
});

test('Shortcuts dispatch stays in Scriptable without modifying stored HTML',()=>{
 assert.match(source,/config\.runsInApp===false/);
 assert.match(source,/Safari\.open\('scriptable:\/\/\/run\//);
 assert.match(source,/const HTML_NAME='magazine\.html'/);
 assert.match(source,/const STATE_NAME='reading-state\.json'/);
});

test('common installer keeps one uniquely pinned script entry',()=>{
 assert.equal(catalog.schema,1);
 const found=catalog.targets.filter(x=>x.id==='ikemen-magazine');
 assert.equal(found.length,1);
 assert.equal(found[0].name,'YOS イケメン攻略本');
 assert.equal(found[0].path,'ios-app/scriptable/YOS イケメン攻略本.js');
 assert.match(found[0].sha256,/^[0-9a-f]{64}$/);
 assert.match(found[0].commit,/^[0-9a-f]{40}$/);
 assert.equal(new Set(catalog.targets.map(x=>x.id)).size,catalog.targets.length);
});
