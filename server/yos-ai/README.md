# YOS AI Core v0.4

YOS専用生成AIの読み取り専用バックエンドです。

状態：**リポジトリ側コード・本番準備完了／外部資格情報・本番疎通・PWA接続は未実施**

## 実装済み

- 情報領域の判定
- 00_律法・02_YOS Master・00_Change Logの必須参照
- 専門MasterとProject75の必要範囲選択
- L4秘密情報とAPIキー・秘密鍵・Tokenの送信禁止
- 確定・仮説・未確認・矛盾の分離
- 各事実への既知`source_id`必須化
- 根拠なし・未知根拠・過大な事実の除外
- Google Drive文書の読み取り専用取得
- Google Sheetsの有限範囲読み取り
- 開放範囲・1万セル超・不要な個人情報列の取得拒否
- OpenAI Responses API接続
- `store: false`、`safety_identifier`、厳格なJSON Schema
- 通常回答と営業中回答の入力・出力上限
- Google Auth Libraryによる本人ID token検証
- Google `sub`のSHA-256 hashによる本人許可
- 許可Origin限定
- Vercel OIDC＋Google Workload Identity Federation
- 長期サービスアカウント秘密鍵を使わない短期資格情報
- Drive・Sheets読み取り専用スコープ固定
- Upstash RESTによる分散回数制限
- Upstashへのメタデータ限定回答監査
- 監査保存失敗時に回答を返さないfail closed
- 保存候補の根拠・領域・秘密情報・件数・文字数検査
- 保存候補を承認前に正本へ確定保存しない処理
- Project75からYOSナビ期待値モデルを自動生成
- 実測空車時間・推定乗車間隔を分離したIMada効率モデル
- 秘密値を表示しない本番preflight
- 配置後health smoke test
- Vercel関数ごとの実行時間・キャンセル設定
- OpenAPI 3.1によるPWA向け公開契約
- Tokenを保存しないPWA向け`YosAiClient`

## API

- `POST /api/yos/chat`
- `OPTIONS /api/yos/chat`
- `GET /api/yos/health`
- `GET /api/yos/nav-model`
- `POST /api/yos/taxi-event`

機械可読契約：`openapi.json`

PWA接続仕様：`docs/PWA_INTEGRATION.md`

共通PWAクライアント：`src/client/yos-ai-client.ts`

## PWAクライアント

`YosAiClient`は、次を共通処理する。

- Chatごとに新しいGoogle ID tokenを取得
- Cookie・ブラウザー資格情報を送らない
- HTTPS強制
- 429の`Retry-After`と`requestId`保持
- 通信・タイムアウト時の秘密情報非表示
- nav-model再集計
- taxi-eventの重複409を冪等成功として処理
- JSON以外・過大レスポンスの拒否

TokenはコンストラクタやlocalStorageへ保存せず、必要な呼び出し時だけ渡す。

## 本番構成

```text
YOS PWA
  ↓ Google ID token
Vercel YOS API
  ├─ 本人確認・Origin確認
  ├─ Upstash分散回数制限
  ├─ Vercel OIDC
  ├─ Google Workload Identity Federation
  ├─ Drive / Sheets読み取り
  ├─ 秘密情報除外・根拠検査
  ├─ OpenAI Responses API
  └─ Upstashメタデータ監査
```

## 回答監査

保存するもの：Request ID、subject hash、領域、情報源ID、矛盾キー、未確認数、安全状態、処理時間、モデルとトークン使用量。

保存しないもの：質問本文、回答本文、会話要約、現在地、根拠本文、矛盾値、非公開Locator、APIキー、Google資格情報、Vercel OIDC Token。

## 開発確認

```bash
npm install
npm test
```

GitHub Actions結果：**117件合格、0件失敗**。

確認済み：

- TypeScript型検査
- Google Auth Library 10.9.1
- JSON SchemaとOpenAI出力検査
- Vercel API構文検査
- Google WIF・Upstashの模擬通信
- 24件のYOS再発防止評価
- 本番preflightの秘密値非出力
- OpenAPIの公開Path・認証・入力上限・秘密値非混入
- PWAクライアントのToken更新・Cookie無効・429・409・503処理

## 配置前診断

```bash
npm run preflight
```

必須環境変数、仮値、HTTPS Origin、Google認証方式、Upstash設定を検査します。診断結果に実際の秘密値は表示しません。

合格条件：`YOS AI production preflight: ready`かつfailed 0。

## 配置後health確認

```bash
YOS_API_BASE_URL=https://YOUR-PROJECT.vercel.app \
YOS_SMOKE_ORIGIN=https://YOUR-YOS-ORIGIN \
npm run smoke:health
```

## Vercel配置

- Root Directory：`server/yos-ai`
- Node.js：`22.x`
- Build：`npm run vercel-build`
- 実環境変数はVercelへ保存し、GitHubへ保存しない

詳しい順序：`docs/PRODUCTION_ACTIVATION.md`

現在の状態：`docs/PRODUCTION_STATUS.md`

## 本番完成に残る作業

1. Vercel Project・OIDC設定
2. Upstash Redis作成・接続
3. Google Cloud Workload Identity Pool・Provider設定
4. 読み取り専用サービスアカウント共有
5. OpenAI APIキーと非公開情報源IDの登録
6. preflight合格
7. Production Deploy
8. Drive・Project75・OpenAI・Upstash実疎通
9. `/yos/` PWA接続
10. iPhone Safari・PWA確認

## 原則

- 正本を無承認で変更しない
- 保存候補を承認前に確定保存しない
- APIキー・Token・本人情報・非公開IDをブラウザーやGitHubへ保存しない
- 長期Google秘密鍵を本番で使用しない
- Project75は必要な有限範囲だけ取得する
- 追跡不能な回答を返さない
- コード完成と本番利用完成を分けて判定する
