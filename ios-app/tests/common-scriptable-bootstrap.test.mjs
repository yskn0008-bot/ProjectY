import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const file = new URL('../scriptable/YOS Common Installer.scriptable', import.meta.url);
const codeFile = new URL('../scriptable/YOS Common Installer.js', import.meta.url);
const json = fs.readFileSync(file, 'utf8');
const metadata = JSON.parse(json);
const code = fs.readFileSync(codeFile, 'utf8');

test('bootstrap is standard Scriptable share/import package with preserved canonical name', () => {
  assert.deepEqual(Object.keys(metadata).sort(), ['always_run_in_app','icon','name','script','share_sheet_inputs']);
  assert.equal(metadata.name, 'YOS Common Installer');
  assert.deepEqual(metadata.icon, {color: 'gray', glyph: 'arrow-down-circle'});
  assert.equal(metadata.always_run_in_app, true);
  assert.deepEqual(metadata.share_sheet_inputs, []);
});

test('bootstrap script exactly equals the GitHub-maintained common installer', () => {
  assert.equal(metadata.script, code);
  assert.equal(crypto.createHash('sha256').update(metadata.script).digest('hex'),
    crypto.createHash('sha256').update(code).digest('hex'));
  assert.match(code, /^\/\/ YOS_SCRIPT_NAME: YOS Common Installer$/m);
  assert.match(code, /^const CATALOG=ROOT\+'main\/ios-app\/scriptable\/yos-common-installer-catalog\.json';$/m);
});

test('bootstrap script parses as valid asynchronous Scriptable JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script('(async()=>{\n'+metadata.script+'\n})()'));
});

test('bootstrap does not mutate existing scripts during import and installs no unrelated service', () => {
  assert.doesNotMatch(json, /sk-proj-[A-Za-z0-9_-]{16,}|secret_[A-Za-z0-9_-]{16,}|NOTION_TOKEN\s*=/);
  assert.match(code, /fileExists\(target\)/);
  assert.match(code, /async function recoverPending/);
  assert.match(code, /async function install\(entry\)/);
  assert.doesNotMatch(code, /\bCalendarEvent\.\b|\bContact\.\b|\bMessage\.\b/);
  assert.ok(metadata.script.length > 1000);
});

test('distributing the import package never changes the prior per-app installers', () => {
  for (const path of ['../scriptable/YOS Timeline Installer.js','../scriptable/YOS JOURNAL Installer.js']) {
    const existing=fs.readFileSync(new URL(path,import.meta.url),'utf8');
    assert.ok(existing.length > 200);
    assert.doesNotMatch(existing,/YOS Common Installer v1\.0/);
  }
});
