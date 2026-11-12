# Current design acceptance gate

final result: blocked

User now explicitly asks for an exact static wallpaper copy and defers task functionality. The current renderer uses the original supplied JPEG bytes, clipped to the left content viewport and scaled uniformly. It does not redraw or approximate the source. Original hash equality and viewport math are verified; actual iPhone placement/crop and Scriptable chrome remain unverified. Prior generated/HTML skins are historical, not the current target.

Source: second supplied JPEG (glass) default; first supplied JPEG (compact) optional. Both original images remain unchanged. See REFERENCE_WALLPAPER.md and reference-wallpaper-manifest.json.5 source/native mock checks pass. No claim of a browser or physical-device visual pass. Next: obtain actual iPhone output and compare the exact chosen viewport with the source.


## 2026-11-11 real-browser screenshot comparison after static approval

**Evidence and scope**: The user previously approved only the original static glass crop (JPEG x45,y87,width557,height1135). The full dynamic screen has NOT been visually accepted. The original reference was extracted unchanged from `life/calendar/design/reference-glass-original.jpeg`, size 405642 bytes, SHA256 `666692a535a28ac283be8feec193b5495ce40e19b955a65d5001af03ad4ef1c9`. All schedules in the Chromium test are synthetic fixture names, not the user's calendar.

**Browser review**: Existing `life/calendar/timeline.browser.test.cjs` was updated to run on the current glass HOME + 24h editor at a 390×844 mobile viewport (deviceScaleFactor3). Existing YOS Life Safety / Morning-Night chromium job ran the test and uploaded `yos-daystream-glass-390px` artifact, [run #42958403038](https://github.com/yskn0008-bot/ProjectY/actions/runs/42958403038), artifact ID `13828116952`. It includes approved original JPEG and screenshots `timeline-390px-glass-empty.png`, `timeline-390px-glass-planned.png`, and `timeline-390px-edit-overlap.png`. The test passed: glass default, no invented actual schedule, 25 markers in edit, exact 2px/min, overlapping rows both kept, fixed Apple fixture not moved, explicit save/readback signals, no JavaScript runtime errors.

**Visual mismatch to fix before dynamic acceptance**:
1. **HOME time axis missing**: reference prominently shows a continuous 06:00–24:00 vertical time rail and time-aligned cards on the initial screen; current HOME defaults to the chronological `実行順` agenda without the rail. The rail only appears after pressing `編集`. Passing DOM and browser functional tests does **not** mean matching the approved layout.
2. **Overlapping edit cards truncate content**: the 390px editor currently splits simultaneous cards into narrow lanes; the test screenshot shows truncated titles/start-end times. Keep both appointments without collapsing them or hiding the error, but provide a legible overlap presentation (perhaps a detail sheet or expandable lane).
3. **Editor initial focus**: first opening the 24h editor starts at 00:00, forcing manual scroll to a 09:00 event. The screenshot test deliberately scrolled to 09:00 for review; this is **not** proof the app automatically focuses today/next scheduled time.
4. **Other differences**: reference uses a three-chip legend including `おすすめ`, 6:00 tick marks, taller illustrated time-proportional cards and a demonstrated action/feedback. Current dynamic HOME currently shows only fixed/habit chips when no real qualifying recommendation; do not invent advice or fake events to copy the reference illustration.

**Next bounded implementation**: reuse existing `daystream-timeline-ui.js` + `daystream-timeline-ui.css` and `build-timeline-review.py` to restore HOME time-axis fidelity while preserving approved typography/background, real-data-only policy, deterministic 24h geometry, immutable fixed source events, saved file schema, and separate editor controls. Improve overlap legibility and initial editor focus; regenerate the existing package/bridge hashes as part of one compatible candidate, run the existing timeline suites and browser screenshot test again, inspect side-by-side, then ask for one iPhone real-device look/interaction check. Do not merge or overwrite installed Scriptable while visual acceptance is pending. The user’s “カクカク” haptics remain an iPhone hardware gate, not a verified browser feature.
