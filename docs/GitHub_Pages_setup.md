# GitHub Pages 公開設定

GitHub PagesはYOS PWAの公開経路です。日常の入口はMY WAY、Mission ControlはSystemへ分離しています。

## 公開URL

- YOS: `https://yskn0008-bot.github.io/ProjectY/`
- MY WAY: `https://yskn0008-bot.github.io/ProjectY/yos/`
- Life: `https://yskn0008-bot.github.io/ProjectY/life/`
- System: `https://yskn0008-bot.github.io/ProjectY/system/`

ルートURLは自動的にMY WAYへ移動します。

## Pages設定

`Settings → Pages → Build and deployment → Source: GitHub Actions`

`.github/workflows/deploy-pages.yml` がmainの静的資産を公開します。

## PWA

ルート `manifest.webmanifest` のscopeをProjectY全体にし、`service-worker.js` がMY WAY / Life / Hero’s Journey / Systemの主要資産を保存します。

これにより、ホーム画面へ追加したYOSは領域を跨いでも同じPWA内で動き、初回キャッシュ後は主要画面をオフラインでも開けます。

## 注意

- 公開リポジトリへ秘密情報・認証情報を保存しない。
- GitHub Pagesは配信経路であり、YOSの唯一の正本・唯一の実行経路にはしない。
