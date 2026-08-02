# YOSナビ v106 STATICマニフェスト安全検査

## 目的

YOSナビのService Workerがオフライン必須資産として列挙するファイルについて、ファイル削除・名称変更・世代同期漏れをPull Request段階で検出する。

## 変更範囲

- `nav/tests/static-manifest-safety.test.mjs`
- `.github/workflows/yos-nav-safety.yml`
- 本記録

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断、Taxi、Life、DB、乗車履歴、同期APIは変更しない。

## 追加検査

1. `STATIC`マニフェスト内の重複検出
2. 列挙資産がすべて`/nav/`直下に実在し、読み取り可能であること
3. `index.html`が正式名称「YOSナビ」とアプリルートを維持すること
4. 実行時診断ファイルの`BUILD`と公開識別子がService Worker世代と一致すること
5. `REQUIRED_SCRIPTS`と`CRITICAL_ASSETS`が`STATIC`から安全に自動生成されること
6. GitHub Actionsで既存回帰テストと新規検査を一括実行すること

## 安全性

- テストとCI定義のみの変更
- 実行時挙動への影響なし
- 外部パッケージ追加なし
- GitHub Actions権限は既存の`contents: read`を維持
- YOSの正式名称と唯一の人格・司令塔としての役割を維持

## 確認結果

- ブランチ作成元: `main`
- 変更対象は`/nav/`のテスト・記録とYOSナビ専用ワークフローのみ
- JavaScript構文検査対象へ新規テストを追加
- テスト実行対象を`nav/tests/*.test.mjs`へ拡張

## 未確認事項

- Pull Request上のGitHub Actions実行結果
- main反映後のGitHub Actions実行結果
- iPhone SE3でのv106実機挙動（今回の変更は実行時コードを変更しないため、新規影響は想定しない）
- 公開環境への反映状況
