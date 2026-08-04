# YOSナビ v106 旧ネットワークマーカー復旧の安全記録

## 目的

YOSナビの更新境界で、旧世代のネットワーク配信マーカーを持つ承認済みJavaScript要求だけを安全に復旧し、無限再読込、担当外通信への介入、復旧応答の保存を防ぐ既存条件を回帰テストとして保存する。

## 固定する安全条件

- 復旧対象は`network-v数字`形式かつ現行世代ではないマーカーだけに限定する。
- YOSナビのService Worker範囲内で、`STATIC`登録済みの承認済み実行資産だけを復旧対象にする。
- Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能の要求へ直接介入しない。
- 復旧スクリプトは`sessionStorage`へ現行世代を記録してから再読込し、同一画面での無限再読込を防ぐ。
- 復旧応答はJavaScriptとして返し、`Cache-Control: no-store, max-age=0`で保存させない。
- 復旧応答をYOSナビのCache Storageへ追加・更新・削除しない。
- 通知イベントは`yos-nav-stale-marker-recovery`に固定し、担当外の保存データを変更しない。

## 変更範囲

- `nav/tests/stale-network-marker-recovery-safety.test.mjs`
- `nav/YOS_NAV_V106_STALE_NETWORK_MARKER_RECOVERY_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

Taxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能にも変更を加えない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の最終結果。
- Codex governanceの最終結果。
- PRの競合と未解決レビュー。
- iPhone SE3 Safariで旧マーカー付きJavaScript要求が一度だけ再読込されること。
- ホーム画面PWAとSafariタブで復旧済み状態が画面単位に分離されること。
- Vercel/CDN更新境界で復旧応答が中間キャッシュへ保存されないこと。
- 公開環境で担当外PWAの通信へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
