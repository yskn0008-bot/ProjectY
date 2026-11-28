# Clarity.Voice: 能力境界・ナビ安全修正（2026-11-01）

## 実物から確認した範囲
- iPhone実機名は **Clarity.Voice**。旧 Clarity Next とは区別する。
- 本人提供の署名済み .shortcut は、**本人のローカル環境だけで**解凍・解析した。個人用plistやNotion接続情報はこのリポジトリに置かない。
- 1,001アクション。既存モデル呼び出しは1回（ChatGPT、Dictionary）。条件分岐276、nothing250、テキスト163、変数設定119。
- ナビの「文字列→位置情報へ変換→マップ検索」部分で実機エラー。GitHubには**汎用の構造対応パッチャーと秘密情報を含まない合成fixtureテストだけ**を追加する。

## 公式能力境界
- **モデルを使用**（On-Device、Cloud、Cloud Pro、ChatGPT拡張）：文章理解・分類・判断・出力。モデルだけでは端末副作用やNotion API書込みを実行しない。
- **Shortcuts**：対応する標準アクション・App Intents・URLを実行。実行後の結果確認が必要。
- **Siri AI**：画面の文脈・対応アプリ横断のアクションを補助。Siriが直接できる処理をShortcutから自由文で万能呼出しするAPIは確認できない。
- **外部サービス**：ScriptableやNotion APIを利用して既存YOS Inbox/Tasks/Shopping等へ書込み。Notion無料版の内蔵DB自動化は基本制限あり。
- 対応App IntentsやSiri AIベータの実際の可用性は端末・言語・アプリに依存し、実機未確認をPASSとはしない。

## Google Maps修正の受入条件
1. 旧3アクション Location → Search Maps → Nothing が**1組だけ**存在すること。
2. 旧Locationを参照する別アクションがないこと（存在すればfail-closed）。
3. その3アクションだけ、URL Encode → Google Maps directions URL → Open URLsへ変更（既定Google、手動フラグでAppleも生成可能）。
4. 全アクション数とその他アクション・トップレベル設定は不変。URLパラメータのエンコード、参照関係、重複・未知構造時の拒否を検証。
5. 実機では「ライカムまでナビ」でGoogle Mapsの経路画面が開くことを確認。位置情報の状況によっては経路プレビューとなり、音声ナビ開始は保証しない。

## 実装資産
- `patch_voice_navigation_url.py`：ローカル専用のオフラインパッチャー。署名と端末インストールはしない。
- `tests/test_voice_navigation_url.py`：Google/Apple、エンコード、未知フォーマット、参照の安全性の5試験。
- 実行例：`python tools/clarity-factory/patch_voice_navigation_url.py --input /private/path/Shortcut.wflow --output /private/path/Clarity.Voice_Google_unsigned.plist --provider google`
- **未署名plistはiPhoneにインストールできない**。MacのApple標準`shortcuts sign`等の信頼済み署名手段で署名し、本人の端末で別名開発版としてテストする。本人の元ファイルを外部署名サービス・公開GitHubに送信しない。
- 現状：オフライン静的テスト成功、コードを開発ブランチで保管。署名・iPhoneインストール・実機試験は未完了。

## 参考（公式）
- Apple Shortcuts: https://support.apple.com/guide/shortcuts/use-apple-intelligence-in-shortcuts-tpg3vrvwmclv/ios
- Siri AI: https://support.apple.com/ja-jp/guide/iphone/iphv6zwrg8jvfgr/27/ios/27
- App Intents/App Schemas: https://developer.apple.com/videos/play/wwdc2026/240/
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Notion automations: https://www.notion.com/help/database-automations
