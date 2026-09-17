// YOS Money Capture — P0
// Scriptable + iCloud local-first household ledger.
// Reuses Money Capture v1 category concepts without requiring Vercel or a server.

const APP_VERSION = '2026-09-17-p0.1';
const SCHEMA_VERSION = 'yos-money-capture-p0-v1';
const TZ = 'Asia/Tokyo';
const DUPLICATE_WINDOW_MS = 120000;

const CATEGORY_RULES = [
  ['食費', 0.92, ['弁当','ご飯','ごはん','ランチ','夕食','朝食','カフェ','コーヒー','ラーメン','牛丼','マック','マクド','飲み物','飲料','食料品','スーパー']],
  ['日用品', 0.90, ['洗剤','ティッシュ','トイレットペーパー','電池','石鹸','せっけん','シャンプー','歯磨き','ダイソー','100均']],
  ['交通・車', 0.97, ['ガソリン','給油','ENEOS','エネオス','駐車','駐車場','高速','ETC','洗車','タイヤ']],
  ['住居・光熱', 0.95, ['家賃','電気代','水道代','ガス代']],
  ['通信', 0.90, ['携帯代','スマホ代','通信費','回線']],
  ['医療', 0.95, ['病院','歯医者','薬局','薬代','診察']],
  ['衣服', 0.90, ['シャツ','服','靴','パンツ','ジャケット']],
  ['娯楽', 0.88, ['映画','ゲーム','カラオケ','漫画','本']],
];

const BRAND_HINTS = ['ENEOS','エネオス','セブン','ローソン','ファミマ','ファミリーマート','ダイソー','イオン','サンエー','ユニオン','マック','マクド','スタバ','Amazon','アマゾン'];
const GENERIC_PLACE_HINTS = ['コンビニ','スーパー','ドラッグストア','100均'];
const INCOME_HINTS = ['給料','給与','入金','収入','売上','返金','振込','入った','はいった','もらった','貰った','受け取った','受取','還付'];
const EXPENSE_HINTS = ['支払','払った','はらった','買った','購入','使った','つかった'];

function pad2(v){ return String(v).padStart(2,'0'); }
function jstParts(date = new Date()){
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const out = {};
  for(const p of parts) if(p.type !== 'literal') out[p.type] = p.value;
  return {year:Number(out.year), month:Number(out.month), day:Number(out.day)};
}
function ymdFromDate(date = new Date()){
  const p = jstParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
function addDaysYmd(baseYmd, delta){
  const [y,m,d] = baseYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d + delta,12));
  return dt.toISOString().slice(0,10);
}
function validYmd(y,m,d){
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31) return null;
  const dt = new Date(Date.UTC(y,m-1,d,12));
  if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==m-1 || dt.getUTCDate()!==d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function parseDate(raw, now = new Date()){
  const today = ymdFromDate(now);
  if(/昨日/.test(raw)) return {date:addDaysYmd(today,-1), source:'explicit_yesterday'};
  if(/今日/.test(raw)) return {date:today, source:'explicit_today'};

  let m = raw.match(/(20\d{2})[\/\-年](\d{1,2})[\/\-月](\d{1,2})(?:日)?/);
  if(m){
    const d = validYmd(Number(m[1]),Number(m[2]),Number(m[3]));
    return d ? {date:d,source:'explicit_date'} : {date:null,source:'invalid_explicit_date'};
  }
  m = raw.match(/(?:^|\s|、)(\d{1,2})[\/月](\d{1,2})(?:日)?(?:\s|、|$)/);
  if(m){
    const year = jstParts(now).year;
    const d = validYmd(year,Number(m[1]),Number(m[2]));
    return d ? {date:d,source:'explicit_date'} : {date:null,source:'invalid_explicit_date'};
  }
  return {date:today, source:'capture_time_default'};
}

function parseJapaneseNumberToken(token){
  if(!token) return null;
  const t = token.replace(/[，,\s]/g,'');
  if(/^\d+(?:\.\d+)?$/.test(t)) return Math.round(Number(t));
  const units = [['万',10000],['千',1000],['百',100]];
  let rest = t;
  let total = 0;
  let matched = false;
  for(const [unit,mul] of units){
    const idx = rest.indexOf(unit);
    if(idx >= 0){
      const head = rest.slice(0,idx);
      const n = head === '' ? 1 : Number(head);
      if(!Number.isFinite(n)) return null;
      total += n * mul;
      rest = rest.slice(idx+1);
      matched = true;
    }
  }
  if(rest){
    const n = Number(rest);
    if(!Number.isFinite(n)) return null;
    total += n;
  }
  return matched ? Math.round(total) : null;
}

