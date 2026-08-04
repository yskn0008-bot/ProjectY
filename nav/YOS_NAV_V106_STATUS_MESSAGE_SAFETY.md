# YOSナビ v106 状態照会メッセージ安全記録

## 目的

YOSナビのService Worker状態照会が、専用要求にだけ応答し、要求元のMessagePort以外へ情報を送らず、キャッシュ内容や担当外機能を変更しない既存条件を回帰テストで固定する。

## 変更内容

- `nav/tests/status-message-safety.test.mjs`を追加
- 状態照会メッセージ種別を`YOS_NAV_STATUS_REQUEST`に限定
- 要求元が渡した先頭のMessagePortだけへ応答する条件を固定
- MessagePortがない要求には応答しない条件を固定
- 状態取得処理を`event.waitUntil`で完了まで保持する条件を固定
- 状態照会からキャッシュ削除・追加・更新・ネットワーク取得を行わない条件を固定
- 状態取得失敗時に安全側の診断値を返す条件を固定

## 変更範囲

- `/nav/`内のテストと記録のみ
- YOSナビの実行時コードは変更しない
- Taxi、Life、YOS、DB、乗車履歴、同期API、共通機能は変更しない

## 確認方法

GitHub Actions「YOSナビ Safety」で以下を確認する。

- 新規テストのJavaScript構文
- 既存YOSナビ安全回帰テストとの同時実行
- 専用メッセージ種別の限定
- MessagePortによる要求元限定応答
- キャッシュ内容・担当外資産を変更しないこと
- 失敗時の安全側診断値

## 未確認事項

- GitHub Actions「YOSナビ Safety」の結果
- Codex governanceの結果
- iPhone SE3 Safariで状態照会に応答できること
- MessagePortを持たない不正要求が無視されることの実機確認
- main反映後の再検査

## 固定名称ルール

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更・言い換え・派生名への置換は行わない。
