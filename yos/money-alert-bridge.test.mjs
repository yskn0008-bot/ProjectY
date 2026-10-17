import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('./money-alert-bridge-v1.js',import.meta.url),'utf8');

function bridge(money){
  const store=new Map();
  const window={YOSSharedStateV1:{snapshot:()=>({money})}};
  const context={
    window,
    location:{search:'',replace(){}},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
    URLSearchParams,TextEncoder,TextDecoder,btoa:globalThis.btoa,setTimeout,
    document:{title:'',body:{innerHTML:'',appendChild(){}},createElement(){return {className:'',textContent:'',appendChild(){},href:''}}},
    console
  };
  vm.runInNewContext(source,context);
  return window.__yosMoneyAlertBridgeV1;
}

test('does not invent a budget alert when budget or spent is unknown',()=>{
  assert.equal(bridge({todayBudget:null,spentToday:500}).build().alerts.length,0);
  assert.equal(bridge({todayBudget:1000,spentToday:null}).build().alerts.length,0);
  assert.equal(bridge({todayBudget:'',spentToday:500}).build().alerts.length,0);
});

test('emits budget over only when both live values are known',()=>{
  const alerts=bridge({todayBudget:1000,spentToday:1200}).build().alerts;
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].kind,'daily_budget_over');
  assert.equal(alerts[0].amount,200);
});

test('projected shortage remains explicit-only',()=>{
  assert.equal(bridge({shortagePossible:false}).build().alerts.length,0);
  assert.equal(bridge({shortagePossible:true,shortfall:3000}).build().alerts[0].kind,'projected_shortage');
});
