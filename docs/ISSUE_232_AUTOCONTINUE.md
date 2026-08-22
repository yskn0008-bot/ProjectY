# Issue #232 ProjectY自動司令部 v1

更新日: 2026-08-21

## 目的

既存の `ProjectY自動司令部 v1｜毎時監視・安全な自動継続` を作り直さず、recoverableな異常の後も、ようすけ本人の「進めて」を待たずに次の安全なGitHub工程へ進める。

イベント駆動を主経路とし、5分scheduleはイベント欠落・停止検知のwatchdogに限定する。自動マージ、本番公開、資格情報変更、製品コードの無断変更、physical iPhone17検収の代替は行わない。

## 正本と変更範囲

- Issue #232
- PR #253
- `.github/scripts/projecty-hq-autopilot.cjs`
- `.github/scripts/projecty-hq-autopilot.test.cjs`
- `.github/workflows/projecty-hq-autopilot.yml`
- `docs/ISSUE_232_AUTOCONTINUE.md`

製品コード、Mission Controlの表示、Taxi / Life / HJ / Capture / YOS AIの仕様は変更しない。

## 信頼境界

- 対象は同一repositoryのopen PR、非main branch、作成者がrepository owner、`author_association=OWNER`の場合だけ。
- 公開コメントからの書き込みは `chatgpt-codex-connector[bot]` の完全一致だけを受理する。短いACKと最終成果を分離し、ACKはtransportしない。
- workflowは `pull_request_target`、default-branch `issue_comment` / `workflow_run` / `schedule` / `workflow_dispatch` で動く。
- checkout・実行するのは常にdefault branchのコード。PR headのworkflowやscriptをwrite権限で実行しない。
- Codex成果のtransportにはownerがPRコメントで明示したpath allowlistと `allowAutoTransport=true` が必要。
- artifactはcurrent head SHAと完全一致し、allowlist全ファイルの完全内容を含む場合だけ受理する。
- Git Data APIでblob → tree → commit → non-force ref updateを行い、前後でhead raceを検査する。raw `git push`は使わない。

## 1イベント1アクションの回復ラダー

| 状態 | 1回目 | 2回目 | それ以降 |
|---|---|---|---|
| runner / network等の証拠がある一時障害 | failed jobsを1回rerun | 同じPRへ最小修正を依頼 | `NEEDS_YOS` |
| code failure | 同じPRへ最小修正を1回依頼 | `NEEDS_YOS` | `NEEDS_YOS` |
| Codex push / gh認証 / durable artifact不足 | 同じPRの完全artifactを1回依頼 | `NEEDS_YOS` | `NEEDS_YOS` |
| current-head QAなし | 状態確認を1回依頼 | `NEEDS_YOS` | `NEEDS_YOS` |
| 45分以上進捗なし | 状態確認を1回依頼 | `NEEDS_YOS` | `NEEDS_YOS` |
| mainよりbehindでclean | GitHub update-branchを1回 | `NEEDS_YOS` | `NEEDS_YOS` |
| branch conflict / unsafe scope | `NEEDS_YOS` | `NEEDS_YOS` | `NEEDS_YOS` |

failure IDはtarget、current head、failure class、workflow identityから安定生成し、deliveryを記録する。同じdeliveryは再実行せず、各段階は試行回数を必ず消費する。API書き込み失敗もmanaged stateへ記録し、無限再試行しない。

## QA継続

- current headに一致する監視対象workflowだけを採用し、workflowごとの最新runを使う。
- 遅れて届いたstale failureで新しいsuccessを巻き戻さない。
- 同一PR・current headに紐づく `waiting` / `action_required` runだけをapproval対象にする。
- QA runが存在しない場合は成功扱いせず `QA_BOOTSTRAP_BLOCKED` とする。
- scheduleは1回につき最大1つの回復アクションだけを実行する。

## 完成境界

### branch上のコード完成候補

- unit / static security test成功
- final diffが許可済み4ファイルだけ
- trusted-base workflow、owner-only scope、bounded/idempotent recovery、atomic transportを確認
- PR #253 Actions成功

### main上の本稼働確認

branch testだけでは完成にしない。YOSの通常の統合判断後にmainへ入ったdefault-branch workflowで、次を確認する。

1. 5分watchdogが起動する。
2. ownerの同一repository open PRだけを扱う。
3. 意図的に用意したrecoverable failureを1段だけ自動回復する。
4. Issue #232 managed stateにaction・attempt・結果が残る。
5. 同じdeliveryの再処理とbounded ladder超過が書き込みを増やさない。

このlive確認、自動試験、final diff、Actionsが揃うまではProjectY自動司令部を本番完成と呼ばない。

Refs #232
