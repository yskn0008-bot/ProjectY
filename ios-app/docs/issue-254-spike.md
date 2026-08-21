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

公開・監査可能なGoogle TV Remote v2実装を確認できていないため、非公開wire protocol、certificate、pairingを推測実装しない。登録済みnative adapterがある時だけ委譲し、それ以外はfail-closedで利用不可を返す。

## 完成境界

自動試験はruntime mapping、layout/cursor設定、Keychain境界、Local Network plist、Google TV fail-closedを検証する。physical iPhone17、XRJ-75X90L、Quick Settings、Google TV文字入力、Apple signing、TestFlight、本番は未確認であり、完成扱いにしない。
