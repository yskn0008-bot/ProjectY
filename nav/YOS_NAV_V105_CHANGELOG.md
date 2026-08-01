# YOSナビ v105 変更記録

## 変更目的

v104では、`yos-nav-source`が`network-v数字`の形式であれば、現在のService Worker世代と一致しない古いマーカーでもネットワーク取得として受理していた。

Service Worker更新後に古い画面が遅れてJavaScriptを要求した場合、古いHTMLと新しいJavaScriptが混在する可能性が残るため、ネットワーク取得元マーカーを現在のビルドへ厳密に固定する。

## 変更内容

- Service Workerをv105へ更新
- 現在のマーカー`network-v105`だけをネットワーク固定要求として受理
- `network-v104`など現在世代と一致しないマーカー付き承認済みJavaScript要求をエラー応答で停止
- 古いマーカー要求が通常キャッシュや無印ネットワーク取得へ迂回する経路を停止
- 診断へ以下を追加
  - `pageNetworkMarkerValid`
  - `pageNetworkMarkerCurrent`
  - `pageNetworkMarkerStale`
- 古いネットワークマーカーが検出された画面を`READY`判定しないよう変更

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V105_CHANGELOG.md`

YOSの正式名称、唯一の人格・司令塔としての役割、期待値計算、現在地取得、地図、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- 変更範囲を`/nav/`内の3ファイルに限定
- v105のService Workerビルド値と診断ビルド値を一致
- v105のキャッシュ名と診断側の期待キャッシュ名を一致
- 現在マーカーは検証済みネットワーク取得へ固定
- 古い世代のマーカーはキャッシュ・ネットワークのどちらにもフォールバックせず停止
- マーカーなし要求は従来の検証済みキャッシュ選択を維持
- YOSの名称を変更・言い換え・派生名へ置換していない

## 未確認事項

- iPhone SE3でv105 Service Workerが制御開始すること
- 正常なネットワーク表示で`pageNetworkMarkerCurrent=true`となること
- `network-v104`付き要求がv105で拒否されること
- 古い画面を開いたままService Workerを更新した場合の表示挙動
- オフライン再起動時の全必須機能
- 公開環境へのデプロイ反映
