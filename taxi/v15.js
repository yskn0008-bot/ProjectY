'use strict';
(()=>{
  const CAL='yos-taxi-calendar-v1';
  const SESSION_FLAG='yos-taxi-report-history-v15-reloaded';
  const history={
  "2026-06-06": {
    "sales": 29000,
    "trips": 27,
    "actualHours": 12.08,
    "shiftStart": "16:25",
    "serviceEnd": "04:30",
    "dataQuality": "confirmed_front_back",
    "note": "障害者割80円。現金等は総売上−アプリ決済で算出。"
  },
  "2026-06-13": {
    "sales": 54200,
    "trips": 37,
    "actualHours": null,
    "shiftStart": null,
    "serviceEnd": null,
    "dataQuality": "back_only_inferred_date",
    "note": "表面なし。日付は裏写りから推定。37件・54,200円。北谷・美浜・沖縄市の連鎖が強い。"
  },
  "2026-06-24": {
    "sales": 30100,
    "trips": 27,
    "actualHours": 11.58,
    "shiftStart": "17:15",
    "serviceEnd": "04:50",
    "dataQuality": "confirmed_front_back",
    "note": "表裏確認済み。"
  },
  "2026-06-28": {
    "sales": 20400,
    "trips": 16,
    "actualHours": 10.92,
    "shiftStart": "17:15",
    "serviceEnd": "04:10",
    "dataQuality": "confirmed_front_back",
    "note": "チケット2,700円。現金等11,000円はチケットを含む非アプリ残額。"
  },
  "2026-06-29": {
    "sales": 8300,
    "trips": 8,
    "actualHours": 10.92,
    "shiftStart": "17:10",
    "serviceEnd": "04:05",
    "dataQuality": "confirmed_front_back",
    "note": "実車率14.9%。空車97kmで最低売上日。"
  },
  "2026-07-01": {
    "sales": 31000,
    "trips": 24,
    "actualHours": 11.25,
    "shiftStart": "17:10",
    "serviceEnd": "04:25",
    "dataQuality": "confirmed_front_back",
    "note": "チケット4,800円・障害者割180円を確認。現金等は非アプリ残額。"
  },
  "2026-07-02": {
    "sales": 23100,
    "trips": 15,
    "actualHours": 11.83,
    "shiftStart": "17:25",
    "serviceEnd": "05:15",
    "dataQuality": "confirmed_front_back",
    "note": "入庫5:15。実車率32.2%。"
  },
  "2026-07-03": {
    "sales": 38100,
    "trips": 22,
    "actualHours": 12.33,
    "shiftStart": "16:10",
    "serviceEnd": "04:30",
    "dataQuality": "confirmed_front_back",
    "note": "美浜発の長距離12,000円後、南部で降車地営業。高単価の上振れ。"
  },
  "2026-07-05": {
    "sales": 26700,
    "trips": 26,
    "actualHours": 10.75,
    "shiftStart": "17:15",
    "serviceEnd": "04:00",
    "dataQuality": "confirmed_front_back",
    "note": "既存行を日報画像で再確認。"
  },
  "2026-07-06": {
    "sales": 35900,
    "trips": 22,
    "actualHours": 12.42,
    "shiftStart": "17:00",
    "serviceEnd": "05:25",
    "dataQuality": "corrected_from_image",
    "note": "総売上を38,900円から35,900円へ訂正。GO・DiDi各13,700円。"
  },
  "2026-07-07": {
    "sales": 24600,
    "trips": 22,
    "actualHours": 9.67,
    "shiftStart": "16:55",
    "serviceEnd": "02:35",
    "dataQuality": "confirmed_front_back",
    "note": "チケット/クーポン約1,700円、納金5,900円。現金等は非アプリ残額。"
  },
  "2026-07-09": {
    "sales": 25300,
    "trips": 19,
    "actualHours": 11.42,
    "shiftStart": "17:00",
    "serviceEnd": "04:25",
    "dataQuality": "confirmed_front_back",
    "note": "表裏確認済み。"
  },
  "2026-07-10": {
    "sales": 36600,
    "trips": 24,
    "actualHours": 11.83,
    "shiftStart": "16:35",
    "serviceEnd": "04:25",
    "dataQuality": "corrected_from_image",
    "note": "総売上36,600円。宜野湾・浦添の連鎖が中心。"
  },
  "2026-07-11": {
    "sales": 14700,
    "trips": 12,
    "actualHours": 8.92,
    "shiftStart": "17:30",
    "serviceEnd": "02:25",
    "dataQuality": "confirmed_front_back",
    "note": "乗車12件・実車率33.0%。"
  },
  "2026-07-14": {
    "sales": 29700,
    "trips": 15,
    "actualHours": 11.38,
    "shiftStart": "17:15",
    "serviceEnd": "04:38",
    "dataQuality": "confirmed_front_back",
    "note": "15件で29,700円。平均単価1,980円。"
  },
  "2026-07-18": {
    "sales": 48500,
    "trips": 41,
    "actualHours": 13.03,
    "shiftStart": "15:20",
    "serviceEnd": "04:22",
    "dataQuality": "user_confirmed_with_open_checks",
    "note": "本人確認済み48,500円。明細40行/メーター41回、走行距離215/216km差は未解消。"
  },
  "2026-07-19": {
    "sales": 54400,
    "trips": 35,
    "actualHours": 11.92,
    "shiftStart": "16:35",
    "serviceEnd": "04:30",
    "dataQuality": "user_confirmed_missing_go",
    "note": "本人確認済み54,400円。裏面GO600円1件抜け。休憩は分析対象外。"
  }
};
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const data=read(CAL,{monthlyGoals:{},days:{}});
  data.monthlyGoals=data.monthlyGoals||{};
  data.days=data.days||{};
  let changed=false;

  for(const [date,report] of Object.entries(history)){
    const current=data.days[date]||{};
    const importedNote=`紙日報取込：${report.sales.toLocaleString('ja-JP')}円・${report.trips}件`;
    const event=current.event
      ? (current.event.includes('紙日報取込')?current.event:`${current.event}／${importedNote}`)
      : importedNote;
    const next={
      ...current,
      status:current.status==='transferWork'?'transferWork':'work',
      sales:report.sales,
      actualHours:report.actualHours??current.actualHours??0,
      shiftStart:report.shiftStart||current.shiftStart,
      serviceEnd:report.serviceEnd||current.serviceEnd,
      workEnd:report.serviceEnd||current.workEnd,
      event,
      reportTrips:report.trips,
      reportSource:'Drive/03_Reports',
      reportDataQuality:report.dataQuality,
      reportNote:report.note
    };
    if(JSON.stringify(current)!==JSON.stringify(next)){
      data.days[date]=next;
      changed=true;
    }
  }

  if(changed){
    write(CAL,data);
    if(!sessionStorage.getItem(SESSION_FLAG)){
      sessionStorage.setItem(SESSION_FLAG,'1');
      location.reload();
    }
  }
})();
