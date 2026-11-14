# iPhone-only control: verified integration option

## Sources checked 2026-11-14
- Tapo official iOS Shortcuts integration: https://tapo.com/jp/faqs/kasa-and-tapo-siri-integration-how-to-control-smart-devices-with-siri/
- Tapo official Smart Actions device matrix (includes multicolor bulbs and IR AC): https://tapo.com/jp/faqs/tapo-smart-actions-how-to-set-up-automations-and-shortcuts-on-the-tapo-app
- Apple documented run-shortcut URL: https://support.apple.com/en-au/guide/shortcuts/apd624386f42/ios

## Verified from user's iPhone screenshots
- Tapo app lists floor lamp on, 1% brightness; user confirms Tapo controls work.
- Apple Home lists lamp unavailable. Do not depend on Apple Home.
- Tapo app lists H110 hub, BRAVIA, AC IR remote and light IR remote.
- No always-on computer.

## Practical fallback
A browser UI can launch an existing **iOS Shortcut** with:
`shortcuts://run-shortcut?name=<encoded-existing-shortcut-name>&input=text&text=<encoded-action>`.
Apple documents this launch method. It is NOT an in-page browser API, and foreground switching / return behavior is not verified. User's original constraint of Scriptable not opening can be satisfied for Tapo devices only when the actual Shortcuts action calls the Tapo app integration or another verified native control, not the old Scriptable scripts. Sony IRCC may still need a native local-network action or a separate authenticated LAN controller.

Do not create multiple per-action shortcuts. Prefer one existing router with a validated allowlist and a parameter. The existing shared YOS installer and Notion routing specifications take precedence; no new independent installer.

## Next iPhone check (one question)
In iOS Shortcuts, create a **temporary diagnostic only if no existing compatible shortcut exists**, search for Tapo actions and inspect whether the user's floor lamp and H110 IR remotes are selectable. If yes, test a harmless lamp brightness command and confirm physical effect. Do not claim that H110 IR remote actions are exposed until observed.

## Architecture tradeoff
A fully in-page web app with no resident service and no exposed credentials remains unproven. The above provides a zero-new-hardware hybrid Web UI + native Shortcuts action runner, with possible app transitions. If the user insists on all interactions remaining within Safari, mark the requirement blocked, not completed.
