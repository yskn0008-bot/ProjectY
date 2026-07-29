'use strict';

(()=>{
  if(window.__yosTaxiReportSyncV43)return;
  window.__yosTaxiReportSyncV43=true;

  const CAL='yos-taxi-calendar-v1';
  const SET='yos-taxi-calendar-settings-v3';
  const OLD_SET='yos-taxi-calendar-settings-v2';
  const MIGRATION='yos-taxi-report-sync-v43';

  const confirmed={
    '2026-07-01':{shiftStart:'17:10',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.25,sales:31000,taxExclusiveSales:28182,rides:24},
    '2026-07-02':{shiftStart:'17:25',serviceEnd:'05:15',workEnd:'05:15',actualHours:11.8333333333,sales:23100,taxExclusiveSales:21000,rides:15},
    '2026-07-03':{shiftStart:'16:10',serviceEnd:'04:30',workEnd:'04:30',actualHours:12.3333333333,sales:38100,taxExclusiveSales:34636,rides:22},
    '2026-07-05':{shiftStart:'17:15',serviceEnd:'04:00',workEnd:'04:00',actualHours:10.75,sales:26700,taxExclusiveSales:24273,rides:26},
    '2026-07-06':{shiftStart:'17:00',serviceEnd:'05:25',workEnd:'05:25',actualHours:12.4166666667,sales:35900,taxExclusiveSales:32636,rides:22},
    '2026-07-07':{shiftStart:'16:55',serviceEnd:'02:35',workEnd:'02:35',actualHours:9.6666666667,sales:24600,taxExclusiveSales:22364,rides:22},
    '2026-07-09':{shiftStart:'17:00',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.4166666667,sales:25300,taxExclusiveSales:23000,rides:19},
    '2026-07-10':{shiftStart:'16:35',serviceEnd:'04:25',workEnd:'04:25',actualHours:11.8333333333,sales:36600,taxExclusiveSales:33273,rides:24},
    '2026-07-11':{shiftStart:'17:30',serviceEnd:'02:25',workEnd:'02:25',actualHours:8.9166666667,sales:14700,taxExclusiveSales:13364,rides:12},
    '2026-07-14':{shiftStart:'17:15',serviceEnd:'04:38',workEnd:'04:38',actualHours:11.3833333333,sales:29700,taxExclusiveSales:27000,rides:15},
    '2026-07-18':{shiftStart:'15:20',serviceEnd:'04:22',workEnd:'04:22',actualHours:13.0333333333,sales:48500,taxExclusiveSales:44091,rides:41},
    '2026-07-19':{shiftStart:'16:35',serviceEnd:'04:30',workEnd:'04:30',actualHours:11.9166666667,sales:54400,taxExclusiveSales:49455,rides:35},
    '2026-07-21':{shiftStart:'14:00',serviceEnd:'02:35',workEnd:'02:35',actualHours:12.5833333333,sales:41500,taxExclusiveSales:37727,rides:24},
    '2026-07-22':{shiftStart:'',serviceEnd:'',workEnd:'',actualHours:0,sales:19100,taxExclusiveSales:17364,rides:12},
    '2026-07-23':{shiftStart:'15:35',serviceEnd:'03:30',workEnd:'03:30',actualHours:11.9166666667,sales:27780,taxExclusiveSales:25255,rides:21},
    '2026-07-27':{shiftStart:'16:20',serviceEnd:'02:55',workEnd:'02:55',actualHours:10.5833333333,sales:29500,taxExclusiveSales:26818,rides:22},
    '2026-07-28':{shiftStart:'16:20',serviceEnd:'04:20',workEnd:'04:20',actualHours:12,sales:30200,taxExclusiveSales:27455,rides:25}
  };

  const read=(key,fallback)=>{
    try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}
  };
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  const calendar=read(CAL,{monthlyGoals:{},days:{}});
  calendar.monthlyGoals={...(calendar.monthlyGoals||{}),'2026-07':770000};
  calendar.days={...(calendar.days||{})};

  Object.entries(confirmed).forEach(([date,report])=>{
    const current=calendar.days[date]||{};
    const next={
      ...current,
      status:'work',
      actualHours:report.actualHours,
      sales:report.sales,
      taxExclusiveSales:report.taxExclusiveSales,
      rides:report.rides,
      reportTrips:report.rides,
      source:'ProjectY 運行データ／乗務日報（確認済み）'
    };
    if(report.shiftStart)next.shiftStart=report.shiftStart;
    if(report.serviceEnd)next.serviceEnd=report.serviceEnd;
    if(report.workEnd)next.workEnd=report.workEnd;
    calendar.days[date]=next;
  });
  write(CAL,calendar);

  // 日別実績へ移行したため、旧「繰越実績」をゼロにして二重計上を防ぐ。
  const oldSettings=read(OLD_SET,{});
  oldSettings.carrySales=0;
  oldSettings.carryHours=0;
  write(OLD_SET,oldSettings);

  const settings=read(SET,{months:{}});
  settings.months=settings.months||{};
  settings.months['2026-07']={...(settings.months['2026-07']||{}),hourLimit:288,carrySales:0,carryHours:0};
  write(SET,settings);
  localStorage.setItem(MIGRATION,'2026-07-28-confirmed');

  try{
    if(typeof data!=='undefined'){
      data.monthlyGoals={...(data.monthlyGoals||{}),...calendar.monthlyGoals};
      data.days={...(data.days||{}),...calendar.days};
    }
    if(typeof render==='function')render();
  }catch(error){
    console.warn('YOS Taxi report sync v43',error);
  }
})();
