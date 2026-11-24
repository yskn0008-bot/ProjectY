import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../journal-v2/index.html',import.meta.url),'utf8');
test('single-story edition never links Next Story to itself',()=>{
  assert.ok(source.includes("(items.length>1?'<div class=\"related\">"));
  assert.ok(source.includes("const next=document.getElementById('nextStory');if(next)next.onclick"));
  assert.ok(!source.includes("document.getElementById('nextStory').onclick="));
});
test('multi-story navigation retains existing date-scoped hash routing',()=>{
  assert.ok(source.includes("issueArticleHash(issue,(i+1)%items.length)"));
  assert.ok(source.includes("items[(i+1)%items.length].title"));
});
