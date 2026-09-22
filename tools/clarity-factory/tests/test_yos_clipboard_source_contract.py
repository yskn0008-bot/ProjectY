#!/usr/bin/env python3
from __future__ import annotations
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "YOS_Clipboard.cherri"

class YOSClipboardSourceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = SOURCE.read_text(encoding="utf-8")

    def test_fixed_child_identity_and_modes(self):
        self.assertIn("#define name YOS_Clipboard", self.src)
        for mode in ("add", "next", "merge", "select", "duplicate", "clear", "screenshots"):
            self.assertRegex(self.src, rf'if mode == "{re.escape(mode)}"')

    def test_temp_buffer_is_explicit_and_not_ssot(self):
        self.assertIn('YOS Clipboard Temp/buffer.b64', self.src)
        self.assertIn('YOS Clipboard Temp/cursor.txt', self.src)
        self.assertIn('temporary working state, not a system of record', self.src)
        self.assertIn('deleteFiles(bufferFile, true)', self.src)
        self.assertIn('deleteFiles(cursorFile, true)', self.src)

    def test_clipboard_round_trip_contract(self):
        self.assertIn('getClipboard()', self.src)
        self.assertIn('setClipboard(', self.src)
        self.assertIn('base64Encode(', self.src)
        self.assertIn('base64Decode(', self.src)
        self.assertIn('getListItem(@items, @cursor)', self.src)
        self.assertIn('saveFile(cursorPath, nextCursorText, true)', self.src)

    def test_screenshot_contract(self):
        self.assertIn('getLatestScreenshots(50)', self.src)
        self.assertIn('getImageDetail(screenshotItem, "Date Taken")', self.src)
        self.assertIn('combineImages(@recentScreenshots, "Vertically", 0)', self.src)
        self.assertIn('setClipboard(mergedImage)', self.src)

    def test_child_is_deterministic_local_and_does_not_route_elsewhere(self):
        forbidden = (
            'run("', 'openApp(', 'downloadURL(', 'jsonRequest(', 'askChatGPT(',
            'addNewEvent', 'addNewReminder', 'sendMessage(', 'sendEmail(',
            'hubsign.routinehub.services', 'api.openai.com',
        )
        for token in forbidden:
            self.assertNotIn(token, self.src, token)

    def test_no_parent_or_legacy_replacement_logic(self):
        self.assertNotIn('clarity-v1.cherri', self.src)
        self.assertNotIn('SCS WARP', self.src)
        self.assertNotIn('YOS Screenshot Router', self.src)

if __name__ == '__main__':
    unittest.main()
