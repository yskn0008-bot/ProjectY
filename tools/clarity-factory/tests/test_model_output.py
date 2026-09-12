import copy
import unittest

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from validate_model_output import validate  # noqa: E402


def valid_payload():
    return {
        "request_id": "req-1",
        "original_input": "棚のアイデア思いついた",
        "context": {
            "current_time": "2026-09-13T01:00:00+09:00",
            "current_priorities": [],
            "relevant_state": {},
        },
        "interpretation": {
            "objective": "棚のアイデアを残す",
            "domains": ["idea"],
            "urgency": "now",
            "risk": "low",
            "confidence": 0.98,
        },
        "actions": [
            {
                "id": "a1",
                "executor": "idea",
                "domain": "idea",
                "intent": "remember",
                "target": "",
                "content": "棚のアイデア思いついた",
                "conditions": [],
                "destination": "Idea in Box",
                "requires_confirmation": False,
                "external_write": False,
                "needs_review": False,
                "dependency": None,
                "status": "planned",
                "date_time": "",
            }
        ],
        "watches": [],
        "feedback": {"summary": "", "next_action": "", "whisper_line": ""},
    }


class ClarityModelOutputTests(unittest.TestCase):
    def test_accepts_safe_local_capture(self):
        self.assertEqual(validate(valid_payload()), [])

    def test_unknown_executor_fails_closed(self):
        payload = valid_payload()
        payload["actions"][0]["executor"] = "bank_transfer"
        self.assertTrue(any("unsupported" in e for e in validate(payload)))

    def test_calendar_without_time_requires_review(self):
        payload = valid_payload()
        payload["interpretation"]["domains"] = ["life"]
        payload["actions"][0].update(
            executor="calendar",
            domain="life",
            intent="create",
            destination="Calendar",
            date_time="",
            needs_review=False,
        )
        self.assertTrue(any("date_time" in e for e in validate(payload)))
        payload["actions"][0]["needs_review"] = True
        self.assertFalse(any("date_time" in e for e in validate(payload)))

    def test_high_risk_requires_confirmation(self):
        payload = valid_payload()
        payload["interpretation"]["risk"] = "high"
        payload["actions"][0]["requires_confirmation"] = False
        self.assertTrue(any("high/irreversible" in e for e in validate(payload)))

    def test_external_write_requires_confirmation(self):
        payload = valid_payload()
        payload["actions"][0]["external_write"] = True
        self.assertTrue(any("external_write" in e for e in validate(payload)))

    def test_model_cannot_claim_execution(self):
        payload = valid_payload()
        payload["actions"][0]["status"] = "done"
        self.assertTrue(any("cannot claim execution" in e for e in validate(payload)))

    def test_confidence_is_bounded(self):
        payload = valid_payload()
        payload["interpretation"]["confidence"] = 1.2
        self.assertTrue(any("confidence" in e for e in validate(payload)))

    def test_multi_action_request_is_supported(self):
        payload = valid_payload()
        second = copy.deepcopy(payload["actions"][0])
        second.update(id="a2", executor="shopping", domain="shopping", intent="remember", destination="Shopping")
        payload["actions"].append(second)
        payload["interpretation"]["domains"] = ["idea", "shopping"]
        self.assertEqual(validate(payload), [])


if __name__ == "__main__":
    unittest.main()
