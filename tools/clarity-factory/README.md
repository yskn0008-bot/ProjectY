# Clarity Factory — Cherri path

Issue #314 の「Clarity Universal Gateway v1」を、iPhoneからテンプレートを書き出さずコードから生成する経路。

## 現在の実装

`clarity-v1.cherri` は次を1本のShortcutへコンパイルする。

1. 音声入力
2. `Clarity Inbox.txt` へ Raw First 保存
3. ChatGPT / Follow Up OFF / Dictionary 出力
4. model contract / Policy の fail-closed gate
5. Router
6. local v1 executor
7. Ledger / 必要時だけFeedback

### v1 executor

- `idea` → `Idea in Box.txt`
- `memo` → Raw First済みの `Clarity Inbox.txt` を保存結果として確定
- `calendar` → Apple Calendar の Add New Event
- `reminder` → Apple Reminders の日時付き Reminder
- `task` → Apple Reminders の通常項目
- `shopping` → Apple Reminders の通常項目（実機側の買い物list mappingはConfig/導入側で固定する）
- `answer` → その場の短い回答
- `shortcut_factory` → このLaneでは外部実行せず planned のままLedgerへ残す
- `open_app` → 明示allowlist内のiPhoneアプリを起動
- `device_setting` → 明示allowlist内のローカル設定を変更（Wi‑Fi / Bluetooth / モバイル通信 / 機内モード / 低電力 / 明るさ / 音量 / 外観 / ライト / おやすみモード）
- `myway` → 既存のMY WAY Homeを開き、「今ここ・ここまで・行き先・次の一歩」を再利用して表示

Calendar / Reminder / Task / Shopping には `YOS-CLARITY-ID:<request>-<action>` markerを付与する。

各副作用の直前に `EXECUTING`、成功して処理が戻った後だけ `APPLIED` を `Clarity Ledger.txt` へ追記する。Shortcuts側のdestination actionが中断・errorになった場合は `APPLIED` が残らないため、実行済みとは扱わない。Policyで止めた処理は `BLOCKED` を記録する。

## 安全境界

- Raw First はAIより前
- modelは `planned` 以外を返せない
- high / irreversible / external write は確認境界
- Calendar / Reminders / Shopping / Idea / Inbox はlocal reversible allowlist
- 曖昧な予定・通知日時は `needs_review`
- Calendarは開始時刻が明確で終了指定がない時だけ、policy既定値として60分後を終了時刻にする
- secret / personal credential / private network値を生成物へ埋め込まない
- runtimeへHTTP / mail / message等の外部executorを追加しない

## 自動検証

GitHub Actions `Clarity Cherri proof` で以下を固定headごとに検査する。

- model contract unit tests
- pinned Cherri v2.3.0 checksum
- compiler proof
- Clarity runtime compile
- Raw First ordering
- Calendar / Reminder executor presence + marker
- Ledger state (`EXECUTING` / `APPLIED` / `BLOCKED` / `REQUEST_DONE`)
- secret / private network scan
- unsigned artifact upload

## 署名・iPhone導入

このFactoryはunsigned artifactまでを担当する。trusted signing / import / Action Button / permission / physical iPhone E2E は導入Laneの担当であり、ここでは完了扱いしない。

実機E2Eで最低限確認する入力例:

`明日3時に歯医者。30分前に教えて。帰りにトマト買う。あと棚のアイデア思いついた。`

期待結果は Calendar / Reminder / Shopping / Idea の4 actionへ分解され、実際の保存先とLedgerの `APPLIED` が一致すること。


## 追加E2E（app / settings / MY WAY）

実機では最低限次を確認する。

- `ChatGPT開いて` → ChatGPTが開く
- `Wi-Fi切って` → Wi-Fiがオフになる
- `明るさ35%` → 画面の明るさが35%相当になる
- `MYWAYまとめ見せて` → 既存MY WAY Homeが開く

未登録アプリ、未対応設定、値が曖昧な設定は fail closed で停止する。
