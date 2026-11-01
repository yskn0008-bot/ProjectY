"""Synthetic tests only: no private workflows or tokens."""
import copy
import plistlib
import unittest

from audit_google_maps_contract import audit_navigation, BASE, SUFFIX


def fixture():
    return {"WFWorkflowActions": [
        {"WFWorkflowActionIdentifier":"is.workflow.actions.urlencode",
         "WFWorkflowActionParameters":{"UUID":"SYNTH-ENC",
            "WFEncodeMode":"Encode","CustomOutputName":"yosNavDestinationEncoded",
            "WFInput":{"WFSerializationType":"WFTextTokenAttachment",
                       "Value":{"Type":"ActionOutput","OutputUUID":"SYNTH-DEST","OutputName":"destination"}}}},
        {"WFWorkflowActionIdentifier":"is.workflow.actions.gettext",
         "WFWorkflowActionParameters":{"UUID":"SYNTH-URL","CustomOutputName":"yosNavDirectionsURL",
            "WFTextActionText":{"WFSerializationType":"WFTextTokenString",
               "Value":{"string":BASE+"\ufffc"+SUFFIX,
                        "attachmentsByRange":{f"{{{len(BASE)}, 1}}":{
                           "Type":"ActionOutput","OutputUUID":"SYNTH-ENC",
                           "OutputName":"yosNavDestinationEncoded"}}}}}},
        {"WFWorkflowActionIdentifier":"is.workflow.actions.openurl",
         "WFWorkflowActionParameters":{"WFInput":{"WFSerializationType":"WFTextTokenAttachment",
              "Value":{"Type":"ActionOutput","OutputUUID":"SYNTH-URL","OutputName":"yosNavDirectionsURL"}}}},
    ]}


def encode(actions):
    return plistlib.dumps({"WFWorkflowActions":actions},fmt=plistlib.FMT_BINARY)


class NavigationSafetyTests(unittest.TestCase):
    def rejects(self, mutate):
        a=copy.deepcopy(fixture()["WFWorkflowActions"])
        mutate(a)
        with self.assertRaises(ValueError):
            audit_navigation(encode(a))

    def test_normal(self):
        self.assertEqual(audit_navigation(encode(fixture()["WFWorkflowActions"]))[
            "navigation_actions_1based"],[1,2,3])

    def test_wrong_source(self):
        self.rejects(lambda a:a[0]["WFWorkflowActionParameters"]["WFInput"]["Value"].update(OutputName="other"))

    def test_bad_encoding(self):
        self.rejects(lambda a:a[0]["WFWorkflowActionParameters"].update(WFEncodeMode="Decode"))

    def test_bad_domain(self):
        self.rejects(lambda a:a[1]["WFWorkflowActionParameters"]["WFTextActionText"]["Value"].update(string="https://evil.example/?q=\ufffc"))

    def test_missing_navigate(self):
        self.rejects(lambda a:a[1]["WFWorkflowActionParameters"]["WFTextActionText"]["Value"].update(string=BASE+"\ufffc"))

    def test_wrong_destination_reference(self):
        self.rejects(lambda a:a[1]["WFWorkflowActionParameters"]["WFTextActionText"]["Value"][
            "attachmentsByRange"][f"{{{len(BASE)}, 1}}"].update(OutputUUID="BAD"))

    def test_wrong_open_reference(self):
        self.rejects(lambda a:a[2]["WFWorkflowActionParameters"]["WFInput"]["Value"].update(OutputUUID="BAD"))

    def test_wrong_open_action(self):
        self.rejects(lambda a:a[2].update(WFWorkflowActionIdentifier="is.workflow.actions.searchmaps"))

    def test_ambiguous_multiple(self):
        self.rejects(lambda a:a.extend(copy.deepcopy(a)))

    def test_signed_refused(self):
        with self.assertRaises(ValueError):
            audit_navigation(b"AEA1")

if __name__ == "__main__":
    unittest.main()
