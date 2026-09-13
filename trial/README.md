# YOS Trial Pack — 2026-09-13

目的は、ProjectY v3.0の「完成待ちで止めず、試せるものは先に本人端末で試す」を1画面にまとめること。

## 今回まとめた本人試用

1. **YOS Home Voice** — PR #318 の検証済みScriptable音声入口。既存MY REMOTE v6.4を再利用。
2. **YOS Departure Guard v0.1** — PR #320 の隔離Scriptable試作。Calendar + iPhone/AirPods batteryをread-onlyで確認し、必要時だけ通知。
3. **MY WAY NOW Widget v1** — merged PR #331 のScriptable widget。スクリプト導入までは可能。実データ接続には `MY_WAY_WIDGET_TOKEN` が必要。
4. **MY WAY Home** — merged PR #319 の30秒コックピット。GitHub Pagesの既存MY WAY URLを開く。

## 今回は本人試用に出さないもの

- Clarity PR #325: unsigned Shortcut生成までは完成。信頼できる署名/import経路が残り。
- Screenshot Router PR #330: 同じくShortcut署名待ち。
- Morning Flow ↔ Night Reset PR #329: feature-specific testはgreenだが、既存Life iPhone smokeの無関係なredが残っているため、今回の一括試用には混ぜない。
- Money Capture PR #328: candidate parserのみ。Money SSOTへの書込み契約待ち。
- Weekly Review PR #326 / Friction Discovery PR #327: pure engineはgreen。live read-only adapter / scheduler接続待ち。

## Installer safety

`YOS Trial Pack Installer.js` は、公開GitHub上の特定commit SHAに固定したScriptableソースだけを取得する。

- secret / private tokenは埋め込まない
- 既存同名ファイルは `YOS Trial Pack Backups/<timestamp>/` へ退避
- 全source取得後に書込む
- 途中失敗時は、このInstallerが書いたファイルを旧版へ戻す
- MY REMOTE既存ファイルは変更しない

## 本人操作

Trial Hub (`trial/index.html`) からInstallerを1回コピーし、Scriptableの新規scriptへ貼り付けて実行する。その後は `YOS Trial Launcher` から順番に試す。

本人確認結果は以下だけでよい。

```text
音声操作：OK / NG
出発チェック：OK / NG
NOW Widget：OK / NG / トークン待ち
MY WAY：OK / NG
```
