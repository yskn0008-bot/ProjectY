// YOS 日記 -> existing Notion "YOS 日記". Scriptable iPhone only.
// Reuses an existing Keychain token; no credentials or user journal data in source.
const DATA_SOURCE = 'fe0e0973-d1cc-4bde-b138-1cb1da64ac68';
const TOKEN_KEY = 'YOS_NOTION_INTEGRATION_TOKEN';
const NOTION_VERSION = '2025-09-03';
const MAX_FIELD = 18000;

function plain(property) { return (property?.rich_text || property?.title || []).map(x=>x.plain_text ?? x.text?.content ?? '').join(''); }
function chunks(value) {
  const arr = Array.from(String(value||''));
  if (arr.length > MAX_FIELD) throw new Error('文字数が上限を超えています。元の入力を保護して中止しました。');
  const result=[];
  for(let n=0;n<arr.length;n+=1800)result.push({type:'text',text:{content:arr.slice(n,n+1800).join('')}});
  return result;
}
function tokyoDay() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return [m.year,m.month,m.day].join('-');
}
function safeInput() {
  let input=args.shortcutParameter;
  if(input == null || input === '') {
    const q=args.queryParameters||{};
    if(q.diary && q.question && q.answer) {
      const decode=(v)=>{const d=Data.fromBase64String(String(v));if(!d)throw new Error('日記データを読み取れません。');return d.toRawString();};
      input={date:q.date,diary:decode(q.diary),question:decode(q.question),answer:decode(q.answer)};
    } else {
      const data=Data.fromBase64String(String(q.payload||''));
      if(!data)throw new Error('日記のデータが届いていません。');
      input=data.toRawString();
    }
  }
  const item=(typeof input==='string'?JSON.parse(input):input);
  if(!item || typeof item!=='object')throw new Error('日記のデータ形式が不正です。');
  const date=String(item.date||tokyoDay());
  if(date!==tokyoDay())throw new Error('今日の日付と記録の日付が一致しません。');
  const fields={date,diary:String(item.diary||'').trim(),question:String(item.question||'').trim(),answer:String(item.answer||'').trim()};
  if(!fields.diary || !fields.question || !fields.answer)throw new Error('日記・問い・回答が揃っていません。空の記録は保存しません。');
  if(Object.values(fields).some(x=>x.length>9000))throw new Error('文章が長すぎます。分けて入力してください。');
  return fields;
}
function fingerprint(fields){
  const value=fields.date+'\n'+fields.diary+'\n'+fields.question+'\n'+fields.answer;
  let h=2166136261;
  for (const char of value) h=Math.imul(h^char.codePointAt(0),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
async function request(path, method='GET', body=undefined) {
  const r=new Request('https://api.notion.com/v1'+path);
  r.method=method;
  r.headers={Authorization:'Bearer '+Keychain.get(TOKEN_KEY),'Notion-Version':NOTION_VERSION,'Content-Type':'application/json'};
  if(body!==undefined)r.body=JSON.stringify(body);
  const response=await r.loadJSON();
  const status=r.response?.statusCode||0;
  if(status<200||status>=300)throw new Error('Notion通信に失敗 (HTTP '+status+')');
  return response;
}
function chooseEntry(pages){
  const eligible=pages.filter(p=>{
    const key=plain(p.properties?.['記録キー']);
    return /^(journal:|night:|reflection:)/.test(key) && p.properties?.['記録元']?.select?.name!=='Clarity';
  });
  const weight=p=>{const k=plain(p.properties?.['記録キー']);return k.startsWith('journal:')?0:k.startsWith('night:')?1:2;};
  eligible.sort((a,b)=>weight(a)-weight(b));
  return eligible[0]||null;
}
async function persist(item) {
  if(!Keychain.contains(TOKEN_KEY))throw new Error('既存のNotion認証がScriptableに見つかりません。');
  const marker='[YOS-JOURNAL:'+item.date+':'+fingerprint(item)+']';
  const entry='【日記】\n'+item.diary+'\n\n【今日の問い】\n'+item.question+'\n\n【本人の回答】\n'+item.answer+'\n'+marker;
  const rows=await request('/data_sources/'+DATA_SOURCE+'/query','POST',{
    filter:{property:'日付',date:{equals:item.date}},page_size:100
  });
  if(rows.has_more)throw new Error('同日の記録を完全に確認できなかったため保存しませんでした。');
  const found=chooseEntry(rows.results||[]);
  let page;
  if(found) {
    const before=plain(found.properties?.['本文']);
    const already=before.includes(marker);
    const newBody=already?before:[before,entry].filter(Boolean).join('\n\n---\n\n');
    const props={'本文':{rich_text:chunks(newBody)}};
    if(!plain(found.properties?.['今日の問い'])) props['今日の問い']={rich_text:chunks(item.question)};
    if(!plain(found.properties?.['問いへの答え'])) props['問いへの答え']={rich_text:chunks(item.answer)};
    page=already?found:await request('/pages/'+found.id,'PATCH',{properties:props});
  } else {
    page=await request('/pages','POST',{
      parent:{type:'data_source_id',data_source_id:DATA_SOURCE},
      properties:{
        '日記':{title:chunks(item.date+'｜日記')},
        '日付':{date:{start:item.date}},
        '記録キー':{rich_text:chunks('journal:'+item.date)},
        '記録元':{select:{name:'手動'}},
        '本文':{rich_text:chunks(entry)},
        '今日の問い':{rich_text:chunks(item.question)},
        '問いへの答え':{rich_text:chunks(item.answer)}
      }
    });
  }
  const verify=await request('/pages/'+page.id);
  if(!plain(verify.properties?.['本文']).includes(marker))throw new Error('Notionへの反映を読み戻せませんでした。再保存せず状態を確認してください。');
  return {url:'https://www.notion.so/'+page.id.replace(/-/g,''),mode:found?'updated':'created'};
}
async function alert(title,message) {
  const a=new Alert();a.title=title;a.message=message;a.addAction('閉じる');await a.present();
}
async function main() {
  try {
    const entry=safeInput();
    const result=await persist(entry);
    Script.setShortcutOutput('YOS 日記：保存確認 '+result.url);
    await alert('YOS 日記','Notionへの保存と読み戻しを確認しました。');
  } catch(e) {
    const msg=String(e?.message||e);
    Script.setShortcutOutput('YOS 日記：未保存 '+msg);
    await alert('YOS 日記：未保存',msg+'\n入力の控えはショートカット側のiCloudに残してあります。');
  }
  Script.complete();
}
await main();
