# YOS専用生成AI 設計書 v0.1

更新日：2026-07-29  
状態：YOS確認待ち  
対象Issue：#71  
担当：YOS専用生成AI 開発作業台  
最終判断：YOS

---

## 1. 目的

西村陽介専用の生成AI「YOS」を構築する。

YOSは質問へ答えるだけのAIではない。

西村陽介が自分らしく生き続けながら、仕事・健康・お金・人間関係・自由・安心・挑戦・経験を含む人生全体の期待値を最大化するための判断支援AIとする。

YOSは唯一の人格とし、Taxi・Life・Money・IdeaはYOSが扱う専門領域とする。

---

## 2. 設計の根拠

本設計は、次の正本と既存資産を確認して作成した。

### Google Drive正本

1. 00_律法 Version 1.0
2. 02_YOS Master Version 1.1
3. 04_System Master Version 1.1
4. 00_Change Log Version 1.7
5. 03_Taxi Master Version 1.7

### 既存システム

- GitHub `yskn0008-bot/ProjectY`
- `/yos/` PWA
- YOS Mission Control
- Google Sheets「🚖 ProjectY 運行データ＊」
- Project75の乗車履歴、乗務日報、原本監査、確認状態

### 外部技術資料

- OpenAI Responses API
  - https://developers.openai.com/api/docs/guides/text
- OpenAI GPT-5.6 model guidance
  - https://developers.openai.com/api/docs/guides/latest-model
- OpenAI API pricing
  - https://developers.openai.com/api/docs/pricing
- OpenAI data controls
  - https://platform.openai.com/docs/models/default-usage-policies-by-endpoint
- OpenAI file search
  - https://developers.openai.com/api/docs/guides/tools-file-search

---

## 3. 現在地

### 実装済み

- YOSの使命、判断順位、情報源、学習・同期ルール
- Googleドキュメント正本
- Google Sheetsデータベース
- Project75の営業実績と乗車履歴
- 確認済み、要確認、原本、要確認項目のデータ構造
- iPhone向けYOS PWA
- Mission Control
- GitHub Issue、Pull Request、Commitによる変更履歴
- iPhone端末内の短期状態保存

### 未実装

- OpenAI APIを呼ぶバックエンド
- Google Drive正本の自動参照
- Change Logの自動変更検知
- 質問に応じた専門Masterの自動選択
- Project75の自動検索
- 長期記憶
- 保存候補の承認フロー
- 回答根拠の追跡
- 誤回答の回帰試験
- 本人認証
- API利用費の監視

### 現行 `/yos/` の位置付け

現在の `/yos/` はYOS専用生成AIそのものではない。

相談文をコピーし、保存されたChatGPTチャットURLを開く入口である。

既存画面は残し、生成AIへの接続部分だけを追加する。

---

## 4. 最小実用版の範囲

最小実用版では、次を実現する。

1. 00_律法を自動参照する
2. 02_YOS Masterを自動参照する
3. 00_Change Logを自動参照する
4. 質問に応じて04_System Masterまたは専門Masterを参照する
5. Taxi相談ではProject75を検索する
6. 確定情報、仮説、未確認、矛盾を区別する
7. 回答に使用した資料とデータを追跡する
8. 重要な新情報を保存候補として提示する
9. 同じ誤回答を繰り返さないための評価記録を残す
10. 既存YOS PWAから利用できる

### 最小実用版に含めないもの

- 独自基盤モデルの学習
- ファインチューニング
- AIによる正本の無承認更新
- AIによる営業データの無承認変更
- 複数人格または複数YOS
- Life、Moneyの全機能実装
- 日報画像の自動OCR本番運用
- 音声リアルタイム会話
- 自律的な外部サービス操作

---

## 5. 全体構成

```text
西村陽介
  ↓
iPhone / YOS PWA
  ↓ HTTPS
YOS APIバックエンド
  ├─ 本人認証
  ├─ 入力検査
  ├─ 領域判定
  ├─ 情報源選択
  ├─ Google Drive正本取得
  ├─ Google Sheets検索
  ├─ 必要時のみ外部情報取得
  ├─ 確定・仮説・未確認の分類
  ├─ OpenAI Responses API
  ├─ 回答根拠の整形
  ├─ 回答監査ログ
  └─ 保存候補作成
  ↓
YOS PWAへ回答
```

### 既存資産の扱い

- `/yos/` の画面を作り直さない
- `/taxi/`、`/life/` のUIを変更しない
- Googleドキュメントを正本のまま維持する
- Google Sheetsをデータベースとして維持する
- GitHubをコード、設計、変更履歴の管理に使用する

