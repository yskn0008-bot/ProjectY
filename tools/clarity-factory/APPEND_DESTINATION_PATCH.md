# Clarity append destination patch

Target-iPhone evidence showed that a `file.append` action with only `WFFile` still opens with an empty file-path field and fails with 「ファイルパス未指定」.

For generated Clarity artifacts, `patch_append_file_paths.py` therefore converts each resolved target file into:

1. the file's parent directory as `WFFile`, and
2. the concrete target filename as `WFFilePath`.

The patch fails closed unless all append actions resolve to one of:

- `Clarity Inbox.txt`
- `Clarity Ledger.txt`
- `Idea in Box.txt`

This patch is applied after Cherri compile and structural validation, before signing and artifact upload. Physical iPhone E2E remains mandatory before whole-Clarity completion.
