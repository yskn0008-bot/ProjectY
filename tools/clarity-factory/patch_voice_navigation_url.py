#!/usr/bin/env python3
"""Offline, fail-closed repair of the Clarity.Voice legacy Maps search actions.

Input: decoded Shortcut.wflow plist, never a signed AEA1 .shortcut file.
Personal workflow contents must remain local. Never upload them to GitHub or
send them to HubSign or another third-party signing service.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import plistlib
import uuid
from pathlib import Path

TOKEN = '\ufffc'
ROUTES = {
    'google': ('https://www.google.com/maps/dir/?api=1&destination=', '&travelmode=driving&dir_action=navigate'),
    'apple': ('https://maps.apple.com/?daddr=', '&dirflg=d'),
}
OLD = ('is.workflow.actions.location', 'is.workflow.actions.searchmaps', 'is.workflow.actions.nothing')
NEW = ('is.workflow.actions.urlencode', 'is.workflow.actions.gettext', 'is.workflow.actions.openurl')


def attachment(action_id: str, name: str) -> dict:
    return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {
        'Type': 'ActionOutput', 'OutputUUID': action_id, 'OutputName': name}}


def _fresh_uuid(used: set[str]) -> str:
    while True:
        value = str(uuid.uuid4()).upper()
        if value not in used:
            used.add(value)
            return value


def patch_workflow(raw: bytes, provider: str = 'google') -> tuple[bytes, dict]:
    if provider not in ROUTES:
        raise ValueError('Unsupported navigation provider')
    if raw.startswith(b'AEA1'):
        raise ValueError('This is a signed AEA1 .shortcut, not an extracted plist; refuse')
    original = plistlib.loads(raw)
    if not isinstance(original, dict) or not isinstance(original.get('WFWorkflowActions'), list):
        raise ValueError('Not an Apple Shortcut workflow plist')
    root = copy.deepcopy(original)
    actions = root['WFWorkflowActions']
    locations = [i for i in range(len(actions) - 2)
                 if tuple(a['WFWorkflowActionIdentifier'] for a in actions[i:i + 3]) == OLD]
    if len(locations) != 1:
        raise ValueError(f'Expected exactly one legacy Location/Search Maps/Nothing sequence; found {len(locations)}')
    i = locations[0]
    loc = actions[i]['WFWorkflowActionParameters']
    search = actions[i + 1]['WFWorkflowActionParameters']
    destination = loc.get('WFLocation')
    assert destination and destination.get('Value', {}).get('Type') == 'ActionOutput', 'Unknown destination linkage'
    old_id = loc.get('UUID')
    assert old_id and search.get('WFInput', {}).get('Value', {}).get('OutputUUID') == old_id, 'Maps not using location output'
    for j, action in enumerate(actions):
        if j in (i, i + 1, i + 2):
            continue
        if old_id in str(action.get('WFWorkflowActionParameters', {})):
            raise ValueError(f'Location output reused by action {j + 1}; refuse unsafe patch')
    used = {p.get('UUID') for a in actions for p in [a.get('WFWorkflowActionParameters', {})] if p.get('UUID')}
    encoded_id, url_id, open_id = [_fresh_uuid(used) for _ in range(3)]
    base, suffix = ROUTES[provider]
    actions[i:i + 3] = [
        {'WFWorkflowActionIdentifier': NEW[0], 'WFWorkflowActionParameters': {
            'UUID': encoded_id, 'CustomOutputName': 'yosNavDestinationEncoded',
            'WFEncodeMode': 'Encode', 'WFInput': copy.deepcopy(destination)}},
        {'WFWorkflowActionIdentifier': NEW[1], 'WFWorkflowActionParameters': {
            'UUID': url_id, 'CustomOutputName': 'yosNavDirectionsURL',
            'WFTextActionText': {'WFSerializationType': 'WFTextTokenString',
                                 'Value': {'string': base + TOKEN + suffix, 'attachmentsByRange': {
                                     f'{{{len(base)}, 1}}': {
                                         'Type': 'ActionOutput', 'OutputUUID': encoded_id,
                                         'OutputName': 'yosNavDestinationEncoded'}}}}}},
        {'WFWorkflowActionIdentifier': NEW[2], 'WFWorkflowActionParameters': {
            'UUID': open_id, 'WFInput': attachment(url_id, 'yosNavDirectionsURL'),
            'Show-WFInput': True}},
    ]
    assert len(actions) == len(original['WFWorkflowActions'])
    assert all(original[k] == root[k] for k in original if k != 'WFWorkflowActions')
    changes = [j + 1 for j, (a, b) in enumerate(zip(original['WFWorkflowActions'], actions)) if a != b]
    assert changes == [i + 1, i + 2, i + 3]
    assert actions[i]['WFWorkflowActionParameters']['WFInput'] == destination
    assert actions[i + 1]['WFWorkflowActionParameters']['WFTextActionText']['Value']['attachmentsByRange'][
        f'{{{len(base)}, 1}}']['OutputUUID'] == encoded_id
    assert actions[i + 2]['WFWorkflowActionParameters']['WFInput']['Value']['OutputUUID'] == url_id
    output = plistlib.dumps(root, fmt=plistlib.FMT_BINARY, sort_keys=False)
    assert plistlib.loads(output) == root
    report = {'provider': provider, 'action_count': len(actions), 'replaced_1_based': changes,
              'original_sha256': hashlib.sha256(raw).hexdigest(),
              'patched_sha256': hashlib.sha256(output).hexdigest(),
              'signed': False, 'iphone_tested': False, 'other_actions_changed': False}
    return output, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--provider', choices=ROUTES, default='google')
    ap.add_argument('--report', type=Path)
    args = ap.parse_args()
    output, report = patch_workflow(args.input.read_bytes(), args.provider)
    args.output.write_bytes(output)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
