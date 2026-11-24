import plistlib
import unittest
from build_weight_shortcut import ASK_UUID, LOG_UUID, make_shortcut


class WeightShortcutTest(unittest.TestCase):
    def setUp(self):
        self.data = make_shortcut()
        self.a, self.b = self.data["WFWorkflowActions"]

    def test_two_native_actions_only(self):
        self.assertEqual([a["WFWorkflowActionIdentifier"] for a in self.data["WFWorkflowActions"]], [
            "is.workflow.actions.ask", "is.workflow.actions.health.quantity.log"])

    def test_numeric_keyboard_and_no_default_or_fixed_weight(self):
        p = self.a["WFWorkflowActionParameters"]
        self.assertEqual(p["WFInputType"], "Number")
        self.assertNotIn("WFAskActionDefaultAnswer", p)
        self.assertIn("kg", p["WFAskActionPrompt"])

    def test_correct_quantity_type_units_and_magic_variable(self):
        p = self.b["WFWorkflowActionParameters"]
        self.assertEqual(p["WFQuantitySampleType"], "Weight")
        val = p["WFQuantitySampleQuantity"]
        self.assertEqual(val["WFSerializationType"], "WFQuantityFieldValue")
        self.assertEqual(val["Value"]["Unit"], "kg")
        mag = val["Value"]["Magnitude"]
        self.assertEqual(mag["WFSerializationType"], "WFTextTokenAttachment")
        self.assertEqual(mag["Value"]["Type"], "ActionOutput")
        self.assertEqual(mag["Value"]["OutputUUID"], ASK_UUID)
        self.assertEqual(mag["Value"]["OutputName"], "Provided Input")

    def test_current_date_not_scheduled_or_fake(self):
        self.assertEqual(self.b["WFWorkflowActionParameters"]["WFQuantitySampleDate"]["Value"]["Type"], "CurrentDate")

    def test_no_remote_upload_no_extra_records(self):
        content = repr(self.data)
        for disallowed in ["is.workflow.actions.downloadurl", "is.workflow.actions.notification",
                           "is.workflow.actions.runworkflow", "Notion", "Clarity", "JOURNAL", "URL"]:
            self.assertNotIn(disallowed, content)
        self.assertEqual(self.b["WFWorkflowActionParameters"]["UUID"], LOG_UUID)

    def test_plist_roundtrip_deterministic(self):
        b = plistlib.dumps(self.data, sort_keys=False)
        self.assertEqual(plistlib.loads(b), self.data)
        self.assertGreater(len(b), 1000)


if __name__ == "__main__":
    unittest.main()
