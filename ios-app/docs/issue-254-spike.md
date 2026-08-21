# Issue #254 BRAVIA remote technical spike

## 採用方式

- Sony System REST APIの `getRemoteControllerInfo` を接続時に呼び、テレビが返したcommand名とIRCC codeだけをメモリ上でmappingする。
- IRCC-IPは取得済みcodeを `/sony/ircc` へ送る。固定IRCC code、固定IP、PSKはsource、fixture、logへ入れない。
- PSKはCapacitor local plugin `@yos/secure-credentials` を通じてiOS Keychainのthis-device-only itemへ保存する。許可keyは `braviaPSK` のみ。
- pluginはCapacitor標準のlocal package / Swift Packageとして登録する。生成Xcode projectへsourceを手作業で追加する運用は採らない。
- Quick Settingsはテレビから取得した `Options`、`ActionMenu`、`Quick`、`Setting` 系commandだけを候補にする。
- XRJ-75X90Lを基準にした初期順序を用意し、端末内で並べ替え、非表示、復元、初期化できる。保存対象はUI設定だけ。
- cursorはTap/Swipeを選択・保存できる高速D-pad操作とし、mouse/pointer対応とは表現しない。
- Local Network permissionはiOS project生成後の冪等scriptで追加する。

## Google TV文字入力

- native bridgeは `@yos/google-tv-remote`。`startPairing(host)` / `finishPairing(code)` / `sendText(host,text)` をCapacitorへ公開する。
- Remote v2のTLS/pairing/command transportは `odyshewroman/AndroidTVRemoteControl@32393c3d672c285c4acbd1d42d6873e9b9a523e2` をexact revisionで使用する。
- pairingは6467、remoteは6466。client RSA-2048 private keyとself-signed certificateは端末上で生成し、iOS Keychainの `AfterFirstUnlockThisDeviceOnly` で保持する。source、log、WebStorageへprivate key、pairing code、pairing secretを保存しない。
- IME message shapeはMITの `kud/androidtv-remote@5a05d73eb477688fa04117961d9c7596fce31828` の `remotemessage.proto` / `remoteImeBatchEdit` 実装で相互検証した。root field 21 `RemoteImeBatchEdit` と、TVから受信した `ime_counter` / `field_counter` のみを使う。
- 文字送信ごとに短命のRemoteManager sessionを作り、TV入力欄からIME countersを受け取った場合だけ送信する。counter未取得時はfail-closedで「TVの入力欄を開く」よう返す。
- 第三者ライセンスnoticeはplugin内 `THIRD_PARTY_NOTICES.md` に保持する。

## Codex exception

2026-08-22の最終Remote v2 native統合は、Codex usage limitにより継続実装が停止したため、root `AGENTS.md` のCodex unavailable例外を使用してYOSが同じPR #255 / 同じbranch上で実装した。根拠は上記2つの固定commitとApple Security API。別branch/別PRやmain直接変更は行わない。

## 完成境界

自動試験はruntime mapping、layout/cursor設定、Keychain境界、Local Network plist、Google TV native bridge contractとiOS Simulator buildを検証する。physical iPhone17、XRJ-75X90L、Quick Settings、YouTube/browser Google TV文字入力、Apple signing、TestFlight、本番は本人確認まで未確認であり、完成扱いにしない。
