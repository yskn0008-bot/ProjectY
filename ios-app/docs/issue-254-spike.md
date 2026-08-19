# Issue #254 BRAVIA remote technical spike

## 採用範囲

- Sony System REST APIの `getRemoteControllerInfo` を接続時に呼び、テレビが返したcommand名とIRCC codeだけをメモリ上でmappingする。
- IRCC-IPは取得済みcodeを `/sony/ircc` へ送る。PSKはiOS Keychainのthis-device-only itemに保存し、Web storageやログへ渡さない。
- Quick Settingsは `Options`、`ActionMenu`、`Quick`、`Setting` に一致する実機commandを候補として扱うだけで、XRJ-75X90Lで表示確認されるまで未確認とする。
- Touchpadはpointer/mouseではなく、dead zoneと最大8回の加速を持つ高速D-pad cursorとして実装する。

## Google TV文字入力の制約

Google公式がiOS向けRemote v2 pairing / keyboard injectionプロトコルを公開しておらず、この環境ではlicense、保守性、securityを監査できる依存実装も採用できなかった。非公開wire protocol、certificate、pairingを推測実装しない。UIとadapterは安全にunavailableを返し、将来監査済み実装を差し替えられる境界だけを置く。このためYouTube、browser、配信appの文字入力は未実装・実機未確認である。

## 変更範囲と検証状態

変更は `ios-app/**` のshell、Sony通信層、Keychain plugin source、tests、本文書に限定する。Local Network permissionとnative plugin registrationはCapacitor iOS project生成後に確認が必要。physical iPhone 17、XRJ-75X90L、Quick Settings、TestFlight、本番はすべて未確認であり、完成扱いにしない。
