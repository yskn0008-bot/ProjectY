# YOSナビ v84

## 変更内容

- Service Workerの承認済み実行時キャッシュ対象から`./`（YOSナビのルート別名）を除外した。
- 画面遷移は従来どおり、検証済み`./index.html`のみをオンライン取得・オフラインフォールバックに使用する。
- ルートURLへの非ナビゲーションGETが、HTML識別検査を通らないまま任意内容をキャッシュする経路を閉じた。
- Service Workerと実行時診断のビルド識別子をv84へ揃えた。

## 安全性

- 変更範囲は`/nav/`内の3ファイルのみ。
- YOSの正式名称、唯一の人格・司令塔としての役割は変更していない。
- 期待値計算、現在地取得、地図、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。
- 既存のHTTP状態、最終URL、Content-Type、空本文、HTML混入、YOSナビ画面識別、キャッシュ再検査は維持した。

## 確認結果

- `STATIC`から`./`のみを除外し、`./index.html`と既存スクリプト一覧は維持した。
- 画面遷移判定では`./`と`./index.html`を引き続き受け付け、どちらも検証対象を`./index.html`へ正規化する。
- 診断側の`BUILD`と`EXPECTED_CACHE`がService Workerのv84キャッシュ名と一致する。

## 未確認事項

- iPhone SE3でv84 Service Workerが制御中になること。
- 正常時に`swBuildMatch=true`、`swOfflineReady=true`になること。
- YOSナビのルートURLから通常起動できること。
- ルートURLへの非ナビゲーションGETがv84キャッシュへ保存されないこと。
- オフライン再起動。
- 公開環境へのデプロイ反映。
