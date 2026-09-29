'use strict';
(()=>{
  if(window.YOSMoneyJournalV1)return;
  const QUEUE_KEY='yos-money-journal-queue-v1';
  const MAX_QUEUE=120;
  let flushing=false;

  const now=()=>new Date().toISOString();
  const id=()=>globalThis.crypto?.randomUUID?.()||('mj-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
  const readQueue=()=>{try{const value=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}};
  const writeQueue=value=>{try{localStorage.setItem(QUEUE_KEY,JSON.stringify(value.slice(-MAX_QUEUE)));return true}catch{return false}};
  const stateSnapshot=state=>{
    if(!state||typeof state!=='object')return null;
    return {
      version:state.version??2,
      privacy:Boolean(state.privacy),
      accounts:Array.isArray(state.accounts)?state.accounts:[],
      transactions:Array.isArray(state.transactions)?state.transactions:[],
      recurring:Array.isArray(state.recurring)?state.recurring:[],
      debts:Array.isArray(state.debts)?state.debts:[],
      goals:Array.isArray(state.goals)?state.goals:[],
      assets:Array.isArray(state.assets)?state.assets:[],
      rules:state.rules&&typeof state.rules==='object'?state.rules:{},
      updatedAt:state.updatedAt||null
    };
  };
  const monthFile=record=>'yos-money-history-'+String(record.recordedAt||now()).slice(0,7)+'.jsonl';

  async function appendRecord(record){
    if(!navigator.storage?.getDirectory)throw new Error('opfs_unavailable');
    const root=await navigator.storage.getDirectory();
    const handle=await root.getFileHandle(monthFile(record),{create:true});
    const file=await handle.getFile();
    const writable=await handle.createWritable({keepExistingData:true});
    await writable.seek(file.size);
    await writable.write(JSON.stringify(record)+'\n');
    await writable.close();
  }

  async function flush(){
    if(flushing)return false;
    flushing=true;
    try{
      let queue=readQueue();
      if(!queue.length)return true;
      let written=0;
      for(const record of queue){
        try{await appendRecord(record);written++}catch{break}
      }
      if(written>0){queue=queue.slice(written);writeQueue(queue)}
      return queue.length===0;
    }finally{flushing=false}
  }

  function record({source='money',action='save',ops=null,state=null,detail=null}={}){
    const entry={
      schema:'yos-money-journal-v1',
      id:id(),
      recordedAt:now(),
      source:String(source||'money').slice(0,60),
      action:String(action||'save').slice(0,60),
      ops:Array.isArray(ops)?ops.slice(0,20):null,
      detail:detail&&typeof detail==='object'?detail:null,
      state:stateSnapshot(state)
    };
    const queue=readQueue();queue.push(entry);writeQueue(queue);
    void flush();
    return entry.id;
  }

  function status(){
    return {queued:readQueue().length,filePattern:'yos-money-history-YYYY-MM.jsonl',backend:navigator.storage?.getDirectory?'opfs':'localStorage-fallback'};
  }

  window.YOSMoneyJournalV1=Object.freeze({record,flush,status});
  window.addEventListener('online',()=>{void flush()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void flush()});
  void flush();
})();
