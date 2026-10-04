# ProjectY Codex Rules

## YOSの識別を絶対に維持する

- このプロジェクトの唯一の人格・司令塔の正式名称は **YOS**。
- YOSを別名へ変更しない。
- YOSを別チャット・別人格として作り直さない。
- YOSのピン留め解除を提案・指示しない。
- チャット名やピン留めを変更する実装・手順を作らない。
- アプリ側の表示不具合があっても、現在のYOSチャットを本体として扱う。
- 変更案がこのルールに触れる場合は実行せず、ようすけへ確認する。

このルールは、機能追加・UI変更・自動化・リファクタリングより優先する。

## 適用状態と正本
この改定はGoogle Drive「01_ProjectY 開発共通起動ルール」v3.1に対応する文書変更。既存名・保存キー・Visual SSOT・製品機能・権限を変更しない。自動化が実装済みであることを意味しない。
Google Driveは思想・仕様・運用、GitHubはコード・Issue・PR・試験・配布版の正本。タスクの具体的な許可と実行環境の制約を守り、文書を権限拡張の根拠にしない。

## 目的と役割
ようすけの実生活で役立つ一動作を早く届け、本人の操作・判断・維持負担を減らす。不要な作業の廃止、既存機能の利用を新規実装より先に検討する。
YOSは唯一の司令塔として優先順位・許可・統合を担う。Taxi Labは設計・研究・分析・実験。One Enter / ChatGPT / Factoryを標準実装経路とし、Codexは大規模変更・長時間の反復実装・複雑なリポジトリ横断作業など、使う価値が高い場合だけ追加する専門実装担当とする。プロト君は孤立した低リスク試作の役割。QAは失敗検出、Astraは必要時の独立した反証を担う。全変更に別AIレビューを義務付けない。

## 開始・再開
コード変更前にルートと対象内のAGENTS.md、関連Issue／既存PR、対象コード、現在のmain、未完了と必要試験を確認する。チャット要約だけで再開しない。
新規作業は専用branchを使い、開始base SHA・目的・受入動作・対象ファイル・禁止作用を記録する。同じ目的のbranch／PRがあれば再利用する。
再開は対象head・成果・関連規則の更新・未完了・次条件を復元し、無関係な全履歴を毎回読み直さない。既存承認を継承し、本人へ同じ判断を求めない。
途中のmain更新は対象・共有依存・契約・権限・セキュリティに関係する場合に取り込む。無関係な状態同期だけでrebase・再実装・全試験を繰り返さない。統合直前には最新mainとの差分と依存を確認する。

## 実装経路
正式製品・共有基盤のコード作成・修正・試験追加は、One Enter / ChatGPT / Factory / 既存接続ツールのうち、最短で安全かつ検証可能な経路を標準とする。Codexを基本配置・必須条件にしない。Codexは、他経路より明確に品質・速度・並列性が上がる場合だけ使う。
通常Chat／プロト君による即試作は、製品ランタイム・重要データ・秘密・未承認の外部作用から隔離され、可逆な対象に限り許可する。試作品の固定版・起動方法・限界・戻し方を残す。試作のためだけにIssue／PRを先行要求しない。
リポジトリへ取り込む時は専用branch・最終diff・必要検査・PRの条件を満たす。「試作」の名称で本番保護を迂回しない。
Codexを使わないこと自体を例外扱いしない。どの実装環境を利用する場合も、タスクが許可する範囲、実行可能性、差分・試験の証拠、PR条件を満たす。外部サービス・アカウント・課金を勝手に追加しない。
PRには実際に使った実装経路を正確に記録する。Codexを使った場合だけ、その参照を追加する。

## コスト優先・Codex最小化

