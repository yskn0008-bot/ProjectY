# YOS Mission Control Dashboard v1.0 構成

## データフロー

```text
Mission Control正本
`data/mission-control.json`
        ↓
`index.html`
        ↓
概要 / 全体 / Inbox / 完了
```

## オフライン

```text
オンライン取得
  ├ 成功 → 画面表示 + localStorage保存 + Service Workerキャッシュ
  └ 失敗 → localStorageの前回データを表示
```

## 公開

```text
mainへマージ
  ↓
GitHub Actions
  ↓
GitHub Pages
  ↓
iPhone Safari / ホーム画面
```

## 責任分担

- YOS：状態と優先順位を決定
- Mission Control JSON：現在地の正本
- Dashboard：正本を読みやすく表示
- GitHub Actions：自動公開
- GitHub Pages：iPhoneから開く入口

## v1.0で行わないこと

- Dashboard画面からの直接編集
- GitHub Issue・PR・Commitの自動書込み
- Google Drive・Calendar・Project75の同期

これらは正本と表示が安定した後に追加する。
