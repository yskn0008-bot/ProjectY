# YOS AI 本番準備状況

## コード完了

- 読み取り専用AI中核
- Google本人確認
- Vercel OIDC対応
- Google Workload Identity Federation対応
- Drive・Sheets読み取り専用接続
- OpenAI Responses API接続
- Upstash分散回数制限・メタデータ監査
- 根拠ID検査・保存候補の承認前保存禁止
- YOSナビ自動学習API・IMada効率モデル
- 値を表示しない本番preflight
- Vercel関数設定
- 配置後health smoke test

## 外部設定待ち

- Vercel Project・OIDC
- Upstash Redis
- Google Cloud Workload Identity Pool・Provider
- 読み取り専用サービスアカウント共有
- OpenAI APIキー
- 非公開情報源ID
- 本人subject hash

## 実環境確認待ち

- Production Deploy
- preflight ready
- health 200
- Google Drive・Project75・OpenAI実疎通
- Upstash監査・回数制限
- `/yos/`接続
- iPhone Safari・PWA

コード完成と本番利用完成は分けて判定する。
