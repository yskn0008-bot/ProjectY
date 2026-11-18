# YOS JOURNAL｜拡張モデルGPTによる記事制作ショートカット（Draft）

## 目的
既存 [YOS JOURNAL Web](https://yskn0008-bot.github.io/ProjectY/journal-v2/) の専用誌面、既存の発行・検査ゲート、過去号、毎朝6時のGPT編集オートメーションを保護しつつ、iPhoneショートカット内の「モデルを使用 → 機能拡張モデル（ChatGPT）」による**原稿制作**を追加する。既存PR #830の「YOS JOURNAL 朝刊確認」とは別の役割で、同じPR内の独立した候補ファイルとする。

## 実装候補
- `tools/shortcut-factory/shortcuts/YOS JOURNAL GPT制作.cherri` は既存Cherri Factoryのソース。ユーザーiPhoneへのインストールに使える署名済み `.shortcut` ではない。
- `askChatGPT(prompt, false, "Text")` は Cherri の Apple Intelligence / ChatGPT アクション（iPhone側の「モデルを使用」の機能拡張モデル相当）を呼ぶ。明示的な出力形式はText、Follow Upは無効。
- ショートカット入力（共有シートで渡す公開可能な資料テキスト）をGPTへ渡し、2026-11-19改訂の既存編集方針に沿って深い特集原稿の下書きを生成する。
- 資料なし、URLしかなく中身を照合できない場合、作り話の「今日の新記事」は出さず「調査待ちの企画案」にする。
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

状態: **ソース作成・構文未検証 / 未署名 / iPhone未導入 / 公開経路未接続**。
