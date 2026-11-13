# YOS Shortcut Names

Run the signed helper once on iPhone, then return to the HOME-SCREEN DAYSTREAM app. In task creation step 4, open 「iPhoneの一覧を取り込む」, paste, and tap 「一覧を登録」. Later tasks use the searchable list. Re-run and re-import when your Shortcut names change. Safari and a standalone PWA may have different storage; always register in the app you use.

The helper gets device Shortcuts, reads Name, joins names with newlines, copies to the LOCAL clipboard, then shows instructions. It does not execute another Shortcut, contact a server, or read Shortcut contents. No actual user names are embedded in the signed file or source. Signing uses the existing repository HubSign script on static code only.

Compiled with pinned Cherri v2.3.0. AEA signature decoded/verified with python-aea using the archive signing certificate. All five actions and their UUID dataflow match the unsigned source exactly. Signer normalized only absent/empty workflow types, absent/false input flag, client version and presentation/output metadata. Native name enumeration and clipboard behavior still require physical iPhone acceptance.

The task UI keeps its original storage schema and editor for existing items. Imported name list is local to YOS_DAYSTREAM_WEB_SHORTCUT_NAMES_V1; prior list is backed up before replacement. Names are text, not HTML or code. Selecting a name does not execute it. The existing explicit run button remains the only launch action.
