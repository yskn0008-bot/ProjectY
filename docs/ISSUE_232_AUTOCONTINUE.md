# Issue #232 自動継続 実行記録

作成日: 2026-08-17

## 目的

既存 `ProjectY自動司令部 v1｜毎時監視・安全な自動継続` を再利用し、ようすけ本人がチャット間の伝書鳩や「進めて」の再入力をしなくても、安全な範囲の開発工程が継続する状態へ改善する。

## 正本

- Issue #232
- `.github/workflows/projecty-hq-autopilot.yml`
- `.github/scripts/projecty-hq-autopilot.cjs`
- `data/mission-control.json`
- `AGENTS.md`

## 現在確認済みの問題

1. Issue #232 managed state が、PRのcurrent headで後からSUCCESSになったQAを反映せず古いfailureを保持する場合がある。
2. workflow_run監視対象が限定され、Life等の対象QA完了を拾えない。
3. 現行スクリプトは `Codex自動起動なし` と明記しており、QA失敗後に開発が止まる。
4. 毎時scheduleは、current headが同じだけで監査を終了するため、同じhead上のQA状態変化を回収できない。

## 今回の実装範囲

- Issue #232 managed stateをcurrent headの最新QA結果から再構築できるようにする。
- workflow_runの対象漏れを減らす。
- schedule時もhead一致だけで終了せず、current-head QA状態の変化を監査する。
- current headに紐づく既存QAをworkflow単位の最新runへ集約し、遅れて届いた古い結果で状態を巻き戻さない。
- Lifeを含むrepository-wide変更は既存の `Codex governance` で受動的に観測し、追加QAをfan-outしない。
- リポジトリ自動化からCodexを自己起動する安全で有界な経路はないため、自動起動は行わず、状態・QA継続までを自動化境界とする。
- Mission Control同期と既存のQA Level 1〜3、名称保護、担当範囲、完成定義を維持する。

## 禁止範囲

- 自動マージ
- 本番公開
- physical iPhone17確認の代替
- `/taxi/` `/life/` `/yos/` `/nav/` `/server/` 製品コード変更
- 既存名称の変更
- 新しい司令部・Issueの作成

## 完成条件

- current headの最新QA状態がIssue #232へ正しく反映される。
- 同じheadでQA結果だけ変化した場合も更新される。
- stale failureから同じheadのsuccessへの置換と、scheduleによる同一headのQA変化回収がテストされる。
- Codex自動起動、自動マージ、本番公開、SE3 fan-out、physical iPhone17確認の代替は行わない。
- GitHub Actionsで関連テストが合格する。
- 自動マージ・本番公開は行わない。

Refs #232
