# YOS Mission Control Dashboard v1.0 リスク管理

## 公開リポジトリ

Mission Controlの進捗情報は公開される。個人情報、認証情報、具体的な営業機密、健康情報、金銭の詳細は保存しない。

## 情報の古さ

Dashboardは`updated_at`を表示する。通信失敗時は前回データを表示し、同期状態を赤で示す。

## 自動選定

「今やること」は健康状態、状態、優先度を使った簡易規則で選ぶ。安全や緊急事情がある場合はYOSの判断を優先する。

## Service Worker

古い画面が残る可能性があるため、リリース時にはキャッシュ名を更新する。

## GitHub Pages

初回設定が未完了の場合、ワークフローは失敗する。Settings > PagesでSourceをGitHub Actionsへ設定する。
