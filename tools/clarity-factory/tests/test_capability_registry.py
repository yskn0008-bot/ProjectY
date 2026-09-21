import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "clarity-capability-registry-v1.json"


class CapabilityRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

    def test_clarity_is_single_entry(self):
        self.assertIn(
            "single normal user entry point",
            self.registry["owner_entry_policy"],
        )

    def test_completion_requires_physical_iphone_e2e(self):
        gate = self.registry["completion_gate"]
        self.assertTrue(gate["physical_iphone_e2e_required"])
        self.assertTrue(gate["all_applied_results_require_verify"])
        self.assertTrue(gate["fallback_kept_until_replacement_route_passes_e2e"])

    def test_every_capability_has_known_mode_and_status(self):
        modes = set(self.registry["execution_modes"])
        statuses = set(self.registry["statuses"])
        seen = set()
        for capability in self.registry["capabilities"]:
            cid = capability["id"]
            self.assertNotIn(cid, seen)
            seen.add(cid)
            self.assertIn(capability["mode"], modes, cid)
            self.assertIn(capability["status"], statuses, cid)
            self.assertTrue(capability["domain"], cid)

    def test_core_user_actions_are_in_registry(self):
        ids = {c["id"] for c in self.registry["capabilities"]}
        required = {
            "input.voice",
            "input.text",
            "calendar.create",
            "reminders.create",
            "shopping.add",
            "idea.capture",
            "money.capture",
            "communication.call",
            "communication.message",
            "apps.open",
            "shortcuts.run_registered",
            "third_party.app_intent",
            "home.accessory",
            "chatgpt.one_enter_task",
        }
        self.assertTrue(required.issubset(ids))

    def test_non_automatable_capabilities_are_explicit(self):
        non_auto = [
            c for c in self.registry["capabilities"]
            if c["status"] == "not_publicly_automatable"
        ]
        self.assertGreaterEqual(len(non_auto), 1)
        self.assertTrue(
            all(c["mode"] == "not_publicly_automatable" for c in non_auto)
        )


if __name__ == "__main__":
    unittest.main()
