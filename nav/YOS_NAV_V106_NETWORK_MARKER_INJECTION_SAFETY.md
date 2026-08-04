# YOSナビ v106 ネットワークマーカー付与の安全記録

## 目的

YOSナビがネットワーク配信へ切り替えるHTML応答について、承認済み必須スクリプトだけへ現行世代の専用マーカーを一貫して付与し、世代混在、部分付与、担当外機能への介入を防ぐ既存条件を安全回帰テストとして保存する。

## 固定する安全条件

- マーカー付与対象は`REQUIRED_SCRIPTS`に登録されたYOSナビ必須JavaScriptだけとする。
- 付与値は専用query parameter `yos-nav-source`と現行値`network-${BUILD}`を使用する。
- 既存queryまたはhash付き参照は残さず、現行の専用マーカーへ正規化する。
- 全必須スクリプトへの付与完了を検査し、未完了が1件でもあればHTML応答を返さない。
- HTMLを書き換えた応答は`text/html; charset=utf-8`かつ`no-cache`とし、`Content-Length`、`Content-Encoding`、`ETag`を引き継がない。
- マーカー付与処理からCache Storage、IndexedDB、localStorage、sessionStorage、再読込、追加通信を行わない。
- Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能へ直接介入しない。

## 変更範囲

- `nav/tests/network-marker-injection-safety.test.mjs`
- `nav/YOS_NAV_V106_NETWORK_MARKER_INJECTION_SAFETY.md`

YOSナビの製品コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

担当外のTaxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能にも変更を加えない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の最終結果。
- Codex governanceの最終結果。
- PRの競合と未解決レビュー。
- iPhone SE3 Safariでネットワーク配信HTMLが全必須スクリプトを同一世代で読み込むこと。
- ホーム画面PWAとSafariタブで更新境界を跨いでも旧queryやhashが残らないこと。
- Vercel/CDNで書換え後HTMLが古いETagや圧縮後長さを再利用しないこと。
- 公開環境で担当外PWAの通信・保存領域へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
