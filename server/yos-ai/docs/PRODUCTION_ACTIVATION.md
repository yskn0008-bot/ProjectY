# YOS AI 本番有効化手順

本番有効化は一度に全部進めず、次の順番で行う。

1. Vercelへコードを配置
2. Taxi・YOSナビを先に接続
3. YOS AI本体を接続
4. iPhone実機確認

## 1. Vercelへ配置

1. `ProjectY`をImportする。
2. Project Nameは小文字だけにする。例：`project-y`。
3. Root Directoryを`server/yos-ai`にする。
4. Application Presetは`Other`にする。
5. Production branchを`main`にする。
6. Build Commandは`npm run vercel-build`を使う。
7. Output Directoryはリポジトリ内の`vercel.json`により`public`へ固定される。
8. 初回は環境変数なしでもビルド可能。

Vercel Hobbyの上限到達中は再Deployを繰り返さない。GitHubの修正を先に完了し、解除後に1回だけDeployする。

## 2. Taxi・YOSナビの最小構成

最初に登録する環境変数：

```text
GOOGLE_AUTH_MODE=vercel_oidc
GCP_PROJECT_NUMBER
GCP_WORKLOAD_IDENTITY_POOL_ID
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
GCP_SERVICE_ACCOUNT_EMAIL
YOS_ALLOWED_ORIGINS
PROJECT75_SPREADSHEET_ID
YOS_TAXI_SYNC_TOKEN_SHA256
```

任意：

```text
YOS_TAXI_LIVE_SHEET_NAME=リアルタイム記録
YOS_NAV_MODEL_CACHE_SECONDS=900
```

この段階では、OpenAI・Upstash・Googleログイン用の変数は不要。

## 3. Google Cloud

1. Workload Identity PoolとOIDC Providerを作成する。
2. Vercelのteam・project・environmentをattribute conditionで限定する。
3. YOS専用サービスアカウントを作成する。
4. 指定Providerからのサービスアカウント偽装だけを許可する。
5. Project75をサービスアカウントへ**編集者**として共有する。
6. YOS Master等の参照文書は**閲覧者**として共有する。
7. サービスアカウント秘密鍵JSONは作成・保存しない。

権限は用途ごとに分離する。

- YOS AI・YOSナビ：DriveとSheetsの読み取り専用スコープ
- Taxiライブ保存：Google Sheetsだけの書き込みスコープ

## 4. Taxi端末トークン

1. 長いランダム文字列を1つ作成する。
2. 元の文字列はTaxiアプリだけへ登録する。
3. 元の文字列をSHA-256へ変換する。
4. 小文字16進64文字のhashだけを`YOS_TAXI_SYNC_TOKEN_SHA256`へ登録する。
5. 元トークンをGitHub、スクリーンショット、日報へ保存しない。

## 5. Taxi接続診断

環境変数を登録してRedeployした後、次をSafariで開く。

```text
https://YOUR-PROJECT.vercel.app/api/yos/taxi-health
```

成功：

```json
{"status":"ready","service":"yos-taxi-sync","missing":[],"invalid":[]}
```

`incomplete`の場合は、表示された環境変数名だけを修正する。値そのものは表示しない。

## 6. Taxi実書き込み確認

Taxiアプリへ次を登録する。

```text
API URL：https://YOUR-PROJECT.vercel.app/api/yos/taxi-event
端末トークン：4で作成した元の文字列
```

確認順：

1. テスト乗車を端末内へ記録
2. Project75の`リアルタイム記録`へ1行追加
3. 同じeventIdの再送が重複保存されない
4. オフライン時は未送信として保持
5. 通信復旧後に自動送信
6. 確認前データは正式な乗車履歴へ直接混ぜない

## 7. YOS AI本体

Taxi連携が完了した後に追加する。

```text
OPENAI_API_KEY
OPENAI_MODEL
GOOGLE_CLIENT_ID
GOOGLE_ALLOWED_SUBJECT_HASH
YOS_LAW_DOCUMENT_ID
YOS_MASTER_DOCUMENT_ID
YOS_CHANGE_LOG_DOCUMENT_ID
YOS_SYSTEM_MASTER_DOCUMENT_ID
YOS_TAXI_MASTER_DOCUMENT_ID
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

### Upstash

1. Vercel MarketplaceからRedisを作成または接続する。
2. `UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を登録する。
3. 用途は本人単位の回数制限と、質問・回答本文を含まない監査。

### 本人認証

1. Google ID tokenをサーバー側で検証する。
2. Googleの不変ID`sub`を取得する。
3. SHA-256の小文字16進64文字へ変換する。
4. hashだけを`GOOGLE_ALLOWED_SUBJECT_HASH`へ登録する。
5. 元の`sub`、メール、ID tokenはGitHubへ保存しない。

## 8. 配置前診断

```bash
npm install
npm run preflight
```

合格条件は`YOS AI production preflight: ready`かつfailed 0。診断は秘密値を表示しない。

## 9. YOS AI配置後確認

```bash
YOS_API_BASE_URL=https://YOUR-PROJECT.vercel.app \
YOS_SMOKE_ORIGIN=https://YOUR-YOS-ORIGIN \
npm run smoke:health
```

確認項目：

- 正しいOriginのhealthが200
- 不正Originが403
- 実Google ID tokenでchat成功
- 正本を必要範囲だけ参照
- Upstash監査に質問・回答本文・現在地が残らない
- 上限超過が429
- 無効な本人認証を拒否
- Google・OpenAI・監査障害時にfail closed

## 10. 完成条件

- Production Deploy成功
- Taxi healthがready
- Project75への実書き込み成功
- オフライン再送成功
- YOSナビ自動学習成功
- YOS AI preflight ready
- Drive・Project75・OpenAI・Upstash実疎通
- `/yos/`接続
- iPhone Safari・PWA確認
- Taxi MasterとChange Logへ結果を記録
