// Transport validation only. Never infers rename identity from a Shortcut name.
export function acceptChoice(pending,text,now=Date.now()){
 if(!pending||pending.consumed||!Number.isFinite(pending.createdAt)||now<pending.createdAt||now-pending.createdAt>600000)throw Error('選択の有効期限が切れています');
 if(typeof pending.nonce!=='string'||!/^YOS_PICK_V1:[a-zA-Z0-9-]{16,80}$/.test(pending.nonce))throw Error('選択要求が不正です');
 if(typeof text!=='string'||text.length>4096)throw Error('選択結果が不正です');
 const lines=text.trim().split(/\r?\n/),encoded=lines.slice(1).join('');
 if(lines.length<2||lines[0]!==pending.nonce||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('別の選択結果です');
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(!name.trim()||name!==name.trim()||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw Error('名前が不正です');
 pending.consumed=true;
 return {name,identity:'name-only'};
}