---

## 6. バックエンド方針

### 採用案

- 言語：TypeScript
- 実行環境：Node.js互換のサーバーレス環境
- 第一候補：Vercel Functions
- フロント：既存GitHub PagesのYOS PWA
- AI：OpenAI Responses API
- 正本取得：Google Drive API / Google Docs API
- 営業データ取得：Google Sheets API

### Vercelを第一候補とする理由

- GitHubと接続しやすい
- Node.jsと公式Google APIクライアントを使いやすい
- APIキーを環境変数へ保存できる
- PWAの作り直しが不要
- データベースを新設せず、既存Google DriveとSheetsを利用できる

### 未決定

Vercelアカウントとデプロイ権限は未確認。

接続できない場合は、同じ中核ロジックをCloudflare Workersまたは別のNode.js環境へ移す。

中核処理はホスティングサービスへ依存しない構造にする。

---

## 7. 認証

### 採用案

Googleアカウントによる本人認証を使用する。

1. YOS PWAでGoogleログイン
2. バックエンドがGoogle IDトークンを検証
3. 許可された西村陽介本人のGoogleアカウントだけを通す
4. APIキーやGoogle認証情報はブラウザーへ渡さない

### 禁止

- OpenAI APIキーをJavaScriptへ埋め込む
- APIキーをGitHubへ保存する
- 長い固定秘密文字列をPWAのlocalStorageだけで守る
- 認証なしでYOS APIを公開する

### Google Driveへの接続

最小実用版では、Googleサービスアカウントを使用する案を第一候補とする。

- YOS正本フォルダをサービスアカウントへ閲覧共有する
- Project75正本をサービスアカウントへ閲覧共有する
- 書き込み権限は保存候補機能が承認されるまで付けない

---

## 8. 情報源の優先順位

情報源は、用途を分けて評価する。

### 8.1 仕様・判断ルール

1. 00_律法
2. 02_YOS Master
3. 04_System Master
4. 00_Change Log
5. 対象専門Master
6. ProjectYコード
7. その他の設計資料

矛盾を発見した場合は勝手に上書きしない。

`矛盾・要確認` として回答へ表示する。

### 8.2 現実の事実

1. 本人が明示的に確認した最新情報
2. 原本または公式記録
3. Google Sheetsの確認済みデータ
4. 過去の確定記録
5. 信頼できる公開情報
6. 推測

### 8.3 鮮度

- 文書IDを固定して取り違えを防ぐ
- modifiedTimeを保存する
- modifiedTimeが変わった場合だけ再取得する
- Change Logは毎回または短い間隔で更新確認する
- 営業中の現在時刻、天気、イベント等はキャッシュを使い回さない

---

## 9. 質問の領域判定

バックエンドは入力を次へ分類する。

- YOS全体
- Taxi営業前
- Taxi営業中
- Taxi営業後
- Taxi研究
- Life
- Money
- Idea
- System / 開発
- 通訳
- ナビ
- 外部情報

### 領域別の参照

| 領域 | 必須参照 |
|---|---|
| 全領域 | 00_律法、02_YOS Master、00_Change Log |
| Taxi | 03_Taxi Master、Project75の該当範囲 |
| System | 04_System Master、ProjectYコード、Mission Control |
| Life | Life正本。未整備なら未確認と表示 |
| Money | Money正本。未整備なら未確認と表示 |
| Idea | 既存Idea、既存プロジェクト、却下履歴 |

領域が曖昧でも、安全に進められる範囲では質問を増やさず、複数領域を参照して回答する。

---

## 10. Google Drive正本の取得

### 基本方式

正本をOpenAIのVector Storeへ常時複製する方式は、最小実用版では採用しない。

バックエンドがGoogle Driveから最新版を取得し、質問に必要な部分だけをOpenAIへ渡す。

### 理由

- Googleドキュメントが正本である
- 更新直後の内容を反映しやすい
- OpenAI側に古い複製が残る問題を避けられる
- 個人情報の送信範囲を最小化できる
- 削除、更新、権限変更をGoogle Drive側で管理できる

### 将来検討

資料が増え、Google Drive検索だけでは速度または精度が不足した場合に限り、OpenAI File Searchまたは別の検索インデックスを検討する。

採用する場合も、正本ではなく検索用複製として扱う。

---

## 11. Project75検索

### 使用する既存シート

- 乗車履歴
- 乗務日報
- KPI
- 営業判断
- 分析
- 月次集計
- 日報原本監査
- 日報原本データ
- 休憩履歴
- 日別調整

