import test from 'node:test';
import assert from 'node:assert/strict';
import {previewWidgetProactiveAction} from './proactive-widget-preview.mjs';

test('reads existing feed without mutating selected Focus task', () => {
  const feed={task:{order:1,title:'Current Focus'},tasks:[
    {order:1,title:'Current Focus',due:'2026-10-26'},
    {order:2,title:'Prepare',due:'2026-10-21'}]};
  const before=JSON.stringify(feed);
  const preview=previewWidgetProactiveAction(feed,{today:'2026-10-20'});
  assert.equal(preview.title,'Prepare');
  assert.equal(preview.currentFocusTitle,'Current Focus');
  assert.equal(preview.previewOnly,true);
  assert.equal(preview.requiresReview,true);
  assert.equal(JSON.stringify(feed),before);
});
test('does not invent candidates when feed lacks deadlines',()=>{
  assert.equal(previewWidgetProactiveAction({task:null,tasks:[{order:1,title:'No due'}]},{today:'2026-10-20'}),null);
});
