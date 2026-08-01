# YOSナビ v95 変更記録

## 目的

YOSナビの必須スクリプトがHTML内で重複参照された場合に、同じ処理が複数回実行される状態を防ぐ。

## 変更内容

- 必須スクリプトの参照数を個別に数える検査を追加。
- 同一の必須スクリプトが2回以上参照されている場合、`navigation-script-reference-duplicated`として不正判定。
- スクリプト補完前と補完後の両方で同じ構造検査を実施。
- Service Workerのキャッシュ識別子と実行時診断をv95へ同期。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V95_CHANGELOG.md`

YOSの正式名称、唯一の人格・司令塔としての役割、期待値計算、現在地取得、地図、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更しない。

## 確認結果

- 現在の`nav/index.html`では、直接記載されている必須スクリプト参照に重複がないことを確認。
- 不足スクリプトは従来どおり`</body>`直前へ1回だけ補完される。
- 補完後にも重複検査を再実行するため、二重実行可能なHTMLを返さない。
- 変更対象を`/nav/`内の3ファイルに限定。

## 未確認事項

- iPhone SE3でv95 Service Workerが制御開始すること。
- `swBuildMatch=true`、`swOfflineReady=true`になること。
- 必須スクリプトを重複させた検証用HTMLが新版として有効化されないことの実機確認。
- オフライン再起動時の全必須機能。
- 公開環境へのデプロイ反映。
