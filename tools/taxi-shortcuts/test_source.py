#!/usr/bin/env python3
"""Safety and source contracts for every native YOS Taxi workflow."""
from pathlib import Path
base=Path(__file__).resolve().parent
repo=base.parents[1]
app=(repo/'taxi/ui-v2.html').read_text()
sources={p.stem:p.read_text() for p in base.glob('*.cherri')}
expected={'YOS TAXI 運行','YOS TAXI 降車','YOS TAXI 出庫','YOS TAXI 休憩','YOS TAXI 帰庫','YOS TAXI 日報','YOS TAXI 緊急'}
assert set(sources)==expected, (set(sources), expected)
assert 'yos-taxi-ui-v2-live-20261117' in app
assert 'function handleShortcutLink()' in app
assert 'shortcutRequestId' in app
assert 'history.replaceState(history.state' in app
assert 'if(!isActive())' in app
assert '180000' in app
for action in ('start','end','m100','report','history','analysis'):
    assert "if(action==='"+action+"')" in app
drop=sources['YOS TAXI 降車']
assert 'yyyyMMddHHmmss' in drop
assert 'const salt = randomNumber(100000, 999999)' in drop
assert 'yos_action=dropoff&yos_req={tappedAt}-{salt}' in drop
assert 'openURL(recordUrl)' in drop
shift=sources['YOS TAXI 運行']
assert 'chooseFromList(@stages' in shift
for stage in ('出庫前｜確認・開始','営業中｜判断・休憩・記録','帰庫｜終了・日報','困ったとき｜安全対応'):
    assert stage in shift
for action in ('start','end','m100','report','history','analysis'):
    assert 'yos_action='+action in shift
assert 'startTimer(qty(20, "min"))' in shift
assert 'startTimer(qty(15, "min"))' in shift
assert 'https://app.notion.com/p/3d35ca88289581ef9dc8d5f11ff8e213' in shift
assert 'startTimer(qty(20, "min"))' in sources['YOS TAXI 休憩']
assert 'yos_action=start' in sources['YOS TAXI 出庫']
assert 'yos_action=end' in sources['YOS TAXI 帰庫']
assert 'yos_action=report' in sources['YOS TAXI 日報']
for label,source in sources.items():
    assert '#define name '+label in source
    for invalid in ('api.notion.com','Keychain','appendResolvedFile','file.append','saveFile(', 'getFile(', 'localStorage.setItem','deleteFile('):
        assert invalid not in source,(label,invalid)
    for url in ('https://yskn0008-bot.github.io/', 'https://app.notion.com/p/'):
        if url not in source: continue
        assert url == 'https://yskn0008-bot.github.io/' or label == 'YOS TAXI 運行'
print("YOS Taxi 7 native Shortcut source contracts: PASS")
