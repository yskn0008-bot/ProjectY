# YOS専用生成AI 設計書 v0.1

更新日：2026-07-29  
状態：YOS確認待ち  
対象Issue：#71  
最終判断：YOS

---

## 1. 目的

一人の利用者専用の生成AI「YOS」を構築する。

YOSは質問へ答えるだけのAIではない。利用者が自分らしく生き続けながら、仕事・健康・お金・人間関係・自由・安心・挑戦・経験を含む人生全体の期待値を最大化するための判断支援AIとする。

YOSは唯一の人格とし、Taxi・Life・Money・IdeaはYOSが扱う専門領域とする。

---

## 2. 確認した正本と既存資産

### Google Drive正本

1. 00_律法
2. 02_YOS Master
3. 04_System Master
4. 00_Change Log
5. 03_Taxi Master

### 既存システム

- GitHub `yskn0008-bot/ProjectY`
- `/yos/` PWA
- YOS Mission Control
- Project75のGoogle Sheets正本
- 乗車履歴、乗務日報、原本監査、確認状態

### 現在地

実装済み：

- YOSの使命、判断順位、情報源、同期ルール
- Googleドキュメント正本
- Google Sheetsデータベース
- Project75の実データ
- iPhone向けYOS PWA
- Mission Control
- GitHubによる変更履歴

未実装：

- OpenAI APIを呼ぶバックエンド
- Google Drive正本の自動参照
- 質問別の専門Master選択
- Project75の自動検索
- 長期記憶
- 保存候補の承認フロー
- 根拠追跡と回答監査
- 本人認証
- API費用監視

現在の `/yos/` は、相談文をコピーして既存ChatGPTチャットを開く入口である。既存画面は残し、生成AIへの接続部分だけを追加する。

---

## 3. 最小実用版

最初に次を実現する。

1. 00_律法を自動参照する
2. 02_YOS Masterを自動参照する
3. 00_Change Logを自動参照する
4. 質問に応じてSystem Masterまたは専門Masterを参照する
5. Taxi相談ではProject75を検索する
6. 確定・仮説・未確認・矛盾を区別する
7. 回答に使用した資料とデータを追跡する
8. 重要な新情報を保存候補として提示する
9. 同じ誤回答を繰り返さない評価記録を残す
10. 既存YOS PWAから利用できる

初期版に含めないもの：

- 独自基盤モデルの学習
- ファインチューニング
- AIによる正本や営業データの無承認変更
- 複数人格
- Life・Moneyの全機能
- 日報画像OCRの本番自動運用
- 自律的な外部サービス操作

---

## 4. 全体構成

```text
利用者
  ↓
iPhone / 既存YOS PWA
  ↓ HTTPS
YOS APIバックエンド
  ├─ 本人認証
  ├─ 入力検査
  ├─ 領域判定
  ├─ 情報源選択
  ├─ Google Drive正本取得
  ├─ Google Sheets検索
  ├─ 個人情報の除外
  ├─ 確定・仮説・未確認・矛盾の分類
  ├─ OpenAI Responses API
  ├─ 回答根拠の整形
  ├─ 回答監査
  └─ 保存候補作成
  ↓
YOS PWAへ回答
```

既存資産の扱い：

- `/yos/` を作り直さない
- `/taxi/` と `/life/` のUIを変更しない
- Googleドキュメントを正本のまま維持する
- Google Sheetsをデータベースとして維持する
- GitHubはコード・設計・変更履歴だけに使う
- 個人情報・秘密鍵・非公開ファイルIDを公開GitHubへ保存しない

---

## 5. バックエンド方針

採用候補：

- 言語：TypeScript
- 実行環境：Node.js互換サーバーレス
- 第一候補：Vercel Functions
- AI：OpenAI Responses API
- 正本取得：Google Drive / Docs API
- 営業データ取得：Google Sheets API

Vercelを第一候補とする理由：

- GitHubと接続しやすい
- APIキーを環境変数へ保存できる
- 既存PWAを維持できる
- Google APIクライアントを利用しやすい

Vercelの利用権限は未確認。中核処理はホスティングサービスへ依存しない構造にする。

---

## 6. 認証と秘密情報

本人認証はGoogleアカウント認証を第一候補とする。

