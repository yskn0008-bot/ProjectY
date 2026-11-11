# YOS 通知受信｜iOS標準のみの導入・検証

## A方式（既存ChatGPT判定）の隔離コード契約

以下はPR #668内の実装仕様であり、本人の既存「通知受信」へ自動反映された手順ではない。元ショートカットは変更しない。AとBの本番トリガーを同時に有効化しない。

1. 複製したA検証用ショートカットで、ChatGPT実行より**先に**同じ通知APIへ `POST {"text":"通知のTitleとBody","sourceApp":"取得できたアプリ名","eventId":"安定した通知ID","decisionEngine":"chatgpt"}` を送る。成功応答の `id` を保持する。保存失敗時はChatGPT判定を成功扱いせず、元アプリの通知を維持する。
2. ChatGPTの応答が `YOS_ALERT` または `YOS_SILENT` と確認できたときだけ、同じAPIへ `POST {"action":"ai-result","id":"保存応答のid","decision":"YOS_ALERT","summary":"機密を含まない短い事実"}` を送る。通常判定は `decision:"YOS_SILENT"` でsummary不要。失敗をショートカットが検知できた場合は `decision:"failed"` として登録する。未到達時は `aiState:pending` のまま残る。
3. `YOS_ALERT` は結果登録の成功応答にある `alertText` を追加通知し、表示アクション成功後に既存の `ack-alert` を送る。HTTP応答を失った場合は同じID・同じ結果で `ai-result` を再送する。ACK前の重複は再通知、ACK後はSILENTとなる。通知ボックスの「AI未判定」には未到達・失敗が残り、保存済みの秘匿済み本文を再判定用にコピーできる。再判定結果の自動登録には端末側の接続が必要。

APIの実装・モック検証はiPhoneのTitle/Body取得、ChatGPTアクション、ロック中実行、通知表示、実Notionへの保存を証明しない。Aの原本のアクションを取り除く手順ではない。

通知ボックスは最初の120件を表示し、「古い通知を読み込む」で次の120件へ進める。「全履歴から検索」は既存Inboxの読み取り範囲全体を対象にする。Notionの一覧取得が上限に達した場合は一部表示と明示し、全件検索済みとは扱わない。検索・ページ送りはInboxへ書き込まない。

状態：隔離検証用Draft PR #668に通知API・既存通知ボックス・STREAM導線を統合したが、iPhone未導入・本番API未公開・ロック中未検証。重大通知の再取得・表示後ACKを含め、本番承認前に端末へ接続しない。

## 方針

iOS 27の純正通知トリガー → Apple標準「URLの内容を取得」（HTTPS POST） → 既存ProjectY YOS API → 既存Notion YOS Inbox → YOS通知ボックス（Web）。

**以下のB方式ではScriptable・iOS ChatGPTアクション・新DB・新サーバーは使わない。**

元のアプリ通知は維持する。通知を保存できなかった場合も成功したことにしない。リマインダーテストや架空の危険通知はYOS_SILENTとする。不在着信は「電話」アプリの通知本文がiOSのトリガーから取得できた場合だけ保存対象にする。通話履歴/留守電の取得は別問題。

## 実行条件

既存YOS API（server/yos-ai）に認証情報・Notion Inbox ID・Upstashが本当に設定され、本人がアクセスできること。Vercelの直近CANCELEDは変更のないビルドを省略する既存設定によるもので、本番停止を意味しない。既存URLは認証なしでHTTP403を返すが、Origin制限等により期待どおりの可能性がある。認証付きの実稼働確認は未完了。通知PRブランチのプレビュー配備は未確認で、通知用Notionトークン・Inbox ID・入力トークンの環境変数はproductionのみでpreviewに未設定。プレビューに本番の秘密情報を無断コピーしない。

APIへの送信は既存Clarity接続用Bearerトークンを再利用。値はチャット/GitHubへ送らない。ショートカットのHTTP Authorizationヘッダーにだけ設定する（ショートカット編集権限から見えることはある）。NotionのAPIトークンをiPhoneへ置かない。

認証コードの原文はHTTPSでAPIへ送信され得るが、保存・追加通知の前に秘匿する。なお通常通知も口座・電話番号等を一部マスキングし、元通知の完全なバイト列を保存するわけではない。送信自体を避けたいアプリはトリガーの対象から外す。

## B方式だけの本人iPhone設定（現在の通知受信を原本として残す）