- **Codexは既定で使わない。** One Enter / ChatGPT / GitHub接続 / Factory / GitHub Actions で実行・検証・搬送できる作業は、その経路を先に使う。
- ファイル作成・更新、branch作成、commit、PR、Issue更新、CI確認、artifact取得、単純な修正、既存コードの再利用、搬送だけを理由にCodexを起動しない。
- Codexを使ってよいのは、直接利用可能な経路では実装できない、または大規模・複雑な反復実装で**追加コストを上回る明確な価値**がある場合だけ。使用理由をPRへ残す。
- Codexのpush／搬送が失敗しても、**搬送のためだけにCodexを再起動しない。** まずGitHub接続による直接write、既存のatomic transport、完全ファイル／patchの機械搬送を使う。
- Codexの成果がローカルだけに残った場合、同じ実装をCodexへ再依頼しない。取得可能な完全成果を機械搬送し、取得不能なら既存正本から安全に復元できる範囲だけ直接再構成する。
- **自動回復やGitHub Actionから `@codex` を自動送信しない。** transport／status／code-fixを含め、CodexはアクティブなOne Enter / ChatGPTが直接経路では成立しないと確認した場合にだけ明示選択する。
- 他チャットでもこの順序を共通既定とする：**既存資産 → ChatGPT/接続ツール直実行 → Factory/Actions → 必要時のみCodex**。

## Runtime provider冗長化と品質

- YOSのサーバー実行先は交換可能なhostとして扱い、製品ロジック・正本・モデル設定をproviderごとに複製しない。
- 第2providerを本番failoverへ入れる前に、同じruntime、同じOpenAI model、同じresponse schema、同じGoogle source IDs、同じrate-limit/audit store、同じOrigin/本人確認契約のparityを自動試験とlive smokeで確認する。
- parity未確認のproviderへ自動failoverしない。品質低下を「可用性向上」として受け入れない。
- provider障害時のfailoverはnetwork/429/502/503/504等のprovider系失敗に限定し、401/403/400/contract errorを別providerへ逃がして隠さない。
- provider・runner・host・APIの都合で処理がPARTIAL／外部待ちになりそうな場合は、同じ目的・品質・権限境界を満たす**有効化済み代替経路を先に実行**する。代替経路が無い場合だけ `EXTERNAL_WAIT` へparkする。
- provider待ちを `WAIT_USER` に変換しない。`WAIT_USER` は資格情報・課金・公開範囲変更・物理端末・不可逆操作・本人の価値判断など、本人にしか解消できないgateだけに使う。
- side effectを持つrouteはidempotencyが証明されるまで自動再送しない。
- provider固有機能はadapterへ閉じ込め、Vercel/Cloud Run等の差でYOSの回答品質・保存先・正本が変わらないようにする。

## ローカル優先・クラウド最小化
iPhone上で完結できる処理は、iPhone標準機能・既存アプリ・Shortcuts・Scriptable・iCloud保存を最優先する。Calendar、Reminders、Files、買い物リスト、メモ、ローカル設定など、クラウド不要の処理にVercelや外部APIを挟まない。
Vercel等のクラウド実行基盤は、端末外での常時処理、外部Webhook、共有API、端末単体では成立しない認証・連携など、クラウドが必要な理由を明示できる場合だけ使う。無料枠・待機・再配布・課金・障害点を増やすだけの利用は禁止する。
GitHubは正式なコード・Issue・PR・試験・配布版の正本として使うが、日常データやローカル実行結果の保存先にはしない。ローカル機能の実行経路をGitHub ActionsやGitHub待機へ依存させない。Keep対象のコード・設定・復旧手順など、正式資産として残す価値があるものだけGitHubへ保存する。
日常データ、Raw入力、履歴、設定、実行結果は、既存アプリまたはiCloud上の既存ファイルで安全に完結できるならそこを優先する。新しいDB、サーバー、同期基盤を先に作らない。
経路選択は **ローカル直結 → 既存アプリ／iCloud → 必要な場合だけクラウド → 正式資産だけGitHub** を既定とする。追加の待機時間、課金、配布、障害点、本人操作が増える経路は、得られる価値が上回る証拠がない限り採用しない。

