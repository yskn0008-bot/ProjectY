import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildBrowserSource} from '../scripts/build-weekly-review-browser.mjs';

test('browser Weekly Review runtime is generated from the existing pure engine',async()=>{
  const actual=await readFile(new URL('../../../life/weekly-review-engine-v1.js',import.meta.url),'utf8');
  assert.equal(actual,await buildBrowserSource());
});
