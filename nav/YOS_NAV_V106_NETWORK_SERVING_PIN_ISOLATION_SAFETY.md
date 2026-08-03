# YOSナビ v106 ネットワーク配信先固定の分離安全記録

## 目的

YOSナビのService Workerがネットワーク配信へ切り替えた画面を、他のSafariタブやホーム画面PWAと混同せず、要求元の画面単位で固定する既存条件を回帰テストとして保存する。

## 固定する安全条件

- ネットワーク配信先はYOSナビ専用定数`__YOS_NAV_NETWORK__`で識別する。
- 配信先固定は`clientId`単位で`CLIENT_SERVING_CACHES`へ保存する。
- 1画面のネットワーク固定を全画面へ拡張しない。
- ネットワーク固定中の画面は、HTMLと承認済み実行資産を同じネットワーク世代から取得する。
- 強制ネットワーク取得は要求元画面だけを固定する。
- キャッシュ整理時も稼働中画面のネットワーク固定を保持する。
- `CLIENT_SERVING_CACHES.clear()`による全画面一括解除を行わない。
- Taxi、Life、YOS、server、DB、乗車履歴、同期API、共通機能を直接操作しない。

## 変更範囲

- `nav/tests/network-serving-pin-isolation-safety.test.mjs`
- `nav/YOS_NAV_V106_NETWORK_SERVING_PIN_ISOLATION_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

## 確認方法

GitHub Actions「YOSナビ Safety」で新規テストと既存の安全回帰テストを実行する。

## 未確認事項

- iPhone SE3 Safariで更新前後のタブを同時利用した際、ネットワーク固定が画面単位で分離されること。
- ホーム画面PWAとSafariタブを同時利用した際、一方のネットワーク固定が他方へ波及しないこと。
- Vercel/CDN更新境界でHTMLとJavaScriptが同じ配信先に維持されること。
- 公開環境でTaxi、Life、YOSのPWA通信へ介入しないこと。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」。ユーザーから明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて名称変更、言い換え、派生名への置換を行わない。
