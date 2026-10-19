# Clarity Rebuild

新しいClarityを、現行版を壊さず並行テストするための実装レーン。

## 対象

- iPhone実機操作: 現行Clarity Nextの安全なローカルCapabilityを再利用
- 家電: 既存 Scriptable の BRAVIA / Panasonic照明 / SHARPエアコンを再利用
- Notion: 既存ページ・既存DBだけへ書き込む
- 銀行メール: 信頼済み送信元の取引通知を「データ」として解析し、金額が確認できない場合は0円扱いせず照合待ちにする

## Notion既存保存先

- YOS Inbox
- 家計イベント・入出金予定
- 残高スナップショット
- YOS Tasks
- YOS 生活イベント
- YOS 判断・学習

新規DB・YOS Moneyは使わない。

## iPhone側

`YOS Clarity Notion Bridge.js` はNotionトークンをScriptable Keychainだけに保存する。
GitHubやショートカットのソースへ秘密情報を入れない。

初回だけ、Notion側で既存の `YOS 管理` と `BASE HOME` を同じ内部インテグレーションへ共有し、
ScriptableのBridgeを `action=setup` で起動してトークンを保存する。

## 金融

銀行メールに金額が無い場合は `[銀行取引・マネフォ照合待ち]` としてYOS Inboxへ保存する。
Money Forward MEは照合・補完用であり、YOS Moneyへの書き込みは行わない。

## 完成条件

コード/CI合格と、iPhone実機での成功は別。
完成扱いは以下を物理端末で確認した後のみ。

1. Voice / Text / Share
2. iPhone設定操作
3. BRAVIA / 照明 / エアコン
4. Notion各保存先
5. 銀行メール → Notion、金額不足 → 照合待ち
6. 重複・失敗時の挙動
