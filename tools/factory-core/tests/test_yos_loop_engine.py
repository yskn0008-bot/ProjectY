import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1] / "yos_loop_engine.py"
SPEC = importlib.util.spec_from_file_location("yos_loop_engine", ENGINE)
engine = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(engine)


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

    def write_script(self, name: str, body: str):
        scratch = Path(tempfile.mkdtemp())
        path = scratch / name
        path.write_text(body, encoding="utf-8")
        return path

    def run_engine(self, root: Path, job: dict, state_path: Path | None = None):
        scratch = Path(tempfile.mkdtemp())
        job_path = scratch / "job.json"
        result_path = scratch / "result.json"
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        command = [
            sys.executable,
            str(ENGINE),
            "--job",
            str(job_path),
            "--repo",
            str(root),
            "--result",
            str(result_path),
        ]
        if state_path is not None:
            command.extend(["--state", str(state_path)])
        proc = subprocess.run(command, text=True, capture_output=True, check=False)
        return proc, json.loads(result_path.read_text(encoding="utf-8")), job_path

    def base_job(self):
        verify = self.write_script(
            "verify.py",
            "from pathlib import Path\nraise SystemExit(0 if Path('allowed/state.txt').read_text() == 'good' else 1)\n",
        )
        audit = self.write_script(
            "audit.py",
            "from pathlib import Path\nvalue=Path('allowed/state.txt').read_text()\nraise SystemExit(0 if value == 'good' and len(value) == 4 else 1)\n",
        )
        return {
            "job_id": "test-job",
            "goal": "prove the One Enter execution loop",
            "acceptance": ["verification passes", "independent audit passes"],
            "scope": ["allowed/**"],
            "forbidden_paths": ["forbidden/**"],
            "verification_commands": [[sys.executable, str(verify)]],
            "audit_commands": [[sys.executable, str(audit)]],
            "recovery_strategies": [],
            "max_total_recovery_attempts": 4,
            "max_same_failure": 2,
            "max_duration_seconds": 60,
            "max_changed_paths": 10,
            "requires_device_verification": False,
            "requires_production_verification": False,
            "rollback_on_failed_safe": True,
        }

    def test_a_first_pass_reaches_complete_only_after_audit(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "COMPLETE")
        self.assertEqual(result["terminal_state"], "COMPLETE")
        self.assertTrue(result["code_verified"])
        self.assertTrue(result["audit_verified"])
        self.assertTrue(all(x["verified"] for x in result["done_conditions"]))
        self.assertEqual(result["recovery_attempts"], [])
        roles = {row["role"] for row in result["runtime_evidence"]}
        self.assertEqual(roles, {"maker", "checker", "audit"})

    def test_b_one_failure_is_fixed_and_reverified_automatically(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('bad')\n",
        )
        repair = self.write_script(
            "repair.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["recovery_strategies"] = [{
            "name": "repair",
            "kind": "fix",
            "command": [sys.executable, str(repair)],
            "failure_classes": ["verification_failed"],
            "max_attempts": 1,
        }]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "COMPLETE")
        self.assertEqual(result["attempt_count"], 1)
        self.assertEqual([x["strategy"] for x in result["recovery_attempts"]], ["repair"])
        self.assertEqual(len(result["verification_results"]), 2)
        self.assertTrue(result["audit_verified"])

    def test_c_repeated_failure_switches_to_alternative_route(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('bad')\n",
        )
        noop = self.write_script("noop.py", "pass\n")
        alternative = self.write_script(
            "alternative.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["max_same_failure"] = 2
        job["recovery_strategies"] = [
            {
                "name": "first-fix",
                "kind": "fix",
                "command": [sys.executable, str(noop)],
                "failure_classes": ["verification_failed"],
                "max_attempts": 2,
            },
            {
                "name": "fallback-route",
                "kind": "alternative",
                "command": [sys.executable, str(alternative)],
                "failure_classes": ["verification_failed"],
                "max_attempts": 1,
            },
        ]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "COMPLETE")
        self.assertEqual(
            [x["strategy"] for x in result["recovery_attempts"]],
            ["first-fix", "fallback-route"],
        )
        self.assertEqual(result["attempt_count"], 2)

    def test_d_human_gate_returns_wait_user_after_code_and_audit_pass(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["human_gates"] = ["physical_device"]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "WAIT_USER")
        self.assertTrue(result["code_verified"])
        self.assertTrue(result["audit_verified"])
        self.assertEqual(result["unknowns"], ["physical_device"])
        human = [x for x in result["done_conditions"] if x["type"] == "human_gate"]
        self.assertEqual(len(human), 1)
        self.assertFalse(human[0]["verified"])

    def test_e_audit_failure_never_claims_complete_and_rolls_back(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('good')\n",
        )
        failing_audit = self.write_script("audit_fail.py", "raise SystemExit(1)\n")
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["audit_commands"] = [[sys.executable, str(failing_audit)]]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "FAILED_SAFE")
        self.assertFalse(result["audit_verified"])
        self.assertNotEqual(result["terminal_state"], "COMPLETE")
        self.assertTrue(result["rollback"]["ok"])
        self.assertEqual((root / "allowed" / "state.txt").read_text(), "start")
        self.assertEqual(subprocess.run(["git", "status", "--porcelain"], cwd=root, text=True, capture_output=True).stdout, "")

    def test_f_budget_exhaustion_returns_failed_safe_without_leaving_damage(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('allowed/state.txt').write_text('bad')\n",
        )
        noop = self.write_script("noop.py", "pass\n")
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]
        job["max_total_recovery_attempts"] = 1
        job["recovery_strategies"] = [{
            "name": "bounded-retry",
            "kind": "retry",
            "command": [sys.executable, str(noop)],
            "failure_classes": ["verification_failed"],
            "max_attempts": 2,
        }]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "FAILED_SAFE")
        self.assertEqual(result["attempt_count"], 1)
        self.assertEqual(result["failure_class"], "recovery_exhausted")
        self.assertTrue(result["rollback"]["ok"])
        self.assertEqual((root / "allowed" / "state.txt").read_text(), "start")

    def test_durable_state_restores_after_session_cut_without_rerunning_maker(self):
        root = self.make_repo()
        marker = self.write_script(
            "must_not_run.py",
            "raise SystemExit('maker reran unexpectedly')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(marker)]

        scratch = Path(tempfile.mkdtemp())
        job_path = scratch / "job.json"
        state_path = scratch / "durable-state.json"
        result_path = scratch / "result.json"
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        normalized = engine.load_job(job_path)
        state = engine._new_state(normalized, root)

        (root / "allowed" / "state.txt").write_text("good", encoding="utf-8")
        state["implementation_done"] = True
        state["phase"] = "VERIFY"
        state["current_state"] = "VERIFY"
        state["last_known_head"] = engine.git(root, "rev-parse", "HEAD")
        state["workspace_fingerprint"] = engine.workspace_fingerprint(root)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

        proc = subprocess.run(
            [
                sys.executable,
                str(ENGINE),
                "--job",
                str(job_path),
                "--repo",
                str(root),
                "--state",
                str(state_path),
                "--result",
                str(result_path),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        result = json.loads(result_path.read_text(encoding="utf-8"))

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(result["status"], "COMPLETE")
        self.assertTrue(result["restored"])
        self.assertEqual(result["executed_work"], [])

    def test_scope_violation_fails_safe_before_recovery(self):
        root = self.make_repo()
        impl = self.write_script(
            "impl.py",
            "from pathlib import Path\nPath('forbidden').mkdir(exist_ok=True)\nPath('forbidden/x.txt').write_text('x')\n",
        )
        job = self.base_job()
        job["implementation_command"] = [sys.executable, str(impl)]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "FAILED_SAFE")
        self.assertEqual(result["failure_class"], "scope_violation")
        self.assertTrue(result["rollback"]["ok"])
        self.assertFalse((root / "forbidden").exists())

    def test_requires_distinct_checker_and_audit_commands(self):
        root = self.make_repo()
        same = self.write_script("same.py", "pass\n")
        job = self.base_job()
        job["verification_commands"] = [[sys.executable, str(same)]]
        job["audit_commands"] = [[sys.executable, str(same)]]

        proc, result, _ = self.run_engine(root, job)

        self.assertEqual(proc.returncode, 1)
        self.assertEqual(result["status"], "FAILED_SAFE")
        self.assertEqual(result["failure_class"], "configuration_or_state_error")


if __name__ == "__main__":
    unittest.main()
