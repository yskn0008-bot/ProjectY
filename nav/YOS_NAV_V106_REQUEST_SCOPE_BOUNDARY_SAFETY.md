# YOSナビ v106 要求スコープ境界の安全記録

## 目的

YOSナビのService Workerが、同一originかつ`/nav/`スコープ内のナビゲーションと承認済み実行資産だけを専用配信対象とし、担当外パス、外部origin、未承認資産へ介入しない既存条件を回帰テストとして固定する。

## 今回の変更

- `nav/tests/request-scope-boundary-safety.test.mjs`を追加した。
- 製品コード、Service Worker本体、画面、保存データ、外部設定は変更していない。
- 現行実装を作り直さず、要求URLの境界判定だけを静的安全テストとして記録した。

## 固定した安全条件

1. 要求URLは同一originかつ`NAV_SCOPE_PATH`配下の場合だけYOSナビ相対パスへ変換する。
2. 外部originまたはYOSナビのスコープ外パスは`null`として専用配信対象から除外する。
3. 実行資産は`STATIC`への完全一致がある場合だけ承認する。
4. ネットワークマーカーは専用query parameter `yos-nav-source`から取得し、`network-v数字`の厳格な形式だけを世代マーカーとして扱う。
5. ナビゲーション対象はYOSナビのルートと`index.html`だけに限定する。
6. 担当外要求の判定からCache Storage、localStorage、sessionStorage、IndexedDB、画面単位配信先、外部遷移を変更しない。
7. Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能へ介入しない。

## 変更範囲

- `nav/tests/request-scope-boundary-safety.test.mjs`
- `nav/YOS_NAV_V106_REQUEST_SCOPE_BOUNDARY_SAFETY.md`

`/nav/`内のテストと記録のみ。担当外ファイルの変更はない。

## 確認項目

- Node標準テストでorigin、パス、承認資産、マーカー形式の境界を確認する。
- GitHub Actionsの`YOSナビ Safety`と`Codex governance`をPR上で確認する。
- PR差分が`/nav/`内2ファイルだけであることを確認する。

## 未確認事項

- iPhone SE3 SafariでYOSナビ外の同一originパスへService Worker固有処理が波及しないこと。
- ホーム画面PWAとSafariタブで外部origin資産が専用キャッシュ配信へ取り込まれないこと。
- URLエンコード、query、hashを含む要求が未承認資産として安全に通常処理されること。
- Vercel/CDN公開環境でYOSナビ以外のPWAや保存領域へ影響しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
