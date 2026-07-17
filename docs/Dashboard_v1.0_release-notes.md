# YOS Mission Control Dashboard v1.0 リリースノート

更新日：2026-07-17

## 追加

- iPhone縦向けのMission Control画面
- 「今やること」の自動選定表示
- 進行中、要確認、Inbox、直近完了の件数表示
- 概要、全体、Inbox、完了の4タブ
- プロジェクト検索
- GitHub上の`data/mission-control.json`読込
- 更新ボタン
- 通信失敗時の前回データ表示
- PWA用manifest
- Service Workerによる基本オフライン対応

## 変更

- `index.html`を初期画面からMission Control本体へ更新

## 制約

- GitHub Pagesの公開設定はGitHub側で有効化が必要
- GitHub Issues、Pull Requests、Commitsの自動書込み集約は次工程
- Google Drive、Calendar、Project75の同期は次工程
- ホーム画面用の正式アイコンは別工程
