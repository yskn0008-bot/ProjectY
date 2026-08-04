# YOSナビ v106 古いネットワークマーカー復旧安全記録

## 目的

YOSナビのHTMLが現行Service Workerより古いネットワーク由来マーカーを持つ場合に、誤った世代のJavaScriptを継続利用せず、安全に1回だけ再読込する既存処理を回帰テストで固定する。

## 変更内容

- `nav/tests/stale-network-marker-safety.test.mjs`を追加
- YOSナビ専用query parameter `yos-nav-source`の利用を固定
- `network-v数字`形式だけをネットワーク由来マーカーとして扱う条件を固定
- 現行マーカーは復旧対象外、古いマーカーだけを復旧対象とする条件を固定
- `sessionStorage`により1セッション1回だけ再読込する条件を固定
- 復旧応答をJavaScript、`no-store`、専用レスポンスヘッダーに限定
- 復旧イベント名を`yos-nav-stale-marker-recovery`に固定

## 変更範囲

- `/nav/`内のテストと記録のみ
- YOSナビの実行時コードは変更しない
- Taxi、Life、YOS、DB、乗車履歴、同期API、共通機能は変更しない

## 確認方法

GitHub Actions「YOSナビ Safety」で以下を確認する。

- 新規テストのJavaScript構文
- 既存YOSナビ安全回帰テストとの同時実行
- 古いネットワークマーカー判定
- 無限再読込防止
- 復旧応答のContent-Type、Cache-Control、専用ヘッダー
- 担当外名称・機能への依存がないこと

## 未確認事項

- GitHub Actions「YOSナビ Safety」の結果
- Codex governanceの結果
- iPhone SE3 Safariで古いHTMLを保持した状態からの実機復旧
- Vercel/CDN更新境界での実際のマーカー不一致再現
- main反映後の再検査

## 固定名称ルール

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更・言い換え・派生名への置換は行わない。
