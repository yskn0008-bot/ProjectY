# YOS JOURNAL — Editorial guide v1.6

Status: design and editorial contract, 2026-11-07. Not evidence of automated daily publishing or iPhone acceptance.

## Purpose

Publish a premium mobile-first men's personal magazine **for one reader**. An article is eligible only if its facts, applicability, and source can be connected to the reader's *currently confirmed* task, decision, event, or goal. General popularity alone is never a reason to include it. Relevance takes priority over a fixed article count.

## Decision gate — before an article is selected

1. Confirm the reader's **latest** applicable context from permitted existing records. Compare contrary or stale information; never infer face shape, hair type, budget, availability, event attendance, or other attributes from examples.
2. Explain precisely why the article matters *today*. If the explanation requires guessing a personal attribute, either verify the attribute or exclude the article.
3. Prefer official, regulatory, professional, academic, or original sources as appropriate. Smartlog and editorial sites are excellent as visual/style inspiration but their recommendations are not personal diagnoses or guaranteed matches. Confirm the author, publication/update date, relevant place and conditions. Disclose when these cannot be confirmed.
4. Prioritize substantive novelty, concrete utility, risk/urgency, and timeliness. Avoid repeating yesterday's article unless new information changes a decision.
5. Use only the number of genuinely useful stories. Never pad the issue for genre diversity or engagement.
6. Never publish a personal calendar entry, private amount, sensitive personal details, or private Notion content to public GitHub JSON. Public JSON may contain public article facts and generalized rationale only. Personal tailoring using private data belongs in a non-public processing/display layer with appropriate controls.

## Headline hierarchy

- **Masthead:** YOS JOURNAL. Massive serif wordmark, editorial letter spacing; small date / edition line.
- **Cover headline:** one decision-relevant idea; preferably a two-line phrase in Japanese. Large, high contrast, directly connected to the lead feature, not clickbait.
- **Section marker:** 01 / 04 + category (e.g. WORK / REALITY). Numbers and micro-label are editorial navigation, not decoration.
- **Story headline:** 16–34 Japanese characters as a guideline. State a useful insight or specific change; no ambiguous hype, exaggerated certainty, or advice beyond evidence.
- **Article synopsis:** visually prominent under THE BRIEF, separate from both headline and personalized rationale.
- **Why it matters:** a smaller secondary block, explaining the verified current link to the reader.
- **Next move:** a single optional actionable step; distinguish decisions from actions requiring explicit authorization.
- **Citation:** media/author, publication or update date, and original article link, legible beneath the content.

Typography, reading order and accessible contrast take precedence over decorative effects. Default body at least approximately 16–17px, line-height around 1.8; low-contrast tiny labels must not carry critical information.

## Article summaries — editorial quality bar

Use three components in this order:

1. **THE BRIEF / 要約:** In approximately 90–170 Japanese characters (not a hard truncation), answer: "What is the verified fact or conclusion?", "What changed or what are the relevant conditions?", and "What uncertainty or qualifier matters?" Keep to 2–3 clear sentences, with no unsupported causal claims. A longer summary is acceptable when safety or legal precision needs it.
2. **WHY IT MATTERS / 今の自分に必要な理由:** One or two specific sentences linking the article to a **confirmed current need**. Do not merely say "this may be helpful" or reuse the summary. Never call a user's face shape, job status or attendance confirmed without a source.
3. **YOUR NEXT MOVE / 今日の一歩:** One small, low-burden step that does not imply a purchase, treatment, binding commitment, or third-party action without authorization. If no step is justified, it may be omitted.

Optional `keyPoints` (up to 3) gives discrete non-redundant facts. Optional `caveat` discloses important uncertainty in ordinary language. Separate factual reporting from interpretation; label old source material correctly.

### Before/after examples based on a historical test issue

These examples concern the old 2026-11-04 issue and **are not automatically today's edition**:

- WORK or MONEY fact summary: Instead of "Bill calendars are useful", say "CFPB's bill-calendar worksheet displays each payment date alongside expected income. It can reveal a gap even if the month as a whole appears affordable. This is a general planning method; it does not establish the reader's current balance."
- STYLE: Instead of presenting a general hairstyle ranking as a personal match, say "Smartlog's gallery compares 34 mash-wolf variations with photos and styling guidance. It provides examples for comparing length and silhouette; suitability for the reader is not established without confirmed hair type and face shape."

## Photo selection and captions

