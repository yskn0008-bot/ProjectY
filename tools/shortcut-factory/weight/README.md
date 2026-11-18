# YOS 体重｜Appleヘルスケア入力用ネイティブショートカット

本人の最新方針（2026-11-19）：
- 水分通知は既存 \`YOS Health Automation\` のまま維持
- 健康／食事／美容の相談はClarityへ直接
- JOURNALやClarityを体重入力の手順から起動しない
- 体重の原本はiPhoneのAppleヘルスケア。Notionへの二重保存や外部送信はしない

## 使い方
1. 既存ProjectY Shortcut Factory + 既存HubSign署名で作られた \`YOS_Weight.shortcut\` をiPhoneのショートカットへ取り込む
2. 起動すると「体重を入力（kg）」という数字入力欄が出る
3. 体重を入力し「完了」を押すとAppleヘルスケアの「体重」へ当日分を保存する（初回はヘルスケアへの書込許可が必要）
4. 確認：ヘルスケアアプリ → ブラウズ／検索 → 身体測定値 → 体重 → すべてのデータを表示

## 仕様と検証境界
- ネイティブiPhoneショートカット：2アクション（入力を要求:Number → ヘルスケアサンプルを記録:Weight kg 現在時刻）
- 体重の数値は毎回本人が入力し、ショートカットのコード・GitHub・外部サーバには送らない
- 水分通知、Morning Brief、Sleep Cycle、Clarity、JOURNALは変更しない
- 既存Shortcuts Factoryの署名処理を再利用し、新しいScriptable導入機構は作らない
- インポート・健康データ書込・iPhoneの数字入力表示は実機での承認・確認が必要。CIでplist署名成功してもiPhone動作完了とはしない
- iOSのネイティブアクション名／表示名はOSバージョンによって異なることがある
- 同じ日に2回実行した場合はヘルスケアへサンプルが2件記録される。本人が実行操作するまで書込みはない

## ソースと配布
- 生成：\`tools/shortcut-factory/weight/build_weight_shortcut.py\`
- 自動テスト：\`tools/shortcut-factory/weight/test_weight_shortcut.py\`
- 署名：既存 \`tools/clarity-factory/sign_with_hubsign.py\`
- 署名後のiPhone用ファイル：\`downloads/yos-weight/YOS_Weight.shortcut\`