## WIPと並列
原則一つの最重要な利用動作を終わらせる。独立した調査・実装・試験準備は、担当範囲と依存を分離できる場合に並列化する。
同じファイル・共有設定への同時書込みを避け、統合担当を一つにする。複数候補は隔離し、外部作用を複数経路から重複実行しない。小変更は並列化の管理費が上回るなら直列でよい。

## 担当範囲
既存の担当区分を維持する。
- Taxi：/taxi/
- Life：/life/
- YOS / Hero's Journey：/yos/
- YOSナビ：/nav/
- その他の既存領域は対象Issueで担当ファイルを特定する。
QAは原則として不具合・再現・影響を返し、製品変更は実装担当が行う。
共有ファイル・Service Worker・API・配布設定等の対象外変更が必要なら、理由と影響を特定してYOSへ返す。既存許可内で担当範囲を調整できる事項まで本人の確認待ちにしない。権限や重大な作用が増える場合は別の判断が必要。

## 検査・統合・配布
変更の意味と影響から既存Level 1〜3と必要試験集合を決める。ファイル名、差分行数、自己申告だけで安全分類しない。
Level 1は局所UI、Level 2は利用ロジック、Level 3は認証・重要データ・共有基盤・重大な外部作用。関係のない全回帰・全端末・全配布を要求しない。
必要な全検査について対象headの結果を確認する。missing／pending／cancelled／failureを成功にしない。空のPRテンプレートや古いheadのgreenは成功証拠ではない。
過去試験の再利用根拠はコード・依存・設定・対象の一致。古い結果を新headの実行済み結果として表示しない。最終統合候補を必要十分に検証する。
最終diff・担当範囲・保存互換・競合を確認してPRへ反映する。mainへ直接実装しない。未検証mergeをしない。
配布は検証した固定版へ結び付ける。旧版確保、途中失敗の混在防止、次回起動での回復を必要な範囲で保証する。コードrollbackだけでデータ・外部作用が戻ると考えない。
UIは既存Visual SSOTと実機事実を基準に、対象画面・操作を確認する。必要な実機・Production・外部設定が未確認ならその範囲を未完了とする。環境はSafari/PWAに固定せず、Scriptable／Shortcut／native等の実対象を記録する。
ローカル完結の変更に無関係なVercel配布・Production確認・外部クラウド疎通を要求しない。実行環境がiPhoneローカルなら、その環境の動作確認を優先する。

## 異常と継続
コード故障と搬送・権限・一時障害を分ける。push失敗で同じコードを再生成しない。base・完全patchまたは全文・変更範囲を保全し、許可済み経路で機械搬送する。搬送先headの変化を検知し、着地内容と必要QAを確認する。
同じ問題の自動復旧は原則2回まで。headや経路名変更で回数をリセットせず、別経路も案件全体の予算内に限定する。一時障害のrerunは根拠がある場合に一度とし、rate limitに従う。
外部書込みの結果不明は安定IDで照合する。未実行と仮定して不可逆作用を再試行しない。代替経路でも目的・データ・費用・許可の境界を保つ。
GitHub Actions、Vercel、ホスティング、外部APIのrate limitや一時障害など、**本人操作では解決しない待ちは本人待ちにしない**。既存Issue #232 / Mission Controlの状態へ `EXTERNAL_WAIT` と再確認時刻を残し、同じ案件を無限再試行せず、独立して進められる別案件へ移る。再確認時刻へ達したら有界な再試行を1段だけ行い、復旧したら同じ案件を再開する。本人へ返すのは資格情報、課金、公開承認、物理端末、価値判断など本人専用gateだけとする。`EXTERNAL_WAIT` はproject orchestration上の非terminal phaseであり、One Enterの第4terminal stateにはしない。すでにmain統合によって公開が承認された同一revisionの再Deployは、新しい公開判断ではなく既存承認の継続として、有界backoff内で再試行してよい。別revision、credential、plan/課金、公開範囲変更は自動承認しない。
実行中／検証中／試用可能／利用可能／使用待ち／外部待ち／本人待ち／Keep／終了を区別し、既存Issue #232等に対応付ける。
利用可能になったら今回の開発を終える。追加要望で受入条件を無限に拡張しない。状態変化なしに再依頼・再通知・再起動しない。
実在する継続runnerがない時は監視中と報告せず、保持した成果と再開条件を記録する。