1. YOS PWAでGoogleログイン
2. バックエンドがIDトークンを検証
3. 許可された本人だけを通す
4. APIキーやGoogle秘密鍵はブラウザーへ渡さない

Google DriveとProject75は、読み取り専用サービスアカウントを第一候補とする。書き込み権限は、保存候補機能が承認されるまで付けない。

禁止：

- APIキーをJavaScriptへ埋め込む
- 秘密鍵をGitHubへ保存する
- 本人メールを公開コードへ保存する
- 非公開のGoogle文書IDを公開GitHubへ保存する
- 認証なしでYOS APIを公開する

---

## 7. 情報源の優先順位

### 仕様と判断ルール

1. 00_律法
2. 02_YOS Master
3. 04_System Master
4. 00_Change Log
5. 対象専門Master
6. ProjectYコード
7. その他の設計資料

### 現実の事実

1. 本人が明示的に確認した最新情報
2. 原本または公式記録
3. Google Sheetsの確認済みデータ
4. 過去の確定記録
5. 信頼できる公開情報
6. 推測

矛盾を発見した場合は勝手に上書きせず、`矛盾・要確認` として表示する。

文書IDは秘密設定で固定し、modifiedTimeが変わった場合に再取得する。Change Logは毎回または短い間隔で更新確認する。

---

## 8. 領域判定

入力を次へ分類する。

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

全領域で必須：00_律法、02_YOS Master、00_Change Log。

Taxiでは03_Taxi MasterとProject75、Systemでは04_System Master・ProjectYコード・Mission Controlを追加する。Life・Money正本が未整備なら未確認と表示する。

---

## 9. Google Drive正本

最小実用版では、正本をOpenAIのVector Storeへ常時複製しない。

バックエンドがGoogle Driveから最新版を取得し、質問に必要な部分だけをOpenAIへ渡す。

理由：

- Googleドキュメントが正本である
- 更新直後の内容を反映しやすい
- 古い複製が残る問題を避けられる
- 個人情報の送信範囲を小さくできる

資料量が増えて速度または精度が不足した場合だけ、File Search等を検索用補助として検討する。

---

## 10. Project75検索

利用候補：

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

ルール：

- 必要なシートと範囲だけ読む
- 全行を毎回送らない
- `確認状態` を必ず評価する
- `要確認` を確定値として扱わない
- 原本画像を自動でOpenAIへ送らない
- 氏名・乗務員番号等を回答に不要なら除外する
- 数値はバックエンドでも検算する

---

## 11. 記憶

### 短期記憶

- 会話ID
- 現在の目的
- 現在のモード
- 直近の確定事項
- 未解決事項
- 次の行動
- 参照した資料

OpenAI側の永続会話だけに依存しない。Responses APIは `store: false` を基本とする。

### 長期記憶

既存方針に従い、非公開Google Sheetsを第一候補とする。

候補タブ：

- Memory
- Memory Candidates
- Sources
- Answer Audit
- Corrections
- Eval Cases

状態：

- confirmed
- candidate
- hypothesis
- temporary
- rejected
- superseded

AIは重要情報を発見しても、その場で正本へ書き込まない。重複・矛盾を確認し、保存候補を提示し、承認後だけ指定先へ保存する。

---

## 12. 回答生成

初期モデル候補：`gpt-5.6-terra`。

初期設定案：

- API：Responses API
- reasoning effort：medium
- store：false
- Structured Outputs
- safety identifier：本人を直接特定しない安定ハッシュ

内部回答形式：

```json
{
  "answer": "結論",
  "facts": [],
  "assumptions": [],
  "unknowns": [],
  "conflicts": [],
  "sources": [],
  "memoryCandidates": [],
  "nextAction": null,
  "safety": { "level": "normal", "notes": [] }
}
```

営業中モードでは3秒以内に読める結論を優先する。

---

## 13. 個人情報と安全

| レベル | 内容 | OpenAI送信 |
|---|---|---|
| L0 | 公開情報 | 可 |
| L1 | 一般内部情報 | 必要範囲のみ可 |
| L2 | 個人情報・営業情報 | 最小化して可 |
| L3 | 健康・詳細位置・原本画像 | 原則送信しない |
| L4 | APIキー・秘密鍵・パスワード | 絶対に送信しない |

技術ログに保存するもの：request ID、日時、領域、モデル、トークン数、所要時間、情報源ID、成功・失敗、評価結果。

