/* Face ID/passkey browser transport. No Notion secrets or passkey private keys. */
(function(root){
 'use strict';
 const b64=bytes=>{
  const u=bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let s='';for(let i=0;i<u.length;i+=4096)s+=String.fromCharCode(...u.slice(i,i+4096));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 };
 const decode=s=>{
  if(typeof s!=='string'||!/^[a-zA-Z0-9_-]+$/.test(s))throw Error('Invalid WebAuthn option');
  const str=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(str,c=>c.charCodeAt(0));
 };
 function registrationJSON(credential){
  if(typeof credential.toJSON==='function')return credential.toJSON();
  const r=credential.response;
  return {id:credential.id,rawId:b64(credential.rawId),type:credential.type,
    response:{clientDataJSON:b64(r.clientDataJSON),attestationObject:b64(r.attestationObject),transports:r.getTransports?.()||[]},
    clientExtensionResults:credential.getClientExtensionResults?.()||{},
    authenticatorAttachment:credential.authenticatorAttachment||undefined};
 }
 function authenticationJSON(credential){
  if(typeof credential.toJSON==='function')return credential.toJSON();
  const r=credential.response;
  return {id:credential.id,rawId:b64(credential.rawId),type:credential.type,
    response:{clientDataJSON:b64(r.clientDataJSON),authenticatorData:b64(r.authenticatorData),
      signature:b64(r.signature),userHandle:r.userHandle?b64(r.userHandle):null},
    clientExtensionResults:credential.getClientExtensionResults?.()||{},
    authenticatorAttachment:credential.authenticatorAttachment||undefined};
 }
 async function create(options){
  if(!root.PublicKeyCredential||!root.navigator?.credentials)throw Error('このブラウザはパスキーに対応していません');
  const publicKey={...options,challenge:decode(options.challenge),
    user:{...options.user,id:decode(options.user.id)},
    excludeCredentials:(options.excludeCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
  const credential=await root.navigator.credentials.create({publicKey});
  if(!credential)throw Error('パスキーの登録が中断されました');
  return registrationJSON(credential);
 }
 async function authenticate(options){
  if(!root.PublicKeyCredential||!root.navigator?.credentials)throw Error('このブラウザはパスキーに対応していません');
  const publicKey={...options,challenge:decode(options.challenge),
    allowCredentials:(options.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
  const credential=await root.navigator.credentials.get({publicKey});
  if(!credential)throw Error('Face IDの確認が中断されました');
  return authenticationJSON(credential);
 }
 root.YOS_CALENDAR_PASSKEY={create,authenticate};
})(typeof window!=='undefined'?window:globalThis);
