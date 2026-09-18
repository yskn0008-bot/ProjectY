# YOS cloud signing / TestFlight

この経路は、PCを本人操作させずにGitHub Actions上のmacOSでYOSを署名し、TestFlightへ送るためのもの。

## 自動化済み

- YOS Web資産の同梱
- Capacitor iOS project生成
- native permissions / App Group entitlement設定
- Release archive
- automatic signing
- IPA export
- TestFlight upload

## 外部側で一度だけ必要なもの

1. Apple Developer Program が Active
2. Team ID
3. App Store Connect API Key（Key ID / Issuer ID / .p8）
4. Bundle ID `jp.yos.onlysystem`
5. App Group `group.jp.yos.onlysystem` をBundle IDへ有効化
6. App Store Connect上のYOSアプリレコード

GitHub secrets:
- `APPLE_TEAM_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_B64`

本人の秘密値はsourceへ保存しない。
TestFlight workflowは `workflow_dispatch` のみで、本人承認なしに配布を開始しない。
