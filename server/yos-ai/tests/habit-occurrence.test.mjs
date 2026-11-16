import test from 'node:test';
import assert from 'node:assert/strict';
import {completeHabitOccurrence,isHabitOccurrence} from '../dist/tasks/habit-occurrence.js';
const ds='965c608632c1463d93b487a9cb69b3ad',events='30df9a732ea74ff781872b62dc8f9da4',id='a'.repeat(32),eventId='b'.repeat(32),now=new Date('2026-11-16T10:00:00Z');
const rich=s=>[{plain_text:s}],sel=name=>({select:{name}});
function mock({lost=false,noSave=false}={}){
 let created=null,writes=0,locked=false;
 const page={id,parent:{data_source_id:ds},last_edited_time:'2026-11-15T00:00:00Z',properties:{'やること':{title:rich('洗顔')},'状態':sel('次にやる'),'習慣周期':sel('毎日'),'期限':{date:{start:'2026-11-15'}},'領域':sel('Self')}};
 const redis={command:async args=>{assert.equal(args[0],'SET');assert.equal(args.at(-1),'NX');if(locked)return null;locked=true;return 'OK'}};
 const fetchImpl=async(url,init)=>{
  if(url.endsWith('/pages/'+id))return Response.json(page);
  if(url.endsWith('/query'))return Response.json({results:created?[{id:eventId}]:[],has_more:false});
  if(url.endsWith('/pages/'+eventId))return Response.json(created);
  if(url.endsWith('/pages')&&init.method==='POST'){
   writes++;const body=JSON.parse(init.body);if(!noSave)created={...body,id:eventId,parent:{data_source_id:events}};
   if(lost)throw Error('network lost after create');return Response.json({id:eventId});
  }
  throw Error('unexpected '+url);
 };
 return {page,options:{notionToken:'test',notionDataSourceId:ds,fetchImpl,redis,pageId:id,occurrenceDay:'2026-11-16',expectedEditedAt:page.last_edited_time,now},writes:()=>writes};
}
test('habit receipt is one dated existing-source record; template is unchanged; replay does not create again',async()=>{
 const x=mock(),before=JSON.stringify(x.page);
 const r=await completeHabitOccurrence(x.options);assert.equal(r.done,true);assert.equal(r.taskId,id);assert.equal(r.date,'2026-11-16');
 await completeHabitOccurrence(x.options);assert.equal(x.writes(),1);assert.equal(JSON.stringify(x.page),before);
});
test('lost successful create is recovered through receipt query without another write',async()=>{
 const x=mock({lost:true});await assert.rejects(()=>completeHabitOccurrence(x.options));
 assert.equal((await completeHabitOccurrence(x.options)).done,true);assert.equal(x.writes(),1);
});
test('unknown outcome with no receipt is held, rather than recreated after retry',async()=>{
 const x=mock({lost:true,noSave:true});await assert.rejects(()=>completeHabitOccurrence(x.options));await assert.rejects(()=>completeHabitOccurrence(x.options),/pending/);assert.equal(x.writes(),1);
});
test('parallel clicks on one day cannot write two receipts',async()=>{
 const x=mock();await Promise.allSettled([completeHabitOccurrence(x.options),completeHabitOccurrence(x.options)]);assert.equal(x.writes(),1);
});
test('wrong source, changed habit, one-off task and future day are rejected without writes',async()=>{
 for(const mutate of [x=>x.page.parent.data_source_id=events,x=>x.page.last_edited_time='new',x=>x.page.properties['習慣周期']=sel(''),x=>x.options.occurrenceDay='2026-11-17']){
  const x=mock();mutate(x);await assert.rejects(()=>completeHabitOccurrence(x.options));assert.equal(x.writes(),0);
 }
});
test('recurrence respects weekly/monthly anchors, date-only semantics, and rejects invalid/past/future days',()=>{
 assert.equal(isHabitOccurrence('毎週','2026-11-02','2026-11-16','2026-11-16'),true);
 assert.equal(isHabitOccurrence('毎週','2026-11-02','2026-11-15','2026-11-16'),false);
 assert.equal(isHabitOccurrence('毎月','2026-10-16','2026-11-16','2026-11-16'),true);
 assert.equal(isHabitOccurrence('毎月','2026-10-31','2026-11-30','2026-11-30'),false);
 assert.equal(isHabitOccurrence('毎日',null,'2026-11-16','2026-11-16'),true);
 assert.equal(isHabitOccurrence('毎日',null,'2026-11-15','2026-11-16'),false);
 assert.equal(isHabitOccurrence('毎日','2026-01-01','2026-02-30','2026-11-16'),false);
});
