# YOSナビ v77 変更記録

## 目的
オフライン用キャッシュに、HTTP 200かつ空ではないものの、HTMLエラーページなど誤った種類の内容が保存されるケースを検出・防止する。

## 変更内容
- Service Workerキャッシュを `yos-navi-strategy-v77-content-type-validation` へ更新。
- `index.html` は `text/html`、必須JavaScriptはContent-Typeに `javascript` を含むことを確認。
- 初回キャッシュ作成時、Content-Typeが不正な任意資産は保存しない。
- `index.html` の応答がHTTPエラーまたはHTMLではない場合、Service Workerのインストールを成功扱いにしない。
- 通常のネットワーク取得で必須資産を更新する際も、不正なContent-Typeの応答をキャッシュへ上書きしない。
- 診断で不正な場合は `swInvalidCriticalAssets` に `<path>:content-type-<type>` として記録し、`swOfflineReady=false` とする。
- 診断側のビルド番号と期待キャッシュ名をv77へ統一。

## 変更範囲
- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V77_CHANGELOG.md`

`/nav/` 以外は変更していない。

## 変更していないもの
- YOSの正式名称、人格、司令塔仕様
- 期待値計算、営業判断、推奨順位
- 現在地取得、地図座標、Google Maps遷移
- Taxi、Life、DB、乗車履歴、同期API
- 更新通知の操作仕様

## 確認結果
- v77のService Workerキャッシュ名と診断側の期待値が一致。
- 既存の欠落、HTTPエラー、空ファイル、読み取り不能の検出を維持。
- Content-Type検査は必須HTML・JavaScriptに限定。
- 不正応答を検出しても既存キャッシュの削除や画面の自動再読み込みは行わない。

## 未確認事項
- iPhone SE3で正常時に `swOfflineReady=true` になること。
- 実機で誤ったContent-Type相当の応答が `swInvalidCriticalAssets` に表示されること。
- PWA更新後にv77 Service Workerが制御中になること。
- オフライン再起動時の実読み込み。
- Vercel公開環境への反映状況。