保存しないもの：APIキー、秘密鍵、原文の高感度情報、原本画像、不要な詳細位置。

---

## 14. 外部情報

天気、イベント、クルーズ、空港便、法令、料金、モデル仕様等の現在性が必要な質問では外部情報を取得する。

- 公式情報を優先する
- 取得日時を残す
- YOS内データと公開情報を分ける
- 古いキャッシュを最新として使わない
- 確認できなければ未確認とする

---

## 15. 評価

初期評価は最低20件。

重要ケース：

- 律法と希望の衝突
- Masterと古い会話の衝突
- Change Log更新
- Taxi固定条件
- 要確認行の誤使用防止
- 本人確認済みデータの優先
- データ不足の明記
- 同じ訂正の再発防止
- 無承認保存の禁止
- 根拠表示
- 個人情報の過剰送信防止
- 数値検算

合格基準：

- 安全・法令違反 0件
- 根拠なしの重要断定 0件
- 正本参照漏れ 0件
- 要確認データの確定扱い 0件
- 無承認保存 0件
- 重大な計算間違い 0件
- 回答根拠追跡 100%

---

## 16. 費用

料金は実装時にOpenAI公式料金を再確認する。

削減策：

- Master全文を毎回送らない
- 更新されていない正本を短期キャッシュする
- Project75は必要範囲だけ読む
- 出力長を制限する
- トークン数と1回答費用を記録する
- OpenAIプロジェクトへ月額上限・警告を設定する

月額予算は未決定。

---

## 17. 障害時

Google Driveに接続できない：正本未確認と表示し、正式仕様の断定を避ける。

Project75に接続できない：営業データ未確認と表示し、個別営業戦略を確定しない。

OpenAI APIに接続できない：AI回答を生成せず、入力を失わない。

外部情報を取得できない：未確認とし、必須項目なら正式版にしない。

---

## 18. API予定

```text
POST /api/yos/chat
GET  /api/yos/health
GET  /api/yos/sources/status
POST /api/yos/memory/candidates
POST /api/yos/memory/candidates/:id/approve
POST /api/yos/memory/candidates/:id/reject
GET  /api/yos/audit/:answerId
```

最初は `POST /api/yos/chat` と `GET /api/yos/health` だけに絞る。

---

## 19. 実装構造

```text
server/yos-ai/
  src/
    types.ts
    domain-router.ts
    source-policy.ts
    privacy-filter.ts
    conflict-detector.ts
    context-builder.ts
    orchestrator.ts
  schemas/
  tests/
```

Google・OpenAI・認証は差し替え可能な接続口として後から追加する。

---

## 20. 開発順序

1. 設計・ADR確認
2. 外部依存のない中核骨組み
3. Google本人認証
4. Google Drive / Docs参照
5. Project75範囲検索
6. OpenAI Responses接続
7. 根拠付き回答
8. 記憶候補
9. 20件以上の評価
10. `/yos/` 接続
11. iPhone実機試験
12. Master・Change Log・実装同期

---

## 21. 完成条件

- iPhoneから質問できる
- 本人だけが利用できる
- 必須正本を自動参照できる
- 専門Masterを選択できる
- Taxi質問でProject75を検索できる
- 確定・仮説・未確認・矛盾を表示できる
- 根拠を確認できる
- 保存候補を提示できる
- 無承認で正本を変更しない
- 秘密情報が公開されていない
- 評価ケースが合格する
- 費用を記録できる
- iPhone実機確認が完了する
- Master・Change Log・実装が一致する

---

## 22. 未決定

1. Vercel利用可否
2. Google OAuth設定
3. サービスアカウント設定
4. YOS Memory Sheet保存場所
5. 月額予算
6. 監査ログ保存期間
7. L3情報をOpenAIへ送る条件
8. 外部検索方式
9. 将来のZDR申請

---

## 23. 影響範囲

変更対象：新規バックエンド領域、将来の `/yos/` AI接続、Mission Control、非公開の記憶DB。

直接変更しない：`/taxi/` UI、`/life/` UI、Project75既存列、Google Drive正本文。

---

## 24. 状態

現状調査：完了  
設計書：作成済み  
安全な中核骨組み：作成中  
YOS承認：未実施  
外部サービス接続：未実施  
本番接続：未実施
