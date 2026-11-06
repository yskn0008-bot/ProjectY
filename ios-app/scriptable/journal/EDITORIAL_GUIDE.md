# YOS JOURNAL — Editorial guide v1.5

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
