# YOS 通知受信｜iOS標準のみの導入・検証

状態：開発PRのみ。iPhone未導入・本番API未公開・ロック中未検証。

## 方針

iOS 27の純正通知トリガー → Apple標準「URLの内容を取得」（HTTPS POST） → 既存ProjectY YOS API → 既存Notion YOS Inbox → YOS通知ボックス（Web）。

**Scriptable・iOS ChatGPTアクション・新DB・新サーバーは使わない。**

元のアプリ通知は維持する。通知を保存できなかった場合も成功したことにしない。リマインダーテストや架空の危険通知はYOS_SILENTとする。不在着信は「電話」アプリの通知本文がiOSのトリガーから取得できた場合だけ保存対象にする。通話履歴/留守電の取得は別問題。

## 実行条件

既存YOS API（server/yos-ai）に認証情報・Notion Inbox ID・Upstashが本当に設定され、本人がアクセスできること。現在のVercelは最新DeploymentがCANCELEDでlive=falseのため、稼働しているとみなさない。

APIへの送信は既存Clarity接続用Bearerトークンを再利用。値はチャット/GitHubへ送らない。ショートカットのHTTP Authorizationヘッダーにだけ設定する（ショートカット編集権限から見えることはある）。NotionのAPIトークンをiPhoneへ置かない。

認証コードの原文はHTTPSでAPIには送信され得るが、保存・追加通知の前に秘匿する。送信自体を避けたいアプリはトリガーの対象から外す。

## 本人iPhoneでの設定（現在の通知受信を原本として残す）

1. ショートカット「通知受信」を複製。元のトリガーは変更・削除せず保管。
2. 複製したテスト版の赤い「通知を受け取ったとき」で対象アプリを選ぶ（Shortcuts/ChatGPT自身の通知は除外）。
3. 複製版からScriptableの3アクションと「ChatGPTを使用」を取り除く。
4. 「テキスト」に青い「通知」変数を挿入。
5. 「URL」に検証済みYOS APIホストの https://API-HOST/api/yos/notification を設定。
6. 「URLの内容を取得」→POST→要求本文 JSON。キー text に手順4のテキスト変数。キー sourceApp は任意で、対象アプリが分かるときだけ指定する。
7. 同アクションのヘッダー Authorization に「Bearer （既存Clarity接続トークン）」を設定。Notionトークンを設定してはいけない。
8. 戻り値を「辞書の値を取得」で decision を読み、値がYOS_ALERTと**完全一致した場合のみ** alertText を取得して標準「通知を表示」。その他（YOS_SILENTなど）は何も表示しない。
9. ⓘ →プライバシー→「ロック中の実行を許可」。解除中/ロック中の各1件について、Notion Inboxへの保存とYOS分岐を実機で確認してから本番切替。テスト中の二重トリガーは禁止。

Apple公式：
https://support.apple.com/en-mo/guide/shortcuts/apdfbdbd7123/10.0/ios/27
https://support.apple.com/en-euro/guide/shortcuts/apd58d46713f/ios

## API契約

POST /api/yos/notification のリクエスト（Authorization: Bearer <existing-token>）。

{ "text": "電話：不在着信", "sourceApp": "電話", "eventId": "optional-stable-unique-id", "occurredAt": "2026-11-07T01:00:00+09:00" }

- text 必須、2000文字まで。他の3フィールドは任意。eventIdを省略するとアプリ名+本文+5分単位の時刻で代替IDを作るため、時間をまたぐ再送の完全重複防止は保証できない。
- 成功レスポンス：ok、id、duplicate、category、decision（YOS_ALERT/YOS_SILENT）、alertText。
- HTTP503は保存未確認。誤って保存済みとみなさない。次回同一IDではNotionの既存行を照合する。
- GET /api/yos/notification（同じBearer）で保存済みの通知・未読/対応待ち/完了の状態を取得。最大120件。
- POST { "action": "mark", "id": "通知ID", "status": "read" } 等で既存Inboxに状態を追記。statusはread/pending/doneのみ。
- 分類はInboxへのカテゴリ保存まで。Moneyの確定支出やTasksへの自動記帳は誤判断を防ぐため未接続。

## 合格条件・戻し方

通常/テストは元アプリ通知のみ+Inbox保存、重大な実通知は原文保存とYOSの具体的な確認案内、同一イベントIDの再送は重複なし、不在着信は受信できたときだけ履歴化、通知ボックスは検索と本人が明示した状態更新が可能。これらをロック中・解除中で確認する。

不具合があれば、複製版のトリガーのみオフにし、既存「通知受信」を保持する。原文、現在のNotion、元アプリ通知は削除しない。既存の本番バックエンドはPRをマージしない限り変更しない。
