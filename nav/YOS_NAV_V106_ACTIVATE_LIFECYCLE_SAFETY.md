# YOSナビ v106 activate工程の安全記録

## 目的

YOSナビのService Workerが新しい世代を有効化するとき、オフライン完成状態を確認せず画面へ適用したり、担当外の機能へ直接干渉したりしない既存条件を回帰テストで固定する。

唯一の人格・司令塔の正式名称は「YOS」のまま維持する。名称、チャット名、画面名、タスク名、役割名を変更・言い換え・派生名へ置換しない。

## 固定する安全条件

1. `activate`開始時に現行YOSナビキャッシュのオフライン完成状態を確認する。
2. 完成状態でない場合は`offline-cache-invalid-before-activate`として拒否する。
3. 完成確認後だけ`clients.claim()`で既存画面へ新Service Workerを適用する。
4. 画面適用後、YOSナビ専用の古いキャッシュ整理を実行する。
5. キャッシュ整理後、終了済み画面の配信先固定情報だけを削除する。
6. `activate`処理からTaxi、Life、YOS、serverのパスやキャッシュを直接操作しない。
7. 実際の削除条件は既存の`cleanupStaleCaches()`へ集約し、`activate`内へ個別削除を追加しない。

## 変更範囲

- `nav/tests/activate-lifecycle-safety.test.mjs`
- `nav/YOS_NAV_V106_ACTIVATE_LIFECYCLE_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

Taxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能は変更しない。

## 確認方法

GitHub Actions「YOSナビ Safety」で、新規テストを含む`nav/tests/*.test.mjs`の構文検査と実行結果を確認する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の結果
- Codex governanceの結果
- PRの競合と未解決レビュー
- iPhone SE3 SafariでService Worker更新直後に既存画面が正常継続すること
- ホーム画面PWAとSafariタブが同時に開いている状態で、終了画面だけが固定解除されること
- main反映後の再検査
