# ADR-002：YOS専用生成AIを既存正本連携型で構築する

日付：2026-07-29  
採用日：2026-07-30  
状態：採用  
対象Issue：#71

---

## 1. 背景

YOSの使命、判断順位、Google Drive正本、Project75、PWA、Mission Controlは既存資産として存在する。

既存の`/yos/`は相談文を既存ChatGPTへ渡す入口であり、正本やProject75を自動参照する専用生成AIではなかった。

必要な機能は次のとおり。

- 正本の最新版を参照する
- 専門領域を自動選択する
- Project75を必要範囲だけ検索する
- 確定・仮説・未確認・矛盾を区別する
- 各事実の根拠を追跡する
- 新情報を保存候補として扱う
- APIキーと個人情報を安全に扱う
- 既存PWAと既存データを壊さない

---

## 2. 決定

1. 既存の`/yos/` PWAを利用する
2. PWAとOpenAIの間にTypeScriptバックエンドを置く
3. OpenAI Responses APIを使用する
4. 初期モデルは`gpt-5.6-terra`を標準候補とする
5. Google Drive正本は必要時にバックエンドが直接取得する
6. Project75はGoogle Sheets APIで有限範囲だけ取得する
7. 正本をOpenAI Vector Storeへ常時複製しない
8. AIは保存候補を作るだけとし、正本を無承認で変更しない
9. Responses APIは`store: false`を標準とする
10. APIキー、秘密鍵、本人情報、非公開IDを公開GitHubやPWAへ保存しない
11. 本人認証はGoogle ID tokenとGoogle `sub`のハッシュ照合を使う
12. Google接続はVercel OIDC＋Workload Identity Federationを使う
13. 回数制限とメタデータ監査はUpstash RESTへ保存する
14. 各事実には既知の`source_id`を1件以上必須とする
15. 根拠不明の事実、秘密情報、過大入力、追跡不能な回答は返さない

---

## 3. 構成

```text
YOS PWA
  ↓ Google ID token
Vercel /api/yos/chat
  ├─ Origin制限
  ├─ 本人確認
  ├─ Upstash分散回数制限
  ├─ Vercel OIDC
  ├─ Google Workload Identity Federation
  ├─ Drive / Sheets読み取り
  ├─ 秘密情報除外
  ├─ 根拠・矛盾・未確認の検査
  ├─ OpenAI Responses API
  └─ Upstashメタデータ監査
```

データの役割：

- 正本：Googleドキュメント
- 営業データ：Project75 Google Sheets
- 回答監査：Upstash Redis、本文を保存しない
- コード・設計・変更履歴：GitHub
- 保存候補：回答内の候補として提示し、承認前に確定保存しない

---

## 4. 承認境界

AIが自動で行ってよい：

- 正本とProject75の読み取り
- 必要範囲の集計
- 確定・仮説・未確認・矛盾の分類
- 根拠付き回答生成
- 保存候補の作成
- 個人情報を除いた技術監査

承認なしで行ってはいけない：

- Master、Change Log、Project75の変更
- 長期記憶の確定保存
- 不要な外部送信
- 費用上限を外す処理
- 新しい人格やLabの作成
- `/taxi/`、`/life/`の変更

---

## 5. 安全制御

- L4情報源はモデルへ送らない
- APIキー、秘密鍵、Bearer Tokenを除外する
- Drive・Sheetsは読み取り専用スコープに固定する
- Project75は有限範囲かつ個人情報列を避ける
- 1万セル超の読み取りを拒否する
- 文書・総コンテキスト・入力・出力トークンを制限する
- 営業中は低推論・短い出力上限を使う
- 本人ごとの分散回数制限を必須とする
- 各事実へ既知の`source_id`を必須とする
- 監査保存に失敗した回答を返さない
- 質問本文、回答本文、現在地、会話要約を監査へ保存しない

---

## 6. 却下した案

- 独自基盤モデルを一から学習する
- ChatGPTの会話記憶だけに依存する
- OpenAI File Searchを最初から正本にする
- APIキーをPWAへ保存する
- 正本を毎回すべてモデルへ送る
- AIの自動書き込みを最初から許可する
- 本番で長期Google秘密鍵を保存する
- サーバーレス環境でメモリ内回数制限だけを使う

---

## 7. 実装結果

実装済み：

- YOS AI Core
- Google本人認証境界
- 鍵なしGoogle接続
- Drive・Sheets読み取り
- OpenAI Responses API
- 根拠・秘密・矛盾・保存候補の検査
- 分散回数制限
- メタデータ監査
- Vercel API入口
- GitHub Actions
- 24件の独立評価を含む96件の自動試験

自動試験結果：96件合格、0件失敗。

---

## 8. コード外の本番設定

リポジトリ外で必要：

1. Vercelプロジェクト作成
2. Upstash Redis作成
3. Google Cloud Workload Identity Pool・Provider設定
4. 読み取り専用サービスアカウント共有
5. OpenAI APIキーと非公開環境変数設定
6. 実通信確認
7. `/yos/` PWA接続
8. iPhone実機確認

これらは秘密情報と外部アカウント操作を伴うため、GitHubコードだけでは実行できない。

---

## 9. 再検討条件

- Google Drive直接取得では速度が不足する
- 資料数増加で取得精度が低下する
- API料金が承認予算を継続的に超える
- UpstashまたはVercelが利用できない
- Zero Data Retention等が必要になる
- 評価で別モデルの方が適切と確認される

---

## 10. 状態

YOS承認：完了  
設計：完了  
MVPコード：完了  
自動試験：完了  
main反映：PR #76で実施  
本番資格情報設定：未実施  
PWA接続・iPhone実機確認：別担当・未実施
