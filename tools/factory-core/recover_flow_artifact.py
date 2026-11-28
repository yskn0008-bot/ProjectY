#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import shutil
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "tools" / "factory-core" / "flow_sources.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def repo_path(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    if ROOT.resolve() not in path.parents:
        raise ValueError(f"path escapes repository: {relative}")
    return path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def action_identifier_digest(actions: list[dict]) -> str:
    identifiers = [action.get("WFWorkflowActionIdentifier") or "" for action in actions]
    return sha256("\n".join(identifiers).encode("utf-8"))


def extract_focus_triggers(workflow: dict) -> list[dict]:
    result = []
    for trigger in workflow.get("WFWorkflowTriggers", []):
        parameters = trigger.get("WFTriggerSerializedParameters", {})
        mode = parameters.get("WFFocusMode", {})
        if trigger.get("WFTriggerIdentifier") != "WFUserFocusActivityTrigger":
            continue
        result.append(
            {
                "type": trigger.get("WFTriggerIdentifier"),
                "event": parameters.get("WFFocusEvent"),
                "focus_name": mode.get("DisplayString"),
                "focus_identifier": mode.get("Identifier"),
            }
        )
    return result


def inspect_signed_aea(data: bytes) -> dict:
    if len(data) < 12 or data[:4] != b"AEA1":
        raise ValueError("artifact is not an AEA1 Shortcut archive")

    profile = int.from_bytes(data[4:7], "little")
    scrypt_strength = data[7]
    auth_size = struct.unpack("<I", data[8:12])[0]
    auth_start = 12
    auth_end = auth_start + auth_size
    auth = data[auth_start:auth_end]
    auth_plist = plistlib.loads(auth)

    certs = auth_plist.get("SigningCertificateChain")
    if not isinstance(certs, list) or not certs:
        raise ValueError("SigningCertificateChain missing from AEA auth data")

    signature_sizes = {0: 128, 1: 0, 2: 160, 3: 0, 4: 160, 5: 0}
    public_key_sizes = {0: 32, 1: 0, 2: 0, 3: 65, 4: 65, 5: 0}
    if profile not in signature_sizes:
        raise ValueError(f"unsupported AEA profile {profile}")

    offset = auth_end + signature_sizes[profile] + public_key_sizes[profile] + 32 + 32
    root_header = data[offset:offset + 48]
    if len(root_header) != 48:
        raise ValueError("truncated AEA root header")

    metadata = {
        "magic": "AEA1",
        "profile": profile,
        "scrypt_strength": scrypt_strength,
        "auth_data_size": auth_size,
        "certificate_count": len(certs),
        "archive_size": len(data),
    }

    if profile == 0:
        original_size, archive_size, segment_size, segments_per_cluster = struct.unpack(
            "<QQII", root_header[:24]
        )
        metadata.update(
            {
                "original_shortcut_plist_size": original_size,
                "archive_size": archive_size,
                "segment_size": segment_size,
                "segments_per_cluster": segments_per_cluster,
                "compression": chr(root_header[24]),
                "checksum": root_header[25],
            }
        )
    return metadata


def load_workflow(entry: dict) -> tuple[dict, bytes, bytes]:
    source = repo_path(entry["source_path"]).read_bytes()
    signed = repo_path(entry["signed_path"]).read_bytes()
    workflow = plistlib.loads(source)
    return workflow, source, signed


def validate_expected_triggers(name: str, actual: list[dict], expected: list[dict]) -> None:
    if actual != expected:
        raise AssertionError(f"{name}: trigger mismatch: {actual!r} != {expected!r}")


