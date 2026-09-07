// YOS Light Hold Probe — read-only diagnostic for Panasonic HK9494 brightness IR data.
// No credentials or settings are copied. Only BRIGHTNESS+/- key metadata is placed on the clipboard.

const tapo = importModule('YOS Tapo H110 Core');
const remote = tapo.findRemote(r => /ライト|light/i.test(String(r.nickname||'')) || String(r.model||'').toLowerCase()==='light');
if(!remote) throw new Error('ライト リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。');

const client = await tapo.client();

function collectNamed(value, out=[]){
  if(Array.isArray(value)){
    for(const v of value) collectNamed(v,out);
  }else if(value && typeof value === 'object'){
    if(typeof value.name === 'string') out.push(value);
    for(const v of Object.values(value)) collectNamed(v,out);
  }
  return out;
}

async function ask(params, batched=false){
  const childRequest = batched
    ? {method:'multipleRequest',params:{requests:[{method:'getKeyListInfo',params}]}}
    : {method:'getKeyListInfo',params};
  return client.query({
    method:'control_child',
    params:{device_id:remote.device_id,requestData:childRequest}
  });
}

let raw=null;
let lastError=null;
const attempts=[
  [{start_index:0,need_pulse:true,sum:50},false],
  [{start_index:0,need_pulse:true},false],
  [{start_index:0,need_pulse:true,sum:50},true],
  [{start_index:0,need_pulse:true},true]
];
for(const [params,batched] of attempts){
  try{
    const r=await ask(params,batched);
    const named=collectNamed(r,[]);
    if(named.some(x=>x.name==='BRIGHTNESS+') || named.some(x=>x.name==='BRIGHTNESS-')){ raw=r; break; }
  }catch(e){ lastError=e; }
}

if(!raw){
  const a=new Alert();
  a.title='長押し診断';
  a.message='明暗キーの生データを取得できませんでした。'+(lastError?'\n\n'+(lastError.message||String(lastError)):'');
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
  return;
}

const named=collectNamed(raw,[]);
const wanted=[];
const seen=new Set();
for(const x of named){
  if(x.name!=='BRIGHTNESS+' && x.name!=='BRIGHTNESS-') continue;
  const sig=String(x.name)+'|'+String(x.id??'')+'|'+String(x.pulse??'');
  if(seen.has(sig)) continue;
  seen.add(sig);
  wanted.push({
    name:x.name,
    id:x.id ?? null,
    display_name:x.display_name ?? null,
    pwm:x.pwm ?? null,
    pulse:x.pulse ?? null,
    pulse_length:typeof x.pulse==='string'?x.pulse.length:null,
    type:x.type ?? null,
    order:x.order ?? null
  });
}

const result={
  diagnostic:'YOS Light Hold Probe',
  remote:{nickname:remote.nickname||'',model:remote.model||'',device_id_tail:String(remote.device_id||'').slice(-6)},
  keys:wanted
};
const text=JSON.stringify(result,null,2);
Pasteboard.copyString(text);

const a=new Alert();
a.title='長押し診断 完了';
a.message=`BRIGHTNESS+ / - のIRデータをコピーしました。\n\nキー数: ${wanted.length}\nこのままChatGPTへ貼り付けてください。\n\nアカウント情報・パスワードは含みません。`;
a.addAction('OK');
await a.presentAlert();
Script.complete();
