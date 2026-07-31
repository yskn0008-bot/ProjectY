# YOS AI 本番準備状況

## コード完了

- YOS AI読み取り中核
- Google本人確認
- Vercel OIDC対応
- Google Workload Identity Federation対応
- Drive・Sheets読み取り専用接続
- Taxiライブ記録専用のGoogle Sheets書き込み
- 読み取りと書き込みのOAuthスコープ分離
- OpenAI Responses API接続
- Upstash分散回数制限・メタデータ監査
- 根拠ID検査・保存候補の承認前保存禁止
- YOSナビ自動学習API・IMada効率モデル
- Taxi・YOS・YOSナビの共通営業状態
- Taxiオフライン送信キュー・重複防止
- Vercel出力先`public`固定
- Taxi接続専用`/api/yos/taxi-health`
- 値を表示しない本番preflight
- 配置後health smoke test

## 現在の外部状態

- Vercelアカウント作成済み
- GitHubのProjectY接続済み
- Root Directory：`server/yos-ai`設定済み
- Hobbyプランの24時間デプロイ上限へ到達
- 上限解除後の再Deploy待ち

## 外部設定待ち：Taxi・YOSナビ

- Vercel OIDC
- Google Cloud Workload Identity Pool・Provider
- YOS専用サービスアカウント
- Project75の編集者共有
- Taxi端末トークンhash
- 許可Origin

## 外部設定待ち：YOS AI本体

- Upstash Redis
- OpenAI APIキー
- 非公開情報源ID
- Google本人認証Client ID
- 本人subject hash
- 参照文書の閲覧者共有

## 実環境確認待ち

- Production Deploy成功
- `/api/yos/taxi-health`がready
- Project75への実書き込み
- Taxiオフライン再送
- YOS・YOSナビへの営業状態反映
- YOSナビ自動学習
- YOS AI preflight ready
- Google Drive・Project75・OpenAI実疎通
- Upstash監査・回数制限
- `/yos/`接続
- iPhone Safari・PWA

コード完成、外部設定、本番利用完成は分けて判定する。
