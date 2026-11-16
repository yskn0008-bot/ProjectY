/* Calendar-only extension of the existing read adapter. No existing DAYSTREAM
 * file or behavior is changed. Extra source records are checked by unified-sources. */
(()=>{
 const api=window.YOS_DAYSTREAM_SOURCES;
 if(!api)return;
 const original=api.fromYosTaskDashboardCache;
 api.fromYosTaskDashboardCache=function(cache){
  const snapshot=original.call(api,cache);
  return snapshot&&snapshot.origin==='notion'&&cache?.data?.calendarSources
    ?{...snapshot,calendarSources:cache.data.calendarSources}:snapshot;
 };
})();
