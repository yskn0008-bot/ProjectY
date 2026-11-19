# YOS JOURNAL｜一次資料取得・引用照合プロトタイプ（非公開・発行禁止）

## 目的と範囲

既存のiPhoneショートカット「YOS JOURNAL 2段階編集 TEST」（執筆GPT→編集GPT→iCloud→非公開Notion Inbox）は**一切変更しない**。既存のJOURNAL公開用JSON、刊行ゲート、Web UI、インストーラーも変更しない。

試験部品 `journal/source-evidence-audit.mjs` は、編集者が**公開情報のみ**で作った小さな資料パケットから、許可済みHTTPSの原典ページを直接GETし、事前に指定した引用文が実際に本文に存在するかを独立に照合する。記事テーマは本人の魅力・知性・感性・個性・経験を育てる発見を優先。ただし関心分野と一致するだけの弱い一般論は採用しない。

**引用文の一致は事実検証ではない**。論文の研究対象、結論、比較条件、因果関係、効果量、反証や解釈、ニュースの時点、権利までは判定できない。結果は常に `publicationAllowed:false`、`semanticFactCheck:"NOT_PERFORMED"`、`verifiedClaims:0` を返す。原典を読む独立レビューと既存 `journal/gpt-editorial-gate.mjs` は別途必要。自動公開禁止。

## 現行との接続

1. 元記事・研究候補のURLを実際に確認して、**事実未確認の仮主張**と、その出典本文からの短い原文抜粋を編集者が研究用JSONに記載する。原稿全文や個人情報は入力しない。
2. 試験ツールは元のWebページへアクセス。404、アクセス制限、PDF、HTML以外、取得エラー、引用文不一致、数字の欠落を**保留**とする。新規APIキー、Notion接続、GitHub書き込み、本人情報転送は一切不要。
3. `handoffText` には引用位置が確認できた候補だけが入り、出典URLとともに【原典意味照合待ち】として記載される。**引用自体を丸ごと公刊してよいとは判定しない**。著作権上、本文公開には別途要約・引用制限が必要。
4. これを検証資料として執筆GPTのショートカット共有入力に渡す場合も、**iPhone実機の入力引継ぎは未検証**。保留記事は下書きのまま。
5. 将来的な既存JOURNAL公刊は、実際の原典照合、個人情報・著作権・重複・内容品質の編集審査、既存の候補JSON契約、PR/CIをすべて通す。日付別号の上書き禁止。

## 単発のローカル実行例（Node.js 22、研究者向け）

以下のような**公開研究資料だけ**を `/tmp/yos-public-research.json` に記載する。研究記事の例であり、これ自体は検証結果ではない。実際の原典ページの本文にある抜粋を手動で確かめてから入力する。

```json
{
  "schemaVersion": 1,
  "publicOnly": true,
  "topic": "男性の顔の印象に関する研究の対象と限界",
  "sources": [
    {
      "id": "S1",
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9626598/",
      "sourceType": "primary"
    }
  ],
  "claims": [
    {
      "id": "C1",
      "text": "研究対象では、顔の魅力度評価と健康そうに見える評価に関連が報告された。ただし実際の免疫能力と同じではない。",
      "sourceId": "S1",
      "evidenceQuote": "Ratings of perceived facial attractiveness (Study 1) and perceived healthiness (Study 3) were also positively"
    }
  ]
}
```

```sh
node journal/source-evidence-audit.mjs --input /tmp/yos-public-research.json --output /tmp/yos-audit.json --notes /tmp/yos-gpt-handoff.txt
node --test journal/tests/source-evidence-audit.test.mjs
```

注意：原典サイトがBotアクセスを制限すれば結果は `access_blocked` / `source_unavailable` として停止。**抜粋の発見、指定URLの公開元確認、リンク到達を自動的な事実承認へ昇格させない**。部分的一致のためにブラウザの保護機構を迂回しない。

出力ファイルはデフォルトでは自動作成しない。上記で指定した**未使用のパス**のみに書き込み、上書きしない。研究ノートは非公開で管理し、原文や個人化情報を公開GitHubへコミットしない。

## テストと残る工程

- [x] 決定的なオフライン単体試験（正常取得/引用一致、引用不一致、数字の不整合、認証チャレンジ、PDF、HTTP異常、リダイレクト、プライバシー、秘密漏えい防止）。
- [ ] 実在原典へのインターネットアクセスを伴うE2E（原典側のBot拒否や全文取得制限もある）。
- [ ] 本人の2段階GPTショートカットへ研究資料を渡す実機テスト（ロック中・定時起動は未検証）。
- [ ] 原典意味照合を伴う厳密な判定（人による照合、あるいは取得全文を渡した独立監査と人の承認）。
- [ ] 出典の権利・引用要件と雑誌品質のレビュー、公開ゲート、サイト反映、配信・通知。
- [ ] 現行原稿と資料あり原稿のA/B評価（本人の実機で同条件の原稿を取得後、面白さ/正確さ/稼働時間を比較）。

本部品は**原典の取得確認を実際に行う最小の土台**であり、完全なファクトチェックの代替ではない。追加のChatGPTや外部有料APIは不要。APIキーを入れない。
