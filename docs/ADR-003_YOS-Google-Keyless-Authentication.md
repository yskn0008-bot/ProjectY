# ADR-003：YOSのGoogle接続は長期秘密鍵を使わない

日付：2026-07-29  
採用日：2026-07-30  
状態：採用  
対象Issue：#71

---

## 1. 背景

YOS専用生成AIはGoogle Drive正本とProject75 Google Sheetsを読み取る。

Vercel等のGoogle Cloud外環境へサービスアカウント秘密鍵を保存すると、漏えい・複製・ローテーション漏れの危険がある。

Google Cloud外のワークロードでは、Workload Identity Federationを使い、長期サービスアカウント鍵を保管しない構成を採用する。

---

## 2. 決定

本番のGoogle接続は次の方式とする。

```text
Vercel Function
  ↓ x-vercel-oidc-token
Google Workload Identity Provider
  ↓ Google Security Token Service
YOS読み取り専用サービスアカウント
  ↓ 短期アクセストークン
Google Drive / Google Sheets
```

実装条件：

1. Vercel OIDCのTeam Issuerを使用する
2. Provider属性条件でTeam、Project、Environmentを限定する
3. productionだけを許可する
4. Previewは別Providerまたは明示条件を使う
5. サービスアカウントには必要最小限の閲覧権限だけを付与する
6. Google APIスコープはDrive読み取り専用とSheets読み取り専用に固定する
7. サービスアカウント秘密鍵を作成・保存しない
8. OIDCトークンをログ、OpenAI入力、回答、監査DBへ保存しない
9. OIDCトークンはリクエスト単位のGoogle資格情報交換にだけ使う
10. 本番でApplication Default Credentialsへ自動フォールバックしない

---

## 3. Google側の制限

Workload Identity Providerで限定するもの：

- Vercel Team
- Vercel Project
- Environment=`production`

サービスアカウントへ付与するもの：

- 対象Vercel主体へのWorkload Identity User
- Google Drive正本：閲覧者
- Project75正本：閲覧者

付与しないもの：

- Editor
- Owner
- Drive全体への権限
- Sheets書き込み権限
- IAM管理権限

---

## 4. アプリ側の制限

- 公式`google-auth-library`を使用する
- WIF audienceを固定形式で組み立てる
- STS URLを`https://sts.googleapis.com/v1/token`へ固定する
- Service Account Impersonation URLを`iamcredentials.googleapis.com`へ固定する
- Subject Token TypeをJWTへ固定する
- Drive・Sheets読み取り専用スコープだけを要求する
- OIDCトークンの形式と長さを事前検査する
- Google検証前にトークン内容を事実として信用しない
- 資格情報交換に失敗した場合は回答生成を止める

---

## 5. 却下した案

- サービスアカウントJSON鍵をVercelへ保存する
- OAuthリフレッシュトークンを長期保存する
- Vercel OIDCトークンをそのままGoogle APIへ送る
- OIDCトークンを会話または監査ログへ保存する
- 本番でADCへ自動フォールバックする

---

## 6. 実装結果

コードで確認済み：

- Vercel OIDCトークンの形式・長さ検査
- Google IdentityPoolClientによるSTS交換
- サービスアカウント偽装URLの固定
- Drive・Sheets読み取り専用スコープ固定
- リクエスト単位の資格情報生成
- OIDCトークンをYOS質問・回答・OpenAI入力へ渡さない処理
- 本番でADCを拒否する設定検査
- 公式Google Auth Library 10.9.1での型検査
- 自動試験

---

## 7. 本番設定で確認する条件

- サービスアカウント秘密鍵が存在しない
- Vercel productionだけがGoogle資格情報を取得できる
- Previewまたは他Projectからの交換が拒否される
- Drive・Sheetsの読み取りだけ成功する
- 書き込み操作が拒否される
- OIDCトークンがログ・回答・OpenAI入力に含まれない
- 資格情報なしでは正式なYOS回答を生成しない

---

## 8. 状態

YOS承認：完了  
設計：完了  
公式ライブラリ接続コード：完了  
自動試験：完了  
Google Cloud設定：未実施  
Vercel設定：未実施  
実資格情報交換：未確認  
iPhone本番接続：別担当・未実施