def validate_flow(name: str, entry: dict) -> dict:
    if entry["status"] != "recovered_current_artifact":
        raise AssertionError(f"{name}: canonical Flow is not recovered")

    workflow, source, signed = load_workflow(entry)
    xml_workflow = plistlib.loads(repo_path(entry["xml_path"]).read_bytes())
    if xml_workflow != workflow:
        raise AssertionError(f"{name}: XML representation differs from recovered plist")

    if sha256(source) != entry["unsigned_sha256"] or len(source) != entry["unsigned_size"]:
        raise AssertionError(f"{name}: recovered unsigned plist identity mismatch")
    if sha256(signed) != entry["signed_sha256"] or len(signed) != entry["signed_size"]:
        raise AssertionError(f"{name}: recovered signed Shortcut identity mismatch")

    actions = workflow.get("WFWorkflowActions", [])
    if len(actions) != entry["action_count"]:
        raise AssertionError(f"{name}: action count mismatch")
    if action_identifier_digest(actions) != entry["action_identifier_sha256"]:
        raise AssertionError(f"{name}: action identifier sequence mismatch")

    if str(workflow.get("WFWorkflowClientVersion")) != str(entry["client_version"]):
        raise AssertionError(f"{name}: Shortcuts client version mismatch")
    if int(workflow.get("WFWorkflowMinimumClientVersion")) != int(entry["minimum_client_version"]):
        raise AssertionError(f"{name}: minimum client version mismatch")

    validate_expected_triggers(name, extract_focus_triggers(workflow), entry["embedded_triggers"])

    identifiers = [action.get("WFWorkflowActionIdentifier") for action in actions]
    if "is.workflow.actions.runworkflow" in identifiers:
        raise AssertionError(f"{name}: unexpected child Shortcut call was introduced")

    metadata = inspect_signed_aea(signed)
    for key, value in entry["aea"].items():
        if metadata.get(key) != value:
            raise AssertionError(
                f"{name}: AEA {key} mismatch: {metadata.get(key)!r} != {value!r}"
            )
    if metadata["archive_size"] != len(signed):
        raise AssertionError(f"{name}: AEA archive_size does not match signed bytes")

    return {
        "name": name,
        "status": entry["status"],
        "unsigned_sha256": sha256(source),
        "signed_sha256": sha256(signed),
        "action_count": len(actions),
        "triggers": extract_focus_triggers(workflow),
        "aea": metadata,
    }


def validate_variant(variant: dict) -> dict:
    source = repo_path(variant["source_path"]).read_bytes()
    signed = repo_path(variant["signed_path"]).read_bytes()
    workflow = plistlib.loads(source)
    actions = workflow.get("WFWorkflowActions", [])

    if sha256(source) != variant["unsigned_sha256"]:
        raise AssertionError(f"variant {variant['share_id']}: unsigned hash mismatch")
    if sha256(signed) != variant["signed_sha256"]:
        raise AssertionError(f"variant {variant['share_id']}: signed hash mismatch")
    if len(actions) != variant["action_count"]:
        raise AssertionError(f"variant {variant['share_id']}: action count mismatch")
    if action_identifier_digest(actions) != variant["action_identifier_sha256"]:
        raise AssertionError(f"variant {variant['share_id']}: action sequence mismatch")
    if str(workflow.get("WFWorkflowClientVersion")) != str(variant["client_version"]):
        raise AssertionError(f"variant {variant['share_id']}: client version mismatch")
    if int(workflow.get("WFWorkflowMinimumClientVersion")) != int(variant["minimum_client_version"]):
        raise AssertionError(f"variant {variant['share_id']}: minimum client mismatch")
    if extract_focus_triggers(workflow) != [variant["embedded_trigger"]]:
        raise AssertionError(f"variant {variant['share_id']}: embedded trigger mismatch")
    if variant.get("canonical"):
        raise AssertionError("supplied variant list must contain only non-canonical artifacts")

    return {
        "share_id": variant["share_id"],
        "name": variant["name"],
        "canonical": False,
        "action_count": len(actions),
    }


def validate_all() -> list[dict]:
    manifest = load_manifest()
    expected_names = ["Morning Flow", "Home Flow", "Work Flow", "Out Flow"]
    if list(manifest["flows"].keys()) != expected_names:
        raise AssertionError("canonical Flow set changed")
    results = [validate_flow(name, manifest["flows"][name]) for name in expected_names]
    for variant in manifest.get("supplied_variants", []):
        validate_variant(variant)
    return results


def package_artifacts(output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    written = []
    for name, entry in manifest["flows"].items():
        source = repo_path(entry["signed_path"])
        target = output_dir / f"{name}.shortcut"
        shutil.copyfile(source, target)
        written.append(target)

    metadata = {
        "schema_version": manifest["schema_version"],
        "artifacts": [
            {
                "name": name,
                "share_id": entry["canonical_share_id"],
                "signed_sha256": entry["signed_sha256"],
                "signed_size": entry["signed_size"],
                "signing_mode": entry["factory"]["signing_mode"],
            }
            for name, entry in manifest["flows"].items()
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return written


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    results = validate_all()
    print(f"Flow source validation: PASS (canonical={len(results)})")
    for result in results:
        print(
            f"- {result['name']}: actions={result['action_count']} "
            f"signed={result['signed_sha256']}"
        )

    if args.output_dir:
        written = package_artifacts(args.output_dir)
        print(f"Flow artifact packaging: PASS ({len(written)} signed artifacts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