1. ショートカット「通知受信」を複製。元のトリガーは変更・削除せず保管。
2. 複製したテスト版の赤い「通知を受け取ったとき」で対象アプリを選ぶ（Shortcuts/ChatGPT自身の通知は除外）。
3. 複製版からScriptableの3アクションと「ChatGPTを使用」を取り除く。
4. 「テキスト」に青い「通知」変数を入れ、変数をタップして取得する項目を **Title** に指定する。改行の次に同じ「通知」変数を追加し、今度は **Body** に指定する（必要なら Subtitle も追加）。「ショートカットの入力」や通知オブジェクト全体の自動文字列化に依存しない。Title/Bodyが実際に取得できるかは、対象アプリごとにiPhoneで確認する。取れない本文を補完しない。
5. 「URL」に検証済みYOS APIホストの https://API-HOST/api/yos/notification を設定。
6. 「URLの内容を取得」→POST→要求本文 JSON。キー text に手順4のテキスト変数。キー sourceApp は任意で、対象アプリが分かるときだけ指定する。
7. 同アクションのヘッダー Authorization に「Bearer （既存Clarity接続トークン）」を設定。Notionトークンを設定してはいけない。
8. 戻り値を「辞書の値を取得」で ok と decision を読み、ok=trueかつYOS_ALERTと**完全一致した場合のみ** alertText を取得して標準「通知を表示」。その他（YOS_SILENT、保存未確認など）は追加通知せず、保存成功・配信成功と扱わない。
9. **隔離PR #668のACK対応APIが安全な環境で実際に配備・疎通検証された場合に限り**、手順8の表示アクションが成功した後、同じ通知IDを使い標準「URLの内容を取得」で `POST {"action":"ack-alert","id":"（API応答のid）"}` を送る。元のPOSTと同じURL・Authorizationを用い、応答の `alertAcknowledged=true` を確認する。表示前・エラー時・YOS_SILENTの場合はACKしない。ACKは「iOSの表示アクションが成功した」証跡であり、本人が読んだ・解決した意味ではない。
10. 同一通知の再送時は最初と同じ `eventId`（および元本文・sourceApp）を使う。`eventId`は1件につき1度生成して再送に使い回し、新しいIDを発行しない。元通知が失われた後のShortcuts再起動やロック中の自動再実行は保証されず、別途実機検証が必要。
11. ⓘ →プライバシー→「ロック中の実行を許可」。解除中/ロック中の各1件について、Notion Inboxへの保存とYOS分岐、同一IDの再送・ACK成功・ACK後の追加通知抑止を実機で確認してから本番切替。テスト中の二重トリガーは禁止。

Apple公式：
https://support.apple.com/en-mo/guide/shortcuts/apdfbdbd7123/10.0/ios/27
https://support.apple.com/en-euro/guide/shortcuts/apd58d46713f/ios

## Vercel Hobby関数数の保護

- 最後のREADY版は `api/yos` に12個の関数があり、通知を別ファイルで追加すると13個となり、確認済みのHobby上限（12個）を超える。隔離版では通知ロジックを `src/intake/notification-api.mjs` に移し、既存 `api/yos/intake.mjs` 関数が `mode=notification` で呼び分ける。Vercelの内部rewriteで公開URL `/api/yos/notification` を維持する。課金・新サーバー・本番設定変更は行わない。
- GitHubのコード/契約テストとVercelの実際のrewrite・配備は別の受入条件。12個以下でもpreviewの成功、認証、iPhone端末動作を保証しない。

## API契約

POST /api/yos/notification のリクエスト（Authorization: Bearer <existing-token>）。

{ "text": "電話：不在着信", "sourceApp": "電話", "eventId": "optional-stable-unique-id", "occurredAt": "2026-11-07T01:00:00+09:00" }

- text 必須、2000文字まで。他の3フィールドは任意。eventIdを省略するとアプリ名+本文+5分単位の時刻で代替IDを作るため、時間をまたぐ再送の完全重複防止は保証できない。
- 成功レスポンス：ok、id、duplicate、category、decision（YOS_ALERT/YOS_SILENT）、alertText。この隔離PR #668のAPIには `alertRequiresAck` が加わる。
- 隔離PR #668では重要通知の保存後にHTTP応答が失われても、同一IDの再送でACK前なら `YOS_ALERT` を再取得し、ACK後は `YOS_SILENT` とする。`ack-alert` の送信失敗時は再送によって追加通知が重なることがある。
- HTTP503は保存未確認、409は競合等で保存未確定。誤って保存済みとみなさない。再送時は同じIDでNotionの既存行を照合する。Shortcuts自身の停止・アクション失敗時の自動再実行は未確認。
- GET /api/yos/notification（同じBearer）で保存済みの通知・未読/対応待ち/完了の状態を取得。最大120件。
- 通知ボックスで古い履歴の状態を変更した後は、GET `?id=通知ID` でその1件をNotionから読み戻して確認する。画面の読み込み済み履歴を先頭120件へ戻さない。Inboxを上限まで読み切れない場合は確認成功と扱わない。
- POST { "action": "mark", "id": "通知ID", "status": "read" } 等で既存Inboxに状態を追記。statusはread/pending/doneのみ。
- 分類はInboxへのカテゴリ保存まで。Moneyの確定支出やTasksへの自動記帳は誤判断を防ぐため未接続。

## iOS通知トリガーの制約

Appleは通知受信オートメーションの存在を案内しているが、全アプリの本文取得・ロック中の完全自動実行を保証していない。表示プレビューがない通知は本文が渡らない場合がある。第三者アプリの通知ごとに、取得できた文字列とロック中の動作をiPhone実機で確認するまで、全通知自動保存を完成扱いにしない。

## 合格条件・戻し方

通常/テストは元アプリ通知のみ+Inbox保存、重大な実通知は秘密情報を一部マスキングした本文保存とYOSの具体的な確認案内、同一イベントIDの再送はInboxへの重複保存なし、不在着信は受信できたときだけ履歴化、通知ボックスは検索と本人が明示した状態更新が可能。隔離PR #668に限り、重大通知は表示前ACKしないこと、保存後の応答喪失時に再送で復元できること、表示後ACKを受けてから通知再送が止まることを確認する。これらをロック中・解除中で確認する。

不具合があれば、複製版のトリガーのみオフにし、既存「通知受信」を保持する。原文、現在のNotion、元アプリ通知は削除しない。既存の本番バックエンドはPRをマージしない限り変更しない。
