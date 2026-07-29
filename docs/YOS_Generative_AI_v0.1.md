# YOS専用生成AI 設計書 v0.1

更新日：2026-07-30  
状態：採用・MVPコード完成  
対象Issue：#71  
対象PR：#76  
最終判断：YOS

---

## 1. 目的

一人の利用者専用の生成AI「YOS」を構築する。

YOSは質問へ答えるだけではなく、利用者が自分らしく在り続けながら、仕事・健康・お金・人間関係・自由・安心・挑戦・経験を含む人生全体の期待値を最大化するための判断支援AIとする。

YOSは唯一の人格とし、Taxi・Life・Money・IdeaはYOSが扱う専門領域とする。

---

## 2. 既存資産

### 正本

- 00_律法
- 02_YOS Master
- 04_System Master
- 00_Change Log
- 03_Taxi Master

### システム

- GitHub `yskn0008-bot/ProjectY`
- `/yos/` PWA
- YOS Mission Control
- Project75 Google Sheets
- 乗車履歴、乗務日報、KPI、分析、原本監査、確認状態

既存資産を作り直さず、生成AI接続部分だけを追加する。

---

## 3. MVP完成条件

MVPは次を実現する。

1. 00_律法、02_YOS Master、00_Change Logを必ず参照する
2. 質問に応じて専門Masterを選択する
3. Taxi相談ではProject75を必要範囲だけ検索する
4. 確定・仮説・未確認・矛盾を区別する
5. 各事実へ既知の`source_id`を付ける
6. 回答に使った情報源を追跡する
7. 重要な新情報を保存候補として提示する
8. 保存候補を承認前に確定保存しない
9. 同じ誤回答を繰り返さない評価ゲートを持つ
10. 既存YOS PWAから接続できるAPIを提供する

初期版に含めないもの：

- 独自基盤モデルの学習
- ファインチューニング
- AIによる正本や営業データの無承認変更
- 複数人格
- 日報画像OCRの本番自動運用
- 自律的な外部サービス書き込み

---

## 4. 全体構成

```text
利用者
  ↓
iPhone / 既存YOS PWA
  ↓ Google ID token
Vercel /api/yos/chat
  ├─ Origin制限
  ├─ 本人確認
  ├─ 入力・回数・費用上限
  ├─ Vercel OIDC
  ├─ Google Workload Identity Federation
  ├─ Google Drive正本取得
  ├─ Google Sheets有限範囲取得
  ├─ 秘密情報除外
  ├─ 領域・根拠・矛盾・未確認の検査
  ├─ OpenAI Responses API
  ├─ 保存候補検査
  └─ Upstashメタデータ監査
  ↓
YOS PWAへ回答
```

---

## 5. 技術構成

- 言語：TypeScript
- 実行環境：Node.js 22互換
- ホスティング候補：Vercel Functions
- AI：OpenAI Responses API
- 初期モデル：`gpt-5.6-terra`
- 正本取得：Google Drive API
- 営業データ取得：Google Sheets API
- Google認証：Vercel OIDC＋Workload Identity Federation
- 本人認証：Google ID token
- 回数制限：Upstash Redis REST
- 回答監査：Upstash Redis REST
- コードと変更履歴：GitHub

---

## 6. 情報源の優先順位

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

矛盾を発見した場合は勝手に上書きせず、`矛盾・要確認`として扱う。

---

## 7. 領域判定

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

Taxiでは03_Taxi MasterとProject75を追加する。Systemでは04_System Master、ProjectYコード、Mission Controlを追加する。

---

## 8. Google Drive正本

- Googleドキュメントを正本のまま維持する
- OpenAI Vector Storeへ常時複製しない
- 必要な文書だけを取得する
- 文書ごと、全体とも文字数上限を強制する
- L4情報源はモデルへ送らない
- 非公開文書IDは環境変数だけに保存する

---

## 9. Project75検索

利用対象：

- 乗車履歴
- 乗務日報
- KPI
- 営業判断
- 分析
- 月次集計
- 日報原本監査

ルール：

- 必要なシートと有限範囲だけ読む
- 開放範囲を拒否する
- 1万セル超の取得を拒否する
- `確認状態`と`要確認`を区別する
- 原本画像を自動でOpenAIへ送らない
- 氏名、乗務員番号、原本URL等の不要列を避ける

---

## 10. 本人認証とGoogle認証

### 本人認証

