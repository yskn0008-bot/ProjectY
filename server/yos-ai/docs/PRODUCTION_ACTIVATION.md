# YOS AI 本番有効化手順

## 1. Vercel

1. `ProjectY`をImportする。
2. Root Directoryを`server/yos-ai`にする。
3. Production branchを`main`にする。
4. Secure Backend AccessのOIDC Federationを有効にする。
5. `.env.example`の変数をVercelへ登録する。実値はGitHubへ保存しない。

## 2. Upstash

1. Vercel MarketplaceからRedisを作成または接続する。
2. `UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を登録する。
3. 変更後にRedeployする。

用途は本人単位の回数制限と、質問・回答本文を含まない監査である。

## 3. Google Cloud

1. Workload Identity PoolとOIDC Providerを作成する。
2. Vercelのteam、project、environmentをattribute conditionで限定する。
3. YOS AI専用サービスアカウントを作成する。
4. 指定Providerからのサービスアカウント偽装だけを許可する。
5. 対象Google DocsとProject75を閲覧者として共有する。
6. サービスアカウント秘密鍵JSONは作成・保存しない。

## 4. 本人認証

1. Google ID tokenをサーバー側で検証する。
2. Googleの不変ID`sub`を取得する。
3. SHA-256の小文字16進64文字へ変換する。
4. hashだけを`GOOGLE_ALLOWED_SUBJECT_HASH`へ登録する。
5. 元の`sub`、メール、ID tokenはGitHubへ保存しない。

## 5. 配置前診断

```bash
npm install
npm run preflight
```

合格条件は`YOS AI production preflight: ready`かつfailed 0。診断は秘密値を表示しない。

## 6. Deploy後確認

```bash
YOS_API_BASE_URL=https://YOUR-PROJECT.vercel.app \
YOS_SMOKE_ORIGIN=https://YOUR-YOS-ORIGIN \
npm run smoke:health
```

その後、次を確認する。

- 正しいOriginのhealthが200
- 不正Originが403
- 実Google ID tokenでchat成功
- 00_律法、02_YOS Master、00_Change Logを参照
- Project75は有限範囲だけ取得
- Upstash監査に質問・回答本文・現在地が残らない
- 上限超過が429
- 無効な本人認証を拒否
- Google・OpenAI・監査障害時にfail closed

## 7. 完成条件

- Production Deploy成功
- preflight ready
- health smoke成功
- Drive・Project75・OpenAI・Upstash実疎通
- `/yos/`接続
- iPhone Safari・PWA確認
- System MasterとChange Log同期
