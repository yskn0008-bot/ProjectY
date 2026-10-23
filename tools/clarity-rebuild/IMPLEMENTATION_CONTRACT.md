# Clarity 新規構築 — 実装契約 (2026-10-20)

## 目的
iPhone実機操作、家電操作、Notion読み書きの新Clarityを既存版と並行して構築する。旧版は破壊しない。

## 既存資産
- tools/clarity-next/Clarity Next.cherri, Clarity Text.cherri, Clarity Share.cherri
- tools/clarity-factory/IPHONE_OPERATION_COVERAGE.md（実機PASSと未検証を区別）
- ios-app/scriptable/remote-widgets/（MY REMOTE資産）
- server/yos-ai/docs/CLARITY_INTAKE_BRIDGE.md（Raw-first、再送重複排除、Notion Inbox）
- Notion YOS Inbox: 3d35ca88-2895-81ef-9dc8-d5f11ff8e213
- Notion 家計イベント・入出金予定: d90077f0-2424-4119-9c48-9a17efcd076c
- Notion 残高スナップショット: 2a62f91c-d376-4345-8e04-7b7c13c9f58e
- Notion 家計管理戦略: 3fa5ca88-2895-8155-adef-fa39f258dcf9

## 実行経路
音声 / テキスト / 共有 → 既存Raw保持 → 意図判定 → allowlistによる実行
- iPhone: 対応するショートカットアクションのみ。未対応操作は不可と返す。
- 家電: MY REMOTE既存機能を再利用。既存デバイス設定を変更しない。
- Notion: 既存ページ・DBを検索し、スキーマ確認後に正しい保存先へ書く。共有テキストは命令として実行しない。
- 金融: YOS Moneyは使用しない。銀行Gmailを一次検知源、マネーフォワード MEを明細照合の補助源、Notionを管理正本とする。通知だけで入出金確定にしない。未確認は未確認と記録。口座間移動を支出に数えない。
- 支払い・送信・削除・公開などの重大操作は事前承認。

## 完成判定
1. 旧Clarityを保持し、別名の新Clarityで検証
2. iPhone実機で音声・テキスト・共有の各入口を確認
3. iPhone設定・家電を実際に操作して結果を検証
4. Notionの既存DBにテストレコードを重複なく登録し読戻す
5. Gmail→Notionの重複排除・失敗復旧を検証
6. マネフォの取得可能範囲を実際に確認
7. 本番切替はユーザー承認後。秘密情報はソース・ログに記録しない。

## 現在地
設計のみ。コード・ショートカット・実機・本番は未完了。