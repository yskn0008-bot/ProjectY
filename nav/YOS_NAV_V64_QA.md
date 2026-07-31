# YOSナビ v64 実機QA

## 起動
1. iPhone SE3でYOSナビを開く。
2. URL末尾へ `?diagnostics=1` を付けて再読込する。
3. 画面下部の「YOSナビ 診断 v64」を確認する。

## 合格条件
- `mapSection: true`
- `mapContainer: true`
- `leaflet: true`
- 正常通信時は `tileReady: true`
- `tabCount: 3`
- `rankingButtons` が1以上
- `recommendationCount` が1以上
- `expectedValueModel: true`
- 現在地取得後は `locationFresh: true`
- 正常通信時の総合表示が `READY`

## 通信試験
- オフライン時に地図の復旧表示が出る。
- オンライン復帰後に地図タイルが再表示される。
- 低速通信時、空白地図ではなく読み込み表示を維持する。

## 操作試験
- エリアマップ、期待値ランキング、営業履歴を順に操作する。
- エリアマップへ戻った後、地図が欠けない。
- ランキング選択で推奨カードが更新される。
- 「ここへ向かう」でGoogle Mapsへ遷移する。

## 記録
不合格項目がある場合は、診断パネルのスクリーンショットと発生操作を保存する。
