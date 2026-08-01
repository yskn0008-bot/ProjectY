# YOSナビ v89 変更記録

## 目的

YOSナビのルートURL（`/nav/`）と `index.html` 直接URLで、同じ検証済みオンライン文書を使用する。

v88では画面遷移時にブラウザが要求したURLをそのまま取得していたため、`/nav/` の応答URLが `/nav/index.html` と一致しない構成では、正常なオンライン応答でもURL検査に失敗し、検証済みキャッシュへ切り替わる可能性があった。

## 変更内容

- 画面遷移時のオンライン取得先を承認済みの `./index.html` に固定
- ルートURLと `index.html` 直接URLを同じ検証経路へ統一
- HTTP状態、最終URL、Content-Type、空本文、YOSナビ画面識別の既存検査を維持
- オンライン取得失敗時のみ、再検査済み `./index.html` キャッシュへ切り替え
- Service Workerと実行時診断をv89へ同期

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V89_CHANGELOG.md`

`/nav/`以外のファイル、YOSの正式名称・唯一の人格・司令塔としての役割、Taxi、Life、DB、乗車履歴、同期API、期待値計算、現在地取得、地図、営業判断は変更していない。

## 確認結果

- 承認済み画面文書の取得先が `./index.html` に固定されていることをコード差分で確認
- `/nav/` と `/nav/index.html` の両遷移が同じ関数を使用することを確認
- オフライン時のフォールバック先が従来どおり検証済み `./index.html` キャッシュであることを確認
- キャッシュ完全性検査、順次プリキャッシュ、有効化前再検査を維持していることを確認
- 変更対象が `/nav/` の3ファイルだけであることをPR差分で確認予定

## 未確認事項

- iPhone SE3で `/nav/` から通常起動した際にオンライン版 `index.html` が表示されること
- iPhone SE3で `/nav/index.html` 直接起動が正常であること
- 正常時に `swBuildMatch=true`、`swOfflineReady=true` となること
- オフライン再起動時の全必須機能
- 公開環境へのデプロイ反映