1. YOS PWAがGoogle ID tokenを送る
2. バックエンドが公式Google Auth Libraryで検証する
3. Googleの不変ID`sub`をハッシュ化する
4. 許可されたsubject hashだけを通す

本人メールアドレスは公開コードへ保存しない。

### Google Drive・Sheets認証

- 長期サービスアカウント秘密鍵を作成・保存しない
- Vercel OIDCをGoogle STSへ交換する
- 読み取り専用サービスアカウントを偽装する
- Drive・Sheets読み取り専用スコープに固定する
- 本番でADCへ自動フォールバックしない

---

## 11. OpenAI接続

- Responses APIを使用する
- `store: false`を強制する
- `safety_identifier`へ本人のsubject hashを使う
- 厳格なJSON Schema出力を使う
- 通常回答と営業中回答で出力上限を分ける
- 営業中は低推論・低verbosityを使う
- モデル、Response ID、入力・出力・推論トークンを取得する

---

## 12. 根拠検査

モデルが返す事実は次の形とする。

```json
{
  "text": "事実本文",
  "sourceIds": ["00_law"]
}
```

拒否するもの：

- 根拠情報源が0件
- 未知の`source_id`
- 上限を超える事実数
- 長すぎる事実本文
- 1事実あたりの根拠数超過

`answer`内の事実主張は`facts`に含めた内容だけを使うようモデルへ指示する。

---

## 13. 保存候補

保存候補は次を検査する。

- 根拠情報源
- 対象領域
- 秘密情報
- 個人情報レベル
- 件数
- 文字数

保存候補は回答内で提示するだけとし、承認前にMaster、Change Log、Project75、長期記憶へ書き込まない。

---

## 14. 回答監査

保存するもの：

- Request ID
- 本人を直接特定しないsubject hash
- 領域と営業中モード
- 使用した情報源IDと更新日時
- 矛盾キー
- 未確認数
- 保存候補数
- 安全状態
- 処理時間
- モデルとトークン使用量

保存しないもの：

- 質問本文
- 回答本文
- 会話要約
- 現在地
- 根拠本文と矛盾値
- Drive・Sheetsの非公開Locator
- APIキー、Google資格情報、Vercel OIDCトークン

監査保存に失敗した場合は回答を返さない。

---

## 15. 費用・暴走防止

- 本人ごとの1時間回数上限
- 分散ストレージで回数を管理
- 入力本文、会話要約、位置文字数を制限
- 正本取得量を制限
- Project75取得セル数を制限
- 通常・営業中の出力トークンを制限
- OpenAI使用量を監査へ記録
- 上限機能を無効化できない構成にする

---

## 16. Vercel API

VercelプロジェクトのRoot Directory：`server/yos-ai`

公開API：

- `POST /api/yos/chat`
- `OPTIONS /api/yos/chat`
- `GET /api/yos/health`

設定不足または内部障害時は秘密を返さず503で停止する。

---

## 17. 自動試験

GitHub Actionsで次を実行する。

- 公式Google Auth Library 10.9.1のインストール
- TypeScript型検査
- Node標準試験
- Vercel API構文検査
- 24件の独立した再発防止評価

結果：**96件合格、0件失敗**。

---

## 18. 実装済み

- 領域判定
- 情報源選択
- Drive・Sheets読み取り
- Project75有限範囲
- 秘密情報除外
- 根拠・矛盾・未確認検査
- 保存候補検査
- OpenAI接続
- Google本人認証
- 鍵なしGoogle認証
- 分散回数制限
- メタデータ監査
- Vercel API入口
- 自動試験と評価ゲート

---

## 19. コード外の本番設定

リポジトリ外で必要：

1. Vercelプロジェクト作成
2. Vercel環境変数設定
3. Upstash Redis作成
4. Google Cloud Workload Identity Pool・Provider設定
5. 読み取り専用サービスアカウント共有
6. OpenAI APIキー設定
7. 実Google Drive・Sheets・OpenAI疎通確認
8. `/yos/` PWA接続
9. iPhone実機確認

秘密情報と外部アカウント操作が必要なため、コードだけでは実施できない。

---

## 20. 状態

YOS承認：完了  
設計：完了  
MVPコード：完了  
自動試験：完了  
評価ゲート：完了  
PR：#76  
main反映：PRマージで実施  
本番資格情報設定：外部運用設定として未実施  
PWA接続：YOS開発担当  
iPhone実機確認：未実施
