# YOS Local Asset Snapshot

One Enter が iPhone ローカル資産の現在状態をスクリーンショット頼みにしないための read-only inventory。

## v1
- Scriptable の iCloud / local 直下にある .js を列挙
- 名前、保存先、サイズ、更新日時を JSON 化
- iCloud Drive/Scriptable/One Enter State/local-assets.json に保存
- 保存後に read-back 検証
- 同じ JSON をクリップボードへコピー
- 削除・編集・外部送信なし

## 制約
Scriptable の API から Apple Shortcuts 一覧・各アクションは取得できない。そのため Shortcuts は companion exporter が必要。v1 は取得不能を JSON に明記し、取得済み扱いにしない。

## One Enter Installer
既存 `tools/factory-core/One_Enter_Installer.js` でこのスクリプトを iPhone に保存可能。既存 Installer を作り直さない。
