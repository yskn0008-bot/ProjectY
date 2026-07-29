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
- Google Auth Libraryを使う本人確認の接続口
- Google `sub` のハッシュによる本人許可
- 許可Origin限定のYOS chat API境界
- 本人ごとの回数制限を必須化
- 入力サイズ・項目・Content-Type・HTTPメソッドの検査
- APIサーバー側での現在時刻確定
- 内部エラーと秘密情報を返さない処理
- 秘密を含まないhealth API
- Vercel OIDC＋Google Workload Identity Federation向け設定
- Googleアクセストークンの更新可能な接続口
- GitHub Actionsによる型検査と自動試験

## Google認証方針

本番の第一候補は、Vercel OIDCとGoogle Workload Identity Federationです。

長期のサービスアカウント秘密鍵をVercel環境変数へ保存せず、短期資格情報を取得します。

ローカル開発ではApplication Default Credentialsを利用できますが、本番では標準で拒否します。

## 未実装

- Vercel OIDCからGoogle短期資格情報を取得する実体
- Google Auth Library実体の組み込み
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

現在のローカル試験結果：48件合格、0件失敗。

GitHub Actionsでも同じ型検査と試験を実行する。

## 次の実装

1. Vercel OIDC用のGoogle External Account Client接続
2. 本番用の分散レートリミッター
3. `POST /api/yos/chat` と `GET /api/yos/health` のサーバーレス配置
4. 非公開の正本ID・Sheet ID設定
5. 監査ログ
6. 評価ケース拡充
7. `/yos/` PWA接続

## 秘密情報

`.env.example` には変数名だけを置きます。

秘密鍵、APIキー、本人のメールアドレス、Google `sub`、非公開ファイルID、スプレッドシートIDはGitHubへ保存しません。
