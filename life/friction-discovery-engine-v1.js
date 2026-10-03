'use strict';
// Browser artifact generated from server/yos-ai/src/review/friction-discovery.ts. Do not hand-edit.
(()=>{
  if(globalThis.YOSFrictionDiscoveryEngineV1)return;
  const DEFAULTS={windowDays:14,minOccurrences:3,minDistinctDays:2,minMinutesPerWeek:3,minManualStepsPerWeek:8,maxCandidates:5};
  const finiteNonNegative=value=>value===null||!Number.isFinite(value)||value<0?null:value;
  const isoDay=timestamp=>new Date(timestamp).toISOString().slice(0,10);
  const normalizeKey=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
  const scoreCandidate=(minutesPerWeek,stepsPerWeek,occurrences,distinctDays)=>{
    const minutePoints=minutesPerWeek===null?0:Math.min(40,minutesPerWeek*2);
    const stepPoints=stepsPerWeek===null?0:Math.min(30,stepsPerWeek);
    return Math.round((minutePoints+stepPoints+Math.min(24,occurrences*4)+Math.min(12,distinctDays*3))*10)/10;
  };
  const mostCommonKind=signals=>{
    const counts=new Map();
    for(const signal of signals)counts.set(signal.kind,(counts.get(signal.kind)||0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0]?.[0]||'repeated_action';
  };

  function discoverFrictionCandidates(signals,options={}){
    const windowDays=Math.max(1,Math.floor(options.windowDays??DEFAULTS.windowDays));
    const minOccurrences=Math.max(2,Math.floor(options.minOccurrences??DEFAULTS.minOccurrences));
    const minDistinctDays=Math.max(1,Math.floor(options.minDistinctDays??DEFAULTS.minDistinctDays));
    const minMinutesPerWeek=Math.max(0,options.minMinutesPerWeek??DEFAULTS.minMinutesPerWeek);
    const minManualStepsPerWeek=Math.max(0,options.minManualStepsPerWeek??DEFAULTS.minManualStepsPerWeek);
    const maxCandidates=Math.max(1,Math.floor(options.maxCandidates??DEFAULTS.maxCandidates));
    const nowMs=Date.parse(options.now??new Date().toISOString());
    if(!Number.isFinite(nowMs))throw new Error('options.now must be a valid ISO date');

    const windowStart=nowMs-windowDays*24*60*60*1000;
    const groups=new Map();
    let consideredSignals=0;
    for(const signal of Array.isArray(signals)?signals:[]){
      const occurredAt=Date.parse(signal?.occurredAt);
      const key=normalizeKey(signal?.patternKey);
      const label=String(signal?.label??'').trim();
      if(!Number.isFinite(occurredAt)||occurredAt<windowStart||occurredAt>nowMs||!signal?.id||!signal?.evidenceId||!key||!label)continue;
      consideredSignals+=1;
      const group=groups.get(key)||[];
      group.push(signal);
      groups.set(key,group);
    }

    const candidates=[];
    const weekScale=7/windowDays;
    for(const [patternKey,group] of groups){
      if(group.length<minOccurrences)continue;
      const distinctDays=new Set(group.map(signal=>isoDay(Date.parse(signal.occurredAt)))).size;
      if(distinctDays<minDistinctDays)continue;
      if(!group.every(signal=>signal.automatable&&signal.reversible&&signal.risk==='low'))continue;

      const knownMinutes=group.map(signal=>finiteNonNegative(signal.minutesSpent)).filter(value=>value!==null);
      const knownSteps=group.map(signal=>finiteNonNegative(signal.manualSteps)).filter(value=>value!==null);
      const minutesPerWeek=knownMinutes.length===0?null:Math.round(knownMinutes.reduce((sum,value)=>sum+value,0)*weekScale*10)/10;
      const stepsPerWeek=knownSteps.length===0?null:Math.round(knownSteps.reduce((sum,value)=>sum+value,0)*weekScale*10)/10;
      if(!((minutesPerWeek!==null&&minutesPerWeek>=minMinutesPerWeek)||(stepsPerWeek!==null&&stepsPerWeek>=minManualStepsPerWeek)))continue;

      const labels=new Map();
      for(const signal of group){
        const label=String(signal.label??'').trim();
        labels.set(label,(labels.get(label)||0)+1);
      }
      const label=[...labels.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja'))[0]?.[0]||patternKey;
      const score=scoreCandidate(minutesPerWeek,stepsPerWeek,group.length,distinctDays);
      const confidence=group.length>=5&&distinctDays>=3&&((minutesPerWeek??0)>=5||(stepsPerWeek??0)>=12)?'high':'medium';
      candidates.push({
        patternKey,label,kind:mostCommonKind(group),occurrences:group.length,distinctDays,
        estimatedMinutesPerWeek:minutesPerWeek,manualStepsPerWeek:stepsPerWeek,score,confidence,
        evidenceIds:[...new Set(group.map(signal=>signal.evidenceId))],
        sources:[...new Set(group.map(signal=>signal.source))].sort(),
        handoff:'prototype',requiresUserDecision:true
      });
    }
    candidates.sort((a,b)=>b.score-a.score||b.occurrences-a.occurrences||a.patternKey.localeCompare(b.patternKey));
    return{schemaVersion:1,windowDays,consideredSignals,candidates:candidates.slice(0,maxCandidates)};
  }

  globalThis.YOSFrictionDiscoveryEngineV1=Object.freeze({discoverFrictionCandidates});
})();