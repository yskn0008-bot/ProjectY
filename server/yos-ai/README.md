# YOS AI Core v0.1

YOS専用生成AIの、安全な中核ロジックと接続境界です。

## 実装済み

- 情報領域の判定
- 必須情報源の選択
- L4秘密情報の送信禁止
- 秘密文字列の除外
- 根拠の競合検知
- Google Drive文書の読み取り専用クライアント
- Google Sheetsの有限範囲読み取り
- 開放範囲・1万セル超の読み取り拒否
- 正本の総文字数・1文書の文字数上限
- OpenAI Responses APIクライアント
- `store: false`、`safety_identifier`、JSON Schema出力
- 通常回答・営業中回答の出力トークン上限
- Google Auth Libraryによる本人IDトークン検証の接続
- Google `sub` のハッシュによる本人許可
- 許可Origin限定のYOS chat API境界
- 本人ごとの回数制限を必須化
- 入力サイズ・項目・Content-Type・HTTPメソッドの検査
- APIサーバー側での現在時刻確定
- 内部エラーと秘密情報を返さない処理
- 秘密を含まないhealth API
- Vercel OIDC＋Google Workload Identity Federationの実接続コード
- Google STSとサービスアカウント偽装による短期資格情報
- Drive・Sheets読み取り専用スコープ固定
- リクエスト単位のYOS実行組立て
- 個人情報列を避けたProject75範囲設定
- GitHub Actionsによる型検査と自動試験

## Google認証方針

本番の第一候補は、Vercel OIDCとGoogle Workload Identity Federationです。

長期のサービスアカウント秘密鍵をVercel環境変数へ保存せず、短期資格情報を取得します。

OIDCトークンはGoogle資格情報交換だけに使用し、質問本文、OpenAI入力、回答、監査ログへ渡しません。

ローカル開発ではApplication Default Credentialsを利用できますが、本番では標準で拒否します。

## 未実装

- Google CloudのWorkload Identity Pool・Provider設定
- VercelのOIDC Team Issuerと環境設定
- 非公開環境変数の設定
- Vercel等へのAPIルート配置
- 本番用の分散レートリミッター
- 監査ログDB
- 保存候補DB
- `/yos/` PWAとの接続
- 本番デプロイとiPhone実機確認

## 原則

- 正本を無承認で変更しない
- `store: false` を標準とする
- APIキーをブラウザーやGitHubへ保存しない
- 長期のGoogle秘密鍵を本番で使用しない
- 本人メールではなくGoogleの不変ID `sub` をハッシュ照合する
- 重要な現在時刻はAPIサーバー側で確定する
- Project75は必要な有限範囲だけ取得する
- モデル入力と出力の上限を強制する
- 本人ごとの回数制限を必須にする
- 確定、仮説、未確認、矛盾を分離する

## テスト

```bash
npm install
npm test
```

GitHub Actions結果：56件合格、0件失敗。

確認済み：公式Google Auth Library 10.9.1のインストール、TypeScript型検査、単体試験。

未確認：実Google Cloud・Vercel・OpenAI資格情報を使う本番通信。

## 次の実装

1. 本番用の分散レートリミッター
2. `POST /api/yos/chat` と `GET /api/yos/health` のサーバーレス配置
3. 非公開の正本ID・Sheet ID設定
4. 監査ログ
5. 保存候補DB
6. 評価ケース拡充
7. `/yos/` PWA接続

## 秘密情報

`.env.example` には変数名だけを置きます。

秘密鍵、APIキー、本人のメールアドレス、Google `sub`、Vercel OIDCトークン、非公開ファイルID、スプレッドシートIDはGitHubへ保存しません。