- The cover uses the lead article's photo **only when the original editorial or licensed use is permissible** and the photograph genuinely depicts the article or a clearly identified illustration.
- Preserve rights and proper credits. No implied editorial affiliation and no photographs misrepresented as the exact event, user, person or product.
- Use `imageKind: "illustrative"` to mark an illustrative/generated image and `imageCaption` for its context; the viewer shows "イメージ写真" when appropriate.
- When no qualifying image exists, use an elegant typographic cover; no unrelated stock-photo filler. Image absence must not obstruct reading.

## JSON display contract

The existing public feed under `ios-app/scriptable/journal/latest.json` remains the data source until the publishing pipeline is explicitly completed.

```json
{
  "date": "display date",
  "issuedOn": "YYYY-MM-DD",
  "headline": "cover headline",
  "lead": "cover dek",
  "articles": [
    {
      "category": "WORK / DECISIONS",
      "title": "article headline",
      "summary": "fact-checked editorial summary",
      "keyPoints": ["optional additional fact"],
      "reason": "non-sensitive reason why relevant now",
      "action": "one optional next step",
      "caveat": "optional uncertainty or applicability condition",
      "source": "original source name",
      "sourceDate": "publication/update date or omitted when unknown",
      "link": "https://reliable.original/article",
      "image": "https://permitted.image/url-or-empty",
      "imageCaption": "accurate visual description",
      "imageKind": "illustrative"
    }
  ]
}
```

Existing fields remain compatible. The viewer never invents missing photos, article dates, or personalized claims; it flags a stale issue. The actual editor/publisher must verify sources and conditions before writing JSON.

## Acceptance gates

- [x] Document editorial hierarchy and summary contract.
- [x] Viewer uses premium cover, larger editorial headlines, article synopsis, verified-context rationale, action, citation, and optional picture caption.
- [x] Mock checks run for online, offline/cached, empty issue and unsafe-link exclusion (V8 simulated Scriptable; not an iPhone pass).
- [ ] Connect automated article research, verification, relevance filter, summarization and licensed photo selection to a daily publisher. Avoid ChatGPT/OpenAI scheduled task as explicitly decided.
- [ ] Confirm privacy review of the public feed and daily-update path.
- [ ] Install and inspect on a real iPhone with articles and licensed photographs.
- [ ] Verify scheduled delivery, tap path, fallback, stale-issue indicators and rollback.

Do not mark the full product complete until these last gates pass.

## 2026-11-12｜Viewer v1.6：既存JOURNAL v1.5を基にした小改修

- 本人がiPhoneのScriptableで `JOURNAL` v1.5を実際に開けることを確認した。GitHub Draftのviewerは追加されていたScriptableメタデータ重複行を含まない同じv1.5コードであり、既存端末の `JOURNAL` は上書きしない。
- Viewer v1.6では発行状態と発行日を**表紙の見出しより前**に表示する。古い `latest.json` を現在の新刊だと誤認させず、過去号・経過日数・オフライン取得失敗を明示する。記事見出しによる目次（IN THIS ISSUE）を追加し、リンクは既に審査対象となっている記事にだけ付ける。
- 一覧側には写真の出典者名 `imageCredit`（公開フィードで許諾確認済みの場合のみ）があればキャプションへ明記し、イメージ画像表示も維持。出典と掲載・更新日を明瞭に区別し、日付未確認は推測せず `未確認` と示す。スマホの本文文字サイズ・余白と記事の緩急を調整。追加の新記事や本人属性は創作しない。
- 画像権利の可否はScriptableのHTML表示コードから自動判定できない。公表前の編集側チェックが必要。個人のNotion情報を公開JSONに入れないこと、本人に不要な記事を掲載しないこと、写真なしを無関係な画像で埋めないことは従来のまま守る。
- Node Scriptableモックで、古い号・本日号・オフライン保存号・危険URL/理由なし除外・写真権利表記を想定した注記・不正データ表示の6件を追加。これは自動検査であり、iPhoneの誌面・日次発行/通知の実機検証ではない。
- `JOURNAL`（既存端末名）を勝手に変更せず、GitHub Draft #664に隔離。main、共通インストーラーの本番登録、日次発行、ChatGPT/OpenAI朝刊オートメーションは変更しない。自動発行の研究・信頼性確認・許諾済み写真取得・配信検証は別の未完了工程。

## 2026-11-12｜GitHub Actions日次候補作成（安全な段階導入）

