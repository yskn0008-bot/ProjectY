import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENGINE = ROOT / "tools" / "factory-core" / "yos_loop_engine.py"
FINAL_ADAPTER = ROOT / "server" / "yos-ai" / "src" / "review" / "friction-live-adapter.ts"
FINAL_TEST = ROOT / "server" / "yos-ai" / "tests" / "friction-live-adapter.test.mjs"
CORE = ROOT / "server" / "yos-ai" / "src" / "review" / "friction-discovery.ts"


class ProjectYFrictionLoopE2E(unittest.TestCase):
    def test_real_projecty_asset_fails_then_fixes_reverifies_and_audits(self):
        final_adapter = FINAL_ADAPTER.read_text(encoding="utf-8")
        final_test = FINAL_TEST.read_text(encoding="utf-8")
        buggy_adapter = final_adapter.replace(
            "      if (UNSAFE_ACTION.test(label)) return;\n",
            "",
            1,
        )
        self.assertNotEqual(buggy_adapter, final_adapter)

        repo = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "one-enter@example.invalid"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.name", "One Enter E2E"], cwd=repo, check=True)

        core_target = repo / "server" / "yos-ai" / "src" / "review" / "friction-discovery.ts"
        core_target.parent.mkdir(parents=True, exist_ok=True)
        core_target.write_text(CORE.read_text(encoding="utf-8"), encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "start"], cwd=repo, check=True, capture_output=True)

        scratch = Path(tempfile.mkdtemp())
        impl = scratch / "implement.py"
        repair = scratch / "repair.py"
        verify = scratch / "verify.py"
        audit = scratch / "audit.py"
        job = scratch / "job.json"
        result = scratch / "result.json"

        impl.write_text(
            "from pathlib import Path\n"
            "adapter=Path('server/yos-ai/src/review/friction-live-adapter.ts')\n"
            "test=Path('server/yos-ai/tests/friction-live-adapter.test.mjs')\n"
            "adapter.parent.mkdir(parents=True, exist_ok=True)\n"
            "test.parent.mkdir(parents=True, exist_ok=True)\n"
            f"adapter.write_text({buggy_adapter!r}, encoding='utf-8')\n"
            f"test.write_text({final_test!r}, encoding='utf-8')\n",
            encoding="utf-8",
        )
        repair.write_text(
            "from pathlib import Path\n"
            f"Path('server/yos-ai/src/review/friction-live-adapter.ts').write_text({final_adapter!r}, encoding='utf-8')\n",
            encoding="utf-8",
        )
        verify.write_text(
            "from pathlib import Path\n"
            "source=Path('server/yos-ai/src/review/friction-live-adapter.ts').read_text(encoding='utf-8')\n"
            "test=Path('server/yos-ai/tests/friction-live-adapter.test.mjs').read_text(encoding='utf-8')\n"
            "checks=[\n"
            "  'if (UNSAFE_ACTION.test(label)) return;' in source,\n"
            "  'projectLifeStoreToFrictionSignals' in source,\n"
            "  '支払いを確認' in test,\n"
            "  'requiresUserDecision' in test,\n"
            "]\n"
            "raise SystemExit(0 if all(checks) else 1)\n",
            encoding="utf-8",
        )
        audit.write_text(
            "from pathlib import Path\n"
            "source=Path('server/yos-ai/src/review/friction-live-adapter.ts').read_text(encoding='utf-8')\n"
            "forbidden=('localStorage','setItem(','fetch(','writeFile','unlink(','rmSync','execSync')\n"
            "safe=all(token not in source for token in forbidden)\n"
            'safe=safe and "source: \'life\'" in source and "risk: \'low\'" in source\n'
            'safe=safe and "reversible: true" in source and "manualSteps: 1" in source\n'
            "raise SystemExit(0 if safe else 1)\n",
            encoding="utf-8",
        )

        job.write_text(json.dumps({
            "job_id": "projecty-friction-live-adapter-e2e",
            "goal": "connect existing MY LIFE data read-only to the existing Friction Discovery engine",
            "acceptance": [
                "unsafe or state-changing task labels are excluded",
                "the adapter remains read-only and uses no new storage",
                "verification failure is fixed automatically and reverified",
                "independent audit passes"
            ],
            "scope": [
                "server/yos-ai/src/review/friction-live-adapter.ts",
                "server/yos-ai/tests/friction-live-adapter.test.mjs"
            ],
            "forbidden_paths": [
                "data/**",
                ".github/**",
                "tools/factory-core/**",
                "life/**"
            ],
            "implementation_command": [sys.executable, str(impl)],
            "verification_commands": [[sys.executable, str(verify)]],
            "audit_commands": [[sys.executable, str(audit)]],
            "recovery_strategies": [{
                "name": "restore-safe-read-only-filter",
                "kind": "fix",
                "command": [sys.executable, str(repair)],
                "failure_classes": ["verification_failed"],
                "max_attempts": 1
            }],
            "max_total_recovery_attempts": 2,
            "max_same_failure": 1,
            "max_duration_seconds": 60,
            "max_changed_paths": 2,
            "requires_device_verification": False,
            "requires_production_verification": False,
            "rollback_on_failed_safe": True
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        proc = subprocess.run([
            sys.executable, str(ENGINE),
            "--job", str(job),
            "--repo", str(repo),
            "--result", str(result),
        ], text=True, capture_output=True, check=False)
        payload = json.loads(result.read_text(encoding="utf-8"))

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(payload["terminal_state"], "COMPLETE")
        self.assertTrue(payload["code_verified"])
        self.assertTrue(payload["audit_verified"])
        self.assertEqual(payload["attempt_count"], 1)
        self.assertEqual(len(payload["verification_results"]), 2)
        self.assertFalse(payload["verification_results"][0]["ok"])
        self.assertTrue(payload["verification_results"][1]["ok"])
        self.assertEqual(
            [row["strategy"] for row in payload["recovery_attempts"]],
            ["restore-safe-read-only-filter"],
        )
        self.assertTrue(all(row["verified"] for row in payload["done_conditions"]))
        print(json.dumps({
            "evidence": "One Enter / Loop Engineering実案件E2E PASS",
            "job_id": payload["job_id"],
            "terminal_state": payload["terminal_state"],
            "verification_rounds": [row["ok"] for row in payload["verification_results"]],
            "recovery_strategies": [row["strategy"] for row in payload["recovery_attempts"]],
            "audit_verified": payload["audit_verified"],
            "done_conditions_verified": all(row["verified"] for row in payload["done_conditions"]),
        }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
