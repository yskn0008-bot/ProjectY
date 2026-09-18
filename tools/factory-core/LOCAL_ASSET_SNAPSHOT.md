# YOS Local Asset Snapshot

One Enter が iPhone ローカル資産の現在状態をスクリーンショット頼みにしないための read-only inventory / diagnostics。

## v1 Snapshot
- Scriptable の iCloud / local 直下にある .js を列挙
- 名前、保存先、サイズ、更新日時を JSON 化
- iCloud Drive/Scriptable/One Enter State/local-assets.json に保存
- 保存後に read-back 検証
- 同じ JSON をクリップボードへコピー
- 削除・編集・外部送信なし

## Device Diagnostics
`YOS_Device_Diagnostics.js` は端末上の既存 Scriptable 資産を read-only で確認する。

確認対象:
- YOS Life AUTO Router の存在と安全な意味フラグ
- YOS Departure Guard2 の存在と Shadow/Event Store 構造
- YOS-Departure-Guard-EventStore-v0.json の最新 runtime receipt

出力しないもの:
- スクリプト本文
- URL
- token / credential
- Calendar 本文や個人データ

## 2026-09-19 実機確認
- Snapshot v1: PASS
- Scriptable inventory: 101 entries
- YOS Life AUTO Router: present
- YOS Departure Guard2: present
- Router の `dryRun` 参照: false
- Departure Guard Event Store: present, 18 records
- Mother Shadow manual E2E: PASS
- Latest runtime receipt was readable in Shadow Mode

## 制約
Apple の Personal Automation 定義・各アクション全体は Scriptable API から列挙できない。取得不能を取得済みとして扱わない。現在は実機スクリーンショットで確認済みの wiring と Event Store の runtime receipt を組み合わせて確認する。

## One Enter Installer
既存 `tools/factory-core/One_Enter_Installer.js` を再利用する。既存 Installer を作り直さない。
