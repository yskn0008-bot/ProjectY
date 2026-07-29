# ADR-003：YOSのGoogle接続は長期秘密鍵を使わない

日付：2026-07-29  
状態：提案・YOS確認待ち  
対象Issue：#71

---

## 1. 背景

YOS専用生成AIは、Google Driveの正本とProject75のGoogle Sheetsを読み取る必要がある。

Vercel等のGoogle Cloud外環境でサービスアカウント秘密鍵を環境変数へ保存すると、漏えい時に長期間悪用される危険がある。

Googleは、Google Cloud外のワークロードではWorkload Identity Federationを使用し、サービスアカウント鍵の管理を避けることを推奨している。

Vercelは、Functionsの実行時に短期OIDCトークンを `x-vercel-oidc-token` ヘッダーとして提供する。

参考：

- https://cloud.google.com/iam/docs/workload-identity-federation
- https://cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation
- https://vercel.com/docs/oidc
- https://vercel.com/docs/environment-variables/system-environment-variables
- https://www.npmjs.com/package/google-auth-library

---

## 2. 決定案

本番のGoogle接続は次の方式を標準とする。

```text
Vercel Function
  ↓ x-vercel-oidc-token
Google Workload Identity Provider
  ↓ Google Security Token Service
YOS読み取り専用サービスアカウント
  ↓ 短期アクセストークン
Google Drive / Google Sheets
```

### 実装条件

1. Vercel OIDCのTeam Issuerを使用する
2. Google Workload Identity Providerに属性条件を設定する
3. 許可するVercel Team、Project、Environmentを限定する
4. Googleサービスアカウントには必要最小限の権限だけを付与する
5. Google APIスコープはDrive読み取り専用とSheets読み取り専用だけにする
6. サービスアカウント秘密鍵を作成・保存しない
7. Vercel OIDCトークンをログ、AI入力、回答、監査DBへ保存しない
8. トークンはリクエスト単位でGoogle資格情報交換にだけ使う
9. ローカル開発ではApplication Default Credentialsを使用できる
10. 本番でApplication Default Credentialsへの無言のフォールバックを禁止する

---

## 3. Google側の制限

### Workload Identity Provider

Providerの属性条件で、最低限次を限定する。

- Vercel Team
- Project名またはProject ID
- Environment=`production`

Preview環境を許可する場合は、本番と別のProviderまたは別の条件を使用する。

### サービスアカウント

YOS専用の読み取り用サービスアカウントを使用する。

付与候補：

- Workload Identity User：対象のVercel主体だけ
- Google Drive正本フォルダ：閲覧者
- Project75正本：閲覧者

付与しない：

- Editor
- Owner
- Drive全体への権限
- Sheets書き込み権限
- IAM管理権限

---

## 4. アプリ側の制限

- `google-auth-library` の公式クライアントを使用する
- WIFのaudienceは設定値から固定形式で組み立てる
- STS URLは `https://sts.googleapis.com/v1/token` に固定する
- Service Account Impersonation URLは `iamcredentials.googleapis.com` に固定する
- Subject Token TypeはJWTに固定する
- Drive・Sheetsの読み取り専用スコープだけを要求する
- OIDCトークンの形式と長さを事前検査する
- Googleが署名と属性を検証する前に、アプリがトークン内容を事実として信用しない

---

## 5. 却下した案

### サービスアカウントJSON鍵をVercelへ保存する

長期秘密鍵の漏えい・複製・ローテーション漏れを防ぎにくいため却下する。

### OAuthリフレッシュトークンを長期保存する

YOSの正本読取は利用者本人として行う必要がなく、専用のワークロード権限で十分なため却下する。

### Vercel OIDCトークンをそのままGoogle APIへ送る

Google STSでGoogle短期資格情報へ交換する必要があるため却下する。

### OIDCトークンを会話または監査ログへ保存する

資格情報であり、YOSの判断根拠ではないため却下する。

### 本番でADCへ自動フォールバックする

実行環境の誤設定が気づかれない可能性があるため却下する。

---

## 6. 良い影響

- 長期Google秘密鍵を保管しなくてよい
- Vercel ProjectとEnvironmentを限定できる
- 短期トークンのため漏えい時の影響時間を小さくできる
- Google側で権限を取り消せる
- Drive・Sheetsを読み取り専用に固定できる
- 秘密鍵ローテーション作業を減らせる

---

## 7. 注意点

- Google Cloud側でWorkload Identity PoolとProviderの作成が必要
- 属性条件を誤ると対象が広がる
- Vercel Team Issuerの設定確認が必要
- IAM Credentials API、Drive API、Sheets APIの有効化が必要
- サービスアカウントへの正本共有が必要
- Vercel以外へ移行する場合は、移行先のOIDCまたはWIF対応を確認する

---

## 8. 完成条件

- サービスアカウント秘密鍵が存在しない
- Vercel productionだけがGoogle資格情報を取得できる
- Previewまたは他Projectからの交換が拒否される
- Drive・Sheetsは読み取りのみ成功する
- 書き込み操作が拒否される
- OIDCトークンがログ・回答・OpenAI入力に含まれない
- 資格情報なしでは正式なYOS回答を生成しない
- iPhoneのYOS PWAからの本番接続試験が完了する

---

## 9. 状態

設計：作成済み  
公式ライブラリ接続コード：作成済み  
Google Cloud設定：未実施  
Vercel設定：未実施  
本番資格情報交換：未確認  
YOS承認：未実施
