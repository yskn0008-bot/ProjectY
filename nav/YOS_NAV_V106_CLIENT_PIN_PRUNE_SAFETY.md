# YOSナビ v106 終了画面固定解除の安全記録

## 目的

YOSナビのService Workerが画面別の配信先固定を整理するとき、終了済み画面の記録だけを解除し、稼働中画面・キャッシュ本体・担当外機能へ影響しない既存条件を回帰テストで固定する。

## 固定した安全条件

- `window`クライアントを`includeUncontrolled: true`で取得してから整理する。
- 現在存在するクライアントIDを集合化し、稼働中画面を判定する。
- `CLIENT_SERVING_CACHES`のうち、現在存在しないクライアントIDだけを削除する。
- 稼働中画面の現行キャッシュ固定・直前有効キャッシュ固定・ネットワーク固定を維持する。
- `CLIENT_SERVING_CACHES.clear()`による一括解除を行わない。
- キャッシュ本体の保存・削除、Service Workerの更新・登録解除を行わない。
- Taxi、Life、YOS、serverのパス・キャッシュ・状態を直接参照しない。
- 整理後は残っている画面別固定数だけを診断値として返す。

## 変更範囲

- `nav/tests/client-serving-pin-prune-safety.test.mjs`
- `nav/YOS_NAV_V106_CLIENT_PIN_PRUNE_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

Taxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能は変更しない。

## 確認方法

```bash
node --test nav/tests/client-serving-pin-prune-safety.test.mjs
```

GitHub Actionsでは既存のYOSナビ SafetyとCodex governanceによる確認を行う。

## 未確認事項

- iPhone SE3 SafariでYOSナビ画面を閉じた後、終了画面の固定だけが解除されること。
- ホーム画面PWAとSafariタブを同時利用した場合、稼働中画面の配信先固定が維持されること。
- Service Worker更新境界で、終了画面の記録整理が担当外PWAへ影響しないこと。
- main反映後のGitHub Actionsと公開環境での再確認。

## 正式名称

唯一の人格・司令塔の正式名称は「YOS」とする。明確な名称変更指示がない限り、チャット名、タスク名、画面名、役割名を含めて変更・言い換え・派生名への置換を行わない。
