"""Contract tests for a synthetic secret-free Shortcut. No personal workflow data."""
import copy
import plistlib
import sys
import unittest
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from patch_voice_navigation_url import patch_workflow, ROUTES

DEST = 'AAA00000-0000-0000-0000-000000000000'
LOC = 'BBB00000-0000-0000-0000-000000000000'


def fixture(other_consumer=False):
    actions = [
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext',
         'WFWorkflowActionParameters': {'UUID': DEST, 'CustomOutputName': 'destination',
                                         'WFTextActionText': 'Sample Destination'}},
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.location',
         'WFWorkflowActionParameters': {'UUID': LOC, 'WFLocation': {
             'WFSerializationType': 'WFTextTokenAttachment',
             'Value': {'Type': 'ActionOutput', 'OutputUUID': DEST, 'OutputName': 'destination'}}}},
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.searchmaps',
         'WFWorkflowActionParameters': {'WFInput': {
             'Value': {'OutputUUID': LOC, 'Type': 'ActionOutput', 'OutputName': 'place'},
             'WFSerializationType': 'WFTextTokenAttachment'}}},
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.nothing',
         'WFWorkflowActionParameters': {'UUID': 'CCC00000-0000-0000-0000-000000000000'}},
    ]
    if other_consumer:
        actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext',
                        'WFWorkflowActionParameters': {'WFTextActionText': LOC}})
    return plistlib.dumps({'WFWorkflowActions': actions,
                           'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 1}},
                          fmt=plistlib.FMT_BINARY)


class NavigationPatchTests(unittest.TestCase):
    def test_google_and_apple_routes(self):
        for provider in ROUTES:
            before = fixture()
            output, report = patch_workflow(before, provider)
            actions = plistlib.loads(output)['WFWorkflowActions']
            self.assertEqual(report['action_count'], 4)
            self.assertEqual(report['replaced_1_based'], [2, 3, 4])
            self.assertEqual(actions[0], plistlib.loads(before)['WFWorkflowActions'][0])
            self.assertEqual(actions[1]['WFWorkflowActionParameters']['WFInput']['Value']['OutputUUID'], DEST)
            url_text = actions[2]['WFWorkflowActionParameters']['WFTextActionText']['Value']['string']
            self.assertIn(ROUTES[provider][0], url_text)
            self.assertIn(ROUTES[provider][1], url_text)
            self.assertEqual(actions[3]['WFWorkflowActionParameters']['WFInput']['Value']['OutputUUID'],
                             actions[2]['WFWorkflowActionParameters']['UUID'])
            for destination in ('ライカム', 'イオンモール沖縄ライカム', 'A & B + 10%'):
                url = ROUTES[provider][0] + quote(destination, safe='') + ROUTES[provider][1]
                self.assertNotIn(' ', url)
                self.assertIn(quote(destination, safe=''), url)

    def test_refuse_signed(self):
        with self.assertRaisesRegex(ValueError, 'signed'):
            patch_workflow(b'AEA1\x00\x01')

    def test_refuse_nonmatching(self):
        data = plistlib.loads(fixture())
        data['WFWorkflowActions'][2]['WFWorkflowActionIdentifier'] = 'invalid'
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            patch_workflow(plistlib.dumps(data))

    def test_refuse_shared_old_output(self):
        with self.assertRaisesRegex(ValueError, 'reused'):
            patch_workflow(fixture(other_consumer=True))

    def test_refuse_ambiguous_duplicate(self):
        data = plistlib.loads(fixture())
        data['WFWorkflowActions'].extend(copy.deepcopy(data['WFWorkflowActions'][1:]))
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            patch_workflow(plistlib.dumps(data))


if __name__ == '__main__':
    unittest.main()
