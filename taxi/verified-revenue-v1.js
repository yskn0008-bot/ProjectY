'use strict';
// YOS TAXI: browser-local, explicitly confirmed cumulative report ledger.
// Does not OCR photographs, change the legacy shift ledger, or send to Notion.
(function(root){
  const KEY='yos-taxi-confirmed-reports-v1';
  const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
    new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  const isClock=s=>s===null||(typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s));
  const isHash=s=>typeof s==='string'&&/^sha256:[0-9a-f]{64}$/.test(s);
  const toYen=value=>{
    const raw=String(value??'').trim();
    if(!/^(?:\d{1,9}|\d{1,3}(?:,\d{3}){1,2})$/.test(raw))return null;
    const n=Number(raw.replaceAll(',',''));
    return Number.isSafeInteger(n)&&n>=0&&n<=99999999?n:null;
  };
  const toClockOrder=s=>{
    if(s===null)return null;
    const [h,m]=s.split(':').map(Number);
    return h*60+m+(h<8?1440:0); // business day spans the local midnight.
  };
  const valid=r=>r&&typeof r==='object'&&typeof r.id==='string'&&r.id.length>0&&
    isDay(r.businessDate)&&Number.isSafeInteger(r.amountYen)&&r.amountYen>=0&&r.amountYen<=99999999&&
    ['tax-included','tax-excluded','unconfirmed'].includes(r.taxBasis)&&
    isClock(r.reportClock)&&isHash(r.photoSha256)&&typeof r.confirmedAt==='string'&&
    Number.isFinite(Date.parse(r.confirmedAt))&&r.source==='photo-manually-verified'&&
    (r.supersedesId===null||typeof r.supersedesId==='string');
  const load=(storage=root.localStorage)=>{
    try{
      const raw=storage.getItem(KEY);
      if(raw===null)return {records:[],error:false};
      const obj=JSON.parse(raw);
      if(!obj||obj.version!==1||!Array.isArray(obj.records)||obj.records.some(x=>!valid(x)))return {records:[],error:true};
      if(new Set(obj.records.map(r=>r.id)).size!==obj.records.length)return {records:[],error:true};
      return {records:obj.records,error:false};
    }catch{return {records:[],error:true}}
  };
  const list=(storage=root.localStorage)=>{const r=load(storage);return r.error?null:r.records.map(x=>({...x}))};
  const latest=(businessDate,storage=root.localStorage)=>{
    if(!isDay(businessDate))return null;
    const r=load(storage);if(r.error)return null;
    const hits=r.records.filter(x=>x.businessDate===businessDate);
    return hits.length?{...hits[hits.length-1]}:null;
  };
  // Intentionally refuses whole-day totals from individual ride-history screens.
  const detectText=text=>{
    const s=String(text||'').replace(/\u00a0/g,' ');
    if(/営業\s*履\s*歴/.test(s)&&!/総\s*収\s*入/.test(s))return {kind:'ride-history',grossYen:null};
    const hits=[...s.matchAll(/総\s*収\s*入\s*[:：]?\s*[¥￥]?\s*(\d{1,3}(?:,\d{3}){1,2}|\d{1,8})(?!\d)/g)];
    if(hits.length!==1)return {kind:'unverified',grossYen:null};
    return {kind:'paper-total',grossYen:toYen(hits[0][1])};
  };
  function confirm(input,storage=root.localStorage,uuid=()=>root.crypto?.randomUUID?.()){
    if(!input||input.photoKind!=='paper-total'||!isDay(input.businessDate)
      ||!isClock(input.reportClock)||!isHash(input.photoSha256)
      ||!['tax-included','tax-excluded','unconfirmed'].includes(input.taxBasis)
      ||toYen(input.amountYen)===null)return {status:'invalid'};
    const current=load(storage);if(current.error)return {status:'corrupt-preserved'};
    if(current.records.some(x=>x.photoSha256===input.photoSha256))return {status:'duplicate-photo'};
    const sameDay=current.records.filter(x=>x.businessDate===input.businessDate),prev=sameDay.at(-1);
    const amount=toYen(input.amountYen);
    if(prev&&prev.amountYen===amount&&prev.taxBasis===input.taxBasis)return {status:'duplicate-total'};
    if(prev&&(!input.reportClock||!prev.reportClock)&&input.correctionOf!==prev.id)return {status:'needs-correction-confirmation'};
    if(prev&&input.reportClock&&prev.reportClock&&toClockOrder(input.reportClock)<=toClockOrder(prev.reportClock)
      &&input.correctionOf!==prev.id)return {status:'stale-report'};
    if(prev&&amount<prev.amountYen&&input.correctionOf!==prev.id)return {status:'decrease-needs-review'};
    if(input.correctionOf!==undefined&&input.correctionOf!==null
      &&(!prev||input.correctionOf!==prev.id))return {status:'stale-correction'};
    const id=uuid();if(typeof id!=='string'||!id||current.records.some(r=>r.id===id))return {status:'invalid-id'};
    const entry={id,businessDate:input.businessDate,amountYen:amount,taxBasis:input.taxBasis,
      reportClock:input.reportClock,photoSha256:input.photoSha256,
      confirmedAt:new Date().toISOString(),source:'photo-manually-verified',supersedesId:prev?.id||null};
    try{storage.setItem(KEY,JSON.stringify({version:1,records:[...current.records,entry]}))}
    catch{return {status:'storage-error'}}
    return {status:'saved',record:{...entry}};
  }
  root.YosTaxiConfirmedRevenueV1=Object.freeze({KEY,toYen,detectText,load,list,latest,confirm});
})(window);
