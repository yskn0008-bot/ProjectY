# YOSナビ v106 応答完全性の安全確認

## 目的

YOSナビのService Workerが、誤った転送先、誤ったContent-Type、空ファイル、HTMLへ化けたJavaScript、別アプリのHTML、旧ビルドの実行時診断資産をキャッシュへ採用しない既存条件を回帰テストで固定する。

## 変更内容

- `nav/tests/response-integrity-safety.test.mjs` を追加
- 実行時コードは変更しない
- YOSナビ以外のファイルは変更しない

## 固定する安全条件

1. 最終応答URLのoriginとpathnameが要求資産と一致すること
2. HTMLとJavaScriptが期待するContent-Typeであること
3. 空応答を拒否すること
4. JavaScript要求に対するHTML応答を拒否すること
5. HTMLに正式名称「YOSナビ」とアプリルートがあること
6. 実行時診断資産に現在ビルドの識別子があること
7. HTTP成功、URL、Content-Type、本文検査をすべて通過した応答だけをキャッシュへ採用すること

## 変更範囲

- `nav/tests/response-integrity-safety.test.mjs`
- `nav/YOS_NAV_V106_RESPONSE_INTEGRITY_SAFETY.md`

Taxi、Life、YOS、DB、乗車履歴、同期API、YOSナビの画面・地図・現在地取得・期待値計算・営業判断・外部ナビ遷移・Service Worker実行時処理は変更しない。

## 確認方法

GitHub Actionsの「YOSナビ Safety」で以下を確認する。

- 新規テストファイルの構文検査
- 応答完全性テスト全件の成功
- 既存YOSナビ安全回帰テスト全件の成功

## 未確認事項

- GitHub Actionsの最終結果
- main反映後の再実行結果
- iPhone SE3 Safariで、誤配信やCDN障害が発生した場合の実機挙動
- Vercel公開環境での応答ヘッダーと最終URL

## 名称ルール

唯一の人格・司令塔の正式名称は「YOS」とし、名称変更・言い換え・派生名への置換は行わない。
