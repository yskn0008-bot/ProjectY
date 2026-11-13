import {acceptChoice} from './choice-protocol.mjs';

// Only an explicit paste/read transfers the selected name. Never poll the clipboard.
const $=id=>document.getElementById(id),key='YOS_DAYSTREAM_WEB_SHORTCUT_DRAFT_V1';
const fieldIds=['newTitle','newTime','newDuration','newKind','newShortcut'];
const box=document.createElement('div');box.className='wizard-import';box.hidden=true;
const launch=document.createElement('a');launch.id='chooseNativeShortcut';launch.href='#';launch.textContent='iPhoneの最新一覧から選ぶ';
const help=document.createElement('p');help.textContent='選んだらホーム画面のDAYSTREAMへ戻り、選択を反映。タスクの入力は保持します。';
const apply=document.createElement('button');apply.type='button';apply.id='applyNativeShortcut';apply.textContent='選択を反映';apply.hidden=true;
const fallback=document.createElement('textarea');fallback.id='nativeShortcutPaste';fallback.placeholder='ここを長押し → ペースト';fallback.setAttribute('aria-label','ショートカットの選択結果');fallback.hidden=true;
const status=document.createElement('p');status.id='nativeShortcutStatus';status.setAttribute('aria-live','polite');
const install=document.createElement('a');install.textContent='初回のみ：選択用ショートカットを追加';install.href='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/draft/daystream-native-choice-20261113/tools/daystream-shortcut-choice/YOS_Shortcut_Choice.shortcut';
box.append(launch,help,apply,fallback,status,install);$('shortcutField').prepend(box);
let pending=null;
const snapshot=()=>Object.fromEntries(fieldIds.map(id=>[id,$(id).value]));
function write(value){const encoded=JSON.stringify(value),old=localStorage.getItem(key);try{localStorage.setItem(key,encoded);if(localStorage.getItem(key)!==encoded)throw Error('下書きの保存を確認できません')}catch(e){try{if(old===null)localStorage.removeItem(key);else localStorage.setItem(key,old)}catch{}throw e}}
function valid(value){return value?.version===1&&typeof value.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.day)&&value.fields&&fieldIds.every(id=>typeof value.fields[id]==='string'&&value.fields[id].length<=500)&&typeof value.nonce==='string'&&/^YOS_PICK_V1:[a-zA-Z0-9-]{16,80}$/.test(value.nonce)&&Number.isFinite(value.createdAt)}
launch.onclick=event=>{
 event.preventDefault();status.textContent='';
 try{
  if(!window.YOS_TASK_WIZARD.isActive()||editingId!==null)throw Error('新規タスクの段階入力から選んでください');
  const value={version:1,day:selectedDay,fields:snapshot(),nonce:'YOS_PICK_V1:'+crypto.randomUUID(),createdAt:Date.now(),consumed:false};
  write(value);pending=value;apply.hidden=false;fallback.hidden=true;
  const url='shortcuts://run-shortcut?name=YOS%20Shortcut%20Choice&input=text&text='+encodeURIComponent(value.nonce);
  window.location.href=url;
 }catch(e){status.textContent=e.message}
};
function receive(text){
 try{
  if(!pending||!window.YOS_TASK_WIZARD.isActive()||pending.day!==selectedDay||editingId!==null)throw Error('このタスクから一覧を開き直してください');
  const stored=JSON.parse(localStorage.getItem(key)||'null');if(!valid(stored)||stored.nonce!==pending.nonce||stored.consumed)throw Error('この選択は反映済み、または別のタスクの選択です');
  const next={...stored,fields:snapshot()},result=acceptChoice(next,text);
  next.fields.newShortcut=result.name;write(next);pending=next;
  $('newShortcut').value=result.name;refreshShortcutPicker();updateShortcutField();
  fallback.value='';fallback.hidden=true;apply.hidden=true;status.textContent='「'+result.name+'」を付けました。次へ進んで確認してください。';
 }catch(e){status.textContent=e.message;fallback.hidden=false}
}
apply.onclick=async()=>{
 try{if(fallback.value){receive(fallback.value);return}if(!navigator.clipboard?.readText)throw Error();const text=await navigator.clipboard.readText();receive(text)}
 catch{fallback.hidden=false;fallback.focus();status.textContent='下の欄を長押しして「ペースト」。貼り付けると反映します。'}
};
fallback.addEventListener('input',()=>{if(fallback.value.trim())receive(fallback.value)});
// Closing or saving ends this selection request. No changes to the plan schema.
const originalStart=window.YOS_TASK_WIZARD.start;
window.YOS_TASK_WIZARD.start=(at=0)=>{box.hidden=false;originalStart(at)};
const originalReset=window.YOS_TASK_WIZARD.reset;
window.YOS_TASK_WIZARD.reset=()=>{originalReset();box.hidden=true;pending=null;apply.hidden=fallback.hidden=true;fallback.value='';status.textContent='';try{localStorage.removeItem(key)}catch{}};
$('editor').addEventListener('input',()=>{if(!pending||!window.YOS_TASK_WIZARD.isActive())return;try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(!valid(stored)||stored.nonce!==pending.nonce||!!stored.consumed!==!!pending.consumed)return;const next={...pending,fields:snapshot()};write(next);pending=next}catch{status.textContent='下書きを保存できません。この画面を閉じずに入力を続けてください。'}});
try{
 const saved=JSON.parse(localStorage.getItem(key)||'null');
 if(valid(saved)&&saved.day===selectedDay&&editingId===null){
  pending=saved;for(const id of fieldIds)$(id).value=saved.fields[id];
  refreshShortcutPicker();updateShortcutField();showEditor();window.YOS_TASK_WIZARD.start(3);apply.hidden=!!saved.consumed;
  status.textContent=saved.consumed?'選択済みの下書きを戻しました。次へ進んで確認してください。':'入力中のタスクを戻しました。選択を反映してください。';
 }
}catch{status.textContent='選択用の下書きを読み込めません。元の予定は変更していません。'}
