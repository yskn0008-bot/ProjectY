import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('./reference-wallpaper-core.js'),p=new URL('./',import.meta.url),refs=JSON.parse(fs.readFileSync(new URL('reference-wallpaper-manifest.json',p),'utf8')),code=fs.readFileSync(new URL('YOS_DAYSTREAM_Reference_Wallpaper.js',p),'utf8');
const bytes=k=>fs.readFileSync(new URL(refs[k].file,p));
test('both original JPEGs retain exact source bytes and hashes',()=>{for(const[k,v]of Object.entries(refs)){const b=bytes(k);assert.equal(b.length,v.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),v.sha256);assert.equal(b[0],255);assert.equal(b[1],216)}});
test('crop preserves a single uniform scale without stretching at iPhone widths',()=>{for(const ref of Object.values(refs))for(const width of [320,375,393,402,430]){const g=core.geometry(ref,width),c=ref.crop;assert.equal(g.width,width);assert.equal(g.imageWidth/ref.sourceWidth,g.imageHeight/ref.sourceHeight);assert.ok(Math.abs(-g.left/g.scale-c.x)<1e-9);assert.ok(Math.abs(-g.top/g.scale-c.y)<1e-9);assert.ok(Math.abs(g.height/g.scale-c.height)<1e-9)}assert.throws(()=>core.geometry(refs.glass,0));assert.throws(()=>core.geometry({...refs.glass,crop:{x:0,y:0,width:2000,height:2000}},393))});
test('static image HTML has no recreated cards, task actions or remote runtime',()=>{const s=core.html(refs.glass,'data:image/jpeg;base64,'+bytes('glass').toString('base64'));assert.ok(s.includes(bytes('glass').toString('base64')));assert.doesNotMatch(s,/<button|<input|<select|<script[^>]+src=|fetch\(/);assert.throws(()=>core.html(refs.glass,'https://other/image'));assert.doesNotMatch(code,/FileManager|Keychain|CalendarEvent|notion\.so|saveLocalPlan|writeString/)});
async function run(kind='glass',{tamper=false,failed=false}={}){const loaded=[],presented=[],alerts=[],requested=[];const ctx={args:{shortcutParameter:kind},Request:class{constructor(url){requested.push(url);this.response={statusCode:failed?503:200}}async load(){return{toBase64String:()=>tamper?'aW52YWxpZA==':bytes(kind).toString('base64')}}},WebView:class{async loadHTML(s){loaded.push(s)}async present(v){presented.push(v)}},Alert:class{addAction(){}async presentAlert(){alerts.push(this.message)}},Script:{complete(){}},console};vm.createContext(ctx);await vm.runInContext('(async()=>{'+code+'})()',ctx);return{loaded,presented,alerts,requested}}
test('default and explicit compact load exact pinned image and present only static canvas',async()=>{for(const kind of ['glass','compact']){const r=await run(kind);assert.equal(r.alerts.length,0);assert.equal(r.presented.length,1);assert.ok(r.loaded[0].includes(bytes(kind).toString('base64')));assert.match(r.requested[0],/\/bd67b996c0da7e54e99b7a3528c2a3233e329c6b\//)}});
test('failed or altered image is never presented',async()=>{for(const opts of [{tamper:true},{failed:true}]){const r=await run('glass',opts);assert.equal(r.loaded.length,0);assert.equal(r.presented.length,0);assert.equal(r.alerts.length,1)}});

test('accepted static appearance and live 24h timeline are explicitly separate',()=>{
 const status=JSON.parse(fs.readFileSync(new URL('TIMELINE_STATUS.json',p),'utf8'));
 const a=status.visualApproval;
 assert.equal(status.state,'DESIGN_APPROVED_IMPLEMENTATION');
 assert.equal(a.status,'STATIC_CROP_APPROVED');
 assert.equal(a.reference,'glass');
 assert.deepEqual(a.approvedCrop,refs.glass.crop);
 assert.equal(a.approvedCrop.width,557);
 assert.equal(a.approvedCrop.height,1135);
 assert.equal(a.approvedScope,'static appearance only');
 assert.equal(a.dynamicAppearanceApproved,false);
 assert.equal(a.physicalIPhoneApproved,false);
 assert.equal(a.sampleScheduleIsNotUserData,true);
});

test('functional prototype retains original glass default and an independent live-data editor',()=>{
 const live=fs.readFileSync(new URL('daystream-timeline.html',p),'utf8');
 assert.match(live,/id="tlSkin"/);
 assert.match(live,/<option value="glass" selected>/);
 assert.match(live,/id="tlAgenda"/);
 assert.match(live,/id="tlGrid"/);
 assert.match(live,/id="tlEnterEdit"/);
 assert.match(live,/YOS_DAYSTREAM_PLAN_IMPORT/);
 assert.match(live,/const MIN='2026-10-16',MAX='2027-01-13',PX=2;/);
 assert.doesNotMatch(code,/YOS_DAYSTREAM_PLAN_IMPORT/);
 assert.doesNotMatch(code,/\bCalendarEvent\b/);
});
