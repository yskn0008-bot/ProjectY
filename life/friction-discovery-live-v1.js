'use strict';
(()=>{
  if(globalThis.__yosFrictionDiscoveryLiveV1)return;
  globalThis.__yosFrictionDiscoveryLiveV1=true;

  const SOURCE='yos-life-v1';
  const READ_ONLY_ACTION=/(確認|チェック|照合|開く|起動|検索)/u;
  const UNSAFE_ACTION=/(支払|振込|送信|削除|購入|契約|決済|投稿|公開|登録|予約|注文|入金|出金|変更|更新|保存|入力|転記|同期)/u;
  const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const clean=(value,max=120)=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,max);
  const patternKey=label=>`life-task:${label.toLocaleLowerCase('ja-JP')}`;
  const frictionKind=label=>/(確認|チェック|照合|検索)/u.test(label)?'repeated_check':'repeated_action';

  function projectLifeStoreToFrictionSignals(store){
    const days=asObject(asObject(store).days);
    const signals=[];
    for(const date of Object.keys(days).sort()){
      if(!ISO_DAY.test(date))continue;
      const tasks=Array.isArray(asObject(days[date]).tasks)?asObject(days[date]).tasks:[];
      tasks.forEach((rawTask,index)=>{
        const task=asObject(rawTask);
        const label=clean(task.text);
        if(!label||task.done!==true||!READ_ONLY_ACTION.test(label)||UNSAFE_ACTION.test(label))return;
        const evidenceId=`life:${date}:task:${index}`;
        signals.push({
          id:evidenceId,occurredAt:`${date}T12:00:00+09:00`,source:'life',
          patternKey:patternKey(label),label,kind:frictionKind(label),
          minutesSpent:null,manualSteps:1,automatable:true,reversible:true,risk:'low',evidenceId
        });
      });
    }
    return signals;
  }

  function discoverFromLifeStore(store,endDate){
    const engine=globalThis.YOSFrictionDiscoveryEngineV1;
    const signals=projectLifeStoreToFrictionSignals(store);
    if(!engine||typeof engine.discoverFrictionCandidates!=='function'){
      return{signals,result:{schemaVersion:1,windowDays:14,consideredSignals:0,candidates:[]},reason:'engine-unavailable'};
    }
    const now=ISO_DAY.test(String(endDate||''))?`${endDate}T23:59:59+09:00`:new Date().toISOString();
    return{signals,result:engine.discoverFrictionCandidates(signals,{now})};
  }

  function toWeeklySignals(store,endDate){
    const output=discoverFromLifeStore(store,endDate);
    return output.result.candidates.map(candidate=>({
      id:`friction:${candidate.patternKey}`,domain:'life',label:candidate.label,occurrences:candidate.occurrences,
      outcome:'neutral',value:'medium',friction:candidate.confidence==='high'?'high':'medium',
      automatable:true,reversible:true,measuredMinutesPerWeek:candidate.estimatedMinutesPerWeek,
      manualStepsPerWeek:candidate.manualStepsPerWeek,evidenceIds:[...candidate.evidenceIds],
      frictionPatternKey:candidate.patternKey,frictionConfidence:candidate.confidence
    }));
  }

  globalThis.__yosFrictionDiscoveryLiveV1Api=Object.freeze({
    SOURCE,projectLifeStoreToFrictionSignals,discoverFromLifeStore,toWeeklySignals
  });
})();