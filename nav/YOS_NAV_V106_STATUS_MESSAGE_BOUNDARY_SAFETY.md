# YOSナビ v106 状態応答境界の安全記録

## 目的

YOSナビのService Workerが状態確認メッセージへ応答するとき、専用要求と要求元画面だけを扱い、全画面の配信先固定情報や内部エラー詳細、担当外機能を公開・変更しない既存条件を回帰テストとして保存する。

## 固定する安全条件

- `YOS_NAV_STATUS_REQUEST`以外のメッセージを処理しない。
- 返信用`MessagePort`がない要求では状態検査を開始しない。
- 配信先固定は`event.source.id`に一致する要求元画面の記録だけを参照する。
- 全画面の固定先一覧や内部Mapを応答へ含めない。
- 状態検査と終了済み画面の固定整理を`event.waitUntil()`内で完了してから応答する。
- 状態検査失敗時は安全な固定値と`status-unavailable`だけを返し、例外メッセージやスタックを公開しない。
- 状態応答処理からキャッシュ本体、YOSナビの製品状態、Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能を変更しない。

## 変更範囲

- `nav/tests/status-message-boundary-safety.test.mjs`
- `nav/YOS_NAV_V106_STATUS_MESSAGE_BOUNDARY_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

Taxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能にも変更を加えない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の最終結果。
- Codex governanceの最終結果。
- PRの競合と未解決レビュー。
- iPhone SE3 Safariで状態要求を連続送信した場合に、要求元画面の状態だけが返ること。
- ホーム画面PWAとSafariタブを同時利用した場合に、一方の固定情報が他方へ返らないこと。
- 公開環境で状態検査失敗時に内部エラー詳細が露出しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
