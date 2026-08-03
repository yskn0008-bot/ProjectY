# YOSナビ v106 キャッシュ整理範囲の安全記録

## 目的

YOSナビのService Worker更新時に、現行キャッシュと検証済みの直前キャッシュを保持し、YOSナビ専用の不要キャッシュだけを整理する既存条件を回帰テストで固定する。

唯一の人格・司令塔の正式名称は「YOS」のまま維持する。チャット名、タスク名、画面名、役割名を含めて名称を変更・言い換え・派生名へ置換しない。

## 固定する安全条件

1. キャッシュ削除前に、現存するキャッシュ一覧から検証済みの直前キャッシュを選定する。
2. 削除対象は`CACHE_PREFIX`に一致するYOSナビ専用キャッシュだけに限定する。
3. 現行キャッシュ`CACHE`と選定済みの直前キャッシュ`previousCache`を削除しない。
4. Taxi、Life、YOS、serverなど担当外のパスやキャッシュ名を直接参照しない。
5. 画面別配信先固定は、現行・直前有効・ネットワーク固定以外だけを解除する。
6. `CLIENT_SERVING_CACHES.clear()`による一括解除を行わない。
7. 整理結果として選定済みの直前キャッシュを返し、後続処理が同じ判断を利用できる状態を維持する。

## 変更範囲

- `nav/tests/cache-cleanup-scope-safety.test.mjs`
- `nav/YOS_NAV_V106_CACHE_CLEANUP_SCOPE_SAFETY.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更しない。

Taxi、Life、YOS、DB、乗車履歴、同期API、server、共通機能は変更しない。

## 確認方法

GitHub Actions「YOSナビ Safety」で、新規テストを含む`nav/tests/*.test.mjs`の構文検査と全安全回帰テストを実行する。

## 未確認事項

- GitHub Actions「YOSナビ Safety」の結果
- Codex governanceの結果
- PRの競合と未解決レビュー
- iPhone SE3 SafariでService Worker更新後も旧画面が検証済み直前キャッシュを継続利用できること
- Vercel/CDN更新境界で担当外PWAのキャッシュが削除されないこと
- main反映後の再検査
