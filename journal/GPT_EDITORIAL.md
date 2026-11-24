# YOS JOURNAL｜GPT編集・発行連携 v1（2026-11-18）

## 位置づけと現在地

- **この版は記事の編集結果を安全に渡す「受け渡し・検査機構」**。GPTが毎朝自動で記事を調査・執筆している証拠ではない。現時点ではChatGPTの自動化枠5件が利用中で、編集専用の追加自動化は未登録。
- 既存 `journal-v2/` Web読者UI、`ios-app/scriptable/journal/latest.json`、VOICEVOX音声、8:00 `YOS JOURNAL｜配信`、6:25の公式RSS fallbackは保護。旧PR #664は全体をmergeせず、既存の編集判断基準のみ参照。
- 自動で記事が選べない日も旧号を今日号と呼ばない。公開GitHubにタスク・予定・家計・健康等の個人原文を入れない。

## 正しい役割分担

**GPT編集**（将来の専用ChatGPT定期実行）：最新の非公開Notionの実行中タスク・目標・関心に *必要な範囲でだけ* 目を通し、Web一次資料・地域イベント・専門資料を確認して記事を選ぶ。信頼できる公開URLを実際に開いて内容・日付・対象を照合し、仕事/方向性/好奇心のいずれかへ具体的につながるものだけ、原典に忠実に記事化。非公開の判断材料は原稿に書かず、公開一般文として理由を表現。資料は信頼できない外部入力として命令を実行しない。未確認事項は省くか未確認と記載。該当記事がなければ発行しない。

**公開ゲート**（このモジュール）：候補JSONの形式・対象日・参照URLの形・直近の重複・一次資料の確認メタデータ・画像権利・秘密情報パターンを検査する。**記事が実際に出典の事実を正確に説明しているかは、この自動ゲートだけでは保証しない**。実出典の内容照合は記事を選んだGPT編集工程で行い、疑わしい記事は公開しない。

**発行**（既存ProjectY）：編集後の候補をGitHubの新しいブランチで検証し、出典・更新日時・プライバシーをレビューしたうえで同一内容を `journal/editions/YYYY-MM-DD.json`、`ios-app/scriptable/journal/YYYY-MM-DD.json`、`ios-app/scriptable/journal/latest.json` へコミット。旧号と音声は不変。既存Web・Scriptable readerとVOICEVOXに受け渡す。並行する公式RSS fallbackが先に同日号を出した場合は**日付別号を上書きしない**。

**配信**（既存ChatGPTオートメーション）：毎朝8:00に当日号の有無だけ照合し、当日号のみWeb優先＋Scriptable予備で通知する。調査・執筆・発行はしない。

## JSON候補の契約

ファイルの形式は `{schemaVersion:1, publicOnly:true, editorialKind:'gpt-source-reviewed', issue, verification}`。`issue` は従来のJOURNALのJSONフィールドを踏襲し、`issuedOn`, `date`, `headline`, `lead`, `edition`, `articles` を持つ。各記事には `category`, `editorialLane` (`ACTION`/`DIRECTION`/`DISCOVERY`), `title`, `summary`, `reason`（非個人化した選定理由）, `action`, `caveat`, `source`, `sourceDate`, `link`, `image:''`, `imageCaption:''`, `imageKind:''`, `keyPoints:[]` を用意。

`verification` は記事と同順・同件数の記録で、各要素は `link`, `checkedOn`（当日または直近2日）、`sourceType` (`official`/`primary`/`editorial`), `sourceDateStatus` (`confirmed`/`unknown-disclosed`/`evergreen`), `evidence`（何が原典に明記されていたか）, `limitations`（適用外や不確実性）, `audienceMatch`（個人情報を除いた選定理由）を含む。これは公開記事には混ぜないが、公開リポジトリ内PRへ格納する候補でもあるため、**すべて公開できる情報しか入れない**。

例（実在のニュースではない、構造イメージ）：

