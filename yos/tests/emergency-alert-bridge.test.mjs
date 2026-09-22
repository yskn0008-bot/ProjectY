import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildEmergencyPayload} from '../emergency-alert-bridge-v1.mjs';

test('Emergency bridge passes only events that satisfy the full emergency gate',()=>{
  const payload=buildEmergencyPayload([
    {id:'normal',kind:'task',title:'通常',requiresImmediateAwareness:true,requiresImmediateAction:false,delayCausesMaterialHarm:true},
    {id:'urgent',kind:'task',title:'緊急',requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true}
  ]);
  assert.deepEqual(payload.alerts.map(x=>x.id),['urgent']);
});

test('legacy emergency flag alone never enters Emergency Alert',()=>{
  const payload=buildEmergencyPayload([{id:'legacy',kind:'task',title:'通常',emergency:true}]);
  assert.equal(payload.alerts.length,0);
});

test('same-source normal alert is suppressed when Emergency wins',()=>{
  const payload=buildEmergencyPayload([
    {id:'same',kind:'payment',title:'通常支払い'},
    {id:'same',kind:'payment',title:'緊急支払い',requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true}
  ]);
  assert.equal(payload.alerts.length,1);
  assert.equal(payload.alerts[0].id,'same');
});

test('notified keys suppress repeated Emergency delivery',()=>{
  const payload=buildEmergencyPayload(
    [{id:'seen',kind:'task',requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true}],
    {notifiedKeys:['seen']}
  );
  assert.equal(payload.alerts.length,0);
});

test('Emergency bridge is read-only and creates no SSOT',async()=>{
  const source=await readFile(new URL('../emergency-alert-bridge-v1.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/localStorage\.setItem|sessionStorage|indexedDB|FileManager|writeString/);
  assert.match(source,/selectAlerts/);
  assert.match(source,/YOS_EMERGENCY_ALERT_V1/);
});

test('Emergency bridge page loads the module entrypoint',async()=>{
  const html=await readFile(new URL('../emergency-alert-bridge.html',import.meta.url),'utf8');
  assert.match(html,/type="module"/);
  assert.match(html,/emergency-alert-bridge-v1\.mjs\?v=1/);
  assert.match(html,/emergencyAlertBridgeStatus/);
});
