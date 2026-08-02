# YOSナビ v106 HTML資産参照安全検査

## 目的

YOSナビの`index.html`に追加・変更されるローカル外部JavaScriptが、Service Workerの承認済み静的資産と一致していることを継続検査する。

## 変更内容

- `nav/tests/html-script-reference-safety.test.mjs`を追加
- `index.html`内のローカル外部JavaScript参照の重複を検査
- `STATIC`マニフェスト未承認のJavaScript参照を検出
- クエリ、ハッシュ、階層移動を含む安全でない参照を検出
- HTMLへ直書きされたJavaScriptの読込順序が`STATIC`順序を維持することを検査
- Service Worker登録先が`./service-worker.js`であることを検査

## 変更範囲

- `/nav/`内のテストと記録のみ
- YOSナビの実行時コードは変更しない
- Taxi、Life、DB、乗車履歴、同期APIは変更しない
- YOSの正式名称と唯一の人格・司令塔としての役割は変更しない

## 確認方法

既存のGitHub Actions「YOSナビ Safety」が`nav/tests/*.test.mjs`を一括実行するため、追加のワークフロー変更は不要。

## 未確認事項

- Pull Request上でのGitHub Actions実行結果
- main反映後のGitHub Actions再実行結果
- iPhone SE3でのv106実機挙動
- 公開環境への反映状況
