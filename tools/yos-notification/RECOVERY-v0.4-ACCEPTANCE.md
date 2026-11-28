# Notification Bridge v0.4 recovery candidate

This extends the existing #651 Bridge candidate; v0.3, Context, filters, updater,
common installer/catalog and the user's phone are unchanged. Do not merge the old
#651 branch wholesale: it contains unrelated historical differences from main.

## Changes

- Retain a private local receipt in `YOS_Notification_AI_State_V1.json` before sending
  the raw-save queue. The receipt is `unregistered` until an explicit AI result is
  received; missing results do not prove an AI error. Queue and receipt writes are
  read back. Corrupt/full records stop safely instead of being erased.
- Preserve the existing local queue, credential keys, Inbox and notification names.
  Sanitize before queue/receipt writes. Existing 850-character safe-body bound remains;
  this does not preserve the full text of arbitrarily long original notifications.
  Never dismiss or delete the source application's notification.
- Reconcile an uncertain Notion write by exact saved paragraph (ID, timestamp,
  category and safe body), not an eight-character hash alone. Ambiguous legacy
  ID-only records block retry. A lost ACK cannot trigger blind sequential replay.
- `pending` reads unresolved receipts without sending notifications or changing Notion.
  `ai-result` updates the same local receipt, rejects unknown keys, and cannot silently
  replace a different completed result. Neither command re-runs ChatGPT.

## Wiring contract (not installed on iPhone)

Use the existing named `Notification Bridge` script, not a new installer/script:

1. Pass `{yosAction:"capture", notification:<actual trigger input>}` to the Bridge.
   Persist its returned `key` for THIS invocation. `ok` means a local receipt exists;
   only `saveState:"confirmed"` means the remote raw-save is confirmed.
2. Preserve the existing Context input from the same trigger. After successful
   ChatGPT response, call the SAME Bridge with
   `{yosAction:"ai-result",key:<capture key>,decision:"YOS_ALERT"|"YOS_SILENT",summary:<text>}`.
   Do not use a global "latest event" variable or a new key on retry.
3. If ChatGPT throws, later actions will not run. The local receipt remains
   `unregistered`. If the caller explicitly observes failure it can record `failed`.
4. `{yosAction:"pending"}` returns safe saved inputs and keys. An explicit retry uses
   the saved event's body/context and writes its result with that SAME key. Raw
   capture need not run again. Do not label the replay input as a new notification.

Legacy raw-input invocations retain the old string output. They gain an unresolved
receipt, but cannot mark successful AI outcomes until the result callback is wired.
Thus simply installing the Bridge is NOT a finished recovery flow. Local receipts
are not the server's 24-character capture IDs/Notion AI state contract.

## Verification and remaining gates

`node --test tools/yos-notification/notification-*.test.mjs tools/yos-notification/phone-notification-decision.test.mjs`

70 tests pass against actual candidate source in mocked Scriptable/Notion, including
lost ACK + replay, failed-to-complete, repeated results, corrupt storage, legacy
queue migration, OTP masking and receipt-key reuse. All data is synthetic. No live
Notion mutation, ChatGPT request or notification was sent.

Before distribution, System must use the existing common installer and verify a
fixed source revision, backup/rollback and unknown-version refusal. No private
Shortcut is uploaded here. The current iPhone's Shortcut differs from the saved
8-action file and must not be overwritten based on that old file. Physical wiring,
AI failure/lock-screen behavior, completion callback, and concurrent Scriptable
invocations remain unverified. Shared local JSON writes do not provide an atomic
cross-process transaction; do not claim parallel safety. A local failure after a
network write must keep evidence for reconciliation, not force a second write.


## 2026-11-16｜本人実通知からの改善（短い自然文・無表示・エラー復旧）

### 症状と確定事実
- iPhone画面に長い「YOS_SILENT」応答がダイアログで表示された。SBI新生銀行の一般キャンペーン通知は、この画面で本人へ知らせる実益が確認できない。
- 本人提示のShortcut用プロンプトは「SILENTの後にも理由を出す」「ALERTに固定フォーマットを混ぜる」。表示画面はプロンプト以外にもShortcutの応答表示アクションが原因候補。現行実機の配線は未取得なので原因を一点断定しない。
- 11月14日のChatGPT Generative Partner Prototypeエラーと通知IDの完全なひも付けは未確認。AI例外そのものの原因は今回の改訂では解明していない。