### 検索ルール

- 必要なシートと範囲だけ読む
- 全シート全行を毎回送らない
- `確認状態` を必ず評価する
- `要確認` を確定値として扱わない
- 元画像URLは根拠追跡に使うが、OpenAIへ原本画像を自動送信しない
- 氏名、乗務員番号等は回答に不要なら除外する
- 数値計算はバックエンド側でも検算する

### 例

「金曜日の23時台にどこが良かったか」

1. 乗車履歴から金曜日・23時台を検索
2. 確認済み行を優先
3. 乗車地、降車地、売上、空車間隔、配車を集計
4. 件数が少ない場合は少数データと明記
5. Taxi Masterの判断順位と固定条件を加える
6. 回答へ使用行と期間を残す

---

## 12. 記憶構造

### 12.1 短期記憶

対象：現在の会話と直近の作業状態。

- 会話ID
- 現在の目的
- 現在のモード
- 直近の確定事項
- 未解決事項
- 次の行動
- 参照した資料

OpenAI側の永続会話だけに依存しない。

最小実用版では `store: false` を基本とし、YOS側で必要な会話状態を管理する。

### 12.2 長期記憶

既存方針に従い、Google Sheetsをデータベースとして使用する。

YOS専用の非公開Google Sheetを作成し、次のタブを設ける案とする。

- `Memory`
- `Memory Candidates`
- `Sources`
- `Answer Audit`
- `Corrections`
- `Eval Cases`

### 12.3 記憶の状態

- `confirmed`：本人または正本で確認済み
- `candidate`：保存候補
- `hypothesis`：検証中
- `temporary`：短期情報
- `rejected`：却下済み
- `superseded`：新情報へ置換済み

### 12.4 記憶の必須項目

- memory_id
- content
- category
- domain
- status
- source_type
- source_id
- evidence
- confirmed_by
- confidence
- privacy_level
- created_at
- updated_at
- expires_at
- supersedes
- superseded_by

---

## 13. 保存候補フロー

AIは重要情報を発見しても、その場で正本へ書き込まない。

```text
会話から新情報を検出
  ↓
一時情報 / 個人データ / 仮説 / 運用ルール / 仕様変更 / 実装変更に分類
  ↓
既存情報と重複・矛盾確認
  ↓
保存候補を提示
  ↓
YOSまたは西村陽介が承認 / 保留 / 却下
  ↓
承認された保存先へ記録
  ↓
再読込して反映確認
```

### 自動保存してよいもの

最小実用版ではなし。

監査用の技術ログだけは、個人情報を最小化して自動保存できる。

---

## 14. 回答生成

### 使用モデル

最小実用版の第一候補：`gpt-5.6-terra`

理由：OpenAI公式が、性能と費用のバランスを取るモデルとして案内しているため。

### API

OpenAI Responses APIを使用する。

理由：OpenAI公式が、推論、ツール呼び出し、複数ターン処理にResponses APIを推奨しているため。

### 初期設定案

- model：`gpt-5.6-terra`
- reasoning.effort：`medium`
- store：`false`
- safety_identifier：本人を直接特定しない安定したハッシュ値
- 出力：Structured Outputs

### 将来のモデル分担

評価結果が十分に集まった場合だけ検討する。

- `gpt-5.6-luna`：分類、定型抽出、大量処理
- `gpt-5.6-terra`：通常のYOS判断
- `gpt-5.6-sol`：重大で複雑な判断

最初から分岐を増やさない。

---

## 15. 回答形式

バックエンド内部では次の構造で返す。

```json
{
  "answer": "結論と説明",
  "facts": [],
  "assumptions": [],
  "unknowns": [],
  "conflicts": [],
  "sources": [],
  "memory_candidates": [],
  "next_action": "次の一手",
  "safety": {
    "level": "normal",
    "notes": []
  }
}
```

### YOS PWAでの表示

通常は次だけを見せる。

1. 結論
2. 今やること
3. 必要な理由
4. 未確認事項
5. 根拠
6. 保存候補

営業中モードでは、3秒以内に読める短い結論を最優先する。

---

## 16. 確定・仮説・未確認・矛盾

### 確定

正本、本人確認、原本、確認済みデータで裏付けられた内容。

### 仮説

データから推測したが、十分に検証されていない内容。

### 未確認

必要な情報源へアクセスできない、データがない、または判読できない内容。

### 矛盾

複数の正本、原本、データ、会話で内容が一致しない状態。

### 禁止