- 既存GitHub/Scriptableで完結する候補作成を追加。`.github/workflows/yos-journal-editorial.yml` は `Asia/Tokyo` 07:17ごろに相当するUTC 22:17 cronを用い、**mainへ反映されたときのみ**毎日実行される。GitHubのスケジュールは遅延・無実行があり得るため、定時到着の保証とはしない。
- GitHub ModelsはGitHub Actionsの`GITHUB_TOKEN`（`models:read`）で文章候補を作る構成。別のOpenAI APIキーやChatGPTのオートメーションは使わず、本人の旧朝刊OpenAIタスクは無効のまま。現時点で当該リポジトリのGitHub Models実リクエスト権限と日次ライブRSS取得は未検証。
- 現在取得対象は沖縄県公式RSS（新着・報道発表）および宜野湾市公式RSSのみ。タイトル・公開日時・出典元URLと短い公開説明を取得し、過去3日以内・公式サイトのHTTPS URL・生活上の関係がある候補だけを収集。個人のNotion/家計/銀行/健康データをGitHub Modelsへ送らず、公開フィードにも保存しない。従ってこれは**公的情報の一般的な関連性**であり、本人固有のニーズを裏付けた選定ではない。私的な個別最適化は将来、非公開の処理経路を確認してから。
- AIが書いてよいのは要約と一般的な確認理由だけ。記事タイトル・URL・日付・媒体名は公式RSSから固定し、モデルの出力で置き換えない。旧号と同じURL、鮮度不足、情報不足、不正URL、秘密情報らしき表現、出典不一致は除外。原文を複数媒体で裏取りしたことまでは意味しない。
- `daily-editor.mjs` は候補JSONを一時ファイルにのみ出力し、失敗した日は過去号を新刊の日付へ書き換えない。`validate-publish.mjs` は公開直前にJST日付・公式URL/出典・対象日・機密情報のパターン・写真の権利を再検査。**権利未審査の写真は必ず空欄**とし、無関係画像を埋め込まない。
- GitHub Actionsで生成した候補は7日間のアーティファクトとして保存。一般公開の `journal/latest.json` へ書き込むpublishジョブは **明示的な手動 `workflow_dispatch` の `publish=true`** の場合だけ動作する。記事の事実関係・当人への適用・画像権利のレビューを完了するまでは実行しない。自動公開や通知の本番切替、端末コード更新を済ませたとは報告しない。
- `ios-app/tests/journal-daily-editor.test.mjs`（8件）、`ios-app/tests/journal-publication-gate.test.mjs`（5件）を追加し、公開情報の保護と失敗時の旧号保持を検証。ローカルJS模擬試験は13件合格、正式GitHub Actionsの総合結果は別途確認する。
- **残る完成条件**：実データでのニュース取得→GitHub Models利用権限/レート上限の確認→出典の事実照合・本人の最新状況への安全な関連付け→写真の適切な利用許諾→新号の公開・旧号アーカイブと履歴→iPhoneでの記事更新と表示・通知の実測。手動レビューを省く自動公開は現段階で許可しない。

## 2026-11-12｜Notion現在地連動・端末内の試験実装

- 目的：既存Money・Self・Health・Life・Work等の目標に関係するYOS Tasksを毎回再評価し、本人の記録上の状態・優先度・期限・次の一手・ブロッカーの変化で記事順位が変わること。Notionの記録は実際の達成・現在の事実と同義ではないため、参考順位と明示。
- 実行場所：既存YOS JOURNAL.jsのiPhone Scriptable端末内。Keychain内の既存YOS_NOTION_INTEGRATION_TOKENでNotion公式APIの既存YOS Tasksデータソースを最大500件読み取る。失敗時はMY_WAY_WIDGET_TOKENの既存認証付きprivate Tasks APIへフォールバックするが、最大3件のため部分的な照合として表示する。未接続なら一般記事であり個人化済みとは表示しない。
- 記事ごとのMoney/Work/Health/Self/Lifeの話題一致に、既存タスクの実行中・本人操作・次にやる・待ち、優先度、近い期限を反映。完了・保留タスクは個人関連候補から除外する。ただし話題語の一致は本人に最適だと断定できず、適切な最新記事を追加検索することも現段階ではない。
- セキュリティ：本人のMoney・Health・Self・Tasks本文やキーを公開GitHub latest.json、GitHub Models、記事キャッシュ、公開APIへ転記・送信しない。既存Notion APIまたは既存認証付きTasks API以外にはタスク本文を送らず、iPhone内のメモリだけで判定。誌面には概略の分野と状態しか出さない。
- 追加テスト ios-app/tests/journal-local-relevance.test.mjs の8件で、進捗変更で表紙記事がMoney→Healthへ切り替わること、完了・保留除外、未接続／通信失敗の非個人化、機密データを送信・保存しないこと、既存非公開Tasksへのフォールバックを検査。
- 未完：Notionとの実通信・iPhone実機表示、元のGoal→Task紐付け、情報源の拡張と新記事の適合性検証、本番配信、画像の権利確認。既存JOURNALを勝手に改名・削除・上書きせず、開発Draftに留める。
