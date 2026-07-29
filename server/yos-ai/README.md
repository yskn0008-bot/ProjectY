# YOS AI Core v0.1

YOS専用生成AIの、外部サービスへ依存しない中核ロジックです。

## 現在の状態

- 情報領域の判定
- 必須情報源の選択
- L4秘密情報の送信禁止
- 既知の秘密文字列の除外
- 根拠の競合検知
- モデル入力コンテキストの組み立て
- SourceProvider / ModelClientの差し替え口
- Node標準テスト

実際のGoogle Drive、Google Sheets、OpenAI、Google本人認証への接続は未実装です。

## 原則

- 正本を無承認で変更しない
- `store: false` を標準とする
- APIキーをブラウザーやGitHubへ保存しない
- Project75は必要範囲だけ取得する
- 確定、仮説、未確認、矛盾を分離する
- 外部サービスがなくても中核判断を試験できるようにする

## テスト

```bash
npm install
npm test
```

依存パッケージを導入できない環境では、グローバルのTypeScriptコンパイラがあれば次で確認できます。

```bash
tsc -p tsconfig.json
node --test tests/*.test.mjs
```

## 次の実装

1. Google Drive / Docs SourceProvider
2. Google Sheets SourceProvider
3. OpenAI Responses ModelClient
4. Google IDトークン検証
5. `POST /api/yos/chat`
6. 監査ログ
7. 評価ケース

## 秘密情報

`.env.example` には変数名だけを置きます。

秘密鍵、APIキー、本人のメールアドレス、非公開ファイルID、スプレッドシートIDはGitHubへ保存しません。
