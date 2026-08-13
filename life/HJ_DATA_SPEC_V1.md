# Life → HJ 共通データ仕様案 v1

## 目的
Lifeを単独で使える状態のまま、将来Hero's Journey（HJ）がLifeの一日データを受け取れるようにする。

Lifeの既存保存データを移動・削除せず、夜の「おやすみ」で本人が入力・確認した事実だけの読取用スナップショットを日別データへ追加する。HJへの自動送信は行わない。

## 正本と所有者
- Lifeの正本: localStorage `yos-life-v1`
- データ所有者: Life
- HJはLifeのlocalStorageを直接更新しない
- 将来の連携は、Lifeが明示的に生成する読取用スナップショットをHJが受け取る方式とする

## 連携候補
ユーザーが指定した次の項目だけを対象にする。

1. 日付
2. 睡眠
3. 体調
4. 気分
5. 今日の予定
6. 習慣の完了状況
7. 今日できたこと

## 読取用スナップショット

```json
{
  "schema": "life-hj-export-v1",
  "date": "2026-08-02",
  "sleepHours": 7.5,
  "health": 4,
  "mood": 3,
  "schedule": [
    {
      "title": "予定名",
      "start": "2026-08-02T10:00:00+09:00",
      "end": "2026-08-02T11:00:00+09:00",
      "category": "personal"
    }
  ],
  "habits": {
    "wake": { "completed": [0, 1], "total": 6 },
    "before": { "completed": [0], "total": 4 },
    "home": { "completed": [], "total": 4 }
  },
  "doneToday": "今日できたこと",
  "selfReport": {
    "fact": "本人が入力した事実",
    "choice": "本人が選んだこと",
    "result": "本人が確認した結果",
    "discomfort": "違和感・まだ分からないこと",
    "spentToday": "本人が確認した今日の使用額",
    "remainingTasks": ["未完了タスク"],
    "tomorrowImportant": "本人が入力した明日の重要予定"
  }
}
```

## 既存データとの対応

| 共通項目 | `yos-life-v1` の参照先 |
|---|---|
| `date` | `days` の日付キー |
| `sleepHours` | `days[date].checkin.sleep` |
| `health` | `days[date].checkin.health` |
| `mood` | `days[date].checkin.mood` |
| `schedule` | `days[date].schedule` |
| `habits.wake.completed` | `days[date].routines.wake` |
| `habits.before.completed` | `days[date].routines.before` |
| `habits.home.completed` | `days[date].routines.home` |
| `doneToday` | `days[date].doneToday`。今回追加した任意フィールド |
| `selfReport` | `days[date].lifeFlow`、`days[date].money.spentToday`、未完了の`tasks` |

生成した全体は `days[date].hjSnapshot` へ任意フィールドとして保存する。保存キーは既存の `yos-life-v1` のままで、新しいlocalStorageキーは増やさない。

## 互換ルール
- 数値が未入力の場合は `null` とする。
- 予定がない場合は空配列とする。
- 習慣の完了番号は既存配列をコピーし、元配列を変更しない。
- `doneToday` が存在しない旧データも正常として扱う。
- `doneToday` は既存の `yos-life-v1` 日別データ内へ保存し、別入力を要求しない。
- HJ固有のステージ、XP、物語、解釈はLifeへ保存しない。
- Lifeから渡すのは事実データだけとし、脚色や評価を含めない。

## 将来実装時の境界
- 「おやすみ」で日別スナップショットを生成し、利用者が内容を確認・コピーできる。HJへ自動送信しない。
- 連携失敗時もLifeの入力・閲覧・オフライン動作を止めない。
- HJが停止・未導入でもLifeは完全に動作する。
- 新しい保存キーを使う場合は `life-hj-export-v1` とし、既存キーを上書きしない。