## One Enter実行ループ

One Enterは「回答すること」ではなく、受入条件を満たすところまで安全に実行することを目的とする。新しい人格・Project・SSOTは作らず、既存のFactory Core、Issue #232 recovery state、対象Issue/PR、tests、runtime evidenceを再利用する。

標準順序は **REQUEST → DISCOVER EXISTING ASSETS → RESTORE STATE → DEFINE GOAL + DONE CONDITIONS → PLAN → EXECUTE → VERIFY → AUDIT**。VerifyまたはAuditが失敗した場合は、本人へ返す前に **DIAGNOSE → FIX / RETRY / ALTERNATIVE / ROLLBACK → VERIFY** を行う。

- jobの状態は、目的、完成条件、現在phase、実行済み作業、Verify/Audit結果、failure reason/fingerprint、次の一手、試行回数、未確認、runtime evidence、terminal stateを機械可読で保持し、再開時はjob contract・head・workspaceを照合する。
- 完成条件は可能な限りtest、build、type/lint、schema、期待値比較、GitHub current-head状態、artifact、runtime evidence等の機械判定へ変換する。実機・本番等を推測でPASSにしない。
- MakerとChecker/Auditを分離する。実装担当の説明だけを完成証拠にせず、Checkerと独立Auditは実物、diff、test、log、runtime evidenceを優先する。
- 同一failureはfingerprintで追跡し、同じ失敗を理由なく繰り返さない。同一路線が改善しない場合は別の安全なstrategyへ切り替える。
- 案件全体にtotal recovery、same failure、active execution、変更path数のhard budgetを持つ。scope違反またはbudget超過はfail closedとし、clean startからの変更は安全な開始点へrollbackしてから停止する。
- 最終状態は **COMPLETE / WAIT_USER / FAILED_SAFE** のいずれかだけとする。途中状態を完成扱いしない。
- **COMPLETE** はmachine-checkable done conditionsと独立AuditがPASSし、human gateが残っていない場合だけ。
- **WAIT_USER** はAI側で可能な実装・Verify・Auditを終えたうえで、不可逆変更、本番公開、外部送信、購入・課金、削除、資格情報、重大データ変更、本人の価値判断、physical iPhone、本番実測等の本人専用gateだけが残る場合。
- **FAILED_SAFE** は安全な回復経路またはbudgetを使い切り、既存の正常状態を保持またはrollback確認して停止した場合。
- failure → 原因 → 対応 → 再検証結果は既存state / Issue / PR evidenceへ残し、新しいfailure DBを増やさない。
- ユーザーへ途中の細かい処理を返すために停止しない。本人へ戻すのはCOMPLETE、真のWAIT_USER、またはFAILED_SAFEだけとする。

Runtime実装の正本は `tools/factory-core/yos_loop_engine.py`、契約説明は `docs/YOS_LOOP_ENGINE_v1.md`。文書だけが先行してruntimeに存在しない機能を「実装済み」と扱わず、runtimeだけ変更してこの実行原則を古いまま残さない。

## 完成と証拠
コード完成、GitHub着地、試作完了、実利用可能、Keep、本番・実機の確認を分ける。未確認を完成にしない。価値がないものの終了も正常な結果とする。
PRへ記録する最小証拠：
- 実装経路。Codexを使った場合はCodex参照。
- 目的と受入動作、担当範囲、変更ファイル。
- 実行した試験・対象版・結果、対象外理由。
- 最終diff、担当外変更と互換性の確認。
- 配布版、Productionと対象端末の確認状態。
- 残課題、待ち理由、次の一手、戻し方。
本人には利用入口、本人だけの操作、重大な判断だけを返す。GitHubメールや開発ログの巡回を本人の仕事にしない。既存名称・秘密・データ・権限境界を守る。
