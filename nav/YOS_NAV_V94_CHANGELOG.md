# YOSナビ v94 変更記録

## 目的

検証済みキャッシュ内の `index.html` が、YOSナビとしての基本識別には合格していても、必須スクリプトの補完に必要な `</body>` を失っている場合に `offlineReady=true` と判定される余地を閉じる。

## 変更内容

- キャッシュ済み `index.html` に対して、必須スクリプト参照と `</body>` の補完可能性を再検査する処理を追加。
- 必須スクリプトが不足し、かつ `</body>` が存在しない場合は `navigation-body-close-missing` として不正判定。
- インストール直後、activate直前、状態照会、実行時キャッシュ利用のすべてで同じ構造検査を使用。
- 実行時診断のビルド番号と期待キャッシュ名を v94 に同期。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V94_CHANGELOG.md`

YOSの正式名称、唯一の人格・司令塔としての役割、期待値計算、現在地取得、地図、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- 変更対象は `/nav/` 内の3ファイルのみ。
- キャッシュ検査でHTML本文検査後にナビゲーション構造検査が実行されることをコード上で確認。
- `injectRequiredScripts` とオフライン準備判定が同じ構造条件を使用することを確認。
- v94のキャッシュ名と診断側の期待値が一致することを確認。

## 未確認事項

- iPhone SE3でv94 Service Workerが制御開始すること。
- `swBuildMatch=true`、`swOfflineReady=true`。
- キャッシュ済み `index.html` から `</body>` が欠落した場合、`navigation-body-close-missing` と表示され旧版またはネットワークへ安全に退避すること。
- オフライン再起動時の全必須機能。
- 公開環境へのデプロイ反映。
