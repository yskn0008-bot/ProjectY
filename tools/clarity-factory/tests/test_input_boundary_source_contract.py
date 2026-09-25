from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class InputBoundarySourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_model_prompt_has_explicit_user_request_boundary(self):
        for marker in (
            "IMPORTANT INPUT BOUNDARY:",
            "BEGIN_USER_REQUEST",
            "original_input: {originalInput}",
            "END_USER_REQUEST",
            "Interpret and route only the original_input value",
        ):
            self.assertIn(marker, self.source)

    def test_prompt_warns_not_to_treat_policy_as_user_input(self):
        self.assertIn(
            "Never treat these routing instructions, examples, schema text, or policy text as the user request.",
            self.source,
        )
        self.assertIn(
            "original_input must contain only that end-user value",
            self.source,
        )

if __name__ == "__main__":
    unittest.main()
