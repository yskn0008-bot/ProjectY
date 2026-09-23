from pathlib import Path
s=Path("tools/clarity-factory/YOS_Clipboard.cherri").read_text()
required=[
'#define name YOS_Clipboard',
'getClipboard()','setClipboard(','base64Encode(','base64Decode(',
'getLatestScreenshots(20)','combineImages(screenshotCandidates, "Vertically", 0)',
'if @command == "add"','if @command == "next"','if @command == "merge"',
'if @command contains "select|"','if @command == "duplicate"',
'if @command == "clear"','if @command == "screenshots"',
'YOS Clipboard/buffer.txt','YOS Clipboard/cursor.txt'
]
for x in required:
    assert x in s, x
assert 'Clarity Inbox' not in s
print("YOS_Clipboard source contract: PASS")