### 今回のGitHub候補コード（既存Draft #651を再利用、main/本番/本人端末は不変更）
- `Notification-Context-v0.4.js`：内部分析の深さは残し、`YOS_SILENT`を厳密に一行だけ、`YOS_ALERT`の次行に短い自然文を出す内容に更新。記録と表示を分離。
- `Notification-Decision-Filter-v0.5.js`：既存の5欄旧形式を後方互換で残し、自然文の新形式を追加。既存Shortcut入力は通知本文の文字列または空文字を返す。明示的な `yosMode:"structured"` では `status: alert | silent | invalid` を返してAI応答の異常をSILENTと区別。重要部分を途中で黙って切らず、550字を超える不正形式は未判定扱い。
- `Notification-Bridge-v0.4.js`：既存のローカル保護記録を活用し、`claim-retry` で保存確認済み、未判定、10分以上経過、同ID衝突なしの1件だけ再判定候補として払い出す。再試行は最大2回、初回30分、2回目90分の再試行間隔。確定済みの原文Notion保存は再送しない。
- 重要通知は、判定結果が保存されても表示成功とはみなさず、`claim-alert`→Shortcutの通知表示→`ack-alert` で表示アクション成功を明示記録。ACKなしは15分/90分間隔で最大2回の表示候補。既読・実際の到達の証明ではない。重複の危険をゼロと保証しない。
- `recovery-status` は未判定件数・再試行上限件数・未ACK重要通知件数を参照するだけ。履歴を削除しない。
- 矛盾するモデル出力、空応答、復旧不能、通信/保存未確認は全て未判定。本人に不要な通常通知を出さないが、重大な未処理を「解決済み」としない。

### 模擬検証
- GitHub上の候補ソースを直接取得し、Scriptableインターフェース・Keychain・ローカルファイル・Notionを偽実装で再現。自然文ALERT、SILENT無表示、AI異常判定、保存レシート、同ID再試行の有界化、重要ALERT表示ACKの条件、原文二重保存なしを検査し通過。
- 該当する既存Nodeテストへ自然文、SILENT、失敗復旧、表示ACKのケースを追記。現HEADのGitHub Actions/フルNode実行は未確認。模擬試験と実機、本番稼働は区別する。

### 未完成の重要な接続（YOS System / iPhone）
1. 現行物理iPhoneの既存「通知受信」から条件分岐/Show Resultの実配線を確認。AIの応答を無条件に表示しない。SILENTは通知・画面ともゼロ、ALERTだけ表示する。既存の元通知と原文先行保存を維持する。
2. 本人端末に入っているBridgeの実版とキー・保存先を確認。候補のv0.4を既存共通インストーラーとバックアップ経由で導入し、未承認の上書きはしない。
3. ChatGPT正常結果→structuredフィルタ→同一受信keyでai-result→ALERTならclaim-alert→表示→ack-alert、失敗時はローカル未判定に保持。現在ShortcutがChatGPTアクションで例外停止すると後続アクションが実行されないため、受信前レシートと別起動で回収する。失敗を正常SILENTに変換しない。
4. 自動復旧には復旧処理が再び呼ばれる起点が必要。既存オートメーション/夜間点検の実際の起動点にclaim-retry・recovery-statusを接続し、保存済み同一IDの再判定とフォローを検証。今は起動設定・再AI呼出し・定期実行は未設置。既存Night手動運用を自動稼働と誤認しない。
5. 同じ架空IDでSILENT、ALERT、モデル例外、空/異常応答、通信失敗、Notion保存ACK欠損、失敗からの回復、受信重複、端末ロック時、重要通知の到達を実機で検証。失敗・上限件数は一日1回等の既存UI/通知導線で明瞭にする。元アプリ通知は停止しない。
6. 既存Draft #651には歴史的な無関係の差分が含まれる。PRを丸ごとmainへマージしない。通知変更対象の限定差分を最新mainと比較・別途CI合格してから検討。

<strong>現在の状態：GitHub候補コード更新・部分模擬検証済み。iPhoneへの適用、継続自動復旧、実通知のエンドツーエンド検証は未完了。</strong>
