# YOSナビ v106 ネットワーク移行トランザクション安全記録

## 目的

YOSナビがキャッシュ配信からネットワーク配信へ移行する際、検証前のHTMLやJavaScriptを返さず、要求元画面だけを同一のネットワーク配信へ固定する既存条件を安全回帰テストとして保存する。

## 固定する安全条件

- ネットワークHTMLは`cache: 'no-cache'`で取得する。
- HTML応答のURL、Content-Type、本文、YOSナビ固有識別を検証してから使用する。
- 検証後に必須スクリプトを補完し、その後で現行世代の専用ネットワークマーカーを付与する。
- 有効なキャッシュ応答がある場合は、その画面をネットワーク配信へ切り替えない。
- キャッシュ配信不能時だけ、要求元の`clientId`をネットワーク配信へ固定してから検証済みHTMLを返す。
- 現行ネットワークマーカー付きの承認済み資産だけが、要求元画面をネットワーク配信へ固定する。
- 全画面の配信先固定を一括変更しない。
- 移行処理からCache Storageの更新・削除、IndexedDB、localStorage、sessionStorage、外部遷移を行わない。
- Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能へ直接介入しない。

## 変更範囲

- `nav/tests/network-transition-transaction-safety.test.mjs`
- `nav/YOS_NAV_V106_NETWORK_TRANSITION_TRANSACTION_SAFETY.md`

YOSナビの製品コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

担当外のTaxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能にも変更を加えない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の最終結果。
- Codex governanceの最終結果。
- PRの競合と未解決レビュー。
- iPhone SE3 Safariで、キャッシュ配信不能時に要求元画面だけがネットワーク配信へ切り替わること。
- ホーム画面PWAとSafariタブで配信先固定が相互に波及しないこと。
- Vercel/CDN更新境界で検証前のHTMLまたはJavaScriptが表示されないこと。
- 公開環境で担当外PWAの通信・保存領域へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
