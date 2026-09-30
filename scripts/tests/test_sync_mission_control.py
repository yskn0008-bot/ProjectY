import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "sync_mission_control.py"
SPEC = importlib.util.spec_from_file_location("sync_mission_control", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class MissionControlSyncTests(unittest.TestCase):
    def test_api_get_all_reads_every_page(self):
        items = [{"number": i} for i in range(205)]
        seen = []

        def fake_fetch(path):
            seen.append(path)
            page = int(path.split("page=")[-1])
            start = (page - 1) * 100
            return items[start : start + 100]

        result = MODULE.api_get_all("/repos/x/y/issues?state=open", fetcher=fake_fetch)

        self.assertEqual(len(result), 205)
        self.assertEqual([item["number"] for item in result], list(range(205)))
        self.assertEqual(len(seen), 3)

    def test_ready_pr_is_selected_for_review(self):
        pulls = [
            {"number": 2, "title": "draft", "draft": True},
            {"number": 7, "title": "ready", "draft": False},
        ]
        issues = [{"number": 10, "title": "issue", "labels": []}]

        message, ready_pr, primary_issue = MODULE.mission_next_action(pulls, issues)

        self.assertEqual(ready_pr["number"], 7)
        self.assertEqual(primary_issue["number"], 10)
        self.assertIn("PR #7", message)

    def test_drafts_do_not_masquerade_as_merge_ready(self):
        pulls = [
            {"number": 539, "title": "device pending", "draft": True},
            {"number": 510, "title": "device pending", "draft": True},
        ]
        issues = [{"number": 10, "title": "Mission Control recovery", "labels": []}]

        message, ready_pr, primary_issue = MODULE.mission_next_action(pulls, issues)

        self.assertIsNone(ready_pr)
        self.assertEqual(primary_issue["number"], 10)
        self.assertIn("Issue #10", message)
        self.assertNotIn("公開判断", message)

    def test_only_drafts_reports_unverified_boundary(self):
        pulls = [{"number": 539, "title": "device pending", "draft": True}]

        message, ready_pr, primary_issue = MODULE.mission_next_action(pulls, [])

        self.assertIsNone(ready_pr)
        self.assertIsNone(primary_issue)
        self.assertIn("Draft PR #539", message)
        self.assertIn("未確認条件", message)


if __name__ == "__main__":
    unittest.main()
