// Run: node --test widgets/tests/yos_money_widget.test.cjs
// Contract tests for the existing Scriptable YOS Dashboard's MONEY mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../YOS_DASHBOARD_WIDGET_v1.js"), "utf8");
const start = source.indexOf("// YOS Money widget:");
const end = source.indexOf('if (PARAM === "MONEY" && !ACTION)');
assert.ok(start >= 0 && end > start, "MONEY mode must exist");
const ctx = {yen:n=>"¥"+Math.round(n).toLocaleString("ja-JP")};
vm.createContext(ctx);
vm.runInContext(source.slice(start, end)+"\nthis.logic={mwAnalyze,mwPayoff};",ctx);
const {mwAnalyze,mwPayoff} = ctx.logic;
const day="2026-10-15";
const copy=x=>structuredClone(x);
const fixture=()=>({
  schema:"yos-money-local-v1",
  balance:{amount:100000,asOf:day,source:"manual"},
  transactions:[{id:"received",date:"2026-10-13",type:"income",label:"家賃収入",amount:160485,status:"done"}],
  recurring:[
    {id:"rent-in",type:"income",label:"家賃収入",day:10,amount:160485,enabled:true},
    {id:"rent",type:"expense",label:"家賃",day:27,amount:68500,enabled:true}
  ],
  debts:[{balance:100000,apr:0,plannedPayment:10000}],
  goals:[{name:"生活防衛費",target:600000,current:100000,monthlyContribution:50000}]
});
test("does not count recorded income twice; projects actual remaining expenses",()=>{
  const r=mwAnalyze(fixture(),day);
  assert.equal(r.projected,31500);
  assert.equal(r.daily,Math.floor(31500/17));
  assert.equal(r.debtTotal,100000);
  assert.ok(r.debtDays>0 && r.goalDays>0);
});
test("overdue unprocessed bills reduce monthly balance",()=>{
  const d=fixture();d.transactions.push({date:"2026-10-02",type:"expense",label:"返済",amount:20000,status:"planned"});
  const r=mwAnalyze(d,day);
  assert.equal(r.projected,11500);
});
test("an exact same-month planned row overrides recurring even when date differs",()=>{
  const d=fixture();d.transactions.push({date:"2026-10-28",type:"expense",label:"家賃",amount:70000,status:"planned"});
  assert.equal(mwAnalyze(d,day).projected,30000);
});
test("stale or missing balance never becomes spendable budget",()=>{
  const d=fixture();d.balance.asOf="2026-10-01";
  assert.equal(mwAnalyze(d,day).projected,null);
  assert.equal(mwAnalyze(d,day).daily,null);
  d.balance.amount=null;
  assert.equal(mwAnalyze(d,day).balance,null);
});
test("unknown utilities block a false positive surplus",()=>{
  const d=fixture();d.recurring.push({type:"expense",label:"ガス",day:15,amount:null,variableAmount:true});
  const r=mwAnalyze(d,day);
  assert.equal(r.projected,null);
  assert.equal(r.daily,null);
  assert.equal(r.unknown,1);
});
test("approximate income is not treated as guaranteed",()=>{
  const d=fixture();d.transactions=[];d.recurring[0].amountApproximate=true;
  const r=mwAnalyze(d,day);
  assert.equal(r.projected,null);
});
test("unregistered debt is unknown, not zero and not paid off",()=>{
  const d=fixture();d.debts=[];
  const r=mwAnalyze(d,day);
  assert.equal(r.debtTotal,null);
  assert.equal(r.debtDays,null);
});
test("non-amortizing debt does not invent a payoff date",()=>{
  assert.equal(mwPayoff(100000,100,24),null);
  const d=fixture();d.debts=[{balance:100000,apr:24,plannedPayment:100}];
  assert.equal(mwAnalyze(d,day).debtDays,null);
});
test("without monthly savings, no goal arrival date is fabricated",()=>{
  const d=fixture();delete d.goals[0].monthlyContribution;
  assert.equal(mwAnalyze(d,day).goalDays,null);
});
test("income cannot be spent before it arrives",()=>{
  const d=fixture();d.balance.amount=10000;d.recurring=[];
  d.transactions=[
    {date:"2026-10-18",type:"expense",label:"支払",amount:15000,status:"planned"},
    {date:"2026-10-20",type:"income",label:"入金",amount:200000,status:"planned"},
    {date:"2026-10-30",type:"expense",label:"家賃",amount:70000,status:"planned"}
  ];
  const r=mwAnalyze(d,day);
  assert.equal(r.projected,125000);
  assert.equal(r.daily,0);
  assert.equal(r.risk,"2026-10-18");
});
test("holiday-adjusted recurring date must not be called exact",()=>{
  const d=fixture();d.transactions=[];d.recurring[0].businessDayRule="next_jp_business_day";
  assert.equal(mwAnalyze(d,day).projected,null);
});
