import {createGoogleIdentityVerifier} from '../auth/google-runtime.js';
import {IdentityGate} from '../auth/identity-gate.js';
import {loadYosRuntimeConfig, type Environment} from '../config.js';
import {allowedOrigin, bearerToken, secureJson} from '../api/shared.js';

const NOTION_SOURCE='d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc';
const NOTION_VERSION='2026-03-11';
const MAX_PAGES=5;
const MAX_ITEMS=400;
const MAX_BODY=2400;
const CATEGORY=['食品','洗濯','掃除','衛生','美容','家電','家具','その他'];
type JsonRecord=Record<string,unknown>;
type ShoppingItem={
  id:string;name:string;category:string;type:string;state:string;priority:string;
  purchased:boolean;currentPrice:number|null;referencePrice:number|null;targetPrice:number|null;
  priceSource:string;priceUpdatedAt:string|null;shop:string[];url:string|null;imageUrl:string|null;
  stock:number|null;reorderAt:number|null;updatedAt:string|null;memo:string;
};
type Fetcher=typeof fetch;
function record(v:unknown):v is JsonRecord{return v!==null&&typeof v==='object'&&!Array.isArray(v)}
function asString(v:unknown,max=240){return typeof v==='string'?v.trim().slice(0,max):''}
function num(v:unknown):number|null{return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null}
function prop(v:unknown):JsonRecord{return record(v)?v:{}}
function text(v:unknown,key:'title'|'rich_text'):string {
  const entries=prop(v)[key];
  return Array.isArray(entries)?entries.map(x=>asString(prop(x).plain_text,300)).join('').slice(0,160):'';
}
function select(v:unknown):string{return asString(prop(prop(v).select).name,64)}
function date(v:unknown):string|null{return asString(prop(prop(v).date).start,80)||null}
function number(v:unknown):number|null{return num(prop(v).number)}
function validUrl(v:unknown):string|null{
  const raw=asString(v,1800);if(!raw||raw.length>1500)return null;
  try{const u=new URL(raw);return u.protocol==='https:'?u.href:null}catch{return null}
}
function coverUrl(v:unknown):string|null{
  const c=prop(v);
  return validUrl(prop(c.file).url)||validUrl(prop(c.external).url);
}
export function parseShoppingItem(row:unknown):ShoppingItem|null{
  if(!record(row)||row.archived===true||row.in_trash===true)return null;
  const p=prop(row.properties);
  const name=text(p['商品名'],'title');
  if(!name)return null;
  const id=asString(row.id,50).replaceAll('-','').toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(id))return null;
  const sellers=prop(p['販売店']).multi_select;
  return {
    id,name,
    category:select(p['分類']),type:select(p['区分']),state:select(p['買い物状態']),priority:select(p['優先度']),
    purchased:prop(p['購入済']).checkbox===true||select(p['買い物状態'])==='購入済',
    currentPrice:number(p['現在価格']),referencePrice:number(p['参考価格']),targetPrice:number(p['目標価格']),
    priceSource:select(p['価格情報元']),priceUpdatedAt:date(p['価格更新日']),
    shop:Array.isArray(sellers)?sellers.map(s=>asString(prop(s).name,80)).filter(Boolean):[],
    url:validUrl(prop(p['商品URL']).url),
    imageUrl:coverUrl(row.cover),
    stock:number(p['在庫数']),reorderAt:number(p['補充基準']),
    updatedAt:asString(row.last_edited_time,80)||null,
    memo:text(p['メモ'],'rich_text').slice(0,180)
  };
}
async function notion(token:string,url:string,options:RequestInit,fetchImpl:Fetcher):Promise<JsonRecord>{
  const response=await fetchImpl(url,{
    ...options,headers:{Authorization:`Bearer ${token}`,'Notion-Version':NOTION_VERSION,'Content-Type':'application/json',...options.headers},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error(`Notion ${response.status}`);
  const data:unknown=await response.json();if(!record(data))throw new Error('Invalid Notion response');
  return data;
}
async function list(token:string,fetchImpl:Fetcher):Promise<ShoppingItem[]>{
  const output:ShoppingItem[]=[];const ids=new Set<string>();let cursor:string|null=null;
  for(let page=0;page<MAX_PAGES;page++){
    const data=await notion(token,`https://api.notion.com/v1/data_sources/${NOTION_SOURCE}/query`,{
      method:'POST',body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})
    },fetchImpl);
    if(!Array.isArray(data.results)||typeof data.has_more!=='boolean')throw new Error('Incomplete Notion result');
    for(const entry of data.results){
      const item=parseShoppingItem(entry);
      if(!item)continue;
      if(ids.has(item.id))throw new Error('Duplicate Notion shopping item');
      ids.add(item.id);output.push(item);if(output.length>MAX_ITEMS)throw new Error('Shopping list exceeds capacity');
    }
    if(!data.has_more)return output;
    const next=asString(data.next_cursor,200);
    if(!next||next===cursor)throw new Error('Incomplete pagination');
    cursor=next;
  }
  throw new Error('Notion pagination cap exceeded');
}
function tokyoDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function createItem(token:string,input:JsonRecord,fetchImpl:Fetcher):Promise<ShoppingItem>{
  const name=asString(input.name,120);if(!name||name.length>120)throw new Error('Item name required');
  const itemUrl=input.url==null||input.url===''?null:validUrl(input.url);
  const imageUrl=input.imageUrl==null||input.imageUrl===''?null:validUrl(input.imageUrl);
  if(input.url&&!itemUrl||input.imageUrl&&!imageUrl)throw new Error('HTTPS URL required');
  const category=CATEGORY.includes(input.category as string)?input.category as string:'その他';
  const data=await notion(token,'https://api.notion.com/v1/pages',{
    method:'POST',body:JSON.stringify({
      parent:{type:'data_source_id',data_source_id:NOTION_SOURCE},
      properties:{
        '商品名':{title:[{text:{content:name}}]},
        '区分':{select:{name:'欲しいもの'}},
        '分類':{select:{name:category}},
        '買い物状態':{select:{name:'検討中'}},
        '購入済':{checkbox:false},
        '入力日':{date:{start:tokyoDay()}},
        ...(itemUrl?{'商品URL':{url:itemUrl}}:{})
      },
      ...(imageUrl?{cover:{type:'external',external:{url:imageUrl}}}:{})
    })
  },fetchImpl);
  const item=parseShoppingItem(data);
  if(!item)throw new Error('Created item readback invalid');
  return item;
}
async function purchase(token:string,input:JsonRecord,fetchImpl:Fetcher):Promise<ShoppingItem>{
  const id=asString(input.id,50).replaceAll('-','').toLowerCase();
  const expected=asString(input.expectedEditedAt,80);
  if(!/^[a-f0-9]{32}$/.test(id)||!expected)throw new Error('Invalid item identifier/version');
  const url=`https://api.notion.com/v1/pages/${id}`;
  const read=async()=>{
    const data=await notion(token,url,{method:'GET'},fetchImpl);
    const parent=prop(data.parent);
    if(asString(parent.data_source_id).replaceAll('-','').toLowerCase()!==NOTION_SOURCE.replaceAll('-',''))throw new Error('Shopping source mismatch');
    return {data,item:parseShoppingItem(data)};
  };
  const previous=await read();
  if(!previous.item)throw new Error('Item missing');
  if(previous.item.purchased)return previous.item;
  if(previous.item.updatedAt!==expected)throw new Error('Item changed, refresh required');
  await notion(token,url,{method:'PATCH',body:JSON.stringify({properties:{
    '購入済':{checkbox:true},'買い物状態':{select:{name:'購入済'}},'購入日':{date:{start:tokyoDay()}}
  }})},fetchImpl);
  const after=await read();
  if(!after.item?.purchased)throw new Error('Purchase state not confirmed');
  return after.item;
}
export function createProductionShoppingHandler(options:{environment:Environment;fetchImpl?:Fetcher}):(request:Request)=>Promise<Response>{
  const config=loadYosRuntimeConfig(options.environment);
  const verifier=createGoogleIdentityVerifier(config.googleClientId);
  const gate=new IdentityGate({expectedAudience:config.googleClientId,allowedSubjectHash:config.allowedSubjectHash,requireEmailVerified:true});
  const token=asString(options.environment.YOS_NOTION_API_TOKEN,600);
  const fetchImpl=options.fetchImpl??fetch;
  return async request=>{
    const origin=allowedOrigin(request,{allowedOrigins:config.allowedOrigins,allowMissingOrigin:false});
    if(origin===null)return secureJson({error:'Origin not allowed'},403,null);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600',
      'Cache-Control':'no-store','Vary':'Origin'
    }});
    if(!['GET','POST','PATCH'].includes(request.method))return secureJson({error:'Method not allowed'},405,origin);
    try{const identity=await verifier.verify(bearerToken(request));await gate.authorize(identity)}
    catch{return secureJson({error:'Authentication failed'},401,origin)}
    if(!token)return secureJson({error:'Shopping source unavailable'},503,origin);
    try{
      if(request.method==='GET'){
        const items=await list(token,fetchImpl);
        return secureJson({schema:'yos-shopping-v1',source:'notion',updatedAt:new Date().toISOString(),items},200,origin,{'Cache-Control':'private, no-store'});
      }
      if(!request.headers.get('content-type')?.startsWith('application/json'))return secureJson({error:'JSON required'},415,origin);
      const raw=await request.text();if(raw.length>MAX_BODY)return secureJson({error:'Request too large'},413,origin);
      let input:unknown;try{input=JSON.parse(raw)}catch{return secureJson({error:'Invalid JSON'},400,origin)}
      if(!record(input))return secureJson({error:'Invalid request'},400,origin);
      if(request.method==='POST'){
        if(input.action!=='add')return secureJson({error:'Unknown action'},400,origin);
        const item=await createItem(token,input,fetchImpl);
        return secureJson({source:'notion',item},201,origin);
      }
      if(input.action!=='purchase')return secureJson({error:'Unknown action'},400,origin);
      const item=await purchase(token,input,fetchImpl);
      return secureJson({source:'notion',item},200,origin);
    }catch(error){
      // Never log or echo personal item names, URLs, source payloads, or credentials.
      const msg=String(error instanceof Error?error.message:error);
      if(/required|HTTPS URL|Invalid item|Unknown|Item changed|source mismatch/.test(msg))
        return secureJson({error:'Input invalid or changed; refresh before retrying'},409,origin);
      return secureJson({error:'Shopping operation not confirmed; check Notion before retrying'},503,origin);
    }
  };
}
