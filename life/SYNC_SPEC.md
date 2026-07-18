# YOS Life OS 連携仕様 v2

## 目的
GoogleカレンダーとiPhoneの予定情報を、Apps Scriptや専用サーバーを使わずLife OSへ取り込む。

## 方式
- GoogleカレンダーをiPhone標準カレンダーへ同期する。
- iPhoneショートカットが当日の予定を取得する。
- ショートカットがJSONをURLセーフBase64へ変換し、Life OSを `?sync=` 付きで開く。
- Life OSが端末内へ保存し、予定一覧と24時間リングを更新する。

## 同期JSON
```json
{
  "date": "2026-07-18",
  "events": [
    {
      "id": "calendar-event-id",
      "title": "予定名",
      "start": "2026-07-18T10:00:00+09:00",
      "end": "2026-07-18T11:00:00+09:00",
      "location": "場所",
      "category": "work"
    }
  ],
  "tasks": [
    {
      "text": "今日やること",
      "done": false,
      "category": "personal"
    }
  ]
}
```

## category
- `sleep`
- `morning`
- `work`
- `health`
- `personal`
- `learning`
- `other`

## 固定ルール
- YOSを唯一の司令塔とする。
- Life OSは実行画面であり、人格を持たない。
- 二重入力を増やさない。
- 認証情報をLife OSへ保存しない。
- URL同期後はクエリを自動削除する。
