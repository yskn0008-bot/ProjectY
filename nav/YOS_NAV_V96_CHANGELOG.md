# YOSナビ v96 変更記録

## 目的

Service Workerと実行時診断スクリプトのビルド識別を一致させ、異なる版の診断スクリプトが必須キャッシュへ混入した状態で新版が有効化される経路を閉じる。

## 変更内容

- Service Workerのビルド識別を`v96`へ更新。
- 必須資産`runtime-diagnostics-v64.js`の本文に、`BUILD='v96'`とv96専用の多重起動防止識別子が存在することを検査。
- ビルド識別が欠落または不一致の場合は`runtime-build-marker`として不正判定し、v96キャッシュを削除して新版の有効化を停止。
- Service Workerの状態応答へ`build`を追加。
- 実行時診断は、Service Workerが返す`build`と`cache`の両方がv96と一致した場合だけ`swBuildMatch=true`とする。
- 診断表示へ`swBuild`を追加。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V96_CHANGELOG.md`

YOSの正式名称、唯一の人格・司令塔としての役割、Taxi、Life、DB、乗車履歴、同期API、期待値計算、現在地取得、地図、営業判断、Google Maps遷移は変更していない。

## 確認結果

- 変更対象は`/nav/`配下のみ。
- v96 Service Workerは、v95以前の診断スクリプトを`runtime-build-marker`不一致として拒否する構造。
- 状態診断はキャッシュ名だけでなくService Workerの明示的なビルド値も照合する構造。
- YOSの名称を変更・言い換え・派生名へ置換していない。

## 未確認事項

- iPhone SE3でv96 Service Workerが制御開始すること。
- 正常時に`swBuild=v96`、`swBuildMatch=true`、`swOfflineReady=true`となること。
- v95以前の`runtime-diagnostics-v64.js`が配信された場合、v96が有効化されず旧Service Workerが維持されることの実機確認。
- オフライン再起動時の全必須機能。
- 公開環境へのデプロイ反映。
