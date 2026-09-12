# YOS Home Voice v1

Clarity完成前に、MY REMOTEの家電操作を音声で単体利用できるようにする薄い入口。

## 使い方（iPhone）

1. Shortcutsで「テキストを音声入力」。
2. その結果をScriptableの `YOS Home Voice` へShortcut Parameterとして渡す。
3. `YOS Home Voice` が日本語を安全な `device / action / value` に変換し、既存MY REMOTE資産を使って実行する。

想定する最初の実機確認:
- テレビつけて / 消して / 音量下げて
- エアコンつけて / 24度にして
- 電気つけて / 消して

## 安全方針

- 「暑い」「暗い」「寝る」「全部消して」のような曖昧・複数機器命令はv1では実行しない。
- BRAVIAは既存Keychain設定を再利用し、実機から取得したコマンドだけを送る。
- テレビ電源は現在状態を確認してから必要な場合だけトグルする。
- AC/Lightは既存 `YOS Tapo H110 Core` を再利用する。
- 固定IP、PSK、Tapo認証情報をsourceへ埋め込まない。
- 実機未確認を完成扱いにしない。

## Clarity接続

将来Clarityは自然言語理解の結果をこのDevice Router相当へ渡す。家電制御ロジックをClarity本体へ持ち込まない。

## 開発依存

このv1はDraft PR #311 `work/issue-297-remote-ux-v2` のRemote資産（特に `YOS Tapo H110 Core` とScriptableのKeychain契約）を前提にしたstacked change。PR #311がmainへ統合された後、mainへretargetして最終diffを確認する。
