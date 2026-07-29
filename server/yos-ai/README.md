# YOS AI Core v0.1

YOS専用生成AIの読み取り専用MVPです。

状態：**コード完成・自動試験合格・本番資格情報未設定**

## 実装済み

- 情報領域の判定
- 00_律法・02_YOS Master・00_Change Logの必須参照
- 専門MasterとProject75の必要範囲選択
- L4秘密情報の送信禁止
- APIキー・秘密鍵・Bearer Token等の除外
- 根拠の競合検知
- 各事実への既知`source_id`必須化
- 根拠なし・未知根拠・過大な事実の除外
- Google Drive文書の読み取り専用取得
- Google Sheetsの有限範囲読み取り
- 開放範囲・1万セル超の読み取り拒否
- 正本の総文字数・1文書の文字数上限
- Project75の個人情報列・原本URL列を避けた範囲設定
- OpenAI Responses API接続
- `store: false`、`safety_identifier`、厳格なJSON Schema出力
- 通常回答・営業中回答の出力トークン上限
- OpenAI使用トークン・モデル・Response IDの取得
- Google Auth Libraryによる本人IDトークン検証
- Google `sub`のハッシュによる本人許可
- 許可Origin限定のYOS chat API
- APIサーバー側での現在時刻確定
- Vercel OIDC＋Google Workload Identity Federation接続
- Google STSとサービスアカウント偽装による短期資格情報
- Drive・Sheets読み取り専用スコープ固定
- Upstash RESTによる分散回数制限
- Upstashへのメタデータ限定回答監査
- 監査保存失敗時に回答を返さない処理
- 保存候補の根拠・領域・秘密情報・件数・文字数検査
- 保存候補を承認前に確定保存しない処理
- Vercel用`/api/yos/chat`、`/api/yos/health`
- GitHub Actionsによる型検査・API構文検査・自動試験
- 20件以上の独立した再発防止評価ゲート

## 本番構成

```text
YOS PWA
  ↓ Google ID token
Vercel /api/yos/chat
  ├─ 本人確認
  ├─ Upstash分散回数制限
  ├─ Vercel OIDC
  ├─ Google Workload Identity Federation
  ├─ Drive / Sheets読み取り
  ├─ 秘密情報除外・根拠検査
  ├─ OpenAI Responses API
  └─ Upstashメタデータ監査
```

## Google認証

本番では長期のサービスアカウント秘密鍵を使いません。

Vercel OIDCをGoogle Workload Identity Federationで短期資格情報へ交換します。OIDCトークンはGoogle資格情報交換だけに使い、質問本文・OpenAI入力・回答・監査ログへ渡しません。

## 回答監査

保存するもの：

- Request ID
- 本人を直接特定しないsubject hash
- 領域と営業中モード
- 使用した情報源IDと更新日時
- 矛盾項目のキー
- 未確認数と保存候補数
- 安全状態
- 処理時間
- モデル・トークン使用量

保存しないもの：

- 質問本文
- 回答本文
- 会話要約
- 現在地
- 根拠本文と矛盾値
- Drive・Sheetsの非公開Locator
- APIキー・Google資格情報・Vercel OIDCトークン

## Vercel配置

VercelプロジェクトのRoot Directoryを`server/yos-ai`に設定します。

公開されるAPI：

- `POST /api/yos/chat`
- `OPTIONS /api/yos/chat`
- `GET /api/yos/health`

必要な環境変数名は`.env.example`にあります。実値はGitHubへ保存しません。

## テスト

```bash
npm install
npm test
```

GitHub Actions結果：**96件合格、0件失敗**。

確認済み：

- TypeScript型検査
- 公式Google Auth Library 10.9.1
- JSON SchemaとOpenAI出力検査
- Vercel APIファイルの構文
- 分散回数制限・監査保存の模擬通信
- 24件のYOS再発防止評価

## 本番利用前に外部画面で必要な設定

コード外で次を一度だけ設定します。

1. Vercelプロジェクト作成とRoot Directory設定
2. Vercel環境変数設定
3. Upstash Redis作成と資格情報設定
4. Google Cloud Workload Identity Pool・Provider設定
5. 読み取り専用サービスアカウント共有
6. OpenAI APIキー設定
7. 実Google Drive・Sheets・OpenAI疎通確認
8. `/yos/` PWAからAPIへ接続
9. iPhone実機確認

これらは秘密情報と外部アカウント操作を伴うため、リポジトリ内だけでは完了しません。

## 原則

- 正本を無承認で変更しない
- 保存候補を承認前に確定保存しない
- `store: false`を標準とする
- APIキーをブラウザーやGitHubへ保存しない
- 長期のGoogle秘密鍵を本番で使用しない
- 本人メールではなくGoogleの不変ID`sub`をハッシュ照合する
- 重要な現在時刻はAPIサーバー側で確定する
- Project75は必要な有限範囲だけ取得する
- モデル入力・出力・回数を制限する
- 確定・仮説・未確認・矛盾を分離する
- 追跡不能な回答を返さない

## 秘密情報

`.env.example`には変数名だけを置きます。

秘密鍵、APIキー、本人のメールアドレス、Google `sub`、Vercel OIDCトークン、非公開ファイルID、スプレッドシートIDはGitHubへ保存しません。
