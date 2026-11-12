'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {writeResultOutputs} = require('./projecty-hq-result-output.cjs');

function fixture(value, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-hq-output-'));
  const input = path.join(dir, 'result.json'), output = path.join(dir, 'output.txt');
  fs.writeFileSync(input, typeof value === 'string' ? value : JSON.stringify(value));
  try { return run(input, output); } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}

test('large recovery state crosses a real process boundary using file paths only', () => {
  const value={recovery:{target:'PR#692',action:'NEEDS_YOS'},state:{payload:'x'.repeat(600000)},body:'private-state-not-for-console'};
  fixture(value,(input,output)=>{
    const child=spawnSync(process.execPath,[path.join(__dirname,'projecty-hq-result-output.cjs'),input,output],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.equal(fs.readFileSync(output,'utf8'),'needs_yos=true\nexternal_wait=false\ntarget=PR#692\n');
    assert.ok(child.stdout.length<150,'logs contain only the bounded summary');
    assert.doesNotMatch(child.stdout,/private-state-not-for-console/);
  });
});

test('external wait and absent recovery retain the existing output contract', () => {
  for(const [value,expected] of [
    [{recovery:{target:'PR#705',action:'EXTERNAL_WAIT'}},'needs_yos=false\nexternal_wait=true\ntarget=PR#705\n'],
    [{recovery:null},'needs_yos=false\nexternal_wait=false\ntarget=\n']
  ]) fixture(value,(input,output)=>{writeResultOutputs(input,output);assert.equal(fs.readFileSync(output,'utf8'),expected)});
});

test('invalid JSON and newline injection fail before writing any workflow outputs', () => {
  for(const value of ['{broken',[],{recovery:{target:'PR#1\nneeds_yos=true',action:'NEEDS_YOS'}}]) {
    fixture(value,(input,output)=>{assert.throws(()=>writeResultOutputs(input,output));assert.equal(fs.existsSync(output),false)});
  }
});

test('production transport does not reintroduce the full result as a process argument', () => {
  const workflow=fs.readFileSync(path.join(__dirname,'../workflows/projecty-hq-autopilot.yml'),'utf8');
  assert.ok(workflow.includes('projecty-hq-result-output.cjs'));
  assert.doesNotMatch(workflow,/node - "\$result"/);
});
