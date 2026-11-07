'use strict';
/* Existing YOS Chat sheet UI; settings are preview-only until alert transport is connected. */
(() => {
  const button=document.getElementById('notificationCenterBtn');
  if(!button)return;
  button.textContent='♧';
  button.setAttribute('title','通知センター（準備中）');
  button.addEventListener('click',()=>{
    if(typeof showSheet!=='function')return;
    showSheet('<section aria-label="YOS通知センター" style="padding:14px 12px 28px">'+
      '<h2 style="margin:0 0 10px">通知センター</h2>'+
      '<p style="font-size:13px;opacity:.75">現在は画面プレビューです。通知データの取得・配信には未接続です。</p>'+
      '<div style="padding:16px 12px;border:1px solid #555;border-radius:12px;margin:12px 0">'+
      '<strong>要対応　—</strong><p style="margin:8px 0 0">通知データ未接続（0件とは限りません）</p></div>'+
      '<h3>通知方針</h3>'+
      '<p>緊急・お金・期限付きタスク：必要なときに通知</p>'+
      '<p>通常の情報：Morning / Night に集約</p>'+
      '<p>完了済み・重複通知：除外</p>'+
      '<p style="font-size:12px;opacity:.7">設定の変更は、既存YOS Alertsとの接続後に有効になります。</p>'+
      '</section>');
  });
})();