function extractAmount(raw){
  const patterns = [
    /[¥￥]\s*([0-9０-９][0-9０-９,，]*(?:\.\d+)?)/,
    /([0-9０-９][0-9０-９,，]*(?:\.\d+)?(?:万|千|百)?(?:[0-9０-９]+(?:千|百))?(?:[0-9０-９]+)?)\s*(?:円|えん|yen)/i,
  ];
  const normalized = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0));
  for(const re of patterns){
    const m = normalized.match(re);
    if(!m) continue;
    const amount = parseJapaneseNumberToken(m[1]);
    if(Number.isFinite(amount) && amount > 0) return {amount, match:m[0], index:m.index ?? 0};
  }
  return {amount:null,match:null,index:-1};
}

function classifyCategory(raw){
  const lower = raw.toLowerCase();
  for(const [name,confidence,words] of CATEGORY_RULES){
    const evidence = words.filter(w => lower.includes(w.toLowerCase()));
    if(evidence.length) return {category:name,confidence,evidence};
  }
  return {category:'',confidence:0,evidence:[]};
}

function inferType(raw, categoryResult){
  if(INCOME_HINTS.some(w => raw.includes(w))) return {type:'income',confidence:0.98,evidence:'income_hint'};
  if(EXPENSE_HINTS.some(w => raw.includes(w))) return {type:'expense',confidence:0.95,evidence:'expense_hint'};
  if(categoryResult.confidence >= 0.88) return {type:'expense',confidence:0.90,evidence:'expense_category'};
  if(BRAND_HINTS.some(w => raw.toLowerCase().includes(w.toLowerCase()))) return {type:'expense',confidence:0.90,evidence:'merchant_hint'};
  if(GENERIC_PLACE_HINTS.some(w => raw.includes(w))) return {type:'expense',confidence:0.88,evidence:'generic_place_hint'};
  return {type:null,confidence:0,evidence:null};
}

function extractMerchantOrParty(raw, amountInfo, type){
  if(type === 'income'){
    const party = raw.match(/(?:今日|昨日|\d{1,2}[\/月]\d{1,2}(?:日)?)?\s*([^\s、。]+?)から(?=\s*[¥￥0-9０-９])/);
    if(party && party[1] && !['口座','銀行'].includes(party[1])) return party[1].trim();
    return '';
  }

  const before = amountInfo.index >= 0 ? raw.slice(0, amountInfo.index).trim() : raw;
  for(const brand of BRAND_HINTS){
    if(before.toLowerCase().includes(brand.toLowerCase())) return brand;
  }
  const explicit = before.match(/(?:今日|昨日|\d{1,2}[\/月]\d{1,2}(?:日)?)?\s*([^、。]{1,30}?)で$/);
  if(explicit){
    const name = explicit[1].trim();
    if(name && !GENERIC_PLACE_HINTS.includes(name)) return name;
  }
  return '';
}

function parseMoneyInput(rawInput, now = new Date()){
  const raw = String(rawInput ?? '').trim();
  const amountInfo = extractAmount(raw);
  const categoryResult = classifyCategory(raw);
  const typeResult = inferType(raw, categoryResult);
  const dateResult = parseDate(raw, now);
  const merchant = extractMerchantOrParty(raw, amountInfo, typeResult.type);

  const missing = [];
  if(!amountInfo.amount) missing.push('amount');
  if(!typeResult.type) missing.push('type');
  if(!dateResult.date) missing.push('date');

  return {
    raw_input:raw,
    type:typeResult.type,
    amount:amountInfo.amount,
    category:categoryResult.confidence >= 0.88 ? categoryResult.category : '',
    category_confidence:categoryResult.confidence,
    category_evidence:categoryResult.evidence,
    date:dateResult.date,
    date_source:dateResult.source,
    merchant,
    memo:'',
    missing,
    can_save:missing.length===0,
  };
}

