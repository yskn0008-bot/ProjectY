# GitHub Pages 公開設定

YOS Mission Control DashboardはGitHub Actionsで公開する。

## 初回だけ必要な設定

GitHubの`ProjectY`を開き、次を設定する。

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. `Source`を`GitHub Actions`にする

以後、`main`へ変更が入ると自動公開される。

想定URL：

`https://yskn0008-bot.github.io/ProjectY/`

## 初回公開時の注意

`Source`を`GitHub Actions`へ変更しただけでは、すでに終わった過去のコミットは自動で再実行されない場合がある。
その場合は、設定後に`main`へ新しい変更を反映し、Pages用Workflowをもう一度起動する。

## 自動処理

`.github/workflows/deploy-pages.yml`が次を実行する。

- リポジトリ取得
- Pages設定
- 静的ファイルのアップロード
- GitHub Pagesへ公開

## 注意

- 公開リポジトリなので個人情報・認証情報・営業機密を保存しない
- 初回設定後も公開できない場合はActionsの失敗内容を確認する
