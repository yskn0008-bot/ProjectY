// Deployment marker: 2026-09-24 silent Money Alert transport.
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/u;
const ORIGIN='https://yskn0008-bot.github.io';
const SHADOW_TTL=35*24*60*60;
const MAX_BODY_BYTES=16384;

const clean=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const finite=value=>value===null||value===undefined||String(value).trim()===''?null:(Number.isFinite(Number(value))?Number(value):null);
const bool=value=>value===true;

function jsonHeaders(origin=''){
  const headers={
    'Cache-Control':'no-store',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff'
  };
  if(origin===ORIGIN)headers['Access-Control-Allow-Origin']=ORIGIN;
  return headers;
}
function textHeaders(){
  return {
    'Cache-Control':'no-store',
    'Content-Type':'text/plain; charset=utf-8',
    'X-Content-Type-Options':'nosniff'
  };
}
function corsHeaders(){
  return {
    'Access-Control-Allow-Origin':ORIGIN,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, X-YOS-Money-Token',
    'Access-Control-Max-Age':'86400',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  };
}
async function sha256Base64Url(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  let binary='';
  for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=+$/gu,'');
}
function tx(value){
  if(!value||typeof value!=='object')return null;
  const date=clean(value.date,10);
  const label=clean(value.label,80);
  const amount=finite(value.amount);
  if(!date&&!label&&amount===null)return null;
  return {date,label,amount};
}
function sanitizeSnapshot(value){
  const input=value&&typeof value==='object'?value:{};
  const upcoming=Array.isArray(input.upcoming_payments)?input.upcoming_payments.slice(0,5).map(tx).filter(Boolean):[];
  return {
    schema:'yos-money-shadow-v1',
    source:'yos-money-v2',
    updated_at:clean(input.updated_at,40)||new Date().toISOString(),
    privacy:bool(input.privacy),
    balance:finite(input.balance),
    today_usable:finite(input.today_usable),
    spent_today:finite(input.spent_today),
    next_payment:tx(input.next_payment),
    next_income:tx(input.next_income),
    upcoming_payments:upcoming,
    projected_after_next_payment:finite(input.projected_after_next_payment),
    shortage_after_next_payment:bool(input.shortage_after_next_payment),
    shortfall_after_next_payment:finite(input.shortfall_after_next_payment),
    shortage_possible:bool(input.shortage_possible),
    shortfall:finite(input.shortfall)
  };
}
function hasAlert(snapshot){
  const budget=finite(snapshot.today_usable),spent=finite(snapshot.spent_today);
  return snapshot.shortage_possible===true||(budget!==null&&spent!==null&&spent>budget);
}
function alertSignature(snapshot){
  const budget=finite(snapshot.today_usable),spent=finite(snapshot.spent_today);
  const over=budget!==null&&spent!==null&&spent>budget?spent-budget:null;
  const p=snapshot.next_payment;
  const i=snapshot.next_income;
  return JSON.stringify({
    shortage:snapshot.shortage_possible===true,
    shortfall:finite(snapshot.shortfall),
    over,
    payment:p?[p.date,p.label,finite(p.amount)]:null,
    income:i?[i.date,i.label,finite(i.amount)]:null
  });
}
const yen=value=>finite(value)===null?'':Math.round(Number(value)).toLocaleString('ja-JP')+'円';
const md=value=>{
  const v=clean(value,10);
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(v))return v;
  const parts=v.split('-').map(Number);
  return parts[1]+'/'+parts[2];
};
function alertText(snapshot){
  const lines=['【Money 注意】'];
  if(snapshot.shortage_possible===true){
    const p=snapshot.next_payment;
    lines.push(p?'次の支払い：'+md(p.date)+' '+p.label+(p.amount!==null?' '+yen(p.amount):''):'近日中に資金不足の可能性');
    if(snapshot.shortfall!==null)lines.push('不足見込み：'+yen(snapshot.shortfall));
  }
  const budget=finite(snapshot.today_usable),spent=finite(snapshot.spent_today);
  if(budget!==null&&spent!==null&&spent>budget)lines.push('今日使える金額を超過：'+yen(spent-budget));
  const i=snapshot.next_income;
  if(i)lines.push('次の入金：'+md(i.date)+' '+i.label+(i.amount!==null?' '+yen(i.amount):''));
  lines.push('必要な対応：支払い前に資金準備または支出調整を確認');
  return lines.join('\n');
}
function tokenFrom(request){
  const token=clean(request.headers.get('x-yos-money-token'),80);
  return TOKEN_RE.test(token)?token:'';
}
function storage(environment,fetchImpl){
  const url=clean(environment.UPSTASH_REDIS_REST_URL,500).replace(/\/$/u,'');
  const token=clean(environment.UPSTASH_REDIS_REST_TOKEN,1000);
  if(!url.startsWith('https://')||!token)throw new Error('storage unavailable');
  return async args=>{
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(args)
    });
    if(!response.ok)throw new Error('storage unavailable');
    const payload=await response.json();
    if(payload?.error||!Object.prototype.hasOwnProperty.call(payload||{},'result'))throw new Error('storage unavailable');
    return payload.result;
  };
}
async function keys(token){
  const hash=await sha256Base64Url(token);
  return {
    shadow:'yos:money-shadow:'+hash,
    delivered:'yos:money-alert-delivered:'+hash,
    initialized:'yos:money-alert-initialized:'+hash
  };
}
async function readJsonBody(request){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error('body too large');
  const parsed=JSON.parse(raw||'{}');
  return sanitizeSnapshot(parsed);
}

