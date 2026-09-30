import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1] / "yos_loop_engine.py"


class YosLoopEngineTests(unittest.TestCase):
    def make_repo(self):
        root = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.name", "YOS Test"], cwd=root, check=True)
        (root / "allowed").mkdir()
        (root / "allowed" / "state.txt").write_text("start", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "commit", "-m", "start"], cwd=root, check=True, capture_output=True)
        return root

    def write_script(self, root: Path, name: str, body: str):
        path = root / "allowed" / name
        path.write_text(body, encoding="utf-8")
        return path

    def run_engine(self, root: Path, job: dict):
        scratch = Path(tempfile.mkdtemp())
        job_path = scratch / "job.json"
        result_path = scratch / "result.json"
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(ENGINE), "--job", str(job_path), "--repo", str(root), "--result", str(result_path)],
            text=True,
            capture_output=True,
            check=False,
        )
        return proc, json.loads(result_path.read_text(encoding="utf-8"))

    def base_job(self):
        return {
            "job_id": "test-job",
            "goal": "prove the bounded loop",
            "acceptance": ["verification command passes"],
            "scope": ["allowed/**"],
            "forbidden_paths": ["forbidden/**"],
            "max_recovery_attempts": 2,
            "requires_device_verification": False,
            "requires_production_verification": False,
        }

    def test_passes_without_recovery(self):
        root = self.make_repo()
        impl = self.write_script(root, "impl.py", "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n")
        check = self.write_script(root, "check.py", "from pathlib import Path\nraise SystemExit(0 if Path('allowed/state.txt').read_text() == 'good' else 1)\n")
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["verification_commands"] = [[sys.executable, str(check)]]

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "code_verified")
        self.assertTrue(result["code_verified"])
        self.assertEqual(result["recovery_attempts"], [])

    def test_one_recovery_then_pass(self):
        root = self.make_repo()
        impl = self.write_script(root, "impl.py", "from pathlib import Path\nPath('allowed/state.txt').write_text('bad')\n")
        repair = self.write_script(root, "repair.py", "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n")
        check = self.write_script(root, "check.py", "from pathlib import Path\nraise SystemExit(0 if Path('allowed/state.txt').read_text() == 'good' else 1)\n")
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["verification_commands"] = [[sys.executable, str(check)]]
        job["recovery_command"] = [sys.executable, str(repair)]

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "code_verified")
        self.assertEqual(len(result["recovery_attempts"]), 1)
        self.assertEqual(len(result["verification_rounds"]), 2)

    def test_stops_after_two_recoveries(self):
        root = self.make_repo()
        noop = self.write_script(root, "noop.py", "pass\n")
        fail = self.write_script(root, "fail.py", "raise SystemExit(1)\n")
        job = self.base_job()
        job["verification_commands"] = [[sys.executable, str(fail)]]
        job["recovery_command"] = [sys.executable, str(noop)]

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["failure_class"], "verification_failed")
        self.assertEqual(len(result["recovery_attempts"]), 2)

    def test_scope_violation_blocks_before_recovery(self):
        root = self.make_repo()
        impl = self.write_script(
            root,
            "impl.py",
            "from pathlib import Path\nPath('forbidden').mkdir(exist_ok=True)\nPath('forbidden/x.txt').write_text('x')\n",
        )
        ok = self.write_script(root, "ok.py", "pass\n")
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["verification_commands"] = [[sys.executable, str(ok)]]
        job["recovery_command"] = [sys.executable, str(ok)]

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["failure_class"], "scope_violation")
        self.assertIn("forbidden/x.txt", result["scope"]["forbidden_hits"])
        self.assertEqual(result["recovery_attempts"], [])

    def test_physical_device_is_explicit_owner_boundary(self):
        root = self.make_repo()
        ok = self.write_script(root, "ok.py", "pass\n")
        job = self.base_job()
        job["verification_commands"] = [[sys.executable, str(ok)]]
        job["requires_device_verification"] = True

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "owner_boundary")
        self.assertTrue(result["code_verified"])
        self.assertFalse(result["device_verified"])
        self.assertEqual(result["owner_boundary"], ["physical_device"])

    def test_rejects_more_than_two_recovery_attempts(self):
        root = self.make_repo()
        ok = self.write_script(root, "ok.py", "pass\n")
        job = self.base_job()
        job["verification_commands"] = [[sys.executable, str(ok)]]
        job["max_recovery_attempts"] = 3

        proc, result = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["failure_class"], "configuration_error")


if __name__ == "__main__":
    unittest.main()
