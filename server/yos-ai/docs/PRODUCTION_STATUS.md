# YOS AI 本番準備状況

## 完了

- 読み取り専用AI中核
- Google本人確認
- Vercel OIDC対応
- Google Workload Identity Federation対応
- Drive・Sheets読み取り専用接続
- OpenAI Responses API接続
- Upstash分散回数制限
- Upstashメタデータ監査
- 根拠ID検査
- 保存候補の承認前保存禁止
- YOSナビ自動学習API
- IMada効率モデル
- 本番設定の値非表示preflight
- Vercel関数設定
- 配置後health smoke test
- 本番有効化手順書

## 外部設定待ち

- Vercelプロジェクト作成・Root Directory設定
- Vercel OIDC有効化
- Upstash Redis作成・接続
- Google Cloud Workload Identity Pool・Provider作成
- サービスアカウント権限設定
- Google Docs・Project75の閲覧共有
- OpenAI APIキー登録
- 非公開情報源ID登録
- 本人subject hash登録

## 実環境確認待ち

- Production Deploy
- preflight ready
- health 200
- Google Drive実疎通
- Project75実疎通
- OpenAI実回答
- Upstash実監査
- Upstash実回数制限
- `/yos/`接続
- iPhone Safari
- iPhone PWA

コードの完成と、本番利用の完成を分けて管理する。
