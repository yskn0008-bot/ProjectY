# YOS BRAVIA Remote — Scriptable fallback

Issue #292 の0円iPhone経路。

## 目的

Issue #254 / merged PR #255 のSony BRAVIA runtime command discovery / IRCC-IP安全境界を再利用し、Apple Developer Program / TestFlightなしで physical iPhone17 + XRJ-75X90L の日常操作を先に成立させる。

既存native YOS iOS Appは削除・置換しない。Scriptable版は無料fallback。

## 現在の完成境界

### Code-ready

- Sony `/sony/system` + `getRemoteControllerInfo` でTVが返したcommand名 / IRCC codeだけを使用
- Sony `/sony/ircc` へIRCC-IP送信
- `X-Auth-PSK`
- Scriptable Keychainへhost / PSK / Quick候補を保存
- 日本語1画面リモコン
- Quick Settings候補選択
- TVが返した全commandの「その他」画面
- 接続再試行 / 設定変更 / 保存設定削除

### 未確認

physical iPhone17 + XRJ-75X90LでのScriptable LAN通信は未確認。
Quick Settingsは実機で物理リモコンと同じ画面を開く候補を本人確認するまで未確定。
Google TV Remote v2文字入力はnative plugin機能のため、このScriptable S1には含めない。

## iPhoneへ入れる

ScriptableをApp Storeからインストールする。

最小導入方法:

1. GitHubで `ios-app/scriptable/YOS BRAVIA Remote.js` を開く。
2. Raw表示またはファイルとして保存する。
3. iPhoneの「ファイル」で `iCloud Drive > Scriptable` に `YOS BRAVIA Remote.js` として保存する。
4. Scriptableを開き `YOS BRAVIA Remote` を実行する。
5. 初回だけTVのIP/ホスト名とPSKを入力する。

ScriptableのscriptsはiCloud Driveが有効ならScriptable documents directoryに保存され、Files appからアクセスできる。

## BRAVIA側

Issue #254と同じ前提:

- 同一LAN
- BRAVIAのIP Control有効
- Pre-Shared Key設定済み

PSKをGitHub / Issue / Chatへ貼らない。

## 初回実機受入

1. 接続成功
2. Home / Back / D-pad / OK / Volume / Mute / Input
3. 10秒戻し / 15秒送り（TVが返す場合）
4. Quick候補を選び、物理リモコンと同じ画面が開く候補を確定
5. Scriptable再起動後もhost / PSK / Quick候補の再入力不要
6. TV/iPhone再起動後に再接続

ここまで本人確認して初めてScriptable BRAVIA実機完成。
