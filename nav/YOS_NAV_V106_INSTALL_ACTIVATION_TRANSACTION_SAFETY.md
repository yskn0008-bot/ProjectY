# YOSナビ v106 install・activateトランザクション安全記録

## 目的

YOSナビのService Worker更新時に、不完全な現行キャッシュを有効化せず、検証済みの重要資産が揃った後だけ新しいService Workerへ切り替える既存条件を安全回帰テストとして保存する。

## 固定する安全条件

- installでは現行キャッシュを開き、全重要資産を取得・検証・保存する。
- 保存後にオフラインキャッシュ全体の完全性を再検査する。
- `offlineReady`が成立した後だけ`skipWaiting()`を実行する。
- install失敗時は不完全な現行キャッシュだけを削除し、元の失敗を再送出する。
- install失敗時に旧キャッシュ、画面別配信先固定、担当外キャッシュを一括削除しない。
- activateでは現行キャッシュの完全性を確認した後だけ`clients.claim()`を実行する。
- claim後に旧キャッシュ整理を行い、その後に終了済み画面の配信先固定だけを整理する。
- install・activate境界からIndexedDB、localStorage、sessionStorage、外部遷移、担当外機能へ介入しない。
- Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能を変更しない。

## 変更範囲

- `nav/tests/install-activation-transaction-safety.test.mjs`
- `nav/YOS_NAV_V106_INSTALL_ACTIVATION_TRANSACTION_SAFETY.md`

YOSナビの製品コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

担当外のTaxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能にも変更を加えない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の最終結果。
- Codex governanceの最終結果。
- PRの競合と未解決レビュー。
- iPhone SE3 Safariで更新途中に通信が失敗した場合、旧Service Workerが継続利用できること。
- ホーム画面PWAとSafariタブを同時利用中に、不完全な新Service Workerがclaimされないこと。
- Vercel/CDN更新境界で一部資産だけ新世代になった状態を有効化しないこと。
- 公開環境で担当外PWAのキャッシュ・通信・保存領域へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
