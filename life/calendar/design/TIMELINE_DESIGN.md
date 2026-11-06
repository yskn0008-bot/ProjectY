> 2026-11-07最新：本人が承認したYOS LIFE FLOWの白いガラス調・青／緑／紫カードを現在の実装基準とする。TASK_APP_README.mdとdaystream-timeline-ui.css参照。以前のモノクロ案と比較SVGは履歴。実機表示の承認済みという意味ではない。

> 2026-11-05追加：旧候補は実機でデザイン不採用。現在の構成は `../TIMELINE_VISUAL_REVISION.md` と `../daystream-timeline-ui.css` を参照。以下のSVG9状態は過去の比較参考であり、現在UIの実画面・本人承認済みデザインではありません。

# YOS 24時間生活タイムライン — design and evidence contract

Date: 2026-11-05 JST. Additive candidate for existing Draft PR #654, baseline `6ffdc056138301e3a1a70eac2f635a761277da64`. Not deployed or device verified.

## Product decisions

Time is the primary axis: 0:00–24:00 with uniform minutes-to-pixels. Short actions retain exact geometry; a separate readable list/detail control provides a usable touch target. Fixed native appointments precede flexible placements and cannot be moved. Date-only deadlines are not invented appointments. Sleep crossing midnight is one occurrence clipped into the two affected days. No invented wake/sleep schedule and no automatic filling of free time. Rest is valid unallocated time.

The existing habit source remains `YOS_HABIT_FLOW_v1.json` (`yos-habit-flow-v1`); the candidate reads it without changing it. Placement metadata and staged execution records are distinct. A local plan check does not mark a Notion Task or diary habit completed. Existing installed DAYSTREAM, Morning, Night, Money and Clarity remain protected. The 90day plan remains 2026-10-16 through 2027-01-13; this is an evaluation period, not a date limit on the timeline.

## Three visual directions

| Direction | Use | Reason / limitation |
| --- | --- | --- |
| A Soft mineral grey | Recommended light default | Neutral pale ground, opaque reading surfaces, subtle material detail. Matches the request for a quiet monochrome canvas. |
| B Graphite | Optional dark setting | Lower overall luminance with explicitly lighter type and symbols; no claim that dark mode is medically better. |
| C Matte monochrome | Optional texture | A paper-like alternative; can be replaced by plain grey if texture feels distracting. |

All three original wallpaper pages are editable in [Canva](https://canva.link/349p0erltl7mr2c). `mineral.png`, `graphite.png`, `matte.png` are inspected preview-resolution exports, not original-resolution masters. They contain no words, time marks or UI. Keep texture at low opacity behind opaque UI surfaces; changing a background must not alter geometry or meaning. No neon, luminous borders or decorative gradient.

`timeline-directions-editable.svg` contains nine editable vector UI composition references: each background in neutral, drag and positive relationship states. Dates/actions in these references are clearly examples, never the user's calendar. This SVG is a fallback reference, not proof of placement into Figma or a screenshot of the running app. The [Figma file](https://www.figma.com/design/uM6BA4k1ZUcE5YXVBkba6f) was created but remains empty: the Starter MCP call limit blocked the first canvas inspection. Importing the SVG or completing token/components inside Figma is outstanding. Do not label the Figma design complete.

## Type and meaning

System Japanese sans serif; 16–18px action text, 14–16px supporting copy, 28px day heading, tabular clock digits. Main controls target >=44px with visible keyboard focus and equivalent time-input controls. Short time blocks must not be stretched to imply a longer action. Animation is limited to drag feedback; no decorative motion.

| Meaning | Light foreground / surface | Dark foreground / surface | Non-color cue |
| --- | --- | --- | --- |
| Primary | #202220 / #F2F2F0 | #F5F5F2 / #242624 | Text hierarchy |
| Secondary | #595C58 / #F2F2F0 | #C6C9C3 / #242624 | Explicit labels |
| Plus | #1F6548 / #FFFFFF | #A6D6B8 / #242624 | + and reason |
| Concern | #865400 / #FFFFFF | #E9C17A / #242624 | − and reason |
| Conflict | #AD3028 / #FFFFFF | #FFB4AB / #242624 | ! and conflicting names |
| Unknown | Secondary | Secondary | ? and missing information |

These design token pairs require numerical contrast verification; CSS implementation tokens are verified separately. Normal text target >=4.5:1; necessary control boundaries/focus target >=3:1. No full WCAG 2.2 AA claim from color tests or screenshots alone. VoiceOver order, Dynamic Type and touch behavior need actual iPhone testing.

## Impact rule contract

Deterministic local evaluation only during pointer movement. Reevaluate the candidate plus affected neighbors, update related symbols/colors and explain change relative to the original placement. Cancel restores the previous state; only explicit confirmation saves. Red collision/known transfer constraints outrank optional benefits. Missing information is not a negative effect. Never add color because more actions exist.

| Relationship | Evidence type | Interpretation |
| --- | --- | --- |
| Meal → comfortable light walking | General physiological research | Acute post-meal glucose benefit is supported at group level. No personal effect or numeric benefit inferred. One/five minutes is a low-friction habit minimum, not a proven equivalent research dose. |
| Washing → moisturizer | Care sequence + habit convenience | AAD recommends moisturizing damp skin; applicability depends on skin/product and irritation. A local 30-minute matching window is an interface heuristic, not a scientific cutoff or effect estimate. |
| Nearby shared context/actions | Efficiency / habit hypothesis | Fewer transitions may help; no biological synergy claimed. |
| Exercise near sleep | Insufficient personal data | Do not classify all evening exercise as harmful. Intensity, sleep proximity and response matter. |
| Focus work and breaks / shopping and outings | Not personally validated | Suggest only where relevant metadata exists. No invented optimal work time, travel duration or recovery need. |

Research checked for this implementation: [postmeal exercise systematic review](https://pubmed.ncbi.nlm.nih.gov/36715875/), [AAD moisturizing advice](https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin), [exercise timing and sleep comparative review](https://pubmed.ncbi.nlm.nih.gov/42632303/). These support cautious design decisions; local arrangement heuristics are not clinical recommendations.

Initial habits are candidates from existing plans. Start with up to two anchors; preserve 1-minute minimum options, a clear resume path after skipped days, and unrestricted free/rest time. Evaluate initiation burden, switching effort, fatigue and ease of restart at the existing weekly Night review. No 90day automaticity guarantee. Personal timing optimization, longitudinal learning and health-data inference remain unimplemented until real data and consented integration are available.
