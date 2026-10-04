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

    def test_normal_runtime_does_not_touch_debug_ledger(self):
        self.assertNotIn('getFile("Clarity Next Ledger.txt")', self.source)
        self.assertNotIn('appendToFile("Clarity Next Ledger.txt"', self.source)
        self.assertIn('appendToFile("Idea in Box.txt"', self.source)
        self.assertIn('appendToFile("Clarity Inbox.txt"', self.source)

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
        self.assertNotIn('#define inputs text', self.source)
        self.assertIn('@inputMode = "voice"', self.source)
        self.assertIn('input_mode: {@inputMode}', self.source)
        self.assertIn('share_source: {@shareSource}', self.source)
        self.assertIn('askChatGPT(routerPrompt, true, "Dictionary")', self.source)
        self.assertIn('getValue(parsed, "actions")', self.source)
        self.assertIn('status != "planned"', self.source)
        self.assertIn("発話の表面形を越えて「最終的に何を実現したいか」を理解", self.source)
        self.assertIn("複数依頼を1actionへ無理に潰しません", self.source)
        self.assertIn("confidenceだけを理由に確認を増やしません", self.source)

    def test_capability_gate_is_explicit(self):
        for executor in ("YOS_OpenApp", "NEXT_DEVICE", "NEXT_TIMER", "NEXT_ALARM", "NEXT_CALENDAR", "NEXT_REMINDER", "NEXT_NAVIGATE", "NEXT_NOTION", "NEXT_MYWAY", "NEXT_MONEY", "NEXT_IDEA", "NEXT_MEMO", "NEXT_TASK", "NEXT_SHOPPING", "NEXT_COMMUNICATION", "NEXT_MEDIA", "NEXT_CLIPBOARD", "NEXT_SHARE", "NEXT_CAMERA", "NEXT_WEBSEARCH", "NEXT_YOS_VIEW", "NEXT_REMOTE", "YOS_SHORTCUT", "YOS_SCRIPTABLE", "NEXT_ANSWER"):
            self.assertIn(executor, self.source)
        self.assertIn('@normalizedExecutor != "NEXT_REMOTE"', self.source)
        self.assertIn('@normalizedExecutor != "YOS_SHORTCUT"', self.source)
        self.assertIn('@normalizedExecutor != "YOS_SCRIPTABLE"', self.source)


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
            ("myway", "NEXT_MYWAY", "myway", "NEXT_MYWAY"),
            ("idea", "NEXT_IDEA", "idea", "NEXT_IDEA"),
            ("memo", "NEXT_MEMO", "memo", "NEXT_MEMO"),
            ("task", "NEXT_TASK", "task", "NEXT_TASK"),
            ("shopping", "NEXT_SHOPPING", "shopping", "NEXT_SHOPPING"),
            ("alarm", "NEXT_ALARM", "alarm", "NEXT_ALARM"),
            ("communication", "NEXT_COMMUNICATION", "communication", "NEXT_COMMUNICATION"),
            ("media", "NEXT_MEDIA", "media", "NEXT_MEDIA"),
            ("clipboard", "NEXT_CLIPBOARD", "clipboard", "NEXT_CLIPBOARD"),
            ("share", "NEXT_SHARE", "share", "NEXT_SHARE"),
            ("camera", "NEXT_CAMERA", "camera", "NEXT_CAMERA"),
            ("web", "NEXT_WEBSEARCH", "web", "NEXT_WEBSEARCH"),
            ("yos", "NEXT_YOS_VIEW", "yos", "NEXT_YOS_VIEW"),
            ("remote", "NEXT_REMOTE", "remote", "NEXT_REMOTE"),
            ("shortcut", "YOS_SHORTCUT", "shortcut", "YOS_SHORTCUT"),
            ("scriptable", "YOS_SCRIPTABLE", "scriptable", "YOS_SCRIPTABLE"),
        )
        for raw_executor, raw_module, normalized_module, normalized_executor in pairs:
            self.assertIn(
                f'if executor == "{raw_executor}" && module == "{raw_module}"',
                self.source,
            )
            self.assertIn(f'@normalizedModule = "{normalized_module}"', self.source)
            self.assertIn(f'@normalizedExecutor = "{normalized_executor}"', self.source)

    def test_safety_gates_precede_execution(self):
        review = self.source.index('if @normalizedNeedsReviewText == "はい"')
        confirm = self.source.index('if @normalizedNeedsConfirmationText == "はい"')
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
        self.assertIn("calendar/reminderのtitleはユーザーが述べた内容語をできるだけそのまま保持", self.source)
        self.assertIn("日時や操作語だけを除きます", self.source)

    def test_semantic_planner_is_goal_first_not_example_first(self):
        self.assertIn("Capability一覧は言語理解を縛る例文集ではなく、実行できる手段の登録簿", self.source)
        self.assertIn("理解は柔軟に、実行は許可されたCapabilityだけ", self.source)
        self.assertIn("キーワードや例文の一致だけで分類せず", self.source)
        self.assertIn("needs_reviewを過剰に使いません", self.source)
        self.assertIn("専用Capabilityをgenericなopen_appより優先", self.source)

    def test_base_home_is_modeled_as_semantic_entity(self):
        self.assertIn("BASE HOMEはYOSの既存作戦室", self.source)
        self.assertIn("同じ対象を指すことが意味上明確ならNEXT_NOTION", self.source)
        self.assertIn("generic open_appより優先", self.source)

    def test_shared_intake_uses_one_core(self):
        for marker in (
            "__YOS_CLARITY_TEXT_V1__",
            "__YOS_CLARITY_SHARE_TEXT_V1__",
            "__YOS_CLARITY_SHARE_IMAGE_V1__",
            "__YOS_CLARITY_SHARE_PDF_V1__",
        ):
            self.assertIn(marker, self.source)
        self.assertIn("beginsWith", self.source)
        self.assertIn("input_mode=share", self.source)
        self.assertIn("NEXT_ANSWER以外の副作用を起こしません", self.source)
        self.assertIn("shareモードではYOS_OpenApp、NEXT_DEVICE、NEXT_TIMER、NEXT_ALARM、NEXT_CALENDAR、NEXT_REMINDER、NEXT_NAVIGATE、NEXT_NOTION、NEXT_MYWAY、NEXT_MONEY、NEXT_IDEA、NEXT_MEMO、NEXT_TASK、NEXT_SHOPPING、NEXT_COMMUNICATION、NEXT_MEDIA、NEXT_CLIPBOARD、NEXT_SHARE、NEXT_CAMERA、NEXT_WEBSEARCH、NEXT_YOS_VIEW、NEXT_REMOTE、YOS_SHORTCUT、YOS_SCRIPTABLEを選びません", self.source)
        self.assertIn('if @inputMode == "share" && @normalizedExecutor != "NEXT_ANSWER"', self.source)

    def test_base_home_alias_recovers_from_open_app_misroute(self):
        self.assertIn('@baseHomeAlias = false', self.source)
        self.assertIn('if @inputMode != "share"', self.source)
        self.assertIn('userInput contains "ベースホーム"', self.source)
        self.assertIn('@normalizedExecutor = "NEXT_NOTION"', self.source)
        self.assertIn('@normalizedModule = "notion"', self.source)
        self.assertIn('@normalizedOperation = "open_yos_home"', self.source)
        self.assertIn('@normalizedNeedsReviewText = "いいえ"', self.source)
        self.assertIn('@normalizedNeedsConfirmationText = "いいえ"', self.source)
        self.assertIn('@normalizedOperation == "open_yos_home"', self.source)

    def test_communication_is_hard_gated_by_confirmation(self):
        gate = self.source.index('if @normalizedExecutor == "NEXT_COMMUNICATION" {')
        confirm = self.source.index('if @normalizedNeedsConfirmationText == "はい"')
        call = self.source.index('operation == "call" {')
        self.assertLess(gate, confirm)
        self.assertLess(confirm, call)
        self.assertIn('@normalizedRisk != "high"', self.source)
        self.assertIn('@normalizedNeedsConfirmationText != "はい"', self.source)
        self.assertIn("phone_numberまたはemailが明示されている場合だけ", self.source)

    def test_tv_power_state_request_is_not_blind_toggle(self):
        self.assertIn("power_toggleはユーザーが", self.source)
        self.assertIn("テレビをつけて/消して", self.source)
        self.assertIn('if remoteAction == "power_toggle"', self.source)
        self.assertIn('@tvWidgetAction = "power"', self.source)
        self.assertNotIn('remoteAction == "power" ||', self.source)

    def test_native_capabilities_and_existing_yos_assets_are_reused(self):
        for required in (
            "createAlarm(alarmName, alarmTime, true)",
            "call(phoneTarget)",
            "sendMessage(messageTarget, messageBody, false)",
            'sendEmail(emailTarget, "", emailSubject, emailBody, false, false)',
            "togglePlayPause()",
            "setClipboard(clipboardValue)",
            "getClipboard()",
            "share(shareValue)",
            "takePhoto(1, true)",
            "takeScreenshot(false)",
            'searchWeb("Google", webQuery)',
            "https://yskn0008-bot.github.io/ProjectY/life/",
            "https://yskn0008-bot.github.io/ProjectY/yos/hj/",
            "https://yskn0008-bot.github.io/ProjectY/yos/desk/",
            "https://yskn0008-bot.github.io/ProjectY/system/",
            "YOS%20BRAVIA%20Widget",
            "YOS%20Light%20Widget",
            "YOS%20AC%20Widget",
            'shortcutName == "Morning"',
            'shortcutName == "STASH Add"',
            'scriptName == "YOS Remote Hub"',
            'scriptName == "YOS Departure Guard2"',
            'scriptName == "YOS_Money_Local"',
            'shortcutName != "STASH Add" && shortcutInput',
            "@scriptActionAllowed = false",
            "run(shortcutName, shortcutPayload)",
        ):
            self.assertIn(required, self.source)

    def test_v0_acceptance_routes_exist(self):
        self.assertIn('run("YOS_OpenApp", app)', self.source)
        self.assertIn('is.workflow.actions.setbrightness', self.source)
        self.assertIn('startTimer(qty(minutes, "min"))', self.source)
        self.assertIn('is.workflow.actions.addnewevent', self.source)
        self.assertIn('is.workflow.actions.addnewreminder', self.source)
        self.assertIn('scriptable:///run?scriptName=YOS%20Dashboard%20v2&action=baseHome', self.source)
        self.assertIn('openURL(notionHomeURL)', self.source)
        self.assertIn('BASE HOME refresh bridge', self.source)
        self.assertIn('money-capture.html?text={moneyEncoded}', self.source)
        self.assertIn('openURL(moneyURL)', self.source)
        self.assertIn('https://yskn0008-bot.github.io/ProjectY/yos/', self.source)
        self.assertIn('appendToFile("Idea in Box.txt"', self.source)
        self.assertIn('appendToFile("Clarity Inbox.txt"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_TASK"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_SHOPPING"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_ALARM"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_COMMUNICATION"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_MEDIA"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_CLIPBOARD"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_CAMERA"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_YOS_VIEW"', self.source)
        self.assertIn('@normalizedExecutor == "NEXT_REMOTE"', self.source)
        self.assertIn('@normalizedExecutor == "YOS_SHORTCUT"', self.source)
        self.assertIn('@normalizedExecutor == "YOS_SCRIPTABLE"', self.source)
        self.assertTrue(self.source.rstrip().endswith("stop()"))

if __name__ == "__main__":
    unittest.main()
