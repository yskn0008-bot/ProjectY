import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, randomBytes, sign} from 'node:crypto';
import {verifyAuthenticationResponse} from '@simplewebauthn/server';

/**
 * Real WebAuthn ES256 assertions, signed with a newly generated local key.
 * No actual passkey, cloud credentials, biometric data or Notion writes.
 * Unlike the handler's state-machine tests, the verifier is not mocked.
 */
const origin='https://yskn0008-bot.github.io';
const rpID='yskn0008-bot.github.io';
const challenge=randomBytes(32).toString('base64url');
const sha=(data)=>createHash('sha256').update(data).digest();
function fixture({counter=1,flags=0x05,clientOrigin=origin,rp=rpID}={}){
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=publicKey.export({format:'jwk'});
  const x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
  assert.equal(x.length,32);assert.equal(y.length,32);
  // COSE EC2 public key: {1:2,3:-7,-1:1,-2:x,-3:y}
  const cose=Buffer.concat([Buffer.from([0xa5,0x01,0x02,0x03,0x26,0x20,0x01,0x21,0x58,0x20]),x,Buffer.from([0x22,0x58,0x20]),y]);
  const count=Buffer.alloc(4);count.writeUInt32BE(counter);
  const authData=Buffer.concat([sha(rp),Buffer.from([flags]),count]);
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:clientOrigin,crossOrigin:false}));
  const signed=Buffer.concat([authData,sha(client)]);
  const signature=sign('sha256',signed,privateKey);
  const id=randomBytes(32).toString('base64url');
  const credential={id,publicKey:new Uint8Array(cose),counter:0,transports:['internal']};
  const response={id,rawId:id,type:'public-key',clientExtensionResults:{},
    response:{clientDataJSON:client.toString('base64url'),authenticatorData:authData.toString('base64url'),signature:signature.toString('base64url'),userHandle:null}};
  const expected={response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential};
  return {expected,authData,client,signature,privateKey};
}
test('real ES256 WebAuthn signature succeeds only for correct RP and user verification',async()=>{
  const f=fixture();
  const verified=await verifyAuthenticationResponse(f.expected);
  assert.equal(verified.verified,true);
  assert.equal(verified.authenticationInfo.newCounter,1);
});
test('real ES256 WebAuthn rejects a modified signature',async()=>{
  const f=fixture();
  const signature=Buffer.from(f.signature);signature[signature.length-1]^=0x01;
  await assert.rejects(()=>verifyAuthenticationResponse({...f.expected,response:{
    ...f.expected.response,response:{...f.expected.response.response,signature:signature.toString('base64url')}
  }}));
});
test('real ES256 WebAuthn rejects a different browser Origin, relying party and missing UV',async()=>{
  const wrongOrigin=fixture({clientOrigin:'https://attacker.example'});
  await assert.rejects(()=>verifyAuthenticationResponse(wrongOrigin.expected));
  const wrongRP=fixture({rp:'attacker.example'});
  await assert.rejects(()=>verifyAuthenticationResponse(wrongRP.expected));
  const noUV=fixture({flags:0x01});
  await assert.rejects(()=>verifyAuthenticationResponse(noUV.expected));
});
test('real ES256 WebAuthn rejects stale counters and wrong challenge',async()=>{
  const f=fixture({counter:2});
  await assert.rejects(()=>verifyAuthenticationResponse({...f.expected,credential:{...f.expected.credential,counter:3}}));
  await assert.rejects(()=>verifyAuthenticationResponse({...f.expected,expectedChallenge:'another-challenge'}));
});
