# Clarity Factory — Cherri path

Issue #314 の「Clarity Universal Gateway v1」を、iPhoneからテンプレートを書き出さずにコードから生成できるかを最短で実証する経路。

## いま固定すること

最初のゲートは、Clarityが必須とするChatGPT actionを推測ではなく実際にコンパイルできること。

- ChatGPT action
- Follow Up = OFF
- Result Type = Dictionary
- secret / personal data を生成物へ埋め込まない
- 第三者署名サービスへ送らない

`clarity-compiler-proof.cherri` は Cherri v2.3.0 の公開action定義を使って上記だけをコンパイルする。GitHub Actionsではv2.3.0 Linux x86_64 releaseをSHA-256固定で取得し、`--skip-sign` でunsigned Shortcutを生成する。

## v3.0での位置づけ

これは旧template方式を全廃する変更ではない。現行Cherriで必要actionを再現できるなら、本人にtemplate exportを返す前にこの安全な代替経路を使う。

コンパイル証拠がgreenになったら、同じbranchで次を順に追加する。

1. 音声 / テキスト入力
2. Raw First保存
3. 現在地・時刻等の必要最小Context
4. ChatGPT Dictionary出力
5. schema validation / fail closed
6. Policy / Router
7. v1 executor
8. Verify / Ledger / 必要時だけFeedback

一度に全機能を推測実装せず、動くaction contractを増分で固定する。

## 署名

この段階では署名しない。HubSign等の第三者へShortcutを送らない。unsigned artifactを生成・検証するところまでを自動化し、署名経路は必要になった時に別判断する。