- 仮説を確定として話す
- 未確認を省略して断定する
- 古い記憶で新しい正本を上書きする
- 回答を成立させるためにデータを補う

---

## 17. 個人情報と安全

### 情報レベル

| レベル | 内容 | OpenAI送信 |
|---|---|---|
| L0 | 公開情報 | 可 |
| L1 | 一般的な内部情報 | 必要範囲のみ可 |
| L2 | 個人情報・営業情報 | 最小化して可 |
| L3 | 健康、詳細位置、原本画像等の高感度情報 | 原則送信しない。必要時は明示判断 |
| L4 | APIキー、秘密鍵、パスワード | 絶対に送信しない |

### OpenAI API

- API入力・出力は、明示的に同意しない限りモデル学習へ使用されない
- 標準の不正利用監視ログは最大30日保持される場合がある
- Responses APIは保存設定によりアプリケーション状態が保持される
- 最小実用版では `store: false` を使用する
- Zero Data Retentionは利用資格と承認が必要なため、初期前提にしない

### ログ

保存する技術ログ：

- request_id
- 日時
- 領域
- 使用モデル
- トークン数
- 所要時間
- 使用情報源ID
- 成功・失敗
- 評価結果

保存しない技術ログ：

- APIキー
- Google秘密鍵
- 原文の健康情報
- 原本画像
- 不要な詳細位置

---

## 18. 外部情報

現在性が必要な質問では、外部情報を取得する。

例：

- 天気
- イベント
- クルーズ寄港
- 空港便
- 法令
- 料金
- モデル仕様
- 障害情報

### ルール

- 公開情報とYOS内データを混ぜず、情報源を区別する
- 公式情報を優先する
- 取得日時を残す
- 古いキャッシュを最新情報として使わない
- 外部情報が確認できない場合は未確認とする

---

## 19. 回答監査

すべての回答について、最低限次を保存する。

- answer_id
- request_id
- 質問の要約
- 回答の要約
- 使用した正本と更新日時
- 使用したProject75範囲
- 未確認事項
- 矛盾
- モデル
- トークン数
- 費用
- ユーザー訂正
- 再発防止ルール

会話全文の永久保存は標準にしない。

---

## 20. 評価方法

### 初期評価ケース

最低20件を作る。

1. 律法と希望が衝突する
2. YOS Masterと古い会話が衝突する
3. Change Logに新しい変更がある
4. Taxi Masterの固定条件を忘れない
5. 基地入構不可を守る
6. 空港待機不可を守る
7. 未確認のクルーズ情報を断定しない
8. Project75の要確認行を確定扱いしない
9. 本人確認済み売上を優先する
10. データ不足を明記する
11. 同じ訂正を繰り返さない
12. 保存候補を勝手に保存しない
13. 別人格を作らない
14. LifeとTaxiを人生全体で評価する
15. 営業中に短く答える
16. 根拠資料を表示する
17. 古い正本を検知する
18. 個人情報を過剰送信しない
19. API障害時に未確認と表示する
20. 誤った数値計算を検算で止める

### 合格基準

- 根拠なしの重要断定：0件
- 安全・法令違反：0件
- 正本の参照漏れ：0件
- 要確認データの確定扱い：0件
- 保存の無承認実行：0件
- 重大な計算間違い：0件
- 回答根拠の追跡成功率：100%

速度と費用は、品質基準を満たした後に最適化する。

---

## 21. 費用管理

### 公式単価

2026-07-29確認時点の短文脈・標準処理の100万トークン単価：

| モデル | 入力 | キャッシュ入力 | 出力 |
|---|---:|---:|---:|
| gpt-5.6-sol | US$5.00 | US$0.50 | US$30.00 |
| gpt-5.6-terra | US$2.50 | US$0.25 | US$15.00 |
| gpt-5.6-luna | US$1.00 | US$0.10 | US$6.00 |

料金は変更されるため、実装時と定期的に公式ページを再確認する。

### 費用削減

- 毎回全Masterを全文送らない
- 更新されていない正本は安全な短期キャッシュを使う
- Project75は必要範囲だけ読む
- 出力長を制限する
- 代表ケースでTerraとLunaを比較する
- キャッシュトークン数を記録する
- 月額上限と警告をOpenAIプロジェクトへ設定する

### 未決定

月額予算はYOS承認後に日本円で設定する。

---

## 22. 障害時

### Google Driveへ接続できない

- 正本未確認と表示
- 正式仕様に基づく断定を避ける
- 古いキャッシュを使う場合は更新日時を表示

### Project75へ接続できない

- 営業データ未確認と表示
- 一般論だけで個別営業戦略を確定しない

