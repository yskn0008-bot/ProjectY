/* Pure daily recurrence projection. Receipts live in existing Notion Life Events. */
(function(root){
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function occurs(e,day){
  if(!valid(day)||!valid(e.date)||day<e.date)return false;
  if(e.done)return day===e.date;
  const d=(Date.parse(day)-Date.parse(e.date))/86400000;
  return e.habitCycle==='毎日'||e.habitCycle==='毎週'&&d%7===0||e.habitCycle==='毎月'&&day.slice(8)===e.date.slice(8)||day===e.date;
 }
 function forDay(items,day){
  const templates=items.filter(e=>e.type==='habit'&&e.habitCycle&&/^notion-[a-f0-9]{32}$/.test(e.sourceId||''));
  const ids=new Set(templates.map(e=>e.sourceId.slice(7)));
  const result=items.filter(e=>e.date===day&&!templates.includes(e)&&!(e.habitTaskId&&ids.has(e.habitTaskId)));
  for(const e of templates){const receipt=items.find(r=>r.habitTaskId===e.sourceId.slice(7)&&r.date===day&&r.done===true);
   if(occurs(e,day)||receipt)result.push({...e,date:day,done:!!receipt||(e.done&&e.date===day),habitReceiptId:receipt?.sourceId||'',subtitle:receipt?'実施済み（本人記録）':e.subtitle});
  }
  return result;
 }
 root.YOS_CALENDAR_HABITS={forDay,occurs};
})(typeof window!=='undefined'?window:globalThis);
