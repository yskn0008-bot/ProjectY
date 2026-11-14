import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../gateway.mjs';
test('diagnostic gateway does not allow anonymous commands',async()=>{
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  const health=await fetch('http://127.0.0.1:'+port+'/health');
  assert.equal(health.status,200);
  assert.equal((await health.json()).mode,'loopback');
  const command=await fetch('http://127.0.0.1:'+port+'/api/remote/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:'tv',action:'power'})});
  assert.equal(command.status,401);
  assert.equal((await command.json()).ok,false);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
