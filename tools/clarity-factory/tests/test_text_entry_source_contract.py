from pathlib import Path
import importlib.util
import unittest

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / "clarity-v1.cherri"
GENERATOR = BASE / "build_text_variant.py"

spec = importlib.util.spec_from_file_location("build_text_variant", GENERATOR)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class ClarityTextVariantSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.voice = SOURCE.read_text(encoding="utf-8")
        cls.text = module.render(cls.voice)

    def test_text_variant_is_generated_from_same_core(self):
        replacement = "\n".join([
            'const textInput = prompt("Clarityに入力", "Text", "")',
            'const originalInput = text("{textInput}")',
        ])
        expected = self.voice.replace(
            "#define name Clarity\n",
            "#define name Clarity Text\n",
            1,
        ).replace(
            'const originalInput = listen("After Pause", "jp-JP")',
            replacement,
            1,
        )
        self.assertEqual(self.text, expected)

    def test_text_variant_uses_direct_text_prompt(self):
        self.assertIn("#define name Clarity Text", self.text)
        self.assertIn('const textInput = prompt("Clarityに入力", "Text", "")', self.text)
        self.assertIn('const originalInput = text("{textInput}")', self.text)
        self.assertNotIn('const originalInput = listen("After Pause", "jp-JP")', self.text)
        self.assertNotIn("{ShortcutInput}", self.text)

    def test_text_variant_contains_full_clarity_core(self):
        for required in (
            "Clarity Ledger.txt",
            "askChatGPT(",
            "device_setting",
            "addnewevent",
            'run("YOS_OpenApp"',
        ):
            self.assertIn(required, self.text)
        self.assertNotIn('run("Clarity"', self.text)


if __name__ == "__main__":
    unittest.main()
