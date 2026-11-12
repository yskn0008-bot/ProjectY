import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeServer} from '../cloud-run/server.mjs';

const allowed='https://yskn0008-bot.github.io';

async function withGateway(callback) {
  const before=process.env.YOS_ALLOWED_ORIGINS;
  process.env.YOS_ALLOWED_ORIGINS=allowed;
  const server=createNodeServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    await callback('http://127.0.0.1:'+address.port);
  } finally {
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    if(before===undefined) delete process.env.YOS_ALLOWED_ORIGINS;
    else process.env.YOS_ALLOWED_ORIGINS=before;
  }
}

test('Cloud Run notification gateway responds to an approved browser CORS preflight',async()=>{
  await withGateway(async base=>{
    const response=await fetch(base+'/api/yos/notification',{
      method:'OPTIONS',
      headers:{Origin:allowed,'Access-Control-Request-Method':'POST',
        'Access-Control-Request-Headers':'authorization,content-type'}
    });
    assert.equal(response.status,204);
    assert.equal(response.headers.get('access-control-allow-origin'),allowed);
    assert.match(response.headers.get('access-control-allow-headers')||'',/authorization/i);
    assert.match(response.headers.get('access-control-allow-methods')||'',/POST/);
    assert.equal(response.headers.get('x-yos-provider'),'google-cloud-run');
  });
});

test('Cloud Run notification gateway rejects unapproved browser origins',async()=>{
  await withGateway(async base=>{
    const response=await fetch(base+'/api/yos/notification',{
      method:'OPTIONS',headers:{Origin:'https://not-approved.example',
        'Access-Control-Request-Method':'POST'}
    });
    assert.equal(response.status,403);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  });
});

test('Cloud Run notification gateway refuses unrelated paths',async()=>{
  await withGateway(async base=>{
    const response=await fetch(base+'/api/yos/not-existing');
    assert.equal(response.status,404);
    assert.deepEqual(await response.json(),{error:'Route is not certified on this provider'});
  });
});
