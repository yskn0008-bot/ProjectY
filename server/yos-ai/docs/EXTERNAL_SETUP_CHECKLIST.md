# 外部設定チェックリスト

## Vercel

- [ ] ProjectYをImport
- [ ] Root Directory：`server/yos-ai`
- [ ] Production branch：`main`
- [ ] Secure Backend Access OIDC：有効
- [ ] Production環境変数：登録
- [ ] Preview環境変数：必要分だけ登録
- [ ] Deploy後に環境変数変更時はRedeploy

## Upstash

- [ ] Redis DB作成
- [ ] Vercel projectへ接続
- [ ] `UPSTASH_REDIS_REST_URL`登録
- [ ] `UPSTASH_REDIS_REST_TOKEN`登録
- [ ] 監査保持日数を確認

## Google Cloud

- [ ] Workload Identity Pool作成
- [ ] OIDC Provider作成
- [ ] Vercel team制限
- [ ] Vercel project制限
- [ ] Production environment制限
- [ ] YOS AI専用サービスアカウント作成
- [ ] Workload Identity User付与
- [ ] Drive readonlyに必要な権限だけ付与
- [ ] Sheets readonlyに必要な権限だけ付与
- [ ] サービスアカウント鍵JSONを作成していない

## Google Drive

- [ ] 00_律法を閲覧共有
- [ ] 02_YOS Masterを閲覧共有
- [ ] 00_Change Logを閲覧共有
- [ ] 04_System Masterを閲覧共有
- [ ] 03_Taxi Masterを閲覧共有
- [ ] Project75を閲覧共有

## OpenAI

- [ ] 本番用Projectを確認
- [ ] APIキー登録
- [ ] 利用上限を確認
- [ ] APIキーをGitHub・PWAへ保存していない

## 本人認証

- [ ] Google OAuth Client ID登録
- [ ] 許可Origin登録
- [ ] Google `sub`をサーバー側で取得
- [ ] SHA-256小文字64文字へ変換
- [ ] hashだけをVercelへ登録
- [ ] 元の`sub`とID tokenを保存していない

## 最終確認

- [ ] `npm run preflight`：ready
- [ ] `npm run smoke:health`：pass
- [ ] 実chat成功
- [ ] 実nav-model成功
- [ ] 監査に本文が残らない
- [ ] 回数上限で429
- [ ] 不正Originで403
- [ ] 不正ID tokenで拒否
- [ ] Google障害時にfail closed
- [ ] OpenAI障害時に秘密を返さない
- [ ] `/yos/`接続
- [ ] iPhone Safari確認
- [ ] iPhone PWA確認
