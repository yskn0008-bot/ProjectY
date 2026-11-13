# DAYSTREAM native chooser — isolated feasibility candidate

No production UI change. Not complete and not a rename-sync implementation.

Target flow: persist the complete unsaved task draft in the home-screen PWA; start the helper with a fresh `YOS_PICK_V1:<nonce>` input; native Get My Shortcuts → names → Choose From List; copy a tagged result locally. On return, accept only the matching unexpired one-use result through a user-initiated paste/read action, then show it in the draft for final confirmation. Cancel/invalid/old/unrelated clipboard data must leave the draft unchanged. Persist consumption together with the draft before creating a task. The protocol module does not itself persist a task or install UI.

The helper contains no list of real names, server requests or execution of the chosen Shortcut. Its list is obtained each run. It is unsigned development output until the return-to-PWA path is verified. Existing YOS Shortcut Names and task UI are untouched.

Apple documents x-callback textual output, but an HTTPS return may open Safari rather than the installed PWA. Do not transfer task drafts in URL query strings or claim shared storage. WebKit documents clipboard gesture/paste restrictions; never silently poll the clipboard. Actual app-return and paste permission behavior require one physical iPhone test after UI integration is prepared. Both the callback option and explicit-paste fallback remain integration work.

Stable shortcut identity is still unverified. A selected name must not be presented as a stable identifier, and additions/deletions must not be guessed to be renames. The requested automatic display-name/target following remains open until stable identity and a permitted live update transport are proven.

Verification: pinned Cherri v2.3.0 compiles the helper. Inspect generated actions for run-time listing, one selection, local-only clipboard and absence of runworkflow/network actions. Node tests verify one-use Japanese names, expiry, mismatch, malformed input and no implicit rename identity. These are not physical phone results.

References: https://support.apple.com/en-nz/guide/shortcuts/apdcd7f20a6f/ios and https://webkit.org/blog/10855/async-clipboard-api/
