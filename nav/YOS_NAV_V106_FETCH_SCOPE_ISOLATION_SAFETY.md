# YOSナビ v106 fetch範囲分離 安全記録

## 目的

YOSナビのService Workerが、YOSナビ専用画面と承認済み実行資産だけを専用処理し、Taxi・Life・YOS・server・共通機能など担当外の通信へ介入しない条件を回帰テストで固定する。

正式名称は「YOS」。唯一の人格・司令塔としての名称・役割・画面名は変更しない。

## 今回の変更

製品コードは変更せず、既存の`nav/service-worker.js`が持つfetch処理の境界を自動試験として追加した。

追加ファイル：

- `nav/tests/fetch-scope-isolation-safety.test.mjs`
- `nav/YOS_NAV_V106_FETCH_SCOPE_ISOLATION_SAFETY.md`

## 固定する安全条件

1. GET以外のリクエストへ介入しない。
2. YOSナビのService Workerスコープ内で、`./`または`./index.html`へのナビゲーションだけをYOSナビ画面配信へ渡す。
3. `STATIC`に登録済みの承認資産だけをYOSナビのキャッシュ配信対象にする。
4. 担当外リクエストはキャッシュへ保存・削除せず、`cache: 'no-cache'`の通常ネットワーク取得へ委譲する。
5. fetchイベント内からTaxi・Life・YOS・serverのパスやキャッシュへ直接依存しない。
6. 画面別配信先固定、古いネットワークマーカー復旧、インストール失敗時ロールバックの既存条件を変更しない。

## 変更しない範囲

- YOSナビの実行時コード
- 画面・地図・現在地取得
- 期待値計算・営業判断
- 外部ナビ遷移
- `/taxi/`
- `/life/`
- `/yos/`
- `/server/`
- DB・乗車履歴・同期API
- 共通ファイル

## 確認方法

```text
node --test nav/tests/fetch-scope-isolation-safety.test.mjs
```

既存のYOSナビ Safetyでも`nav/tests/*.test.mjs`として実行対象になることを前提とする。

## 未確認事項

- GitHub Actions上のYOSナビ Safety結果
- Codex governance結果
- iPhone SE3 Safariで担当外URLへ遷移した場合の実機通信
- ホーム画面PWAとSafariタブを同時利用した場合のスコープ分離
- Vercel公開環境でTaxi・Life・YOSの通信へ介入しないこと
- main反映後の再検査
