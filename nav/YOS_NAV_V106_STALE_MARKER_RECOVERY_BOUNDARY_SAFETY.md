# YOSナビ v106 旧世代マーカー復旧境界の安全記録

## 目的

YOSナビのService Workerが旧世代のネットワークマーカー付きJavaScript要求を受けた場合に、旧資産や別世代キャッシュへ戻さず、要求元画面だけで1回限りの安全な再読込を行う既存条件を回帰テストとして固定する。

## 今回の変更

- `nav/tests/stale-marker-recovery-boundary-safety.test.mjs` を追加した。
- 製品コード、Service Worker本体、画面、保存データ、外部設定は変更していない。
- 現行実装を作り直さず、旧世代マーカー復旧処理の境界だけを静的安全テストとして記録した。

## 固定した安全条件

1. 旧世代マーカーは専用の復旧JavaScript応答で処理を終了し、通常の資産配信へ流さない。
2. 復旧処理は専用の`sessionStorage`キーへ現行世代を記録し、同一世代での再読込を1回に限定する。
3. `sessionStorage`が利用できない場合も内部例外やスタックを公開しない。
4. 要求元画面へ`yos-nav-stale-marker-recovery`イベントを通知し、`location.reload()`以外の外部遷移を行わない。
5. 復旧応答は`application/javascript; charset=utf-8`、`no-store, max-age=0`、専用識別ヘッダーで返し、再利用可能なキャッシュ固定情報を付与しない。
6. 復旧処理からCache Storage、IndexedDB、localStorage、画面単位の配信先記録を変更しない。
7. Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能へ介入しない。

## 変更範囲

- `nav/tests/stale-marker-recovery-boundary-safety.test.mjs`
- `nav/YOS_NAV_V106_STALE_MARKER_RECOVERY_BOUNDARY_SAFETY.md`

`/nav/`内のテストと記録のみ。担当外ファイルの変更はない。

## 確認項目

- Node標準テストで旧世代マーカー分岐が専用復旧応答で終了することを確認する。
- 再読込の多重実行、内部例外公開、通常キャッシュへのフォールバックがないことを確認する。
- GitHub Actionsの`YOSナビ Safety`と`Codex governance`をPR上で確認する。

## 未確認事項

- iPhone SE3 Safariで旧世代マーカー検出時に再読込が1回だけ行われること。
- ホーム画面PWAとSafariタブで復旧記録が画面セッションごとに分離されること。
- `sessionStorage`制限時でも再読込ループや内部エラー表示が発生しないこと。
- Vercel/CDN更新境界で旧世代JavaScriptを実行せず現行世代へ復旧できること。
- 公開環境で担当外PWAや保存領域へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
