import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createScreenshotIntakeHandler} from '../dist/intake/screenshot-handler.js';

const token = 'screenshot-testing-token-123456789';
const hash = createHash('sha256').update(token).digest('hex');
const page = '3d35ca88289581ef9dc8d5f11ff8e213';
const upload = '12345678-1234-1234-1234-123456789012';
const capture = {
  captureId: 'screenshot-12345678', capturedAt: '2026-11-12T09:00:00+09:00',
  source: 'ios-screenshot', saveLocation: 'photos', mimeType: 'image/png',
  imageBase64: 'iVBORw0KGgo='
};
function setup({failAppend = false, missingAcknowledgement = false, loseLease = false, failCreate = false, loseReservationAck = false} = {}) {
  const calls = [];
  const state = new Map();
  const redis = {async command(args) {
    if (args[0] === 'SET') {
      if (args[3] === 'NX' && state.has(args[1])) return null;
      state.set(args[1], args[2]);
      return 'OK';
    }
    if (args[0] === 'GET') return state.get(args[1]) ?? null;
    if (args[0] === 'DEL') return state.delete(args[1]) ? 1 : 0;
    if (args[0] === 'EVAL') {
      const key=args[3],owner=args[4];
      if(state.get(key)!==owner)return 0;
      if(args.length===7){
        state.set(key,args[5]);
        if(loseReservationAck&&String(args[5]).startsWith('uncertain:'))throw Error('reservation response lost');
      }else state.delete(key);
      return 1;
    }
    throw Error('Unexpected redis command');
  }};
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    if (url.endsWith('/file_uploads')) {
      if(failCreate){state.set('yos:intake:screenshot:v1:'+capture.captureId,'another-worker');throw Error('creation timed out')}
      return Response.json({id: upload});
    }
    if (url.endsWith('/send')) {
      if(loseLease)state.set('yos:intake:screenshot:v1:'+capture.captureId,'another-worker');
      return Response.json({status: 'uploaded'});
    }
    if (url.endsWith('/children')) assert.match(state.get('yos:intake:screenshot:v1:'+capture.captureId),/^uncertain:/,'durable receipt must exist before append');
    if (url.endsWith('/children')) return failAppend ? new Response('', {status: 500}) : Response.json({results: missingAcknowledgement ? [] : ['paragraph', 'image', 'divider'].map((type, i) => ({type, id: '12345678-1234-1234-1234-12345678901' + i}))});
    throw Error('Unexpected URL');
  };
  return {calls, state, handler: createScreenshotIntakeHandler({
    tokenSha256: hash, notionToken: 'notion-test-token', notionPageId: page, redis, fetchImpl
  })};
}
function request(body = capture, auth = token) {
  return new Request('https://example.test/api/yos/intake?mode=screenshot', {
    method: 'POST', headers: {Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
}
test('screenshot upload is stored in existing Notion page and repeated capture is deduped', async () => {
  const {handler, calls} = setup();
  const first = await handler(request());
  assert.equal(first.status, 201);
  assert.deepEqual((await first.json()).classification, 'pending');
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.includes(page));
  const append = JSON.parse(calls[2].init.body);
  assert.equal(append.children[1].image.file_upload.id, upload);
  const again = await handler(request());
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(calls.length, 3);
});
test('invalid auth fails without touching Notion', async () => {
  const {handler, calls} = setup();
  assert.equal((await handler(request(capture, 'incorrect-token-123456789'))).status, 401);
  assert.equal(calls.length, 0);
});
test('ambiguous Notion append fails closed to avoid duplicate uploads', async () => {
  const {handler, calls} = setup({failAppend: true});
  assert.equal((await handler(request())).status, 409);
  assert.equal((await handler(request())).status, 409);
  assert.equal(calls.filter((call) => call.url.endsWith('/children')).length, 1);
});
test('all three destinations accepted without changing clipboard', async () => {
  for (const saveLocation of ['photos', 'files', 'clipboard']) {
    const {handler} = setup();
    assert.equal((await handler(request({...capture, saveLocation}))).status, 201);
  }
});

test('successful Inbox save never claims classification completed', async () => {
  const {handler} = setup();
  const result = await handler(request());
  assert.equal(result.status, 201);
  const data = await result.json();
  assert.equal(data.inboxSaved, true);
  assert.equal(data.classification, 'pending');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
});

test('Notion HTTP success without image-block acknowledgement is not reported as saved', async () => {
  const {handler, calls} = setup({missingAcknowledgement: true});
  assert.equal((await handler(request())).status, 409);
  assert.equal((await handler(request())).status, 409);
  assert.equal(calls.filter((call) => call.url.endsWith('/children')).length, 1);
});

test('expired upload lease prevents append and preserves the newer worker receipt', async () => {
  const {handler,calls,state}=setup({loseLease:true});
  assert.equal((await handler(request())).status,409);
  assert.equal(calls.filter(c=>c.url.endsWith('/children')).length,0);
  assert.equal(state.get('yos:intake:screenshot:v1:'+capture.captureId),'another-worker');
});

test('pre-append failure cannot delete a lease owned by another worker', async () => {
  const {handler,calls,state}=setup({failCreate:true});
  assert.equal((await handler(request())).status,503);
  assert.equal(state.get('yos:intake:screenshot:v1:'+capture.captureId),'another-worker');
  assert.equal((await handler(request())).status,409);
  assert.equal(calls.length,1);
});

test('lost reservation response leaves a durable hold and never appends on retry', async () => {
  const {handler,calls,state}=setup({loseReservationAck:true});
  assert.equal((await handler(request())).status,503);
  assert.match(state.get('yos:intake:screenshot:v1:'+capture.captureId),/^uncertain:/);
  assert.equal((await handler(request())).status,409);
  assert.equal(calls.filter(c=>c.url.endsWith('/children')).length,0);
});
