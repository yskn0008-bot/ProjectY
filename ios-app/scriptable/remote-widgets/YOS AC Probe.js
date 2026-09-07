// YOS AC Probe — read-only diagnostic for SHARP A988JB via Tapo H110.
// Reads only IR profile/status metadata. No account credentials are copied.

const tapo = importModule('YOS Tapo H110 Core');
const remote = tapo.findRemote(r => String(r.model || '').toUpperCase() === 'AC' || /エアコン|air.?con/i.test(String(r.nickname || '')));
if (!remote) throw new Error('エアコン リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。');

const client = await tapo.client();

function collectObjects(value, path='root', out=[]){
  if (Array.isArray(value)) {
    value.forEach((v,i)=>collectObjects(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    out.push({path, value});
    for (const [k,v] of Object.entries(value)) collectObjects(v, `${path}.${k}`, out);
  }
  return out;
}

function safePrimitive(v){
  return v === null || ['string','number','boolean'].includes(typeof v);
}

function sanitizeObject(obj){
  const out={};
  const exact = new Set([
    'ac_status','power_on','power','on','mode','ac_mode','temp','current_temp',
    'fan_speed','wind_speed','swing','wind_direct','vertical_swing','horizontal_swing',
    'model','brand','category','nickname','remote_id','state'
  ]);
  for (const [k,v] of Object.entries(obj||{})) {
    if (!exact.has(k) && !/(^|_)(ac|power|mode|temp|fan|wind|swing|brand|model|status)($|_)/i.test(k)) continue;
    if (safePrimitive(v)) out[k]=v;
    else if (Array.isArray(v) && v.length <= 40 && v.every(safePrimitive)) out[k]=v;
  }
  return out;
}

function score(o){
  const keys=Object.keys(o);
  let s=0;
  for(const k of ['ac_status','power_on','on','mode','ac_mode','temp','current_temp','fan_speed','wind_speed','swing','wind_direct']) if(keys.includes(k)) s+=3;
  if(String(o.model||'').toUpperCase()==='AC') s+=5;
  return s;
}

let raw;
try {
  raw = await client.query({
    method:'control_child',
    params:{device_id:remote.device_id,requestData:{method:'get_device_info',params:null}}
  });
} catch (e) {
  const a=new Alert();
  a.title='エアコン診断';
  a.message='H110からエアコン状態を取得できませんでした。\n\n'+(e && e.message ? e.message : String(e));
  a.addAction('OK');
  await a.presentAlert();
  Script.complete();
  return;
}

const candidates=collectObjects(raw)
  .map(x=>({path:x.path, data:sanitizeObject(x.value)}))
  .filter(x=>Object.keys(x.data).length)
  .sort((a,b)=>score(b.data)-score(a.data))
  .slice(0,12);

const result={
  diagnostic:'YOS AC Probe',
  remote:{nickname:remote.nickname||'',model:remote.model||'',device_id_tail:String(remote.device_id||'').slice(-6)},
  candidates
};

const text=JSON.stringify(result,null,2);
Pasteboard.copyString(text);

const a=new Alert();
a.title='エアコン診断 完了';
a.message=`エアコンの状態データをコピーしました。\n\n候補: ${candidates.length}件\nこのままChatGPTへ貼り付けてください。\n\nアカウント情報・パスワードは含みません。`;
a.addAction('OK');
await a.presentAlert();
Script.complete();
