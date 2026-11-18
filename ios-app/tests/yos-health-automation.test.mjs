import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import {createHash} from 'node:crypto';
const script = fs.readFileSync(new URL('../scriptable/YOS Health Automation.js', import.meta.url),'utf8');

async function invoke(mode, {errorIndex=-1, selected=-1}={}) {
 const notifications=[]; const cancelled=[];const opened=[];const outputs=[];let completed=0;let n=0;
 class MockNotification {
   static async removePending(ids) {cancelled.push([...ids]);}
   constructor() {this.index=n++;}
   setTriggerDate(date) {this.when=date;}
   async schedule() {if(this.index===errorIndex) throw new Error('Mock denied');notifications.push(this);}
 }
 class MockAlert {
  addAction() {} addCancelAction() {} async presentSheet(){return selected;}
 }
 const context = vm.createContext({args:{shortcutParameter:mode},Notification:MockNotification,Alert:MockAlert, Safari:{open:u=>opened.push(u)},Script:{setShortcutOutput:x=>outputs.push(x),complete:()=>completed++},console:{error:()=>{}},Date});
 await vm.runInContext(`(async()=>{${script}\n})()`, context);
 return {notifications,cancelled,opened,outputs,completed};
}

test('wake schedules four private non-sounding reminders relative to now',async()=>{
 const r=await invoke('wake');
 assert.equal(r.notifications.length,4);
 assert.deepEqual(r.notifications.map(x=>x.identifier), ['yos.health.water.awake.1','yos.health.water.awake.2','yos.health.water.awake.3','yos.health.water.awake.4']);
 assert.ok(r.notifications.every(x=>x.sound === null && x.threadIdentifier==='yos-health-water'));
 assert.equal(r.outputs.at(-1),'hydration_scheduled:4');
 assert.equal(r.completed,1);
});
test('bed cancels only own identifiers',async()=>{
 const r=await invoke('sleep_on');
 assert.equal(r.notifications.length,0);
 assert.deepEqual(r.cancelled[0],['yos.health.water.awake.1','yos.health.water.awake.2','yos.health.water.awake.3','yos.health.water.awake.4']);
 assert.equal(r.outputs[0],'hydration_cancelled');
});
test('fail closed on permission denied',async()=>{
 const r=await invoke('wake',{errorIndex:1});
 assert.equal(r.cancelled.length,2);
 assert.match(r.outputs[0],/^health_error:/);
 assert.equal(r.completed,1);
});
test('manual menu reuses existing Clarity',async()=>{
 const r=await invoke('menu',{selected:0});
 assert.ok(r.opened[0].startsWith('shortcuts://run-shortcut?name=Clarity.Voice'));
});
test('manual menu opens original JOURNAL URL',async()=>{
 const r=await invoke('menu',{selected:1});
 assert.deepEqual(r.opened,['https://yskn0008-bot.github.io/ProjectY/journal-v2/']);
});
test('unknown command does not schedule or cancel',async()=>{
 const r=await invoke('invalid');
 assert.equal(r.notifications.length,0);assert.equal(r.cancelled.length,0);
 assert.match(r.outputs[0],/^health_error:Unknown/);
});
test('no secret or HealthKit/SleepCycle claims',()=>{
 assert.ok(!script.includes('Notification.removeAllPending('));
 assert.ok(!script.includes('api.notion.com'));
 assert.ok(!script.includes('sk-proj-'));
 assert.ok(!script.includes('Bearer '));
 assert.ok(!script.includes('HealthKit.save'));
 assert.ok(!script.includes('SleepCycle.start'));
});

test('installer accepts the Scriptable header and the exact canonical name',()=>{
 assert.ok(script.startsWith('// Variables used by Scriptable.'));
 const header=script.split(/\r?\n/).slice(0,20).join('\n');
 const name=header.match(/^\/\/ YOS_SCRIPT_NAME:\s*(.+)\s*$/m)?.[1]?.trim();
 assert.equal(name,'YOS Health Automation');
});
test('shared installer catalog pins the exact current source without changing other entries',()=>{
 const file=fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json', import.meta.url),'utf8');
 const catalog=JSON.parse(file);
 const entries=catalog.targets.filter(t=>t.id==='health-automation');
 assert.equal(entries.length,1);
 assert.equal(entries[0].name,'YOS Health Automation');
 assert.equal(entries[0].path,'ios-app/scriptable/YOS Health Automation.js');
 assert.equal(entries[0].sha256,createHash('sha256').update(script,'utf8').digest('hex'));
 assert.match(entries[0].commit,/^[0-9a-f]{40}$/);
 assert.equal(catalog.targets.length,new Set(catalog.targets.map(t=>t.id)).size);
});
