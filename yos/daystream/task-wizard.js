/* DAYSTREAM: guided creation, local Shortcut-name catalogue. No network or auto-run. */
(()=>{
 const $=id=>document.getElementById(id),editor=$('editor'),key='YOS_DAYSTREAM_WEB_SHORTCUT_NAMES_V1';
 const normalize=text=>{
  if(typeof text!=='string'||text.length>150000)throw Error('一覧が大きすぎます');
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length>1000||lines.some(s=>s.length>100||/[\x00-\x1f\x7f]/.test(s)))throw Error('名前は1行1件・100文字以内、一覧は1000件以内です');
  return [...new Set(lines)].sort((a,b)=>a.localeCompare(b,'ja'));
 };
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?normalize(value.join('\n')):[]}catch{return []}};
 window.YOS_DAYSTREAM_SHORTCUT_NAMES={read};
 const style=document.createElement('style');style.textContent='.editor [hidden]{display:none!important}.wizard-progress{font-size:13px;color:#dce8f4;margin:12px 0}.wizard-summary{white-space:pre-wrap;line-height:1.8;padding:14px 0}.wizard-import{margin:10px 0}.wizard-import textarea{width:100%;min-height:100px;background:#303742;color:white;padding:10px;border-radius:8px}.wizard-error{color:#ffd4d4;min-height:1.5em}.wizard-controls{display:flex;gap:12px;margin-top:14px}.wizard-controls button{min-height:44px}';document.head.append(style);
 const progress=document.createElement('div');progress.id='wizardProgress';progress.className='wizard-progress';progress.setAttribute('aria-live','polite');editor.insertBefore(progress,editor.querySelector('.fields'));
 const summary=document.createElement('div');summary.id='wizardSummary';summary.className='wizard-summary';editor.insertBefore(summary,editor.querySelector('.editor-actions'));
 const error=document.createElement('div');error.id='wizardError';error.className='wizard-error';error.setAttribute('role','alert');editor.insertBefore(error,summary);
 const controls=document.createElement('div');controls.className='wizard-controls';
 const button=(id,text,fn)=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.onclick=fn;return b};
 const back=button('wizardBack','戻る',()=>{step--;render()}),next=button('wizardNext','次へ',()=>{if(validate()){step++;render()}}),skip=button('wizardSkip','付けない',()=>{$('newShortcut').value='';step=4;render()});controls.append(back,next,skip);editor.append(controls);
 const search=document.createElement('input');search.id='shortcutSearch';search.type='search';search.placeholder='ショートカットを検索';search.setAttribute('aria-label','ショートカットを検索');search.style.width='100%';$('shortcutField').insertBefore(search,$('shortcutPicker'));
 const details=document.createElement('details');details.className='wizard-import';const label=document.createElement('summary');label.textContent='iPhoneの一覧を取り込む';details.append(label);
 const help=document.createElement('p');help.textContent='「YOS Shortcut Names」を一度実行し、コピーされた名前をここへ貼り付けて登録。名前だけをこのWebアプリ内に保存します。';details.append(help);
 const area=document.createElement('textarea');area.id='shortcutNamesImport';area.placeholder='ショートカット名を1行に1件';area.setAttribute('aria-label','ショートカット名一覧');details.append(area);
 const status=document.createElement('div');status.id='shortcutNamesStatus';status.setAttribute('aria-live','polite');
 details.append(button('saveShortcutNames','一覧を登録',()=>{
  let old=null,changed=false;
  try{const names=normalize(area.value);if(!names.length)throw Error('一覧を貼り付けてください');old=localStorage.getItem(key);const encoded=JSON.stringify(names);if(old!==null)localStorage.setItem(key+'_BACKUP',old);changed=true;localStorage.setItem(key,encoded);if(localStorage.getItem(key)!==encoded)throw Error('保存を確認できません');area.value='';search.value='';refreshShortcutPicker();filter();status.textContent=names.length+'件を登録しました';}
  catch(e){if(changed){try{if(old===null)localStorage.removeItem(key);else localStorage.setItem(key,old)}catch{}}status.textContent=e.message;}
 }),status);$('shortcutField').append(details);
 function filter(){const query=search.value.trim().toLocaleLowerCase();for(const option of $('shortcutPicker').options)option.hidden=!!option.value&&!option.value.toLocaleLowerCase().includes(query)}search.oninput=filter;
 let active=false,step=0;
 const fields=[$('newTitle'),$('newTime'),$('newDuration').parentElement,$('shortcutField')];
 function validate(){
  error.textContent='';let message='';
  if(step===0&&!$('newTitle').value.trim())message='名前を入力してください';
  if(step===1&&!/^([01]\d|2[0-3]):[0-5]\d$/.test($('newTime').value))message='開始時刻を選んでください';
  if(step===2){const d=Number($('newDuration').value),[h,m]=$('newTime').value.split(':').map(Number);if(!Number.isFinite(d)||d<5||d>1440)message='所要時間は5〜1440分です';else if(h*60+m+d>1440)message='終了時刻が24:00を超えています';}
  if(step===3){const name=$('newShortcut').value.trim();if(name.length>100||/[\x00-\x1f\x7f]/.test(name))message='ショートカット名を確認してください';}
  error.textContent=message;return !message;
 }
 function render(){
  const labels=['何をする？','いつ始める？','何分かかる？','ショートカットを付ける？','内容を確認'];
  progress.textContent=(step+1)+' / 5　'+labels[step];error.textContent='';
  fields.forEach((el,i)=>el.hidden=i!==step);editor.querySelector('.fields').hidden=step>2;
  $('newKind').hidden=step!==4;$('editEnd').hidden=step!==2&&step!==4;
  summary.hidden=step!==4;summary.textContent=step===4?[$('newTitle').value.trim(),$('newTime').value+'から '+$('newDuration').value+'分',$('editEnd').textContent,'ショートカット：'+($('newShortcut').value.trim()||'なし')].join('\n'):'';
  $('saveBtn').hidden=step!==4;back.hidden=step===0;next.hidden=step>=4;skip.hidden=step!==3;
  if(step===4){editor.querySelector('.fields').hidden=false;$('newKind').hidden=false;}
  if(step<3)fields[step].querySelector?.('input')?.focus({preventScroll:true});
 }
 function reset(){active=false;step=0;progress.hidden=summary.hidden=error.hidden=controls.hidden=true;editor.querySelector('.fields').hidden=false;fields.forEach(el=>el.hidden=false);$('newKind').hidden=false;$('editEnd').hidden=false;$('saveBtn').hidden=false;}
 window.YOS_TASK_WIZARD={start(at=0){active=true;step=Math.max(0,Math.min(4,at));progress.hidden=error.hidden=controls.hidden=false;render()},isActive:()=>active,reset};reset();
 editor.addEventListener('keydown',event=>{if(active&&event.key==='Enter'&&event.target.tagName!=='TEXTAREA'&&event.target.tagName!=='BUTTON'&&event.target.tagName!=='SELECT'){event.preventDefault();if(step<4)next.click();}});
 editor.addEventListener('click',event=>{if(active&&event.target===$('saveBtn')&&step!==4){event.preventDefault();event.stopImmediatePropagation()}},true);
})();
