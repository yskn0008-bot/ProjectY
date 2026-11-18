#!/usr/bin/env python3
"""Contract checks: do not introduce a second Taxi log or an unsafe cross-browser write."""
from pathlib import Path
base=Path(__file__).resolve().parent
repo=base.parents[1]
app=(repo/'taxi/ui-v2.html').read_text()
shift=(base/'YOS TAXI 運行.cherri').read_text()
drop=(base/'YOS TAXI 降車.cherri').read_text()
assert 'yos-taxi-ui-v2-live-20261117' in app
assert 'function handleShortcutLink()' in app
assert 'shortcutRequestId' in app
assert 'history.replaceState(history.state' in app
assert 'if(!isActive())' in app
assert "180000" in app
assert "ios" not in drop.lower() or "storage" in drop.lower()
assert "yyyyMMddHHmmss" in drop
assert "yos_action=dropoff&yos_req={tappedAt}-WIDGET" in drop
assert "openURL(recordUrl)" in drop
assert "chooseFromList(@actions" in shift
for action in ("start","end","m100","report"):
    assert "yos_action="+action in shift
assert "startTimer(qty(20, \"min\"))" in shift
for source in [shift,drop]:
    for invalid in ("api.notion.com","Keychain","file.append","saveFile(","localStorage.setItem","deleteFile("):
        assert invalid not in source,invalid
print("YOS Taxi Shortcut source contracts: PASS")
