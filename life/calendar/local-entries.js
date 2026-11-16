/* YOS Calendar: opt-in, device-local entries. Never impersonate Notion.
 * No login, network request, shared DB, or assumed cloud synchronization.
 */
(function(root){
 'use strict';
 const KEY='YOS_CALENDAR_LOCAL_ENTRIES_V1',BACKUP=KEY+'_BACKUP',SCHEMA='yos-calendar-local-v1',MAX=250;
 const TYPES=new Set(['schedule','task','habit']);
 const AREAS=new Set(['Money','Work','Health','Self','Life','other']);
 const clean=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):'';
 const dateOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const timeOk=v=>!v||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 const idOk=v=>typeof v==='string'&&/^local-[a-f0-9-]{36}$/.test(v);
 function check(r){
  return r&&typeof r==='object'&&idOk(r.id)&&dateOk(r.date)&&TYPES.has(r.type)&&AREAS.has(r.area)&&
   typeof r.title==='string'&&r.title===clean(r.title,100)&&r.title.length>0&&
   typeof r.clock==='string'&&timeOk(r.clock)&&typeof r.done==='boolean'&&
   Number.isFinite(r.createdAt)&&r.createdAt>0;
 }
 function read(storage){
  const raw=storage.getItem(KEY);
  if(raw===null)return {ok:true,records:[]};
  if(raw.length>150000)return {ok:false,reason:'保存済みデータが大きすぎます。元のデータは保持しました'};
  let obj;try{obj=JSON.parse(raw)}catch{return {ok:false,reason:'保存済みデータを確認できません。元のデータは保持しました'}}
  if(obj?.schema!==SCHEMA||!Array.isArray(obj.records)||obj.records.length>MAX||!obj.records.every(check)||
     new Set(obj.records.map(x=>x.id)).size!==obj.records.length)return {ok:false,reason:'保存済みデータが不完全です。上書きしません'};
  return {ok:true,records:obj.records};
 }
 function write(storage,records){
  const current=storage.getItem(KEY);
  const next=JSON.stringify({schema:SCHEMA,records});
  if(next.length>150000)return {ok:false,reason:'保存できる最大量を超えました'};
  try{
   if(current!==null){storage.setItem(BACKUP,current);if(storage.getItem(BACKUP)!==current)throw Error('backup')}
   storage.setItem(KEY,next);if(storage.getItem(KEY)!==next)throw Error('readback');
   return {ok:true};
  }catch{
   try{if(current===null)storage.removeItem(KEY);else storage.setItem(KEY,current)}catch{}
   return {ok:false,reason:'端末保存を確認できません。元の記録は保持しました'};
  }
 }
 function randomId(){
  if(typeof root.crypto?.randomUUID==='function')return 'local-'+root.crypto.randomUUID();
  if(typeof root.crypto?.getRandomValues!=='function')return null;
  const b=root.crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return 'local-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
 }
 function create(storage,input){
  const existing=read(storage);if(!existing.ok)return existing;
  if(existing.records.length>=MAX)return {ok:false,reason:'端末保存の上限です'};
  const title=clean(input?.title,100),date=clean(input?.date,10),clock=clean(input?.clock||'',5);
  const type=input?.type,area=input?.area||'other';
  if(!title||!dateOk(date)||!TYPES.has(type)||!AREAS.has(area)||!timeOk(clock))return {ok:false,reason:'種類・日付・タイトル・時刻を確認してください'};
  const id=randomId();if(!id)return {ok:false,reason:'安全な識別子を作れません。この環境では追加できません'};
  const entry={id,date,title,type,area,clock,done:false,createdAt:Date.now()};
  const result=write(storage,[...existing.records,entry]);
  return result.ok?{ok:true,entry}:result;
 }
 function complete(storage,id){
  const existing=read(storage);if(!existing.ok)return existing;
  const record=existing.records.find(x=>x.id===id);
  if(!record||!['task','habit'].includes(record.type))return {ok:false,reason:'完了できる端末内項目がありません'};
  if(record.done)return {ok:true,alreadyDone:true};
  const result=write(storage,existing.records.map(x=>x.id===id?{...x,done:true}:x));
  return result.ok?{ok:true}:result;
 }
 function remove(storage,id){
  const existing=read(storage);if(!existing.ok)return existing;
  if(!existing.records.some(x=>x.id===id))return {ok:false,reason:'対象が見つかりません'};
  return write(storage,existing.records.filter(x=>x.id!==id));
 }
 function items(storage){
  const value=read(storage);if(!value.ok)return {...value,items:[]};
  return {ok:true,items:value.records.map(x=>({
   id:'local:entry:'+x.id,sourceId:x.id,date:x.date,title:x.title,type:x.type,area:x.area,clock:x.clock,
   subtitle:(x.clock?x.clock+' · ':'')+(x.done?'端末内で完了':'端末内の記録 · Notion未同期'),
   done:x.done,source:'このiPhoneのみ（Notion未同期）',sourceKind:'local'
  }))};
 }
 root.YOS_CALENDAR_LOCAL={KEY,read,create,complete,remove,items};
})(typeof window!=='undefined'?window:globalThis);
