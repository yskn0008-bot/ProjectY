# YOS Loop Engine v1

## 目的

YOS開発で、本人が毎回「スクショ → 修正 → 再確認」を回さなくても済むように、
既存の **One Enter / Factory Core** の中へ、短い反復実装ループを追加する。

これは新しい人格・新しい製品ではない。
**One Enter / Factory Core の実装機能**として扱う。

## 3層

### 1. Inner Loop｜数分

AI / Factory が回す。

```text
実装
→ 自動検査
→ PASS?
   ├─ YES → Code verified
   └─ NO  → 原因を証拠化
            → 回復
            → 再検査
```

同じ失敗への自動回復は **最大2回**。
head名変更や別経路への切替で回数をリセットしない。

### 2. YOS Gate｜数十分

YOSが確認する。

- 目的からズレていない
- 既存資産を作り直していない
- 許可scope外を変更していない
- forbidden pathへ触れていない
- 必要検査がPASSしている
- 古い試験結果を現在headの証拠として使っていない

### 3. Real World Loop｜本人の実生活

AIだけでは確認できないものだけ本人へ返す。

例:

- iPhone Shortcutが本当に動いた
- 家電が実際に反応した
- ナビが開始した
- Productionで実表示できた

**Code verified と physical iPhone verified は別状態。**

## 実装

Core:

`tools/factory-core/yos_loop_engine.py`

Tests:

`tools/factory-core/tests/test_yos_loop_engine.py`

## Job contract

例:

```json
{
  "job_id": "clarity-nav-fix-v1",
  "goal": "ClarityからGoogle Mapsのナビ開始まで通す",
  "acceptance": [
    "対象テストがPASSする",
    "scope外変更がない"
  ],
  "scope": [
    "tools/clarity-factory/**"
  ],
  "forbidden_paths": [
    "data/**",
    "taxi/**"
  ],
  "implementation_command": [
    "python3",
    "tools/clarity-factory/build.py"
  ],
  "verification_commands": [
    ["python3", "-m", "unittest", "discover", "-s", "tools/clarity-factory/tests", "-v"],
    ["git", "diff", "--check"]
  ],
  "recovery_command": [
    "python3",
    "tools/clarity-factory/repair.py"
  ],
  "max_recovery_attempts": 2,
  "requires_device_verification": true,
  "requires_production_verification": false
}
```

コマンドはshell文字列ではなくargv配列で渡し、`shell=False`で実行する。

回復側には以下を環境変数で渡す。

- `YOS_LOOP_ATTEMPT`
- `YOS_LOOP_JOB_ID`
- `YOS_LOOP_FAILURE_JSON`

これにより、直前の検査失敗を見ずに同じ修正を繰り返すことを避ける。

## 出力状態

### `code_verified`

自動検査とscope検査がPASS。
実機・本番確認が不要な作業ならここで終了可能。

### `owner_boundary`

コード側はPASSしたが、物理iPhoneまたはProduction確認が残る。

例:

```json
{
  "status": "owner_boundary",
  "code_verified": true,
  "device_verified": false,
  "owner_boundary": ["physical_device"]
}
```

本人へ返すのは、この最後の実機操作だけ。

### `blocked`

以下のどれか。

- 自動検査FAIL
- 最大2回の回復後もFAIL
- scope違反
- forbidden path変更

scope違反は安全境界なので、自動回復を続けず即停止する。

### `invalid`

Job contract自体が不正。

## 実行

```bash
python3 tools/factory-core/yos_loop_engine.py \
  --job /path/to/job.json \
  --repo /path/to/ProjectY \
  --result /tmp/yos-loop-result.json
```

終了コード:

- `0`: `code_verified` / `owner_boundary`
- `1`: `blocked` / `invalid`

## 今回あえて自動化しないもの

v1では以下をLoop Engine自身に持たせない。

- mainへのmerge
- 本番公開
- 課金
- 外部サービスへの送信
- 実機PASSの代筆
- 無制限な自己修正
- AIが勝手にscopeを拡張すること

これらを自動化すると、「速い」より先に「止められない」が問題になるため。

## 受入

v1の完成条件:

1. 1回目PASSを記録できる
2. 1回FAIL → 1回回復 → PASSできる
3. 同じFAILを最大2回で停止できる
4. scope / forbidden path違反で即停止する
5. iPhone確認が必要な案件を `owner_boundary` として返す
6. 機械可読JSONを証拠として残せる

## YOSでの使い方

今後、コードで検査可能な案件は原則:

```text
Goal
→ Reconstruct
→ Build
→ Test
→ Recover (max 2)
→ Verify
→ YOS Gate
→ 必要な時だけ本人実機確認
→ Record
```

に寄せる。

目的は「AIを勝手に動かし続けること」ではない。

**本人がやる必要のない反復作業をAI側へ戻し、
現実世界の確認だけ本人へ残すこと。**
