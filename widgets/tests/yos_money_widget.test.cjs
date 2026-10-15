// Run: node --test widgets/tests/yos_money_widget.test.cjs
// Contract tests for the existing Scriptable YOS Dashboard's MONEY mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../YOS_DASHBOARD_WIDGET_v1.js"), "utf8");
const start = source.indexOf("// YOS Money widget:");
const end = source.indexOf('if ((PARAM === "MONEY" || PARAM === "MONEY_ASSETS" || PARAM === "MONEY_FP") && !ACTION)');
assert.ok(start >= 0 && end > start, "MONEY mode must exist");
const ctx = {yen:n=>"¥"+Math.round(n).toLocaleString("ja-JP")};
vm.createContext(ctx);
vm.runInContext(source.slice(start, end)+"\nthis.logic={mwAnalyze,mwComprehensive,mwPayoff};",ctx);
const {mwAnalyze,mwComprehensive,mwPayoff} = ctx.logic;
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
test("overdue unprocessed bills are not charged twice against today's balance",()=>{
  const d=fixture();d.transactions.push({date:"2026-10-02",type:"expense",label:"返済",amount:20000,status:"planned"});
  const r=mwAnalyze(d,day);
  assert.equal(r.projected,null);
  assert.equal(r.daily,null);
  assert.match(r.advice,/照合/);
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

test("a September unpaid bill is flagged overdue, not called the next bill",()=>{
  const d=fixture();
  d.transactions.push({date:"2026-09-26",type:"expense",label:"車保険",amount:7060,status:"planned"});
  const r=mwComprehensive(d,day);
  assert.equal(r.nextPay.date,"2026-10-27");
  assert.equal(r.pastPay,1);
  assert.equal(r.pastIn,0);
  assert.equal(r.remainingPayments,68500);
  assert.equal(r.projected,null);
  assert.equal(r.future[30],null);
  assert.equal(r.status,"過去予定要照合");
});
test("past unconfirmed rent receipt does not masquerade as the next income",()=>{
  const d=fixture();
  d.transactions=[{date:"2026-10-13",type:"income",label:"家賃収入",amount:160485,status:"planned"}];
  const r=mwComprehensive(d,day);
  assert.equal(r.nextIn,null);
  assert.equal(r.pastIn,1);
  assert.equal(r.overdueCount,1);
  assert.equal(r.projected,null);
});
test("only today's and later planned events appear as next",()=>{
  const d=fixture();
  d.transactions.push({date:"2026-10-19",type:"income",label:"臨時収入",amount:10000,status:"planned"});
  const r=mwComprehensive(d,day);
  assert.equal(r.nextIn.date,"2026-10-19");
  assert.equal(r.nextPay.date,"2026-10-27");
  assert.equal(r.overdueCount,0);
});
test("monthly receipt, planned bills and savings are divided across three MONEY modes",()=>{
  assert.ok(source.includes('PARAM === "MONEY_ASSETS"'));
  assert.ok(source.includes('PARAM === "MONEY_FP"'));
  assert.ok(source.includes("function mwNowWidget("));
  assert.ok(source.includes("function mwAssetsWidget("));
  assert.ok(source.includes("function mwFpWidget("));
});
test("net worth is labelled registered-only and requires populated assets and debts",()=>{
  const d=fixture();d.assets=[{name:"投資",value:25000}];
  let r=mwComprehensive(d,day);
  assert.equal(r.assetsRegistered,125000);
  assert.equal(r.netRegistered,25000);
  d.debts=[];
  assert.equal(mwComprehensive(d,day).netRegistered,null);
  d.debts=fixture().debts;
  d.assets=[];
  assert.equal(mwComprehensive(d,day).netRegistered,null);
});
test("past recurring charges without transaction reconciliation do not inflate daily budget",()=>{
  const d=fixture();
  d.recurring.push({type:"expense",label:"iCloud",day:14,amount:540,enabled:true});
  const r=mwComprehensive(d,day);
  assert.equal(r.projected,null);
  assert.equal(r.daily,null);
  assert.equal(r.recurringPastUnreconciled,1);
  assert.match(r.advice,/照合/);
});
test("unknown future utility blocks all projections, not only current month",()=>{
  const d=fixture();
  d.recurring.push({type:"expense",label:"ガス",day:15,amount:null,variableAmount:true,enabled:true});
  const r=mwComprehensive(d,day);
  assert.equal(r.future[30],null);
  assert.equal(r.future[90],null);
  assert.equal(r.future[365],null);
});
test("realistic debt burden ratio requires repayment data and recurring known income",()=>{
  const d=fixture();
  let r=mwComprehensive(d,day);
  assert.equal(r.monthlyDebtPay,10000);
  assert.equal(r.debtRatio,6);
  delete d.debts[0].plannedPayment;
  assert.equal(mwComprehensive(d,day).monthlyDebtPay,null);
  assert.equal(mwComprehensive(d,day).debtRatio,null);
});
test("long-horizon estimates are labelled as registered-plans-only",()=>{
  const d=fixture();d.assets=[{name:"投資",value:25000}];
  d.recurring.push({type:"debt",label:"返済",day:26,amount:10000,enabled:true});
  const r=mwComprehensive(d,day);
  assert.equal(r.projected,21500);
  assert.equal(r.future[30],181985);
  assert.equal(r.future[90],345955);
  assert.ok(source.includes("登録予定のみ"));
});
test("stale current balance blocks all current spending and registered net worth",()=>{
  const d=fixture();d.assets=[{name:"投資",value:25000}];d.balance.asOf="2026-10-01";
  const r=mwComprehensive(d,day);
  assert.equal(r.projected,null);
  assert.equal(r.daily,null);
  assert.equal(r.assetsRegistered,null);
  assert.equal(r.netRegistered,null);
});
test("danger day is not shown as confirmed when the projection itself is unknown",()=>{
  const d=fixture();d.recurring.push({type:"expense",label:"光熱費",day:16,amount:null,enabled:true});
  const r=mwComprehensive(d,day);
  assert.equal(r.projected,null);
  assert.equal(r.status,"返済予定要確認");
});

test("missing debt repayment schedule blocks false financial surplus",()=>{
  const d=fixture();const r=mwComprehensive(d,day);
  assert.equal(r.debtCovered,false);
  assert.equal(r.projected,null);
  assert.equal(r.daily,null);
  assert.equal(r.future[30],null);
  assert.equal(r.status,"返済予定要確認");
});
test("a recorded debt payment is not scheduled twice",()=>{
  const d=fixture();
  d.transactions.push({date:"2026-10-12",type:"debt",label:"返済",amount:10000,status:"done"});
  d.recurring.push({type:"debt",label:"返済",day:26,amount:10000,enabled:true});
  const r=mwComprehensive(d,day);
  assert.equal(r.debtCovered,true);
  assert.equal(r.projected,31500);
});
test("unregistered debt list never means debt-free",()=>{
  const d=fixture();d.debts=[];
  const r=mwComprehensive(d,day);
  assert.equal(r.debtCovered,false);
  assert.equal(r.projected,null);
});
