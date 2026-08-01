# YOSナビ v106 変更記録

## 目的

v105では、古いネットワークマーカー付きJavaScript要求を拒否して世代混在を防止した。ただし、Service Worker更新時に既に開いている古い画面はJavaScript読込に失敗し、手動再読込が必要になる可能性があった。

v106では、古いマーカーを検出した場合に承認済みJavaScriptの代わりとして最小の復旧スクリプトを返し、同じ画面を1回だけ再読込して現行世代へ揃える。

## 変更内容

- Service Workerと実行時診断をv106へ更新
- 古い`network-v*`マーカー要求に対し、通常資産・キャッシュ・ネットワーク資産を返さない既存方針を維持
- 代わりに`no-store`の最小JavaScript復旧応答を返す
- `sessionStorage`の世代別ガードにより、同一世代で再読込は1回だけ
- 復旧前に`yos-nav-stale-marker-recovery`イベントを発火
- 応答へ`X-YOS-Nav-Recovery: stale-network-marker`を付与
- 診断へ`swStaleMarkerRecovery`を追加し、復旧機能が有効な場合のみREADY判定可能に変更

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V106_CHANGELOG.md`

`/nav/`以外は変更しない。

## 維持した仕様

- 正式名称は「YOS」
- YOSは唯一の人格・司令塔
- Taxi、Life、DB、乗車履歴、同期API、期待値計算、現在地取得、地図、営業判断、Google Maps遷移は変更しない
- 古いHTMLと新しいJavaScriptを混在させない
- キャッシュ表示とネットワーク表示を同一画面内で混在させない

## 確認結果

- 変更ファイルは`/nav/`配下3件のみ
- v106のBUILD、キャッシュ名、診断グローバル識別子が一致
- 古いマーカー経路は通常資産取得へフォールバックしない
- 復旧応答はJavaScript Content-Type、`no-store`、HTTP 200
- 再読込ガードはv106固有キーと現行マーカー値を使用

## 未確認事項

- iPhone SE3でv106 Service Workerが制御開始すること
- v105のネットワーク画面を開いたままv106へ更新した際、自動再読込が1回だけ実行されること
- 再読込後に全JavaScriptがv106または同一の検証済みキャッシュへ揃うこと
- 複数の古いJavaScript要求が同時発生しても再読込ループにならないこと
- オフライン中に古いネットワーク画面が残った場合の実機挙動
- オフライン再起動時の全必須機能
- 公開環境へのデプロイ反映
