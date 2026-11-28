from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "Clarity Notification.cherri").read_text(encoding="utf-8")


class NotificationEntryContractTests(unittest.TestCase):
    def test_preserves_single_clarity_inbox_and_does_not_act_on_untrusted_content(self):
        self.assertIn("#define name Clarity Notification", SOURCE)
        self.assertIn("#define inputs text", SOURCE)
        self.assertIn("getText(ShortcutInput)", SOURCE)
        self.assertIn('getFile("Clarity Inbox.txt")', SOURCE)
        self.assertIn("appendResolvedFile(inboxFile, record)", SOURCE)
        self.assertIn('if !notificationText', SOURCE)
        for unsafe in ("askChatGPT(", "run(", "openURL(", "getContentsOfURL(",
                       "startTimer(", "addNewReminder(", "addNewEvent(", "alert("):
            self.assertNotIn(unsafe, SOURCE)

    def test_no_new_storage(self):
        self.assertNotIn('getFile("Clarity Notification', SOURCE)
        self.assertIn("NOTIFICATION", SOURCE)


if __name__ == "__main__":
    unittest.main()