function normalizeRaw(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function isDuplicate(transactions, candidate, nowIso){
  const nowMs = Date.parse(nowIso);
  return transactions.some(tx => {
    if(tx.type!==candidate.type || Number(tx.amount)!==Number(candidate.amount) || tx.date!==candidate.date) return false;
    if(normalizeRaw(tx.raw_input)!==normalizeRaw(candidate.raw_input)) return false;
    const created = Date.parse(tx.created_at||'');
    return Number.isFinite(created) && Number.isFinite(nowMs) && Math.abs(nowMs-created) <= DUPLICATE_WINDOW_MS;
  });
}
function makeId(now = new Date()){
  const iso = now.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
  const rand = Math.random().toString(36).slice(2,7);
  return `mcap-${iso}-${rand}`;
}
function toTransaction(candidate, source='scriptable', now = new Date()){
  const iso = now.toISOString();
  return {
    id:makeId(now),
    type:candidate.type,
    amount:Number(candidate.amount),
    category:candidate.category || '',
    date:candidate.date,
    merchant:candidate.merchant || '',
    memo:candidate.memo || '',
    source:source || 'scriptable',
    created_at:iso,
    updated_at:iso,
    raw_input:candidate.raw_input || '',
    currency:'JPY',
    schema_version:SCHEMA_VERSION,
  };
}
function summary(transactions, now = new Date()){
  const today = ymdFromDate(now);
  const month = today.slice(0,7);
  let todayExpense=0, monthExpense=0, monthIncome=0;
  for(const tx of transactions){
    const amount = Number(tx.amount)||0;
    if(tx.type==='expense' && tx.date===today) todayExpense += amount;
    if(String(tx.date||'').startsWith(month)){
      if(tx.type==='expense') monthExpense += amount;
      if(tx.type==='income') monthIncome += amount;
    }
  }
  return {todayExpense,monthExpense,monthIncome,balance:monthIncome-monthExpense};
}
function yen(n){ return `${Number(n||0).toLocaleString('ja-JP')}円`; }
function feedback(tx){ return `${yen(tx.amount)}｜${tx.category || (tx.type==='income'?'収入':'未分類')}｜記録しました`; }

async function runScriptable(){
  const fm = FileManager.iCloud();
  const root = fm.joinPath(fm.documentsDirectory(),'YOS Money');
  const backupDir = fm.joinPath(root,'_backups');
  const dataPath = fm.joinPath(root,'transactions.json');
  const csvPath = fm.joinPath(root,'transactions.csv');
  if(!fm.fileExists(root)) fm.createDirectory(root,true);
  if(!fm.fileExists(backupDir)) fm.createDirectory(backupDir,true);

  async function ensureDownloaded(path){
    if(fm.fileExists(path)) { try { await fm.downloadFileFromiCloud(path); } catch(_){} }
  }
  async function loadStore(){
    await ensureDownloaded(dataPath);
    if(!fm.fileExists(dataPath)) return {schema_version:SCHEMA_VERSION,app_version:APP_VERSION,updated_at:null,transactions:[]};
    try{
      const parsed = JSON.parse(fm.readString(dataPath));
      return {
        schema_version:parsed.schema_version||SCHEMA_VERSION,
        app_version:APP_VERSION,
        updated_at:parsed.updated_at||null,
        transactions:Array.isArray(parsed.transactions)?parsed.transactions:[],
      };
    }catch(_){
      throw new Error('transactions.json を読み込めません。データは上書きしていません。');
    }
  }
  function csvEscape(v){
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }
  function writeCsv(txs){
    const header = ['id','type','amount','category','date','merchant','memo','source','created_at','updated_at','raw_input'];
    const lines = [header.join(',')];
    for(const tx of txs) lines.push(header.map(k=>csvEscape(tx[k])).join(','));
    fm.writeString(csvPath, lines.join('\n'));
  }
  function pruneBackups(){
    try{
      const files = fm.listContents(backupDir).filter(x=>x.endsWith('.json')).sort();
      while(files.length>14){ fm.remove(fm.joinPath(backupDir,files.shift())); }
    }catch(_){}
  }
  async function saveStore(store){
    const now = new Date();
    const next = {...store,schema_version:SCHEMA_VERSION,app_version:APP_VERSION,updated_at:now.toISOString()};
    if(fm.fileExists(dataPath)){
      await ensureDownloaded(dataPath);
      const stamp = now.toISOString().replace(/[:.]/g,'-');
      fm.copy(dataPath,fm.joinPath(backupDir,`${stamp}.json`));
    }
    fm.writeString(dataPath,JSON.stringify(next,null,2));
    writeCsv(next.transactions);
    pruneBackups();
    return next;
  }

  function inputEnvelope(){
    const qp = (typeof args !== 'undefined' && args.queryParameters) ? args.queryParameters : {};
    const sp = (typeof args !== 'undefined') ? args.shortcutParameter : null;
    const plain = (typeof args !== 'undefined' && Array.isArray(args.plainTexts) && args.plainTexts.length) ? String(args.plainTexts[0] || '').trim() : '';
    if(sp && typeof sp === 'object' && !Array.isArray(sp)) return {text:String(sp.text||sp.input||''),source:String(sp.source||'shortcut')};
    if(typeof sp === 'string' && sp.trim()) return {text:sp,source:'shortcut'};
    if(plain) return {text:plain,source:'shortcut'};
    if(qp && typeof qp.text === 'string' && qp.text.trim()) return {text:qp.text,source:String(qp.source||'clarity')};
    return {text:'',source:'scriptable'};
  }

  async function promptInput(initial=''){
    const a = new Alert();
    a.title = 'Money Capture';
    a.message = '例：コンビニ850円／今日5000円入った';
    a.addTextField('自然文で入力',initial);
    a.addAction('記録');
    a.addCancelAction('キャンセル');
    const r = await a.presentAlert();
    return r===0 ? a.textFieldValue(0).trim() : '';
  }

  async function resolveMissing(candidate){
    if(candidate.missing.includes('amount')){
      const a = new Alert(); a.title='金額だけ確認'; a.addTextField('金額（円）',''); a.addAction('次へ'); a.addCancelAction('キャンセル');
      if(await a.presentAlert()!==0) return null;
      const n = Number(String(a.textFieldValue(0)).replace(/[,，円\s]/g,''));
      if(!Number.isFinite(n)||n<=0) return null;
      candidate.amount=Math.round(n); candidate.missing=candidate.missing.filter(x=>x!=='amount');
    }
    if(candidate.missing.includes('type')){
      const a = new Alert(); a.title='支出 / 収入だけ確認'; a.addAction('支出'); a.addAction('収入'); a.addCancelAction('キャンセル');
      const r=await a.presentSheet(); if(r<0||r>1) return null;
      candidate.type=r===0?'expense':'income'; candidate.missing=candidate.missing.filter(x=>x!=='type');
    }
    if(candidate.missing.includes('date')){
      const a = new Alert(); a.title='日付だけ確認'; a.addTextField('YYYY-MM-DD',ymdFromDate(new Date())); a.addAction('保存'); a.addCancelAction('キャンセル');
      if(await a.presentAlert()!==0) return null;
      const m=String(a.textFieldValue(0)).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
      const d=m?validYmd(Number(m[1]),Number(m[2]),Number(m[3])):null;
      if(!d) return null;
      candidate.date=d; candidate.missing=candidate.missing.filter(x=>x!=='date');
    }
    candidate.can_save=candidate.missing.length===0;
    return candidate;
  }

  async function addFromText(store,text,source,allowPrompts){
    let candidate = parseMoneyInput(text,new Date());
    if(!candidate.can_save){
      if(!allowPrompts) return {store,message:`未保存｜${candidate.missing.includes('amount')?'金額':candidate.missing.includes('type')?'支出/収入':'日付'}だけ確認が必要です`,saved:false};
      candidate = await resolveMissing(candidate);
      if(!candidate || !candidate.can_save) return {store,message:'保存をキャンセルしました',saved:false};
    }
    const now = new Date();
    if(isDuplicate(store.transactions,candidate,now.toISOString())) return {store,message:'同じ内容が直前に記録済みです',saved:false,duplicate:true};
    const tx = toTransaction(candidate,source,now);
    store.transactions.push(tx);
    store = await saveStore(store);
    return {store,message:feedback(tx),saved:true,tx};
  }

  async function editTransaction(store,index){
    const tx=store.transactions[index]; if(!tx) return store;
    const a=new Alert(); a.title='記録を修正';
    a.addTextField('種別（支出/収入）',tx.type==='income'?'収入':'支出');
    a.addTextField('金額',String(tx.amount));
    a.addTextField('カテゴリ',tx.category||'');
    a.addTextField('日付 YYYY-MM-DD',tx.date||'');
    a.addTextField('店名 / 相手',tx.merchant||'');
    a.addTextField('メモ',tx.memo||'');
    a.addAction('保存'); a.addCancelAction('キャンセル');
    if(await a.presentAlert()!==0) return store;
    const typeText=a.textFieldValue(0).trim();
    const type=/収入|income/i.test(typeText)?'income':/支出|expense/i.test(typeText)?'expense':null;
    const amount=Number(a.textFieldValue(1).replace(/[,，円\s]/g,''));
    const dm=a.textFieldValue(3).trim().match(/^(20\d{2})-(\d{2})-(\d{2})$/);
    const date=dm?validYmd(Number(dm[1]),Number(dm[2]),Number(dm[3])):null;
    if(!type||!Number.isFinite(amount)||amount<=0||!date){
      const e=new Alert(); e.title='保存できません'; e.message='種別・金額・日付を確認してください。'; e.addAction('OK'); await e.presentAlert(); return store;
    }
    store.transactions[index]={...tx,type,amount:Math.round(amount),category:a.textFieldValue(2).trim(),date,merchant:a.textFieldValue(4).trim(),memo:a.textFieldValue(5).trim(),updated_at:new Date().toISOString()};
    return await saveStore(store);
  }

  async function deleteTransaction(store,index){
    const tx=store.transactions[index]; if(!tx) return store;
    const a=new Alert(); a.title='この記録を削除？'; a.message=`${tx.date}｜${yen(tx.amount)}｜${tx.category||'未分類'}`; a.addDestructiveAction('削除'); a.addCancelAction('キャンセル');
    if(await a.presentAlert()!==0) return store;
    store.transactions.splice(index,1);
    return await saveStore(store);
  }

  async function recordMenu(store,index){
    const a=new Alert(); a.title='記録'; a.addAction('編集'); a.addDestructiveAction('削除'); a.addCancelAction('閉じる');
    const r=await a.presentSheet();
    if(r===0) return await editTransaction(store,index);
    if(r===1) return await deleteTransaction(store,index);
    return store;
  }

  async function showDashboard(store){
    const table=new UITable(); table.showSeparators=true;

    function rebuild(){
      table.removeAllRows();
      const s=summary(store.transactions,new Date());
      let row=new UITableRow(); row.isHeader=true; row.addText('YOS Money','P0'); table.addRow(row);
      row=new UITableRow(); row.addText(`今月 支出 ${yen(s.monthExpense)}｜収入 ${yen(s.monthIncome)}`,`収支 ${s.balance>=0?'+':''}${yen(s.balance)}｜今日 ${yen(s.todayExpense)}`); table.addRow(row);
      row=new UITableRow(); row.addText('＋ 入力','自然文で記録'); row.onSelect=async()=>{
        const text=await promptInput(''); if(!text) return;
        const result=await addFromText(store,text,'scriptable',true); store=result.store;
        const done=new Alert(); done.title='Money Capture'; done.message=result.message; done.addAction('OK'); await done.presentAlert();
        rebuild(); table.reload();
      }; table.addRow(row);
      row=new UITableRow(); row.isHeader=true; row.addText('最近の記録'); table.addRow(row);
      const ordered=store.transactions.map((tx,i)=>({tx,i})).sort((a,b)=>String(b.tx.created_at||'').localeCompare(String(a.tx.created_at||''))).slice(0,20);
      if(!ordered.length){ row=new UITableRow(); row.addText('まだ記録はありません'); table.addRow(row); }
      for(const item of ordered){
        const tx=item.tx; row=new UITableRow();
        const sign=tx.type==='income'?'+':'−';
        row.addText(`${tx.date}  ${sign}${yen(tx.amount)}`,`${tx.category||'未分類'}${tx.merchant?`｜${tx.merchant}`:''}`);
        row.onSelect=async()=>{ store=await recordMenu(store,item.i); rebuild(); table.reload(); };
        table.addRow(row);
      }
    }

    rebuild();
    await table.present(false);
  }

  try{
    let store=await loadStore();
    const env=inputEnvelope();
    if(env.text){
      const result=await addFromText(store,env.text,env.source,false);
      if(typeof Script!=='undefined' && Script.setShortcutOutput) Script.setShortcutOutput(result.message);
      if(typeof config!=='undefined' && config.runsInApp){
        const done=new Alert(); done.title='Money Capture'; done.message=result.message; done.addAction('OK'); await done.presentAlert();
      }
      Script.complete(); return;
    }
    if(typeof config!=='undefined' && config.runsInWidget){
      const s=summary(store.transactions,new Date()); const w=new ListWidget(); w.addText('Money'); w.addText(`今日 ${yen(s.todayExpense)}`); w.addText(`今月 ${yen(s.monthExpense)}`); Script.setWidget(w); Script.complete(); return;
    }
    await showDashboard(store);
  }catch(err){
    const message=`Money Capture エラー：${err?.message||String(err)}`;
    if(typeof Script!=='undefined' && Script.setShortcutOutput) Script.setShortcutOutput(message);
    if(typeof config!=='undefined' && config.runsInApp){ const a=new Alert(); a.title='Money Capture'; a.message=message; a.addAction('OK'); await a.presentAlert(); }
    Script.complete();
  }
}

if(typeof module!=='undefined' && module.exports){
  module.exports={parseJapaneseNumberToken,extractAmount,classifyCategory,inferType,parseDate,parseMoneyInput,isDuplicate,toTransaction,summary,ymdFromDate,validYmd,feedback};
} else if(typeof Script!=='undefined') {
  await runScriptable();
}
