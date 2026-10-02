# User-facing display evidence refresh: current PR body records passing Clarity Next v0 CI.
# Calendar wire-format evidence refresh: current PR body records passing Clarity Next v0 CI.
# Date normalization evidence refresh: current PR body records passing Clarity Next v0 CI.
# Router normalization evidence refresh: current PR body records passing Clarity Next v0 CI.
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Clarity Next.cherri"
PATCH = ROOT / "patch_ledger_persistence.py"
WIRE_PATCH = ROOT / "patch_calendar_reminder_wire_format.py"

class ClarityNextSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_is_separate_from_canonical_clarity(self):
        self.assertIn("#define name Clarity Next", self.source)
        self.assertIn("Clarity Next Ledger.txt", self.source)


    def test_ledger_source_does_not_eagerly_open_file(self):
        self.assertNotIn('getFile("Clarity Next Ledger.txt")', self.source)
        self.assertIn('appendToFile("Clarity Next Ledger.txt"', self.source)

    def test_post_compile_persistence_rewrite_is_locked(self):
        patch = PATCH.read_text(encoding="utf-8")
        self.assertIn('TARGET = "Clarity Next Ledger.txt"', patch)
        self.assertIn('"WFFileErrorIfNotFound": False', patch)
        self.assertIn('"WFAskWhereToSave": False', patch)
        self.assertIn('"WFSaveFileOverwrite": True', patch)
        self.assertIn('file.append survived rewrite', patch)


    def test_calendar_reminder_wire_format_patch_is_locked(self):
        patch = WIRE_PATCH.read_text(encoding="utf-8")
        self.assertIn('WFCalendarItemStartDate', patch)
        self.assertIn('WFCalendarItemEndDate', patch)
        self.assertIn('WFTextTokenString', patch)
        self.assertIn('WFAlertEnabled', patch)
        self.assertIn('"Alert"', patch)


    def test_user_facing_calendar_and_reminder_have_no_technical_id(self):
        self.assertNotIn("CLARITY-NEXT-ID:", self.source)

    def test_voice_to_json_router(self):
        self.assertIn('listen("After Pause", "jp-JP")', self.source)
        self.assertIn('askChatGPT(routerPrompt, false, "Dictionary")', self.source)
        self.assertIn('getValue(parsed, "actions")', self.source)
        self.assertIn('status != "planned"', self.source)

    def test_capability_gate_is_explicit(self):
        for executor in ("YOS_OpenApp", "NEXT_DEVICE", "NEXT_TIMER", "NEXT_CALENDAR", "NEXT_REMINDER", "NEXT_NAVIGATE", "NEXT_NOTION", "NEXT_MONEY", "NEXT_ANSWER"):
            self.assertIn(executor, self.source)
        self.assertIn("unsupported_executor", self.source)


    def test_swapped_router_fields_are_normalized(self):
        pairs = (
            ("answer", "NEXT_ANSWER", "answer", "NEXT_ANSWER"),
            ("open_app", "YOS_OpenApp", "open_app", "YOS_OpenApp"),
            ("device", "NEXT_DEVICE", "device", "NEXT_DEVICE"),
            ("timer", "NEXT_TIMER", "timer", "NEXT_TIMER"),
            ("calendar", "NEXT_CALENDAR", "calendar", "NEXT_CALENDAR"),
            ("reminder", "NEXT_REMINDER", "reminder", "NEXT_REMINDER"),
            ("navigate", "NEXT_NAVIGATE", "navigate", "NEXT_NAVIGATE"),
            ("notion", "NEXT_NOTION", "notion", "NEXT_NOTION"),
            ("money", "NEXT_MONEY", "money", "NEXT_MONEY"),
        )
        for raw_executor, raw_module, normalized_module, normalized_executor in pairs:
            self.assertIn(
                f'if executor == "{raw_executor}" && module == "{raw_module}"',
                self.source,
            )
            self.assertIn(f'@normalizedModule = "{normalized_module}"', self.source)
            self.assertIn(f'@normalizedExecutor = "{normalized_executor}"', self.source)
        self.assertIn('module={normalizedModule}', self.source)
        self.assertIn('executor={normalizedExecutor}', self.source)

    def test_safety_gates_precede_execution(self):
        review = self.source.index('if needsReviewText == "はい"')
        confirm = self.source.index('if needsConfirmationText == "はい"')
        open_app = self.source.index('if @normalizedExecutor == "YOS_OpenApp"')
        self.assertLess(review, open_app)
        self.assertLess(confirm, open_app)


    def test_calendar_and_reminder_dates_are_locale_normalized(self):
        self.assertIn('const startNoT = replaceText("T", " ", startText)', self.source)
        self.assertIn('const startNormalized = replaceText("-", "/", startNoT)', self.source)
        self.assertIn('const endNoT = replaceText("T", " ", endText)', self.source)
        self.assertIn('const endNormalized = replaceText("-", "/", endNoT)', self.source)
        self.assertIn('const startDate = getDates(startNormalized)', self.source)
        self.assertIn('const endDate = getDates(endNormalized)', self.source)
        self.assertIn('const reminderNoT = replaceText("T", " ", whenText)', self.source)
        self.assertIn('const reminderNormalized = replaceText("-", "/", reminderNoT)', self.source)
        self.assertIn('const alertDate = getDates(reminderNormalized)', self.source)

    def test_calendar_reminder_titles_preserve_user_wording(self):
        self.assertIn("タイトル保持:", self.source)
        self.assertIn("『明日の14時から15時にテスト予定を入れて』→ title=『テスト予定』", self.source)
        self.assertIn("内容の一部になっている語を勝手に削除・言い換えしない", self.source)

    def test_notion_home_voice_aliases_do_not_require_yos_token(self):
        self.assertIn("『ベースホーム開いて』", self.source)
        self.assertIn("『BASE HOME開いて』", self.source)
        self.assertIn("『HOME開いて』", self.source)
        self.assertIn("『Notionホーム開いて』", self.source)
        self.assertIn("『Notionのホーム開いて』", self.source)
        self.assertIn("『作戦室開いて』", self.source)
        self.assertIn("通常の音声入口は『ベースホーム開いて』を推奨", self.source)

    def test_base_home_alias_recovers_from_open_app_misroute(self):
        self.assertIn('@baseHomeAlias = false', self.source)
        self.assertIn('userInput contains "ベースホーム"', self.source)
        self.assertIn('@normalizedExecutor = "NEXT_NOTION"', self.source)
        self.assertIn('@normalizedModule = "notion"', self.source)
        self.assertIn('@normalizedOperation = "open_yos_home"', self.source)
        self.assertIn('@normalizedNeedsReviewText = "いいえ"', self.source)
        self.assertIn('@normalizedNeedsConfirmationText = "いいえ"', self.source)
        self.assertIn('operation={normalizedOperation}', self.source)
        self.assertIn('@normalizedOperation == "open_yos_home"', self.source)

    def test_v0_acceptance_routes_exist(self):
        self.assertIn('run("YOS_OpenApp", app)', self.source)
        self.assertIn('is.workflow.actions.setbrightness', self.source)
        self.assertIn('startTimer(qty(minutes, "min"))', self.source)
        self.assertIn('is.workflow.actions.addnewevent', self.source)
        self.assertIn('is.workflow.actions.addnewreminder', self.source)
        self.assertIn('https://www.notion.so/3ed5ca882895819aaa57c139ea36fe2b', self.source)
        self.assertIn('openURL(notionHomeURL)', self.source)
        self.assertIn('notion_yos_home', self.source)
        self.assertIn('money-capture.html?text={moneyEncoded}', self.source)
        self.assertIn('openURL(moneyURL)', self.source)

if __name__ == "__main__":
    unittest.main()
