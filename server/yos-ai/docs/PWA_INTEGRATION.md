# `/yos/` PWA接続仕様

担当：03_YOS開発

正本となる機械可読契約：`server/yos-ai/openapi.json`

## 共通

- API Base URLは公開設定として保持する。
- すべての要求で、Vercelの`YOS_ALLOWED_ORIGINS`と完全一致するOriginを使用する。
- OpenAI APIキー、Upstash Token、Google資格情報、非公開Google文書IDをPWAへ保存しない。
- エラー本文にない内部原因をPWA側で推測して表示しない。
- 通信失敗時に過去回答を最新事実として再表示しない。

## Chat

`POST /api/yos/chat`

Header：

```http
Authorization: Bearer <Google ID token>
Content-Type: application/json
```

Body：

```json
{
  "userText": "今日の予定を整理して",
  "currentLocation": "任意・300文字以内",
  "conversationSummary": "任意・12000文字以内"
}
```

制限：

- `userText`：必須、1〜10000文字
- `currentLocation`：任意、最大300文字
- `conversationSummary`：任意、最大12000文字
- 未知のフィールドは禁止
- JSON本文全体：32768 bytes以下
- 現在時刻はPWAから送らず、APIサーバー側で確定する

成功時は`answer`だけでなく、次も保持する。

- `requestId`
- `route`
- `facts[].sourceIds`
- `assumptions`
- `unknowns`
- `conflicts`
- `sources`
- `safety`
- `nextAction`
- `memoryCandidates`

`memoryCandidates`は保存済みではない。承認前に正本へ書き込まない。

## Health

`GET /api/yos/health`

アプリ起動時の常時監視ではなく、接続診断と障害切り分けに使用する。

成功：

```json
{
  "status": "ok",
  "service": "yos-ai",
  "version": "0.4.0",
  "time": "サーバー時刻"
}
```

## YOSナビモデル

`GET /api/yos/nav-model`

通常取得：

```text
/api/yos/nav-model
```

手動再集計：

```text
/api/yos/nav-model?refresh=1
```

個別乗車明細と支払方法は返さない。集計モデルだけを使用する。

レスポンスHeader：

- `X-YOS-Model-Source`
- `X-YOS-Model-Rides`
- `X-YOS-Model-Version`
- stale時は`Warning: 110`

## Taxiライブ記録

`POST /api/yos/taxi-event`

このAPIはGoogle ID tokenではなく、Taxi同期専用Tokenを使用する。Tokenの実値をソースコードへ置かない。

同じ`eventId`を再送した場合は409と`duplicate: true`を返す。409は保存失敗ではなく、重複防止成功として扱う。

記録はProject75の未確認ライブ記録であり、確定乗車履歴ではない。

## エラー表示

| HTTP | PWA表示 | 再試行 |
|---|---|---|
| 400 | 入力内容を確認 | 修正後 |
| 401 | Googleログインまたは同期認証を確認 | 再認証後 |
| 403 | この画面からは接続できない | Origin設定修正後 |
| 405 | アプリ更新が必要 | 不可 |
| 409 | すでに保存済み | 不要 |
| 413 | 入力が長すぎる | 短縮後 |
| 415 | アプリ更新が必要 | 不可 |
| 429 | 少し時間を空ける | `Retry-After`後 |
| 503 | YOSへ接続できない | 時間を空けて再試行 |

503では「保存済み」「回答完了」と表示しない。

## 営業中モード

- 回答本文を最優先で大きく表示する。
- 3秒以内で判断できる短さを維持する。
- `safety.level`が`attention`または`blocked`の場合は通常回答より警告を優先する。
- `unknowns`がある場合は、確定情報と混同しない。

## 完成確認

- Googleログイン
- Chat成功
- 根拠ID表示または内部保持
- 401、403、429、503表示
- nav-model取得・手動更新
- taxi-event重複409処理
- Safari
- PWA
- 既存`/taxi/`、`/yos/`、`/life/`への影響なし
