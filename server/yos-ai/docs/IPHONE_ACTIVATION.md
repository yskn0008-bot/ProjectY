# iPhoneでのYOS Taxi本番接続

## 目的
Vercel Hobbyのデプロイ上限解除後、最小操作でTaxiライブ保存を本番化する。

## 接続アシスタント
Deploy成功後、Safariで次を開く。

```text
https://<VERCEL_DOMAIN>/activate.html
```

このページはiPhone内だけで次を行う。

- 256-bitのTaxi端末トークンを生成
- SHA-256を計算
- 元トークンとhashを分けてコピー
- 外部通信、localStorage、Cookie保存を行わない

## 登録先

- 元トークン：TaxiアプリのProjectY接続設定
- SHA-256：Vercelの`YOS_TAXI_SYNC_TOKEN_SHA256`

元トークンをVercelへ登録しない。SHA-256をTaxiアプリへ登録しない。

## Taxi先行の最小環境変数

```text
GOOGLE_AUTH_MODE=vercel_oidc
GCP_PROJECT_NUMBER=
GCP_WORKLOAD_IDENTITY_POOL_ID=
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=
GCP_SERVICE_ACCOUNT_EMAIL=
YOS_ALLOWED_ORIGINS=
PROJECT75_SPREADSHEET_ID=
YOS_TAXI_SYNC_TOKEN_SHA256=
```

## 診断

```text
https://<VERCEL_DOMAIN>/api/yos/taxi-health
```

`status: ready`で設定完了。`missing`または`invalid`には環境変数名だけが表示され、秘密値は表示されない。

## 実書き込み確認

1. Project75を専用サービスアカウントへ編集者共有する。
2. TaxiアプリへAPI URLと元トークンを登録する。
3. テスト記録を1件送信する。
4. Project75の`リアルタイム記録`シートへ`未確認`として1行追加されたことを確認する。
5. 同じ`eventId`の再送が重複保存されないことを確認する。
