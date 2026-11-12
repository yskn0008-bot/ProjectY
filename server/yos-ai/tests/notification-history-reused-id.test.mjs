import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationInternals} from '../dist/intake/notification-handler.js';

const row=(id,body)=>({id,type:'paragraph',paragraph:{rich_text:[{plain_text:body}]}});
const note=(when,message)=>when+' · Clarity Notification · notification:deadbeef · information\n'+message+'\n---';

test('reused capture IDs do not erase distinct chronological notifications',()=>{
  const rows=[
    row('11111111-2222-3333-4444-555555555555',note('2026-11-06T01:00:00.000Z','最初の通知')),
    row('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',note('2026-11-06T02:00:00.000Z','次の通知')),
    row('99999999-8888-7777-6666-555555555555',note('2026-11-06T02:00:00.000Z','次の通知'))
  ];
  const events=notificationInternals.parseRows(rows);
  assert.equal(events.length,2,'exact duplicate is deduped, different time remains');
  assert.equal(events[0].text,'次の通知');
  assert.equal(events[1].text,'最初の通知');
  assert.equal(events[0].id,events[1].id);
  assert.notEqual(events[0].historyKey,events[1].historyKey);
  assert.match(events[0].historyKey,/^[0-9a-f]{32}$/);
});

test('row-specific statuses do not apply to another capture with the same original ID',()=>{
  const rows=[
    row('11111111-2222-3333-4444-555555555555',note('2026-11-06T01:00:00.000Z','最初の通知')),
    row('11111111-2222-4444-4444-555555555555','2026-11-06T01:01:00.000Z · Notification AI Result · notification:deadbeef · YOS_ALERT\n安全に確認'),
    row('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',note('2026-11-06T02:00:00.000Z','次の通知')),
    row('dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb','2026-11-06T02:01:00.000Z · Notification State · notification:11111111222233334444555555555555 · pending')
  ];
  const events=notificationInternals.parseRows(rows);
  assert.equal(events.length,2);
  assert.equal(events[0].status,'unread');
  assert.equal(events[1].status,'pending');
  assert.equal(events[1].aiDecision,'YOS_ALERT');
  assert.equal(events[0].aiDecision,undefined);
});
