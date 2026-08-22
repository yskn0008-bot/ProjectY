# YOS AI Core v0.4.1

YOS専用生成AI、YOSナビ自動学習、Taxiライブ保存を扱うバックエンドです。

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
- YOS AI・YOSナビはDrive・Sheets読み取り専用スコープ
- Taxiライブ保存はGoogle Sheetsだけの書き込みスコープ
- 読み取りと書き込みのOAuthスコープ分離
- Upstash RESTによる分散回数制限
- Upstashへのメタデータ限定回答監査
- 監査保存失敗時に回答を返さないfail closed
- 保存候補の根拠・領域・秘密情報・件数・文字数検査
- 保存候補を承認前に正本へ確定保存しない処理
- Project75からYOSナビ期待値モデルを自動生成
- 実測空車時間・推定乗車間隔を分離したIMada効率モデル
- Taxi降車記録の端末内キュー・オフライン再送
- Taxi・YOS・YOSナビの共通営業状態
- Project75の`リアルタイム記録`への未確認保存
- eventIdによる二重保存防止
- Taxi接続専用readiness診断
- 秘密値を表示しない本番preflight
- 配置後health smoke test
- Vercel関数ごとの実行時間・キャンセル設定
- Vercel Output Directoryの`public`固定
- OpenAPI 3.1によるPWA向け公開契約
- Tokenを保存しないPWA向け`YosAiClient`

## API

- `POST /api/yos/chat`
- `OPTIONS /api/yos/chat`
- `GET /api/yos/health`
- `GET /api/yos/public-config`
- `GET /api/yos/nav-model`
- `POST /api/yos/taxi-event`
- `GET /api/yos/taxi-health`

機械可読契約：`openapi.json`

PWA接続仕様：`docs/PWA_INTEGRATION.md`

共通PWAクライアント：`src/client/yos-ai-client.ts`

## Taxi接続

最初にTaxiとYOSナビだけを有効化し、その後YOS AI本体を接続する。

Taxi接続に必要な最小環境変数：

```text
GOOGLE_AUTH_MODE
GCP_PROJECT_NUMBER
GCP_WORKLOAD_IDENTITY_POOL_ID
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
GCP_SERVICE_ACCOUNT_EMAIL
YOS_ALLOWED_ORIGINS
PROJECT75_SPREADSHEET_ID
YOS_TAXI_SYNC_TOKEN_SHA256
```

設定後の診断：

```text
GET /api/yos/taxi-health
```

`status: ready`になってから実際の降車記録を送信する。

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

active HJ `/yos/hj/` は公開設定を取得してGoogle Identity Servicesを初期化し、ID tokenを端末保存せずに共通`YosAiClient`のブラウザー配布版からChatへ渡す。Raw Inputは認証・通信より先に既存HJストアへ保存する。

TokenはコンストラクタやlocalStorageへ保存せず、必要な呼び出し時だけ渡す。

## 本番構成

```text
YOS / Taxi / YOSナビ PWA
  ↓
Vercel YOS API
  ├─ 本人確認・Origin確認
  ├─ Taxi端末Token確認
  ├─ Upstash分散回数制限
  ├─ Vercel OIDC
  ├─ Google Workload Identity Federation
  ├─ Drive / Sheets読み取り
  ├─ Taxi専用Sheets書き込み
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

GitHub Actions run #118：**成功**。

確認済み：

- TypeScript型検査
- Google Auth Library 10.9.1
- JSON SchemaとOpenAI出力検査
- Vercel API構文検査
- Google WIF・Upstashの模擬通信
- YOS再発防止評価
- 本番preflightの秘密値非出力
- OpenAPIの公開Path・認証・入力上限・秘密値非混入
- PWAクライアントのToken更新・Cookie無効・429・409・503処理
- 読み取り専用とTaxi書き込みスコープの分離

## 配置前診断

```bash
npm run preflight
```

必須環境変数、仮値、HTTPS Origin、Google認証方式、Upstash設定を検査します。診断結果に実際の秘密値は表示しません。

合格条件：`YOS AI production preflight: ready`かつfailed 0。

## 配置後health確認

Taxi：

```text
https://YOUR-PROJECT.vercel.app/api/yos/taxi-health
```

YOS AI：

```bash
YOS_API_BASE_URL=https://YOUR-PROJECT.vercel.app \
YOS_SMOKE_ORIGIN=https://YOUR-YOS-ORIGIN \
npm run smoke:health
```

## Vercel配置

- Project Name：小文字のみ。例`project-y`
- Root Directory：`server/yos-ai`
- Application Preset：`Other`
- Node.js：`22.x`
- Build：`npm run vercel-build`
- Output Directory：`public`
- 実環境変数はVercelへ保存し、GitHubへ保存しない

詳しい順序：`docs/PRODUCTION_ACTIVATION.md`

現在の状態：`docs/PRODUCTION_STATUS.md`

## 本番完成に残る作業

1. Vercel上限解除後にProduction Deployを1回実施
2. Vercel OIDC設定
3. Google Cloud Workload Identity Pool・Provider設定
4. Project75をサービスアカウントへ編集者共有
5. Taxi端末Token hashと許可Originを登録
6. Taxi health ready
7. Project75への実書き込みとオフライン再送確認
8. Upstash・OpenAI・本人認証・非公開情報源IDを登録
9. YOS AI preflight合格
10. Drive・Project75・OpenAI・Upstash実疎通
11. `/yos/` PWA接続
12. iPhone Safari・PWA確認

## 原則

- 正本を無承認で変更しない
- 保存候補を承認前に確定保存しない
- APIキー・Token・本人情報・非公開IDをブラウザーやGitHubへ保存しない
- 長期Google秘密鍵を本番で使用しない
- Project75は必要な有限範囲だけ取得する
- Taxiライブ記録は未確認領域へ保存し、確認後に正式データへ反映する
- 追跡不能な回答を返さない
- コード完成と本番利用完成を分けて判定する
