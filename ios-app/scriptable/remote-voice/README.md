# YOS Home Voice v1

Clarity完成前に、MY REMOTEの家電操作を音声で単体利用できる薄い入口。

## 状態

- コード: 実装済み
- 自動テスト: current headで確認中
- 試せる状態: Installer後、Scriptableの `YOS Home Voice` を直接実行してすぐ音声テスト可能
- 利用可能判定: 実際のiPhoneから対象家電を1回ずつ動かして確認後
- 正式維持: 利用可能後に必要な範囲だけ整理する

ProjectY v3.0移行方針に従い、無関係なmain更新やPR #311の正式完了だけを理由に試用を止めない。既存MY REMOTE資産は変更せず、音声入口だけを追加する。

## 最短の入れ方

1. Scriptableで `YOS Home Voice Installer` を1回実行する。
2. Installerが固定版の次の2ファイルだけを入れる。
   - `YOS Home Voice Parser.js`
   - `YOS Home Voice.js`
3. 既存の `YOS Tapo H110 Core.js` が無い場合は勝手に作り直さず停止する。
4. 既存MY REMOTEの設定・Keychain・他のRemoteファイルは上書きしない。

## いちばん早い試し方

Installer後、Scriptableで `YOS Home Voice` を実行する。

入力が渡されていない時はScriptableの日本語音声入力を自動で開くので、そのまま話せる。これによりiPhone Shortcutを作る前でも家電実機テストができる。

## 普段使いのiPhone Shortcut

普段使いではショートカットを最小2アクションにする。

1. `テキストを音声入力`
2. Scriptableの `Run Script` で `YOS Home Voice` を実行し、1の結果をShortcut Parameterとして渡す

この経路なら音声入力のあとにScriptable側で再度入力を求めない。最終的にはClarityがこの入口を呼び、家電制御そのものはRemote側に残す。

## 最初に使える言い方

- テレビつけて
- テレビ消して
- 音量下げて
- エアコンつけて
- エアコン24度にして
- 24度にして
- 1度上げて / 1度下げて
- 電気つけて
- 電気消して

追加の安全な明示操作として、ミュート、テレビの上下左右/決定/再生/一時停止、照明の明暗にも対応する。

## 安全方針

- 「暑い」「暗い」「寝る」「全部消して」のような曖昧・複数機器命令はv1では実行しない。
- BRAVIAは既存Keychain設定を再利用し、実機から取得したコマンドだけを送る。
- テレビ電源は現在状態を確認してから必要な場合だけトグルする。
- AC/Lightは既存 `YOS Tapo H110 Core` を再利用する。
- 固定IP、PSK、Tapo認証情報をsourceへ埋め込まない。
- Installerは固定commitから取得し、失敗時は書き込んだ音声ファイルだけ戻す。

## Clarity接続

Clarityは自然言語理解の結果をこの家電Routerへ渡す。音声リモコン単体で「利用可能」になった後に接続する。
