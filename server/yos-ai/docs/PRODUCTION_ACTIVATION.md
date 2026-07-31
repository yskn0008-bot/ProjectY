# YOS AI 本番有効化手順

## 目的

`server/yos-ai`をVercelへ配置し、長期Google秘密鍵を使わず、YOS専用の読み取り専用AIを安全に起動する。

この手順では実値をGitHubへ保存しない。

## 1. Vercelプロジェクト

1. GitHubの`ProjectY`をVercelへImportする。
2. Root Directoryを`server/yos-ai`にする。
3. Node.jsは`package.json`の`22.x`を使用する。
4. Secure Backend AccessのOIDC Federationを有効にする。
5. ProductionとPreviewの環境変数を分ける。

`vercel.json`で次を固定している。

- build：`npm run vercel-build`
- chat：最大60秒
- nav-model：最大60秒
- taxi-event：最大30秒
- health：最大10秒
- 長時間処理はrequest cancellation対応

## 2. Upstash Redis

1. Vercel MarketplaceからUpstash Redisを作成または既存DBへ接続する。
2. Vercelへ次の環境変数が追加されたことを確認する。
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Productionだけでなく、使用するPreview環境にも必要に応じて設定する。
4. 環境変数追加後は必ず再Deployする。

用途：

- 本人単位の回数制限
- 質問本文・回答本文を含まないメタデータ監査

## 3. Google Cloud Workload Identity Federation

1. Workload Identity Poolを作成する。
2. Vercel OIDCを信頼するOIDC Providerを作成する。
3. Vercelのteam、project、environmentを限定するattribute conditionを設定する。
4. YOS AI専用サービスアカウントを作成する。
5. Workload Identity Userとして、指定Providerからの偽装だけを許可する。
6. サービスアカウントへ必要最小限の権限だけを付与する。
7. 対象Google DocsとProject75をサービスアカウントへ閲覧者として共有する。
8. サービスアカウント秘密鍵JSONは作成・保存しない。

Google APIスコープはコードで次へ固定している。

- Google Drive readonly
- Google Sheets readonly

## 4. Vercel環境変数

`.env.example`の変数名をVercelへ登録する。

### 秘密情報

- `OPENAI_API_KEY`
- `GOOGLE_ALLOWED_SUBJECT_HASH`
- `UPSTASH_REDIS_REST_TOKEN`

### Google認証

- `GOOGLE_CLIENT_ID`
- `GOOGLE_AUTH_MODE=vercel_oidc`
- `GCP_PROJECT_NUMBER`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- `GCP_SERVICE_ACCOUNT_EMAIL`

### 許可元

- `YOS_ALLOWED_ORIGINS`

値は完全一致のHTTPS Originをカンマ区切りで設定する。パスや末尾スラッシュは入れない。

### 非公開情報源ID

- `YOS_LAW_DOCUMENT_ID`
- `YOS_MASTER_DOCUMENT_ID`
- `YOS_CHANGE_LOG_DOCUMENT_ID`
- `YOS_SYSTEM_MASTER_DOCUMENT_ID`
- `YOS_TAXI_MASTER_DOCUMENT_ID`
- `PROJECT75_SPREADSHEET_ID`

これらをGitHub、ブラウザーコード、公開ログへ書かない。

## 5. 本人subject hash

1. YOSで使うGoogleアカウントのID tokenを安全なサーバー側で検証する。
2. Googleの不変ID`sub`を取得する。
3. `sub`をSHA-256の小文字16進64文字へ変換する。
4. 変換後だけを`GOOGLE_ALLOWED_SUBJECT_HASH`へ設定する。
5. 元の`sub`、メールアドレス、ID tokenはGitHubへ保存しない。

## 6. 配置前診断

Vercelの環境変数をローカルへ安全に取得した環境で実行する。

```bash
npm install
npm run preflight
```

診断は値を表示せず、変数名と合否だけを出す。

合格条件：

- `YOS AI production preflight: ready`
- failedが0

warningは形式確認の注意であり、値そのものは表示しない。

## 7. Deploy後の確認

順番を固定する。

1. `GET /api/yos/health`
   - 正しいOrigin：200
   - 未許可Origin：403
   - 設定不足：503
2. Google本人ID tokenで`POST /api/yos/chat`
3. 00_律法、02_YOS Master、00_Change Logが情報源へ含まれること
4. Project75質問で有限範囲だけ取得すること
5. Upstashに監査メタデータが保存されること
6. 質問本文・回答本文・現在地が監査へ保存されないこと
7. 31回目など設定上限を超えた要求が429になること
8. 無効なID tokenが401または403になること
9. Google資格情報交換失敗時に503で止まること
10. OpenAI失敗時に内部エラーや秘密値を返さないこと

## 8. `/yos/`接続

03_YOS開発の担当範囲。

接続時の必須条件：

- API URLを公開設定として保持する
- OpenAI APIキー、Upstash Token、Google秘密情報源IDをPWAへ入れない
- Google ID tokenだけをAuthorization用途で送る
- 営業中モードは短い回答表示を優先する
- 401、403、429、503を区別して表示する
- 通信失敗時に過去回答を最新事実として再表示しない

## 9. 完了判定

次がすべて完了するまで本番完成としない。

- Vercel Production Deploy成功
- `npm run preflight`合格
- health 200
- 実Google Drive参照成功
- 実Project75参照成功
- 実OpenAI回答成功
- Upstash回数制限・監査成功
- `/yos/`接続成功
- iPhone Safari確認
- iPhone PWA確認
- 正本とChange Log更新
