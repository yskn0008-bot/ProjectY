from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "Clarity.cherri").read_text(encoding="utf-8")
TEXT = (ROOT / "Clarity Text.cherri").read_text(encoding="utf-8")
SHARE = (ROOT / "Clarity Share.cherri").read_text(encoding="utf-8")
BANK = (ROOT / "Clarity Bank Email.cherri").read_text(encoding="utf-8")
BRIDGE = (ROOT.parents[1] / "ios-app/scriptable/clarity/YOS Clarity Notion Bridge.js").read_text(encoding="utf-8")

class ClarityRebuildContractTests(unittest.TestCase):
    def test_parallel_name_and_ledger(self):
        self.assertIn("#define name Clarity Rebuild", SOURCE)
        self.assertIn("Clarity Rebuild Ledger.txt", SOURCE)
        self.assertNotIn("#define name Clarity Next", SOURCE)

    def test_yos_money_is_removed(self):
        self.assertNotIn("NEXT_MONEY", SOURCE)
        self.assertNotIn("money-capture.html", SOURCE)

    def test_home_is_allowlisted(self):
        self.assertIn("NEXT_HOME", SOURCE)
        for name in ("YOS BRAVIA Widget", "YOS Light Widget", "YOS AC Widget", "YOS%20Remote%20Hub"):
            self.assertIn(name, SOURCE)
        for action in ("power","volumeUp","on","night","cool","tempUp","wind"):
            self.assertIn(action, SOURCE)

    def test_notion_targets_are_existing_only(self):
        for target in ("inbox","task","finance_event","balance","life_event","decision"):
            self.assertIn(target, SOURCE)
        self.assertIn("YOS%20Clarity%20Notion%20Bridge", SOURCE)
        self.assertNotIn("create_database", SOURCE.lower())

    def test_share_mode_remains_read_only(self):
        self.assertIn("NEXT_HOME、NEXT_NOTIONを選びません", SOURCE)
        self.assertIn('if @inputMode == "share" && @normalizedExecutor != "NEXT_ANSWER"', SOURCE)

    def test_entries_target_rebuild_core(self):
        self.assertIn('run("Clarity Rebuild", payload)', TEXT)
        self.assertIn('run("Clarity Rebuild", payload)', SHARE)

    def test_bridge_uses_existing_notion_assets(self):
        for identifier in (
            "3d35ca88-2895-81ef-9dc8-d5f11ff8e213",
            "95b30d16-7530-40c6-a320-dab99acad55d",
            "94fc7e9f-fd20-4073-bbcf-02efe8e95c5c",
            "965c6086-32c1-463d-93b4-87a9cb69b3ad",
            "30df9a73-2ea7-4ff7-8187-2b62dc8f9da4",
            "28bcd894-b709-4b23-9fdc-c9dc43043bfc",
        ):
            self.assertIn(identifier, BRIDGE)
        self.assertIn('Notion-Version":NOTION_VERSION', BRIDGE)
        self.assertIn('Keychain.set(KEY.token', BRIDGE)

    def test_no_embedded_secrets(self):
        blob = SOURCE + TEXT + SHARE + BANK + BRIDGE
        self.assertIsNone(re.search(r"(?:secret_|ntn_|sk-)[A-Za-z0-9_-]{20,}", blob))
        self.assertNotRegex(blob, r"192\.168\.\d+\.\d+")

    def test_bank_email_is_data_only(self):
        self.assertIn("Gmail/マネフォ照合待ち", BANK)
        self.assertIn("torihiki@jibunbank.co.jp", BANK)
        self.assertIn("SMBC_service@dn.smbc.co.jp", BANK)
        self.assertIn("information@jp-bank.japanpost.jp", BANK)
        self.assertIn("info@paypay-corp.co.jp", BANK)
        self.assertIn("target=inbox", BANK)
        self.assertNotIn("askChatGPT", BANK)
        self.assertNotIn("NEXT_DEVICE", BANK)
        self.assertNotIn("NEXT_HOME", BANK)


if __name__ == "__main__":
    unittest.main()
