# Issue #229 実行記録

## 目的

Issue #229「Mission Controlに各開発の進捗率と残り時間を常時表示する」を、GitHub正本に実在するDraft PR上で実装する。

## 正本

- Repository: `yskn0008-bot/ProjectY`
- Base: `main`
- Issue: #229
- 全体管理: #51
- 自動司令部: #232

## 必須範囲

- 既存Mission Controlを拡張する
- `index.html`
- `data/mission-control.json`
- `scripts/sync_mission_control.py`
- 必要なMission Control専用テスト・workflow

## 禁止範囲

`/taxi/`、`/yos/`、`/life/`、`/nav/`、`/server/` の製品コードを変更しない。

## 完成証拠

- PR headに実在するcommit
- GitHub上の変更ファイル
- 自動試験結果
- 担当外変更なしの監査
- 未確認事項の明記

実機Safari/PWA、本番公開、本番疎通は未確認のまま完成扱いにしない。