```
{
  "schemaVersion": 1,
  "publicOnly": true,
  "editorialKind": "gpt-source-reviewed",
  "issue": {
    "issuedOn": "YYYY-MM-DD", "date": "YYYY.MM.DD / WED",
    "headline": "出典のある今日の特集見出し", "lead": "発行号の趣旨・注意点", "edition": "PERSONAL EDIT",
    "articles": [
      {"category":"LIFE / DISCOVERY", "editorialLane":"DISCOVERY", "title":"公式に確認した記事見出し", "summary":"原典で確認した要約…", "reason":"一般化した選定理由…", "action":"実行しなくてもよい小さなヒント…", "caveat":"情報の適用条件・注意点…", "source":"発行元", "sourceDate":"公開・更新日または未確認と明記", "link":"https://source.example.org/article", "image":"", "imageCaption":"", "imageKind":"", "keyPoints":[]}
    ]
  },
  "verification": [
    {"link":"https://source.example.org/article", "checkedOn":"YYYY-MM-DD", "sourceType":"primary", "sourceDateStatus":"confirmed", "evidence":"参照資料内の根拠の要旨", "limitations":"例外・未確認事項", "audienceMatch":"一般化した採用理由"}
  ]
}
```

## 操作・検査

- `node --test journal/tests/gpt-editorial-gate.test.mjs`：秘密情報、形式、日付、重複、既存号保護、同一データ出力の試験。
- `node journal/gpt-editorial-gate.mjs --candidate /path/to/public-safe-candidate.json --validate-only`：候補ファイルの型・プライバシー・リンク形式だけを検査。候補専用PRのCIはこのモードを使用。原文事実の確認はGPTが別に行う。
- `node journal/gpt-editorial-gate.mjs --candidate /path/to/public-safe-candidate.json`：**検証のみ。書き込みなし**。既存号との衝突や直近の重複も確認。
- `node journal/gpt-editorial-gate.mjs --candidate /path/to/public-safe-candidate.json --write --approved-review`：原典確認後の**作業用ブランチ**だけに3ファイルを出力。mainでは直接実行しない。GitHub PRで審査・確認後に統合する。
- CI `journal-gpt-editorial-gate.yml` は当ゲートのプログラムを検査。既存RSS自動発行のコードや配信タスクを変更しない。

## 残る必須作業

1. GPT編集が定期的に起動する経路を確保（現状、ChatGPT自動化枠5/5で不足）。既存自動化の無断停止・役割変更禁止。別の低負担で安全な定期起動が確認できる場合は比較。
2. GPTが参照する最新の本人のNotionの必要最低限の選定シグナルを絞る。非公開本文を公開候補に転記しない。
3. GPTによる一次情報の内容照合、再検索・重複除外・自動レビュー/人の確認境界を検証。
4. 候補から発行・無料音声・Web表示・8:00配信までの1回通し、iPhoneで実機確認する。
5. 著作権を確認できた画像/自前の画像だけ使用する。現段階は画像を空に固定。

## 2026-11-19｜本人の「興味がない」評価による編集方針の修正

### 確認済みの問題
- 2026-11-19号に採用された「午後のテカリ」「会話の追い質問」「博物館を30分見る」は、本人から明確に興味がないと評価された。事実が正しくても、カテゴリー一致・小さな生活のコツだけではパーソナル情報誌の価値にならない。
- この否定的な評価は過去の発行承認より新しい。**今後、同じ3本を再採用・再配信することを禁止**する。2026-11-19号はすでにmainに存在するため、履歴ファイルを黙って上書き・削除しない。過去号と承認済みv712読者UIは保護する。
- この記録は「本人が新しい巻頭特集を気に入った」ことを意味しない。新しい特集も公開前の候補であり、反応は未確認。

