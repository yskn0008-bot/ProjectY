# DAYSTREAM native Shortcut selection

Candidate in PR #751. The new-task wizard offers `iPhoneの最新一覧から選ぶ`. Add the signed `YOS Shortcut Choice` once. Every launch reads the current native Shortcut names and asks for one selection. It copies only a nonce-tagged name to the local clipboard; it never runs the selected Shortcut or sends the list to a server.

Return to the original home-screen DAYSTREAM, tap `選択を反映`, and confirm the task. If clipboard reading is denied, long-press the fallback field and paste. No name typing or bulk list maintenance is required. Existing imported lists and existing task data remain intact.

The complete creation draft is saved locally before app switching. Reload restores it at step four on the same date. Closing/saving invalidates it. Choice packets expire after ten minutes, accept UTF-8 names up to 100 characters, and must match the current single-use nonce. Failed writes, unrelated packets, cancellation and denied paste do not change the task plan. The helper carries only a random request token through its URL, never task contents. No clipboard polling or automatic execution is used.

Existing-task editing retains its previous form. Existing name-only task records do not have stable native IDs: this chooser is **not automatic rename tracking**. Renaming a Shortcut later will not automatically relink old tasks. Stable identity and automatic PWA change delivery remain unproven and open.

Verification: Cherri 2.3.0 compilation; Node protocol and DAYSTREAM regressions; signed AEA signature plus all 20 action/UUID dataflow entries equal unsigned output. Signer differences are presentation/client defaults only. Signing uses the existing HubSign utility on secret-free static code. Browser smoke covers reload, denied clipboard/paste fallback, wrong packet protection, one-use persistence, final task save, existing editing and storage failures. Physical iPhone app return, paste permission and install behavior still need acceptance. Do not call the integration complete until that gate passes.

The existing Notion/backend #750 production rollout is rate limited. Do not deploy this candidate's combined latest-main Web before the corresponding backend is ready. Keep production unchanged; PR branch is the isolated test source.

Sources: https://support.apple.com/en-nz/guide/shortcuts/apdcd7f20a6f/ios and https://webkit.org/blog/10855/async-clipboard-api/