export function createMoneyShadowHandler({environment=process.env,fetchImpl=fetch}={}){
  return async request=>{
    const method=request.method.toUpperCase();
    const origin=clean(request.headers.get('origin'),300);
    if(method==='OPTIONS'){
      if(origin!==ORIGIN)return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
      return new Response(null,{status:204,headers:corsHeaders()});
    }
    const token=tokenFrom(request);
    if(!token)return Response.json({error:'unauthorized'},{status:401,headers:jsonHeaders(origin)});
    let command;
    try{command=storage(environment,fetchImpl)}catch{return Response.json({error:'unavailable'},{status:503,headers:jsonHeaders(origin)})}
    const k=await keys(token);

    if(method==='POST'){
      if(origin!==ORIGIN)return Response.json({error:'forbidden'},{status:403,headers:jsonHeaders(origin)});
      let snapshot;
      try{snapshot=await readJsonBody(request)}catch{return Response.json({error:'invalid_body'},{status:400,headers:jsonHeaders(origin)})}
      try{
        await command(['SETEX',k.shadow,SHADOW_TTL,JSON.stringify(snapshot)]);
        if(!hasAlert(snapshot)){
          await command(['DEL',k.delivered]);
          await command(['SET',k.initialized,'1','EX',SHADOW_TTL]);
        }else{
          const claimed=await command(['SET',k.initialized,'1','NX','EX',SHADOW_TTL]);
          if(claimed==='OK')await command(['SETEX',k.delivered,SHADOW_TTL,alertSignature(snapshot)]);
        }
        return Response.json({ok:true},{status:200,headers:jsonHeaders(origin)});
      }catch{
        return Response.json({error:'unavailable'},{status:503,headers:jsonHeaders(origin)});
      }
    }

    if(method==='GET'){
      const mode=new URL(request.url).searchParams.get('mode');
      if(mode!=='money-alert')return Response.json({error:'not_found'},{status:404,headers:jsonHeaders(origin)});
      try{
        const raw=await command(['GET',k.shadow]);
        if(typeof raw!=='string'||!raw)return new Response(null,{status:204,headers:textHeaders()});
        const snapshot=sanitizeSnapshot(JSON.parse(raw));
        if(!hasAlert(snapshot)){
          await command(['DEL',k.delivered]);
          return new Response(null,{status:204,headers:textHeaders()});
        }
        const signature=alertSignature(snapshot);
        const delivered=await command(['GET',k.delivered]);
        if(delivered===signature)return new Response(null,{status:204,headers:textHeaders()});
        await command(['SETEX',k.delivered,SHADOW_TTL,signature]);
        return new Response(alertText(snapshot),{status:200,headers:textHeaders()});
      }catch{
        return Response.json({error:'unavailable'},{status:503,headers:jsonHeaders(origin)});
      }
    }
    return Response.json({error:'method_not_allowed'},{status:405,headers:{...jsonHeaders(origin),Allow:'GET, POST, OPTIONS'}});
  };
}

const handler=createMoneyShadowHandler();
export default {fetch(request){return handler(request)}};
