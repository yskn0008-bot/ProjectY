"""Synthetic fixture tests; never include personal Shortcut contents."""
import plistlib
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from optimize_voice_to_child import optimize

def a(name, **kw):
    return {"WFWorkflowActionIdentifier": "is.workflow.actions." + name, "WFWorkflowActionParameters": kw}

def example(with_consumer=False):
    dest = "FAKE-DEST"
    loc = "FAKE-LOC"
    seq = [
        a("gettext", UUID=dest, CustomOutputName="destination", WFTextActionText="test"),
        a("location", UUID=loc, WFLocation={"WFSerializationType": "WFTextTokenAttachment",
           "Value":{"Type":"ActionOutput","OutputUUID":dest,"OutputName":"destination"}}),
        a("searchmaps", WFInput={"WFSerializationType": "WFTextTokenAttachment",
           "Value":{"Type":"ActionOutput","OutputUUID":loc,"OutputName":"place"}}),
        a("nothing", UUID="NAV-NOOP"),
        a("conditional", WFControlFlowMode=0, GroupingIdentifier="FAKE-GROUP"),
        a("exit"),
        a("nothing", UUID="UNREACHABLE-NOOP"),
        a("conditional", WFControlFlowMode=2, GroupingIdentifier="FAKE-GROUP"),
        a("nothing", UUID="KEEP-NOOP"),
        a("gettext", WFTextActionText="tail")
    ]
    if with_consumer:
        seq.append(a("gettext",WFTextActionText="UNREACHABLE-NOOP"))
    return plistlib.dumps({"WFWorkflowActions":seq,"WFWorkflowIcon":{"glyph":7}},fmt=plistlib.FMT_BINARY)

class LocalOptimization(unittest.TestCase):
    def test_preserves_all_other_actions_and_conditional_structure(self):
        old = plistlib.loads(example())
        output, report = optimize(example())
        new = plistlib.loads(output)
        self.assertEqual(report["source_actions"], 10)
        self.assertEqual(report["optimized_actions"], 7)
        self.assertEqual(report["unreachable_nothing_removed"], 1)
        self.assertEqual(new["WFWorkflowActions"][0],old["WFWorkflowActions"][0])
        self.assertEqual(new["WFWorkflowActions"][-2:],old["WFWorkflowActions"][-2:])
        self.assertEqual(new["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFWorkflowName"],"YOS_Navigate")
        self.assertEqual(new["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFInput"],
                         old["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFLocation"])
        self.assertEqual(new["WFWorkflowIcon"],old["WFWorkflowIcon"])
    def test_refuses_signed(self):
        with self.assertRaises(ValueError):optimize(b"AEA1")
    def test_rejects_unknown_navigation_layout(self):
        x=plistlib.loads(example())
        x["WFWorkflowActions"][2]["WFWorkflowActionIdentifier"]="unknown"
        with self.assertRaises(ValueError):optimize(plistlib.dumps(x))
    def test_rejects_referenced_unreachable_nothing(self):
        with self.assertRaisesRegex(ValueError,"Unreachable Nothing"):
            optimize(example(with_consumer=True))
    def test_keeps_noops_other_than_unreachable(self):
        output,_=optimize(example())
        self.assertEqual(sum(a["WFWorkflowActionIdentifier"]=="is.workflow.actions.nothing"
                             for a in plistlib.loads(output)["WFWorkflowActions"]),1)

if __name__=="__main__":
    unittest.main()
