# YOS JOURNAL｜拡張モデルGPTによる記事制作ショートカット（Draft）

## 目的
既存 [YOS JOURNAL Web](https://yskn0008-bot.github.io/ProjectY/journal-v2/) の専用誌面、既存の発行・検査ゲート、過去号、毎朝6時のGPT編集オートメーションを保護しつつ、iPhoneショートカット内の「モデルを使用 → 機能拡張モデル（ChatGPT）」による**原稿制作**を追加する。既存PR #830の「YOS JOURNAL 朝刊確認」とは別の役割で、同じPR内の独立した候補ファイルとする。

## 実装候補
- `tools/shortcut-factory/shortcuts/YOS JOURNAL GPT制作.cherri` は既存Cherri Factoryのソース。ユーザーiPhoneへのインストールに使える署名済み `.shortcut` ではない。
- `askChatGPT(prompt, false, "Text")` は Cherri の Apple Intelligence / ChatGPT アクション（iPhone側の「モデルを使用」の機能拡張モデル相当）を呼ぶ。明示的な出力形式はText、Follow Upは無効。
- ショートカット入力（共有シートで渡す公開可能な資料テキスト）をGPTへ渡し、2026-11-19改訂の既存編集方針に沿って深い特集原稿の下書きを生成する。
- 資料なしの場合も調査対象の問い・仮説・具体的な場面を含む特集下書きを組み立てるが、事実未確認部分は【要裏取り】と明示し、追加確認すべき一次資料を挙げ、状態を【調査待ち】とする。URLしかなく中身を照合できない場合も同様。
- GPT出力の基本長と識別子を検査し、日付と時刻を含む固有名 `YOS-JOURNAL-GPT-DRAFT-YYYY-MM-DD-HH-mm-ss.md` で iCloud Drive / Shortcuts に**上書きなし**保存する。
- **公開・通知は行わない**。保存通知はショートカットが原稿保存に成功した場合の端末内通知だけ。プライベートNotion原文・GitHub秘密鍵を送信・保存しない。

## 出典・公開の安全ゲート（現時点で未接続）
- GPTが文章を出力できても、情報源を実際に閲覧し、一次情報の記述・更新日時・論文の限界・直近の重複・肖像や画像の権利まで確認した証拠にはならない。
- 生成したMarkdown原稿は、そのまま `journal/gpt-editorial-gate.mjs` の `{schemaVersion:1,issue,verification}` 契約に適合**しない**。勝手に `verification.checkedOn` を生成してゲートを通さないこと。
- 次工程は既存GPT編集担当が原稿候補を取得できる**安全な私的受け渡し経路**の確認 → 原典独立照合 → 公開用候補JSON作成 → 既存ゲートとCI → GitHub PR → main/Pages読戻し → iPhone実機確認。
- iPhone内のiCloud Drive保存物はChatGPTオートメーションが自動読取できるとは限らない。自動接続が確認できるまで、制作・公開の完全自動化は未完成。
- 原稿作成と掲載公開を区別。本人の拒否記事の再採用・承認済みv712の置換・同日号の上書きはしない。

## 導入とテスト（未実施）
1. 既存Shortcut Factory上で Cherri 構文チェック・コンパイル・署名・Shortcutsアクション構造検査（機能拡張モデルが選択されていること）を行う。
2. 署名成果物を既存YOS共通インストーラーに登録。新規インストーラーは作らない。iPhone上の同名既存ショートカットを自動上書きしない。
3. iPhoneで公開可能なサンプル資料1件 → 出力テキスト保存を確認。資料なし → 調査待ち、GPT無応答 → 既存ファイル無傷、同日再実行 → 旧稿保護。
4. 確認が終わるまで時刻オートメーションを登録せず、既存6:00 GPT編集・8:00配信・朝刊確認ショートカットの動作を変えない。

## 根拠
- Apple公式: https://support.apple.com/ja-jp/125148
- Cherriアクション: https://cherrilang.org/language/standard/intelligence.html
- 既存編集契約: `journal/GPT_EDITORIAL.md`
- 既存公開ゲート: `journal/gpt-editorial-gate.mjs`

## 2026-11-19｜機械ビルド結果

- 既存Shortcut Factory v3の専用PRジョブに接続し、固定Cherri v2.3.0でコンパイルPASS、既存秘密情報静的検査PASS。
- `validate_journal_gpt_candidate.py` がGPTアクション（ChatGPT / Text / FollowUp false）、原稿保存（固有名・上書きOFF・保存場所確認OFF）、公開/URL送信アクションなしを検証PASS。
- 既存HubSignアダプター署名PASS。AEA1形式・サイズ検査PASS。GitHub Actions [run #44369127226](https://github.com/yskn0008-bot/ProjectY/actions/runs/44369127226)、成果物名 `yos-journal-gpt-shortcut-candidate`（artifact #14459146692）。
- 成果物のzipを取得し、署名済み `.shortcut` 24,885 bytes / AEA1、未署名Workflowは25アクション、モデルが `ChatGPT`、Text出力、FollowUp false、保存時の上書きOFFと再検証済み。
- **未完了**：iPhone実機取り込み、本人端末でChatGPT実行許可の確認、原稿のiCloud実保存・同名競合・無入力・オフラインの実測。既存公開ゲートへの無人受渡しも未接続。実際に記事が公開された証拠ではない。
- 配布は受入テスト用の署名済み候補に限る。既存共通インストーラーへの本配布登録、mainマージ、既存通知の切替えは行わない。

状態: **Cherriビルド・構造検査・署名PASS / iPhone実機未確認 / 公開経路未接続**。


## 2026-11-19｜iCloud → 既存Notion Inboxへの自動受け渡し（PR候補）

- ローカル保存後、iPhoneの既存Scriptable「Run Inline Script」アクションを同一ショートカット内で実行。既存Scriptable Keychain `YOS_NOTION_INTEGRATION_TOKEN` を利用し、既存 **YOS Inbox（3d35ca88-2895-81ef-9dc8-d5f11ff8e213）** のみにMarkdown下書きを非公開で送る。トークン、原稿本文は公開GitHubやURLへ載せない。
- `tools/shortcut-factory/journal_draft_inbox_inline.js` は識別子 `YOS_EDITORIAL_DRAFT_V1`、公開不可マーク、サイズ、秘密鍵パターンを検査。本文の2系統ハッシュ+長さから受付IDを作り、送信前に既存Inboxをページ終端まで照合。同じ受付IDがあれば二重登録せず成功扱い。前回の通信が不明な場合も、所在を完全照合できなければ再送せず保留。
- 書き込み直後のNotionブロック個別読戻し + 再度の受付ID照合で初めて確定。Notion障害、認証不足、長文、既存Inboxの走査不完了は**iCloud原稿を保持しNotion未確認**。端末へ保留通知を出すが、ショートカット自体の「iCloud保存済み」と混同しない。
- Cherriコンパイル後、`patch_journal_draft_inbox.py` でiCloud保存アクションと**まったく同じ`draftText`の動的参照**をScriptableアクションへ配線。コンパイル後検査で外部アップロード先が既存Notionだけであることと上書きOFFを確認。
- 毎朝6:00の既存GPT編集はまだInboxのこの受付IDを読んでいない。受け取った下書きは**未検証の編集素材**であり、本人の承認や一次出典確認・既存 `journal/gpt-editorial-gate.mjs` による審査を代替しない。本人が公開許可していない日付の自動公開や既存号上書きは行わない。
- 既存iPhoneにインストール済みの旧版は更新していない。GitHub CI成功後も、同名更新衝突を防ぐため既存共通インストーラーへの本登録を無断で行わない。実機インポート・Notion反映確認後に公開側接続を選択する。

**状態：実装候補。機械試験と署名が完了するまでは導入不可。**
