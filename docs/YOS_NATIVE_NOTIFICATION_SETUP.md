# YOS通知API・既存Inbox統合候補（PR #692）

## 現行方針と反映範囲

このPRはVercel向け通知バックエンドと12関数以内の既存URL互換をまとめる開発候補。Cloud Runの採用・接続・設定変更は含めない。現在mainの承認済み通知履歴・デモ・Google認証・provider設定をそのまま保持する。旧notification-boxを別画面として新設しない。

本人が選択したA方式（ChatGPT判定）と現行「通知受信」を保持する。B方式の説明は比較用であり、本人のショートカットからChatGPTアクションを削除する指示ではない。本番反映・端末切替・権限変更・実通知テストは別の受入ゲート。元通知を停止しない。

## A方式の既存API契約

1. POSTにdecisionEngine:chatgptを指定し、秘匿済み本文を既存Inboxへ先行保存。同じ通知の再送は同じeventIdを使う。
2. 応答のaiState:pendingと保存済みIDを保持。ChatGPT失敗時は同一IDにaction:ai-result、decision:failedを送信し、本文の再保存で回収しない。
3. 成功時は同一IDにaction:ai-result、decision:YOS_ALERTまたはYOS_SILENT、summaryを送信する。通常SILENTも安全な要約を保存し、ALERT本文へ混入させない。
4. YOS_ALERTの通知表示が成功した後だけaction:ack-alertを送信する。ACKは既読・解決の証明ではない。
5. 権限のないviewerはcapture・ai-result・ack-alertを実行できない。元の端末配線・失敗時ローカル保持は未検証で、本APIのモック成功と区別する。

## 正式な履歴画面と保存確認

入口は既存STREAM→通知履歴。UIは現在mainのyos/notification-history.htmlを保持。Vercel providerが有効かつnotification認定済みで、既存の正規HTTPSホストと本人認証が確認できる場合だけ接続。接続認定を本PRから自動変更しない。Cloud Runへのフォールバックは追加しない。

GETの1ページ上限は120件。nextCursorを順に取得し、complete:falseを完全取得と扱わない。古いClarityのIDが再利用されていてもNotion block由来historyKeyで個別履歴と状態を区別する。POST mark後はGET ?id=historyKeyで読戻す。既読、対応待ち、完了申告は実際の支払・解決・別DB反映とは別。Money/Tasksへの自動確定書込は未接続。

## 既存URLと12関数の維持

/api/yos/notification → /api/yos/intake?mode=notification。
/api/yos/inbox-sort → /api/yos/intake?mode=inbox-sort。

旧health-syncは内部専用モジュールへ同一コードで移し、widget内部importを更新。inbox-sortの公開URLとcronはrewriteで保持。新API関数を増やさず計12関数。既存モデル/Clarity/mirror/factoryルートを保持。

## 検証と残るゲート

ローカルテストは合成通知・偽Notion/Redis/Google認証だけを使い、本当の通知・認証情報を外部へ送信しない。型検査、Raw先行保存、秘密値マスク、SILENT要約、AI失敗再処理、ACK、同一ID再送、履歴120件超、旧ID再利用、URL互換・12関数、現在UIを検証する。

本番のVercel枠制限、production限定の既存環境変数、実認証、実Notion保存/読戻し、iPhoneの通知トリガーとロック中動作は別途未確認。previewへ本番秘密値をコピーしない。コードのテスト成功だけで本番/実機を完成扱いしない。
