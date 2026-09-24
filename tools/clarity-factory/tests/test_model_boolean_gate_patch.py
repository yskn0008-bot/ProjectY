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


def conditional_single(name: str, code: int) -> dict:
    return {
        "WFCondition": code,
        "WFControlFlowMode": 0,
        "WFInput": {
            "Type": "Variable",
            "Variable": attachment(name),
        },
    }


class BooleanGatePatchTests(unittest.TestCase):
    def test_single_boolean_presence_gate_becomes_numeric_true_check(self):
        gate = conditional_single("needsReview", 100)
        module.patch_single(gate, "needsReview", True, 100)
        self.assertEqual(gate["WFCondition"], 2)
        self.assertEqual(gate["WFNumberValue"], "0")

    def test_external_write_rows_become_true_and_false_equalities(self):
        gate = {
            "WFConditions": {
                "WFSerializationType": "WFContentPredicateTableTemplate",
                "Value": {
                    "WFActionParameterFilterPrefix": 1,
                    "WFActionParameterFilterTemplates": [
                        {
                            "WFCondition": 100,
                            "WFInput": {
                                "Type": "Variable",
                                "Variable": attachment("externalWrite"),
                            },
                        },
                        {
                            "WFCondition": 101,
                            "WFInput": {
                                "Type": "Variable",
                                "Variable": attachment("requiresConfirmation"),
                            },
                        },
                    ],
                },
            },
            "WFControlFlowMode": 0,
        }
        module.patch_multi(gate)
        rows = gate["WFConditions"]["Value"]["WFActionParameterFilterTemplates"]
        got = {}
        for row in rows:
            name = next(iter(module.output_names(row["WFInput"])))
            got[name] = (row["WFCondition"], row["WFNumberValue"])
        self.assertEqual(
            got,
            {
                "externalWrite": (2, "0"),
                "requiresConfirmation": (1, "0"),
            },
        )


if __name__ == "__main__":
    unittest.main()
