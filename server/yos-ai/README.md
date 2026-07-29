# YOS AI Core v0.1

YOS専用生成AIの、安全な中核ロジックと接続境界です。

## 実装済み

- 情報領域の判定
- 必須情報源の選択
- L4秘密情報の送信禁止
- 秘密文字列の除外
- 根拠の競合検知
- 根拠付きモデル入力の組み立て
- Google Drive文書の読み取り専用クライアント
- Google Sheetsの有限範囲読み取り
- 開放範囲・1万セル超の読み取り拒否
- OpenAI Responses APIクライアント
- `store: false`、`safety_identifier`、JSON Schema出力
- Google Auth Libraryを使う本人確認の接続口
- Google `sub` のハッシュによる本人許可
- 許可Origin限定のYOS chat API境界
- 入力サイズ・項目・Content-Type・HTTPメソッドの検査
- 内部エラーと秘密情報を返さない処理
- 秘密を含まないhealth API
- GitHub Actionsによる型検査と自動試験

## 未実装

- Google Auth Library実体の組み込み
- サービスアカウントのアクセストークン取得
- 非公開環境変数の設定
- Vercel等へのAPIルート配置
- 監査ログDB
- 保存候補DB
- `/yos/` PWAとの接続
- 本番デプロイとiPhone実機確認

## 原則

- 正本を無承認で変更しない
- `store: false` を標準とする
- APIキーをブラウザーやGitHubへ保存しない
- 本人メールではなくGoogleの不変ID `sub` をハッシュ照合する
- 重要な現在時刻はAPIサーバー側で確定する
- Project75は必要な有限範囲だけ取得する
- 確定、仮説、未確認、矛盾を分離する
- 外部サービスがなくても中核判断を試験できるようにする

## テスト

```bash
npm install
npm test
```

現在のローカル試験結果：37件合格、0件失敗。

GitHub Actionsでも同じ型検査と試験を実行する。

## 次の実装

1. 実行環境の構成ローダー
2. Google Auth Libraryとサービスアカウントの実体接続
3. `POST /api/yos/chat` と `GET /api/yos/health` のサーバーレス配置
4. 非公開の正本ID・Sheet ID設定
5. 監査ログ
6. 評価ケース拡充
7. `/yos/` PWA接続

## 秘密情報

`.env.example` には変数名だけを置きます。

秘密鍵、APIキー、本人のメールアドレス、Google `sub`、非公開ファイルID、スプレッドシートIDはGitHubへ保存しません。
