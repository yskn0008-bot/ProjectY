# YOSナビ v106 状態応答境界の安全確認

## 目的

YOSナビのService Workerが返す状態情報について、要求元画面だけに必要最小限の診断情報を返し、別画面の識別子、保存内容、内部例外、担当外機能へ境界を広げない現行条件を固定する。

## 今回の変更

- `nav/tests/status-report-boundary-safety.test.mjs` を追加した。
- 製品コード、Service Worker本体、保存データ、外部設定は変更していない。
- 現行実装を作り直さず、既存の安全境界を静的回帰テストとして記録した。

## 固定した安全条件

1. `YOS_NAV_STATUS_REQUEST` 以外のmessageは処理しない。
2. 専用の返信ポートがない要求には応答しない。
3. 画面固有の配信先は要求元の `event.source.id` だけから取得する。
4. 他画面のclient IDや配信先一覧を状態応答へ含めない。
5. キャッシュ本文、localStorage、sessionStorage、IndexedDBの内容を読み出して返さない。
6. 状態取得失敗時は内部例外やスタックを公開せず、固定形式の失敗状態を返す。
7. 状態応答処理からCache Storage、永続データ、外部遷移を変更しない。
8. Taxi、Life、YOS、server、DB、乗車履歴、同期APIへ介入しない。

## 変更範囲

- `nav/tests/status-report-boundary-safety.test.mjs`
- `nav/YOS_NAV_V106_STATUS_REPORT_BOUNDARY_SAFETY.md`

`/nav/` 内のテストと記録のみ。担当外ファイルの変更はない。

## 確認項目

- Node標準テストで状態応答処理の専用メッセージ境界を確認する。
- 要求元画面以外の識別情報を列挙・返信しないことを確認する。
- 内部例外、保存内容、担当外機能への介入がないことを確認する。
- GitHub ActionsのYOSナビ SafetyとCodex governanceをPR上で確認する。

## 未確認事項

- iPhone SE3 Safariで状態表示が要求元画面の配信先だけを示すこと。
- ホーム画面PWAとSafariタブを同時利用した際、他画面の配信先情報が混入しないこと。
- Service Worker更新直後に状態要求が失敗しても、内部例外が画面へ表示されないこと。
- Vercel/CDN更新境界と公開環境での実動作。
- 公開環境で担当外PWAや保存領域へ影響しないこと。

正式名称は「YOS」。唯一の人格・司令塔としての位置づけを変更しない。
