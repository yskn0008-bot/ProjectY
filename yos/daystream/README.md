# DAYSTREAM Web版（Charcoal移植）

既存Scriptable `YOS Timeline Charcoal 確認 20261111` の画面コードを移植した既存YOS PWA内の確認ルートです。

- URL（main反映後）: `/ProjectY/yos/daystream/`
- YOSの既存メニューからも開けます。YOSのホーム画面、Scriptable版、インストーラーの置換はしません。
- 24時間タイムラインの視覚、タブ、タスク操作を元のScriptable HTMLから移植しています。
- Web版の予定は、このブラウザだけの `YOS_DAYSTREAM_WEB_PLAN_V1` に保存します。書込み後の読戻し照合と `YOS_DAYSTREAM_WEB_PLAN_BACKUP_V1` への更新前コピーを行います。Scriptableの既存保存ファイルは自動的に読み込み・変更しません。
- 「データ読込」でユーザーが選んだScriptableの時間割JSONを読み取り、形式検証と上書き確認後にWeb版へ移します。元ファイルは変更しません。「書き出し」でWeb版データだけをJSON保存できます。
- Web画面で本人がタスクを完了した時刻だけ、端末内の `YOS_DAYSTREAM_WEB_ACTIONS_V1` に最大500件記録します。同一タスクに3件以上の実績がある場合に時間帯の中央値を提案表示します。予定や習慣を自動変更しません。
- Notion Tasks、Apple Calendar、端末のショートカット連携、実機の振動はWebブラウザから自動接続していません。Web画面に未接続と明示します。認証トークンはブラウザに配布しません。
- 既存YOSのService Workerに追加したため、一度オンラインでキャッシュされた後はオフライン起動候補となります。ネットワークなしの初回起動は保証しません。

## 確認と終了条件

`node --test tests/daystream-web-port.test.mjs`、`YOS_BROWSER=chromium node yos/tests/daystream-web-browser-smoke.mjs`、`YOS_BROWSER=webkit node yos/tests/daystream-web-browser-smoke.mjs`（後者2件はPlaywrightをインストールしたCIサーバーで起動）。

iPhoneのSafariでWeb版を開き、追加・移動・完了・保存後再読込・JSONの読込/書出・オフライン起動・3件の実行時刻履歴を順に検証してから本番移行完了と判定してください。実機に触れずに完成宣言しないでください。

既存のMoney全体テストが一部失敗している場合はDAYSTREAMのチェック結果と区別し、無関係なMoney機能をこのPRで書き換えないでください。
