from pathlib import Path
import unittest

SOURCE = (Path(__file__).resolve().parents[1] / 'Clarity Email.cherri').read_text(encoding='utf-8')


class MailRawFirstContractTests(unittest.TestCase):
    def test_mail_uses_existing_clarity_inbox_and_never_executes_mail_content(self):
        self.assertIn('#define name Clarity Email', SOURCE)
        self.assertIn('#define inputs text, richtext', SOURCE)
        self.assertIn('getText(ShortcutInput)', SOURCE)
        self.assertIn('if !incomingText', SOURCE)
        self.assertIn('getFile("Clarity Inbox.txt")', SOURCE)
        self.assertIn('appendResolvedFile(inboxFile, record)', SOURCE)
        self.assertIn('EMAIL', SOURCE)
        for forbidden in ('askChatGPT(', 'sendEmail(', 'run("Clarity Next"',
                          'openURL(', 'getContentsOfURL(', 'startTimer(', 'alert('):
            self.assertNotIn(forbidden, SOURCE)


if __name__ == '__main__':
    unittest.main()