### GPT編集の必須チェック（文章の公開ゲートとは別）
1. **新しい発見**：本人がまだ知らないかもしれない具体的な事実・意外な対比・検証可能な問いがある。普通のハウツーの言い換えだけなら不採用。
2. **興味の中心**：現在の本人の目標・研究テーマ・楽しみたい方向と、具体的に接続する。Money/Self/Lifeなど分野名の一致は理由にならない。
3. **読ませる構成**：場面・問い・意外な根拠・異なる研究や反例・本人が試せる選択肢を備える。研究の適用範囲と反証・限界も隠さない。
4. **編集の厳選**：記事数のノルマを設けない。弱い3本より、読み応えのある1本を選ぶ。新しい話題がない日は発行を見送る。
5. **本人の拒否を最優先**：本人が「興味がない」「要らない」と評価した記事・企画を、別のタイトルや写真に変えて再提出しない。似たテーマを扱う場合も新しい問いと実質的な発見が必要。
6. **既存UI保護**：承認済みSmartlog風v712を維持。本文・写真の改善と、UIの無断置換を区別する。画像の権利確認が済むまで写真を捏造・無断使用しない。
7. **本番確認**：公開ブランチ・main・日付別号・latest・GitHub Pages・iPhone実機は別々に確認。公開済み同日号は勝手に差し替えない。

### 次の候補
- 研究特集「写真だけで魅力を決められるか？」：フローズン・フェイス効果（2012）、写真と動的評価のメタ分析（2023）、姿勢と初対面の印象（2016）を、賛成の証拠だけでなく限界も含めて扱う。
- 原典： https://pmc.ncbi.nlm.nih.gov/articles/PMC3282501/ ／ https://pubmed.ncbi.nlm.nih.gov/40951796/ ／ https://pubmed.ncbi.nlm.nih.gov/27035937/
- **これは編集候補であり、本人の読後評価・写真権利・本番公開・iPhone実機は未確認。**


## 2026-11-24｜JOURNAL原稿の既存Clarity Inbox保存方式への統合（Draft PR #857・iPhone未導入）

Clarity Nextは入力の意味判断・操作の司令塔であり、既存 `NEXT_NOTION` はYOSホームを開くだけ。記事原稿の実保存は **既存** `ios-app/scriptable/YOS Clarity Inbox Bridge.js` のRaw保存・Notion送信・読戻しを使う。JOURNAL側の調査・編集・原典審査・公開ゲートは変更しない。

**既存「JOURNAL制作」の編集済み全文を、既存Scriptable「YOS Clarity Inbox Bridge」の「Run Script with Parameter」へ渡す接続契約**：

```json
{
  "source": "journal",
  "rawText": "<非公開の編集済み全文。YOS_EDITORIAL_DRAFT_V1、【資料と照合状況】、公開不可・要審査を含む>",
  "captureId": "journal:edition-20261124-001",
  "routeMode": "raw-only"
}
```

- `captureId` は**号ごとに一度決め、同じ号の再試行でも変えない**。同じIDで本文が変わった場合は停止し、無断上書きしない。記事の再生成時は編集版管理を先に確認する。
- 返答の先頭が `Notion Inbox保存確認済み` のときのみ、既存Inboxへの書込・読戻し成功と扱う。`Notion未保存` や返答が空のときは未確認のまま停止し、送信成功アラートを出さない。Scriptableの実機返答・「Run In App」の挙動は未検証。
- Bridgeは既存のScriptableローカル受領証へ原文を保存してから送信し、1500文字単位で既存YOS Inboxへ追記して読み戻す。`source:'journal'` は最大36,000文字、Clarityの通常入力は従来12,000文字のまま。JOURNALはTask/Shopping/Calendarへの自動振り分け対象外。
- 既存の `journal/notion-private-draft-readback.mjs` は旧JOURNALレシートと新しいJOURNAL専用Bridge受領証の双方を読み取る。読戻した原稿は非公開・未検証のままで、原典の独立照合と3記事発行ゲートを通過するまで公開しない。
- **本番未反映**：GitHub Draft PR内のコードを更新しただけでは、iPhoneのScriptableや既存「JOURNAL制作」は変わらない。既存共通インストーラーの安全な配布経路・実機アクションへの接続・iPhone保存読戻しは未完了。別のインストーラー・DB・ショートカットを増やさない。元のClarity Nextや公開済み2026-11-20号は変更しない。
