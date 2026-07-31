# YOSナビ v65 変更記録

## 変更理由
PWAで現在どのService Workerが実際に制御中かを画面側から確認できず、v64反映確認が推測になっていたため。

## 変更内容
- Service Workerへ読み取り専用の状態応答を追加
- 診断画面からMessageChannelで現在のキャッシュ名を取得
- `swControlled`、`swCache`、`swBuildMatch`を診断項目へ追加
- YOSナビ本体の期待値計算・営業判断・現在地取得・地図座標は変更しない

## 確認結果
- 状態照会は `YOS_NAV_STATUS_REQUEST` のみに応答
- 営業データ、端末データ、DBを書き換えない
- 1秒以内に応答がない場合は診断値を未取得として継続

## 未確認
- iPhone SE3 PWAで `swControlled=true` になること
- `swCache=yos-navi-strategy-v65-sw-diagnostics` になること
- Service Worker更新直後の初回再読み込み
