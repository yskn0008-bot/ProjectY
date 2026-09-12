import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js', import.meta.url), 'utf8');

test('v6.4 keeps the real center button as the gesture owner', () => {
  assert.match(source, /YOS Remote Hub v6\.4/);
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
