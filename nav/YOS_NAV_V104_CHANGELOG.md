# YOSナビ v104 変更記録

## 目的

v103では、検証済みネットワーク表示へ切り替えた画面をService Workerのメモリ上でクライアント単位に固定した。ただしService Workerが画面を閉じずに再起動した場合、メモリ上の固定情報が失われ、ネットワーク版HTMLの後続JavaScriptをキャッシュから返す可能性が残っていた。

v104では、ネットワーク版HTML内の承認済みJavaScript参照へ表示元マーカーを付与する。Service Worker再起動後も各リクエスト自身がネットワーク表示元を示し、HTMLとJavaScriptの取得元混在を防ぐ。

## 変更内容

- Service Workerのビルドを`v104`へ更新
- キャッシュ名を`yos-navi-strategy-v104-network-request-marker`へ更新
- 検証済みネットワーク版HTMLの全承認済みJavaScript参照へ`yos-nav-source=network-v104`を付与
- `network-v数字`形式のマーカー付き承認済み資産は、クライアント固定情報の有無にかかわらず検証済みネットワーク取得へ固定
- マーカー付き要求を受けた際はクライアントのネットワーク固定情報も再構築
- 診断へ`swNetworkSourceValue`、`pageNetworkMarker`、`pageNetworkMarkerActive`を追加
- YOSの正式名称、唯一の人格・司令塔としての役割は変更しない

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V104_CHANGELOG.md`

Taxi、Life、DB、乗車履歴、同期API、期待値計算、現在地取得、地図、営業判断、Google Maps遷移は変更しない。

## 確認結果

- `node --check nav/service-worker.js` 相当の構文確認を通過
- `node --check nav/runtime-diagnostics-v64.js` 相当の構文確認を通過
- ネットワーク版HTML生成前に既存の必須スクリプト不足・重複・構造検査を維持
- ネットワークマーカー付与後に全必須JavaScript参照へマーカーが存在することを検査
- キャッシュ保存用HTMLにはネットワークマーカーを付与しないため、既存のオフラインキャッシュ経路を維持

## 未確認事項

- iPhone SE3でv104 Service Workerが制御開始すること
- ネットワーク表示時に全承認済みJavaScript要求へ`yos-nav-source=network-v104`が付くこと
- Service Worker再起動後もマーカー付き要求がキャッシュへ切り替わらないこと
- 正常なキャッシュ表示時にネットワークマーカーが付かないこと
- オフライン再起動時の全必須機能
- 公開環境へのデプロイ反映
