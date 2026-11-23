import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';

const web=await readFile(new URL('../../journal-v2/index.html',import.meta.url),'utf8');
const scriptable=await readFile(new URL('../../ios-app/scriptable/YOS JOURNAL.js',import.meta.url),'utf8');
const editionOK=runInNewContext(web.match(/function editionOK\(x,date\)\{[\s\S]*?\n\}/)?.[0]+';editionOK');
const consumer=scriptable.slice(scriptable.indexOf('const safeUrl='),scriptable.indexOf('let issue=null'));
const valid=runInNewContext(consumer+';valid');
const article={category:'TEST',title:'独立した記事',summary:'出典を確認した本文',link:'https://example.org/article'};
const issue=(date,n)=>({issuedOn:date,articles:Array.from({length:n},()=>({...article}))});

test('Web and Scriptable reject incomplete future issues while retaining approved historical editions',()=>{
  assert.equal(editionOK(issue('2026-11-20',1),'2026-11-20'),true);
  assert.equal(valid(issue('2026-11-20',1)).articles.length,1);
  for(const n of [1,2,4]){
    assert.equal(editionOK(issue('2026-11-24',n),'2026-11-24'),false);
    assert.throws(()=>valid(issue('2026-11-24',n)),/3記事/);
  }
  assert.equal(editionOK(issue('2026-11-24',3),'2026-11-24'),true);
  assert.equal(valid(issue('2026-11-24',3)).articles.length,3);
  const missing=issue('2026-11-24',3);missing.articles[2].link='';
  assert.throws(()=>valid(missing),/揃っていません/);
});

test('voice generation rejects partial future issues before contacting synthesis engine',()=>{
  const code=`import importlib.util\n`+
   `s=importlib.util.spec_from_file_location('voice','scripts/journal_voicevox_demo.py')\n`+
   `m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n`+
   `m.validate_issue_articles('2026-11-20',[{'title':'history'}])\n`+
   `m.validate_issue_articles('2026-11-24',[{'title':'a'},{'title':'b'},{'title':'c'}])\n`+
   `try: m.validate_issue_articles('2026-11-24',[{'title':'a'},{'title':'b'}])\n`+
   `except RuntimeError: pass\n`+
   `else: raise AssertionError('partial future audio was accepted')\n`;
  execFileSync('python3',['-c',code],{cwd:new URL('../..',import.meta.url).pathname,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
});
