import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const launcher=await readFile(new URL('../my-way-calendar-launcher.cherri',import.meta.url),'utf8');

test('Life calendar button uses Scriptable direct-run path',()=>{
  assert.match(html,/scriptable:\/\/\/run\/YOS%20Life%20Calendar%20Sync\?openEditor=false/);
  assert.doesNotMatch(html,/scriptable:\/\/\/run\?scriptName=YOS%20Life%20Calendar%20Sync/);
});

test('MY WAY launcher is one open action into existing sync and return path',()=>{
  assert.match(launcher,/#define name MY WAY/);
  assert.match(launcher,/rawAction\("is\.workflow\.actions\.openurl"/);
  assert.match(launcher,/scriptable:\/\/\/run\/YOS%20Life%20Calendar%20Sync\?destination=myway&openEditor=false/);
  assert.equal((launcher.match(/rawAction\(/g)||[]).length,1);
});
