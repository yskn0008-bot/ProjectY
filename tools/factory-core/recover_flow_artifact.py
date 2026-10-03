#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import plistlib
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "tools" / "factory-core" / "flow_sources.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def recipe_dir(recipe: str) -> Path:
    return ROOT / recipe


def reconstruct_from_recipe(recipe: str) -> bytes:
    folder = recipe_dir(recipe)
    parts = sorted(folder.glob("*.b64z"))
    if not parts:
        raise FileNotFoundError(f"no artifact parts found in {folder}")
    encoded = "".join(p.read_text(encoding="ascii").strip() for p in parts)
    compressed = base64.b64decode(encoded, validate=True)
    return zlib.decompress(compressed)


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

    offset = auth_end
    offset += signature_sizes[profile]
    offset += public_key_sizes[profile]
    offset += 32  # main salt
    offset += 32  # root header MAC
    root_header = data[offset:offset + 48]
    if len(root_header) != 48:
        raise ValueError("truncated AEA root header")

    # Recovered iPhone exports use signed-only profile 0, whose root header is plaintext.
    if profile != 0:
        return {
            "magic": "AEA1",
            "profile": profile,
            "scrypt_strength": scrypt_strength,
            "auth_data_size": auth_size,
            "certificate_count": len(certs),
            "archive_size": len(data),
        }

    original_size, archive_size, segment_size, segments_per_cluster = struct.unpack(
        "<QQII", root_header[:24]
    )
    compression = chr(root_header[24])
    checksum = root_header[25]

    return {
        "magic": "AEA1",
        "profile": profile,
        "scrypt_strength": scrypt_strength,
        "auth_data_size": auth_size,
        "certificate_count": len(certs),
        "original_shortcut_plist_size": original_size,
        "archive_size": archive_size,
        "segment_size": segment_size,
        "segments_per_cluster": segments_per_cluster,
        "compression": compression,
        "checksum": checksum,
    }


def validate_flow(name: str, entry: dict) -> dict:
    status = entry["status"]
    if status == "recovered_current_artifact":
        data = reconstruct_from_recipe(entry["artifact_recipe"])
        digest = hashlib.sha256(data).hexdigest()
        if digest != entry["sha256"]:
            raise AssertionError(f"{name}: sha256 mismatch: {digest}")
        if len(data) != entry["size_bytes"]:
            raise AssertionError(f"{name}: size mismatch: {len(data)}")
        metadata = inspect_signed_aea(data)
        expected = entry["aea"]
        for key, value in expected.items():
            if metadata.get(key) != value:
                raise AssertionError(
                    f"{name}: AEA {key} mismatch: {metadata.get(key)!r} != {value!r}"
                )
        if metadata["archive_size"] != len(data):
            raise AssertionError(f"{name}: AEA archive_size does not match bytes")
        return {"name": name, "status": status, "sha256": digest, "aea": metadata}

    if status == "WAIT_USER_RECOVERY":
        # Missing iPhone sources are a fail-closed state, not permission to fabricate.
        if not entry.get("must_not_infer"):
            raise AssertionError(f"{name}: missing source must remain fail-closed")
        return {"name": name, "status": status}

    raise AssertionError(f"{name}: unknown status {status!r}")


def validate_all() -> list[dict]:
    manifest = load_manifest()
    return [validate_flow(name, entry) for name, entry in manifest["flows"].items()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    results = validate_all()
    recovered = [r for r in results if r["status"] == "recovered_current_artifact"]
    waiting = [r for r in results if r["status"] == "WAIT_USER_RECOVERY"]

    if args.output:
        morning = next(r for r in recovered if r["name"] == "Morning Flow")
        entry = load_manifest()["flows"]["Morning Flow"]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(reconstruct_from_recipe(entry["artifact_recipe"]))

    print(f"Flow source validation: PASS (recovered={len(recovered)}, waiting={len(waiting)})")
    for result in results:
        print(f"- {result['name']}: {result['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
