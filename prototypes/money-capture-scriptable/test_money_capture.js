'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'YOS Money Capture.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const core = source.split('async function runScriptable(){', 1)[0];
const sandbox = { module:{exports:{}}, exports:{}, Intl, Date, Math, Number, String, RegExp, console };
vm.createContext(sandbox);
vm.runInContext(`${core}\nmodule.exports={parseMoneyInput,isDuplicate,toTransaction,summary};`, sandbox, {filename:'YOS Money Capture.js'});
const m = sandbox.module.exports;
const NOW = new Date('2026-09-17T00:38:00Z'); // 09:38 JST
const p = text => m.parseMoneyInput(text,NOW);

let x=p('コンビニ850円');
assert.equal(x.amount,850); assert.equal(x.type,'expense'); assert.equal(x.category,''); assert.equal(x.merchant,''); assert.equal(x.date,'2026-09-17'); assert(x.can_save);

x=p('ENEOSで3000円');
assert.equal(x.amount,3000); assert.equal(x.type,'expense'); assert.equal(x.category,'交通・車'); assert.equal(x.merchant,'ENEOS');

x=p('母から1万円もらった');
assert.equal(x.amount,10000); assert.equal(x.type,'income'); assert.equal(x.merchant,'母');

x=p('今日5000円入った');
assert.equal(x.amount,5000); assert.equal(x.type,'income'); assert.equal(x.date,'2026-09-17');

x=p('昨日 家賃5万円');
assert.equal(x.amount,50000); assert.equal(x.type,'expense'); assert.equal(x.category,'住居・光熱'); assert.equal(x.date,'2026-09-16');

x=p('9/15 コーヒー180円');
assert.equal(x.amount,180); assert.equal(x.category,'食費'); assert.equal(x.date,'2026-09-15');

x=p('5000円');
assert.equal(x.amount,5000); assert.equal(x.type,null); assert.equal(x.can_save,false); assert(x.missing.includes('type'));

x=p('コンビニで買い物');
assert.equal(x.can_save,false); assert(x.missing.includes('amount'));

const candidate=p('コンビニ850円');
const tx=m.toTransaction(candidate,'shortcut',NOW);
assert.equal(tx.raw_input,'コンビニ850円'); assert.equal(tx.source,'shortcut'); assert.equal(tx.currency,'JPY');
assert(m.isDuplicate([tx],candidate,NOW.toISOString()));
assert(!m.isDuplicate([tx],candidate,new Date(NOW.getTime()+121000).toISOString()));

const tx2=m.toTransaction(p('今日5000円入った'),'shortcut',NOW);
const s=m.summary([tx,tx2],NOW);
assert.deepEqual(JSON.parse(JSON.stringify(s)),{todayExpense:850,monthExpense:850,monthIncome:5000,balance:4150});

console.log('PASS 10/10');