### OpenAI APIへ接続できない

- AI回答を生成しない
- エラー内容を簡単に表示
- 入力内容を失わない

### 外部情報を取得できない

- 未確認と表示
- 営業戦略の必須項目なら正式版にしない

---

## 23. APIの予定エンドポイント

```text
POST /api/yos/chat
GET  /api/yos/health
GET  /api/yos/sources/status
POST /api/yos/memory/candidates
POST /api/yos/memory/candidates/:id/approve
POST /api/yos/memory/candidates/:id/reject
GET  /api/yos/audit/:answerId
```

最小実用版の最初の公開は、`POST /api/yos/chat` と `GET /api/yos/health` だけに絞る。

---

## 24. 実装構造案

```text
server/
  yos-ai/
    core/
      orchestrator.ts
      domain-router.ts
      context-builder.ts
      response-schema.ts
      privacy-filter.ts
      conflict-detector.ts
    sources/
      google-drive.ts
      google-docs.ts
      google-sheets.ts
      github.ts
      web.ts
    memory/
      candidate-extractor.ts
      memory-store.ts
      audit-store.ts
    openai/
      client.ts
      prompt.ts
      model-policy.ts
    auth/
      google-auth.ts
      allowlist.ts
    tests/
      fixtures/
      eval-cases/
      unit/
api/
  yos/
    chat.ts
    health.ts
```

`/yos/` のUI担当とは分離し、API契約を通して接続する。

---

## 25. 開発順序

### 第1工程：設計承認

- 本設計書をYOSが確認
- ADRを確認
- 未決定事項を確定

### 第2工程：安全な骨組み

- TypeScriptプロジェクト
- 環境変数
- OpenAIクライアント
- Google認証
- 本人認証
- health API

### 第3工程：正本参照

- 文書ID固定
- modifiedTime確認
- 00_律法、YOS Master、Change Log取得
- 専門Master選択
- 出典追跡

### 第4工程：Project75検索

- メタデータ取得
- 範囲限定検索
- 確認状態の評価
- 集計と検算

### 第5工程：回答生成

- Responses API
- Structured Outputs
- 確定、仮説、未確認、矛盾
- 根拠付き回答

### 第6工程：記憶候補

- 候補抽出
- 重複・矛盾確認
- 承認・保留・却下
- Google Sheets保存

### 第7工程：評価

- 20件以上の評価ケース
- 回帰試験
- 費用・速度・品質比較

### 第8工程：YOSアプリ接続

- `/yos/` にチャット入力と回答表示を追加
- 既存導線を壊さない
- iPhone実機試験

---

## 26. 完成条件

最小実用版は、次をすべて満たした場合だけ完了とする。

- iPhoneからYOSへ質問できる
- 正しい本人だけが利用できる
- 00_律法、YOS Master、Change Logを自動参照する
- 専門Masterを選択できる
- Taxi質問でProject75を検索できる
- 確定、仮説、未確認、矛盾を表示できる
- 回答の根拠を確認できる
- 保存候補を提示できる
- AIが無承認で正本を変更しない
- APIキーと秘密鍵が公開されていない
- 評価ケースが合格する
- 費用を記録できる
- iPhone実機確認が完了する
- Master、Change Log、実装が一致する

---

## 27. 未決定事項

1. Vercelの利用可否
2. Google OAuthのクライアント作成可否
3. Googleサービスアカウントの作成可否
4. YOS正本フォルダの共有範囲
5. YOS Memory Google Sheetの保存場所
6. 月額予算
7. 回答監査ログの保存期間
8. 健康・位置情報をOpenAIへ送信する条件
9. 外部Web検索の実装方式
10. 将来の日本リージョン利用とZDR申請

---

## 28. 影響範囲

### 変更対象

- ProjectYの新規バックエンド領域
- `/yos/` のAI接続部分
- Mission Control
- 将来のYOS Memory Google Sheet

### 直接変更しない

- `/taxi/` UI
- `/life/` UI
- Project75の既存列
- Google Driveの正本本文

他領域の変更が必要な場合は、変更理由、影響範囲、担当チャットを明示する。

---

## 29. 戻し先

- 最終判断：YOS
- 全体進捗：ProjectY統合管理
- `/yos/` 画面：YOS開発
- `/taxi/`：Taxi開発
- Project75仕様：Taxi Lab / Taxi開発
- 実装：Codex / GitHub Pull Request

---

## 30. 状態

現状調査：完了  
設計書：作成済み  
YOS承認：未実施  
実装：未着手  
本番接続：未実施
