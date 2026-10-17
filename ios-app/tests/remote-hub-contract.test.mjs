import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js', import.meta.url), 'utf8');
const lightRemote = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Light Remote.js', import.meta.url), 'utf8');

test('v6.6 keeps the real center button as the gesture owner', () => {
  assert.match(source, /YOS Remote Hub v6\.6/);
  assert.match(source, /Reliability rule: a center tap must always win over gesture convenience/);
  assert.match(source, /function installCenterGesture\(/);
  assert.match(source, /role!=="center"\|\|mode==="media"/);
  assert.doesNotMatch(source, /centerSwipePad/);
  assert.doesNotMatch(source, /class="swipe-pad"/);
});

test('center tap stays below the swipe threshold and dispatches adaptive action directly', () => {
  assert.match(source, /const SWIPE_THRESHOLD = 24/);
  assert.match(source, /if\(Math\.max\(Math\.abs\(dx\),Math\.abs\(dy\)\)<SWIPE_THRESHOLD\)return null/);
  assert.match(source, /fireTVKey\(baseAction,role,label\)/);
  assert.match(source, /nativeAction\("tvAdaptive",baseAction,label,role\)/);
});

test('navigation center resolves to confirm and Sony aliases include confirm', () => {
  assert.match(source, /center:"confirm"/);
  assert.match(source, /confirm:\["confirm","enter"\]/);
});

test('top safe-frame space exposes Input and Home quick actions', () => {
  assert.match(source, /class="top-shortcuts"/);
  assert.match(source, /sendTVShortcut\(event,'input','入力'\)/);
  assert.match(source, /sendTVShortcut\(event,'home','ホーム'\)/);
});

test('user layout persistence contract is retained', () => {
  assert.match(source, /const LAYOUT_KEY="yos\.remote\.tv\.buttons\.v52"/);
  assert.match(source, /localStorage\.setItem\(LAYOUT_KEY,JSON\.stringify\(layout\)\)/);
});

test('runtime errors are surfaced instead of silently looking successful', () => {
  assert.match(source, /if\(result&&result\.ok===false\)/);
  assert.match(source, /textContent="エラー"/);
});

test('hub light brightness keeps tap at one step and doubles sustained hold', () => {
  assert.match(source, /data-light-hold=/);
  assert.match(source, /else nativeAction\("light",action,label\)/);
  assert.match(source, /const LIGHT_HOLD_BURST=2/);
  assert.match(source, /first\?1:LIGHT_HOLD_BURST/);
  assert.match(source, /fireBurst\(transport\.remote\.device_id,key\.name,first\?1:LIGHT_HOLD_BURST\)/);
  assert.match(source, /lightHoldHeartbeat/);
  assert.match(source, /lightHoldStop/);
});

test('individual light remote keeps tap single and uses two-command bursts only after the first held step', () => {
  assert.match(lightRemote, /async function fire\(action,count=1\)/);
  assert.match(lightRemote, /client\.fireBurst\(remote\.device_id,key\.name,count\)/);
  assert.match(lightRemote, /sendQueue=sendQueue\.then\(\(\)=>fire\(action,1\)\)/);
  assert.match(lightRemote, /await fire\(action,first\?1:2\)/);
  assert.match(lightRemote, /hold-heartbeat/);
  assert.match(lightRemote, /hold-stop/);
});


test('only one device panel is visible at a time and switching preserves existing layout',()=>{
  assert.match(source,/class="device-tabs"/);
  for(const name of ['tv','light','ac','floor'])assert.match(source,new RegExp('data-panel="'+name+'"'));
  assert.match(source,/\.remote-panel\{display:none/);
  assert.match(source,/\.remote-panel\.active\{display:block/);
  assert.match(source,/const PANEL_KEY="yos\.remote\.selected-panel\.v1"/);
  assert.match(source,/function setPanel\(name\)/);
});
test('TV seek repeat is lease gated and release stops it',()=>{
  assert.match(source,/function bindTVSeekHold\(/);
  assert.match(source,/tvHoldStart/);assert.match(source,/tvHoldHeartbeat/);assert.match(source,/tvHoldStop/);
  assert.match(source,/const TV_HOLD_LEASE_MS=720/);
  assert.match(source,/await sonyAction\(action,false\)/);
  assert.match(source,/function stopTVHold\(\)/);
});
test('floor lamp includes Tapo power brightness white and color with no token in source',()=>{
  assert.match(source,/async function controlFloor\(action,value\)/);
  assert.match(source,/method:"set_device_info"/);
  assert.match(source,/method:"get_device_info"/);
  assert.match(source,/const FLOOR_HOST_KEY=CONFIG\.floor\.key/);
  for(const action of ["brightness","temp","color","on","off"])assert.ok(source.includes('action==="'+action+'"'));
  assert.match(source,/class="floor-rainbow"/);
});
