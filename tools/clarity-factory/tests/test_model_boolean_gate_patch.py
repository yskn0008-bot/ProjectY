from pathlib import Path
import importlib.util
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "patch_model_boolean_gates", ROOT / "patch_model_boolean_gates.py"
)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(module)


def attachment(name: str) -> dict:
    return {
        "WFSerializationType": "WFTextTokenAttachment",
        "Value": {
            "Type": "ActionOutput",
            "OutputName": name,
            "OutputUUID": f"uuid-{name}",
        },
    }


def conditional_single(name: str, text: str) -> dict:
    return {
        "WFCondition": 4,
        "WFConditionalActionString": text,
        "WFControlFlowMode": 0,
        "WFInput": {
            "Type": "Variable",
            "Variable": attachment(name),
        },
    }


class BooleanGateVerificationTests(unittest.TestCase):
    def test_single_review_text_gate(self):
        gate = conditional_single("needsReviewText", "はい")
        module.verify_single(gate, "needsReviewText", "はい")

    def test_single_confirmation_text_gate(self):
        gate = conditional_single("requiresConfirmationText", "はい")
        module.verify_single(gate, "requiresConfirmationText", "はい")

    def test_numeric_regression_is_rejected(self):
        gate = conditional_single("needsReviewText", "はい")
        gate["WFCondition"] = 2
        gate["WFNumberValue"] = "0"
        with self.assertRaises(SystemExit):
            module.verify_single(gate, "needsReviewText", "はい")


if __name__ == "__main__":
    unittest.main()
